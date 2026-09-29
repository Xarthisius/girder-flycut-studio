// Reading a configuration file back into the shape the form works in.
//
// Two shapes exist. The form and the drafts use `run_params` /
// `laser_assignment` / `laser_params`; what the generator consumes and what a
// submitted configuration is stored as uses `run_parameters` /
// `laser_parameters`. Every saved configuration the builder re-opens is the
// second, so this ran on every edit and was never covered by anything.
import { LASER_LIMIT } from './laser.js';

/**
 * Convert a configuration to the form's shape, whichever shape it arrived in.
 *
 * `run_parameters` is the marker: only the exported shape has it.
 */
export function toFormShape(config) {
    if (!config?.run_parameters) {
        return config || {};
    }
    return {
        preset: config.preset,
        run_params: config.run_parameters,
        laser_assignment: config.laser_parameters,
        parameter_import_file: config.laser_parameters?.import_file,
        laser_params: config.laser_parameters?.flyers,
        custom_fields: config.custom_fields,
        custom_field_rows: config.custom_field_rows
    };
}

/**
 * How many template layers each entry covers, and whether entries start again.
 *
 * `style` is the original vocabulary -- 'repeat' with an `x`, or 'exact'. Files
 * written before it became two independent fields still say that, and a saved
 * configuration is not rewritten when the format moves.
 */
export function layerAssignment(assignment = {}) {
    return {
        repeat: assignment.repeat ?? (assignment.style === 'repeat' ? assignment.x || 1 : 1),
        wraparound: assignment.wraparound ?? assignment.style !== 'exact'
    };
}

/**
 * The custom fields, as rows.
 *
 * `custom_field_rows` preserves order and keeps a named field with no value,
 * which the `custom_fields` object cannot -- it drops to null and the name
 * survives only as a key. Rows win when both are present.
 */
export function customFieldRows(config = {}) {
    return config.custom_field_rows ||
        Object.entries(config.custom_fields || {}).map(([name, value]) => ({ name, value }));
}

/**
 * Which laser entries an import contributes, and whether they arrive locked.
 *
 * Re-opening something this builder saved keeps each entry's own `from_import`
 * flag; importing a foreign file marks every entry as imported, because none of
 * it was typed here. An empty foreign import still gets one default entry to
 * start from -- an empty saved configuration is left empty, since that is what
 * was saved.
 */
export function importedLasers(config = {}, savedSnapshot = false) {
    const entries = (Array.isArray(config.laser_params) ? config.laser_params : [])
        .slice(0, LASER_LIMIT)
        .map((values) => ({
            ...values,
            fromImport: savedSnapshot ? Boolean(values.from_import) : true,
            locked: savedSnapshot ? Boolean(values.from_import) : true
        }));
    if (!entries.length && !savedSnapshot) {
        return [{ isDefault: true }];
    }
    return entries;
}
