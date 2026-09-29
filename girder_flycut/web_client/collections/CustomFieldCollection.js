/**
 * The custom metadata rows, in the order they were entered.
 *
 * This was `state.customFields`. Order is the reason it is a list rather than
 * the object the server stores: two rows may share a name while one is being
 * typed, and a named row with no value has to survive a redraw.
 */
import CustomFieldModel from '../models/CustomFieldModel.js';

const Backbone = girder.Backbone;

const CustomFieldCollection = Backbone.Collection.extend({
    model: CustomFieldModel,

    /** The rows as plain objects, which is what core/assess.js reads. */
    plain: function () {
        return this.toJSON();
    },

    /** A blank row, ready to type into. */
    addRow: function (name = '', value = '') {
        this.add({ id: crypto.randomUUID(), name, value });
    },

    /** Replace every row, assigning the ids the DOM addresses them by. */
    replaceAll: function (rows) {
        this.reset(rows.map(({ name, value }) => ({
            id: crypto.randomUUID(), name, value: String(value ?? '')
        })));
    },

    /**
     * The object the configuration carries: named rows only, and an empty
     * value becomes null rather than an empty string.
     */
    asObject: function () {
        const fields = {};
        this.forEach((row) => {
            if (row.isNamed()) {
                fields[String(row.get('name')).trim()] = row.hasValue() ? row.get('value') : null;
            }
        });
        return fields;
    },

    /** Name and value of every row, which is what preserves order on reload. */
    asRows: function () {
        return this.map((row) => ({ name: row.get('name'), value: row.get('value') }));
    },

    /** The names already in use, so a recommendation is not offered twice. */
    names: function () {
        return new Set(this.map((row) => String(row.get('name')).trim()).filter(Boolean));
    }
});

export default CustomFieldCollection;
