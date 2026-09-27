/**
 * Flyer Studio dashboard shell.
 *
 * The markup, the scoped stylesheet and the configuration builder are all
 * derived from the standalone builder in config_builder/static/ by
 * build/generate-sources.mjs, which writes them into ./generated/ for Vite to
 * bundle. In Phase 1 they were stub declarations a Python script substituted;
 * they are ordinary imports now.
 */
import createBuilder from './builder.js';
import {groupedOptions, selectableConfigs} from './core/records.js';
import styles from './generated/styles.js';
import template from './generated/template.js';

const View = girder.views.View;
const request = async (url, method = 'GET', data) => {
    try {
        return await girder.rest.restRequest({url: `flycut/${url}`, method, data, error: null});
    } catch (error) {
        throw new Error(error.responseJSON?.message || 'Girder request failed.');
    }
};
const Dashboard = View.extend({
    render: function () {
        this.el.replaceChildren();
        const currentUser = girder.auth.getCurrentUser();
        if (!currentUser) {
            this.el.textContent = 'Sign in to Girder to use Flyer Studio.';
            return this;
        }
        const host = document.createElement('div');
        this.el.append(host);
        const mount = host.attachShadow({mode: 'open'});
        const style = document.createElement('style');
        style.textContent = styles;
        mount.append(style);
        const container = document.createElement('div');
        container.innerHTML = template;
        mount.append(container);
        this.cleanupBuilder = null;
        this.ready = this.startBuilder(mount, currentUser).catch(error => { container.textContent = error.message; });
        return this;
    },
    startBuilder: async function (mount, currentUser) {
        let activeConfig = null;
        let saved = [];
        const fetch = async (url, options = {}) => {
            if (url === '/api/cache') return {ok: true, json: async () => ({operators: [currentUser.get('login')], field_names: state.knownFieldNames})};
            let data;
            if (options.body instanceof FormData) {
                const file = options.body.get('file');
                if (file.size > 5 * 1024 * 1024) throw new Error('Workbook exceeds 5 MB.');
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                data = {payload: JSON.stringify({filename: file.name, data: btoa(binary)})};
            }
            const result = await request(url.replace('/api/', ''), options.method || 'GET', data);
            return {ok: true, json: async () => result};
        };
        // The builder owns the form; these are the bindings the workflow
        // chrome below needs from it. build/generate-sources.mjs checks that this
        // list and the builder's exports agree.
        const {
            $, changeTemplate, cleanupTooltips, clearValidation, configObject,
            confirmExport, escapeHtml, finalConfigObject, importJson, makeLaser,
            renderCustomFields, state, toast, updateAll, updateAssignmentUI
        } = await createBuilder({mount, currentUser, fetch});
        let busy = false;
        let completeWorkflow = false;
        let readOnly = false;
        let baseline = '';
        const snapshot = () => JSON.stringify({config:configObject(), operator:$('#operator').value,
            fields:state.customFields, lasers:state.laserParams, name:$('#saveAsName').value});
        const dirty = () => !readOnly && !$('#builderScreen').classList.contains('hidden') && snapshot() !== baseline;
        // eslint-disable-next-line no-alert -- synchronous gate; C5/Phase 4 makes canLeave() async
    const canLeave = () => !dirty() || confirm('You have unsaved changes. Leave without saving? Choose Cancel to return and save.');
        const status = message => { $('#runStatus').textContent = message; };
        const showScreen = id => {
            for (const screen of ['workflowHome', 'configurationPicker', 'lightburnPicker', 'registrationPicker', 'builderScreen', 'adminSettingsScreen'])
                $('#' + screen).classList.toggle('hidden', screen !== id);
            $('#currentPageLabel').textContent = {workflowHome:'Home', configurationPicker:'Configuration', lightburnPicker:'Generation', registrationPicker:'Registration', builderScreen:readOnly ? 'View configuration' : 'Configure flyer stack'}[id];
            $('#builderActions').classList.toggle('hidden', id !== 'builderScreen');
            status('');
        };
        const home = () => { completeWorkflow = false; showScreen('workflowHome'); renderHome(); };
        const configure = async automated => {
            completeWorkflow = automated;
            if (automated && activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)) activeConfig = null;
            $('#configurationPickerTitle').textContent = automated ? 'Complete Workflow' : 'Configuration';
            $('#completeWorkflowHint').classList.toggle('hidden', !automated);
            $('#submitConfigBtn').textContent = automated ? 'Submit, generate & register' : 'Submit';
            await refresh();
            showScreen('configurationPicker');
        };
        const savedTime = record => record?.savedAt ? new Date(record.savedAt).toLocaleString() : '';
        const renderHome = () => {
            $('#buildConfigBtn').textContent = activeConfig ? (activeConfig.status === 'draft' ? 'Edit config' : 'View config') : 'Build config';
            $('#buildConfigBtn').disabled = busy;
            $('#presetPicker').classList.add('hidden');
            $('#presetSelect').disabled = true;
            $('#savedConfigs').disabled = busy;
            $('#submittedConfigs').disabled = busy;
            $('#configurationStepBtn').disabled = busy;
            $('#completeWorkflowBtn').disabled = busy;
            $('#lightburnStepBtn').disabled = busy;
            $('#registerBtn').disabled = busy;
            const generation = saved.find(record => record._id === $('#submittedConfigs').value);
            $('#generateBtn').disabled = busy || !generation || generation.status !== 'submitted' || generation.canEdit === false;
            $('#deleteFilesBtn').classList.toggle('hidden', generation?.status !== 'generated');
            $('#deleteFilesBtn').disabled = busy || generation?.canEdit === false;
            $('#generatedFolderLink').classList.toggle('hidden', !generation?.folderId || !['generated','registered'].includes(generation?.status));
            $('#generatedFolderLink').href = generation?.folderId ? '#folder/' + generation.folderId : '#';
            $('#filesHint').textContent = generation ? 'Status: ' + generation.status : '';
            const registration = saved.find(record => record._id === $('#registrationConfigs').value);
            $('#registrationConfigs').disabled = busy;
            $('#registerStackBtn').disabled = busy || registration?.status !== 'generated' || registration?.canEdit === false;
            $('#registrationHint').textContent = registration?.status === 'registered' ? 'Registered · ' + (registration.registration?.igsn || '') : '';
            const igsn = registration?.status === 'registered' && !registration.registration?.mock ? registration.registration?.igsn : null;
            $('#viewIgsnLink').classList.toggle('hidden', !igsn);
            $('#viewIgsnLink').href = igsn ? '#igsn/' + encodeURIComponent(igsn) : '#';
            $('#artifacts').replaceChildren();
        };
        const refresh = async () => {
            [saved, state.submittedStackIds, state.stackStates] = await Promise.all([request('config'), request('submitted-stacks'), request('stack-states')]);
            const options = (records, disableRegistered = false) =>
                groupedOptions(records, {disableRegistered, escapeHtml, savedTime});
            const submitted = saved.filter(record => ['submitted', 'generated'].includes(record.status));
            const configurations = selectableConfigs(saved, completeWorkflow);
            $('#savedConfigs').innerHTML = '<option value="">New configuration</option>' + options(configurations);
            const selectedSubmission = $('#submittedConfigs').value;
            $('#submittedConfigs').innerHTML = '<option value="">' + (submitted.length ? 'Choose a submitted configuration' : 'No submitted configurations') + '</option>' + options(submitted, true);
            if (submitted.some(record => record._id === selectedSubmission && record.status !== 'registered')) $('#submittedConfigs').value = selectedSubmission;
            const selectedRegistration = $('#registrationConfigs').value;
            const generated = saved.filter(record => ['generated','registered'].includes(record.status));
            $('#registrationConfigs').innerHTML = '<option value="">' + (generated.length ? 'Choose a generated configuration' : 'No generated configurations') + '</option>' + options(generated);
            if (generated.some(record => record._id === selectedRegistration)) $('#registrationConfigs').value = selectedRegistration;
            if (activeConfig) {
                activeConfig = saved.find(record => record._id === activeConfig._id) || activeConfig;
                $('#savedConfigs').value = configurations.some(record => record._id === activeConfig._id) ? activeConfig._id : '';
            }
            renderHome();
        };
        const setReadOnly = value => {
            readOnly = value;
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
            state.laserParams.push(makeLaser({isDefault: true}));
            state.preset = null;
            const preset = state.presets.find(entry => entry.id === state.preset);
            if (preset) Object.assign(state.laserParams[0], preset.laser_defaults);
            state.customFields = Object.entries(preset?.custom_fields || {}).map(([name,value]) => ({id:crypto.randomUUID(),name,value:String(value ?? '')}));
            state.templateDetail = null;
            state.parameterImportFile = null;
            state.zoom = 1;
            updateAssignmentUI(); renderCustomFields(); updateAll();
        };
        // A disabled fieldset blocks inputs; explicitly block HTML drag/reorder as well.
        for (const eventName of ['dragstart', 'drop', 'keydown']) {
            $('#configForm').addEventListener(eventName, event => {
                if (readOnly) { event.preventDefault(); event.stopImmediatePropagation(); }
            }, true);
        }
        const act = (id, fn) => $(id).addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            $('#saveGirderBtn').disabled = true;
            $('#submitConfigBtn').disabled = true;
            $('#backWorkflowBtn').disabled = true;
            $('#resetBtn').disabled = true;
            renderHome();
            try { await fn(); }
            catch (error) { status(error.message); toast(error.message); }
            finally {
                busy = false;
                $('#saveGirderBtn').disabled = false;
                $('#submitConfigBtn').disabled = false;
                $('#backWorkflowBtn').disabled = false;
                $('#resetBtn').disabled = false;
                renderHome();
            }
        });
        const addPortalTemplate = detail => {
            if (!state.templates.some(entry => entry.id === detail.id)) {
                state.templates.push(detail);
                const option = document.createElement('option');
                option.value = detail.id;
                option.textContent = detail.label + ' · Portal';
                $('#template').append(option);
            }
        };
        act('#browseTemplateBtn', async () => {
            if (readOnly) return;
            const options = await request('options');
            if (!options.workspaceFolderId) throw new Error('Configure a Flyer Studio workspace first.');
            const workspaceRoot = new girder.models.FolderModel({_id: options.workspaceFolderId});
            await workspaceRoot.fetch();
            let selected;
            const picker = new girder.views.widgets.BrowserWidget({
                parentView: this, root: workspaceRoot, showItems: true, selectItem: true,
                titleText: 'Choose a portal template', submitText: 'Use template',
                validate: async model => {
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
            if (readOnly) return;
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
        let adminPolicy = null;
        let principalResults = [];
        const policyBooleans = ['creators_include_user', 'owners_include_user', 'editors_include_user', 'viewers_include_user', 'public_igsn', 'public_files'];
        const renderPolicyLists = () => {
            $('#policyLists').innerHTML = ['creators', 'owners', 'editors', 'viewers'].map(role => `<h3>${role[0].toUpperCase() + role.slice(1)}</h3><ul>${adminPolicy[role].map((ref, index) => `<li>${escapeHtml(ref.label || ref.id)} (${ref.type}) <button type="button" class="button ghost" data-role="${role}" data-index="${index}">Remove</button></li>`).join('') || '<li>None</li>'}</ul>`).join('');
        };
        $('#adminSettingsBtn').classList.add('hidden');
        $('#adminSettingsBack').addEventListener('click', home);
        $('#workspacePath').addEventListener('input', () => { if (adminPolicy) adminPolicy.workspace_folder_id = ''; });
        $('#policyLists').addEventListener('click', event => {
            const button = event.target.closest('button[data-role]');
            if (!button) return;
            adminPolicy[button.dataset.role].splice(Number(button.dataset.index), 1);
            renderPolicyLists();
        });
        const searchPrincipals = async () => {
            principalResults = await request('settings/principals', 'GET', {q: $('#principalSearch').value});
            $('#principalResults').innerHTML = principalResults.map((ref, index) => `<option value="${index}">${escapeHtml(ref.label)} (${ref.type})</option>`).join('');
        };
        act('#adminSettingsBtn', async () => {
            const result = await request('settings');
            adminPolicy = result.settings;
            $('#workspacePath').value = adminPolicy.workspace_path;
            $('#workspaceCollection').innerHTML = result.collections.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            if (result.workspaceCollectionId) $('#workspaceCollection').value = result.workspaceCollectionId;
            policyBooleans.forEach(key => { $('#' + key).checked = adminPolicy[key]; });
            renderPolicyLists();
            await searchPrincipals();
            $('#settingsStatus').textContent = '';
            showScreen('adminSettingsScreen');
        });
        act('#findPrincipalsBtn', searchPrincipals);
        act('#addPrincipalBtn', async () => {
            const ref = principalResults[Number($('#principalResults').value)];
            if (!ref) return;
            const role = $('#principalRole').value;
            if (!adminPolicy[role].some(entry => entry.id === ref.id && entry.type === ref.type)) adminPolicy[role].push(ref);
            renderPolicyLists();
        });
        act('#browseWorkspaceBtn', async () => {
            const id = $('#workspaceCollection').value;
            if (!id) throw new Error('Create a collection and workspace folder in Girder first.');
            const root = new girder.models.CollectionModel({_id: id});
            await root.fetch();
            let selected;
            const picker = new girder.views.widgets.BrowserWidget({parentView:this, root, showItems:false,
                titleText:'Choose a workspace folder', submitText:'Use folder',
                validate: async model => {
                    if (model?.resourceName !== 'folder') throw 'Choose a folder inside the collection.';
                    selected = await request('settings/workspace', 'GET', {id:model.id});
                }});
            this.listenTo(picker, 'g:saved', () => {
                adminPolicy.workspace_folder_id = selected.id;
                $('#workspacePath').value = selected.path;
            });
            picker.setElement(document.querySelector('#g-dialog-container')).render();
        });
        act('#saveAdminSettingsBtn', async () => {
            adminPolicy.workspace_path = $('#workspacePath').value.trim();
            policyBooleans.forEach(key => { adminPolicy[key] = $('#' + key).checked; });
            const result = await request('settings', 'PUT', {settings: JSON.stringify(adminPolicy)});
            adminPolicy = result.settings;
            $('#workspacePath').value = adminPolicy.workspace_path;
            $('#settingsStatus').textContent = 'Settings saved. New data will use this policy.';
            await refresh();
        });
        act('#configurationStepBtn', () => configure(false));
        act('#completeWorkflowBtn', () => configure(true));
        act('#lightburnStepBtn', async () => { await refresh(); showScreen('lightburnPicker'); });
        act('#registerBtn', async () => { await refresh(); showScreen('registrationPicker'); });
        $('#registrationBackBtn').addEventListener('click', home);
        $('#submittedConfigs').addEventListener('change', renderHome);
        $('#registrationConfigs').addEventListener('change', renderHome);
        act('#generateBtn', async () => {
            await request('config/' + $('#submittedConfigs').value + '/generate', 'POST');
            await refresh(); status('Files generated.');
        });
        act('#deleteFilesBtn', async () => {
            // eslint-disable-next-line no-alert -- C5/Phase 4
            if (!confirm('Delete this configuration’s generated files? It will return to submitted and its Stack ID can be reused.')) return;
            await request('config/' + $('#submittedConfigs').value + '/files', 'DELETE');
            await refresh(); status('Generated files deleted. Configuration is submitted.');
        });
        act('#registerStackBtn', async () => {
            await request('config/' + $('#registrationConfigs').value + '/register', 'POST');
            await refresh(); status('Stack IGSN registered. This Stack ID can no longer be reused.');
        });
        $('#configPickerBackBtn').addEventListener('click', home);
        $('#lightburnPickerBackBtn').addEventListener('click', home);
        $('#savedConfigs').addEventListener('change', () => {
            activeConfig = saved.find(record => record._id === $('#savedConfigs').value) || null;
            status(''); renderHome();
        });
        act('#buildConfigBtn', async () => {
            if (completeWorkflow && activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)) {
                activeConfig = null;
                $('#savedConfigs').value = '';
            }
            if (activeConfig) {
                const template = (activeConfig.config.run_parameters || activeConfig.config.run_params)?.template;
                if (template?.startsWith('girder:')) addPortalTemplate(await request('templates/' + encodeURIComponent(template)));
                await importJson(new File([JSON.stringify({...activeConfig.config, ...(activeConfig.customFieldRows ? {custom_field_rows: activeConfig.customFieldRows} : {})})], activeConfig.name + '.json', {type: 'application/json'}), true);
            }
            else blank();
            $('#saveAsName').value = activeConfig?.name || '';
            setReadOnly(Boolean(activeConfig && (activeConfig.status !== 'draft' || activeConfig.canEdit === false)));
            baseline = snapshot();
            showScreen('builderScreen');
        });
        $('#studioHomeLink').addEventListener('click', event => {
            event.preventDefault();
            if (!busy && canLeave()) home();
        });
        act('#resetBtn', async () => {
            if (readOnly) return;
            if (activeConfig?.status === 'draft') await request('config/' + activeConfig._id, 'DELETE');
            activeConfig = null;
            $('#savedConfigs').value = '';
            $('#saveAsName').value = '';
            blank();
            baseline = snapshot();
            await refresh();
            showScreen('configurationPicker');
        });
        $('#backWorkflowBtn').addEventListener('click', () => { if (canLeave()) showScreen('configurationPicker'); });
        $('#editCopyBtn').addEventListener('click', () => {
            activeConfig = null;
            $('#savedConfigs').value = '';
            setReadOnly(false);
            $('#currentPageLabel').textContent = 'Configure flyer stack';
            $('#builderMode').textContent = 'Editing a copy · save creates a new configuration';
        });
        const draftObject = () => ({...configObject(), run_params: {...configObject().run_params, operator: $('#operator').value},
            custom_field_rows: state.customFields.map(({name,value}) => ({name,value}))});
        const persist = async submit => {
            const captured = snapshot();
            const config = submit ? finalConfigObject() : draftObject();
            activeConfig = await request('config', 'POST', {config: JSON.stringify(config), name: $('#saveAsName').value.trim(),
                id: activeConfig?.status === 'draft' ? activeConfig._id : '', submit, validated: submit && $('#validationAck').checked});
            baseline = captured;
            await refresh();
        };
        act('#saveGirderBtn', async () => {
            await persist(false);
            $('#builderMode').textContent = `Saved ${savedTime(activeConfig)}`;
            toast('Draft saved.');
        });
        act('#submitConfigBtn', async () => {
            [state.submittedStackIds, state.stackStates] = await Promise.all([request('submitted-stacks'), request('stack-states')]);
            updateAll();
            if (!confirmExport()) return;
            await persist(true);
            setReadOnly(true);
            if (!completeWorkflow) {
                home();
                status('Configuration submitted. It is now read-only.');
                return;
            }
            const endpoint = 'config/' + activeConfig._id;
            let stage = 'generation';
            try {
                status('Configuration submitted. Generating files…');
                activeConfig = await request(endpoint + '/generate', 'POST');
                stage = 'registration';
                status('Files generated. Registering stack IGSN…');
                activeConfig = await request(endpoint + '/register', 'POST');
            } catch (error) {
                await refresh();
                showScreen(stage === 'generation' ? 'lightburnPicker' : 'registrationPicker');
                $(stage === 'generation' ? '#submittedConfigs' : '#registrationConfigs').value = activeConfig._id;
                renderHome();
                throw new Error(`Automatic ${stage} stopped: ${error.message} Your saved work is retained; continue from this module.`);
            }
            await refresh();
            showScreen('registrationPicker');
            $('#registrationConfigs').value = activeConfig._id;
            renderHome();
            status('Complete: configuration submitted, files generated, and stack IGSN registered.');
        });
        const beforeUnload = event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
        const guardNavigation = event => {
            if (event.target.closest?.('#g-dialog-container')) return;
            const link = event.composedPath().find(node => node.tagName === 'A');
            if (link?.id === 'studioHomeLink') return;
            if (link && !canLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
        };
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', guardNavigation, true);
        this.cleanupBuilder = () => {
            clearTimeout(toast.timer);
            cleanupTooltips();
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', guardNavigation, true);
        };
        $('#presetSelect').innerHTML = '<option value="">No preset</option>' + state.presets.map(preset => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`).join('');
        await refresh();

    },
    destroy: function () {
        this.cleanupBuilder?.();
        return View.prototype.destroy.call(this);
    }
});
girder.plugins.dashboards.registerDashboard('flycut-config', {view: Dashboard});
