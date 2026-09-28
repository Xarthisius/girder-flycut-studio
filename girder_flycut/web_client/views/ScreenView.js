/**
 * What the four workflow screens have in common.
 *
 * Each is a <section> the shell shows and hides by id, renders its own markup
 * once, listens to the shared workflow model, and applies a control description
 * from core/workflow.js. The description is the point: the rules live in core
 * and every screen's state pass is the same loop.
 *
 * Rendering is split in two because the two halves have different costs.
 * renderContent() rebuilds <option> markup and is driven by the records;
 * renderState() only writes labels and flags and is driven by `busy`, which
 * changes twice for every request. Rebuilding a picker's options each time a
 * button greys out would throw away the user's selection mid-interaction.
 */
import { escapeHtml } from '../util.js';

const View = girder.views.View;

const ScreenView = View.extend({
    /**
     * @param {object} settings
     * @param {function} settings.guard wraps an async handler in the shell's
     *   busy flag and error reporting
     * @param {function} settings.onChanged awaited after this screen changes a
     *   configuration on the server, so the shell can re-read and report
     */
    initialize: function (settings = {}) {
        this.guard = settings.guard || ((fn) => fn);
        this.onChanged = settings.onChanged || (() => {});
        this.listenTo(this.model,
            'change:saved change:activeConfig change:completeWorkflow', this.render);
        this.listenTo(this.model, 'change:busy', this.renderState);
    },

    tagName: 'section',
    className: 'workflow-home hidden',

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(this.template);
            this.onFirstRender();
        }
        this.renderContent();
        this.renderState();
        return this;
    },

    /** Once, when the markup first exists. */
    onFirstRender: function () {},

    /** Options and labels that follow the records. Screens with none skip it. */
    renderContent: function () {},

    renderState: function () {
        this.applyState(this.state());
    },

    /**
     * Write one of core/workflow.js's states onto this screen's controls.
     *
     * A selector that matches nothing is a programming error rather than a
     * no-op: it means a screen was handed a control it does not own, which is
     * exactly what a `querySelector` returning null used to hide.
     */
    applyState: function (controls) {
        for (const [selector, spec] of Object.entries(controls)) {
            const node = this.$(selector);
            if (!node.length) {
                throw new Error(`${this.id} has no ${selector} to apply state to`);
            }
            if ('text' in spec) { node.text(spec.text); }
            if ('disabled' in spec) { node.prop('disabled', spec.disabled); }
            if ('hidden' in spec) { node.toggleClass('hidden', spec.hidden); }
            if ('href' in spec) { node.attr('href', spec.href); }
        }
    },

    /** Run an async handler under the shell's busy guard. */
    run: function (fn) {
        return this.guard(fn)();
    },

    /**
     * Repopulate a picker, keeping its selection if it is still on offer.
     *
     * The markup is rebuilt from scratch -- a record can change lifecycle stage
     * and has to move between optgroups -- so the selection is re-applied
     * afterwards rather than surviving.
     */
    fillPicker: function (selector, markup, selected) {
        this.$(selector).html(markup).val(selected);
    },

    escapeHtml: escapeHtml
});

export default ScreenView;
