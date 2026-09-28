// What every control on the four workflow screens should be, given the state.
//
// This was `renderHome()` in the shell: twenty-five DOM writes with the rules
// spelled out between them, reachable only by slicing it out of main.js and
// eval'ing it against fake nodes. The decision is here and the writing stays in
// the views, which is the same split the rest of core/ uses.
//
// One function per screen, because one view per screen applies it. Each returns
// one entry per control with the same four optional keys -- text, disabled,
// hidden, href -- so a view applies its own with a single loop and never
// repeats a rule. workflowState() is all four at once, which is what the shell
// used before the screens became views.

const GENERATED = ['generated', 'registered'];

/**
 * Whether entering the builder keeps the configuration that is selected.
 *
 * Complete Workflow may only start from a new configuration or an editable
 * draft, so anything further along is dropped and the run starts fresh. The
 * ordinary Configuration module keeps whatever was chosen, read-only or not.
 *
 * @param {?object} activeConfig
 * @param {boolean} completeWorkflow
 * @returns {boolean}
 */
export function keepsActiveConfig(activeConfig, completeWorkflow) {
    if (!completeWorkflow || !activeConfig) {
        return true;
    }
    return activeConfig.status === 'draft' && activeConfig.canEdit !== false;
}

/** The four module buttons. All of them wait for whatever is in flight. */
export function homeState({ busy = false } = {}) {
    return {
        '#configurationStepBtn': { disabled: busy },
        '#completeWorkflowBtn': { disabled: busy },
        '#lightburnStepBtn': { disabled: busy },
        '#registerBtn': { disabled: busy }
    };
}

/**
 * The configuration picker: which configuration the builder would open, and
 * what entering it would mean.
 */
export function configurationPickerState({ activeConfig = null, busy = false } = {}) {
    return {
        '#buildConfigBtn': {
            text: activeConfig
                ? (activeConfig.status === 'draft' ? 'Edit config' : 'View config')
                : 'Build config',
            disabled: busy
        },
        // Presets are chosen in the builder, not here. The controls are in the
        // markup and permanently off; G1 decides their fate.
        '#presetPicker': { hidden: true },
        '#presetSelect': { disabled: true },
        '#savedConfigs': { disabled: busy }
    };
}

/** The generation screen, driven by whichever submitted configuration is selected. */
export function generationState({ saved = [], busy = false, generationId = '' } = {}) {
    const generation = saved.find((record) => record._id === generationId);
    return {
        '#submittedConfigs': { disabled: busy },
        '#generateBtn': {
            disabled: busy || !generation || generation.status !== 'submitted' ||
                generation.canEdit === false
        },
        '#deleteFilesBtn': {
            hidden: generation?.status !== 'generated',
            disabled: busy || generation?.canEdit === false
        },
        '#generatedFolderLink': {
            hidden: !generation?.folderId || !GENERATED.includes(generation?.status),
            href: generation?.folderId ? '#folder/' + generation.folderId : '#'
        },
        '#filesHint': { text: generation ? 'Status: ' + generation.status : '' }
    };
}

/** The registration screen, driven by whichever generated configuration is selected. */
export function registrationState({ saved = [], busy = false, registrationId = '' } = {}) {
    const registration = saved.find((record) => record._id === registrationId);
    // A mock registration has no IGSN worth linking to, so the link stays
    // hidden rather than pointing at a record that does not exist.
    const igsn = registration?.status === 'registered' && !registration.registration?.mock
        ? registration.registration?.igsn
        : null;
    return {
        '#registrationConfigs': { disabled: busy },
        '#registerStackBtn': {
            disabled: busy || registration?.status !== 'generated' ||
                registration?.canEdit === false
        },
        '#registrationHint': {
            text: registration?.status === 'registered'
                ? 'Registered · ' + (registration.registration?.igsn || '')
                : ''
        },
        '#viewIgsnLink': {
            hidden: !igsn,
            href: igsn ? '#igsn/' + encodeURIComponent(igsn) : '#'
        }
    };
}

/**
 * All four screens at once.
 *
 * @param {object} options
 * @param {object|null} options.activeConfig the configuration the builder would open
 * @param {object[]} options.saved every configuration the user can see
 * @param {boolean} options.busy whether a request is in flight
 * @param {string} options.generationId the selected submitted configuration
 * @param {string} options.registrationId the selected generated configuration
 * @returns {Object<string, {text?: string, disabled?: boolean, hidden?: boolean, href?: string}>}
 */
export function workflowState(options = {}) {
    return {
        ...configurationPickerState(options),
        ...homeState(options),
        ...generationState(options),
        ...registrationState(options)
    };
}
