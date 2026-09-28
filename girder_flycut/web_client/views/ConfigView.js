/**
 * The Flyer Studio plugin config page, at #plugins/flycut/config.
 *
 * Decision 4: the policy screen is an administrator's page in Girder's own
 * plugin config area, not a hidden button inside a dashboard that operators
 * use. This view is only the frame -- the breadcrumb, a wrapper and a status
 * line. AdminSettingsView is the screen, unchanged, which is why 4d made it a
 * view in the first place.
 *
 * The wrapper keeps `.g-flycut-dashboard`. That class is not decoration: the
 * whole stylesheet is scoped under it (Decision 1 dropped the shadow root), so
 * without it the screen renders unstyled.
 */
import configViewTemplate from '../templates/configView.pug';
import '../stylesheets/dashboard.styl';
import '../stylesheets/configView.styl';
import AdminSettingsView from './AdminSettingsView.js';

const View = girder.views.View;
const PluginConfigBreadcrumbWidget = girder.views.widgets.PluginConfigBreadcrumbWidget;

const ConfigView = View.extend({
    initialize: function () {
        this.busy = false;
        this.settingsView = new AdminSettingsView({
            parentView: this,
            // The shell's guard greys out topbar controls this page has not
            // got, so this is the same contract with only the parts that apply:
            // one request at a time, and errors said out loud rather than
            // swallowed.
            guard: (fn) => async () => {
                if (this.busy) return;
                this.busy = true;
                try {
                    await fn();
                    this.$('#configStatus').text('');
                } catch (error) {
                    this.$('#configStatus').text(error.message);
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
        // AdminSettingsView starts hidden because the shell shows one screen at
        // a time. Here it is the only one.
        this.settingsView.$el.removeClass('hidden');
        this.settingsView.open();
        return this;
    }
});

export default ConfigView;
