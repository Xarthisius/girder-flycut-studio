# Development

Follow the [README](../README.md) to install the dashboards dependency and the pinned,
patched JSONForms dependency into a Girder 5 environment. MongoDB is required.
Use a separate database for tests; the runtime, database, and uploaded data are not
part of this source repository.

Run the commands below from the repository root.

## Frontend

Everything lives in `girder_flycut/web_client/`, which is its own npm project --
girder's `build_plugins.py` looks for `web_client/package.json` and silently skips a
plugin that has none:

```
main.js          the shell: which screen shows, the status line, the busy guard
core/            DOM-free logic, reachable without a document or a server
models/          WorkflowModel, BuilderModel, and the two entry models
collections/     LaserCollection, CustomFieldCollection
views/           eleven views: five screens, the builder and its six children
templates/       one .pug per view, plus the shared mixins
stylesheets/     one .styl per view, plus variables.styl
vite.config.ts   the lib build, with the Pug plugin
package.json     the client's own build; the root one lints and tests
```

The repository root is a second npm project, holding the checks that span it:

```sh
npm ci                                  # once, at the root
cd girder_flycut/web_client && npm ci   # once, for the build
npm run lint    # eslint, then pug-lint, then stylelint
npm run build   # delegates to the client project
npm test        # the five suites, including tests/bundle.cjs
```

`npm run build` checks that `setup.py` and the client's `package.json` agree on a
version, then bundles with Vite into `girder_flycut/web_client/dist/`, which is not
committed. CI builds it and the wheel ships only `dist/`.

Every rule in the stylesheet is scoped under `.g-flycut-dashboard`. There is no shadow
root any more, so that class is the only thing keeping the dashboard's styles away from
Girder core; `tests/bundle.cjs` fails the build if a rule escapes it. The Stylus files
nest under that class rather than repeating it, which is why it appears once per file.

No test reads source as text. Everything a test needs is importable from `core/`, which
is the point of that directory; issue D1 closed when the last slice went.

`tests/bundle.cjs` loads the built UMD bundle against a stub `girder` global. Vite
minifies the lib build, so it asserts runtime wiring and payload content rather than
anything about identifiers.

`.eslintrc.md` records the one rule that is off permanently and why nothing else is.

## Backend tests and packaging

```sh
python -m pip install -r requirements-dev.txt
ruff check .
pytest tests --mongo-uri mongodb://127.0.0.1:27017 -q --cov=girder_flycut --cov-report=term
python -m pip wheel --no-deps . --wheel-dir dist
```

Integration tests exercise Girder permissions, actual file contents, local IGSN
registration, reusable Excel inputs, and lifecycle recovery. They do not register
identifiers with an external service. Some tests additionally require openpyxl,
provided by the JSONForms dependency. JavaScript tests cover validation and workflow
state; the older browser harness is supplementary, not a deployed-portal test.

## Architecture

- `rest.py`: permission-checked configuration, generation, and registration routes.
- `artifacts.py`: canonical config JSON files, associations, metadata mirrors.
- `generate.py`, `engine.py`: LightBurn, CSV, and resolved JSON output.
- `template_identity.py`, `portal_templates.py`: short template identity inheritance.
- `materials.py`, `settings.py`: live Girder foils and dashboard policy.
- `import_storage.py`, `inventory.py`: Excel inputs and CSV registration timestamps.

Settings and data formats are documented in [Dashboard configuration](DASHBOARD_CONFIGURATION.md),
[Configuration form validation](CONFIGURATION_FORM_VALIDATION.md), and the [README](../README.md). Draft → submitted → generated →
registered is the supported lifecycle. Complete Workflow uses the same API stages.

Stack-level MongoDB locks serialize writes. Completed generation/registration is
idempotent. Durable `flycut_registration` reservations survive uncertain registry
failures; reconcile the local and remote state before clearing one. Similarly,
inspect active work before clearing `meta.flycut.busy` after a process crash.
Generation is synchronous. Request limits bound imported workbooks and templates.

## Release scope

Version 1.0.0 is the source/plugin release, not a packaged Girder deployment.
Public publishing of IGSNs depends on separately configured JSONForms services.
No migration of historical output files is performed automatically.

## Browser verification

```sh
cd test/browser && npm ci && npx playwright install chromium && cd ../..
GIRDER_URL=... GIRDER_ADMIN=... GIRDER_PASSWORD=... python3 test/browser/seed.py
GIRDER_URL=... GIRDER_ADMIN=... GIRDER_PASSWORD=... node test/browser/verify.cjs
```

`seed.py` is pure REST, so the same script serves CI and a live deployment. Everything
it creates is named "Flyer Studio E2E" or sits under it, and it is idempotent.

`verify.cjs` walks the dashboard the way a person does and drives the whole lifecycle:
gallery, workflow home, configuration picker, builder form, then submit, generate and
register. It fails on any console error, page error or failed request. It asserts on
user-visible state rather than structure, so Phase 4c can move code without the test
being rewritten. It is the only thing in the repo that renders the UI; the `.cjs` suites
drive DOM stubs.

**A full run registers a real IGSN.** No external registry is contacted — allocation is
local while `jsonforms.igsn_service_url` is empty — but each run consumes a stack ID
permanently, which is the point: the run after it asserts that the spent ID is locked and
that AUTO picks the next free one. On a throwaway CI database that costs nothing; on a
shared instance it accumulates one registered configuration per run under the
"Flyer Studio E2E" collection.

Screenshots land in `test/browser/screenshots/` and are uploaded as a CI artefact.

## Continuous integration

`.github/workflows/build-test.yaml` runs three jobs. **check** is the fast gate: `ruff`,
a bundle rebuild, a staleness diff against the committed bundle, `node --check`, and the
three frontend suites. **pytest** provisions MongoDB and Redis, installs girder-jsonforms
from its `igsn` branch with its frontend built, and runs the server suite with coverage.
**browser** does the same setup, starts Girder, seeds it and runs the harness above.

There is deliberately no message broker in CI. Girder deployments always have one — core
needs it to delete a folder — but the test environment does not, so the `enabled` fixture
takes pytest_girder's `eagerWorkerTasks`, which runs Celery tasks inline. Girder core uses
the same fixture to test its own `deleteFolderTask`. Nothing in `tests/` monkeypatches.
