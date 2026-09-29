/**
 * The Flyer Studio policy screen: workspace folder, the four principal roles,
 * and the visibility flags.
 *
 * Mounted by ConfigView at #plugins/flycut/config -- Decision 4, which 6b
 * landed. Being a view already is what made that promotion a route and a
 * parent rather than a rewrite.
 *
 * It renders in Girder's own plugin-config idiom -- Bootstrap form groups
 * and buttons, no stylesheet of this plugin's own -- because it is an
 * administrator's page in the admin console, not a dashboard screen. That is
 * also why it no longer starts hidden: nothing swaps it with anything.
 */
import adminSettingsTemplate from '../templates/adminSettings.pug';
import { escapeHtml, request } from '../util.js';

const View = girder.views.View;
const ROLES = ['creators', 'owners', 'editors', 'viewers'];
const POLICY_BOOLEANS = [
    'creators_include_user', 'owners_include_user', 'editors_include_user',
    'viewers_include_user', 'public_igsn', 'public_files'
];

const AdminSettingsView = View.extend({
    events: {
        // Typing a path by hand means the browsed folder id no longer describes
        // it, so the server resolves the path instead.
        'input #workspacePath': function () {
            if (this.policy) { this.policy.workspace_folder_id = ''; }
        },
        'click #policyLists button[data-role]': function (event) {
            const button = event.currentTarget;
            this.policy[button.dataset.role].splice(Number(button.dataset.index), 1);
            this.renderPolicyLists();
        },
        'click #findPrincipalsBtn': function () { this.run(() => this.searchPrincipals()); },
        'click #addPrincipalBtn': function () { this.run(() => this.addPrincipal()); },
        'click #browseWorkspaceBtn': function () { this.run(() => this.browseWorkspace()); },
        'click #saveAdminSettingsBtn': function () { this.run(() => this.save()); }
    },

    /**
     * @param {object} settings
     * @param {function} settings.guard wraps an async handler in the shell's
     *   busy flag and error reporting, so a failure here reads the same as a
     *   failure anywhere else on the dashboard
     * @param {function} settings.onSaved called after the policy is written,
     *   so the shell can re-read the configurations it governs
     */
    initialize: function (settings = {}) {
        this.guard = settings.guard || ((fn) => fn);
        this.onSaved = settings.onSaved || (() => {});
        this.policy = null;
        this.principals = [];
    },

    tagName: 'div',
    id: 'adminSettingsScreen',
    className: 'g-flycut-settings',

    render: function () {
        this.$el.html(adminSettingsTemplate());
        return this;
    },

    /** Run an async handler under the shell's busy flag. */
    run: function (fn) {
        return this.guard(fn)();
    },

    /** Load the policy and announce that the screen is ready to show. */
    open: function () {
        return this.run(async () => {
            const result = await request('settings');
            this.policy = result.settings;
            this.$('#workspacePath').val(this.policy.workspace_path);
            this.$('#workspaceCollection').html(result.collections
                .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join(''));
            if (result.workspaceCollectionId) {
                this.$('#workspaceCollection').val(result.workspaceCollectionId);
            }
            POLICY_BOOLEANS.forEach((key) => {
                this.$('#' + key).prop('checked', this.policy[key]);
            });
            this.renderPolicyLists();
            await this.searchPrincipals();
            this.$('#settingsStatus').text('');
            this.trigger('g:open');
        });
    },

    renderPolicyLists: function () {
        this.$('#policyLists').html(ROLES.map((role) => {
            const entries = this.policy[role].map((ref, index) =>
                `<li class="list-group-item">${escapeHtml(ref.label || ref.id)} (${ref.type}) ` +
                `<button type="button" class="btn btn-xs btn-default" data-role="${role}" ` +
                `data-index="${index}">Remove</button></li>`).join('') ||
                '<li class="list-group-item">None</li>';
            return `<h5>${role[0].toUpperCase() + role.slice(1)}</h5>` +
                `<ul class="list-group">${entries}</ul>`;
        }).join(''));
    },

    searchPrincipals: async function () {
        this.principals = await request('settings/principals', 'GET',
            { q: this.$('#principalSearch').val() });
        this.$('#principalResults').html(this.principals.map((ref, index) =>
            `<option value="${index}">${escapeHtml(ref.label)} (${ref.type})</option>`).join(''));
    },

    addPrincipal: async function () {
        const ref = this.principals[Number(this.$('#principalResults').val())];
        if (!ref) {
            return;
        }
        const role = this.$('#principalRole').val();
        const already = this.policy[role]
            .some((entry) => entry.id === ref.id && entry.type === ref.type);
        if (!already) {
            this.policy[role].push(ref);
        }
        this.renderPolicyLists();
    },

    browseWorkspace: async function () {
        const id = this.$('#workspaceCollection').val();
        if (!id) {
            throw new Error('Create a collection and workspace folder in Girder first.');
        }
        const root = new girder.models.CollectionModel({ _id: id });
        await root.fetch();
        let selected;
        const picker = new girder.views.widgets.BrowserWidget({
            parentView: this,
            root,
            showItems: false,
            titleText: 'Choose a workspace folder',
            submitText: 'Use folder',
            validate: async (model) => {
                if (model?.resourceName !== 'folder') {
                    throw 'Choose a folder inside the collection.';
                }
                selected = await request('settings/workspace', 'GET', { id: model.id });
            }
        });
        this.listenTo(picker, 'g:saved', () => {
            this.policy.workspace_folder_id = selected.id;
            this.$('#workspacePath').val(selected.path);
        });
        // Girder's dialogs live outside the dashboard, in the app's own
        // container. That was a shadow-root exception once; it is simply where
        // modals go.
        picker.setElement(document.querySelector('#g-dialog-container')).render();
    },

    save: async function () {
        this.policy.workspace_path = this.$('#workspacePath').val().trim();
        POLICY_BOOLEANS.forEach((key) => {
            this.policy[key] = this.$('#' + key).prop('checked');
        });
        const result = await request('settings', 'PUT',
            { settings: JSON.stringify(this.policy) });
        this.policy = result.settings;
        this.$('#workspacePath').val(this.policy.workspace_path);
        this.$('#settingsStatus').text('Settings saved. New data will use this policy.');
        await this.onSaved();
    }
});

export default AdminSettingsView;
