import helpTooltipTemplate from '../templates/helpTooltip.pug';
import '../stylesheets/helpTooltip.styl';

const View = girder.views.View;

export default View.extend({
    initialize: function (settings) {
        this.target = settings.target;
    },

    render: function () {
        const tooltip = this.el;
        tooltip.className = 'g-flycut-dashboard-help hidden';
        this.$el.html(helpTooltipTemplate());
        tooltip.setAttribute('role', 'tooltip');
        tooltip.id = this.cid + '-help-tooltip';
        document.body.append(tooltip);
        let active = null;
        const hide = () => {
            tooltip.classList.add('hidden');
            active?.removeAttribute('aria-describedby');
            active = null;
        };
        const show = (event) => {
            const button = event.target.closest?.('.help[data-tip]');
            if (!button) {
                return;
            }
            active = button;
            this.$('.help-text').text(button.dataset.tip);
            button.setAttribute('aria-describedby', tooltip.id);
            tooltip.classList.remove('hidden');
            // Above the button when there is room, below when there is not,
            // and never past either edge of the window.
            const rect = button.getBoundingClientRect();
            const box = tooltip.getBoundingClientRect();
            tooltip.style.left =
                Math.max(10, Math.min(rect.left, window.innerWidth - box.width - 10)) + 'px';
            tooltip.style.top =
                (rect.top >= box.height + 14 ? rect.top - box.height - 8 : rect.bottom + 8) + 'px';
        };
        const dismiss = (event) => { if (event.target.closest?.('.help')) { hide(); } };
        this.target.addEventListener('pointerover', show);
        this.target.addEventListener('focusin', show);
        this.target.addEventListener('pointerout', dismiss);
        this.target.addEventListener('focusout', dismiss);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        this.cleanupTooltip = () => {
            hide();
            window.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
            this.target.removeEventListener('pointerover', show);
            this.target.removeEventListener('focusin', show);
            this.target.removeEventListener('pointerout', dismiss);
            this.target.removeEventListener('focusout', dismiss);
        };
        return this;
    },

    destroy: function () {
        this.cleanupTooltip?.();
        return View.prototype.destroy.call(this);
    }
});
