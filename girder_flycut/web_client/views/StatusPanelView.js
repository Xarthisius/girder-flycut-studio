/**
 * What the configuration still needs, and the box that accepts what it will
 * never have.
 *
 * Requirements block submission; warnings do not, but have to be acknowledged
 * first. The acknowledgement is tied to a snapshot of what was acknowledged,
 * so editing anything afterwards silently withdraws it -- otherwise a warning
 * could be accepted and then made worse.
 *
 * Every violation is a link to the control that caused it, which is the only
 * reason the panel knows about the rest of the form.
 */
import { statusLabel } from '../core/validate.js';
import statusPanelTemplate from '../templates/statusPanel.html?raw';
import { escapeHtml } from '../util.js';

const View = girder.views.View;
/** How long a linked-to control stays highlighted after being jumped to. */
const FOCUS_MS = 1800;

const StatusPanelView = View.extend({
    events: {
        'change #validationAck': function () {
            this.acknowledged = this.$('#validationAck').prop('checked')
                ? this.snapshot()
                : null;
            this.render();
        },
        'click [data-violation]': function (event) {
            this.trigger('g:goto',
                this.status().violations[Number(event.currentTarget.dataset.violation)]);
        }
    },

    /**
     * @param {object} settings
     * @param {function} settings.status returns the assessment to display
     * @param {function} settings.snapshot returns a string identifying exactly
     *   what an acknowledgement would be accepting
     * @param {function} settings.editable whether the form may be changed
     */
    initialize: function (settings = {}) {
        this.status = settings.status;
        this.snapshot = settings.snapshot;
        this.editable = settings.editable;
        this.acknowledged = null;
    },

    tagName: 'section',
    id: 'statusPanel',
    className: 'viewer-panel status-panel',
    attributes: { role: 'tabpanel' },

    render: function (showErrors = false) {
        if (!this.$el.children().length) {
            this.$el.html(statusPanelTemplate);
        }
        const result = this.status();
        // Anything typed since the box was ticked withdraws the
        // acknowledgement, so a warning cannot be accepted and then made worse.
        if (this.acknowledged !== this.snapshot()) {
            this.clear();
        }
        const ticked = this.$('#validationAck').prop('checked');
        this.$('#validationAck').prop('disabled', !result.complete || !this.editable());
        const label = statusLabel({
            viewStatus: this.viewStatus, status: result, acknowledged: ticked
        });
        this.$('#validationAckLabel').toggleClass('hidden', label !== 'Needs validation');
        this.$('#statusSummary').text(label);
        // A saved configuration is reported by its lifecycle stage, so listing
        // what it would still need to be edited would be noise.
        this.$('#statusViolations').html((this.viewStatus ? [] : result.violations)
            .map((item, index) =>
                `<li><button type="button" class="violation-link" data-violation="${index}">` +
                `<span class="violation-kind">${item.kind}</span>${escapeHtml(item.text)}` +
                '<span aria-hidden="true"> ↗</span></button></li>').join(''));
        this.trigger('g:label', label, result, showErrors);
        return this;
    },

    /** Withdraw the acknowledgement, with the box that carries it. */
    clear: function () {
        this.acknowledged = null;
        this.$('#validationAck').prop('checked', false);
    },

    isAcknowledged: function () {
        return this.$('#validationAck').prop('checked');
    },

    /** Report a saved configuration by its stage rather than by what it lacks. */
    setViewStatus: function (viewStatus) {
        this.viewStatus = viewStatus;
    },

    /** Bring the acknowledgement into view, for when it is what is blocking. */
    focusAcknowledgement: function () {
        this.$('#validationAckLabel')[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        this.$('#validationAck').focus();
    },

    /**
     * Jump to the control a violation names.
     *
     * A disabled control cannot take focus, so the card around it is focused
     * instead -- which is what a locked or unused laser entry needs.
     */
    revealViolation: function (violation, root) {
        const field = violation && root.querySelector(violation.target);
        if (!field) {
            return;
        }
        field.closest('details')?.setAttribute('open', 'open');
        const destination = field.disabled ? field.closest('.laser-card') || field : field;
        destination.setAttribute('tabindex', '-1');
        destination.scrollIntoView({ behavior: 'smooth', block: 'center' });
        destination.focus({ preventScroll: true });
        destination.classList.add('violation-focus');
        setTimeout(() => destination.classList.remove('violation-focus'), FOCUS_MS);
    }
});

export default StatusPanelView;
