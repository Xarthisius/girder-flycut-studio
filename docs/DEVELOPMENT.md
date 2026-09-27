# Development

Follow the [README](../README.md) to install the vendored dashboards dependency and the pinned,
patched JSONForms dependency into a Girder 5 environment. MongoDB is required.
Use a separate database for tests; the runtime, database, and uploaded data are not
part of this source repository.

Run the commands below from the repository root.

## Frontend

Edit `config_builder/static/` for the form and `girder_flycut/client_wrapper.js`,
`workflow.html`, and `workflow.css` for the dashboard integration. Then run:

```sh
python build_dashboard.py
node --check girder_flycut/web_client/main.js
node tests/status.cjs
node tests/workflow.cjs
node tests/complete_workflow.cjs
```

Commit the generated `girder_flycut/web_client/main.js` with the source changes; CI
rebuilds and fails if it is stale. Each substitution in `build_dashboard.py` asserts how
many times its needle matches, so markup that moves in `config_builder/static/` breaks the
build instead of quietly dropping a control.
This build does not need npm or the original Flyer-Cut-Opt repository. The vendored
dashboards frontend is prebuilt; rebuild it with its own package scripts if changed.

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
