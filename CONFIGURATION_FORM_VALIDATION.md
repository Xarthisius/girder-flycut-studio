# Configuration form: requirements and validation

This describes the current **01 Configuration** form, also used by **1–3 Complete
Workflow**. It distinguishes submission requirements from warnings and later
server checks. It documents implemented behavior, not additional desired rules.

## Drafts and workflow entry

- **Save** stores a draft; it does not require a complete form or acknowledgement
  of warnings. A draft may have an empty Stack ID and no material/template.
- Saved JSON must be an object no larger than 256 KiB and contain no non-finite
  JSON numbers. The optional “Save as” name is limited to 160 characters.
- A blank draft name becomes `stack<ID>-config` when an ID is present, otherwise
  `Untitled draft`. Submitted names always become `stack<ID>-config`.
- Submitted, generated, and registered configurations are read-only. The ordinary
  Configuration module permits viewing them and editing a copy.
- Complete Workflow permits **New configuration** or an **editable draft** only.
  It excludes submitted, generated, registered, and read-only draft records.
- Saving/updating requires the configured workspace and appropriate Write access.
  Existing drafts must belong to that workspace. The dashboard must be enabled
  and readable, and the user must be signed in.

## Blocking requirements before submission

| Field or condition | Requirement |
| --- | --- |
| Stack ID | Nonempty after trimming whitespace. |
| Foil material | Select a foil from the readable Girder foil catalog. The server resolves and validates the selection. |
| Template | Select a valid catalog or accessible portal template. |
| Laser settings | Enable at least one entry. |
| Custom fields | Every row with a nonblank value must have a nonblank name. Completely blank rows are ignored. |
| Registered Stack ID | Cannot be reused. |
| Generated Stack ID | Generated files must be deleted before reusing the ID. |
| Restricted Stack ID | Cannot replace a configuration outside the workspace or without Write access. |

Stack identity is checked again on submission. Concurrent changes can therefore
reject a submission even if the page previously showed it as available. An
unrelated folder already occupying the destination stack folder also blocks
submission. Existing submitted configurations can be replaced only after explicit
validation acknowledgement and with Write access.

Presets are disabled and hidden. Their required-field checks are inactive in the
current dashboard; submitted configurations store `preset: null`.

## Warnings requiring acknowledgement

A complete form displays **Needs validation** for any of these conditions:

1. Stack ID does not match `F###`, `F####`, or exactly five uppercase Crockford
   Base32 characters (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`). This format check is a
   warning, not an absolute submission restriction.
2. The Stack ID already has a submitted configuration; submission will replace it.
3. Operator is blank; the current user's login is used as a fallback.
4. Any enabled laser entry still carries the default-parameters marker.
5. Some template layers have no enabled assigned setting; their original template
   laser parameters will remain.
6. Any listed laser entry is disabled or unused by the chosen template.
7. A named custom field has no value; it exports as JSON `null`.

Open **Status**, review the listed issues, and check the validation acknowledgement
before submitting. Missing blocking requirements cannot be acknowledged away.
Form edits clear acknowledgement; it applies only to the configuration reviewed.
The server independently checks warnings and requires the acknowledgement flag.

Status meanings:

| Status | Meaning |
| --- | --- |
| Incomplete | At least one blocking requirement is missing. |
| Needs validation | Blocking requirements pass, but warnings need acknowledgement. |
| Validated | Warnings have been acknowledged for the current form contents. |
| Complete | Blocking requirements pass and there are no warnings. |
| Submitted / Generated / Registered | Saved lifecycle state shown for read-only records. |

“Complete” is not a guarantee that later generation or registration will succeed.

## Laser controls and assignment

The form allows up to 28 entries, named sequentially `F1` through `F28`. The last
remaining entry cannot be removed, but disabling all entries blocks submission.
Reordering changes the assignment order. Imported settings are initially locked.
Colors must be unique six-digit hex values such as `#3C8D40`; an invalid or duplicate
color is rejected by the color editor and independently during generation.

| Control | Declared browser input limits | Generation server checks |
| --- | --- | --- |
| Power (%) | 0–100; step 0.1 | Finite number ≥ 0; no upper-bound check. |
| Speed (mm/s) | ≥ 0.01; step 0.01 | Finite number ≥ 0. |
| QPulse (ns) | ≥ 0; step 1 | Finite number ≥ 0; no integer-only check. |
| Frequency (kHz) | ≥ 0; step 0.1 | Finite number ≥ 0. |
| Passes | ≥ 1; step 1 | Positive integer. |
| Repeat | Integer 1–10000 | Integer 1–10000, checked during submission and generation. |
| Wraparound | Checkbox | Boolean. |

The form uses custom validation with native form validation disabled. Numeric HTML
limits above are input guidance, **not all enforced submission rules**. Server
numeric laser validation happens during generation. The server also requires
1–28 laser entries and boolean `enabled` values. Legacy disabled entries may retain
null numeric values; enabled entries must have valid numbers.

Repeat assigns each entry to that many successive template layers. Wraparound
cycles through the entries when needed. Disabled entries still occupy positions.
Uncovered layers retain their template settings rather than stopping submission;
unused/disabled entries and uncovered layers produce the warnings listed above.

## Custom fields and special values

- Field names are trimmed when exported. Values are retained as strings; blank
  values become `null`. There is no general required list while presets are disabled.
- Duplicate field names are not rejected: the last row with that trimmed name wins
  in the exported object. This is current behavior, not a uniqueness guarantee.
- `test_run` is checked by the server at submission. Accepted true values are
  `true`, `yes`, `1`, `on`; false values are `false`, `no`, `0`, `off`
  (case-insensitive, surrounding whitespace ignored). An omitted, null, or empty
  value means false. Other values are rejected.
- Thickness is not required or resolved during generation. Any supplied thickness
  custom fields are preserved as ordinary custom fields; generated metadata omits
  the thickness section and material thickness.

## Additional generation checks

Generation checks the submitted configuration again, including:

- Stack ID length 1–120, no `/` or `\`, and no characters with code point below 32.
  Thus an acknowledged unusual ID may submit but still fail generation.
- Foil/template still present and accessible; valid laser settings and assignment.
- Custom fields form a named mapping whose values are strings, numbers, or null.
- Template structure contains the referenced cut settings and expected stack-ID
  placeholder; resolved thickness values are positive.
- Configuration is submitted, belongs to the workspace, and is writable. Another
  generated/registered configuration cannot reserve the same Stack ID.

## Imports and portal templates

- JSON import must parse as configuration JSON. The import reads at most 28 laser
  entries. Importing does not bypass submission or generation checks.
- Excel import accepts an `.xlsx` workbook, 1 byte–5 MiB, with at most 30 MiB of
  declared expanded ZIP content. Only the first worksheet is read.
- The first worksheet needs headers for `power` (or `maxpower`), `speed`,
  `qpulsewidth`, `frequency`, and `passes` (or `numpasses`). Headers are trimmed
  and case-insensitive. It must contain at least one parameter row. Completely
  empty rows are skipped; at most 28 rows are imported. Numeric validity is checked
  later during generation.
- A portal template must be accessible and identify a LightBurn file. If its item
  contains multiple candidate files, an exact filename is required. Template
  parsing/identity checks can reject unsupported or malformed files.

## Complete Workflow

The same submission requirements and acknowledgement apply to **Submit, generate
& register**. It then runs generation and registration in order. Draft saving never
triggers those stages. Keep the page open until completion. A failed stage preserves
saved work and opens Generation or Registration for recovery; it does not undo the
successful earlier stages. Registration additionally requires generated files,
Write access to the parent foil and output items, valid creator settings, and an
available stack IGSN. These are registration requirements, not form status checks.

## Implementation references

- `config_builder/static/app.js`: form status, acknowledgement, colors, and imports.
- `girder_flycut/client_wrapper.js`: draft saving, submission, and workflow selection.
- `girder_flycut/validation.py`: server normalization, warnings, and generation validation.
- `girder_flycut/rest.py`: access, lifecycle, size limits, and submission endpoints.
- `girder_flycut/registration.py`, `generate.py`, `engine.py`, `excel.py`: special fields
  and downstream checks.
