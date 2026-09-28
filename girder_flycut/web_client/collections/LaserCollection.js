/**
 * The laser-parameter entries, in the order they drive the template's layers.
 *
 * This was `state.laserParams`, a plain array that eleven different places
 * mutated and then called renderLasers() by hand. It is the collection's job
 * now: every mutation goes through a method, and the one `reset` it fires is
 * what the list view listens to.
 *
 * The rules stay in core/laser.js and operate on plain objects, which is what
 * keeps them testable without Backbone. `apply()` is the seam: it hands the
 * transform a copy of the list, and resets to whatever comes back. Copies,
 * because those functions mutate what they are given -- that is fine for an
 * array the caller owns, and must not reach into model attributes.
 *
 * A wholesale reset rather than a merge is deliberate. Entries are named for
 * their position, so almost every change renames several of them, and the list
 * is re-rendered as a block either way.
 */
import {
    LASER_LIMIT, acceptColor, applyMaterialDefaults, laserListState, makeLaser,
    moveLaser, normalizeLayerNames, restoreImportedLaser
} from '../core/laser.js';
import LaserModel from '../models/LaserModel.js';

const Backbone = girder.Backbone;

/** Refused because the form cannot describe a stack with no laser at all. */
const LAST_ENTRY = 'At least one laser setting is required.';

const LaserCollection = Backbone.Collection.extend({
    model: LaserModel,

    /** The entries as the plain objects core/laser.js works on. */
    plain: function () {
        return this.toJSON();
    },

    /** Run one of core/laser.js's transforms over the whole list. */
    apply: function (transform) {
        const next = transform(this.plain());
        this.reset(next || []);
        return this;
    },

    /**
     * Add an entry, unless the cap is reached.
     *
     * makeLaser picks the next unused colour, which is why it needs the
     * entries that already exist.
     */
    addEntry: function (values = {}) {
        if (this.length >= LASER_LIMIT) {
            return null;
        }
        const entry = makeLaser(values, this.plain());
        this.add(entry);
        return entry;
    },

    /**
     * Replace every entry.
     *
     * Built one at a time rather than mapped, because makeLaser picks each
     * colour against the ones already chosen -- a map would hand it the raw
     * input, which may carry no colour at all.
     */
    replaceAll: function (entries) {
        const made = [];
        entries.forEach((values) => made.push(makeLaser(values, made)));
        this.apply(() => normalizeLayerNames(made));
    },

    /**
     * Remove one entry, or refuse.
     *
     * @returns {?string} why it was refused, or null if it was removed
     */
    removeEntry: function (id) {
        if (this.length <= 1) {
            return LAST_ENTRY;
        }
        this.apply((lasers) => normalizeLayerNames(lasers.filter((item) => item.id !== id)));
        return null;
    },

    /** Move one entry next to another; every name follows the new order. */
    moveEntry: function (sourceId, targetId, placeAfter) {
        this.apply((lasers) => moveLaser(lasers, sourceId, targetId, placeAfter));
    },

    /** Push a material's or a preset's defaults into entries still marked DEFAULT. */
    applyDefaults: function (material, preset) {
        this.apply((lasers) => applyMaterialDefaults(lasers, material, preset));
    },

    /**
     * Take a colour, if it is well formed and nobody else has it.
     *
     * @returns {{ok: boolean, color: string, message: ?string}} `color` is what
     *   the input should show either way.
     */
    setColor: function (id, value) {
        const decision = acceptColor(this.plain(), id, value);
        if (decision.ok) {
            this.apply((lasers) => {
                lasers.find((item) => item.id === id).color = decision.color;
                return lasers;
            });
        }
        return decision;
    },

    /**
     * Unlock an imported entry for editing, or put back what it imported.
     *
     * One button with two meanings, because those are the only two things
     * worth doing to an entry that came from a workbook.
     */
    toggleLock: function (id) {
        this.apply((lasers) => {
            const laser = lasers.find((item) => item.id === id);
            if (laser.locked) {
                laser.locked = false;
            } else {
                restoreImportedLaser(laser);
            }
            return lasers;
        });
    },

    /** Write one field of one entry, without redrawing the list. */
    setField: function (id, key, value) {
        const laser = this.get(id);
        laser.set(key, value);
        // Typing over a default makes it no longer a default -- except for the
        // name, which nobody types: it follows position.
        if (key !== 'name' && laser.get('isDefault')) {
            laser.set('isDefault', false);
        }
    },

    /** What the list looks like when fitted to a template. */
    listState: function (layerCount, repeat) {
        return laserListState(this.plain(), layerCount, repeat);
    }
});

export { LAST_ENTRY };
export default LaserCollection;
