// Loads the built UMD bundle against a stub `girder` global and checks it
// wires itself up. Everything the shell does at load time is covered here;
// rendering needs a DOM and a live server, so it is not.
//
// `node --check` proves the bundle parses. Only running it proves that every
// module reached the bundle, that nothing needs a DOM at evaluation, and that
// the dashboard registers itself against the contract girder-dashboards
// expects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundle = fs.readFileSync(
    path.join(__dirname, '../girder_flycut/web_client/dist/girder-plugin-flycut.umd.cjs'), 'utf8');

const registered = [];
// Every View.extend() the bundle performs, in order. There are several now
// that the screens are views, so the shell is found by what it defines rather
// than by being the last one.
const specs = [];

/** Minimal stand-in for Backbone's extend, chainable so a view can subclass one. */
function extend(spec) {
    specs.push(spec);
    const Child = function () {};
    Child.prototype = Object.create(this.prototype);
    Object.assign(Child.prototype, spec);
    Child.extend = extend;
    return Child;
}

function View() {}
View.extend = extend;

function Model() {}
Model.extend = extend;

function Collection() {}
Collection.extend = extend;

// routes.js registers at evaluation, so the stub has to carry what it reaches
// for. What it records is then assertable: a route nobody registers is a
// config page nobody can open.
const routes = [];
const exposed = [];
function PluginConfigBreadcrumbWidget() {}
PluginConfigBreadcrumbWidget.prototype.render = function () { return this; };

const girder = {
    Backbone: { Model, Collection },
    $: () => ({ one: () => {} }),
    views: { View, widgets: { PluginConfigBreadcrumbWidget } },
    rest: { restRequest: () => Promise.reject(new Error('not called at load')) },
    auth: { getCurrentUser: () => null },
    router: { route: (path, name, handler) => routes.push([path, name, handler]) },
    events: { trigger: () => {} },
    utilities: { PluginUtils: { exposePluginConfig: (name, path) => exposed.push([name, path]) } },
    plugins: { dashboards: { registerDashboard: (key, spec) => registered.push([key, spec]) } }
};

// No document and no window: anything in the bundle that reaches for either at
// evaluation rather than at render throws here rather than in a browser.
vm.runInNewContext(bundle, { girder, document: undefined, window: undefined });

// The shell is found by what it defines rather than by position: it is no
// longer the last view extended, and there are eighteen of them now.
const extendedSpec = specs.find((spec) => spec.start && spec.render && spec.destroy);
assert(extendedSpec, 'the dashboard shell must be one of the extended views');

assert.equal(registered.length, 1, 'the bundle must register exactly one dashboard');
const [key, spec] = registered[0];
assert.equal(key, 'flycut-config', 'key must match girder_flycut.KEY on the server');
assert.equal(typeof spec.view, 'function', 'a dashboard is registered with a view constructor');
console.log('Bundle registers the flycut-config dashboard with a view.');

for (const method of ['render', 'start', 'destroy']) {
    assert.equal(typeof extendedSpec[method], 'function', `view must define ${method}()`);
}
assert.equal(extendedSpec.start.constructor.name, 'AsyncFunction',
    'start awaits the catalog and the configurations, so it has to stay async');
console.log('View defines render, start and destroy.');

// The screens are views of their own, each with an events hash and an id.
// Five are the shell's, addressed by showScreen(); a screen that lost its id
// would be invisible to navigation and nothing else would notice.
// adminSettingsScreen is no longer among them -- since 6b it is the plugin
// config page's only screen, mounted by ConfigView -- but it is still a view
// with an id, and still has to be in the bundle.
const SHELL_SCREEN_IDS = ['workflowHome', 'configurationPicker', 'lightburnPicker',
    'registrationPicker', 'builderScreen'];
const SCREEN_IDS = [...SHELL_SCREEN_IDS, 'adminSettingsScreen'];
const screens = specs.filter((spec) => SCREEN_IDS.includes(spec.id));
assert.equal(screens.length, SCREEN_IDS.length,
    `expected a view per screen, found ${screens.map((s) => s.id)}`);
for (const screen of screens) {
    assert.equal(typeof screen.events, 'object', `${screen.id} needs an events hash`);
    assert(Object.keys(screen.events).length, `${screen.id} has an empty events hash`);
}
console.log(`Each of the ${screens.length} screens is a view with an events hash.`);

// C6: the policy screen is reachable at a Girder route rather than by
// un-hiding a button. Both halves matter -- exposePluginConfig is the gear
// link on #plugins, the route is where it goes -- and they have to agree.
assert.deepEqual(exposed, [['flycut', 'plugins/flycut/config']],
    `expected one exposed plugin config, got ${JSON.stringify(exposed)}`);
const configRoute = routes.find(([path]) => path === 'plugins/flycut/config');
assert(configRoute, `no route for the config page, got ${routes.map(([p]) => p)}`);
assert.equal(typeof configRoute[2], 'function', 'the config route needs a handler');
assert.equal(exposed[0][1], configRoute[0],
    'the gear link and the route must point at the same path');
console.log('The config page is exposed and routed at plugins/flycut/config.');

// The builder's own children. Three form sections that render into
// #configFields and three panels the tab strip switches between; the panels are
// addressed by id and the sections are not, so only the panels can be named.
const PANEL_IDS = ['statusPanel', 'jsonPanel', 'previewPanel'];
const panels = specs.filter((spec) => PANEL_IDS.includes(spec.id));
assert.equal(panels.length, PANEL_IDS.length,
    `expected a view per viewer panel, found ${panels.map((s) => s.id)}`);
for (const panel of panels) {
    assert.equal(panel.tagName, 'section', `${panel.id} must stay a <section>`);
    assert(panel.className.includes('viewer-panel'),
        `${panel.id} needs .viewer-panel for the tab strip to switch it`);
}
const sections = specs.filter((spec) => spec.tagName === 'details' &&
    spec.className === 'form-section');
assert.equal(sections.length, 3, `expected three form sections, found ${sections.length}`);
console.log('The builder composes three form sections and three viewer panels.');

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
