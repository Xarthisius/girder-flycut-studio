// The builder's rules, exercised directly.
//
// All of these lived in builder.js reading `state` and the form controls, so
// the only way to reach them was through a rendered page. They take their
// inputs now, which is the whole reason this file can exist.
import assert from 'node:assert/strict';

import { catalogOptions, materialSummary, resolveMaterial, templateSummary } from '../girder_flycut/web_client/core/catalog.js';
import { customFieldRows, importedLasers, layerAssignment, toFormShape } from '../girder_flycut/web_client/core/config.js';
import {
    LASER_LIMIT, acceptColor, applyMaterialDefaults, COLOR_REJECTED, laserListState,
    makeLaser, moveLaser, normalizeLayerNames, resolveLaserForLayer, usedLaserCount
} from '../girder_flycut/web_client/core/laser.js';
import { previewLayout, UNCONFIGURED } from '../girder_flycut/web_client/core/preview.js';
import { statusLabel } from '../girder_flycut/web_client/core/validate.js';

const laser = (overrides = {}) => ({
    id: overrides.id || Math.random().toString(36).slice(2),
    name: overrides.name || 'F1',
    enabled: overrides.enabled !== false,
    isDefault: overrides.isDefault ?? false,
    power: 60,
    speed: 100,
    qpulsewidth: 200,
    frequency: 100,
    passes: 1,
    ...overrides
});

// ---- naming follows position ------------------------------------------------
{
    const lasers = [laser({ name: 'x' }), laser({ name: 'y' }), laser({ name: 'z' })];
    normalizeLayerNames(lasers);
    assert.deepEqual(lasers.map((l) => l.name), ['F1', 'F2', 'F3']);
}

// ---- reordering renames ------------------------------------------------------
{
    const lasers = [laser({ id: 'a' }), laser({ id: 'b' }), laser({ id: 'c' })];
    normalizeLayerNames(lasers);

    moveLaser(lasers, 'c', 'a');
    assert.deepEqual(lasers.map((l) => l.id), ['c', 'a', 'b'], 'before the target by default');
    assert.deepEqual(lasers.map((l) => l.name), ['F1', 'F2', 'F3'], 'renamed to match');

    moveLaser(lasers, 'c', 'b', true);
    assert.deepEqual(lasers.map((l) => l.id), ['a', 'b', 'c'], 'placeAfter puts it after');

    // No-ops that used to be guarded inline.
    const before = lasers.map((l) => l.id);
    moveLaser(lasers, 'a', 'a');
    moveLaser(lasers, 'missing', 'b');
    moveLaser(lasers, null, 'b');
    assert.deepEqual(lasers.map((l) => l.id), before, 'self, unknown and empty moves do nothing');
}

// ---- defaults apply only to entries still marked DEFAULT ---------------------
{
    const kept = laser({ id: 'edited', isDefault: false, power: 42 });
    const lasers = [laser({ id: 'fresh', isDefault: true }), kept];
    applyMaterialDefaults(lasers, { laser_defaults: { maxPower: 80, numPasses: 3 } }, null);
    assert.equal(lasers[0].power, 80, 'a default entry takes the material power');
    assert.equal(lasers[0].passes, 3);
    assert.equal(kept.power, 42, 'an edited entry is left alone');

    // A preset wins over the material.
    const presetted = [laser({ id: 'fresh', isDefault: true })];
    applyMaterialDefaults(presetted, { laser_defaults: { maxPower: 80 } },
        { laser_defaults: { power: 10, speed: 7 } });
    assert.equal(presetted[0].power, 10);
    assert.equal(presetted[0].speed, 7);

    // A material with no defaults changes nothing.
    const untouched = [laser({ id: 'fresh', isDefault: true, power: 60 })];
    applyMaterialDefaults(untouched, {}, null);
    assert.equal(untouched[0].power, 60);
}

// ---- how many entries a template consumes ------------------------------------
{
    const three = [laser(), laser(), laser()];
    assert.equal(usedLaserCount(three, null, 1), null, 'no template, no answer');
    assert.equal(usedLaserCount(three, 2, 1), 2, 'fewer layers than entries');
    assert.equal(usedLaserCount(three, 9, 1), 3, 'never more than there are entries');
    assert.equal(usedLaserCount(three, 5, 2), 3, 'repeat stretches each entry');
    assert.equal(usedLaserCount(three, 4, 2), 2);
    assert.equal(usedLaserCount(three, 4, 0), 3, 'a zero repeat is treated as one');
}

// ---- which entry drives which layer ------------------------------------------
{
    const lasers = [laser({ id: 'a' }), laser({ id: 'b' })];
    normalizeLayerNames(lasers);

    assert.equal(resolveLaserForLayer([], 0, { repeat: 1, wraparound: true }).laser, null,
        'no entries, no laser');

    const first = resolveLaserForLayer(lasers, 0, { repeat: 1, wraparound: true });
    assert.equal(first.laser.id, 'a');
    assert.equal(first.augmented, false, 'F1 driving layer 1 is not augmented');

    const wrapped = resolveLaserForLayer(lasers, 2, { repeat: 1, wraparound: true });
    assert.equal(wrapped.laser.id, 'a', 'wraparound returns to the first entry');
    assert.equal(wrapped.augmented, true, 'standing in for another layer is augmented');

    const past = resolveLaserForLayer(lasers, 5, { repeat: 1, wraparound: false });
    assert.equal(past.laser, null, 'without wraparound, layers past the end are unspecified');

    const repeated = resolveLaserForLayer(lasers, 1, { repeat: 2, wraparound: false });
    assert.equal(repeated.laser.id, 'a', 'repeat holds an entry across layers');

    const disabled = [laser({ id: 'off', enabled: false })];
    assert.equal(resolveLaserForLayer(disabled, 0, { repeat: 1, wraparound: true }).laser, null,
        'a disabled entry drives nothing');
}

// ---- construction ------------------------------------------------------------
{
    assert.equal(LASER_LIMIT, 28);
    const first = makeLaser({}, []);
    assert.equal(first.name, 'F1');
    const second = makeLaser({}, [first]);
    assert.notEqual(second.color, first.color, 'colours do not repeat while the palette lasts');
    const imported = makeLaser({ fromImport: true, power: 12 }, []);
    assert.deepEqual(imported.importOriginal.power, 12,
        'an imported entry remembers what it arrived with');
}

console.log('Laser rules passed: naming, reordering, defaults, coverage and assignment.');

// ---- the builder's remaining rules ------------------------------------
// Extracted in 4e. previewLayout in particular had never been asserted: a
// preview that puts every flyer in the same place still looks plausible in a
// screenshot, which is the only thing that had ever looked at it.
const four = [
    { id: 'a', color: '#111111', enabled: true, name: 'F1' },
    { id: 'b', color: '#222222', enabled: true, name: 'F2' },
    { id: 'c', color: '#333333', enabled: false, name: 'F3' },
    { id: 'd', color: '#444444', enabled: true, name: 'F4' }
];
let list = laserListState(four, 2, 1);
assert.deepEqual(list.cards.map((card) => card.overflow), [false, false, true, true],
    'a two-layer template leaves the third and fourth entries with nothing to drive');
assert.deepEqual(list.cards.map((card) => card.unused), [false, false, true, true]);
assert.equal(list.count, '4 / 2');
assert.equal(list.surplus, true, 'four entries for two layers is a surplus');
assert.equal(list.addTitle, 'Additional settings will be unused by this template');
// A disabled entry is unused but not overflow: its checkbox stays live, because
// the enabled state is restored if the row fits again.
list = laserListState(four, 8, 1);
assert.deepEqual(list.cards.map((card) => card.overflow), [false, false, false, false]);
assert.deepEqual(list.cards.map((card) => card.unused), [false, false, true, false]);
assert.equal(list.surplus, false);
assert.equal(list.addTitle, 'Add the next layer setting');
// Repeat stretches each entry over several layers, so a given template needs
// fewer of them and more of them overflow. Four layers at two apiece consume
// two entries, not four.
assert.deepEqual(laserListState(four, 4, 2).cards.map((c) => c.overflow), [false, false, true, true]);
assert.deepEqual(laserListState(four, 8, 2).cards.map((c) => c.overflow), [false, false, false, false]);
// No template yet: nothing is known to be unused, only what is switched off.
assert.deepEqual(laserListState(four, null, 1).cards.map((c) => c.overflow), [false, false, false, false]);
assert.equal(laserListState(four, null, 1).count, '4 / —');
assert.equal(laserListState([], null, 1).error, 'At least one laser setting is required.');
assert.equal(laserListState(four, null, 1).error, '');
assert.equal(laserListState(new Array(28).fill(four[0]), null, 1).addDisabled, true, 'the 28 cap');
assert.equal(laserListState(new Array(27).fill(four[0]), null, 1).addDisabled, false);

assert.deepEqual(acceptColor(four, 'a', '#ABCDEF'), { ok: true, color: '#ABCDEF', message: null });
assert.equal(acceptColor(four, 'a', '#abcdef').color, '#ABCDEF', 'stored uppercase');
assert.equal(acceptColor(four, 'a', '  #ABCDEF  ').ok, true, 'surrounding space is trimmed');
// Two entries sharing a colour would silently merge in the preview and in the
// generated file, so the old value comes back and says why.
assert.deepEqual(acceptColor(four, 'a', '#222222'),
    { ok: false, color: '#111111', message: COLOR_REJECTED });
assert.equal(acceptColor(four, 'a', '#111111').ok, true, 'an entry may keep its own colour');
for (const bad of ['#FFF', 'red', '#12345', '#1234567', '']) {
    assert.equal(acceptColor(four, 'a', bad).ok, false, bad);
    assert.equal(acceptColor(four, 'a', bad).color, '#111111', bad);
}
console.log('Laser list overflow, the 28 cap, and unique-colour acceptance passed.');

const layout = previewLayout({
    flyers: [
        { xpos: 0, ypos: 0, layer: 'L1', position: 'A1' },
        { xpos: 10, ypos: 10, layer: 'L2', position: 'B2' }
    ],
    layers: ['L1', 'L2'],
    lasers: [{ name: 'F1', color: '#AAA111', enabled: true }, { name: 'F2', color: '#BBB222', enabled: true }],
    repeat: 1
});
// The y axis is flipped: LightBurn counts upwards, the document counts down.
assert.deepEqual(layout.flyers.map((f) => [f.left, f.top]), [[8, 92], [92, 8]]);
assert.deepEqual(layout.flyers.map((f) => f.color), ['#AAA111', '#BBB222']);
assert.deepEqual(layout.flyers.map((f) => f.label), ['F1', 'F2']);
assert.equal(layout.flyers[0].title, 'Template L1 uses F1');
assert(layout.flyers.every((f) => !f.unconfigured));
// One flyer has no extent on either axis; span 1 keeps the division defined
// rather than producing NaN, and puts it at the origin corner.
const single = previewLayout({
    flyers: [{ xpos: 5, ypos: 5, layer: 'L1', position: 'A1' }],
    layers: ['L1'],
    lasers: [{ name: 'F1', color: '#AAA111', enabled: true }]
});
assert.deepEqual([single.flyers[0].left, single.flyers[0].top], [8, 8]);
assert(Number.isFinite(single.size));
// A layer no enabled entry drives keeps the template's own colour and says so.
const uncovered = previewLayout({
    flyers: [{ xpos: 0, ypos: 0, layer: 'L9', position: 'A1' }],
    layers: ['L9'],
    lasers: [{ name: 'F1', color: '#AAA111', enabled: false }]
});
assert.equal(uncovered.flyers[0].color, UNCONFIGURED);
assert.equal(uncovered.flyers[0].label, 'L9');
assert.equal(uncovered.flyers[0].title, 'Template L9 is unchanged');
assert(uncovered.flyers[0].unconfigured);
// An entry standing in for a layer it is not named after is marked.
const augmented = previewLayout({
    flyers: [{ xpos: 0, ypos: 0, layer: 'L2', position: 'A1' }],
    layers: ['L1', 'L2'],
    lasers: [{ name: 'F1', color: '#AAA111', enabled: true }],
    wraparound: true
});
assert.equal(augmented.flyers[0].label, 'F1*');
assert.match(augmented.flyers[0].title, /augmented/);
// Discs shrink as the count grows, but never past the legible floor.
assert(previewLayout({ flyers: new Array(4).fill({ xpos: 0, ypos: 0, layer: 'L1' }), layers: ['L1'], lasers: [] }).size >
    previewLayout({ flyers: new Array(400).fill({ xpos: 0, ypos: 0, layer: 'L1' }), layers: ['L1'], lasers: [] }).size);
assert.equal(previewLayout({ flyers: new Array(400).fill({ xpos: 0, ypos: 0, layer: 'L1' }), layers: ['L1'], lasers: [] }).size, 18);
assert.deepEqual(previewLayout().flyers, []);
console.log('Preview layout: flipped axis, degenerate spans, uncovered and augmented layers.');

assert.equal(materialSummary(null), 'Foil IGSNs from Girder');
assert.equal(materialSummary({ name: 'Al', thickness_um: 25, igsn: 'ABC' }), 'Al · 25 µm · ABC');
assert.equal(materialSummary({ name: 'Al' }), 'Al', 'absent parts are dropped, not left as gaps');
assert.equal(templateSummary(null), '');
assert.equal(templateSummary({ layer_count: 3, flyer_count: 25 }), '3 unique layers · 25 physical flyers');
const raw = (value) => value;
assert.match(catalogOptions([{ id: 't', label: 'T', layer_count: 3 }], 'Choose', raw), /T · 3 layers/);
assert.match(catalogOptions([{ id: 'm', label: 'M' }], 'Choose', raw), /<option value="m">M<\/option>/);
assert.match(catalogOptions([], 'Choose', raw), /^<option value="">Choose<\/option>$/);
// Materials were referenced by a legacy id before they were IGSNs, and saved
// configurations still carry those.
const materials = [{ id: 'igsn:1', legacyId: 'AL25' }];
assert.equal(resolveMaterial(materials, 'AL25'), 'igsn:1');
assert.equal(resolveMaterial(materials, 'igsn:1'), 'igsn:1');
assert.equal(resolveMaterial(materials, 'unknown'), 'unknown', 'an unknown foil is shown, not dropped');
assert.equal(resolveMaterial(materials, undefined), '');
console.log('Catalog summaries, options and legacy material resolution passed.');

// The exported shape and the form's shape differ; every saved configuration the
// builder re-opens is the exported one.
assert.deepEqual(toFormShape({
    preset: null,
    run_parameters: { stackid: '00001' },
    laser_parameters: { repeat: 2, import_file: 'x.xlsx', flyers: [{ name: 'F1' }] },
    custom_fields: { a: 1 }
}), {
    preset: null,
    run_params: { stackid: '00001' },
    laser_assignment: { repeat: 2, import_file: 'x.xlsx', flyers: [{ name: 'F1' }] },
    parameter_import_file: 'x.xlsx',
    laser_params: [{ name: 'F1' }],
    custom_fields: { a: 1 },
    custom_field_rows: undefined
});
assert.deepEqual(toFormShape({ run_params: { stackid: '1' } }), { run_params: { stackid: '1' } },
    'the form shape passes through untouched');
assert.deepEqual(toFormShape(null), {});
// `style` is the original vocabulary, and saved files are not rewritten.
assert.deepEqual(layerAssignment({ repeat: 3, wraparound: false }), { repeat: 3, wraparound: false });
assert.deepEqual(layerAssignment({ style: 'repeat', x: 4 }), { repeat: 4, wraparound: true });
assert.deepEqual(layerAssignment({ style: 'exact' }), { repeat: 1, wraparound: false });
assert.deepEqual(layerAssignment({}), { repeat: 1, wraparound: true });
assert.deepEqual(layerAssignment(), { repeat: 1, wraparound: true });
// Rows keep order and keep a named field with no value; the object cannot.
assert.deepEqual(customFieldRows({ custom_field_rows: [{ name: 'b', value: '' }, { name: 'a', value: '1' }] }),
    [{ name: 'b', value: '' }, { name: 'a', value: '1' }]);
assert.deepEqual(customFieldRows({ custom_fields: { a: 1, b: null } }),
    [{ name: 'a', value: 1 }, { name: 'b', value: null }]);
assert.deepEqual(customFieldRows({}), []);
assert.deepEqual(customFieldRows(), []);
// Re-opening keeps each entry's own flag; a foreign import marks them all.
assert.deepEqual(importedLasers({ laser_params: [{ name: 'F1', from_import: true }, { name: 'F2' }] }, true)
    .map((l) => [l.fromImport, l.locked]), [[true, true], [false, false]]);
assert.deepEqual(importedLasers({ laser_params: [{ name: 'F1' }] }, false)
    .map((l) => [l.fromImport, l.locked]), [[true, true]]);
assert.deepEqual(importedLasers({ laser_params: [] }, false), [{ isDefault: true }],
    'a foreign import with no entries still gets one to start from');
assert.deepEqual(importedLasers({ laser_params: [] }, true), [],
    'an empty saved configuration is left empty, because that is what was saved');
assert.equal(importedLasers({ laser_params: new Array(40).fill({ name: 'F' }) }, false).length, 28,
    'the cap applies on the way in as well');
assert.deepEqual(importedLasers(), [{ isDefault: true }]);
console.log('Configuration import: both shapes, legacy assignment, field rows and the cap.');

const needs = { complete: true, warnings: ['w'], status: 'Needs validation' };
assert.equal(statusLabel({ status: needs, acknowledged: false }), 'Needs validation');
assert.equal(statusLabel({ status: needs, acknowledged: true }), 'Validated');
assert.equal(statusLabel({ status: { complete: true, warnings: [], status: 'Complete' }, acknowledged: true }), 'Complete');
assert.equal(statusLabel({ status: { complete: false, warnings: ['w'], status: 'Incomplete' }, acknowledged: true }), 'Incomplete',
    'acknowledging warnings does not make an incomplete form complete');
// A saved configuration says what it is rather than what it would need.
assert.equal(statusLabel({ viewStatus: 'Registered', status: needs, acknowledged: true }), 'Registered');
console.log('Status label: incomplete, needs validation, validated, and read-only.');
