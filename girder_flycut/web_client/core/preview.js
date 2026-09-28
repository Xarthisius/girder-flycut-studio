// Where each flyer sits in the LightBurn recreation, and what it says.
//
// drawPreview() mixed three things: this arithmetic, a template literal, and an
// innerHTML assignment. Only the arithmetic is interesting and none of it was
// ever asserted -- a preview that places every flyer in the same spot looks
// plausible in a screenshot.
import { resolveLaserForLayer } from './laser.js';

// The stage is a percentage box with an 8% margin, so the flyers occupy the
// middle 84%. Disc size shrinks with the count but stays legible.
const MARGIN = 8;
const EXTENT = 84;
const MIN_SIZE = 18;
const MAX_SIZE = 42;
const SIZE_SCALE = 210;

/** A flyer no enabled entry drives keeps the template's own colour. */
const UNCONFIGURED = '#909995';

/**
 * Lay out a template's flyers against the configured laser entries.
 *
 * Positions are percentages of the stage, so the caller does the centring with
 * the returned `size`. The y axis is flipped: LightBurn counts upwards and the
 * document counts down.
 *
 * @param {object} options
 * @param {object[]} options.flyers from the template detail: xpos, ypos, layer, position
 * @param {string[]} options.layers the template's unique layer names, in order
 * @param {object[]} options.lasers the configured entries
 * @param {number} options.repeat how many layers each entry covers
 * @param {boolean} options.wraparound whether entries start again at the first
 * @returns {{size: number, flyers: object[]}}
 */
function previewLayout({ flyers = [], layers = [], lasers = [], repeat = 1, wraparound = false } = {}) {
    if (!flyers.length) {
        return { size: MAX_SIZE, flyers: [] };
    }
    const xs = flyers.map((flyer) => Number(flyer.xpos));
    const ys = flyers.map((flyer) => Number(flyer.ypos));
    const minX = Math.min(...xs);
    const maxY = Math.max(...ys);
    // A single flyer, or a row, has no extent on one axis. Span 1 keeps the
    // division defined and puts it at the origin corner rather than at NaN.
    const spanX = Math.max(Math.max(...xs) - minX, 1);
    const spanY = Math.max(maxY - Math.min(...ys), 1);
    const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, SIZE_SCALE / Math.sqrt(flyers.length)));
    return {
        size,
        flyers: flyers.map((flyer) => {
            const layerIndex = layers.indexOf(String(flyer.layer));
            const { laser, augmented } = resolveLaserForLayer(lasers, layerIndex, { repeat, wraparound });
            return {
                position: flyer.position,
                layer: flyer.layer,
                left: MARGIN + ((Number(flyer.xpos) - minX) / spanX) * EXTENT,
                top: MARGIN + ((maxY - Number(flyer.ypos)) / spanY) * EXTENT,
                color: laser?.color || UNCONFIGURED,
                label: laser ? laser.name + (augmented ? '*' : '') : String(flyer.layer),
                title: laser
                    ? `Template ${flyer.layer} uses ${laser.name}${augmented ? ' (augmented)' : ''}`
                    : `Template ${flyer.layer} is unchanged`,
                unconfigured: !laser
            };
        })
    };
}

export { previewLayout, UNCONFIGURED };
