"""Rebuild the bundled frontend using only files within this folder.

Every substitution below is matched against literal markup in
`config_builder/static/`, so a whitespace change there silently turns one into
a no-op -- a button quietly stops existing and nothing reports it. `sub()`
therefore pins the expected number of matches and fails the build when reality
disagrees. CI additionally rebuilds and diffs, so the committed bundle can
never drift from these sources.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'girder_flycut'


class BuildError(SystemExit):
    pass


def sub(text, old, new, count=1):
    """Replace `old` with `new`, insisting on exactly `count` matches."""
    found = text.count(old)
    if found != count:
        raise BuildError(
            f'build_dashboard: expected {count} occurrence(s) of {old[:70]!r}, found {found}. '
            'The source markup moved; update this substitution.')
    return text.replace(old, new)


def resub(text, pattern, new, count=1, flags=0):
    """Regex flavour of `sub()`, with the same match-count guarantee."""
    text, found = re.subn(pattern, new, text, flags=flags)
    if found != count:
        raise BuildError(
            f'build_dashboard: expected {count} match(es) of {pattern!r}, found {found}.')
    return text


def search(text, pattern, flags=0):
    match = re.search(pattern, text, flags)
    if not match:
        raise BuildError(f'build_dashboard: {pattern!r} not found in the source markup.')
    return match.group(0)


def split_once(text, marker, index):
    if text.count(marker) < 1:
        raise BuildError(f'build_dashboard: {marker!r} not found in the source markup.')
    return text.split(marker)[index]


html = split_once((ROOT / 'config_builder/static/index.html').read_text(), '<body>', 1)
html = split_once(html, '<script', 0)
html = sub(html, 'href="/"', 'href="#dashboards"')
# A `production-ready JSON` -> `JSON configuration` substitution used to sit
# here. It matched nothing by the time these guards were added: the copy it
# targeted had already been rewritten upstream, and the build said nothing.
html = sub(
    html,
    '<button id="resetBtn" class="button ghost" type="button">Reset</button>',
    '<button id="resetBtn" class="button ghost" type="button">Reset</button>'
    '<button id="submitConfigBtn" class="button primary" type="button">Submit</button>')
html = sub(
    html,
    '<select id="template" name="template"><option value="">Loading templates…</option></select>',
    '<div class="template-picker-row">'
    '<select id="template" name="template"><option value="">Loading templates…</option></select>'
    '<button id="browseTemplateBtn" type="button" class="button ghost"'
    ' aria-label="Choose template from portal" title="Choose template from portal">+</button></div>')
html = sub(
    html,
    '<span class="input-wrap"><input id="stackid" name="stackid" placeholder="e.g. 00005" required></span>',
    '<div class="template-picker-row">'
    '<input id="stackid" name="stackid" placeholder="e.g. 00005" required>'
    '<button id="autoStackIdBtn" class="button ghost" type="button"'
    ' aria-label="Assign lowest available Stack ID" aria-pressed="false"'
    ' title="Assign lowest available Stack ID">AUTO</button></div>')
html = sub(html, '<form id="configForm" novalidate>',
           '<form id="configForm" novalidate><fieldset id="configFields">')
html = sub(html, '</form>', '</fieldset></form>')

banner = search(html, r'<header class="topbar">.*?</header>', re.S)
html = sub(html, banner, '')
banner = sub(banner, '<b>FLYER</b><small>STUDIO</small>',
             '<b>FLYER STUDIO</b><small id="currentPageLabel">Home</small>')
banner = sub(banner, 'href="#dashboards" aria-label="Flyer Studio home"',
             'href="#" id="studioHomeLink" aria-label="Flyer Studio home"')
banner = sub(banner, 'class="top-actions"', 'class="top-actions hidden" id="builderActions"')

BUILDER_NAV = (
    '<div id="builderScreen" class="hidden"><nav class="builder-nav">'
    '<button id="backWorkflowBtn" type="button" class="button ghost"'
    ' aria-label="Back to workflow" title="Back to workflow">←</button>'
    '<input id="saveAsName" type="text" placeholder="Save as…" aria-label="Save as" maxlength="160">'
    '<button id="saveGirderBtn" class="button primary" type="button">Save</button>'
    '<span id="builderMode" aria-live="polite"></span>'
    '<button id="editCopyBtn" type="button" class="button ghost hidden">Edit a copy</button></nav>')
html = banner + (OUT / 'workflow.html').read_text() + BUILDER_NAV + html + '</div>'
html = sub(html, '>Reset</button>', '>Delete</button>')

# The standalone builder styles the document; inside the dashboard it styles a
# shadow root instead, so its two document-level selectors are retargeted.
css = sub((ROOT / 'config_builder/static/styles.css').read_text(), ':root', ':host')
css = resub(css, r'(?<![-\w])body\{', ':host{display:block;')
css += (OUT / 'workflow.css').read_text()

# `$` and `$$` both default to `document`; both must resolve inside the mount.
app = sub((ROOT / 'config_builder/static/app.js').read_text(), 'root = document', 'root = mount', count=2)
lines = app.split('\n')
kept = [line for line in lines if not line.startswith('$("#resetBtn").addEventListener')]
if len(lines) - len(kept) != 1:
    raise BuildError('build_dashboard: expected exactly one top-level #resetBtn listener to drop.')
app = '\n'.join(kept)
app = sub(app, 'Could not load filesystem options', 'Could not load Girder catalog')
# A second dead substitution lived here: it appended operator/artifact resets to
# `$("#configForm").reset();`, whose only occurrence sits on the #resetBtn line
# the filter above has just deleted. It has matched nothing for as long as both
# steps have coexisted. `blank()` in client_wrapper.js already does that work.
app = sub(app, 'renderAutocomplete();\n    fillSelect',
          'renderAutocomplete();\n    $("#operator").value = currentUser.get("login");\n    fillSelect')
app = sub(app, 'renderCustomFields(); loadOptions();', 'renderCustomFields(); await loadOptions();')

# Everything the dashboard shell destructures out of the builder. The shell and
# the builder are separate files that end up sharing one closure, so nothing
# would report a mismatch at runtime -- the shell would just get `undefined`
# and fail somewhere unrelated. Both sides are checked against this list below.
BUILDER_EXPORTS = [
    '$', 'changeTemplate', 'cleanupTooltips', 'clearValidation', 'configObject',
    'confirmExport', 'escapeHtml', 'finalConfigObject', 'importJson', 'makeLaser',
    'renderCustomFields', 'state', 'toast', 'updateAll', 'updateAssignmentUI',
]


def check_builder_interface(app_source, wrapper_source):
    """Fail the build when the builder and the shell disagree on their interface."""
    for name in BUILDER_EXPORTS:
        # `\b` is useless here: `$` is not a word character, so anchor on a
        # negative lookahead for one instead.
        declared = re.search(
            r'^(?:async\s+)?(?:function\s+%s(?![\w$])|(?:const|let|var)\s+%s(?![\w$]))'
            % (re.escape(name), re.escape(name)),
            app_source, re.M)
        if not declared:
            raise BuildError(
                f'build_dashboard: {name!r} is exported to the dashboard shell but is not '
                'declared at the top level of app.js.')
    block = search(wrapper_source, r'const \{(.*?)\} = await FLYCUT_BUILDER\(', re.S)
    destructured = {n.strip() for n in block.split('{')[1].split('}')[0].split(',') if n.strip()}
    if destructured != set(BUILDER_EXPORTS):
        raise BuildError(
            'build_dashboard: client_wrapper.js destructures '
            f'{sorted(destructured)} but the builder exports {sorted(BUILDER_EXPORTS)}.')


wrapper = (OUT / 'client_wrapper.js').read_text()
check_builder_interface(app, wrapper)

# app.js is a script full of top-level state and listeners. Wrapping it in a
# function is what lets the shell call it per render instead of once per page,
# and is the first half of giving each dashboard instance its own state.
# async because the builder body contains a top-level `await loadOptions()`.
# It used to be inlined straight into the shell's async startBuilder(), which
# is what made that legal; the shell now awaits the builder instead, which
# suspends at exactly the same point.
builder = (
    'async function ({mount, currentUser, fetch}) {\n'
    + app
    + '\nreturn {' + ', '.join(BUILDER_EXPORTS) + '};\n}'
)

wrapper = sub(wrapper, "    const FLYCUT_STYLES = '';",
              '    const FLYCUT_STYLES = ' + json.dumps(css) + ';')
wrapper = sub(wrapper, "    const FLYCUT_TEMPLATE = '';",
              '    const FLYCUT_TEMPLATE = ' + json.dumps(html) + ';')
wrapper = sub(wrapper, '    const FLYCUT_BUILDER = () => ({});',
              '    const FLYCUT_BUILDER = ' + builder + ';')
(OUT / 'web_client/main.js').write_text(wrapper)
print('Built Flyer Studio browser bundle.')
