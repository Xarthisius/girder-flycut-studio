/**
 * Section 01: which stack this is, who is cutting it, out of what, and to
 * which layout.
 *
 * The four values live in the inputs rather than in a model, which is where a
 * form's values live. What the model carries is the catalog they are chosen
 * from, so the pickers repopulate when it loads without this view knowing how
 * it was fetched.
 */
import { catalogOptions, materialSummary, resolveMaterial, templateSummary } from '../core/catalog.js';
import runParametersTemplate from '../templates/runParameters.pug';
import { escapeHtml } from '../util.js';

const View = girder.views.View;

const RunParametersView = View.extend({
    events: {
        'click #autoStackIdBtn': function () { this.trigger('g:autoStackId'); },
        'click #browseTemplateBtn': function () { this.trigger('g:browseTemplate'); },
        'change #foilMaterial': function () {
            this.renderMaterialNote();
            this.trigger('g:material', this.model.material(this.$('#foilMaterial').val()));
        },
        'change #template': function () { this.trigger('g:template'); }
    },

    initialize: function () {
        this.listenTo(this.model, 'change:materials change:templates', this.renderCatalog);
    },

    tagName: 'details',
    className: 'form-section',
    attributes: { open: 'open' },

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(runParametersTemplate());
        }
        this.renderCatalog();
        return this;
    },

    /**
     * Repopulate the two pickers, keeping whatever is selected.
     *
     * The catalog arrives after the form does, and a configuration may have
     * been loaded into the inputs before it lands.
     */
    renderCatalog: function () {
        const material = this.$('#foilMaterial').val();
        const template = this.$('#template').val();
        this.$('#foilMaterial').html(
            catalogOptions(this.model.get('materials'), 'Choose a foil material', escapeHtml));
        this.$('#template').html(
            catalogOptions(this.model.get('templates'), 'Choose a template', escapeHtml));
        this.$('#foilMaterial').val(material);
        this.$('#template').val(template);
        this.$('#operatorNames').html(this.model.get('knownOperators')
            .map((name) => `<option value="${escapeHtml(name)}"></option>`).join(''));
        this.renderMaterialNote();
        this.renderTemplateNote();
    },

    /** Girder could not be reached, so nothing can be chosen. */
    renderUnavailable: function () {
        this.$('#foilMaterial').html('<option value="">Backend unavailable</option>');
        this.$('#template').html('<option value="">Backend unavailable</option>');
    },

    renderMaterialNote: function () {
        this.$('#materialMeta').text(materialSummary(this.model.material(this.$('#foilMaterial').val())));
    },

    renderTemplateNote: function () {
        this.$('#templateMeta').text(templateSummary(this.model.template(this.$('#template').val())));
    },

    /**
     * The three requirements this section owns.
     *
     * The marker on the summary is shown whenever any of them is unmet, so a
     * collapsed section still says it needs attention. The inline error only
     * appears once the form has been submitted -- complaining about an empty
     * field nobody has typed in yet is noise.
     */
    renderErrors: function (result, showErrors) {
        const [stack, , , foil, template] = result.requirements;
        this.$('#stackid').toggleClass('invalid', showErrors && !stack.ok);
        this.$('#stackidError').text(showErrors && !stack.ok ? stack.text : '');
        this.$('#runRequiredMarker').toggleClass('hidden', stack.ok && foil.ok && template.ok);
    },

    values: function () {
        return {
            stackid: this.$('#stackid').val().trim(),
            operator: this.$('#operator').val().trim(),
            foil_material: this.$('#foilMaterial').val(),
            template: this.$('#template').val()
        };
    },

    /** Unvarnished, for the status panel: it complains about what was typed. */
    raw: function () {
        return { stackId: this.$('#stackid').val(), operator: this.$('#operator').val() };
    },

    templateId: function () {
        return this.$('#template').val();
    },

    /** Load a configuration's run parameters into the inputs. */
    fill: function (runParams = {}) {
        this.$('#stackid').val(runParams.stackid ?? '');
        this.$('#operator').val(runParams.operator ?? '');
        this.$('#foilMaterial').val(
            resolveMaterial(this.model.get('materials'), runParams.foil_material));
        this.$('#template').val(runParams.template ?? '');
        this.renderMaterialNote();
        this.renderTemplateNote();
    },

    setOperator: function (login) {
        this.$('#operator').val(login);
    },

    /**
     * Take an assigned Stack ID, and lock the field so it is not typed over.
     *
     * The button is a toggle: pressed means the server chose the value, and
     * unpressing hands the field back.
     */
    setAssignedStackId: function (stackid) {
        this.$('#stackid').val(stackid).prop('readOnly', true);
        this.$('#autoStackIdBtn').attr('aria-pressed', 'true').attr('title', 'Unlock Stack ID');
    },

    /** Hand the Stack ID field back, whether or not it was ever locked. */
    releaseStackId: function (focus = false) {
        this.$('#stackid').prop('readOnly', false);
        this.$('#autoStackIdBtn')
            .attr('aria-pressed', 'false')
            .attr('title', 'Assign lowest available Stack ID');
        if (focus) {
            this.$('#stackid').focus();
        }
    },

    isStackIdAssigned: function () {
        return this.$('#stackid').prop('readOnly');
    },

    /** Select a template the picker did not previously offer. */
    selectTemplate: function (id) {
        this.$('#template').val(id);
    }
});

export default RunParametersView;
