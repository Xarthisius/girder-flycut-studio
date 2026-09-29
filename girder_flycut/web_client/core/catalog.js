// The Girder catalog the builder chooses from: foil materials and templates.
//
// Three one-line decisions that were interleaved with the DOM writes they fed.
// Small, but each is a sentence a person reads off the form, and none of them
// was reachable without a document.

/** The note under the foil picker: what was chosen, and what it is. */
export function materialSummary(material) {
    if (!material) {
        return 'Foil IGSNs from Girder';
    }
    return [
        material.name,
        material.thickness_um && `${material.thickness_um} µm`,
        material.igsn
    ].filter(Boolean).join(' · ');
}

/**
 * The note under the template picker.
 *
 * Unique layers and physical flyers differ whenever a layout repeats a layer,
 * which is most of them, so both are named.
 */
export function templateSummary(template) {
    return template
        ? `${template.layer_count} unique layers · ${template.flyer_count} physical flyers`
        : '';
}

/**
 * `<option>` markup for a catalog select.
 *
 * Templates carry a layer count and materials do not, which is the only reason
 * one function serves both.
 */
export function catalogOptions(entries, placeholder, escapeHtml) {
    return `<option value="">${escapeHtml(placeholder)}</option>` + entries.map((item) => {
        const layers = Number.isInteger(item.layer_count) ? ` · ${item.layer_count} layers` : '';
        return `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}${layers}</option>`;
    }).join('');
}

/**
 * Resolve an imported configuration's foil to one this catalog offers.
 *
 * Materials were referenced by a legacy id before they were IGSNs, and saved
 * configurations still carry those. An unknown value is passed through rather
 * than dropped, so the form shows what the file said and the status panel can
 * complain about it.
 */
export function resolveMaterial(materials, reference) {
    const match = materials.find(
        (material) => material.id === reference || material.legacyId === reference);
    return match?.id ?? reference ?? '';
}
