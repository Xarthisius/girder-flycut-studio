/**
 * One laser-parameter entry: a layer's power, speed, pulse and colour.
 *
 * Thin on purpose. The rules that govern an entry are about the *list* it
 * belongs to -- names follow position, colours must be unique across it, the
 * template decides how many of them are used -- so they live in
 * core/laser.js and are applied by LaserCollection.
 *
 * `id` is a crypto.randomUUID assigned by makeLaser and never leaves the
 * browser: configObject() strips it, because the server identifies an entry by
 * its name.
 */
const Backbone = girder.Backbone;

const LaserModel = Backbone.Model.extend({
    idAttribute: 'id',

    /** Whether this entry drives anything, regardless of what the template needs. */
    isEnabled: function () {
        return this.get('enabled') !== false;
    },

    /** An imported entry that has not been edited away from what it imported. */
    isLocked: function () {
        return Boolean(this.get('locked'));
    }
});

export default LaserModel;
