// Derives the dashboard's markup and stylesheet from the standalone builder
// page in config_builder/static/, and writes them as ES modules for Vite.
//
// Phase 3 moved app.js into the plugin as girder_flycut/web_client/builder.js,
// so this no longer generates the builder -- only the two payloads that are
// still sliced out of index.html and styles.css. Phase 4 moves those in too,
// per Decision 3, and then this file goes away entirely.
//
// Every substitution is matched against literal markup, so a whitespace change
// silently turns one into a no-op: a control quietly stops existing and nothing
// reports it. `sub()` pins the expected match count and fails the build when
// reality disagrees. That coupling is why the eslint formatting rules are still
// off for config_builder/; see .eslintrc.md.
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

fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, 'template.js'),
    '// Generated by build/generate-sources.mjs. Do not edit.\n' +
    'export default ' + JSON.stringify(html) + ';\n');
fs.writeFileSync(path.join(OUT, 'styles.js'),
    '// Generated by build/generate-sources.mjs. Do not edit.\n' +
    'export default ' + JSON.stringify(css) + ';\n');
process.stdout.write(
    `Generated template.js (${html.length} chars) and styles.js (${css.length}).\n`);
