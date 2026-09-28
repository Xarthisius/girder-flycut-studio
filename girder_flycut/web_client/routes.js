/**
 * The plugin's Girder routes.
 *
 * `exposePluginConfig` is what puts the gear link on #plugins; the route is
 * what that link goes to. Imported by main.js for the side effect, because a
 * route nobody imports is not registered.
 */
import ConfigView from './views/ConfigView.js';

const router = girder.router;
const events = girder.events;
const { exposePluginConfig } = girder.utilities.PluginUtils;

exposePluginConfig('flycut', 'plugins/flycut/config');

router.route('plugins/flycut/config', 'flycutConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});
