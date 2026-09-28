/**
 * Section 03: metadata the form does not have a field for.
 *
 * Rows rather than a name/value object, because order matters while typing and
 * a named row with no value has to survive a redraw -- the object form loses
 * both.
 *
 * A preset may require particular fields. Those rows cannot be renamed or
 * removed, which is the only thing that makes this more than a list.
 */
import customFieldsTemplate from '../templates/customFields.html?raw';
import { escapeHtml } from '../util.js';

const View = girder.views.View;
/** More than a few suggestions stops being a suggestion. */
const SUGGESTIONS = 3;

const CustomFieldsView = View.extend({
    events: {
        'click #addCustomBtn': function () {
            this.collection.addRow();
            this.trigger('g:changed');
        },
        'click .remove-custom': function (event) {
            const id = event.target.closest('.custom-row').dataset.id;
            if (this.model.presetFieldNames().includes(this.collection.get(id)?.get('name'))) {
                return;
            }
            this.collection.remove(id);
            this.trigger('g:changed');
        },
        'click .recommend-field': function (event) {
            this.collection.addRow(event.currentTarget.dataset.field);
            this.trigger('g:changed');
        },
        'input .custom-row [data-key]': function (event) {
            const row = event.target.closest('.custom-row');
            this.collection.get(row.dataset.id).set(event.target.dataset.key, event.target.value);
            // Naming a row may retire a suggestion, but rewriting the rows
            // while one is being typed in would lose the caret.
            this.renderRecommendations();
            this.trigger('g:changed');
        }
    },

    initialize: function () {
        this.listenTo(this.collection, 'reset add remove', this.render);
        this.listenTo(this.model, 'change:knownFieldNames', this.render);
    },

    tagName: 'details',
    className: 'form-section',
    attributes: { open: 'open' },

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(customFieldsTemplate);
        }
        const required = this.model.presetFieldNames();
        this.$('#customList').html(this.collection.map((row) => {
            const fixed = required.includes(row.get('name'));
            return `
        <div class="custom-row" data-id="${row.id}"><label>Field name<input data-key="name" ${fixed ? 'readonly' : ''} list="customFieldNames" autocomplete="off" value="${escapeHtml(row.get('name'))}" placeholder="e.g. batch_code"></label><label>Value<input data-key="value" value="${escapeHtml(row.get('value'))}" placeholder="Enter a value"></label><button class="remove-btn remove-custom ${fixed ? 'hidden' : ''}" type="button" aria-label="Remove custom field">×</button></div>`;
        }).join(''));
        const count = this.collection.length;
        this.$('#customCount').text(`${count} field${count === 1 ? '' : 's'}`);
        this.$('#customFieldNames').html(this.model.get('knownFieldNames')
            .map((name) => `<option value="${escapeHtml(name)}"></option>`).join(''));
        this.renderRecommendations();
        return this;
    },

    /** Field names this operator has used before and has not used here yet. */
    renderRecommendations: function () {
        const used = this.collection.names();
        this.$('#fieldRecommendations').html(this.model.get('knownFieldNames')
            .filter((name) => !used.has(name))
            .slice(0, SUGGESTIONS)
            .map((name) =>
                `<button type="button" class="recommend-field" data-field="${escapeHtml(name)}">＋ ${escapeHtml(name)}</button>`)
            .join(''));
    },

    /**
     * The one requirement this section owns, plus the rows that break it.
     *
     * A value with no name is the error; a name with no value is only a
     * warning, because it exports as null on purpose.
     */
    renderErrors: function (result, showErrors) {
        this.$('#customError').text(showErrors && !result.requirements[2].ok
            ? 'Custom fields with values need names.'
            : '');
        this.$('.custom-row').each((index, node) => {
            const row = this.collection.get(node.dataset.id);
            this.$("[data-key='name']", node)
                .toggleClass('invalid', showErrors && row.hasValue() && !row.isNamed());
            this.$("[data-key='value']", node).removeClass('invalid');
        });
    }
});

export default CustomFieldsView;
