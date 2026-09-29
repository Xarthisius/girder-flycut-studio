/* Test workflow state decisions without a browser or production services.
 *
 * This used to slice renderHome() out of main.js and eval it against fake DOM
 * nodes, asserting on what it had written to them. The decision is
 * core/workflow.js now, so the assertions are on the object it returns and the
 * slice is gone -- along with the eslint no-new-func disable that carried it.
 * Two D1 slices left, both in complete_workflow.cjs. */
const assert = require('node:assert/strict');

const { groupedOptions } = require('../girder_flycut/web_client/core/records.js');
const { workflowState } = require('../girder_flycut/web_client/core/workflow.js');

function render(activeConfig, busy = false) {
    return workflowState({
        activeConfig,
        saved: activeConfig ? [activeConfig] : [],
        busy,
        // The shell reads both from the pickers, which default to the one
        // record on screen.
        generationId: activeConfig?._id || '',
        registrationId: activeConfig?._id || ''
    });
}
const saved = { _id: 'config1', status: 'submitted', config: { run_params: { stackid: '00001' } } };
let controls = render(null);
assert.equal(controls['#buildConfigBtn'].text, 'Build config');
assert.equal(controls['#generateBtn'].disabled, true);
assert.equal(controls['#registerBtn'].disabled, false);
controls = render(saved);
assert.equal(controls['#buildConfigBtn'].text, 'View config');
assert.equal(controls['#generateBtn'].disabled, false);
assert.equal(controls['#registerBtn'].disabled, false);
const generated = { ...saved, status: 'generated', folderId: 'folder1', files: [{ _id: 'file1', name: 'layout.lbrn2' }] };
controls = render(generated);
assert(controls['#generateBtn'].disabled);
assert.equal(controls['#lightburnStepBtn'].disabled, false);

assert.equal(controls['#registerBtn'].disabled, false);
controls = render({ ...generated, registration: { igsn: 'ABC-00001', stackDepositionId: 'deposition1' } });
assert.equal(controls['#registerStackBtn'].disabled, false);
assert.equal(controls['#configurationStepBtn'].disabled, false);

controls = render(saved, true);
assert(controls['#buildConfigBtn'].disabled && controls['#generateBtn'].disabled && controls['#savedConfigs'].disabled);
console.log('Workflow states passed: new, saved, generated, registered, busy.');

// The unsaved-change guard used to be checked here by slicing canLeave() out of
// main.js and eval'ing it with stubs. C5 made it asynchronous and the slice
// broke -- the fourth time those boundaries have broken. It is covered against
// a real page by test/browser/verify.cjs now: clean leaves silently, cancel
// stays, accept leaves.

controls = render({ ...generated, status: 'registered', registration: { igsn: 'JHAMAB00010-00001' } });
assert.equal(controls['#viewIgsnLink'].hidden, false);
assert.equal(controls['#viewIgsnLink'].href, '#igsn/JHAMAB00010-00001');
assert(controls['#registerStackBtn'].disabled);
assert(controls['#presetPicker'].hidden);
assert(controls['#presetSelect'].disabled);
assert(render(generated)['#viewIgsnLink'].hidden);
// A mock registration is not a real IGSN, so it gets no link.
assert(render({ ...generated, status: 'registered', registration: { igsn: 'JHAMAB00010-00002', mock: true } })['#viewIgsnLink'].hidden);
console.log('Registration link and disabled presets passed.');

// Folder links and hints follow the selected record, not the active one.
const withFolder = workflowState({ saved: [generated], generationId: 'config1' });
assert.equal(withFolder['#generatedFolderLink'].hidden, false);
assert.equal(withFolder['#generatedFolderLink'].href, '#folder/folder1');
assert.equal(withFolder['#filesHint'].text, 'Status: generated');
assert.equal(withFolder['#deleteFilesBtn'].hidden, false);
const submittedOnly = workflowState({ saved: [saved], generationId: 'config1' });
assert(submittedOnly['#generatedFolderLink'].hidden, 'a submitted configuration has no folder yet');
assert.equal(submittedOnly['#generatedFolderLink'].href, '#');
assert(submittedOnly['#deleteFilesBtn'].hidden);
// Nothing selected: every per-record control is inert rather than undefined.
const nothing = workflowState({});
assert(nothing['#generateBtn'].disabled && nothing['#registerStackBtn'].disabled);
assert.equal(nothing['#filesHint'].text, '');
assert.equal(nothing['#registrationHint'].text, '');
// canEdit === false is someone else's configuration; it may be viewed, not acted on.
const theirs = [{ _id: 'x', status: 'submitted', canEdit: false }];
assert(workflowState({ saved: theirs, generationId: 'x' })['#generateBtn'].disabled);
console.log('Generation and registration selections drive their own controls.');

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
