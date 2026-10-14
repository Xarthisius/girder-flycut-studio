/** Configuration JSON can be copied or downloaded before submission. */
import jsonPanelTemplate from '../templates/jsonPanel.pug';
import '../stylesheets/jsonPanel.styl';

const View = girder.views.View;

const JsonPanelView = View.extend({
    events: {
        'click #copyBtn': function () { this.trigger('g:copy'); },
        'click #downloadBtn': 'download'
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

    download: function () {
        const url = URL.createObjectURL(new Blob([JSON.stringify(this.config(), null, 2)], {
            type: 'application/json'
        }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'config.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(jsonPanelTemplate());
        }
        this.$('#jsonOutput').text(JSON.stringify(this.config(), null, 2));
        return this;
    }
});

export default JsonPanelView;
