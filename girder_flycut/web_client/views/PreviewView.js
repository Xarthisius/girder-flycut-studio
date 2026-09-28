/**
 * The LightBurn recreation: one disc per flyer, coloured by the entry that
 * drives its layer.
 *
 * The arithmetic is core/preview.js. What is left here is the markup and the
 * zoom, which is the panel's own state rather than the configuration's -- it
 * is not saved and does not make the form dirty.
 */
import { previewLayout } from '../core/preview.js';
import previewPanelTemplate from '../templates/previewPanel.html?raw';
import { escapeHtml } from '../util.js';

const View = girder.views.View;
const EMPTY = '<div class="empty-preview">Choose a template to see its flyer layout.</div>';

const PreviewView = View.extend({
    events: {
        'click #zoomIn': function () { this.model.setZoom(this.model.get('zoom') + 0.1); },
        'click #zoomOut': function () { this.model.setZoom(this.model.get('zoom') - 0.1); }
    },

    /**
     * @param {object} settings
     * @param {function} settings.assignment reads {repeat, wraparound} off the
     *   laser section, which owns those two controls
     * @param {function} settings.materialId reads the chosen foil off the run
     *   parameters, for the disc backing colour
     */
    initialize: function (settings = {}) {
        this.lasers = settings.lasers;
        this.assignment = settings.assignment;
        this.materialId = settings.materialId;
        // Zoom and the template are this panel's alone. Everything else that
        // changes the picture reaches it through the builder's refresh(), so
        // listening to the entries as well would redraw it twice a keystroke.
        this.listenTo(this.model, 'change:templateDetail change:zoom', this.render);
    },

    tagName: 'section',
    id: 'previewPanel',
    className: 'viewer-panel active',
    attributes: { role: 'tabpanel' },

    render: function () {
        if (!this.$el.children().length) {
            this.$el.html(previewPanelTemplate);
        }
        const detail = this.model.get('templateDetail');
        const zoom = this.model.get('zoom');
        this.$('#flyerTotal').text(
            `${(detail?.layers || []).length} layers · ${(detail?.flyers || []).length} flyers`);
        this.$('#previewTitle').text(detail?.label || detail?.id || 'Select a template');
        this.$('#canvas').css('transform', `scale(${zoom})`);
        this.$('#zoomLabel').text(`${Math.round(zoom * 100)}%`);

        const { size, flyers } = previewLayout({
            flyers: detail?.flyers || [],
            layers: detail?.layers || [],
            lasers: this.lasers.plain(),
            ...this.assignment()
        });
        if (!flyers.length) {
            this.$('#canvas').html(EMPTY);
            return this;
        }
        // The foil tints the disc behind the layer colour, so a stack reads as
        // the material it is cut from.
        const material = this.model.material(this.materialId());
        const backing = material?.color ? `--material:${escapeHtml(material.color)};` : '';
        this.$('#canvas').html(flyers.map((flyer) =>
            `<div class="flyer ${flyer.unconfigured ? 'unconfigured' : ''}" ` +
            `title="${escapeHtml(flyer.position)} · ${escapeHtml(flyer.title)}" ` +
            `style="--layer:${flyer.color};${backing}` +
            `left:calc(${flyer.left}% - ${size / 2}px);top:calc(${flyer.top}% - ${size / 2}px);` +
            `width:${size}px;height:${size}px">${escapeHtml(flyer.label)}</div>`).join(''));
        return this;
    }
});

export default PreviewView;
