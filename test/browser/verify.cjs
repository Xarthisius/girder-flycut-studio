/*
 * Browser verification for Flyer Studio.
 *
 * Drives headless Chrome against a running Girder and walks the dashboard the
 * way a person does: gallery, workflow home, configuration picker, the builder
 * form, and the generation and registration screens. Also fails on any console
 * error, page error or failed request along the way.
 *
 * This exists because Phase 4c restructures the whole UI into Backbone views
 * and nothing else renders it -- the .cjs suites drive hand-written DOM stubs.
 * It is deliberately written against the pre-4c UI so it captures behaviour
 * that already works, and it asserts on user-visible state rather than on
 * structure, so the decomposition can move code without rewriting the test.
 *
 * Prerequisites: a Girder with the plugin loaded and its bundle built, an admin
 * account, and `python3 test/browser/seed.py` run once.
 *
 *   node test/browser/verify.cjs
 *
 * Environment:
 *   GIRDER_URL       default http://127.0.0.1:8989
 *   GIRDER_ADMIN     default admin
 *   GIRDER_PASSWORD  default adminpassword
 *   SHOTS            screenshot directory (default test/browser/screenshots)
 *   PLAYWRIGHT_PATH  where to resolve playwright from, if not installed here
 */
const fs = require('fs');
const path = require('path');

const PW_CANDIDATES = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    path.resolve(__dirname, 'node_modules/playwright'),
    path.resolve(__dirname, '../../../../wholetale-ng/girder/girder/web/node_modules/playwright')
].filter(Boolean);

let chromium;
for (const candidate of PW_CANDIDATES) {
    try {
        ({ chromium } = require(candidate));
        break;
    } catch (e) { /* try the next candidate */ }
}
if (!chromium) {
    console.error(`Could not resolve playwright. Tried:\n  ${PW_CANDIDATES.join('\n  ')}`);
    console.error('Set PLAYWRIGHT_PATH, or run `npm ci` in test/browser.');
    process.exit(2);
}

const BASE = (process.env.GIRDER_URL || 'http://127.0.0.1:8989').replace(/\/$/, '');
const ADMIN = process.env.GIRDER_ADMIN || 'admin';
const PASSWORD = process.env.GIRDER_PASSWORD || 'adminpassword';
const SHOTS = process.env.SHOTS || path.resolve(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
let skipped = 0;

function check(name, ok, detail) {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

function skip(name, why) {
    skipped++;
    console.log(`SKIP  ${name}  [${why}]`);
}

/** Visible means the plugin's own `hidden` class is off and the box has size. */
async function visible(page, selector) {
    return page.locator(selector).isVisible().catch(() => false);
}

/**
 * Fill the required fields and return the stack ID that AUTO picked.
 *
 * Leaving the builder calls blank(), so anything typed before is gone on
 * re-entry -- the guard check leaves and comes back, and the lifecycle needs a
 * complete form after it.
 */
async function fillRequiredFields(page, pickMaterial) {
    await page.click('#autoStackIdBtn');
    await page.waitForFunction(
        () => document.querySelector('#stackid').value.length > 0, { timeout: 15000 });
    if (pickMaterial) {
        await page.selectOption('#foilMaterial', { index: 1 });
        await page.selectOption('#template', { index: 1 });
        await page.waitForFunction(
            () => document.querySelectorAll('.g-flycut-dashboard #canvas .flyer').length > 0,
            { timeout: 20000 });
    }
    return page.inputValue('#stackid');
}

async function textOf(page, selector) {
    return (await page.locator(selector).first().textContent().catch(() => '') || '').trim();
}

/**
 * Re-enter the dashboard from scratch.
 *
 * All six screens live inside the one #dashboard/:id route, so a goto to that
 * URL while already on it changes nothing and the browser does not reload. Go
 * somewhere else first, which also discards whatever the builder was holding.
 */
async function reopen(page, base, id) {
    await page.goto(`${base}/#dashboards`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.g-dashboard-card', { timeout: 20000 });
    await page.goto(`${base}/#dashboard/${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#workflowHome:not(.hidden)', { timeout: 20000 });
}

(async () => {
    const auth = Buffer.from(`${ADMIN}:${PASSWORD}`).toString('base64');
    const loginResp = await fetch(`${BASE}/api/v1/user/authentication`,
        { headers: { Authorization: `Basic ${auth}` } });
    if (!loginResp.ok) {
        throw new Error(`admin login as "${ADMIN}" failed: ${loginResp.status}`);
    }
    const token = (await loginResp.json()).authToken.token;

    const dashboards = await (await fetch(`${BASE}/api/v1/dashboard`,
        { headers: { 'Girder-Token': token } })).json();
    const flycut = dashboards.find((d) => d.key === 'flycut-config');
    if (!flycut) {
        throw new Error('the flycut-config dashboard is not enabled; run seed.py first');
    }

    const options = await (await fetch(`${BASE}/api/v1/flycut/options`,
        { headers: { 'Girder-Token': token } })).json();

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    await context.addInitScript((t) => {
        window.localStorage.setItem('girderToken', t);
    }, token);
    const page = await context.newPage();

    const problems = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()}`));

    // The unsaved-changes guard uses a native confirm() today and a Girder modal
    // after C5. Accept either, so this check survives that change.
    let nativeDialogs = 0;
    let acceptNextPrompt = false;
    page.on('dialog', async (dialog) => {
        // beforeunload has to be accepted or the navigation that triggered it is
        // cancelled -- dismissing one means "stay on this page". Only the
        // in-page confirm() is what the guard check is counting.
        if (dialog.type() === 'beforeunload') {
            await dialog.accept();
            return;
        }
        nativeDialogs++;
        if (acceptNextPrompt) {
            await dialog.accept();
            return;
        }
        await dialog.dismiss();
    });

    /**
     * Click something that may trip the unsaved-changes guard, and answer
     * whichever kind of prompt it raises.
     *
     * Arming has to happen before the click: a native confirm() is dispatched
     * synchronously from inside the click handler, so a flag set afterwards is
     * already too late. A Girder modal is the opposite -- still on screen when
     * the click returns, and answered with a button press.
     */
    async function clickThroughGuard(page, selector, accept) {
        acceptNextPrompt = accept;
        await page.click(selector);
        await page.waitForTimeout(600);
        const modal = page.locator('#g-dialog-container .modal-dialog');
        const wasModal = await modal.isVisible().catch(() => false);
        if (wasModal) {
            await page.click(accept ? '#g-confirm-button' : '#g-dialog-container .btn-default');
            await page.waitForTimeout(600);
        }
        acceptNextPrompt = false;
        return wasModal;
    }

    try {
        // ---- gallery ----------------------------------------------------
        await page.goto(`${BASE}/#dashboards`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.g-dashboard-card', { timeout: 20000 });
        const card = page.locator('.g-dashboard-card', {
            has: page.locator('.g-dashboard-card-title', { hasText: 'Flyer Studio' })
        });
        check('gallery shows the Flyer Studio card', await card.count() === 1);
        await page.screenshot({ path: `${SHOTS}/01-gallery.png` });

        // ---- the dashboard mounts ---------------------------------------
        await page.goto(`${BASE}/#dashboard/${flycut._id}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.g-flycut-dashboard', { timeout: 20000 });
        check('dashboard mounts under .g-flycut-dashboard', true);

        // Decision 1: the markup has to be reachable from the document. Under a
        // shadow root this query returns nothing.
        const inLightDom = await page.evaluate(
            () => !!document.querySelector('.g-flycut-dashboard #workflowHome'));
        check('markup is in the light DOM, not a shadow root', inLightDom);

        const styled = await page.evaluate(() => {
            const el = document.querySelector('.g-flycut-dashboard');
            return el && getComputedStyle(el).getPropertyValue('--ink').trim() !== '';
        });
        check('the scoped stylesheet is applied', styled, '--ink resolves');

        // ---- workflow home ----------------------------------------------
        for (const [id, label] of [
            ['#configurationStepBtn', 'Configuration'],
            ['#lightburnStepBtn', 'Generation'],
            ['#registerBtn', 'Registration'],
            ['#completeWorkflowBtn', 'Complete Workflow']
        ]) {
            check(`workflow home offers ${label}`, await visible(page, id));
        }
        check('admin settings stay hidden (G1)', !(await visible(page, '#adminSettingsBtn')));
        await page.screenshot({ path: `${SHOTS}/02-workflow-home.png` });

        // ---- the admin screen -------------------------------------------
        // Dead UI: the button above is hidden unconditionally, so nothing had
        // ever rendered this screen. It is a view of its own now, and Decision 4
        // promotes it to #plugins/flycut/config in Phase 6 -- these checks are
        // what keep it working across the phases in between. Un-hiding the
        // button is the only thing the harness does that a user cannot.
        check('the admin screen is its own section',
            await page.locator('section#adminSettingsScreen.settings-screen').count() === 1);
        await page.evaluate(
            () => document.querySelector('#adminSettingsBtn').classList.remove('hidden'));
        await page.click('#adminSettingsBtn');
        await page.waitForSelector('#adminSettingsScreen:not(.hidden)', { timeout: 20000 });
        check('opening the admin screen loads the policy',
            (await page.inputValue('#workspacePath')).length > 0,
            await page.inputValue('#workspacePath'));
        check('collections are populated',
            await page.locator('#workspaceCollection option').count() > 0);
        check('the four principal roles render',
            await page.locator('#policyLists h3').count() === 4,
            (await page.locator('#policyLists h3').allTextContents()).join(', '));
        check('principals are searched on open',
            await page.locator('#principalResults option').count() > 0);

        // Add a principal, see it listed under its role, then take it back out.
        // The lists are re-rendered from the policy each time, so this is the
        // check that the policy and the markup stay in step.
        const viewers = () => page.locator('#policyLists h3:text-is("Viewers") + ul').innerText();
        const emptyRole = (await viewers()).trim();
        check('an empty role reads None', emptyRole === 'None', emptyRole);
        const principal =
            (await page.locator('#principalResults option').first().innerText()).split(' (')[0];
        await page.selectOption('#principalRole', 'viewers');
        await page.click('#addPrincipalBtn');
        await page.waitForTimeout(400);
        check('adding a principal lists it under its role',
            (await viewers()).includes(principal), principal);
        await page.click('#addPrincipalBtn');
        await page.waitForTimeout(400);
        check('adding the same principal twice does not duplicate it',
            await page.locator('#policyLists button[data-role="viewers"]').count() === 1);
        await page.locator('#policyLists button[data-role="viewers"]').first().click();
        await page.waitForTimeout(400);
        check('removing it puts the role back to None', (await viewers()).trim() === 'None');

        // Saving writes back exactly what was read -- the added principal is
        // gone again and #workspacePath was never typed into, so the browsed
        // folder id still stands and the path is not re-resolved.
        await page.click('#saveAdminSettingsBtn');
        await page.waitForFunction(
            () => document.querySelector('#settingsStatus').textContent.length > 0,
            { timeout: 20000 });
        check('saving the policy reports back',
            (await textOf(page, '#settingsStatus')).startsWith('Settings saved'),
            await textOf(page, '#settingsStatus'));
        await page.screenshot({ path: `${SHOTS}/02b-admin-settings.png` });
        await page.click('#adminSettingsBack');
        await page.waitForSelector('#workflowHome:not(.hidden)', { timeout: 20000 });
        check('Back leaves the admin screen for the workflow home',
            await visible(page, '#configurationStepBtn'));
        await page.evaluate(
            () => document.querySelector('#adminSettingsBtn').classList.add('hidden'));

        // ---- configuration picker ---------------------------------------
        await page.click('#configurationStepBtn');
        await page.waitForSelector('#configurationPicker:not(.hidden)', { timeout: 15000 });
        check('Configuration opens its picker', await visible(page, '#savedConfigs'));
        check('picker offers a new configuration',
            (await textOf(page, '#savedConfigs')).includes('New configuration'));

        // ---- the builder form -------------------------------------------
        await page.click('#buildConfigBtn');
        await page.waitForSelector('#builderScreen:not(.hidden)', { timeout: 15000 });
        for (const id of ['#stackid', '#operator', '#foilMaterial', '#template',
            '#laserList', '#customList', '#previewPanel']) {
            check(`builder renders ${id}`, await visible(page, id));
        }
        // The viewer pane is tabbed and Preview is active, so the status panel is
        // rendered but not shown until its tab is picked.
        check('builder renders #statusPanel',
            await page.locator('#statusPanel').count() === 1);

        // The operator prefill is a substitution the build used to apply and
        // Phase 3 made permanent; nothing else would notice it going missing.
        check('operator is prefilled with the signed-in user',
            (await page.inputValue('#operator')) === ADMIN,
            await page.inputValue('#operator'));

        const materialCount = await page.locator('#foilMaterial option').count();
        check('foil materials are populated from Girder', materialCount > 1,
            `${materialCount} option(s), API reports ${options.materials.length} material(s)`);
        const templateCount = await page.locator('#template option').count();
        check('templates are populated', templateCount > 1, `${templateCount} option(s)`);

        // Dropping the shadow root let Girder's Bootstrap reach the dashboard.
        // It outranks the user-agent rule behind the `hidden` attribute, which
        // is how two file inputs started rendering as stray "Choose File"
        // controls. Catch the whole class of bleed, not just that instance.
        const leaked = await page.evaluate(() => [...document
            .querySelectorAll('.g-flycut-dashboard [hidden]')]
            .filter((el) => getComputedStyle(el).display !== 'none')
            .map((el) => el.id || el.tagName.toLowerCase()));
        check('nothing marked [hidden] is rendered', leaked.length === 0, leaked.join(', '));

        check('status starts Incomplete',
            (await textOf(page, '#statusSummary')) === 'Incomplete',
            await textOf(page, '#statusSummary'));
        await page.screenshot({ path: `${SHOTS}/03-builder.png` });

        // ---- filling it in ----------------------------------------------
        // A clean form must not prompt at all. This was asserted by slicing
        // canLeave() out of main.js and eval'ing it; it is checked against the
        // real page now, which is what let that slice go.
        const cleanDialogs = nativeDialogs;
        await page.click('#backWorkflowBtn');
        await page.waitForSelector('#configurationPicker:not(.hidden)', { timeout: 15000 });
        check('a clean form leaves without prompting',
            nativeDialogs === cleanDialogs &&
            !(await visible(page, '#g-dialog-container .modal-dialog')));
        await page.click('#buildConfigBtn');
        await page.waitForSelector('#builderScreen:not(.hidden)', { timeout: 15000 });

        const usable = materialCount > 1 && templateCount > 1;
        let stackId = await fillRequiredFields(page, usable);
        check('AUTO assigns a stack ID', /^[0-9A-HJKMNP-TV-Z]{5}$/.test(stackId), stackId);

        if (usable) {
            const flyers = await page.locator('#canvas .flyer').count();
            check('choosing a template renders its flyer layout', flyers > 0, `${flyers} flyers`);
            const summary = await textOf(page, '#statusSummary');
            check('status leaves Incomplete once required fields are set',
                summary !== 'Incomplete', summary);
            await page.screenshot({ path: `${SHOTS}/04-configured.png` });
        } else {
            skip('choosing a template renders its flyer layout', 'no material or template to pick');
            skip('status leaves Incomplete once required fields are set', 'same');
        }

        // ---- the builder's own controls ---------------------------------
        // The form, the laser table, the custom fields and the viewer tabs had
        // no coverage at all: the walk above only proves the builder renders and
        // that a filled form submits. 4e rewrites all of it into views, so this
        // captures the behaviour first -- the same reason the harness itself was
        // built before 4c rather than after.
        const laserCards = () => page.locator('#laserList .laser-card').count();

        // Tabs. Each panel is a sibling and only one carries .active.
        await page.click('.g-flycut-dashboard [data-tab="json"]');
        const shownJson = await textOf(page, '#jsonOutput');
        check('the JSON tab shows the configuration as JSON',
            shownJson.startsWith('{') && shownJson.includes('run_parameters'),
            shownJson.slice(0, 40).replace(/\s+/g, ' '));
        check('only one viewer panel is active at a time',
            await page.locator('.viewer-panel.active').count() === 1);
        await page.click('.g-flycut-dashboard [data-tab="preview"]');
        check('the Preview tab comes back', await visible(page, '#canvas'));

        // Zoom is the preview's own state and survives a redraw.
        await page.click('#zoomIn');
        check('zooming in reports the new scale',
            (await textOf(page, '#zoomLabel')) === '110%', await textOf(page, '#zoomLabel'));
        await page.click('#zoomOut');
        check('and zooming back out returns to 100%',
            (await textOf(page, '#zoomLabel')) === '100%', await textOf(page, '#zoomLabel'));

        // Laser entries: add, name by position, remove, and the floor of one.
        const startingLasers = await laserCards();
        await page.click('#addLaserBtn');
        await page.waitForFunction(
            (n) => document.querySelectorAll('.g-flycut-dashboard #laserList .laser-card').length === n,
            startingLasers + 1, { timeout: 10000 });
        check('adding a laser entry names it for its position',
            (await page.locator('#laserList .laser-card .laser-name').last().innerText()).trim() ===
                `Layer F${startingLasers + 1}`,
            await page.locator('#laserList .laser-card .laser-name').last().innerText());
        check('the count follows the list',
            (await textOf(page, '#laserCount')).startsWith(`${startingLasers + 1} /`),
            await textOf(page, '#laserCount'));

        // Colours are how the preview and the generated file tell layers apart,
        // so two entries may not share one.
        const firstHex = page.locator('#laserList .laser-card .hex-editor').first();
        const secondHex = page.locator('#laserList .laser-card .hex-editor').nth(1);
        const keptColor = await firstHex.inputValue();
        await secondHex.fill(keptColor);
        await secondHex.press('Enter');
        await page.waitForTimeout(400);
        check('a duplicate colour is refused and the old one comes back',
            (await secondHex.inputValue()).toLowerCase() !== keptColor.toLowerCase(),
            `${keptColor} -> ${await secondHex.inputValue()}`);
        check('and it says why', (await textOf(page, '#toast')).includes('unique six-digit hex'),
            await textOf(page, '#toast'));
        await secondHex.fill('#0a0b0c');
        await secondHex.press('Enter');
        await page.waitForTimeout(400);
        check('a unique colour is accepted and stored uppercase',
            (await page.locator('#laserList .laser-card .hex-editor').nth(1).inputValue()) === '#0A0B0C',
            await page.locator('#laserList .laser-card .hex-editor').nth(1).inputValue());

        // Switching an entry off greys its card without removing it.
        const secondCard = page.locator('#laserList .laser-card').nth(1);
        await secondCard.locator('[data-key="enabled"]').uncheck();
        await page.waitForTimeout(400);
        check('a disabled entry is marked unused',
            (await page.locator('#laserList .laser-card').nth(1).getAttribute('class')).includes('unused'));
        await page.locator('#laserList .laser-card').nth(1).locator('[data-key="enabled"]').check();
        await page.waitForTimeout(400);

        await page.locator('#laserList .laser-card').nth(1).locator('.remove-laser').click();
        await page.waitForFunction(
            (n) => document.querySelectorAll('.g-flycut-dashboard #laserList .laser-card').length === n,
            startingLasers, { timeout: 10000 });
        check('removing an entry puts the list back', await laserCards() === startingLasers);
        // The form needs at least one entry, and says so rather than emptying.
        while (await laserCards() > 1) {
            await page.locator('#laserList .laser-card .remove-laser').last().click();
            await page.waitForTimeout(250);
        }
        await page.locator('#laserList .laser-card .remove-laser').first().click();
        await page.waitForTimeout(400);
        check('the last laser entry cannot be removed', await laserCards() === 1,
            await textOf(page, '#toast'));

        // Custom fields reach the exported JSON, which is the only thing that
        // proves the rows are read rather than merely rendered.
        await page.click('#addCustomBtn');
        await page.waitForSelector('#customList .custom-row', { timeout: 10000 });
        const row = page.locator('#customList .custom-row').last();
        await row.locator('[data-key="name"]').fill('batch_code');
        await row.locator('[data-key="value"]').fill('QZ-19');
        await page.waitForTimeout(400);
        check('the custom field count follows the rows',
            (await textOf(page, '#customCount')).startsWith('1 field'),
            await textOf(page, '#customCount'));
        await page.click('.g-flycut-dashboard [data-tab="json"]');
        check('a custom field reaches the exported JSON',
            (await textOf(page, '#jsonOutput')).includes('"batch_code"'));
        await page.locator('#customList .custom-row').last().locator('.remove-custom').click();
        await page.waitForTimeout(400);
        check('removing the row takes it back out of the JSON',
            !(await textOf(page, '#jsonOutput')).includes('batch_code'));
        await page.click('.g-flycut-dashboard [data-tab="preview"]');
        await page.screenshot({ path: `${SHOTS}/04b-builder-controls.png` });

        // ---- the unsaved-changes guard ----------------------------------
        // The riskiest thing C5 touches: canLeave() is synchronous today and one
        // of its callers is a capture-phase click handler.
        let dialogsBefore = nativeDialogs;
        await page.fill('#operator', 'someone-else');
        const wasModal = await clickThroughGuard(page, '#backWorkflowBtn', false);
        check('leaving with unsaved changes prompts',
            nativeDialogs > dialogsBefore || wasModal,
            wasModal ? 'girder modal' : 'native confirm');
        check('dismissing the prompt keeps you in the builder',
            await visible(page, '#builderScreen'));

        // Accepting has to actually leave. Nothing asserted this before, and it
        // is the half of the guard that C5 is most likely to break: the guard
        // must stop preventing the navigation once you agree to it.
        dialogsBefore = nativeDialogs;
        await clickThroughGuard(page, '#backWorkflowBtn', true);
        await page.waitForSelector('#configurationPicker:not(.hidden)', { timeout: 15000 })
            .catch(() => {});
        check('accepting the prompt leaves the builder',
            await visible(page, '#configurationPicker'),
            `prompted=${nativeDialogs > dialogsBefore}`);

        // Back in for the lifecycle. Leaving reset the form, so fill it again --
        // and take the new stack ID, since AUTO will have moved on.
        await page.click('#buildConfigBtn');
        await page.waitForSelector('#builderScreen:not(.hidden)', { timeout: 15000 });
        await page.fill('#operator', ADMIN);
        stackId = await fillRequiredFields(page, usable);

        // ---- the full lifecycle: submit, generate, register --------------
        // These are the buttons Phase 4c moves out of the shell's closure, and
        // the only way to know they still work is to press them.
        if (usable) {
            const runName = `e2e-${stackId}`;
            await page.fill('#saveAsName', runName);

            // Submitting is gated on acknowledging any validation warnings, and
            // the box lives in the Status tab.
            await page.click('.g-flycut-dashboard [data-tab="status"]');
            if (await visible(page, '#validationAckLabel')) {
                await page.check('#validationAck');
            }

            await page.click('#submitConfigBtn');
            // Surface why, rather than just timing out: a failed submit leaves
            // its reason in #runStatus or the toast.
            await page.waitForSelector('#workflowHome:not(.hidden)', { timeout: 30000 })
                .catch(async (err) => {
                    const why = await textOf(page, '#runStatus') || await textOf(page, '#toast');
                    throw new Error(`submit did not return to the workflow: ${why || err.message}`);
                });
            check('submitting returns to the workflow and reports it',
                (await textOf(page, '#runStatus')).includes('submitted'),
                await textOf(page, '#runStatus'));
            await page.screenshot({ path: `${SHOTS}/05-submitted.png` });

            // Generation
            await page.click('#lightburnStepBtn');
            await page.waitForSelector('#lightburnPicker:not(.hidden)', { timeout: 15000 });
            await page.selectOption('#submittedConfigs', { label: new RegExp(runName) })
                .catch(async () => { await page.selectOption('#submittedConfigs', { index: 1 }); });
            check('a submitted configuration is selectable for generation',
                !(await page.locator('#generateBtn').isDisabled()));

            await page.click('#generateBtn');
            await page.waitForFunction(
                () => document.querySelector('#runStatus').textContent.includes('generated'),
                { timeout: 60000 });
            check('generating produces files', true, await textOf(page, '#filesHint'));
            check('the generated folder becomes reachable',
                await visible(page, '#generatedFolderLink'));
            await page.screenshot({ path: `${SHOTS}/06-generated.png` });

            // Registration
            await page.click('#lightburnPickerBackBtn');
            await page.waitForSelector('#workflowHome:not(.hidden)', { timeout: 15000 });
            await page.click('#registerBtn');
            await page.waitForSelector('#registrationPicker:not(.hidden)', { timeout: 15000 });
            await page.selectOption('#registrationConfigs', { label: new RegExp(runName) })
                .catch(async () => { await page.selectOption('#registrationConfigs', { index: 1 }); });
            check('a generated configuration is selectable for registration',
                !(await page.locator('#registerStackBtn').isDisabled()));

            await page.click('#registerStackBtn');
            await page.waitForFunction(
                () => document.querySelector('#runStatus').textContent.includes('registered'),
                { timeout: 60000 });
            const hint = await textOf(page, '#registrationHint');
            check('registering mints a stack IGSN', /Registered · .+/.test(hint), hint);
            check('the IGSN becomes reachable', await visible(page, '#viewIgsnLink'));
            await page.screenshot({ path: `${SHOTS}/07-registered.png` });

            // The stack ID is spent now, which is the whole point of the
            // lifecycle: it must not be reusable.
            const states = await (await fetch(`${BASE}/api/v1/flycut/stack-states`,
                { headers: { 'Girder-Token': token } })).json();
            check('the registered stack ID is locked against reuse',
                states[stackId] === 'registered', `${stackId} -> ${states[stackId]}`);
        } else {
            for (const name of ['submitting returns to the workflow and reports it',
                'a submitted configuration is selectable for generation',
                'generating produces files', 'the generated folder becomes reachable',
                'a generated configuration is selectable for registration',
                'registering mints a stack IGSN', 'the IGSN becomes reachable',
                'the registered stack ID is locked against reuse']) {
                skip(name, 'no material or template to build a configuration from');
            }
        }

        // ---- Complete Workflow ------------------------------------------
        // The other half of core/submit.js: one click that submits, generates
        // and registers. It had no browser coverage at all while the
        // step-by-step path above had plenty, and it is the path with the
        // failure recovery in it.
        if (usable) {
            await reopen(page, BASE, flycut._id);
            await page.click('#completeWorkflowBtn');
            await page.waitForSelector('#configurationPicker:not(.hidden)', { timeout: 20000 });
            check('Complete Workflow retitles the picker',
                (await textOf(page, '#configurationPickerTitle')) === 'Complete Workflow');
            check('it shows the automatic-continuation hint',
                await visible(page, '#completeWorkflowHint'));
            check('the submit button says what it will do',
                (await textOf(page, '#submitConfigBtn')) === 'Submit, generate & register');

            await page.click('#buildConfigBtn');
            await page.waitForSelector('#builderScreen:not(.hidden)', { timeout: 20000 });
            await page.fill('#operator', ADMIN);
            const autoStackId = await fillRequiredFields(page, true);
            await page.click('.g-flycut-dashboard [data-tab="status"]');
            if (await visible(page, '#validationAckLabel')) {
                await page.check('#validationAck');
            }
            await page.click('#submitConfigBtn');
            // One click, three server operations. Generation is the slow one.
            await page.waitForSelector('#registrationPicker:not(.hidden)', { timeout: 120000 })
                .catch(async (err) => {
                    const why = await textOf(page, '#runStatus') || await textOf(page, '#toast');
                    throw new Error(`complete workflow did not finish: ${why || err.message}`);
                });
            check('a complete run ends on the registration screen and says so',
                (await textOf(page, '#runStatus')).startsWith('Complete:'),
                await textOf(page, '#runStatus'));
            check('the run’s own configuration is selected on arrival',
                (await page.inputValue('#registrationConfigs')).length > 0);
            const autoHint = await textOf(page, '#registrationHint');
            check('it minted a stack IGSN without a second click',
                /Registered · .+/.test(autoHint), autoHint);
            check('and registering it again is refused',
                await page.locator('#registerStackBtn').isDisabled());
            const autoStates = await (await fetch(`${BASE}/api/v1/flycut/stack-states`,
                { headers: { 'Girder-Token': token } })).json();
            check('its stack ID is spent too',
                autoStates[autoStackId] === 'registered',
                `${autoStackId} -> ${autoStates[autoStackId]}`);
            await page.screenshot({ path: `${SHOTS}/09-complete-workflow.png` });
        } else {
            for (const name of ['Complete Workflow retitles the picker',
                'it shows the automatic-continuation hint',
                'the submit button says what it will do',
                'a complete run ends on the registration screen and says so',
                'the run’s own configuration is selected on arrival',
                'it minted a stack IGSN without a second click',
                'and registering it again is refused', 'its stack ID is spent too']) {
                skip(name, 'no material or template to build a configuration from');
            }
        }

        // ---- it survives a reload ---------------------------------------
        // Everything above ran in one page session. Re-entering from scratch is
        // what proves the lifecycle wrote to the server rather than to a
        // closure the next render would discard.
        await reopen(page, BASE, flycut._id);
        await page.click('#registerBtn');
        await page.waitForSelector('#registrationPicker:not(.hidden)', { timeout: 15000 });
        const persisted = await textOf(page, '#registrationConfigs');
        check('the lifecycle survives a reload',
            persisted.includes('registered') || persisted.includes('generated'),
            persisted.slice(0, 70));
        await page.screenshot({ path: `${SHOTS}/08-reloaded.png` });

        check('no console errors, page errors or failed requests',
            problems.length === 0, problems.slice(0, 3).join(' | '));
    } finally {
        await page.screenshot({ path: `${SHOTS}/99-final.png` }).catch(() => {});
        await browser.close();
    }

    console.log(`\n${failures ? 'FAILED' : 'OK'}  ` +
        `${failures} failure(s), ${skipped} skipped. Screenshots in ${SHOTS}`);
    process.exit(failures ? 1 : 0);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
