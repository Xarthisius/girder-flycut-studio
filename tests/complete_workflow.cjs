/* The Complete Workflow: submit, then generate and register without stopping.
 *
 * This used to slice the #submitConfigBtn handler and configure() out of
 * main.js and eval them with twelve injected names, which is what a function
 * that took its whole world from a closure forced. Both decisions are
 * core/submit.js and core/workflow.js now and are imported outright. That was
 * the last of D1: no test in this repository slices source any more. */
const assert = require('node:assert/strict');

const { selectableConfigs } = require('../girder_flycut/web_client/core/records.js');
const { runSubmission, submissionOutcome } = require('../girder_flycut/web_client/core/submit.js');
const { keepsActiveConfig } = require('../girder_flycut/web_client/core/workflow.js');

/**
 * Drive one submission with stubbed operations, recording what it called.
 *
 * `failure` names the endpoint that should refuse, so the two recovery paths
 * can be exercised separately.
 */
async function run(completeWorkflow, failure, valid = true) {
    const calls = [];
    const messages = [];
    let readOnly = false;
    const step = (name) => async () => {
        calls.push(name);
        if (name === failure) {
            throw new Error('permission denied');
        }
    };
    const outcome = await runSubmission({
        completeWorkflow,
        confirmExport: () => valid,
        persist: step('submit'),
        setReadOnly: () => { readOnly = true; },
        generate: step('generate'),
        register: step('register'),
        status: (text) => messages.push(text)
    });
    return { calls, outcome, messages, readOnly };
}

(async () => {
    let result = await run(true);
    assert.deepEqual(result.calls, ['submit', 'generate', 'register']);
    assert.equal(result.outcome.screen, 'registrationPicker');
    assert.equal(result.outcome.failed, false);
    assert.match(result.outcome.message, /^Complete:/);
    assert(result.readOnly, 'a submitted configuration is read-only from that moment');
    // The status line narrates between the steps, so a slow generation does not
    // look like a hung page.
    assert.deepEqual(result.messages, [
        'Configuration submitted. Generating files…',
        'Files generated. Registering stack IGSN…'
    ]);

    result = await run(false);
    assert.deepEqual(result.calls, ['submit'], 'submitting alone generates nothing');
    assert.equal(result.outcome.screen, 'workflowHome');
    assert.match(result.outcome.message, /read-only/);

    result = await run(true, 'generate');
    assert.deepEqual(result.calls, ['submit', 'generate'], 'registration is not attempted');
    assert.equal(result.outcome.screen, 'lightburnPicker');
    assert(result.outcome.failed);
    assert.match(result.outcome.message, /^Automatic generation stopped: permission denied/);
    assert.match(result.outcome.message, /continue from this module\.$/);

    result = await run(true, 'register');
    assert.deepEqual(result.calls, ['submit', 'generate', 'register']);
    assert.equal(result.outcome.screen, 'registrationPicker');
    assert(result.outcome.failed);
    assert.match(result.outcome.message, /^Automatic registration stopped: permission denied/);

    // The export gate runs before anything is written, so a refusal costs
    // nothing -- not even the read-only switch.
    result = await run(true, null, false);
    assert.deepEqual(result.calls, []);
    assert.equal(result.outcome, null);
    assert.equal(result.readOnly, false);
    console.log('Complete workflow: success, manual submission, validation gate, and both failure recovery stages passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

// submissionOutcome on its own: the screen and the message are one decision.
assert.equal(submissionOutcome({ completeWorkflow: true, stage: 'generation', error: 'nope' }).screen, 'lightburnPicker');
assert.equal(submissionOutcome({ completeWorkflow: true, stage: 'registration', error: 'nope' }).screen, 'registrationPicker');
assert.equal(submissionOutcome().screen, 'workflowHome');

const records = [
    { _id: 'draft', status: 'draft', canEdit: true },
    { _id: 'read-only-draft', status: 'draft', canEdit: false },
    { _id: 'submitted', status: 'submitted' },
    { _id: 'generated', status: 'generated' },
    { _id: 'registered', status: 'registered' }
];
assert.deepEqual(selectableConfigs(records, true).map((r) => r._id), ['draft']);
assert.deepEqual(selectableConfigs(records, false), records);

// Entering the builder: Complete Workflow drops anything it cannot start from,
// the Configuration module keeps whatever was chosen.
for (const record of records) {
    assert.equal(keepsActiveConfig(record, true), record._id === 'draft', record._id);
    assert.equal(keepsActiveConfig(record, false), true, record._id);
}
assert.equal(keepsActiveConfig(null, true), true, 'a new configuration is always allowed');
assert.equal(keepsActiveConfig(null, false), true);
// A draft with no canEdit at all is the server saying nothing, which is not a refusal.
assert.equal(keepsActiveConfig({ status: 'draft' }, true), true);
console.log('Complete Workflow permits only new configurations and editable drafts, including mode switches.');
