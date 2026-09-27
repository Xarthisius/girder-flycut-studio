// Derives the dashboard's three generated sources from the standalone builder
// in config_builder/static/, and writes them as ES modules for Vite to bundle.
//
// This is a port of build_dashboard.py, which used to assemble the shipped
// bundle by hand. It no longer assembles anything -- Vite does that -- it only
// generates source. `npm run build` therefore needs no Python.
//
// Every substitution is matched against literal markup, so a whitespace change
// in config_builder/static/ silently turns one into a no-op: a control quietly
// stops existing and nothing reports it. `sub()` pins the expected match count
// and fails the build when reality disagrees. That coupling is the reason the
// eslint formatting rules are still off; see .eslintrc.md.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_CLIENT = path.resolve(HERE, '..');
const ROOT = path.resolve(WEB_CLIENT, '../..');
const STATIC = path.join(ROOT, 'config_builder/static');
const PLUGIN = path.join(ROOT, 'girder_flycut');
const OUT = path.join(WEB_CLIENT, 'generated');

class BuildError extends Error {}

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

function sub(text, old, next, count = 1) {
    const found = text.split(old).length - 1;
    if (found !== count) {
        throw new BuildError(
            `expected ${count} occurrence(s) of ${JSON.stringify(old.slice(0, 70))}, found ${found}. ` +
            'The source markup moved; update this substitution.');
    }
    return text.split(old).join(next);
}

function resub(text, pattern, next, count = 1) {
    const found = (text.match(pattern) || []).length;
    if (found !== count) {
        throw new BuildError(`expected ${count} match(es) of ${pattern}, found ${found}.`);
    }
    return text.replace(pattern, next);
}

function search(text, pattern) {
    const match = text.match(pattern);
    if (!match) {
        throw new BuildError(`${pattern} not found in the source markup.`);
    }
    return match[0];
}

function splitOnce(text, marker, index) {
    if (!text.includes(marker)) {
        throw new BuildError(`${JSON.stringify(marker)} not found in the source markup.`);
    }
    return text.split(marker)[index];
}

// Everything the dashboard shell destructures out of the builder. The two are
// separate files sharing one closure, so a mismatch produces `undefined` rather
// than an error. Both sides are checked against this list.
const BUILDER_EXPORTS = [
    '$', 'changeTemplate', 'cleanupTooltips', 'clearValidation', 'configObject',
    'confirmExport', 'escapeHtml', 'finalConfigObject', 'importJson', 'makeLaser',
    'renderCustomFields', 'state', 'toast', 'updateAll', 'updateAssignmentUI'
];

function checkBuilderInterface(appSource, shellSource) {
    for (const name of BUILDER_EXPORTS) {
        // `\b` is useless here: `$` is not a word character.
        const escaped = name.replace(/[$]/g, '\\$&');
        const declared = new RegExp(
            `^(?:async\\s+)?(?:function\\s+${escaped}(?![\\w$])|(?:const|let|var)\\s+${escaped}(?![\\w$]))`,
            'm');
        if (!declared.test(appSource)) {
            throw new BuildError(
                `${JSON.stringify(name)} is exported to the dashboard shell but is not ` +
                'declared at the top level of app.js.');
        }
    }
    const block = search(shellSource, /const \{[\s\S]*?\} = await createBuilder\(/);
    const destructured = block
        .slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
        .split(',').map((n) => n.trim()).filter(Boolean).sort();
    const expected = [...BUILDER_EXPORTS].sort();
    if (JSON.stringify(destructured) !== JSON.stringify(expected)) {
        throw new BuildError(
            `main.js destructures ${JSON.stringify(destructured)} but the builder exports ` +
            `${JSON.stringify(expected)}.`);
    }
}

// ---------------------------------------------------------------- markup ----

let html = splitOnce(read(STATIC, 'index.html'), '<body>', 1);
html = splitOnce(html, '<script', 0);
html = sub(html, 'href="/"', 'href="#dashboards"');
html = sub(
    html,
    '<button id="resetBtn" class="button ghost" type="button">Reset</button>',
    '<button id="resetBtn" class="button ghost" type="button">Reset</button>' +
    '<button id="submitConfigBtn" class="button primary" type="button">Submit</button>');
html = sub(
    html,
    '<select id="template" name="template"><option value="">Loading templates…</option></select>',
    '<div class="template-picker-row">' +
    '<select id="template" name="template"><option value="">Loading templates…</option></select>' +
    '<button id="browseTemplateBtn" type="button" class="button ghost"' +
    ' aria-label="Choose template from portal" title="Choose template from portal">+</button></div>');
html = sub(
    html,
    '<span class="input-wrap"><input id="stackid" name="stackid" placeholder="e.g. 00005" required></span>',
    '<div class="template-picker-row">' +
    '<input id="stackid" name="stackid" placeholder="e.g. 00005" required>' +
    '<button id="autoStackIdBtn" class="button ghost" type="button"' +
    ' aria-label="Assign lowest available Stack ID" aria-pressed="false"' +
    ' title="Assign lowest available Stack ID">AUTO</button></div>');
html = sub(html, '<form id="configForm" novalidate>',
    '<form id="configForm" novalidate><fieldset id="configFields">');
html = sub(html, '</form>', '</fieldset></form>');

let banner = search(html, /<header class="topbar">[\s\S]*?<\/header>/);
html = sub(html, banner, '');
banner = sub(banner, '<b>FLYER</b><small>STUDIO</small>',
    '<b>FLYER STUDIO</b><small id="currentPageLabel">Home</small>');
banner = sub(banner, 'href="#dashboards" aria-label="Flyer Studio home"',
    'href="#" id="studioHomeLink" aria-label="Flyer Studio home"');
banner = sub(banner, 'class="top-actions"', 'class="top-actions hidden" id="builderActions"');

const BUILDER_NAV =
    '<div id="builderScreen" class="hidden"><nav class="builder-nav">' +
    '<button id="backWorkflowBtn" type="button" class="button ghost"' +
    ' aria-label="Back to workflow" title="Back to workflow">←</button>' +
    '<input id="saveAsName" type="text" placeholder="Save as…" aria-label="Save as" maxlength="160">' +
    '<button id="saveGirderBtn" class="button primary" type="button">Save</button>' +
    '<span id="builderMode" aria-live="polite"></span>' +
    '<button id="editCopyBtn" type="button" class="button ghost hidden">Edit a copy</button></nav>';

html = banner + read(PLUGIN, 'workflow.html') + BUILDER_NAV + html + '</div>';
html = sub(html, '>Reset</button>', '>Delete</button>');

// ---------------------------------------------------------------- styles ----

// The standalone builder styles the document; inside the dashboard it styles a
// shadow root, so its two document-level selectors are retargeted.
let css = sub(read(STATIC, 'styles.css'), ':root', ':host');
css = resub(css, /(?<![-\w])body\{/, ':host{display:block;');
css += read(PLUGIN, 'workflow.css');

// --------------------------------------------------------------- builder ----

// `$` and `$$` both default to `document`; both must resolve inside the mount.
let app = sub(read(STATIC, 'app.js'), 'root = document', 'root = mount', 2);
const lines = app.split('\n');
const kept = lines.filter((line) => !line.startsWith('$("#resetBtn").addEventListener'));
if (lines.length - kept.length !== 1) {
    throw new BuildError('expected exactly one top-level #resetBtn listener to drop.');
}
app = kept.join('\n');
app = sub(app, 'Could not load filesystem options', 'Could not load Girder catalog');
app = sub(app, 'renderAutocomplete();\n    fillSelect',
    'renderAutocomplete();\n    $("#operator").value = currentUser.get("login");\n    fillSelect');
app = sub(app, 'renderCustomFields(); loadOptions();', 'renderCustomFields(); await loadOptions();');

checkBuilderInterface(app, read(WEB_CLIENT, 'main.js'));

// async because the body contains a top-level `await loadOptions()`. The shell
// awaits the builder, which suspends at exactly the same point.
const builder =
    '// Generated by build/generate-sources.mjs. Do not edit.\n' +
    'export default async function createBuilder({mount, currentUser, fetch}) {\n' +
    app +
    '\nreturn {' + BUILDER_EXPORTS.join(', ') + '};\n}\n';

fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, 'template.js'),
    '// Generated by build/generate-sources.mjs. Do not edit.\n' +
    'export default ' + JSON.stringify(html) + ';\n');
fs.writeFileSync(path.join(OUT, 'styles.js'),
    '// Generated by build/generate-sources.mjs. Do not edit.\n' +
    'export default ' + JSON.stringify(css) + ';\n');
fs.writeFileSync(path.join(OUT, 'builder.js'), builder);

process.stdout.write(
    `Generated template.js (${html.length} chars), styles.js (${css.length}), ` +
    `builder.js (${BUILDER_EXPORTS.length} exports).\n`);
