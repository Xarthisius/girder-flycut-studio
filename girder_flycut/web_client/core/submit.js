// Submitting a configuration, and what Complete Workflow does after that.
//
// This was the body of the #submitConfigBtn handler, and the last thing in the
// dashboard that tests reached by slicing main.js and eval'ing it with twelve
// injected names. It still takes its operations as arguments -- that is what
// makes it DOM-free -- but they are parameters of an exported function now
// rather than the argument list of a `new AsyncFunction`.
//
// It decides the order and the recovery. It does not touch the DOM, know what
// a screen is, or make a request.

/**
 * Where a submission ends up and what the status line says about it.
 *
 * The two failure messages name the module to continue from, because the work
 * is saved either way -- an automatic run that stops is not a lost one.
 *
 * @param {object} options
 * @param {boolean} options.completeWorkflow whether generation and registration follow
 * @param {?string} options.stage 'generation' or 'registration', when one failed
 * @param {?string} options.error the failure message, if there was one
 * @returns {{screen: string, message: string, failed: boolean}}
 */
export function submissionOutcome({ completeWorkflow = false, stage = null, error = null } = {}) {
    if (!completeWorkflow) {
        return {
            screen: 'workflowHome',
            message: 'Configuration submitted. It is now read-only.',
            failed: false
        };
    }
    if (error) {
        return {
            screen: stage === 'generation' ? 'lightburnPicker' : 'registrationPicker',
            message: `Automatic ${stage} stopped: ${error} Your saved work is retained; ` +
                'continue from this module.',
            failed: true
        };
    }
    return {
        screen: 'registrationPicker',
        message: 'Complete: configuration submitted, files generated, and stack IGSN registered.',
        failed: false
    };
}

/**
 * Submit; in Complete Workflow, generate and register as well.
 *
 * Returns null when the export gate refused, so nothing was written and the
 * caller has nothing to apply.
 *
 * @param {object} operations
 * @param {boolean} operations.completeWorkflow
 * @param {function(): boolean} operations.confirmExport the export gate
 * @param {function(): Promise} operations.persist write the configuration, submitted
 * @param {function()} operations.setReadOnly a submitted configuration cannot be edited
 * @param {function(): Promise} operations.generate
 * @param {function(): Promise} operations.register
 * @param {function(string)} operations.status report progress between the steps
 * @returns {Promise<?{screen: string, message: string, failed: boolean}>}
 */
export async function runSubmission({
    completeWorkflow, confirmExport, persist, setReadOnly, generate, register, status
}) {
    if (!confirmExport()) {
        return null;
    }
    await persist();
    setReadOnly();
    if (!completeWorkflow) {
        return submissionOutcome({ completeWorkflow: false });
    }
    // The stage is tracked rather than inferred, because both calls fail the
    // same way and the recovery screen differs.
    let stage = 'generation';
    try {
        status('Configuration submitted. Generating files…');
        await generate();
        stage = 'registration';
        status('Files generated. Registering stack IGSN…');
        await register();
    } catch (error) {
        return submissionOutcome({ completeWorkflow: true, stage, error: error.message });
    }
    return submissionOutcome({ completeWorkflow: true });
}
