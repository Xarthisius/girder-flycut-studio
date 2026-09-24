"""Rebuild the bundled frontend using only files within this folder."""
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'girder_flycut'
html = (ROOT / 'config_builder/static/index.html').read_text().split('<body>')[1].split('<script')[0]
html = html.replace('href="/"', 'href="#dashboards"').replace('production-ready JSON', 'JSON configuration')
html = html.replace('<button id="resetBtn" class="button ghost" type="button">Reset</button>', '<button id="resetBtn" class="button ghost" type="button">Reset</button><button id="submitConfigBtn" class="button primary" type="button">Submit</button>')
html = html.replace('<select id="template" name="template"><option value="">Loading templates…</option></select>', '<div class="template-picker-row"><select id="template" name="template"><option value="">Loading templates…</option></select><button id="browseTemplateBtn" type="button" class="button ghost" aria-label="Choose template from portal" title="Choose template from portal">+</button></div>')
html = html.replace('<span class="input-wrap"><input id="stackid" name="stackid" placeholder="e.g. 00005" required></span>', '<div class="template-picker-row"><input id="stackid" name="stackid" placeholder="e.g. 00005" required><button id="autoStackIdBtn" class="button ghost" type="button" aria-label="Assign lowest available Stack ID" aria-pressed="false" title="Assign lowest available Stack ID">AUTO</button></div>')
html = html.replace('<form id="configForm" novalidate>', '<form id="configForm" novalidate><fieldset id="configFields">').replace('</form>', '</fieldset></form>')
banner = re.search(r'<header class="topbar">.*?</header>', html, re.S).group(0)
html = html.replace(banner, '')
banner = banner.replace('<b>FLYER</b><small>STUDIO</small>', '<b>FLYER STUDIO</b><small id="currentPageLabel">Home</small>')
banner = banner.replace('href="#dashboards" aria-label="Flyer Studio home"', 'href="#" id="studioHomeLink" aria-label="Flyer Studio home"')
banner = banner.replace('class="top-actions"', 'class="top-actions hidden" id="builderActions"')
html = banner + (OUT / 'workflow.html').read_text() + '<div id="builderScreen" class="hidden"><nav class="builder-nav"><button id="backWorkflowBtn" type="button" class="button ghost" aria-label="Back to workflow" title="Back to workflow">←</button><input id="saveAsName" type="text" placeholder="Save as…" aria-label="Save as" maxlength="160"><button id="saveGirderBtn" class="button primary" type="button">Save</button><span id="builderMode" aria-live="polite"></span><button id="editCopyBtn" type="button" class="button ghost hidden">Edit a copy</button></nav>' + html + '</div>'
html = html.replace('>Reset</button>', '>Delete</button>')
css = (ROOT / 'config_builder/static/styles.css').read_text().replace(':root', ':host')
css = re.sub(r'(?<![-\w])body\{', ':host{display:block;', css)
css += (OUT / 'workflow.css').read_text()
app = (ROOT / 'config_builder/static/app.js').read_text().replace('root = document', 'root = mount')
app = '\n'.join(line for line in app.split('\n') if not line.startswith('$("#resetBtn").addEventListener'))
app = app.replace('Could not load filesystem options', 'Could not load Girder catalog')
app = app.replace('$("#configForm").reset();', '$("#configForm").reset(); $("#operator").value = currentUser.get("login"); activeConfig = null; $("#artifacts").replaceChildren();')
app = app.replace('renderAutocomplete();\n    fillSelect', 'renderAutocomplete();\n    $("#operator").value = currentUser.get("login");\n    fillSelect')
app = app.replace('renderCustomFields(); loadOptions();', 'renderCustomFields(); await loadOptions();')
wrapper = (OUT / 'client_wrapper.js').read_text()
(OUT / 'web_client/main.js').write_text(wrapper.replace('/* TEMPLATE */', json.dumps(html)).replace('/* STYLES */', json.dumps(css)).replace('/* BUILDER */', app))
print('Built Flyer Studio browser bundle.')
