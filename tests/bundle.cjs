// Loads the built UMD bundle against a stub `girder` global and checks it
// wires itself up. Everything the shell does at load time is covered here; rendering
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
    path.join(__dirname, '../girder_flycut/web_client/dist/girder-plugin-flycut.umd.cjs'), 'utf8');

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
    views: { View },
    rest: { restRequest: () => Promise.reject(new Error('not called at load')) },
    auth: { getCurrentUser: () => null },
    plugins: { dashboards: { registerDashboard: (key, spec) => registered.push([key, spec]) } }
};

vm.runInNewContext(bundle, { girder, document: undefined, window: undefined });

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

// Vite minifies the lib build, so every identifier in the bundle is mangled
// and only runtime behaviour and string payloads can be asserted here. The
// shell/builder interface is checked instead at generation time, by
// build/generate-sources.mjs, which fails the build on a mismatch.
//
// What matters is that the payloads reached the artifact at all: an empty
// stylesheet or template would still parse and still register.
assert.ok(bundle.includes('workflowHome'),
    'the workflow markup must be in the bundle');
assert.ok(bundle.length > 40000, `bundle looks truncated at ${bundle.length} bytes`);
assert.ok(!bundle.includes('attachShadow'),
    'Decision 1 dropped the shadow root; nothing should still be attaching one');

// The stylesheet is a separate artifact now that there is no shadow root to
// inject it into. Every rule must be under the plugin's own class, or it
// leaks into Girder core the moment the plugin loads.
const styles = fs.readFileSync(
    path.join(__dirname, '../girder_flycut/web_client/dist/style.css'), 'utf8');
assert.ok(styles.length > 10000, `style.css looks truncated at ${styles.length} bytes`);
const unscoped = styles
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.slice(chunk.lastIndexOf('{') === -1 ? 0 : 0).split('{')[0])
    .map((sel) => sel.replace(/^[\s;]+/, ''))
    .filter((sel) => sel && !sel.startsWith('@') && !sel.includes('.g-flycut-dashboard'));
assert.deepEqual(unscoped, [], `style.css has unscoped selectors: ${unscoped.slice(0, 3)}`);
console.log(`Markup is in the bundle; all of style.css is scoped (${styles.length} bytes).`);
