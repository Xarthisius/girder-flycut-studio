/**
 * The state the four workflow screens share.
 *
 * It was five closure variables in the shell -- activeConfig, saved, busy,
 * completeWorkflow, readOnly -- which is why every screen had to be rendered by
 * one function that could see all of them. They are attributes now, so a screen
 * listens for the ones it cares about and renders itself. This is the half of
 * C4 that had to wait for the views: a model nothing listens to is a wrapper.
 *
 * Not a Girder resource model. There is no /flycut/workflow to fetch; this is
 * the screens' own state, and the configurations inside `saved` are plain
 * documents from GET /flycut/config. E4 gives them a server-side model in
 * Phase 5, and a FlycutConfigCollection can replace `saved` then.
 */
import { selectableConfigs } from '../core/records.js';
import { request } from '../util.js';

const Backbone = girder.Backbone;

const WorkflowModel = Backbone.Model.extend({
    defaults: function () {
        return {
            // The configuration the builder would open: a saved record, or null
            // for a new one.
            activeConfig: null,
            // Every configuration the user can see, newest-first within stage.
            saved: [],
            // A request is in flight; every control waits for it.
            busy: false,
            // Complete Workflow: submitting also generates and registers.
            completeWorkflow: false,
            // The builder is showing a configuration that may not be edited.
            readOnly: false
        };
    },

    /**
     * Re-read the configurations and the stack bookkeeping that goes with them.
     *
     * The two stack lists belong to the builder's form validation rather than to
     * any screen, so they are returned rather than stored -- but they are
     * fetched here because all three have to describe the same instant.
     *
     * @returns {Promise<{submittedStackIds: string[], stackStates: object}>}
     */
    fetchAll: async function () {
        const [saved, submittedStackIds, stackStates] = await Promise.all([
            request('config'), request('submitted-stacks'), request('stack-states')
        ]);
        // The active configuration is one of these records and may have moved
        // on since it was chosen -- submitted, generated, registered, by this
        // user or another. Re-resolve it in the same set() as `saved`, so the
        // screens render once against a consistent pair rather than twice.
        const active = this.get('activeConfig');
        this.set({
            saved,
            activeConfig: active
                ? saved.find((record) => record._id === active._id) || active
                : null
        });
        return { submittedStackIds, stackStates };
    },

    /** Records at any of the given lifecycle stages. */
    atStages: function (stages) {
        return this.get('saved').filter((record) => stages.includes(record.status));
    },

    /**
     * What the configuration picker may offer: everything, or -- in Complete
     * Workflow -- only what can still be edited.
     */
    selectable: function () {
        return selectableConfigs(this.get('saved'), this.get('completeWorkflow'));
    },

    /** Whether the active configuration can be opened for editing rather than viewing. */
    activeIsEditable: function () {
        const active = this.get('activeConfig');
        return Boolean(active && active.status === 'draft' && active.canEdit !== false);
    },

    /** Select a configuration by id, or clear the selection. */
    selectConfig: function (id) {
        this.set('activeConfig',
            this.get('saved').find((record) => record._id === id) || null);
    }
});

export default WorkflowModel;
