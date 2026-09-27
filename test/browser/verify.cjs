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
    page.on('dialog', async (dialog) => {
        // beforeunload has to be accepted or the navigation that triggered it is
        // cancelled -- dismissing one means "stay on this page". Only the
        // in-page confirm() is what the guard check is counting.
        if (dialog.type() === 'beforeunload') {
            await dialog.accept();
            return;
        }
        nativeDialogs++;
        await dialog.dismiss();
    });

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
        await page.click('#autoStackIdBtn');
        await page.waitForFunction(
            () => document.querySelector('#stackid').value.length > 0, { timeout: 15000 });
        const stackId = await page.inputValue('#stackid');
        check('AUTO assigns a stack ID', /^[0-9A-HJKMNP-TV-Z]{5}$/.test(stackId), stackId);

        if (materialCount > 1 && templateCount > 1) {
            await page.selectOption('#foilMaterial', { index: 1 });
            await page.selectOption('#template', { index: 1 });
            await page.waitForFunction(
                () => document.querySelectorAll('.g-flycut-dashboard #canvas .flyer').length > 0,
                { timeout: 20000 });
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

        // ---- the unsaved-changes guard ----------------------------------
        // The riskiest thing C5 touches: canLeave() is synchronous today and one
        // of its callers is a capture-phase click handler.
        const dialogsBefore = nativeDialogs;
        await page.fill('#operator', 'someone-else');
        await page.click('#backWorkflowBtn');
        await page.waitForTimeout(600);
        const modalShown = await visible(page, '#g-dialog-container .modal-dialog');
        check('leaving with unsaved changes prompts',
            nativeDialogs > dialogsBefore || modalShown,
            nativeDialogs > dialogsBefore ? 'native confirm' : `modal=${modalShown}`);
        check('dismissing the prompt keeps you in the builder',
            await visible(page, '#builderScreen'));

        // Put the field back so the builder is clean before the lifecycle
        // starts; the guard above left it dirty on purpose.
        await page.fill('#operator', ADMIN);

        // ---- the full lifecycle: submit, generate, register --------------
        // These are the buttons Phase 4c moves out of the shell's closure, and
        // the only way to know they still work is to press them.
        if (materialCount > 1 && templateCount > 1) {
            const runName = `e2e-${stackId}`;
            await page.fill('#saveAsName', runName);

            // Submitting is gated on acknowledging any validation warnings, and
            // the box lives in the Status tab.
            await page.click('.g-flycut-dashboard [data-tab="status"]');
            if (await visible(page, '#validationAckLabel')) {
                await page.check('#validationAck');
            }

            await page.click('#submitConfigBtn');
            await page.waitForSelector('#workflowHome:not(.hidden)', { timeout: 30000 });
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
