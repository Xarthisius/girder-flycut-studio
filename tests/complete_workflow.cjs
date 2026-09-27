/* eslint-disable no-new-func, no-return-assign -- these suites extract functions
   from app.js by string-slicing and eval them. Tracked as issue D1; Phase 3
   extracts the same functions into importable modules and this disappears. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../girder_flycut/client_wrapper.js'), 'utf8');
const body = source.split("act('#submitConfigBtn', async () => {")[1].split('\n            });')[0];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(automated, failure, valid = true) {
    const calls = [], nodes = {};
    const $ = id => nodes[id] ||= {};
    let screen, message;
    const fn = new AsyncFunction('request', 'state', 'updateAll', 'confirmExport', 'persist', 'setReadOnly', 'home', 'status', 'refresh', 'showScreen', '$', 'renderHome', 'completeWorkflow',
        "let activeConfig = {_id:'c1'};\n" + body);
    const request = async (url, method) => {
        if (!method) return [];
        calls.push(url);
        if (url.endsWith(failure || 'NEVER')) throw Error('permission denied');
        return {_id:'c1'};
    };
    let error;
    try {
        await fn(request, {}, () => {}, () => valid, async () => {calls.push('submit');}, () => {}, () => {screen='home';}, text => {message=text;}, async () => {}, name => {screen=name;}, $, () => {}, automated);
    } catch (err) {error=err.message;}
    return {calls, screen, message, error, nodes};
}
(async () => {
    let result = await run(true);
    assert.deepEqual(result.calls, ['submit','config/c1/generate','config/c1/register']);
    assert.equal(result.screen, 'registrationPicker');
    assert.equal(result.nodes['#registrationConfigs'].value, 'c1');
    assert.match(result.message, /^Complete:/);
    result = await run(false);
    assert.deepEqual(result.calls, ['submit']);
    assert.equal(result.screen, 'home');
    result = await run(true, '/generate');
    assert.deepEqual(result.calls, ['submit','config/c1/generate']);
    assert.equal(result.screen, 'lightburnPicker');
    assert.match(result.error, /Automatic generation stopped/);
    result = await run(true, '/register');
    assert.equal(result.screen, 'registrationPicker');
    assert.match(result.error, /Automatic registration stopped/);
    assert.deepEqual((await run(true, null, false)).calls, []);
    console.log('Complete workflow: success, manual submission, validation gate, and both failure recovery stages passed.');
})().catch(error => {console.error(error); process.exitCode=1;});

const selectionExpression = source.split('const selectableConfigs = records => ')[1].split(';')[0];
const select = new Function('records', 'completeWorkflow', 'return ' + selectionExpression);
const records = [
    {_id:'draft', status:'draft', canEdit:true},
    {_id:'read-only-draft', status:'draft', canEdit:false},
    {_id:'submitted', status:'submitted'},
    {_id:'generated', status:'generated'},
    {_id:'registered', status:'registered'}
];
assert.deepEqual(select(records, true).map(r => r._id), ['draft']);
assert.deepEqual(select(records, false), records);
const configureBody = source.split('const configure = async automated => {')[1].split('\n            };')[0];
async function enter(activeConfig) {
    const nodes = {};
    const $ = key => nodes[key] ||= {classList:{toggle(){}}};
    return new AsyncFunction('activeConfig', '$', 'refresh', 'showScreen', 'let completeWorkflow; const automated = true; ' + configureBody + '; return activeConfig;')(activeConfig, $, async () => {}, () => {});
}
(async () => {
    for (const record of records) assert.equal(await enter(record), record._id === 'draft' ? record : null);
    assert.equal(await enter(null), null);
    console.log('Complete Workflow permits only new configurations and editable drafts, including mode switches.');
})().catch(error => {console.error(error); process.exitCode=1;});
