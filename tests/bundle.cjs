// Loads the built bundle against a stub `girder` global and checks it wires
// itself up. Everything the shell does at load time is covered here; rendering
// needs a DOM and a live server, so it is not.
//
// This exists because the bundle is assembled by string substitution in
// build_dashboard.py. `node --check` proves it parses; only running it proves
// the pieces were substituted into the right places.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundle = fs.readFileSync(
    path.join(__dirname, '../girder_flycut/web_client/main.js'), 'utf8');

const registered = [];
let extendedSpec = null;

function View() {}
View.extend = function (spec) {
    extendedSpec = spec;
    const Child = function () {};
    Child.prototype = Object.create(View.prototype);
    Object.assign(Child.prototype, spec);
    return Child;
};

const girder = {
    views: {View},
    rest: {restRequest: () => Promise.reject(new Error('not called at load'))},
    auth: {getCurrentUser: () => null},
    plugins: {dashboards: {registerDashboard: (key, spec) => registered.push([key, spec])}}
};

vm.runInNewContext(bundle, {girder, document: undefined, window: undefined});

assert.equal(registered.length, 1, 'the bundle must register exactly one dashboard');
const [key, spec] = registered[0];
assert.equal(key, 'flycut-config', 'key must match girder_flycut.KEY on the server');
assert.equal(typeof spec.view, 'function', 'a dashboard is registered with a view constructor');
console.log('Bundle registers the flycut-config dashboard with a view.');

for (const method of ['render', 'startBuilder', 'destroy']) {
    assert.equal(typeof extendedSpec[method], 'function', `view must define ${method}()`);
}
assert.equal(extendedSpec.startBuilder.constructor.name, 'AsyncFunction',
    'startBuilder awaits the builder, so it has to stay async');
console.log('View defines render, startBuilder and destroy.');

// The three build inputs must have been substituted, not left as stubs. An
// empty stylesheet or template would still parse and still register.
const styles = bundle.match(/const FLYCUT_STYLES = ("(?:[^"\\]|\\.)*");/);
const template = bundle.match(/const FLYCUT_TEMPLATE = ("(?:[^"\\]|\\.)*");/);
assert.ok(styles && JSON.parse(styles[1]).length > 1000, 'styles were not substituted');
assert.ok(template && JSON.parse(template[1]).length > 1000, 'template was not substituted');
assert.ok(JSON.parse(styles[1]).includes(':host'), 'styles must be retargeted at the shadow root');
assert.ok(JSON.parse(template[1]).includes('id="workflowHome"'), 'template must carry the workflow shell');
assert.ok(/const FLYCUT_BUILDER = async function/.test(bundle), 'builder was not substituted');
assert.ok(!/const FLYCUT_BUILDER = \(\) => \(\{\}\);/.test(bundle), 'builder is still the stub');
console.log('Styles, template and builder were all substituted.');

// The shell destructures the builder's exports; a mismatch yields undefined at
// runtime rather than an error. build_dashboard.py already fails the build on a
// mismatch -- this checks the same thing on the artifact that actually ships.
//
// Anchored by index, not regex: the file is one 900-line closure and a lazy
// pattern happily matches the wrong `const {` hundreds of lines earlier.
const callAt = bundle.indexOf('} = await FLYCUT_BUILDER(');
assert.ok(callAt > 0, 'the shell must call the builder');
const openAt = bundle.lastIndexOf('const {', callAt);
const destructured = bundle.slice(openAt + 'const {'.length, callAt)
    .split(',').map((n) => n.trim()).filter(Boolean).sort();

// app.js indents every one of its own returns, so a `return {` at column zero
// is unambiguously the one build_dashboard.py appends.
const returnAt = bundle.lastIndexOf('\nreturn {');
assert.ok(returnAt > 0, 'the generated builder must return its exports');
const returned = bundle.slice(returnAt + '\nreturn {'.length, bundle.indexOf('}', returnAt))
    .split(',').map((n) => n.trim()).filter(Boolean).sort();

assert.deepEqual(destructured, returned,
    'client_wrapper.js and the generated builder disagree on their interface');
assert.ok(returned.length >= 15, `expected at least 15 shared bindings, got ${returned.length}`);
console.log(`Shell and builder agree on all ${returned.length} shared bindings.`);
