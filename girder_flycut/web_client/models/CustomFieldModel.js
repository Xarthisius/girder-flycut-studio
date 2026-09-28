/**
 * One custom metadata field: a name and a value, both free text.
 *
 * The row is the unit rather than the pair, because a field may legitimately
 * have a name and no value -- it exports as null -- and the object form the
 * server stores cannot express the order they were entered in.
 */
const Backbone = girder.Backbone;

const CustomFieldModel = Backbone.Model.extend({
    defaults: function () {
        return { name: '', value: '' };
    },

    idAttribute: 'id',

    /** A field with a value but no name is what the status panel complains about. */
    isNamed: function () {
        return Boolean(String(this.get('name')).trim());
    },

    hasValue: function () {
        return Boolean(String(this.get('value') ?? '').trim());
    }
});

export default CustomFieldModel;
