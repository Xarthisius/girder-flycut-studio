/**
 * Choose which configuration the builder opens: a saved one, or a new one.
 *
 * The screen is the same in both modes. Complete Workflow changes what it is
 * called, adds a warning, and narrows the list to what it can still start
 * from -- which is core/records.js's selectableConfigs, reached through the
 * model because the same rule governs what happens on entering the builder.
 */
import { savedTime, selectMarkup } from '../core/records.js';
import { configurationPickerState } from '../core/workflow.js';
import configurationPickerTemplate from '../templates/configurationPicker.pug';
import ScreenView from './ScreenView.js';

const ConfigurationPickerView = ScreenView.extend({
    events: {
        'change #savedConfigs': function () {
            this.model.selectConfig(this.$('#savedConfigs').val());
            this.trigger('g:selected');
        },
        'click #buildConfigBtn': function () { this.trigger('g:build'); },
        'click #configPickerBackBtn': function () { this.trigger('g:home'); }
    },

    id: 'configurationPicker',
    template: configurationPickerTemplate,

    renderContent: function () {
        const complete = this.model.get('completeWorkflow');
        this.$('#configurationPickerTitle').text(complete ? 'Complete Workflow' : 'Configuration');
        this.$('#completeWorkflowHint').toggleClass('hidden', !complete);

        const offered = this.model.selectable();
        const active = this.model.get('activeConfig');
        this.fillPicker('#savedConfigs', selectMarkup(offered, {
            placeholder: 'New configuration',
            escapeHtml: this.escapeHtml,
            savedTime
        }), offered.some((record) => record._id === active?._id) ? active._id : '');
    },

    state: function () {
        return configurationPickerState({
            activeConfig: this.model.get('activeConfig'),
            busy: this.model.get('busy')
        });
    }
});

export default ConfigurationPickerView;
