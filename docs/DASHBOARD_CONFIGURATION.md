# Configuring Flyer Studio

## Open the settings

Open **Flyer Studio → Dashboard settings** using the gear in the top bar.
Edit the **Settings** JSON and click **Save**. The separate in-dashboard admin
screen is hidden; this dialog is the configuration entry point.

Only users with **Admin access on this dashboard**, including Girder site
administrators, can save these settings. Read or Write access alone is not enough.
The settings gear is hidden from other users, and the server enforces the same
restriction. Readers can retrieve the settings, so do not put passwords or secrets
in this JSON. Dashboard permissions are separate from workspace and IGSN permissions.

## Prepare a shared workspace

1. Create or choose a Girder group for collaborators.
2. Create or choose a collection and a folder inside it for the workspace.
3. Give collaborators appropriate access to the collection and workspace folder.
4. Give users who register stacks Write access to the source foil IGSNs. Registration
   adds a relationship to the foil, so Read access alone is insufficient.
5. Set the workspace and output permissions in the dashboard settings below.

A group listed as a creator is attribution only: it receives no access from that
setting. A public collection does not automatically make the plugin's files public.

## Settings example

This is the current local workspace and PLACEHOLDER group. These IDs are specific
to this installation; replace them on another Girder instance. Preserve other
settings when editing individual fields.

```json
{
  "creators": [
    {"type": "group", "id": "6ab2b56649caf8a6c3474a91"}
  ],
  "creators_include_user": true,
  "owners": [
    {"type": "group", "id": "6ab2b56649caf8a6c3474a91"}
  ],
  "owners_include_user": false,
  "editors": [],
  "editors_include_user": true,
  "viewers": [],
  "viewers_include_user": false,
  "public_igsn": false,
  "public_files": false,
  "workspace_folder_id": "6ab2b56649caf8a6c3474a93",
  "workspace_path": "/collection/Flyer Studio/Workspace"
}
```

Each list accepts `{"type": "group", "id": "<group ID>"}` or
`{"type": "user", "id": "<user ID>"}`. Use the ID at the end of the group's or
user's Girder page URL, not its display name. JSON requires double quotes and
unquoted booleans (`true` / `false`), with no trailing commas.

| Setting | Meaning |
| --- | --- |
| `creators` | Attribution on new stack IGSNs. Users become personal creators; groups become organizational creators, not a list of their members. |
| `creators_include_user` | Include the user who registers the IGSN as a creator. Defaults to `true`. |
| `owners` | Users/groups receiving Girder Admin access to newly created output folders and stack IGSNs. Files inherit folder access. |
| `editors` | Users/groups receiving Write access. |
| `viewers` | Users/groups receiving Read access. |
| `owners_include_user` | Add the acting user as an owner. Defaults to `false`. |
| `editors_include_user` | Add the acting user as an editor. Defaults to `true`. |
| `viewers_include_user` | Add the acting user as a viewer. Defaults to `false`. |
| `public_igsn` | Make new stack IGSNs publicly readable. Defaults to `false`. |
| `public_files` | Make new output folders and files publicly readable. Defaults to `false`. |
| `workspace_folder_id` | Existing workspace folder inside a collection. Takes precedence over the path. |
| `workspace_path` | Existing path such as `/collection/Flyer Studio/Workspace`. Clear `workspace_folder_id` to select a different destination by path. |

The highest applicable permission wins. Configure at least one owner (or enable
`owners_include_user`) and at least one creator (or enable
`creators_include_user`). Source foil permissions are not changed by these settings.
Settings apply to new data; saving settings does not migrate existing files or
retroactively change existing IGSNs. Changing the workspace does not move old data.

## Default laser parameters

Set `laser_defaults` in Dashboard settings. These apply to entries marked DEFAULT;
explicitly edited or imported parameters are retained.

```json
"laser_defaults": {
  "maxPower": 60,
  "speed": 100,
  "QPulseWidth": 200,
  "frequency": 100,
  "numPasses": 1
}
```

Power must be 0–100, speed positive, QPulseWidth/frequency nonnegative, and numPasses
a positive integer. All values must be finite numbers. Foil names/IGSNs and optional
`thickness_um` come from Girder; packaged foil configuration files are no longer used.

## Using the modules

- **01 Configuration:** build a configuration, save drafts, validate, and submit.
- **02 Generation:** generate files from a submitted configuration.
- **03 Registration:** register a generated stack and open its IGSN.
- **1–3 Complete Workflow:** start a new configuration or edit a writable draft, validate it, then click
  **Submit, generate & register**. Submission immediately triggers generation,
  followed by registration. Keep the page open until the result appears. Saving
  a draft does not generate or register anything. If a stage fails, the saved work
  remains available in Generation or Registration for recovery. If the page is
  closed or disconnected, check those modules before retrying.

The usual validation acknowledgement still applies in Complete Workflow. Its picker
shows only New configuration and editable drafts. Use the ordinary Configuration
module to view submitted records or edit a copy, and Generation/Registration to
finish existing work. See [Configuration form validation](CONFIGURATION_FORM_VALIDATION.md)
for the complete requirements and warning rules.

For test runs, add a configuration custom field named `test_run` with value `true`.
Use `false` or omit it for ordinary runs. Stack alternate identifiers include
`stack-igsn`, `stack-<stack ID>`, and, for tests, `stack-test`. The source foil gets
`foil-igsn` and, for tests, `foil-test`. Stack sample names are
`Flyer Stack <stack ID> (<foil sample name>)`.

## Storage and metadata

Drafts have separate folders under `Workspace/Drafts`. Submission moves the draft
folder to `Workspace/stack<stack ID>`. The configuration item, LightBurn layout,
inventory CSV, metadata JSON, and registration receipt stay together there.

Girder item metadata lives in MongoDB and supports search, identifiers, and workflow
state. The config item now contains a downloadable JSON file matching `meta.config`,
with dashboard state separately in `meta.flycut`. Metadata output contents are mirrored
in `meta.metadata`; registration updates both its timestamp and the file. Editing Girder metadata
does not rewrite file contents. The IGSN's sample name, creators, and relationships
live on its separate deposition record; the registration receipt points to it.

## Common problems

- **Cannot add a creator group:** use an object with `type: "group"` and the group's
  ID, not a name or a bare string. A creator group does not grant file access.
- **Cannot save dashboard settings:** check Admin access on the dashboard itself.
- **Registration denied:** check Write access on the source foil and generated
  items, in addition to access to the dashboard.
- **File preview says `user None`:** sign in in the browser opening the link, at
  the same host. `localhost` and `127.0.0.1` do not share login cookies.
- **Workspace path change has no effect:** clear the old `workspace_folder_id`;
  an ID takes precedence over a path.
