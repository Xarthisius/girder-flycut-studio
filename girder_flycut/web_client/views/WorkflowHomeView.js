/**
 * The landing screen: four modules.
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
        'click #registerBtn': function () { this.trigger('g:registration'); }
    },

    id: 'workflowHome',
    // The only screen that starts visible.
    className: 'workflow-home',
    template: workflowHomeTemplate,

    state: function () {
        return homeState({ busy: this.model.get('busy') });
    }
});

export default WorkflowHomeView;
