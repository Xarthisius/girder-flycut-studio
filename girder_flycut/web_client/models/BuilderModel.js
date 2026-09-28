/**
 * Everything the builder knows that is not a form field or a list entry.
 *
 * This was the rest of `state`: the Girder catalog, the template that is
 * chosen, the preview's zoom, and the bookkeeping the status panel checks a
 * Stack ID against. Attributes rather than closure variables, so the three
 * viewer panels can listen instead of being redrawn by hand from eleven call
 * sites.
 *
 * The form's own values are not here. They live in the inputs, which is where
 * a form's values live; RunParametersView reads them out on demand.
 */
const Backbone = girder.Backbone;

const BuilderModel = Backbone.Model.extend({
    defaults: function () {
        return {
            // The Girder catalog: what may be chosen.
            materials: [],
            templates: [],
            presets: [],
            preset: null,
            // The chosen template's layers and flyer positions, or null.
            templateDetail: null,
            // Where the laser entries came from, if they were imported.
            parameterImportFile: null,
            // Preview scale, 0.6 to 1.5.
            zoom: 1,
            // Autocomplete, from the operator's own past configurations.
            knownOperators: [],
            knownFieldNames: [],
            // What the status panel checks a Stack ID against.
            submittedStackIds: [],
            stackStates: {},
            // Set while showing a configuration that may not be edited; it
            // makes the status panel report the lifecycle stage instead of
            // what the form would still need.
            viewStatus: null
        };
    },

    /** How many unique layers the chosen template has, or null for none. */
    layerCount: function () {
        return this.get('templateDetail')?.layers?.length ?? null;
    },

    /** The preset currently in force, if any. */
    activePreset: function () {
        return this.get('presets').find((entry) => entry.id === this.get('preset'));
    },

    /** Custom fields a preset requires, which cannot be renamed or removed. */
    presetFieldNames: function () {
        return Object.keys(this.activePreset()?.custom_fields || {});
    },

    material: function (id) {
        return this.get('materials').find((item) => item.id === id);
    },

    template: function (id) {
        return this.get('templates').find((item) => item.id === id);
    },

    /**
     * Remember a template that came from the portal rather than the catalog.
     *
     * Browsing to one adds it to the picker for this session; it is referenced
     * by a `girder:` id and re-fetched by id when the configuration reopens.
     */
    addTemplate: function (detail) {
        if (this.template(detail.id)) {
            return false;
        }
        this.set('templates', [...this.get('templates'), detail]);
        return true;
    },

    /** Clamped, because the preview stops being readable outside this range. */
    setZoom: function (zoom) {
        this.set('zoom', Math.max(0.6, Math.min(1.5, zoom)));
    }
});

export default BuilderModel;
