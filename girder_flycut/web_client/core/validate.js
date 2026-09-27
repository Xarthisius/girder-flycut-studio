// The export gate's decision, separated from its prompting.
//
// confirmExport() in the builder mixes three things: deciding whether the
// configuration may be exported, moving focus to the Status tab, and toasting.
// Only the first is interesting, and only the first was ever asserted.

export const INCOMPLETE = 'Complete the requirements shown in Status before exporting.';
export const UNACKNOWLEDGED =
    'Review the warnings and check the validation box in Status before submitting.';

/**
 * @param {{complete: boolean, warnings: string[]}} status from assessConfiguration
 * @param {boolean} acknowledged whether the validation box is ticked
 * @returns {{ok: boolean, message: string|null, focus: string|null}}
 */
export function exportDecision(status, acknowledged) {
    if (!status.complete) {
        return { ok: false, message: INCOMPLETE, focus: 'status' };
    }
    if (status.warnings.length && !acknowledged) {
        return { ok: false, message: UNACKNOWLEDGED, focus: 'acknowledgement' };
    }
    return { ok: true, message: null, focus: null };
}
