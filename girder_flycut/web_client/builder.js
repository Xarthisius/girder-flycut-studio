/**
 * The Flyer Studio configuration builder: the form, the preview and the laser
 * table. Moved here from config_builder/static/app.js in Phase 3, per Decision
 * 3 -- the plugin owns its sources now, so the five substitutions the generator
 * used to apply at build time are permanent edits instead.
 *
 * Still one function holding its state in closure variables. Phase 4 splits it
 * into Backbone views over models; what it has gained here is the ability to
 * import, which is what let the pure logic move to ./core/.
 */
import { assessConfiguration } from './core/assess.js';
import {
    makeLaser as buildLaser, restoreImportedLaser, LASER_LIMIT,
    normalizeLayerNames as renameByPosition, moveLaser as reorderLasers,
    applyMaterialDefaults as applyDefaults, usedLaserCount as countUsed,
    resolveLaserForLayer as resolveLayer
} from './core/laser.js';
import { exportDecision } from './core/validate.js';

export default async function createBuilder({ mount, currentUser, fetch }) {
    // The core takes the existing entries explicitly; the builder always
    // means "the ones currently in state".
    const makeLaser = (values) => buildLaser(values, state.laserParams);
    const $ = (selector, root = mount) => root.querySelector(selector);
    const $$ = (selector, root = mount) => [...root.querySelectorAll(selector)];
    const state = { materials: [], templates: [], templateDetail: null, laserParams: [], customFields: [], knownOperators: [], knownFieldNames: [], parameterImportFile: null, zoom: 1, submittedStackIds: [], presets: [], preset: null };
    let draggedLaserId = null;

    const normalizeLayerNames = () => renameByPosition(state.laserParams);

    const applyMaterialDefaults = (material) => applyDefaults(
        state.laserParams, material, state.presets.find((entry) => entry.id === state.preset));

    function moveLaser(sourceId, targetId, placeAfter = false) {
        reorderLasers(state.laserParams, sourceId, targetId, placeAfter);
        renderLasers();
        updateAll();
    }

    async function loadOptions() {
        try {
            const response = await fetch('/api/options');
            if (!response.ok) throw new Error('Could not load Girder catalog');
            const options = await response.json();
            state.materials = options.materials;
            state.templates = options.templates;
            state.presets = [];
            state.knownOperators = options.cache?.operators || [];
            state.knownFieldNames = options.cache?.field_names || [];
            renderAutocomplete();
            $('#operator').value = currentUser.get('login');
            fillSelect('#foilMaterial', state.materials, 'Choose a foil material');
            fillSelect('#template', state.templates, 'Choose a template');
        } catch (error) {
            toast(error.message);
            $('#foilMaterial').innerHTML = '<option value="">Backend unavailable</option>';
            $('#template').innerHTML = '<option value="">Backend unavailable</option>';
        }
        updateAll();
    }

    function fillSelect(selector, entries, placeholder) {
        const select = $(selector);
        select.innerHTML = `<option value="">${placeholder}</option>` + entries.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}${Number.isInteger(item.layer_count) ? ` · ${item.layer_count} layers` : ''}</option>`).join('');
    }

    function escapeHtml(value = '') { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

    const usedLaserCount = (layerCount) =>
        countUsed(state.laserParams, layerCount, Number($('#repeatX').value));

    function renderAutocomplete() {
        $('#operatorNames').innerHTML = state.knownOperators.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
        $('#customFieldNames').innerHTML = state.knownFieldNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
        renderRecommendations();
    }

    function renderRecommendations() {
        const added = new Set(state.customFields.map((field) => field.name.trim()).filter(Boolean));
        const suggestions = state.knownFieldNames.filter((name) => !added.has(name)).slice(0, 3);
        $('#fieldRecommendations').innerHTML = suggestions.map((name) => `<button type="button" class="recommend-field" data-field="${escapeHtml(name)}">＋ ${escapeHtml(name)}</button>`).join('');
    }

    function renderLasers() {
        const list = $('#laserList');
        const layerCount = state.templateDetail?.layers?.length ?? null;
        const usedCount = usedLaserCount(layerCount);
        list.innerHTML = state.laserParams.map((laser, index) => {
            const overflow = usedCount !== null && index >= usedCount;
            const unused = overflow || laser.enabled === false;
            return `
        <article class="laser-card ${unused ? 'unused' : ''} ${laser.locked ? 'import-locked' : ''}" data-id="${laser.id}">
          <div class="laser-head"><span class="drag-handle" draggable="true" aria-label="Drag ${laser.name} to reorder" title="Drag to reorder">⠿</span><i class="color-swatch" style="--swatch:${laser.color}"></i><span class="laser-name">Layer ${laser.name}</span>${laser.isDefault ? '<span class="default-badge">Default</span>' : ''}${laser.fromImport ? `<span class="source-badge ${laser.locked ? '' : 'edited'}">${laser.locked ? 'From Import' : 'Edited from Import'}</span>` : ''}${unused ? '<span class="unused-badge">Unused</span>' : ''}${laser.fromImport ? `<button class="lock-btn toggle-lock" type="button" aria-label="${laser.locked ? 'Unlock' : 'Restore'} imported parameters">${laser.locked ? 'Unlock' : 'Restore'}</button>` : ''}<button class="remove-btn remove-laser" type="button" aria-label="Remove laser setting">×</button></div>
          <div class="laser-grid">
            <label>Layer<input data-key="name" value="${laser.name}" readonly aria-label="Locked layer name ${laser.name}"></label>
            <div class="color-field"><span>Color</span><div class="color-controls"><input class="wheel-editor" type="color" aria-label="${laser.name} color picker" value="${laser.color}" ${laser.locked ? 'disabled' : ''}><input class="hex-editor" type="text" aria-label="${laser.name} hex color" value="${laser.color}" maxlength="7" placeholder="#RRGGBB" spellcheck="false" ${laser.locked ? 'disabled' : ''}></div></div>
            <label class="checkbox-field layer-enabled ${overflow ? 'overflow-enabled' : ''}" title="${overflow ? 'Unused by template; enabled state is restored when this row fits' : ''}"><span>Enabled</span><span class="checkbox-control"><input data-key="enabled" type="checkbox" aria-label="Enable ${laser.name}" ${!overflow && laser.enabled !== false ? 'checked' : ''} ${overflow || laser.locked ? 'disabled' : ''}></span></label>
            <label>Power %<input data-key="power" type="number" min="0" max="100" step="0.1" value="${laser.power}" ${laser.locked ? 'disabled' : ''}></label>
            <label>Speed mm/s<input data-key="speed" type="number" min="0.01" step="0.01" value="${laser.speed}" ${laser.locked ? 'disabled' : ''}></label>
            <label>QPulse ns<input data-key="qpulsewidth" type="number" min="0" step="1" value="${laser.qpulsewidth}" ${laser.locked ? 'disabled' : ''}></label>
            <label>Frequency kHz<input data-key="frequency" type="number" min="0" step="0.1" value="${laser.frequency}" ${laser.locked ? 'disabled' : ''}></label>
            <label>Passes<input data-key="passes" type="number" min="1" step="1" value="${laser.passes}" ${laser.locked ? 'disabled' : ''}></label>
          </div>
        </article>`;
        }).join('');
        $('#laserCount').textContent = `${state.laserParams.length} / ${layerCount ?? '—'}`;
        $('#addLaserBtn').disabled = state.laserParams.length >= LASER_LIMIT;
        $('#addLaserBtn').classList.toggle('surplus', layerCount !== null && state.laserParams.length >= layerCount);
        $('#addLaserBtn').title = layerCount !== null && state.laserParams.length >= layerCount ? 'Additional settings will be unused by this template' : 'Add the next layer setting';
        $('#laserError').textContent = state.laserParams.length ? '' : 'At least one laser setting is required.';
    }

    function presetFieldNames() { return Object.keys(state.presets.find((entry) => entry.id === state.preset)?.custom_fields || {}); }

    function renderCustomFields() {
        $('#customList').innerHTML = state.customFields.map((field) => `
        <div class="custom-row" data-id="${field.id}"><label>Field name<input data-key="name" ${presetFieldNames().includes(field.name) ? 'readonly' : ''} list="customFieldNames" autocomplete="off" value="${escapeHtml(field.name)}" placeholder="e.g. batch_code"></label><label>Value<input data-key="value" value="${escapeHtml(field.value)}" placeholder="Enter a value"></label><button class="remove-btn remove-custom ${presetFieldNames().includes(field.name) ? 'hidden' : ''}" type="button" aria-label="Remove custom field">×</button></div>`).join('');
        $('#customCount').textContent = `${state.customFields.length} field${state.customFields.length === 1 ? '' : 's'}`;
        renderRecommendations();
    }

    function configObject() {
        const custom = {};
        state.customFields.forEach(({ name, value }) => { if (name.trim()) custom[name.trim()] = String(value).trim() ? value : null; });
        return {
            preset: state.preset,
            run_params: { stackid: $('#stackid').value.trim(), operator: $('#operator').value.trim() || state.knownOperators[0] || '', foil_material: $('#foilMaterial').value, template: $('#template').value },
            laser_assignment: { repeat: Number($('#repeatX').value), wraparound: $('#allowWraparound').checked },
            parameter_import_file: state.parameterImportFile,
            laser_params: state.laserParams.map(({ id, fromImport, importOriginal, locked, isDefault, ...laser }) => ({ name: laser.name, enabled: laser.enabled, is_default: isDefault, from_import: fromImport && locked, color: laser.color, power: Number(laser.power), speed: Number(laser.speed), qpulsewidth: Number(laser.qpulsewidth), frequency: Number(laser.frequency), passes: Number(laser.passes) })),
            custom_fields: custom
        };
    }

    function finalConfigObject() {
        const config = configObject();
        return {
            preset: config.preset,
            run_parameters: config.run_params,
            laser_parameters: { ...config.laser_assignment, import_file: config.parameter_import_file, flyers: config.laser_params },
            custom_fields: config.custom_fields
        };
    }

    function updateAll() {
        $('#jsonOutput').textContent = JSON.stringify(finalConfigObject(), null, 2);
        validate(false);
        drawPreview();
    }

    function configurationStatus() {
        return assessConfiguration({
            presetFields: presetFieldNames(),
            stackState: state.stackStates?.[$('#stackid').value.trim().toUpperCase()],
            duplicateStack: (state.submittedStackIds || []).includes($('#stackid').value.trim()),
            foilMaterial: $('#foilMaterial').value,
            template: $('#template').value,
            stackId: $('#stackid').value,
            operator: $('#operator').value,
            lasers: state.laserParams,
            fields: state.customFields,
            layers: state.templateDetail?.layers ?? null,
            repeat: Number($('#repeatX').value),
            wraparound: $('#allowWraparound').checked
        });
    }

    let acknowledgedSnapshot = null;
    function validationSnapshot() {
        return JSON.stringify({
            config: configObject(),
            operator: $('#operator').value,
            lasers: state.laserParams,
            fields: state.customFields,
            warnings: configurationStatus().warnings
        });
    }
    function clearValidation() {
        acknowledgedSnapshot = null;
        $('#validationAck').checked = false;
    }
    $('#validationAck').addEventListener('change', () => {
        acknowledgedSnapshot = $('#validationAck').checked ? validationSnapshot() : null;
        validate(false);
    });
    for (const eventName of ['input', 'change', 'reset']) $('#configForm').addEventListener(eventName, clearValidation, true);

    function validate(showErrors = true) {
        const result = configurationStatus();
        if (acknowledgedSnapshot !== validationSnapshot()) clearValidation();
        $('#validationAck').disabled = !result.complete || Boolean($('#configFields')?.disabled);
        const statusText = state.viewStatus || (result.complete && result.warnings.length && $('#validationAck').checked ? 'Validated' : result.status);
        $('#validationAckLabel').classList.toggle('hidden', statusText !== 'Needs validation');
        $('#saveState').innerHTML = `<span></span> ${statusText}`;
        $('#saveState').dataset.status = statusText.toLowerCase().replaceAll(' ', '-');
        $('#statusSummary').textContent = statusText;
        $('#statusViolations').innerHTML = (state.viewStatus ? [] : result.violations).map((item, index) => `<li><button type="button" class="violation-link" data-violation="${index}"><span class="violation-kind">${item.kind}</span>${escapeHtml(item.text)}<span aria-hidden="true"> ↗</span></button></li>`).join('');
        $('#stackid').classList.toggle('invalid', showErrors && !result.requirements[0].ok);
        $('#stackidError').textContent = showErrors && !result.requirements[0].ok ? result.requirements[0].text : '';
        $('#runRequiredMarker').classList.toggle('hidden', result.requirements[0].ok && result.requirements[3].ok && result.requirements[4].ok);
        $('#laserError').textContent = showErrors && !result.requirements[1].ok ? 'Enable at least one laser parameter entry.' : '';
        $('#customError').textContent = showErrors && !result.requirements[2].ok ? 'Custom fields with values need names.' : '';
        $$('.custom-row').forEach((row) => {
            const field = state.customFields.find((item) => item.id === row.dataset.id);
            $("[data-key='name']", row).classList.toggle('invalid', showErrors && Boolean(String(field.value).trim()) && !field.name.trim());
            $("[data-key='value']", row).classList.remove('invalid');
        });
        return result.complete;
    }

    function confirmExport() {
        validate(true);
        // The decision lives in core/validate.js; what is left here is the DOM
        // response to it.
        const decision = exportDecision(configurationStatus(), $('#validationAck').checked);
        if (decision.ok) return true;
        $('[data-tab="status"]').click();
        if (decision.focus === 'acknowledgement') {
            $('#validationAckLabel').scrollIntoView({ block: 'center', behavior: 'smooth' });
            $('#validationAck').focus({ preventScroll: true });
        }
        toast(decision.message);
        return false;
    }

    async function changeTemplate() {
        const id = $('#template').value;
        const entry = state.templates.find((item) => item.id === id);
        $('#templateMeta').textContent = entry ? `${entry.layer_count} unique layers · ${entry.flyer_count} physical flyers` : '';
        state.templateDetail = null;
        if (id) {
            const response = await fetch(`/api/templates/${encodeURIComponent(id)}`);
            if (response.ok) state.templateDetail = await response.json();
        }
        renderLasers();
        updateAll();
    }

    const resolveLaserForLayer = (layerIndex) => resolveLayer(state.laserParams, layerIndex, {
        repeat: Number($('#repeatX').value), wraparound: $('#allowWraparound').checked
    });

    function updateAssignmentUI() {
        renderLasers(); updateAll();
    }

    function drawPreview() {
        const canvas = $('#canvas'); const flyers = state.templateDetail?.flyers || [];
        const templateLayers = state.templateDetail?.layers || [];
        const material = state.materials.find((item) => item.id === $('#foilMaterial').value);
        const materialStyle = material?.color ? `--material:${escapeHtml(material.color)};` : '';
        $('#flyerTotal').textContent = `${templateLayers.length} layers · ${flyers.length} flyers`;
        $('#previewTitle').textContent = state.templateDetail?.label || state.templateDetail?.id || 'Select a template';
        canvas.style.transform = `scale(${state.zoom})`;
        $('#zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
        if (!flyers.length) { canvas.innerHTML = '<div class="empty-preview">Choose a template to see its flyer layout.</div>'; return; }
        const xs = flyers.map((f) => Number(f.xpos)), ys = flyers.map((f) => Number(f.ypos));
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1); const size = Math.max(18, Math.min(42, 210 / Math.sqrt(flyers.length)));
        canvas.innerHTML = flyers.map((flyer) => { const layerIndex = templateLayers.indexOf(String(flyer.layer)); const { laser, augmented } = resolveLaserForLayer(layerIndex); const color = laser?.color || '#909995'; const left = 8 + ((Number(flyer.xpos) - minX) / spanX) * 84; const top = 8 + ((maxY - Number(flyer.ypos)) / spanY) * 84; const mapping = laser ? `Template ${flyer.layer} uses ${laser.name}${augmented ? ' (augmented)' : ''}` : `Template ${flyer.layer} is unchanged`; return `<div class="flyer ${laser ? '' : 'unconfigured'}" title="${escapeHtml(flyer.position)} · ${escapeHtml(mapping)}" style="--layer:${color};${materialStyle}left:calc(${left}% - ${size / 2}px);top:calc(${top}% - ${size / 2}px);width:${size}px;height:${size}px">${laser ? escapeHtml(laser.name) + (augmented ? '*' : '') : escapeHtml(flyer.layer)}</div>`; }).join('');
    }

    async function importExcel(file) {
        if (!file) return;
        const status = $('#excelStatus');
        status.textContent = `Importing ${file.name}…`;
        const body = new FormData(); body.append('file', file);
        try {
            const response = await fetch('/api/import-laser-params', { method: 'POST', body });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not import the workbook.');
            state.laserParams = [];
            state.parameterImportFile = result.reference || result.filename;
            result.laser_params.forEach((values) => state.laserParams.push(makeLaser({ ...values, fromImport: true, locked: true })));
            normalizeLayerNames(); renderLasers(); updateAll();
            status.textContent = `Imported ${state.laserParams.length} layers from ${result.filename}.`;
            toast(`Imported ${state.laserParams.length} laser settings`);
        } catch (error) {
            status.textContent = error.message; toast('Excel import failed');
        } finally { $('#excelFile').value = ''; }
    }

    async function importJson(file, savedSnapshot = false) {
        if (!file) return;
        try {
            let cfg = JSON.parse(await file.text());
            if (cfg.run_parameters) {
                cfg = {
                    preset: cfg.preset,
                    run_params: cfg.run_parameters,
                    laser_assignment: cfg.laser_parameters,
                    parameter_import_file: cfg.laser_parameters?.import_file,
                    laser_params: cfg.laser_parameters?.flyers,
                    custom_fields: cfg.custom_fields
                };
            }
            state.preset = null;
            $('#stackid').value = cfg.run_params?.stackid ?? '';
            $('#operator').value = cfg.run_params?.operator ?? '';
            $('#foilMaterial').value = state.materials.find((material) => material.id === cfg.run_params?.foil_material || material.legacyId === cfg.run_params?.foil_material)?.id ?? cfg.run_params?.foil_material ?? '';
            $('#template').value = cfg.run_params?.template ?? '';
            const assignment = cfg.laser_assignment || {};
            $('#repeatX').value = assignment.repeat ?? (assignment.style === 'repeat' ? assignment.x || 1 : 1);
            $('#allowWraparound').checked = assignment.wraparound ?? assignment.style !== 'exact';
            state.parameterImportFile = savedSnapshot ? cfg.parameter_import_file ?? null : file.name;
            state.laserParams = [];
            (Array.isArray(cfg.laser_params) ? cfg.laser_params : []).slice(0, 28).forEach((values) => state.laserParams.push(makeLaser({ ...values, fromImport: savedSnapshot ? Boolean(values.from_import) : true, locked: savedSnapshot ? Boolean(values.from_import) : true })));
            if (!state.laserParams.length && !savedSnapshot) state.laserParams.push(makeLaser({ isDefault: true }));
            state.customFields = (cfg.custom_field_rows || Object.entries(cfg.custom_fields || {}).map(([name, value]) => ({ name, value }))).map(({ name, value }) => ({ id: crypto.randomUUID(), name, value: String(value ?? '') }));
            await changeTemplate(); updateAssignmentUI(); renderCustomFields(); updateAll();
            toast(`Imported ${file.name}`);
        } catch (error) { toast(`JSON import failed: ${error.message}`); } finally { $('#jsonFile').value = ''; }
    }

    function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 1800); }

    $('#configForm').addEventListener('input', (event) => { if (event.target.closest('.laser-card')) { const card = event.target.closest('.laser-card'); const laser = state.laserParams.find((item) => item.id === card.dataset.id); if (event.target.classList.contains('hex-editor') || event.target.classList.contains('wheel-editor')) return; laser[event.target.dataset.key] = event.target.dataset.key === 'enabled' ? event.target.checked : event.target.value; if (event.target.dataset.key === 'enabled') { renderLasers(); updateAll(); return; } if (event.target.dataset.key !== 'name' && laser.isDefault) { laser.isDefault = false; card.querySelector('.default-badge')?.remove(); } } else if (event.target.closest('.custom-row')) { const row = event.target.closest('.custom-row'); state.customFields.find((item) => item.id === row.dataset.id)[event.target.dataset.key] = event.target.value; renderRecommendations(); } updateAll(); });
    $('#configForm').addEventListener('click', (event) => { const laserBtn = event.target.closest('.remove-laser'); const lockBtn = event.target.closest('.toggle-lock'); const customBtn = event.target.closest('.remove-custom'); const recommendation = event.target.closest('.recommend-field'); if (recommendation) { state.customFields.push({ id: crypto.randomUUID(), name: recommendation.dataset.field, value: '' }); renderCustomFields(); updateAll(); return; } if (lockBtn) { const laser = state.laserParams.find((item) => item.id === lockBtn.closest('.laser-card').dataset.id); if (laser.locked) laser.locked = false; else { restoreImportedLaser(laser); } renderLasers(); updateAll(); return; } if (laserBtn) { if (state.laserParams.length === 1) { toast('At least one laser setting is required.'); return; } state.laserParams = state.laserParams.filter((item) => item.id !== laserBtn.closest('.laser-card').dataset.id); normalizeLayerNames(); renderLasers(); updateAll(); } if (customBtn) { const target = state.customFields.find((item) => item.id === customBtn.closest('.custom-row').dataset.id); if (presetFieldNames().includes(target?.name)) return; state.customFields = state.customFields.filter((item) => item.id !== target.id); renderCustomFields(); updateAll(); } });
    $('#laserList').addEventListener('dragstart', (event) => { const handle = event.target.closest('.drag-handle'); if (!handle) { event.preventDefault(); return; } const card = handle.closest('.laser-card'); draggedLaserId = card.dataset.id; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedLaserId); });
    $('#laserList').addEventListener('dragover', (event) => { const card = event.target.closest('.laser-card'); if (!card || card.dataset.id === draggedLaserId) return; event.preventDefault(); $$('.laser-card.drag-over').forEach((item) => item.classList.remove('drag-over')); card.classList.add('drag-over'); event.dataTransfer.dropEffect = 'move'; });
    $('#laserList').addEventListener('dragleave', (event) => { const card = event.target.closest('.laser-card'); if (card && !card.contains(event.relatedTarget)) card.classList.remove('drag-over'); });
    $('#laserList').addEventListener('drop', (event) => { const card = event.target.closest('.laser-card'); if (!card) return; event.preventDefault(); const bounds = card.getBoundingClientRect(); moveLaser(draggedLaserId, card.dataset.id, event.clientY > bounds.top + bounds.height / 2); draggedLaserId = null; });
    $('#laserList').addEventListener('dragend', () => { draggedLaserId = null; $$('.laser-card.dragging,.laser-card.drag-over').forEach((card) => card.classList.remove('dragging', 'drag-over')); });
    $('#foilMaterial').addEventListener('change', () => { const material = state.materials.find((item) => item.id === $('#foilMaterial').value); $('#materialMeta').textContent = material ? [material.name, material.thickness_um && `${material.thickness_um} µm`, material.igsn].filter(Boolean).join(' · ') : 'Foil IGSNs from Girder'; applyMaterialDefaults(material); renderLasers(); updateAll(); });
    $('#template').addEventListener('change', changeTemplate);
    $('#allowWraparound').addEventListener('change', updateAssignmentUI);
    $('#repeatX').addEventListener('input', updateAssignmentUI);
    $('#addLaserBtn').addEventListener('click', () => { if (state.laserParams.length >= LASER_LIMIT) return; state.laserParams.push(makeLaser({ isDefault: true })); applyMaterialDefaults(state.materials.find((item) => item.id === $('#foilMaterial').value)); renderLasers(); updateAll(); });
    $('#importExcelBtn').addEventListener('click', () => $('#excelFile').click());
    $('#excelFile').addEventListener('change', (event) => importExcel(event.target.files?.[0]));

    $('#jsonFile').addEventListener('change', (event) => importJson(event.target.files?.[0]));
    $('#addCustomBtn').addEventListener('click', () => { state.customFields.push({ id: crypto.randomUUID(), name: '', value: '' }); renderCustomFields(); updateAll(); });
    $('#saveState').addEventListener('click', () => { $('[data-tab="status"]').click(); $('#statusPanel').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => { $$('.tab').forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', t === tab); }); $$('.viewer-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `${tab.dataset.tab}Panel`)); }));
    $('#copyBtn').addEventListener('click', async () => { if (!confirmExport()) return; await navigator.clipboard.writeText(JSON.stringify(finalConfigObject(), null, 2)); toast('JSON copied to clipboard'); });
    $('#zoomIn').addEventListener('click', () => { state.zoom = Math.min(1.5, state.zoom + 0.1); drawPreview(); }); $('#zoomOut').addEventListener('click', () => { state.zoom = Math.max(0.6, state.zoom - 0.1); drawPreview(); });

    state.laserParams.push(makeLaser({ isDefault: true })); updateAssignmentUI(); renderCustomFields(); await loadOptions();

    $('#statusViolations').addEventListener('click', (event) => {
        const button = event.target.closest('[data-violation]');
        if (!button) return;
        const issue = configurationStatus().violations[Number(button.dataset.violation)];
        const field = issue && $(issue.target);
        if (!field) return;
        const section = field.closest('details');
        if (section) section.open = true;
        const destination = field.disabled ? field.closest('.laser-card') || field : field;
        if (destination === field && field.disabled) destination.setAttribute('tabindex', '-1');
        if (destination !== field) destination.setAttribute('tabindex', '-1');
        destination.scrollIntoView({ behavior: 'smooth', block: 'center' });
        destination.focus({ preventScroll: true });
        destination.classList.add('violation-focus');
        setTimeout(() => destination.classList.remove('violation-focus'), 1800);
    });

    // Render help at the root so cards and scrolling panels cannot clip it.
    const tooltipRoot = $('#configForm').getRootNode();
    const tooltip = document.createElement('div');
    tooltip.className = 'floating-help hidden';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.id = 'flycut-help-tooltip';
    (tooltipRoot === document ? document.body : tooltipRoot).append(tooltip);
    let activeHelp = null;
    const hideHelp = () => { tooltip.classList.add('hidden'); activeHelp?.removeAttribute('aria-describedby'); activeHelp = null; };
    const showHelp = (event) => {
        const button = event.target.closest?.('.help[data-tip]');
        if (!button) return;
        activeHelp = button;
        tooltip.textContent = button.dataset.tip;
        button.setAttribute('aria-describedby', tooltip.id);
        tooltip.classList.remove('hidden');
        const rect = button.getBoundingClientRect();
        const box = tooltip.getBoundingClientRect();
        tooltip.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - box.width - 10)) + 'px';
        tooltip.style.top = (rect.top >= box.height + 14 ? rect.top - box.height - 8 : rect.bottom + 8) + 'px';
    };
    const dismissHelp = (event) => { if (event.target.closest?.('.help')) hideHelp(); };
    tooltipRoot.addEventListener('pointerover', showHelp);
    tooltipRoot.addEventListener('focusin', showHelp);
    tooltipRoot.addEventListener('pointerout', dismissHelp);
    tooltipRoot.addEventListener('focusout', dismissHelp);
    window.addEventListener('scroll', hideHelp, true);
    window.addEventListener('resize', hideHelp);
    // Called by the dashboard shell, which receives it through the builder
    // interface in build_dashboard.py. Nothing in this file calls it, so eslint
    // cannot see the consumer.
    // eslint-disable-next-line no-unused-vars
    function cleanupTooltips() {
        tooltipRoot.removeEventListener('pointerover', showHelp);
        tooltipRoot.removeEventListener('focusin', showHelp);
        tooltipRoot.removeEventListener('pointerout', dismissHelp);
        tooltipRoot.removeEventListener('focusout', dismissHelp);
        window.removeEventListener('scroll', hideHelp, true);
        window.removeEventListener('resize', hideHelp);
        tooltip.remove();
    }

    function commitHexColor(input) {
        const laser = state.laserParams.find((item) => item.id === input.closest('.laser-card').dataset.id);
        const value = input.value.trim();
        if (!/^#[0-9a-f]{6}$/i.test(value) || state.laserParams.some((item) => item.id !== laser.id && item.color.toLowerCase() === value.toLowerCase())) {
            input.value = laser.color;
            toast('Use a unique six-digit hex color, such as #3C8D40.');
            return;
        }
        laser.color = value.toUpperCase();
        renderLasers(); updateAll();
    }
    $('#laserList').addEventListener('change', (event) => {
        if (event.target.classList.contains('hex-editor') || event.target.classList.contains('wheel-editor')) commitHexColor(event.target);
    });
    $('#laserList').addEventListener('keydown', (event) => {
        if (!event.target.classList.contains('hex-editor')) return;
        if (event.key === 'Enter') { event.preventDefault(); commitHexColor(event.target); }
        if (event.key === 'Escape') {
            const card = event.target.closest('.laser-card');
            event.target.value = state.laserParams.find((item) => item.id === card.dataset.id).color;
            card.querySelector('.wheel-editor').focus();
        }
    });

    return { $, changeTemplate, cleanupTooltips, clearValidation, configObject, confirmExport, escapeHtml, finalConfigObject, importJson, makeLaser, renderCustomFields, state, toast, updateAll, updateAssignmentUI };
}
