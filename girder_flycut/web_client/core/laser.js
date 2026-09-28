// Laser-entry construction and the restore-from-import rule.
//
// makeLaser read `state.laserParams` and the module-level `palette` directly.
// Both are parameters now, which is the whole reason it can be exercised
// without standing up the builder.
export const PALETTE = ['#e6194b', '#3c8d40', '#4363d8', '#e86818', '#911eb4', '#0075b5', '#c51eb8', '#24877f', '#9a6324', '#800000', '#737300', '#000075', '#666666', '#c9143c', '#006400', '#0000cd', '#d83b00', '#6a0dad', '#007878', '#a91270', '#2f4f4f', '#8b4513', '#4b0082', '#b22222', '#228b22', '#1674c5', '#b85c16', '#526574'];

export function makeLaser(values = {}, existing = [], palette = PALETTE) {
    const index = existing.length;
    const usedColors = new Set(existing.map((item) => item.color.toLowerCase()));
    const nextColor = /^#[0-9a-f]{6}$/i.test(values.color || '') && !usedColors.has(values.color.toLowerCase()) ? values.color : palette.find((color) => !usedColors.has(color.toLowerCase())) || palette[index];
    const laser = { id: crypto.randomUUID(), enabled: values.enabled !== false, name: `F${index + 1}`, color: nextColor, power: values.power ?? 60, speed: values.speed ?? 100, qpulsewidth: values.qpulsewidth ?? 200, frequency: values.frequency ?? 100, passes: values.passes ?? 1, fromImport: values.fromImport ?? false, locked: values.locked ?? false, importOriginal: values.importOriginal ?? null, isDefault: values.isDefault ?? values.is_default ?? false };
    if (laser.fromImport && !laser.importOriginal) laser.importOriginal = { power: Number(laser.power), speed: Number(laser.speed), qpulsewidth: Number(laser.qpulsewidth), frequency: Number(laser.frequency), passes: Number(laser.passes) };
    return laser;
}

export function restoreImportedLaser(laser) {
    Object.assign(laser, laser.importOriginal);
    laser.enabled = true;
    laser.locked = true;
}

/** At most this many laser entries; the form refuses to add more. */
export const LASER_LIMIT = 28;

/** Entries are named for their position, so any reorder renames all of them. */
export function normalizeLayerNames(lasers) {
    lasers.forEach((laser, index) => { laser.name = `F${index + 1}`; });
    return lasers;
}

/**
 * Move one entry next to another, renaming to match the new order.
 * A preset wins over the material, which is why both are passed in.
 */
export function moveLaser(lasers, sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return lasers;
    const sourceIndex = lasers.findIndex((laser) => laser.id === sourceId);
    if (sourceIndex < 0) return lasers;
    const [moved] = lasers.splice(sourceIndex, 1);
    const targetIndex = lasers.findIndex((laser) => laser.id === targetId);
    lasers.splice(targetIndex + (placeAfter ? 1 : 0), 0, moved);
    return normalizeLayerNames(lasers);
}

/** Apply a preset's or a material's defaults to entries still marked DEFAULT. */
export function applyMaterialDefaults(lasers, material, preset) {
    const defaulted = lasers.filter((laser) => laser.isDefault);
    if (preset) {
        defaulted.forEach((laser) => Object.assign(laser, preset.laser_defaults));
        return lasers;
    }
    const defaults = material?.laser_defaults;
    if (!defaults) return lasers;
    defaulted.forEach((laser) => {
        laser.power = defaults.maxPower ?? laser.power;
        laser.speed = defaults.speed ?? laser.speed;
        laser.qpulsewidth = defaults.QPulseWidth ?? laser.qpulsewidth;
        laser.frequency = defaults.frequency ?? laser.frequency;
        laser.passes = defaults.numPasses ?? laser.passes;
    });
    return lasers;
}

/** How many entries a template of `layerCount` layers actually consumes. */
export function usedLaserCount(lasers, layerCount, repeat) {
    if (layerCount === null) return null;
    return Math.min(lasers.length, Math.ceil(layerCount / Math.max(1, repeat || 1)));
}

/**
 * Which entry drives a given template layer.
 *
 * `augmented` means the entry is standing in for a layer it is not named
 * after, which the preview marks with an asterisk.
 */
export function resolveLaserForLayer(lasers, layerIndex, { repeat, wraparound }) {
    const total = lasers.length;
    if (!total) return { laser: null, augmented: false };
    let laserIndex = Math.floor(layerIndex / Math.max(1, repeat || 1));
    if (wraparound) laserIndex %= total;
    const setting = lasers[laserIndex];
    const laser = setting?.enabled !== false ? setting || null : null;
    return { laser, augmented: Boolean(laser && laser.name !== `F${layerIndex + 1}`) };
}

/**
 * What the laser list looks like, given the template it is being fitted to.
 *
 * An entry is "overflow" when the template has no layer left for it, and
 * "unused" when it is overflow or switched off -- the card is greyed either
 * way, but only overflow disables its checkbox, because the enabled state is
 * restored if the row fits again later.
 *
 * @returns {{cards: {overflow: boolean, unused: boolean}[], count: string,
 *   addDisabled: boolean, surplus: boolean, addTitle: string, error: string}}
 */
export function laserListState(lasers, layerCount = null, repeat = 1) {
    const used = usedLaserCount(lasers, layerCount, repeat);
    const surplus = layerCount !== null && lasers.length >= layerCount;
    return {
        cards: lasers.map((laser, index) => {
            const overflow = used !== null && index >= used;
            return { overflow, unused: overflow || laser.enabled === false };
        }),
        count: `${lasers.length} / ${layerCount ?? '—'}`,
        addDisabled: lasers.length >= LASER_LIMIT,
        surplus,
        addTitle: surplus
            ? 'Additional settings will be unused by this template'
            : 'Add the next layer setting',
        error: lasers.length ? '' : 'At least one laser setting is required.'
    };
}

export const COLOR_REJECTED = 'Use a unique six-digit hex color, such as #3C8D40.';

/**
 * Whether an entry may take a colour, and in what form.
 *
 * Colours are how the preview and the generated LightBurn file tell layers
 * apart, so two entries sharing one would silently merge them.
 *
 * @returns {{ok: boolean, color: string, message: ?string}} `color` is what the
 *   input should show either way -- the accepted value, or the old one back.
 */
export function acceptColor(lasers, laserId, value) {
    const laser = lasers.find((item) => item.id === laserId);
    const candidate = String(value).trim();
    const taken = lasers.some((item) =>
        item.id !== laserId && item.color.toLowerCase() === candidate.toLowerCase());
    if (!/^#[0-9a-f]{6}$/i.test(candidate) || taken) {
        return { ok: false, color: laser.color, message: COLOR_REJECTED };
    }
    return { ok: true, color: candidate.toUpperCase(), message: null };
}
