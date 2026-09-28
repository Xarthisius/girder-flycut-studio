/**
 * Turn a submitted configuration into LightBurn files, and take them back out
 * again.
 *
 * Deleting is the only destructive thing on the workflow screens, and the only
 * one that returns a Stack ID to circulation -- so it asks first, through the
 * same girder.dialog.confirm the unsaved-changes guard uses.
 */
import { keepSelection, savedTime, selectMarkup } from '../core/records.js';
import { generationState } from '../core/workflow.js';
import lightburnPickerTemplate from '../templates/lightburnPicker.html?raw';
import { ask, request } from '../util.js';
import ScreenView from './ScreenView.js';

/** Everything with files to generate or already generated. */
const OFFERED = ['submitted', 'generated'];

const GenerationPickerView = ScreenView.extend({
    events: {
        'change #submittedConfigs': 'renderState',
        'click #generateBtn': function () { this.run(() => this.generate()); },
        'click #deleteFilesBtn': function () { this.run(() => this.deleteFiles()); },
        'click #lightburnPickerBackBtn': function () { this.trigger('g:home'); }
    },

    id: 'lightburnPicker',
    template: lightburnPickerTemplate,

    renderContent: function () {
        const offered = this.model.atStages(OFFERED);
        this.fillPicker('#submittedConfigs', selectMarkup(offered, {
            placeholder: 'Choose a submitted configuration',
            emptyPlaceholder: 'No submitted configurations',
            // Registered configurations never reach this list, but the group is
            // rendered disabled in case one ever does.
            disableRegistered: true,
            escapeHtml: this.escapeHtml,
            savedTime
        }), keepSelection(offered, this.selected()));
    },

    state: function () {
        return generationState({
            saved: this.model.get('saved'),
            busy: this.model.get('busy'),
            generationId: this.selected()
        });
    },

    /** Which configuration the buttons on this screen act on. */
    selected: function () {
        return this.$('#submittedConfigs').val() || '';
    },

    /** Select by id, which is how a stalled Complete Workflow lands here. */
    select: function (id) {
        this.$('#submittedConfigs').val(id);
        this.renderState();
    },

    generate: async function () {
        await request('config/' + this.selected() + '/generate', 'POST');
        await this.onChanged('Files generated.');
    },

    deleteFiles: async function () {
        const confirmed = await ask('Delete this configuration’s generated files? It will ' +
            'return to submitted and its Stack ID can be reused.', 'Delete');
        if (!confirmed) {
            return;
        }
        await request('config/' + this.selected() + '/files', 'DELETE');
        await this.onChanged('Generated files deleted. Configuration is submitted.');
    }
});

export default GenerationPickerView;
