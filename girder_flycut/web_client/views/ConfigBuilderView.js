/**
 * The configuration builder: three form sections on the left, three viewer
 * panels on the right, and the chrome that holds them.
 *
 * This was createBuilder(), 425 lines of closure that every part of the form
 * reached into and that called updateAll() from eleven places. The children own
 * their own markup and their own controls; what is left here is what genuinely
 * spans them -- assembling the configuration out of six sources, deciding
 * whether it may be exported, importing one back in, and the two pieces of
 * furniture that belong to no section: the toast and the help tooltip.
 *
 * refresh() is the one thing every child calls. It is what updateAll() was,
 * except that it no longer has to be called by hand: a child that changes
 * something says so, and this listens.
 */
import { assessConfiguration } from '../core/assess.js';
import { customFieldRows, importedLasers, layerAssignment, toFormShape } from '../core/config.js';
import { exportDecision } from '../core/validate.js';
import { request } from '../util.js';
import builderScreenTemplate from '../templates/builderScreen.pug';
import CustomFieldsView from './CustomFieldsView.js';
import JsonPanelView from './JsonPanelView.js';
import LaserListView from './LaserListView.js';
import PreviewView from './PreviewView.js';
import RunParametersView from './RunParametersView.js';
import StatusPanelView from './StatusPanelView.js';
import '../stylesheets/builder.styl';

const View = girder.views.View;
/** How long a toast stays up. Long enough to read, short enough not to nag. */
const TOAST_MS = 1800;

const ConfigBuilderView = View.extend({
    events: {
        'click .tab': function (event) { this.showTab(event.currentTarget.dataset.tab); },
        'click #saveGirderBtn': function () { this.trigger('g:save'); },
        'click #backWorkflowBtn': function () { this.trigger('g:back'); },
        'click #editCopyBtn': function () { this.trigger('g:editCopy'); },
        'reset #configForm': function () {
            this.runParameters.releaseStackId();
            this.status.clear();
        },
        'input #configForm': function () { this.status.clear(); },
        'change #configForm': function () { this.status.clear(); }
    },

    /**
     * @param {object} settings
     * @param {BuilderModel} settings.model
     * @param {LaserCollection} settings.lasers
     * @param {CustomFieldCollection} settings.customFields
     * @param {function} settings.guard runs an async handler under the
     *   dashboard's busy flag, so a request from here reads like any other
     * @param {object} settings.currentUser
     */
    initialize: function (settings = {}) {
        this.lasers = settings.lasers;
        this.customFields = settings.customFields;
        this.guard = settings.guard || ((fn) => fn);
        this.currentUser = settings.currentUser;
        this.readOnly = false;
        this.blockWhenReadOnly = this.blockWhenReadOnly.bind(this);

        this.runParameters = new RunParametersView({ parentView: this, model: this.model });
        this.laserList = new LaserListView({
            parentView: this, model: this.model, collection: this.lasers
        });
        this.customFieldsView = new CustomFieldsView({
            parentView: this, model: this.model, collection: this.customFields
        });
        this.preview = new PreviewView({
            parentView: this,
            model: this.model,
            lasers: this.lasers,
            assignment: () => this.laserList.assignment(),
            materialId: () => this.runParameters.values().foil_material
        });
        this.json = new JsonPanelView({
            parentView: this, model: this.model, config: () => this.finalConfigObject()
        });
        this.status = new StatusPanelView({
            parentView: this,
            model: this.model,
            status: () => this.configurationStatus(),
            snapshot: () => this.validationSnapshot(),
            editable: () => !this.readOnly
        });

        this.listenTo(this.runParameters, 'g:autoStackId', () => this.guard(() => this.assignStackId())());
        this.listenTo(this.runParameters, 'g:browseTemplate', () => this.trigger('g:browseTemplate'));
        this.listenTo(this.runParameters, 'g:material', (material) => {
            this.lasers.applyDefaults(material, this.model.activePreset());
            this.refresh();
        });
        this.listenTo(this.runParameters, 'g:template', () => this.guard(() => this.changeTemplate())());
        this.listenTo(this.laserList, 'g:changed', this.refresh);
        this.listenTo(this.laserList, 'g:refused', this.toast);
        this.listenTo(this.laserList, 'g:import', (file) => this.guard(() => this.importExcel(file))());
        this.listenTo(this.customFieldsView, 'g:changed', this.refresh);
        this.listenTo(this.json, 'g:copy', () => this.guard(() => this.copyJson())());
        this.listenTo(this.status, 'g:goto', (violation) => this.status.revealViolation(violation, this.el));
        this.listenTo(this.status, 'g:label', this.onStatus);
        // A collection changing shape is the same news as a child announcing
        // it, and arrives by a different route when a configuration is loaded.
        this.listenTo(this.lasers, 'reset add remove', this.refresh);
        this.listenTo(this.customFields, 'reset add remove', this.refresh);
    },

    tagName: 'div',
    id: 'builderScreen',
    className: 'hidden',

    render: function () {
        this.$el.html(builderScreenTemplate());
        this.$('#configFields').append(
            this.runParameters.render().el,
            this.laserList.render().el,
            this.customFieldsView.render().el);
        this.$('.viewer-pane').append(
            this.status.render().el,
            this.json.render().el,
            this.preview.render().el);
        // A disabled fieldset blocks typing but not dragging or key-driven
        // reordering, so read-only blocks those explicitly -- and it has to be
        // the capture phase. Backbone delegates on the bubble phase, where the
        // laser list's own handlers would already have run.
        for (const name of ['dragstart', 'drop', 'keydown']) {
            this.$('#configForm')[0].addEventListener(name, this.blockWhenReadOnly, true);
        }
        this.mountTooltip();
        return this;
    },

    // ---- the configuration ------------------------------------------
    /** The shape the form and its drafts use. */
    configObject: function () {
        const values = this.runParameters.values();
        return {
            preset: this.model.get('preset'),
            run_params: {
                ...values,
                operator: values.operator || this.model.get('knownOperators')[0] || ''
            },
            laser_assignment: this.laserList.assignment(),
            parameter_import_file: this.model.get('parameterImportFile'),
            // `id` never leaves the browser: the server identifies an entry by
            // its name.
            laser_params: this.lasers.plain().map((laser) => ({
                name: laser.name,
                enabled: laser.enabled,
                is_default: laser.isDefault,
                from_import: laser.fromImport && laser.locked,
                color: laser.color,
                power: Number(laser.power),
                speed: Number(laser.speed),
                qpulsewidth: Number(laser.qpulsewidth),
                frequency: Number(laser.frequency),
                passes: Number(laser.passes)
            })),
            custom_fields: this.customFields.asObject()
        };
    },

    /** The shape the generator consumes and a submitted configuration is stored as. */
    finalConfigObject: function () {
        const config = this.configObject();
        return {
            preset: config.preset,
            run_parameters: config.run_params,
            laser_parameters: {
                ...config.laser_assignment,
                import_file: config.parameter_import_file,
                flyers: config.laser_params
            },
            custom_fields: config.custom_fields
        };
    },

    /** A draft keeps the operator as typed and the rows as entered. */
    draftObject: function () {
        const config = this.configObject();
        return {
            ...config,
            run_params: { ...config.run_params, operator: this.runParameters.raw().operator },
            custom_field_rows: this.customFields.asRows()
        };
    },

    configurationStatus: function () {
        const raw = this.runParameters.raw();
        const values = this.runParameters.values();
        return assessConfiguration({
            ...this.laserList.assignment(),
            presetFields: this.model.presetFieldNames(),
            stackState: this.model.get('stackStates')?.[raw.stackId.trim().toUpperCase()],
            duplicateStack: this.model.get('submittedStackIds').includes(raw.stackId.trim()),
            foilMaterial: values.foil_material,
            template: values.template,
            stackId: raw.stackId,
            operator: raw.operator,
            lasers: this.lasers.plain(),
            fields: this.customFields.plain(),
            layers: this.model.get('templateDetail')?.layers ?? null
        });
    },

    /**
     * Exactly what an acknowledgement would be accepting.
     *
     * Includes the warnings themselves, so a change that alters them withdraws
     * the acknowledgement even if the configuration is otherwise the same.
     */
    validationSnapshot: function () {
        return JSON.stringify({
            config: this.configObject(),
            operator: this.runParameters.raw().operator,
            lasers: this.lasers.plain(),
            fields: this.customFields.plain(),
            warnings: this.configurationStatus().warnings
        });
    },

    /** What the shell compares against to know whether the form is dirty. */
    snapshot: function () {
        return JSON.stringify({
            config: this.configObject(),
            operator: this.runParameters.raw().operator,
            fields: this.customFields.plain(),
            lasers: this.lasers.plain(),
            name: this.$('#saveAsName').val()
        });
    },

    /** Redraw everything that reads the configuration rather than owning it. */
    refresh: function (showErrors = false) {
        this.json.render();
        this.preview.render();
        this.status.render(showErrors);
    },

    /** Distribute the assessment to the sections that report parts of it. */
    onStatus: function (label, result, showErrors) {
        this.trigger('g:status', label);
        this.runParameters.renderErrors(result, showErrors);
        this.laserList.renderErrors(result, showErrors);
        this.customFieldsView.renderErrors(result, showErrors);
    },

    /**
     * Whether the configuration may be exported, and what to do about it if not.
     *
     * The decision is core/validate.js; the response is moving the reader to
     * whatever is blocking.
     */
    confirmExport: function () {
        this.refresh(true);
        const decision = exportDecision(this.configurationStatus(), this.status.isAcknowledged());
        if (decision.ok) {
            return true;
        }
        this.showTab('status');
        if (decision.focus === 'acknowledgement') {
            this.status.focusAcknowledgement();
        }
        this.toast(decision.message);
        return false;
    },

    // ---- the server --------------------------------------------------
    /**
     * Read the catalog: what foils and templates exist, and what this operator
     * has called things before.
     *
     * A failure is reported rather than thrown. The form still works -- it just
     * has nothing to choose from -- and saying so in the pickers is more use
     * than an empty screen.
     */
    loadCatalog: async function () {
        try {
            const options = await request('options');
            this.model.set({
                materials: options.materials,
                templates: options.templates,
                // Presets are not offered anywhere yet; see G1.
                presets: [],
                knownOperators: options.cache?.operators || [],
                knownFieldNames: options.cache?.field_names || []
            });
            this.runParameters.setOperator(this.currentUser.get('login'));
        } catch (error) {
            this.toast(error.message);
            this.runParameters.renderUnavailable();
        }
        this.refresh();
    },

    fetchTemplate: function (id) {
        return request('templates/' + encodeURIComponent(id));
    },

    nextStackId: function () {
        return request('next-stack-id');
    },

    /**
     * Send a workbook.
     *
     * Girder's REST layer takes JSON rather than multipart here, so the file
     * is base64'd into a payload. The size cap is client-side courtesy: the
     * server has its own.
     */
    uploadWorkbook: async function (file) {
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('Workbook exceeds 5 MB.');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return request('import-laser-params', 'POST', {
            payload: JSON.stringify({ filename: file.name, data: btoa(binary) })
        });
    },

    /** Offer a template that came from the portal, and select it. */
    useTemplate: async function (detail) {
        this.model.addTemplate(detail);
        this.runParameters.renderCatalog();
        this.runParameters.selectTemplate(detail.id);
        await this.changeTemplate();
    },

    // ---- loading and importing --------------------------------------
    /** An empty form, with one laser entry to start from. */
    blank: function () {
        this.$('#configForm')[0].reset();
        this.runParameters.setOperator(this.currentUser.get('login'));
        this.model.set({ preset: null, templateDetail: null, parameterImportFile: null, zoom: 1 });
        const preset = this.model.activePreset();
        this.lasers.replaceAll([{ isDefault: true, ...(preset?.laser_defaults || {}) }]);
        this.customFields.replaceAll(Object.entries(preset?.custom_fields || {})
            .map(([name, value]) => ({ name, value })));
        this.refresh();
    },

    /**
     * Load a configuration into the form.
     *
     * `savedSnapshot` means it came back from Girder rather than from a file
     * the operator chose, which changes whether its entries count as imported.
     */
    load: async function (config, savedSnapshot = false, name = null) {
        const cfg = toFormShape(config);
        this.model.set('preset', null);
        // A template browsed to from the portal is not in the catalog, so it
        // has to be fetched back before the picker can show it as selected.
        const templateId = cfg.run_params?.template;
        if (templateId?.startsWith('girder:') && !this.model.template(templateId)) {
            this.model.addTemplate(await this.fetchTemplate(templateId));
            this.runParameters.renderCatalog();
        }
        this.runParameters.fill(cfg.run_params);
        this.laserList.fillAssignment(layerAssignment(cfg.laser_assignment));
        this.model.set('parameterImportFile',
            savedSnapshot ? cfg.parameter_import_file ?? null : name);
        this.lasers.replaceAll(importedLasers(cfg, savedSnapshot));
        this.customFields.replaceAll(customFieldRows(cfg));
        await this.changeTemplate();
    },

    /** Read the chosen template's layers and flyer positions. */
    changeTemplate: async function () {
        const id = this.runParameters.templateId();
        this.runParameters.renderTemplateNote();
        this.model.set('templateDetail', null);
        if (id) {
            this.model.set('templateDetail', await this.fetchTemplate(id));
        }
        this.laserList.render();
        this.refresh();
    },

    importJson: async function (file, savedSnapshot = false) {
        if (!file) {
            return;
        }
        try {
            await this.load(JSON.parse(await file.text()), savedSnapshot, file.name);
            this.toast(`Imported ${file.name}`);
        } catch (error) {
            this.toast(`JSON import failed: ${error.message}`);
        } finally {
            this.trigger('g:importDone');
        }
    },

    /**
     * Replace every laser entry from a workbook.
     *
     * Imported entries arrive locked: they describe what a machine was
     * actually run at, and unlocking is a deliberate act.
     */
    importExcel: async function (file) {
        if (!file) {
            return;
        }
        this.laserList.reportImport(`Importing ${file.name}…`);
        try {
            const result = await this.uploadWorkbook(file);
            this.model.set('parameterImportFile', result.reference || result.filename);
            this.lasers.replaceAll(result.laser_params
                .map((values) => ({ ...values, fromImport: true, locked: true })));
            this.laserList.reportImport(
                `Imported ${this.lasers.length} layers from ${result.filename}.`);
            this.toast(`Imported ${this.lasers.length} laser settings`);
        } catch (error) {
            this.laserList.reportImport(error.message);
            this.toast('Excel import failed');
        } finally {
            this.laserList.clearImportInput();
        }
    },

    assignStackId: async function () {
        if (this.readOnly) {
            return;
        }
        // The button is a toggle: pressed means the server chose the value.
        if (this.runParameters.isStackIdAssigned()) {
            this.runParameters.releaseStackId(true);
        } else {
            this.runParameters.setAssignedStackId((await this.nextStackId()).stackid);
        }
        this.status.clear();
        this.refresh();
    },

    copyJson: async function () {
        if (!this.confirmExport()) {
            return;
        }
        await navigator.clipboard.writeText(JSON.stringify(this.finalConfigObject(), null, 2));
        this.toast('JSON copied to clipboard');
    },

    // ---- chrome ------------------------------------------------------
    showTab: function (name) {
        this.$('.tab').each((index, tab) => {
            const active = tab.dataset.tab === name;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active);
        });
        this.$('.viewer-panel').each((index, panel) => {
            panel.classList.toggle('active', panel.id === `${name}Panel`);
        });
    },

    /** Bring the status panel forward, which is what the topbar badge does. */
    revealStatus: function () {
        this.showTab('status');
        this.status.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },

    toast: function (message) {
        const el = this.$('#toast');
        el.text(message).addClass('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.removeClass('show'), TOAST_MS);
    },

    // Bound, because it is attached directly rather than delegated.
    blockWhenReadOnly: function (event) {
        if (this.readOnly) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    },

    /**
     * Show a saved configuration rather than offer to edit one.
     *
     * The status panel reports the lifecycle stage instead of what the form
     * would still need, and the three write actions give way to "Edit a copy".
     */
    setReadOnly: function (value, activeConfig) {
        this.readOnly = value;
        this.status.setViewStatus(value
            ? activeConfig.status[0].toUpperCase() + activeConfig.status.slice(1)
            : null);
        this.runParameters.releaseStackId();
        this.status.clear();
        this.$('#configFields').prop('disabled', value);
        this.$('#saveAsName').prop('disabled', value);
        this.$el.toggleClass('read-only', value);
        this.$('#saveGirderBtn').toggleClass('hidden', value);
        this.$('#editCopyBtn').toggleClass('hidden', !value);
        // Submit and Delete live in the topbar, which the shell owns.
        this.trigger('g:readOnly', value);
        this.refresh();
    },

    /** The line beside Save: when it was last saved, or that it cannot be. */
    setMode: function (text) {
        this.$('#builderMode').text(text);
    },

    saveAsName: function (value) {
        if (value !== undefined) {
            this.$('#saveAsName').val(value);
        }
        return this.$('#saveAsName').val();
    },

    /**
     * Render help at the document root, not in the card that asked for it.
     *
     * A tooltip inside a scrolling panel is clipped by it, and the laser cards
     * are the densest thing on the page.
     */
    mountTooltip: function () {
        const tooltip = document.createElement('div');
        tooltip.className = 'floating-help hidden';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.id = 'flycut-help-tooltip';
        document.body.append(tooltip);
        let active = null;
        const hide = () => {
            tooltip.classList.add('hidden');
            active?.removeAttribute('aria-describedby');
            active = null;
        };
        const show = (event) => {
            const button = event.target.closest?.('.help[data-tip]');
            if (!button) {
                return;
            }
            active = button;
            tooltip.textContent = button.dataset.tip;
            button.setAttribute('aria-describedby', tooltip.id);
            tooltip.classList.remove('hidden');
            // Above the button when there is room, below when there is not,
            // and never past either edge of the window.
            const rect = button.getBoundingClientRect();
            const box = tooltip.getBoundingClientRect();
            tooltip.style.left =
                Math.max(10, Math.min(rect.left, window.innerWidth - box.width - 10)) + 'px';
            tooltip.style.top =
                (rect.top >= box.height + 14 ? rect.top - box.height - 8 : rect.bottom + 8) + 'px';
        };
        const dismiss = (event) => { if (event.target.closest?.('.help')) { hide(); } };
        this.el.addEventListener('pointerover', show);
        this.el.addEventListener('focusin', show);
        this.el.addEventListener('pointerout', dismiss);
        this.el.addEventListener('focusout', dismiss);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        this.cleanupTooltip = () => {
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
            tooltip.remove();
        };
    },

    destroy: function () {
        clearTimeout(this.toastTimer);
        this.cleanupTooltip?.();
        return View.prototype.destroy.call(this);
    }
});

export default ConfigBuilderView;
