// What every control on the workflow home screen should be, given the state.
//
// This was `renderHome()` in the shell: twenty-five DOM writes with the rules
// spelled out inline, reachable only by slicing it out of main.js and eval'ing
// it against fake nodes. The decision is here and the writing stays in the
// view, which is the same split the rest of core/ uses.
//
// One shape per control -- `text`, `disabled`, `hidden`, `href` -- so the view
// applies it generically and never repeats a rule.

const GENERATED = ['generated', 'registered'];

/**
 * @param {object} options
 * @param {object|null} options.activeConfig the configuration the builder would open
 * @param {object[]} options.saved every configuration the user can see
 * @param {boolean} options.busy whether a request is in flight
 * @param {string} options.generationId the selected submitted configuration
 * @param {string} options.registrationId the selected generated configuration
 * @returns {Object<string, {text?: string, disabled?: boolean, hidden?: boolean, href?: string}>}
 */
export function workflowState({
    activeConfig = null, saved = [], busy = false, generationId = '', registrationId = ''
} = {}) {
    const generation = saved.find((record) => record._id === generationId);
    const registration = saved.find((record) => record._id === registrationId);
    // A mock registration has no IGSN worth linking to, so the link stays
    // hidden rather than pointing at a record that does not exist.
    const igsn = registration?.status === 'registered' && !registration.registration?.mock
        ? registration.registration?.igsn
        : null;
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
        '#savedConfigs': { disabled: busy },
        '#configurationStepBtn': { disabled: busy },
        '#completeWorkflowBtn': { disabled: busy },
        '#lightburnStepBtn': { disabled: busy },
        '#registerBtn': { disabled: busy },
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
        '#filesHint': { text: generation ? 'Status: ' + generation.status : '' },
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
