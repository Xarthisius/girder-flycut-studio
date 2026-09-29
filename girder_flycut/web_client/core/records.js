// Ordering and grouping of saved configurations for the workflow pickers.
//
// Lifted out of the dashboard shell, where both functions were closures over
// `completeWorkflow` and over the shell's `escapeHtml` and `savedTime` helpers.
// Passing those in is what makes the grouping testable on plain arrays.

export const STAGES = ['draft', 'submitted', 'generated', 'registered'];

/** Complete Workflow may only start from a new configuration or an editable draft. */
export function selectableConfigs(records, completeWorkflow) {
    return completeWorkflow
        ? records.filter((record) => record.status === 'draft' && record.canEdit !== false)
        : records;
}

/** Newest first, falling back to id so the order is total and stable. */
export function byNewest(a, b) {
    return (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0) ||
        String(a._id).localeCompare(String(b._id));
}

/**
 * `<optgroup>` markup, one group per lifecycle stage, empty stages omitted.
 * `escapeHtml` and `savedTime` come from the caller because both are DOM-bound
 * in the shell.
 */
export function groupedOptions(records, { disableRegistered = false, escapeHtml, savedTime } = {}) {
    const option = (record) =>
        `<option value="${escapeHtml(record._id)}">${escapeHtml(record.name)} · ` +
        `${escapeHtml(savedTime(record))} · ${escapeHtml(record.status)}</option>`;
    return STAGES.map((stage) => {
        const entries = records.filter((record) => record.status === stage).sort(byNewest);
        if (!entries.length) {
            return '';
        }
        const disabled = disableRegistered && stage === 'registered' ? 'disabled' : '';
        const label = stage[0].toUpperCase() + stage.slice(1);
        return `<optgroup ${disabled} label="${label}">${entries.map(option).join('')}</optgroup>`;
    }).join('');
}

/** When a record was last saved, in the reader's locale. Empty if never. */
export function savedTime(record) {
    return record?.savedAt ? new Date(record.savedAt).toLocaleString() : '';
}

/**
 * A whole picker's `<select>` markup: the placeholder, then the grouped records.
 *
 * The placeholder says something different when there is nothing to choose,
 * which is the only reason this is not just groupedOptions with a prefix.
 */
export function selectMarkup(records, {
    placeholder, emptyPlaceholder = placeholder, disableRegistered = false, escapeHtml, savedTime: format
} = {}) {
    const label = records.length ? placeholder : emptyPlaceholder;
    return `<option value="">${escapeHtml(label)}</option>` +
        groupedOptions(records, { disableRegistered, escapeHtml, savedTime: format });
}

/** Keep a picker's selection across a refresh, but only if it is still offered. */
export function keepSelection(records, selected) {
    return records.some((record) => record._id === selected) ? selected : '';
}
