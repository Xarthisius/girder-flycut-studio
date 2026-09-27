# Development

Follow the [README](../README.md) to install the vendored dashboards dependency and the pinned,
patched JSONForms dependency into a Girder 5 environment. MongoDB is required.
Use a separate database for tests; the runtime, database, and uploaded data are not
part of this source repository.

Run the commands below from the repository root.

## Frontend

Everything lives in `girder_flycut/web_client/` now: `builder.js` for the form,
`main.js` for the workflow shell, `core/` for logic with no DOM in it,
`templates/dashboard.html` for the markup, which `main.js` imports as a string, and
`styles/dashboard.css`, which it imports for its side effect so Vite emits `style.css`.
Then:

```sh
npm ci          # once
npm run lint
npm run build   # generate sources, then bundle with Vite
npm test        # the four .cjs suites, including tests/bundle.cjs
```

`npm run build` checks that `setup.py` and `package.json` agree on a version, then
bundles with Vite into `girder_flycut/web_client/dist/`, which is not committed. CI builds
it and the wheel ships only `dist/girder-plugin-flycut.umd.cjs`.

Every rule in the stylesheet is scoped under `.g-flycut-dashboard`. There is no shadow
root any more, so that class is the only thing keeping the dashboard's styles away from
Girder core; `tests/bundle.cjs` fails the build if a rule escapes it.

There is no source generator any more. The markup and stylesheet were derived from
`config_builder/static/` by matching literal strings until Phase 4a; that directory is
deleted and the files are plain sources here.

`girder_flycut/web_client/core/` is the DOM-free core: `assess.js`, `laser.js`,
`records.js` and `validate.js` are reachable without a document, a server or the
builder's closure, so `tests/status.mjs` imports them outright. Four slices remain in
`tests/workflow.cjs` and `tests/complete_workflow.cjs`, all of them DOM orchestration
over the shell's closure that Phase 4 turns into Backbone views.

`tests/bundle.cjs` loads the built UMD bundle against a stub `girder` global. Vite
minifies the lib build, so it asserts runtime wiring and payload content rather than
anything about identifiers.

Formatting rules are switched off in `.eslintrc.json`; `.eslintrc.md` explains why and
when they come back.

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

## Continuous integration

`.github/workflows/build-test.yaml` runs two jobs. **check** is the fast gate: `ruff`,
a bundle rebuild, a staleness diff against the committed bundle, `node --check`, and the
three frontend suites. **pytest** provisions MongoDB and Redis, installs girder-jsonforms
from its `igsn` branch with its frontend built, and runs the server suite with coverage.

There is deliberately no message broker in CI. Girder deployments always have one — core
needs it to delete a folder — but the test environment does not, so the `enabled` fixture
takes pytest_girder's `eagerWorkerTasks`, which runs Celery tasks inline. Girder core uses
the same fixture to test its own `deleteFolderTask`. Nothing in `tests/` monkeypatches.
