// Two helpers every part of the dashboard needs and none of them owns.
//
// `request` was a closure in the shell and `escapeHtml` was defined in the
// builder and exported solely so the shell could render <option> markup with
// it -- the same cross-file coupling C7 removed from app.js, arrived at by a
// different route. Neither is DOM-free, so neither belongs in core/.

/**
 * A Flyer Studio REST call, with Girder's error envelope unwrapped.
 *
 * `error: null` suppresses Girder's own alert so the caller decides what a
 * failure looks like; every caller here reports it through the status line.
 */
export async function request(url, method = 'GET', data) {
    try {
        return await girder.rest.restRequest({ url: `flycut/${url}`, method, data, error: null });
    } catch (error) {
        throw new Error(error.responseJSON?.message || 'Girder request failed.');
    }
}

/** Escape for interpolation into an HTML string, via the parser rather than a regex. */
export function escapeHtml(value = '') {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

/**
 * A yes/no question, as a promise.
 *
 * girder.dialog.confirm only calls back on yes, so "no" is the modal closing
 * without that having happened -- which is why this listens for the hide as
 * well as for the callback.
 */
export function ask(text, yesText) {
    return new Promise((resolve) => {
        let confirmed = false;
        girder.dialog.confirm({
            text,
            yesText,
            yesClass: 'btn-danger',
            confirmCallback: () => { confirmed = true; resolve(true); }
        });
        girder.$('#g-dialog-container').one('hidden.bs.modal', () => {
            if (!confirmed) {
                resolve(false);
            }
        });
    });
}
