// The builder's DOM-free core. Everything here is reachable without a document,
// a Girder server, or the builder's closure -- which is what lets tests import
// it instead of slicing it out of the source.
export { assessConfiguration } from './assess.js';
export {
    makeLaser, restoreImportedLaser, PALETTE, LASER_LIMIT,
    normalizeLayerNames, moveLaser, applyMaterialDefaults,
    usedLaserCount, resolveLaserForLayer, laserListState, acceptColor, COLOR_REJECTED
} from './laser.js';
export {
    materialSummary, templateSummary, catalogOptions, resolveMaterial
} from './catalog.js';
export { previewLayout, UNCONFIGURED } from './preview.js';
export {
    selectableConfigs, groupedOptions, byNewest, STAGES,
    savedTime, selectMarkup, keepSelection
} from './records.js';
export {
    workflowState, homeState, configurationPickerState,
    generationState, registrationState, keepsActiveConfig
} from './workflow.js';
export { runSubmission, submissionOutcome } from './submit.js';
export { exportDecision, statusLabel, INCOMPLETE, UNACKNOWLEDGED } from './validate.js';
