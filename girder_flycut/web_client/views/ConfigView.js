/**
 * The Flyer Studio plugin config page, at #plugins/flycut/config.
 *
 * Decision 4: the policy screen is an administrator's page in Girder's own
 * plugin config area, not a hidden button inside a dashboard that operators
 * use. This view is only the frame -- the breadcrumb and a container.
 * AdminSettingsView is the screen, which is why 4d made it a view.
 *
 * Nothing here carries `.g-flycut-dashboard`, and neither view imports a
 * stylesheet. The dashboard's look belongs to the dashboard; a plugin config
 * page should look like every other one in the admin console, which means
 * Girder's own Bootstrap classes and no CSS of ours.
 */
import configViewTemplate from '../templates/configView.pug';
import AdminSettingsView from './AdminSettingsView.js';

const View = girder.views.View;
const PluginConfigBreadcrumbWidget = girder.views.widgets.PluginConfigBreadcrumbWidget;

const ConfigView = View.extend({
    initialize: function () {
        this.busy = false;
        this.settingsView = new AdminSettingsView({
            parentView: this,
            // The dashboard shell's guard greys out topbar controls this page
            // has not got, so this is the same contract with only the parts
            // that apply: one request at a time, and errors said out loud
            // rather than swallowed.
            guard: (fn) => async () => {
                if (this.busy) return;
                this.busy = true;
                try {
                    await fn();
                } catch (error) {
                    this.settingsView.$('#settingsStatus').text(error.message);
                } finally {
                    this.busy = false;
                }
            }
        });
        // Girder's `g:navigateTo` constructs the view and sets its el, but does
        // not render it -- a view reached by a route renders itself.
        this.render();
    },

    render: function () {
        this.$el.html(configViewTemplate());
        new PluginConfigBreadcrumbWidget({
            pluginName: 'Flyer Studio',
            el: this.$('.g-config-breadcrumb-container'),
            parentView: this
        }).render();
        this.$('.g-flycut-config').append(this.settingsView.render().el);
        this.settingsView.open();
        return this;
    }
});

export default ConfigView;
