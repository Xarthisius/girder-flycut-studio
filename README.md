# Flyer Studio 1.0

Self-contained source folder for the current Flyer Studio Girder plugin. Includes the browser bundle, editable frontend sources, backend, LightBurn templates and layout sidecars, tests, and the local girder-dashboards dependency. The IGSN integration requires Xarthisius’s girder-jsonforms plugin from its igsn branch.

## Install

Use an environment with Python 3.10+ and MongoDB. From this folder:

```sh
# In a directory alongside this repository:
git clone https://github.com/Xarthisius/girder-jsonforms.git ../girder-jsonforms
git -C ../girder-jsonforms checkout 52f29b751c14902b20ee3ca6f1870186ca0d37d1
git -C ../girder-jsonforms apply ../girder-flycut-studio/patches/girder-jsonforms-flycut.patch
python -m pip install -e ../girder-jsonforms
python -m pip install ./vendor/girder-dashboards .
```

The bundled dashboard dependency requires Girder 5.0.13.dev27 or newer. Pip still needs access to standard Python dependencies unless they are already installed. This folder is not a bundled Python runtime or database.

Build the JSONForms frontend with `npm install && npm run build` in its `girder_jsonforms/web_client` folder, and enable/load the `jsonforms` plugin alongside Flyer Studio.

Start your Girder server with its normal MongoDB and assetstore configuration, then enable **Flyer Studio** in the dashboards administration page and grant the intended users access. The plugin entry point is `flycut`, Python package is `girder_flycut`, and distribution remains `girder-flycut` to replace the current installation cleanly. Do not install the older, separate studio implementation alongside it.

The supplied JSONForms patch is required: it adds configurable child titles/relationships and avoids unrelated AIMDL hooks on standalone installations. See [dependency notes](patches/README.md).

## Features

- Draft → submitted → generated → registered lifecycle.
- LightBurn layout, inventory CSV, and JSON metadata generation.
- Foil choices come from readable Girder depositions whose Local alternate identifier (or local_id) contains `foilIGSN`, case-insensitively.
- Registration creates `<foil IGSN>-<stack ID>` as a child deposition using JSONForms. With `jsonforms.igsn_service_url` empty, registration stays on the local Girder instance.
- Foil identity/name come from Girder. Laser defaults come from dashboard settings. Foil thickness is not required for generation and is omitted from generated material metadata. No packaged foil configs are used.
- Submitted configurations can be replaced after validation; generated files must be deleted before reuse; registered stack IDs cannot be reused.
- Portal template selection, stored Excel inputs with multiple stack links, and validation.
- Complete Workflow performs submission, generation, and registration in sequence. Presets are disabled.

Saved user data and generated files live in Girder/MongoDB and its assetstore. They are not included here. No local preview accounts, passwords, or database dumps are packaged.

## Edit and rebuild

Edit `config_builder/static/` for the form and `girder_flycut/client_wrapper.js`, `workflow.html`, and `workflow.css` for the Girder workflow. Rebuild the committed browser bundle with:

```sh
python build_dashboard.py
```

No Node dependencies are needed for that build. Backend generation helpers are included directly in `girder_flycut/engine.py` and `excel.py`; the original CLI repository is not required. Templates are in `girder_flycut/inputs/templates/`; the served layout catalog is `catalog.json`. Foils come from Girder and laser defaults from dashboard settings.

## Package and test

```sh
python -m pip wheel --no-deps . --wheel-dir dist
node tests/status.cjs
node tests/workflow.cjs
```

Backend tests require pytest, pytest-girder, a disposable MongoDB test database, and an installed copy of this plugin. Integration tests require girder-jsonforms from its `igsn` branch and exercise local IGSN creation without contacting the central registry. Never point tests at a production database.

The bundled dashboards dependency retains its BSD-3-Clause license in `vendor/girder-dashboards/LICENSE`.

## Registration metadata

Stacks use `IsDerivedFrom` for their foil relationship; the foil uses `IsSourceOf`
for each stack. The stack's creator is the signed-in registrant. Stack Local
alternate identifiers are `stack-igsn` and `stack-<stack ID>`; foils use `foil-igsn`.
Legacy `foilIGSN` markers remain discoverable. Set custom field `test_run` to
`true` (also accepts `yes` or `1`) to additionally mark the stack `stack-test` and
its foil `foil-test`; `false`, `no`, or `0` do not add test markers.

The configuration item and its JSON file preserve the form JSON under `meta.config`.
Output items carry identifiers; metadata JSON is mirrored under `meta.metadata`. Presets are
currently disabled; existing explicit settings and custom fields are retained.
The Generation picker excludes registered configurations. Registration keeps
registered configurations available with a **View IGSN** link.

## Admin settings and shared storage

See [Configuration form validation](CONFIGURATION_FORM_VALIDATION.md) for form requirements, acknowledgement rules, and downstream checks.

See [Dashboard configuration](DASHBOARD_CONFIGURATION.md) for setup instructions, a complete settings example, permissions, and the Complete Workflow module.

Administrators configure the policy through Girder’s **Dashboard settings** (the settings gear), using its Settings JSON object. The in-dashboard settings screen is hidden. Set the workspace folder ID/path and the users/groups for creators, owners, editors, and viewers; principal entries use `{"type": "group", "id": "<Girder group ID>"}` or `{"type": "user", "id": "<Girder user ID>"}`. The destination is stored
by folder ID (`workspace_folder_id`); `workspace_path` displays its current path
and can also be entered when configuring a destination. Renaming the destination
does not break the reference.

`creators` is IGSN attribution: users become personal creators, groups become
organizational creators, and `creators_include_user` adds the registrant without
duplicates. Girder's `creatorId` remains the actual registrant for auditing.
`owners`, `editors`, and `viewers` grant ADMIN, WRITE, and READ respectively to
new configuration folders and stack IGSNs. Each corresponding `*_include_user`
flag adds the acting user. The highest applicable level wins. At least one
owner must be configured. The parent foil's access is not changed by registration;
registrants need WRITE access on the foil to add a child relationship.

`public_igsn` controls new stack visibility. `public_files` separately controls
new configuration folders and their files. Defaults are private, with the acting
user included as editor and registrant included as creator. A collection's
public visibility does not override these output settings. Collaborators need
access to the collection/workspace as well as the generated folders.

Draft configurations get individual folders under `Workspace / Drafts`. Submission moves and renames the same folder to `Workspace / stack<stack ID>`, independent of the draft or configuration name. Each submitted stack has one stable folder under the workspace. Its configuration
item, LightBurn output, inventory, metadata JSON, and registration receipt live
together. Regeneration reuses that folder. The dashboard lists configurations
readable by the current user; mutation endpoints require WRITE access and verify
that the configuration is physically inside the configured workspace. Stack IDs
remain globally reserved to prevent duplicate IGSNs across old workspaces.

Changes apply to new configurations and registrations, not retroactively to
existing folders or IGSNs. Choosing another workspace does not move old data.
The initial local conversion was performed separately with a backup and native
Girder moves, preserving item/file IDs and download links.

Stack IGSN sample names use `Flyer Stack <stack ID> (<foil sample name>)`.
The foil's own name is unchanged.

Girder metadata and downloaded JSON are separate representations. New config items
store the form JSON under `meta.config` and workflow state under `meta.flycut`, with
a real JSON file containing that same config. New metadata output items mirror their
file under `meta.metadata`. The plugin updates both representations during its
workflow; arbitrary manual metadata edits do not rewrite file bytes. IGSN titles,
creators, and relationships live on the separate deposition record.

Private file previews require a valid Girder session in the browser opening the
link. Ordinary download/inline links authenticate with the `girderToken` cookie;
API clients can send a `Girder-Token` header. An access error reporting `user None`
means the request was not authenticated. Sign in at the same host as the link
(for example, `127.0.0.1` and `localhost` do not share cookies).

### Output format (new generations)

Template selection/upload starts at the configured workspace. Bundled LightBurn
files store a short stable template ID in the `id` layer's `subname`: `5x5`, `6x2`,
`7x7`, or `7x7-iso`. Generated files retain that ID so renamed generated layouts can
resolve their original format. Older filename-based IDs remain readable.

The saved `-config` item now contains an actual JSON file matching the form's JSON
preview. Its `meta.config` is the same JSON object; `meta.flycut` holds only dashboard
state. Draft-only editor rows are retained separately in that state.

All output items and the stack folder have `foilIgsn`, `igsn`, and `stackid`.
`stackIgsn`, `stackId`, and `stackDepositionId` are no longer emitted as item/folder
metadata. Layout and inventory items do not duplicate the config.

Inventory CSV columns `time_registered`, `time_machined`, and `time_retired` replace
`t1`, `t2`, and `t3`; pending times are blank. Status starts as `specified`, then becomes
`registered` with its timestamp when registration succeeds. File IDs are preserved.

The metadata file is mirrored exactly in `meta.metadata`. It has custom fields,
final flyer settings, material `igsn` and `name`, and source `Girder Flyer Studio v1.0`.
It has `time_submitted`, `time_generated`, `time_registered`, and `time_machined`, with
null for pending events. Registration updates both the file and its metadata mirror.
For uploaded layouts, template name is the uploaded filename, while version comes
from the inherited original template.

Flyer groups are `default` for config settings marked `is_default`, `TF<n>` for
unchanged template layers, and the first matching output layer name for identical
explicit settings. `unique_safe` is true for Girder generation; `overwrite_safe`
starts true and becomes permanently false after replacing a submitted configuration
or deleting generated files to return to submitted.

Excel uploads are retained under `Workspace/Excel Imports`. The form JSON records
the filename, Girder file ID, and item ID. Registration sets only `meta.igsn` on the workbook item and adds its item ID to
`flycutInputs` on the IGSN. The `igsn` value is a list, allowing one workbook to link to multiple stacks without duplicates. Old filename-only import references cannot
recover an original workbook that was never stored.

These changes apply to new data. Existing files are not migrated.
