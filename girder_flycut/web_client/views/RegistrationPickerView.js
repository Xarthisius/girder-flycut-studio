/**
 * Mint a stack IGSN for a generated configuration.
 *
 * The last step, and the irreversible one: registering spends the Stack ID
 * permanently. The screen says so afterwards rather than asking first, which
 * is how it has always behaved.
 */
import { keepSelection, savedTime, selectMarkup } from '../core/records.js';
import { registrationState } from '../core/workflow.js';
import registrationPickerTemplate from '../templates/registrationPicker.pug';
import { request } from '../util.js';
import ScreenView from './ScreenView.js';

/** Registered configurations stay listed, so a minted IGSN remains reachable. */
const OFFERED = ['generated', 'registered'];

const RegistrationPickerView = ScreenView.extend({
    events: {
        'change #registrationConfigs': 'renderState',
        'click #registerStackBtn': function () { this.run(() => this.register()); },
        'click #registrationBackBtn': function () { this.trigger('g:home'); }
    },

    id: 'registrationPicker',
    template: registrationPickerTemplate,

    renderContent: function () {
        const offered = this.model.atStages(OFFERED);
        this.fillPicker('#registrationConfigs', selectMarkup(offered, {
            placeholder: 'Choose a generated configuration',
            emptyPlaceholder: 'No generated configurations',
            escapeHtml: this.escapeHtml,
            savedTime
        }), keepSelection(offered, this.selected()));
    },

    state: function () {
        return registrationState({
            saved: this.model.get('saved'),
            busy: this.model.get('busy'),
            registrationId: this.selected()
        });
    },

    /** Which configuration the button on this screen acts on. */
    selected: function () {
        return this.$('#registrationConfigs').val() || '';
    },

    /** Select by id, which is how the end of a Complete Workflow lands here. */
    select: function (id) {
        this.$('#registrationConfigs').val(id);
        this.renderState();
    },

    register: async function () {
        await request('config/' + this.selected() + '/register', 'POST');
        await this.onChanged('Stack IGSN registered. This Stack ID can no longer be reused.');
    }
});

export default RegistrationPickerView;
