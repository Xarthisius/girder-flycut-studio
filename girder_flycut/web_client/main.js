/**
 * Flyer Studio dashboard shell.
 *
 * Every screen is a view now: four workflow screens over a WorkflowModel, the
 * admin policy screen, and the builder over a BuilderModel and two collections.
 * What is left here is the chrome they sit in -- which screen is showing, the
 * status line, the busy guard -- and the lifecycle that moves a configuration
 * between them, which is the one thing that is genuinely nobody's screen.
 *
 * The markup is one plain file per view. Two are still concatenated here: the
 * topbar and the status line have no view of their own, because neither is a
 * screen. The stylesheet is imported for its side effect: Vite emits it as
 * style.css and load() registers it, which is why it is scoped under
 * .g-flycut-dashboard rather than relying on a shadow root.
 */
import CustomFieldCollection from './collections/CustomFieldCollection.js';
import LaserCollection from './collections/LaserCollection.js';
import { savedTime } from './core/records.js';
import { runSubmission } from './core/submit.js';
import { keepsActiveConfig } from './core/workflow.js';
import BuilderModel from './models/BuilderModel.js';
import WorkflowModel from './models/WorkflowModel.js';
import './styles/dashboard.css';
import statusBarTemplate from './templates/statusBar.html?raw';
import topbarTemplate from './templates/topbar.html?raw';
import { ask, escapeHtml, request } from './util.js';
import AdminSettingsView from './views/AdminSettingsView.js';
import ConfigBuilderView from './views/ConfigBuilderView.js';
import ConfigurationPickerView from './views/ConfigurationPickerView.js';
import GenerationPickerView from './views/GenerationPickerView.js';
import RegistrationPickerView from './views/RegistrationPickerView.js';
import WorkflowHomeView from './views/WorkflowHomeView.js';

const View = girder.views.View;
/** Every screen, which is what showScreen() hides all but one of. */
const SCREEN_IDS = [
    'workflowHome', 'configurationPicker', 'lightburnPicker', 'registrationPicker',
    'builderScreen', 'adminSettingsScreen'
];
const PAGE_LABELS = {
    workflowHome: 'Home',
    configurationPicker: 'Configuration',
    lightburnPicker: 'Generation',
    registrationPicker: 'Registration',
    adminSettingsScreen: 'Settings'
};

const Dashboard = View.extend({
    render: function () {
        this.el.replaceChildren();
        const currentUser = girder.auth.getCurrentUser();
        if (!currentUser) {
            this.el.textContent = 'Sign in to Girder to use Flyer Studio.';
            return this;
        }
        // Decision 1 dropped the shadow root. The dashboard is ordinary light DOM
        // under one plugin-scoped class now, which is what lets Girder's own
        // widgets compose with it -- BrowserWidget always had to be mounted
        // outside the shadow root, and that exception becomes the normal case.
        const mount = document.createElement('div');
        mount.className = 'g-flycut-dashboard';
        // The screens are inserted between these, so the document order stays
        // topbar, the four workflow screens, the status line, the admin screen,
        // the builder -- the order the one markup file used to have.
        mount.innerHTML = topbarTemplate + statusBarTemplate;
        this.el.append(mount);
        this.ready = this.start(mount, currentUser)
            .catch((error) => { mount.textContent = error.message; });
        return this;
    },

    start: async function (mount, currentUser) {
        const workflow = new WorkflowModel();
        const $ = (selector) => mount.querySelector(selector);
        const status = (message) => { $('#runStatus').textContent = message; };
        const showScreen = (id) => {
            for (const screen of SCREEN_IDS) {
                $('#' + screen).classList.toggle('hidden', screen !== id);
            }
            $('#currentPageLabel').textContent = id === 'builderScreen'
                ? (workflow.get('readOnly') ? 'View configuration' : 'Configure flyer stack')
                : PAGE_LABELS[id] || '';
            $('#builderActions').classList.toggle('hidden', id !== 'builderScreen');
            status('');
        };
        const home = () => { workflow.set('completeWorkflow', false); showScreen('workflowHome'); };

        // One request at a time. The screens grey themselves out by listening
        // for `busy`; these four are in the topbar and the builder's nav, which
        // no model reaches.
        const chrome = (disabled) => {
            for (const id of ['#saveGirderBtn', '#submitConfigBtn', '#backWorkflowBtn', '#resetBtn']) {
                $(id).disabled = disabled;
            }
        };
        const guard = (fn) => async () => {
            if (workflow.get('busy')) return;
            workflow.set('busy', true);
            chrome(true);
            try { await fn(); } catch (error) { status(error.message); builder.toast(error.message); } finally {
                workflow.set('busy', false);
                chrome(false);
            }
        };
        const act = (id, fn) => $(id).addEventListener('click', guard(fn));

        // ---- the builder --------------------------------------------------
        const builder = new ConfigBuilderView({
            parentView: this,
            model: new BuilderModel(),
            lasers: new LaserCollection(),
            customFields: new CustomFieldCollection(),
            currentUser,
            guard
        });
        mount.append(builder.render().el);
        let baseline = '';
        const dirty = () => !workflow.get('readOnly') &&
            !builder.el.classList.contains('hidden') &&
            builder.snapshot() !== baseline;
        const canLeave = async () => !dirty() || await ask(
            'You have unsaved changes. Leave without saving? Choose Cancel to return and save.',
            'Leave');

        // ---- the workflow screens -----------------------------------------
        const refresh = async () => {
            const stacks = await workflow.fetchAll();
            builder.model.set({
                submittedStackIds: stacks.submittedStackIds,
                stackStates: stacks.stackStates
            });
        };
        const screenOptions = {
            parentView: this,
            model: workflow,
            guard,
            onChanged: async (message) => { await refresh(); status(message); }
        };
        const homeView = new WorkflowHomeView(screenOptions);
        const configPickerView = new ConfigurationPickerView(screenOptions);
        const generationView = new GenerationPickerView(screenOptions);
        const registrationView = new RegistrationPickerView(screenOptions);
        const adminSettingsView = new AdminSettingsView({
            parentView: this, guard, onSaved: refresh
        });
        for (const view of [homeView, configPickerView, generationView, registrationView]) {
            mount.insertBefore(view.render().el, $('#runStatus'));
        }
        mount.insertBefore(adminSettingsView.render().el, builder.el);

        const configure = async (automated) => {
            workflow.set('completeWorkflow', automated);
            if (!keepsActiveConfig(workflow.get('activeConfig'), automated)) {
                workflow.set('activeConfig', null);
            }
            $('#submitConfigBtn').textContent = automated ? 'Submit, generate & register' : 'Submit';
            await refresh();
            showScreen('configurationPicker');
        };
        this.listenTo(homeView, 'g:configure', (automated) => guard(() => configure(automated))());
        this.listenTo(homeView, 'g:generation', guard(async () => { await refresh(); showScreen('lightburnPicker'); }));
        this.listenTo(homeView, 'g:registration', guard(async () => { await refresh(); showScreen('registrationPicker'); }));
        this.listenTo(homeView, 'g:admin', () => adminSettingsView.open());
        this.listenTo(adminSettingsView, 'g:open', () => showScreen('adminSettingsScreen'));
        for (const view of [configPickerView, generationView, registrationView, adminSettingsView]) {
            this.listenTo(view, 'g:home g:close', home);
        }
        this.listenTo(configPickerView, 'g:selected', () => status(''));

        // ---- entering and leaving the builder ------------------------------
        const setReadOnly = (value) => {
            const activeConfig = workflow.get('activeConfig');
            workflow.set('readOnly', value);
            builder.setReadOnly(value, activeConfig);
            builder.setMode(value
                ? 'Read-only'
                : activeConfig?.savedAt ? `Saved ${savedTime(activeConfig)}` : '');
        };
        this.listenTo(builder, 'g:readOnly', (value) => {
            for (const id of ['#submitConfigBtn', '#resetBtn']) {
                $(id).classList.toggle('hidden', value);
            }
        });
        this.listenTo(builder, 'g:status', (label) => {
            $('#saveState').innerHTML = `<span></span> ${escapeHtml(label)}`;
            $('#saveState').dataset.status = label.toLowerCase().replaceAll(' ', '-');
        });
        this.listenTo(configPickerView, 'g:build', guard(async () => {
            // Switching into Complete Workflow after choosing is the case this
            // covers: the selection is re-checked on the way in, not only on the
            // way to the screen.
            if (!keepsActiveConfig(workflow.get('activeConfig'), workflow.get('completeWorkflow'))) {
                workflow.set('activeConfig', null);
            }
            const activeConfig = workflow.get('activeConfig');
            if (activeConfig) {
                await builder.load({
                    ...activeConfig.config,
                    ...(activeConfig.customFieldRows
                        ? { custom_field_rows: activeConfig.customFieldRows }
                        : {})
                }, true, activeConfig.name);
            } else {
                builder.blank();
            }
            builder.saveAsName(activeConfig?.name || '');
            setReadOnly(Boolean(activeConfig &&
                (activeConfig.status !== 'draft' || activeConfig.canEdit === false)));
            baseline = builder.snapshot();
            showScreen('builderScreen');
        }));
        this.listenTo(builder, 'g:back', async () => {
            if (await canLeave()) showScreen('configurationPicker');
        });
        this.listenTo(builder, 'g:editCopy', () => {
            workflow.set('activeConfig', null);
            setReadOnly(false);
            $('#currentPageLabel').textContent = 'Configure flyer stack';
            builder.setMode('Editing a copy · save creates a new configuration');
        });
        $('#studioHomeLink').addEventListener('click', async (event) => {
            event.preventDefault();
            if (workflow.get('busy')) return;
            if (await canLeave()) home();
        });
        act('#resetBtn', async () => {
            if (workflow.get('readOnly')) return;
            const activeConfig = workflow.get('activeConfig');
            if (activeConfig?.status === 'draft') await request('config/' + activeConfig._id, 'DELETE');
            workflow.set('activeConfig', null);
            builder.saveAsName('');
            builder.blank();
            baseline = builder.snapshot();
            await refresh();
            showScreen('configurationPicker');
        });

        // ---- the topbar's two builder controls ------------------------------
        // #jsonFile and #saveState are in the topbar rather than the builder, so
        // the shell is what connects them to it.
        $('#jsonFile').addEventListener('change',
            (event) => guard(() => builder.importJson(event.target.files?.[0]))());
        this.listenTo(builder, 'g:importDone', () => { $('#jsonFile').value = ''; });
        $('#saveState').addEventListener('click', () => builder.revealStatus());

        // ---- the portal template browser -------------------------------------
        this.listenTo(builder, 'g:browseTemplate', guard(async () => {
            if (workflow.get('readOnly')) return;
            const options = await request('options');
            if (!options.workspaceFolderId) throw new Error('Configure a Flyer Studio workspace first.');
            const workspaceRoot = new girder.models.FolderModel({ _id: options.workspaceFolderId });
            await workspaceRoot.fetch();
            let selected;
            const picker = new girder.views.widgets.BrowserWidget({
                parentView: this,
                root: workspaceRoot,
                showItems: true,
                selectItem: true,
                titleText: 'Choose a portal template',
                submitText: 'Use template',
                validate: async (model) => {
                    if (!model || !model.get('folderId')) throw 'Choose an item containing a LightBurn template.';
                    try {
                        selected = await request('template-item/' + model.id, 'GET', {});
                    } catch (error) { throw error.message; }
                }
            });
            this.listenTo(picker, 'g:saved', async () => {
                try { await builder.useTemplate(selected); } catch (error) { builder.toast(error.message); }
            });
            picker.setElement(document.querySelector('#g-dialog-container')).render();
            // The workspace is where templates are uploaded, and an operator who
            // has none needs to get there. The link follows the browser, so it
            // opens wherever they navigated to rather than at the root.
            const uploadLink = document.createElement('a');
            uploadLink.textContent = 'Open this location to upload a template ↗';
            uploadLink.target = '_blank';
            uploadLink.rel = 'noopener';
            uploadLink.href = '#folder/' + workspaceRoot.id;
            uploadLink.style.cssText = 'display:block;margin:12px 0';
            uploadLink.addEventListener('click', () => {
                const location = picker._hierarchyView.parentModel;
                uploadLink.href = '#' + location.resourceName + '/' + location.id;
            });
            picker.$('.g-hierarchy-widget-container').after(uploadLink);
        }));

        // ---- saving and submitting -------------------------------------------
        const persist = async (submit) => {
            const captured = builder.snapshot();
            const existing = workflow.get('activeConfig');
            workflow.set('activeConfig', await request('config', 'POST', {
                config: JSON.stringify(submit ? builder.finalConfigObject() : builder.draftObject()),
                name: builder.saveAsName().trim(),
                id: existing?.status === 'draft' ? existing._id : '',
                submit,
                validated: submit && builder.status.isAcknowledged()
            }));
            baseline = captured;
            await refresh();
        };
        this.listenTo(builder, 'g:save', guard(async () => {
            await persist(false);
            builder.setMode(`Saved ${savedTime(workflow.get('activeConfig'))}`);
            builder.toast('Draft saved.');
        }));
        // The stack bookkeeping is re-read first, so the form validates against
        // what is true now rather than what was true when the builder opened.
        // The ordering and the recovery are core/submit.js.
        act('#submitConfigBtn', async () => {
            const [submittedStackIds, stackStates] = await Promise.all([
                request('submitted-stacks'), request('stack-states')]);
            builder.model.set({ submittedStackIds, stackStates });
            const endpoint = (suffix) => 'config/' + workflow.get('activeConfig')._id + suffix;
            const outcome = await runSubmission({
                completeWorkflow: workflow.get('completeWorkflow'),
                confirmExport: () => builder.confirmExport(),
                persist: () => persist(true),
                setReadOnly: () => setReadOnly(true),
                generate: async () => workflow.set('activeConfig', await request(endpoint('/generate'), 'POST')),
                register: async () => workflow.set('activeConfig', await request(endpoint('/register'), 'POST')),
                status
            });
            if (!outcome) return;
            if (outcome.screen === 'workflowHome') {
                home();
                status(outcome.message);
                return;
            }
            await refresh();
            showScreen(outcome.screen);
            (outcome.screen === 'lightburnPicker' ? generationView : registrationView)
                .select(workflow.get('activeConfig')._id);
            if (outcome.failed) throw new Error(outcome.message);
            status(outcome.message);
        });

        // ---- leaving the page --------------------------------------------------
        const beforeUnload = (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
        // Asking is asynchronous, so this cannot decide inside the event. It
        // stops every link while the form is dirty and re-issues the click once
        // the answer comes back, with a flag so the re-issued one passes through.
        let leaving = false;
        const guardNavigation = (event) => {
            if (leaving) return;
            if (event.target.closest?.('#g-dialog-container')) return;
            const link = event.composedPath().find((node) => node.tagName === 'A');
            if (!link || link.id === 'studioHomeLink' || !dirty()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            canLeave().then((ok) => {
                if (ok) {
                    baseline = builder.snapshot();
                    leaving = true;
                    link.click();
                    leaving = false;
                }
                return ok;
            });
        };
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', guardNavigation, true);
        this.cleanupGuards = () => {
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', guardNavigation, true);
        };

        await builder.loadCatalog();
        builder.blank();
        await refresh();
    },

    destroy: function () {
        this.cleanupGuards?.();
        return View.prototype.destroy.call(this);
    }
});
girder.plugins.dashboards.registerDashboard('flycut-config', { view: Dashboard });
