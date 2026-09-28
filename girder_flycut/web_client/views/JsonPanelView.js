/**
 * The configuration as it will be stored, and a way to take a copy.
 *
 * Copying runs the export gate first: what lands on the clipboard is something
 * the server would have accepted, not a draft that happens to serialise.
 */
import jsonPanelTemplate from '../templates/jsonPanel.html?raw';

const View = girder.views.View;

const JsonPanelView = View.extend({
    events: {
        'click #copyBtn': function () { this.trigger('g:copy'); }
    },

    /**
     * @param {object} settings
     * @param {function} settings.config returns the configuration to show
     */
    initialize: function (settings = {}) {
        this.config = settings.config;
    },

    tagName: 'section',
    id: 'jsonPanel',
    className: 'viewer-panel',
    attributes: { role: 'tabpanel' },

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(jsonPanelTemplate);
        }
        this.$('#jsonOutput').text(JSON.stringify(this.config(), null, 2));
        return this;
    }
});

export default JsonPanelView;
