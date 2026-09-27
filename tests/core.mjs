// The laser-assignment rules, exercised directly.
//
// These lived in builder.js reading `state.laserParams` and two form controls,
// so the only way to reach them was through a rendered page. They take their
// inputs now, which is the whole reason this file can exist.
import assert from 'node:assert/strict';

import {
    LASER_LIMIT, applyMaterialDefaults, makeLaser, moveLaser,
    normalizeLayerNames, resolveLaserForLayer, usedLaserCount
} from '../girder_flycut/web_client/core/laser.js';

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
