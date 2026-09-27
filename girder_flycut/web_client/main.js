/**
 * Flyer Studio dashboard shell.
 *
 * The four workflow screens are views over a shared WorkflowModel and render
 * themselves. What is left here is the chrome they sit in -- which screen is
 * showing, the status line, the busy guard -- and the builder, which is still
 * one closure and becomes views next.
 *
 * The markup is one plain file per screen in ./templates/, imported as strings.
 * Three are still concatenated here: the topbar, the status line and the
 * builder have no view of their own yet. The stylesheet is imported for its
 * side effect: Vite emits it as style.css and load() registers it, which is why
 * it is scoped under .g-flycut-dashboard rather than relying on a shadow root.
 */
import createBuilder from './builder.js';
import { savedTime } from './core/records.js';
import { runSubmission } from './core/submit.js';
import { keepsActiveConfig } from './core/workflow.js';
import WorkflowModel from './models/WorkflowModel.js';
import './styles/dashboard.css';
import builderTemplate from './templates/builder.html?raw';
import statusBarTemplate from './templates/statusBar.html?raw';
import topbarTemplate from './templates/topbar.html?raw';
import { ask, escapeHtml, request } from './util.js';
import AdminSettingsView from './views/AdminSettingsView.js';
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
        // The screen views are inserted between these, so the document order
        // stays topbar, the four screens, the status line, the admin screen, the
        // builder -- the order the one markup file used to have.
        mount.innerHTML = topbarTemplate + statusBarTemplate + builderTemplate;
        this.el.append(mount);
        this.cleanupBuilder = null;
        this.ready = this.startBuilder(mount, currentUser).catch((error) => { mount.textContent = error.message; });
        return this;
    },
    startBuilder: async function (mount, currentUser) {
        const workflow = new WorkflowModel();
        const fetch = async (url, options = {}) => {
            if (url === '/api/cache') return { ok: true, json: async () => ({ operators: [currentUser.get('login')], field_names: state.knownFieldNames }) };
            let data;
            if (options.body instanceof FormData) {
                const file = options.body.get('file');
                if (file.size > 5 * 1024 * 1024) throw new Error('Workbook exceeds 5 MB.');
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                data = { payload: JSON.stringify({ filename: file.name, data: btoa(binary) }) };
            }
            const result = await request(url.replace('/api/', ''), options.method || 'GET', data);
            return { ok: true, json: async () => result };
        };
        // The builder owns the form; these are the bindings the workflow chrome
        // below needs from it. It queries the whole mount at construction and
        // everything it looks for is in the topbar or the builder markup, which
        // is why the screen views can be built after it rather than before.
        const {
            $, changeTemplate, cleanupTooltips, clearValidation, configObject,
            confirmExport, finalConfigObject, importJson, makeLaser,
            renderCustomFields, state, toast, updateAll, updateAssignmentUI
        } = await createBuilder({ mount, currentUser, fetch });
        let baseline = '';
        const snapshot = () => JSON.stringify({
            config: configObject(),
            operator: $('#operator').value,
            fields: state.customFields,
            lasers: state.laserParams,
            name: $('#saveAsName').value
        });
        const dirty = () => !workflow.get('readOnly') && !$('#builderScreen').classList.contains('hidden') && snapshot() !== baseline;
        const canLeave = async () => !dirty() || await ask(
            'You have unsaved changes. Leave without saving? Choose Cancel to return and save.',
            'Leave');
        const status = (message) => { $('#runStatus').textContent = message; };
        const showScreen = (id) => {
            for (const screen of SCREEN_IDS) { $('#' + screen).classList.toggle('hidden', screen !== id); }
            $('#currentPageLabel').textContent = id === 'builderScreen'
                ? (workflow.get('readOnly') ? 'View configuration' : 'Configure flyer stack')
                : PAGE_LABELS[id] || '';
            $('#builderActions').classList.toggle('hidden', id !== 'builderScreen');
            status('');
        };
        const home = () => { workflow.set('completeWorkflow', false); showScreen('workflowHome'); };
        const refresh = async () => {
            const stacks = await workflow.fetchAll();
            state.submittedStackIds = stacks.submittedStackIds;
            state.stackStates = stacks.stackStates;
        };
        const configure = async (automated) => {
            workflow.set('completeWorkflow', automated);
            if (!keepsActiveConfig(workflow.get('activeConfig'), automated)) workflow.set('activeConfig', null);
            $('#submitConfigBtn').textContent = automated ? 'Submit, generate & register' : 'Submit';
            await refresh();
            showScreen('configurationPicker');
        };
        const setReadOnly = (value) => {
            const activeConfig = workflow.get('activeConfig');
            workflow.set('readOnly', value);
            state.viewStatus = value ? activeConfig.status[0].toUpperCase() + activeConfig.status.slice(1) : null;
            $('#stackid').readOnly = false;
            $('#autoStackIdBtn').setAttribute('aria-pressed', 'false');
            clearValidation();
            $('#configFields').disabled = value;
            $('#saveAsName').disabled = value;
            $('#builderScreen').classList.toggle('read-only', value);
            for (const id of ['#saveGirderBtn', '#submitConfigBtn', '#resetBtn']) $(id).classList.toggle('hidden', value);
            $('#editCopyBtn').classList.toggle('hidden', !value);
            $('.intro h1').textContent = 'Configure Flyer Stack';
            $('#builderMode').textContent = value ? 'Read-only' : activeConfig?.savedAt ? `Saved ${savedTime(activeConfig)}` : '';
            updateAll();
        };
        const blank = () => {
            $('#configForm').reset();
            $('#operator').value = currentUser.get('login');
            state.laserParams = [];
            state.laserParams.push(makeLaser({ isDefault: true }));
            state.preset = null;
            const preset = state.presets.find((entry) => entry.id === state.preset);
            if (preset) Object.assign(state.laserParams[0], preset.laser_defaults);
            state.customFields = Object.entries(preset?.custom_fields || {}).map(([name, value]) => ({ id: crypto.randomUUID(), name, value: String(value ?? '') }));
            state.templateDetail = null;
            state.parameterImportFile = null;
            state.zoom = 1;
            updateAssignmentUI(); renderCustomFields(); updateAll();
        };
        // A disabled fieldset blocks inputs; explicitly block HTML drag/reorder as well.
        for (const eventName of ['dragstart', 'drop', 'keydown']) {
            $('#configForm').addEventListener(eventName, (event) => {
                if (workflow.get('readOnly')) { event.preventDefault(); event.stopImmediatePropagation(); }
            }, true);
        }
        // One request at a time, with the four builder controls the model does
        // not reach disabled for its duration -- the screens grey themselves out
        // by listening for `busy`. Split from act() so a child view can run
        // under the same guard without owning a listener.
        const builderControls = (disabled) => {
            for (const id of ['#saveGirderBtn', '#submitConfigBtn', '#backWorkflowBtn', '#resetBtn']) $(id).disabled = disabled;
        };
        const guard = (fn) => async () => {
            if (workflow.get('busy')) return;
            workflow.set('busy', true);
            builderControls(true);
            try { await fn(); } catch (error) { status(error.message); toast(error.message); } finally {
                workflow.set('busy', false);
                builderControls(false);
            }
        };
        const act = (id, fn) => $(id).addEventListener('click', guard(fn));
        const addPortalTemplate = (detail) => {
            if (!state.templates.some((entry) => entry.id === detail.id)) {
                state.templates.push(detail);
                const option = document.createElement('option');
                option.value = detail.id;
                option.textContent = detail.label + ' · Portal';
                $('#template').append(option);
            }
        };
        act('#browseTemplateBtn', async () => {
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
                addPortalTemplate(selected);
                $('#template').value = selected.id;
                try { await changeTemplate(); } catch (error) { toast(error.message); }
            });
            picker.setElement(document.querySelector('#g-dialog-container')).render();
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
        });
        act('#autoStackIdBtn', async () => {
            if (workflow.get('readOnly')) return;
            if ($('#stackid').readOnly) {
                $('#stackid').readOnly = false;
                $('#autoStackIdBtn').setAttribute('aria-pressed', 'false');
                $('#autoStackIdBtn').title = 'Assign lowest available Stack ID';
                $('#stackid').focus();
            } else {
                const result = await request('next-stack-id');
                $('#stackid').value = result.stackid;
                $('#stackid').readOnly = true;
                $('#autoStackIdBtn').setAttribute('aria-pressed', 'true');
                $('#autoStackIdBtn').title = 'Unlock Stack ID';
            }
            clearValidation(); updateAll();
        });
        $('#configForm').addEventListener('reset', () => {
            $('#stackid').readOnly = false;
            $('#autoStackIdBtn').setAttribute('aria-pressed', 'false');
        });

        // ---- the screens ------------------------------------------------
        // Each renders itself from the model. The shell wires only what crosses
        // the boundary: navigation, and anything that touches the builder.
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
        mount.insertBefore(adminSettingsView.render().el, $('#builderScreen'));

        this.listenTo(homeView, 'g:configure', (automated) => guard(() => configure(automated))());
        this.listenTo(homeView, 'g:generation', guard(async () => { await refresh(); showScreen('lightburnPicker'); }));
        this.listenTo(homeView, 'g:registration', guard(async () => { await refresh(); showScreen('registrationPicker'); }));
        this.listenTo(homeView, 'g:admin', () => adminSettingsView.open());
        this.listenTo(adminSettingsView, 'g:open', () => showScreen('adminSettingsScreen'));
        for (const view of [configPickerView, generationView, registrationView, adminSettingsView]) {
            this.listenTo(view, 'g:home g:close', home);
        }
        this.listenTo(configPickerView, 'g:selected', () => status(''));
        this.listenTo(configPickerView, 'g:build', guard(async () => {
            // Switching into Complete Workflow after choosing is the case this
            // covers: the selection is re-checked on the way in, not only on the
            // way to the screen.
            if (!keepsActiveConfig(workflow.get('activeConfig'), workflow.get('completeWorkflow'))) {
                workflow.set('activeConfig', null);
            }
            const activeConfig = workflow.get('activeConfig');
            if (activeConfig) {
                const template = (activeConfig.config.run_parameters || activeConfig.config.run_params)?.template;
                if (template?.startsWith('girder:')) addPortalTemplate(await request('templates/' + encodeURIComponent(template)));
                await importJson(new File([JSON.stringify({ ...activeConfig.config, ...(activeConfig.customFieldRows ? { custom_field_rows: activeConfig.customFieldRows } : {}) })], activeConfig.name + '.json', { type: 'application/json' }), true);
            } else blank();
            $('#saveAsName').value = activeConfig?.name || '';
            setReadOnly(Boolean(activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)));
            baseline = snapshot();
            showScreen('builderScreen');
        }));

        // ---- the builder's chrome ---------------------------------------
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
            $('#saveAsName').value = '';
            blank();
            baseline = snapshot();
            await refresh();
            showScreen('configurationPicker');
        });
        $('#backWorkflowBtn').addEventListener('click', async () => {
            if (await canLeave()) showScreen('configurationPicker');
        });
        $('#editCopyBtn').addEventListener('click', () => {
            workflow.set('activeConfig', null);
            setReadOnly(false);
            $('#currentPageLabel').textContent = 'Configure flyer stack';
            $('#builderMode').textContent = 'Editing a copy · save creates a new configuration';
        });
        const draftObject = () => ({
            ...configObject(),
            run_params: { ...configObject().run_params, operator: $('#operator').value },
            custom_field_rows: state.customFields.map(({ name, value }) => ({ name, value }))
        });
        const persist = async (submit) => {
            const captured = snapshot();
            const config = submit ? finalConfigObject() : draftObject();
            const existing = workflow.get('activeConfig');
            workflow.set('activeConfig', await request('config', 'POST', {
                config: JSON.stringify(config),
                name: $('#saveAsName').value.trim(),
                id: existing?.status === 'draft' ? existing._id : '',
                submit,
                validated: submit && $('#validationAck').checked
            }));
            baseline = captured;
            await refresh();
        };
        act('#saveGirderBtn', async () => {
            await persist(false);
            $('#builderMode').textContent = `Saved ${savedTime(workflow.get('activeConfig'))}`;
            toast('Draft saved.');
        });
        // The stack bookkeeping is re-read first, so the form validates against
        // what is true now rather than what was true when the builder opened.
        // The ordering and the recovery are core/submit.js.
        act('#submitConfigBtn', async () => {
            [state.submittedStackIds, state.stackStates] = await Promise.all([request('submitted-stacks'), request('stack-states')]);
            updateAll();
            const endpoint = (suffix) => 'config/' + workflow.get('activeConfig')._id + suffix;
            const outcome = await runSubmission({
                completeWorkflow: workflow.get('completeWorkflow'),
                confirmExport,
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
        const beforeUnload = (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
        // Asking is asynchronous now, so this can no longer decide inside the
        // event. It stops every link while the form is dirty and re-issues the
        // click once the answer comes back, with a flag so the re-issued one
        // passes straight through.
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
                    baseline = snapshot();
                    leaving = true;
                    link.click();
                    leaving = false;
                }
                return ok;
            });
        };
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', guardNavigation, true);
        this.cleanupBuilder = () => {
            clearTimeout(toast.timer);
            cleanupTooltips();
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', guardNavigation, true);
        };
        $('#presetSelect').innerHTML = '<option value="">No preset</option>' + state.presets.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`).join('');
        await refresh();
    },
    destroy: function () {
        this.cleanupBuilder?.();
        return View.prototype.destroy.call(this);
    }
});
girder.plugins.dashboards.registerDashboard('flycut-config', { view: Dashboard });
