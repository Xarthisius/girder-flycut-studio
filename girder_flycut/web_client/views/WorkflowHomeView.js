/**
 * The landing screen: four modules, and the admin button G1 keeps hidden.
 *
 * It owns no state of its own. Every button announces what was asked for and
 * the shell decides what that means, because three of the four have to touch
 * the builder on the way.
 */
import { homeState } from '../core/workflow.js';
import workflowHomeTemplate from '../templates/workflowHome.pug';
import ScreenView from './ScreenView.js';
import '../stylesheets/workflowHome.styl';

const WorkflowHomeView = ScreenView.extend({
    events: {
        'click #configurationStepBtn': function () { this.trigger('g:configure', false); },
        'click #completeWorkflowBtn': function () { this.trigger('g:configure', true); },
        'click #lightburnStepBtn': function () { this.trigger('g:generation'); },
        'click #registerBtn': function () { this.trigger('g:registration'); },
        'click #adminSettingsBtn': function () { this.trigger('g:admin'); }
    },

    id: 'workflowHome',
    // The only screen that starts visible.
    className: 'workflow-home',
    template: workflowHomeTemplate,

    onFirstRender: function () {
        // Dead UI until Decision 4 lands in Phase 6 -- see G1 and
        // AdminSettingsView. Hidden here rather than in the markup so the one
        // place that decides it is the one that opens it.
        this.$('#adminSettingsBtn').addClass('hidden');
    },

    state: function () {
        return homeState({ busy: this.model.get('busy') });
    }
});

export default WorkflowHomeView;
