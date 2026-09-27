/* eslint-disable no-new-func, no-return-assign -- renderHome and the unsaved-change guard are still
   sliced out of main.js and eval'd: they are DOM orchestration over the
   shell's closure, which Phase 4 turns into Backbone views. The pure
   logic they used to carry is imported from ../girder_flycut/web_client/core/
   now. Note the slice boundaries include indentation, so moving that code
   moves them. Remainder of issue D1. */
/* Test workflow state decisions without a browser or production services. */
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const { groupedOptions } = require('../girder_flycut/web_client/core/records.js');
const source = fs.readFileSync(path.join(__dirname, '../girder_flycut/web_client/main.js'), 'utf8');
const body = source.split('const renderHome = () => {')[1].split('\n        const refresh =')[0].replace(/};\s*$/, '');
function render(activeConfig, busy = false) {
    const nodes = {};
    const $ = (selector) => nodes[selector] ||= {
        value: activeConfig?._id || '',
        classes: new Set(),
        classList: { add(name) { nodes[selector].classes.add(name); }, toggle(name, yes) { yes ? nodes[selector].classes.add(name) : nodes[selector].classes.delete(name); } },
        replaceChildren() {},
        append() {}
    };
    new Function('$', 'activeConfig', 'busy', 'document', 'girder', 'saved', body)($, activeConfig, busy, { createElement: () => ({}) }, { rest: { getApiRoot: () => '/api/v1' } }, activeConfig ? [activeConfig] : []);
    return nodes;
}
const saved = { _id: 'config1', status: 'submitted', config: { run_params: { stackid: '00001' } } };
let nodes = render(null);
assert.equal(nodes['#buildConfigBtn'].textContent, 'Build config');
assert.equal(nodes['#generateBtn'].disabled, true);
assert.equal(nodes['#registerBtn'].disabled, false);
nodes = render(saved);
assert.equal(nodes['#buildConfigBtn'].textContent, 'View config');
assert.equal(nodes['#generateBtn'].disabled, false);
assert.equal(nodes['#registerBtn'].disabled, false);
const generated = { ...saved, status: 'generated', folderId: 'folder1', files: [{ _id: 'file1', name: 'layout.lbrn2' }] };
nodes = render(generated);
assert(nodes['#generateBtn'].disabled);
assert.equal(nodes['#lightburnStepBtn'].disabled, false);

assert.equal(nodes['#registerBtn'].disabled, false);
nodes = render({ ...generated, registration: { igsn: 'ABC-00001', stackDepositionId: 'deposition1' } });
assert.equal(nodes['#registerStackBtn'].disabled, false);
assert.equal(nodes['#configurationStepBtn'].disabled, false);

nodes = render(saved, true);
assert(nodes['#buildConfigBtn'].disabled && nodes['#generateBtn'].disabled && nodes['#savedConfigs'].disabled);
console.log('Workflow states passed: new, saved, generated, registered, busy.');

// The unsaved-change guard used to be checked here by slicing canLeave() out of
// main.js and eval'ing it with stubs. C5 made it asynchronous and the slice
// broke -- the fourth time those boundaries have broken. It is covered against
// a real page by test/browser/verify.cjs now: clean leaves silently, cancel
// stays, accept leaves.

nodes = render({ ...generated, status: 'registered', registration: { igsn: 'JHAMAB00010-00001' } });
assert(!nodes['#viewIgsnLink'].classes.has('hidden'));
assert.equal(nodes['#viewIgsnLink'].href, '#igsn/JHAMAB00010-00001');
assert(nodes['#registerStackBtn'].disabled);
assert(nodes['#presetPicker'].classes.has('hidden'));
assert(nodes['#presetSelect'].disabled);
assert(render(generated)['#viewIgsnLink'].classes.has('hidden'));
console.log('Registration link and disabled presets passed.');

const ordered = groupedOptions([
    { _id: 'old', status: 'draft', savedAt: '2026-01-01' },
    { _id: 'registered', status: 'registered', savedAt: '2026-03-01' },
    { _id: 'new', status: 'draft', savedAt: '2026-02-01' },
    { _id: 'missing', status: 'draft' }
], { escapeHtml: (value) => value, savedTime: (record) => record.savedAt || '' });
// The old test stubbed the option renderer so each record rendered as `[id]`;
// the renderer is part of the core now, so assert on the real markup.
const at = (id) => ordered.indexOf(`value="${id}"`);
assert(at('new') < at('old'), 'newer drafts sort first');
assert(at('old') < at('missing'), 'records with no timestamp sort last within their stage');
assert(at('missing') < at('registered'), 'drafts group before registered');
console.log('Configuration sorting retains categories and sorts newest timestamps first.');
