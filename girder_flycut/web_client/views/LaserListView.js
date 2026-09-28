/**
 * Section 02: how the template's layers are covered, and by what.
 *
 * Two controls decide the covering -- how many layers each entry repeats over,
 * and whether the list starts again when it runs out -- and then a card per
 * entry. The cards are rendered as a block rather than as a view each: entries
 * are named for their position, so almost every change renames several of them
 * and the whole list is rewritten anyway.
 *
 * Which entries are greyed out is core/laser.js's laserListState. Overflow and
 * disabled look alike and are not: an overflow entry's checkbox is disabled,
 * because its enabled state is restored if the row fits again.
 */
import { LASER_LIMIT } from '../core/laser.js';
import laserParametersTemplate from '../templates/laserParameters.html?raw';

const View = girder.views.View;

/** One entry's card. Split out because it is the only markup here worth reading. */
function card(laser, { overflow, unused }) {
    const locked = laser.locked ? 'disabled' : '';
    const field = (key, label, attrs) =>
        `<label>${label}<input data-key="${key}" ${attrs} value="${laser[key]}" ${locked}></label>`;
    return `
        <article class="laser-card ${unused ? 'unused' : ''} ${laser.locked ? 'import-locked' : ''}" data-id="${laser.id}">
          <div class="laser-head"><span class="drag-handle" draggable="true" aria-label="Drag ${laser.name} to reorder" title="Drag to reorder">⠿</span><i class="color-swatch" style="--swatch:${laser.color}"></i><span class="laser-name">Layer ${laser.name}</span>${laser.isDefault ? '<span class="default-badge">Default</span>' : ''}${laser.fromImport ? `<span class="source-badge ${laser.locked ? '' : 'edited'}">${laser.locked ? 'From Import' : 'Edited from Import'}</span>` : ''}${unused ? '<span class="unused-badge">Unused</span>' : ''}${laser.fromImport ? `<button class="lock-btn toggle-lock" type="button" aria-label="${laser.locked ? 'Unlock' : 'Restore'} imported parameters">${laser.locked ? 'Unlock' : 'Restore'}</button>` : ''}<button class="remove-btn remove-laser" type="button" aria-label="Remove laser setting">×</button></div>
          <div class="laser-grid">
            <label>Layer<input data-key="name" value="${laser.name}" readonly aria-label="Locked layer name ${laser.name}"></label>
            <div class="color-field"><span>Color</span><div class="color-controls"><input class="wheel-editor" type="color" aria-label="${laser.name} color picker" value="${laser.color}" ${locked}><input class="hex-editor" type="text" aria-label="${laser.name} hex color" value="${laser.color}" maxlength="7" placeholder="#RRGGBB" spellcheck="false" ${locked}></div></div>
            <label class="checkbox-field layer-enabled ${overflow ? 'overflow-enabled' : ''}" title="${overflow ? 'Unused by template; enabled state is restored when this row fits' : ''}"><span>Enabled</span><span class="checkbox-control"><input data-key="enabled" type="checkbox" aria-label="Enable ${laser.name}" ${!overflow && laser.enabled !== false ? 'checked' : ''} ${overflow || laser.locked ? 'disabled' : ''}></span></label>
            ${field('power', 'Power %', 'type="number" min="0" max="100" step="0.1"')}
            ${field('speed', 'Speed mm/s', 'type="number" min="0.01" step="0.01"')}
            ${field('qpulsewidth', 'QPulse ns', 'type="number" min="0" step="1"')}
            ${field('frequency', 'Frequency kHz', 'type="number" min="0" step="0.1"')}
            ${field('passes', 'Passes', 'type="number" min="1" step="1"')}
          </div>
        </article>`;
}

const LaserListView = View.extend({
    events: {
        'change #allowWraparound': 'announce',
        'input #repeatX': 'announce',
        'click #addLaserBtn': 'addEntry',
        'click #importExcelBtn': function () { this.$('#excelFile').click(); },
        'change #excelFile': function (event) { this.trigger('g:import', event.target.files?.[0]); },
        'click .remove-laser': function (event) {
            const refusal = this.collection.removeEntry(this.cardId(event.target));
            if (refusal) { this.trigger('g:refused', refusal); }
        },
        'click .toggle-lock': function (event) {
            this.collection.toggleLock(this.cardId(event.target));
        },
        'input .laser-card [data-key]': function (event) {
            // The colour editors have their own commit, on Enter or on blur,
            // because a half-typed hex is not a colour.
            if (event.target.classList.contains('hex-editor') ||
                    event.target.classList.contains('wheel-editor')) {
                return;
            }
            const key = event.target.dataset.key;
            const value = key === 'enabled' ? event.target.checked : event.target.value;
            this.collection.setField(this.cardId(event.target), key, value);
            // Switching an entry off changes which of them are used, so the
            // list restates itself; typing a number does not.
            if (key === 'enabled') { this.render(); }
            this.announce();
        },
        'change .hex-editor': function (event) { this.commitColor(event.target); },
        'change .wheel-editor': function (event) { this.commitColor(event.target); },
        'keydown .hex-editor': function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.commitColor(event.target);
            }
            if (event.key === 'Escape') {
                const card = event.target.closest('.laser-card');
                event.target.value = this.collection.get(card.dataset.id).get('color');
                card.querySelector('.wheel-editor').focus();
            }
        },
        'dragstart #laserList': 'onDragStart',
        'dragover #laserList': 'onDragOver',
        'dragleave #laserList': 'onDragLeave',
        'drop #laserList': 'onDrop',
        'dragend #laserList': 'onDragEnd'
    },

    /**
     * @param {object} settings
     * @param {BuilderModel} settings.model for the template being fitted to
     * @param {LaserCollection} settings.collection
     */
    initialize: function () {
        this.dragged = null;
        this.listenTo(this.collection, 'reset add remove', this.render);
        this.listenTo(this.model, 'change:templateDetail', this.render);
    },

    tagName: 'details',
    className: 'form-section',
    attributes: { open: 'open' },

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(laserParametersTemplate);
        }
        const state = this.collection.listState(this.model.layerCount(), this.assignment().repeat);
        this.$('#laserList').html(this.collection.plain()
            .map((laser, index) => card(laser, state.cards[index])).join(''));
        this.$('#laserCount').text(state.count);
        this.$('#addLaserBtn')
            .prop('disabled', state.addDisabled)
            .toggleClass('surplus', state.surplus)
            .attr('title', state.addTitle);
        this.$('#laserError').text(state.error);
        return this;
    },

    /** How the entries are spread across the template's layers. */
    assignment: function () {
        return {
            repeat: Number(this.$('#repeatX').val()),
            wraparound: this.$('#allowWraparound').prop('checked')
        };
    },

    fillAssignment: function ({ repeat, wraparound }) {
        this.$('#repeatX').val(repeat);
        this.$('#allowWraparound').prop('checked', wraparound);
    },

    /** Changing the spread changes which entries are used, and the preview. */
    announce: function () {
        this.render();
        this.trigger('g:changed');
    },

    addEntry: function () {
        if (this.collection.length >= LASER_LIMIT) {
            return;
        }
        // The collection's own `add` is what redraws the list and the viewers;
        // announcing it as well would do both twice.
        this.collection.addEntry({ isDefault: true });
    },

    /** The only requirement this section owns. */
    renderErrors: function (result, showErrors) {
        this.$('#laserError').text(showErrors && !result.requirements[1].ok
            ? 'Enable at least one laser parameter entry.'
            : '');
    },

    reportImport: function (message) {
        this.$('#excelStatus').text(message);
    },

    clearImportInput: function () {
        this.$('#excelFile').val('');
    },

    cardId: function (node) {
        return node.closest('.laser-card').dataset.id;
    },

    commitColor: function (input) {
        const decision = this.collection.setColor(this.cardId(input), input.value);
        input.value = decision.color;
        if (!decision.ok) {
            this.trigger('g:refused', decision.message);
            return;
        }
        this.trigger('g:changed');
    },

    // ---- reordering -------------------------------------------------
    // Only the handle starts a drag; anywhere else in a card would make the
    // number fields impossible to select.
    onDragStart: function (event) {
        const handle = event.target.closest('.drag-handle');
        if (!handle) {
            event.preventDefault();
            return;
        }
        const card = handle.closest('.laser-card');
        this.dragged = card.dataset.id;
        card.classList.add('dragging');
        event.originalEvent.dataTransfer.effectAllowed = 'move';
        event.originalEvent.dataTransfer.setData('text/plain', this.dragged);
    },

    onDragOver: function (event) {
        const card = event.target.closest('.laser-card');
        if (!card || card.dataset.id === this.dragged) {
            return;
        }
        event.preventDefault();
        this.$('.laser-card.drag-over').removeClass('drag-over');
        card.classList.add('drag-over');
        event.originalEvent.dataTransfer.dropEffect = 'move';
    },

    onDragLeave: function (event) {
        const card = event.target.closest('.laser-card');
        if (card && !card.contains(event.relatedTarget)) {
            card.classList.remove('drag-over');
        }
    },

    onDrop: function (event) {
        const card = event.target.closest('.laser-card');
        if (!card) {
            return;
        }
        event.preventDefault();
        // Past the midpoint means after, which is the only way to reach the
        // last position.
        const bounds = card.getBoundingClientRect();
        const after = event.originalEvent.clientY > bounds.top + bounds.height / 2;
        this.collection.moveEntry(this.dragged, card.dataset.id, after);
        this.dragged = null;
        this.trigger('g:changed');
    },

    onDragEnd: function () {
        this.dragged = null;
        this.$('.laser-card.dragging,.laser-card.drag-over').removeClass('dragging drag-over');
    }
});

export default LaserListView;
