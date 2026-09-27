// Requirements, warnings and the export gate.
//
// Was tests/status.cjs, which sliced these functions out of app.js by string
// offsets and eval'd them with `new Function`. They are imported now: renaming
// one breaks the import loudly instead of silently emptying the test.
import assert from 'node:assert/strict';

import { assessConfiguration as assess } from '../girder_flycut/web_client/core/assess.js';
import { restoreImportedLaser } from '../girder_flycut/web_client/core/laser.js';
import { exportDecision } from '../girder_flycut/web_client/core/validate.js';

const base = {
    foilMaterial: 'foil',
    template: 'template',
    stackId: '00005',
    operator: 'alice',
    lasers: [{ enabled: true, isDefault: false }],
    fields: [],
    layers: ['F1'],
    repeat: 1,
    wraparound: true
};

assert.equal(assess(base).status, 'Complete');
assert.equal(assess({ ...base, stackId: '' }).status, 'Incomplete');
assert.equal(assess({ ...base, lasers: [{ enabled: false }] }).status, 'Incomplete');
assert.equal(assess({ ...base, fields: [{ name: '', value: '3' }] }).status, 'Incomplete');
for (const stackId of ['F123', 'F1234', '0AZ9Z']) {
    assert.equal(assess({ ...base, stackId }).status, 'Complete');
}
for (const stackId of ['bad id', 'OOOOO', 'F12', 'abcde', '123456', 'F１２３']) {
    assert.equal(assess({ ...base, stackId }).status, 'Incomplete');
}
for (const changes of [
    { operator: '' },
    { lasers: [{ enabled: true, isDefault: true }] },
    { wraparound: false, layers: ['F1', 'F2'] },
    { lasers: [{ enabled: true }, { enabled: false }] },
    { lasers: [{ enabled: true }, { enabled: true }] },
    { fields: [{ name: 'thickness', value: '' }] }
]) {
    assert.equal(assess({ ...base, ...changes }).status, 'Needs validation');
}
assert.equal(assess({ ...base, fields: [{ name: '', value: '' }] }).status, 'Complete');
console.log('Status requirements, all six warnings, and legacy/Crockford formats passed.');

// The gate used to be exercised by eval'ing confirmExport() with five stubs for
// its DOM and toast calls. Its decision is a pure function now.
const gate = (status, acknowledged) => exportDecision(status, acknowledged).ok;

assert.equal(gate(assess({ ...base, stackId: '' }), true), false);
assert.equal(gate(assess({ ...base, operator: '' }), false), false);
assert.equal(gate(assess({ ...base, operator: '' }), true), true);
assert.equal(gate(assess(base), true), true);
for (const stackId of ['bad id', 'OOOOO', 'F12', 'abcde', '123456', 'F１２３']) {
    assert.equal(gate(assess({ ...base, stackId }), true), false);
}
assert.equal(exportDecision(assess({ ...base, stackId: '' }), true).focus, 'status');
assert.equal(exportDecision(assess({ ...base, operator: '' }), false).focus, 'acknowledgement');
console.log('Export gate blocks incomplete data and requires warning confirmation.');

assert.equal(assess({ ...base, foilMaterial: '' }).status, 'Incomplete');
assert.equal(assess({ ...base, template: '' }).status, 'Incomplete');
assert.equal(assess(base).violations.length, 0);
assert.equal(assess({ ...base, operator: '' }).violations[0].target, '#operator');

assert.equal(assess({ ...base, duplicateStack: true }).status, 'Needs validation');
assert.equal(assess({ ...base, duplicateStack: true }).violations[0].target, '#stackid');
assert.equal(gate(assess({ ...base, duplicateStack: true }), false), false);

for (const stackState of ['generated', 'registered', 'restricted']) {
    const blocked = assess({ ...base, duplicateStack: true, stackState });
    assert.equal(blocked.status, 'Incomplete');
    assert.equal(gate(blocked, true), false);
}

const imported = { enabled: false, locked: false, power: 12, importOriginal: { power: 60 } };
restoreImportedLaser(imported);
assert.equal(imported.enabled, true);
assert.equal(imported.locked, true);
assert.equal(imported.power, 60);

assert.equal(assess({ ...base, presetFields: ['glass_tl_mm'] }).status, 'Incomplete');
assert.equal(
    assess({ ...base, presetFields: ['glass_tl_mm'], fields: [{ name: 'glass_tl_mm', value: '' }] }).status,
    'Needs validation');
console.log('Preset fields, duplicate stacks and import restore passed.');
