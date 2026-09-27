# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Flyer Studio** — a dashboard for [girder-dashboards], built on [girder-jsonforms], for
specifying and registering **flyer stacks**: arrays of small circular discs used in laser
impact experiments. It generates LightBurn project files from a form, captures the
experiment metadata, and registers an IGSN per stack.

Lifecycle: **draft → submitted → generated → registered**. Once registered, a stack ID
cannot be reused — that is deliberate and several tests depend on it.

## The conversion

This repo is mid-way through a planned conversion from a welded-together static app into
a conventional Girder 5 plugin. **`docs/CONVERSION_PLAN.md` is the authority** — it holds
the full issue register (33 issues, each with an ID like `A2` or `D1`), the five settled
decisions, and the phase-by-phase roadmap. Read it before doing anything here.

Work happens on `conversion`, one branch per phase, each merged by PR:

| PR | Phase | What closed |
|---|---|---|
| #1 | 0 | CI, ruff, and three latent production failures (`E1`, `E2`, `E3`) |
| #2 | 1 | The client sources became valid JavaScript (`A1`, `A5`, `B2`) |
| #3 | 2 | Real Vite build; bundle out of version control (`A3`, `A4`, `F4`) |
| #4 | 3 | DOM-free `core/`; tests stopped slicing source (`C7`, most of `D1`) |
| #5 | 4a | Plugin owns its markup; the deferred `eslint --fix` ran (`A2`, `A6`) |
| #6 | 4b | Shadow root dropped, stylesheet scoped (Decision 1) |
| #7 | — | Browser end-to-end harness (`D2`), pulled forward before 4c |

**In flight:** `phase-4c-dialogs-and-models`, four commits, not yet a PR. Closes `C5`
(`girder.dialog.confirm`) and extracts the laser-assignment rules to `core/laser.js` with
unit tests.

### Where to pick up

Mid-`C1`, the view decomposition. The next concrete step, already scoped:

`renderHome()` in `main.js` is ~25 lines of DOM writes driven by `saved`, `activeConfig`,
`busy` and two `<select>` values. Extract the *decision* into
`core/workflow.js::workflowState({...})` returning what each control should be — labels,
disabled flags, hrefs, hint text — and leave a view to apply it. That:

- kills the `renderHome` slice in `tests/workflow.cjs`, which is one of the three
  remaining `D1` slices, replacing it with an importable test in `tests/core.mjs`;
- is the same rules-in-`core`, DOM-in-view split used everywhere else here;
- makes the eventual `WorkflowHomeView` trivial.

Then the three picker views, then the builder screen. A shared Backbone model holding
`{activeConfig, saved, busy, completeWorkflow, readOnly}` is what the screen views listen
to; **do not** add it before the views exist, or it is a wrapper nothing listens to.

## Commands

```sh
# Python
python -m pip install -r requirements-dev.txt
ruff check .
pytest tests --mongo-uri mongodb://127.0.0.1:27017 -q --cov=girder_flycut --cov-report=term

# Browser sources
npm ci
npm run lint          # eslint over every client source
npm run build         # version check, then vite build -> web_client/dist/
npm test              # five .cjs/.mjs suites

# Browser end-to-end
cd test/browser && npm ci && npx playwright install chromium && cd ../..
python3 test/browser/seed.py
node test/browser/verify.cjs
```

**Use `/usr/bin/node` (v24), not the nvm default (v22)** — CI pins node 24:

```sh
export PATH=/usr/bin:$PATH && hash -r
```

### The live instance

`../../wholetale-ng/deploy-dev` runs a Whole Tale stack that **bind-mounts this working
tree** at `/girder-plugins/08-girder-flycut-studio`. Whatever branch is checked out here
is what that instance serves.

```sh
export NODE_TLS_REJECT_UNAUTHORIZED=0          # self-signed cert
export GIRDER_URL=https://girder.local.xarthisius.xyz
export GIRDER_ADMIN=admin GIRDER_PASSWORD=arglebargle123
```

Run the harness against it after every UI change — it is far faster than waiting for CI
and it is the same script. A full run mints a real IGSN and spends a stack ID permanently;
no external registry is contacted while `jsonforms.igsn_service_url` is empty.

## Environment truths that cost real time

None of these are inferable from the code. Each one cost a red CI run or worse.

- **Celery runs over Redis, not a separate broker.** `GIRDER_WORKER_BROKER` and
  `GIRDER_WORKER_BACKEND` are both `redis://…`. Creating a deposition fires
  `deposition.created`, whose JSONForms handler calls `.delay()`, which needs somewhere to
  enqueue even though the task returns early without `AIMD_PORTAL_TOKEN`.
  **Every Girder deployment has a broker** — core needs one to delete a folder
  (`girder/api/v1/folder.py:311`).
- **pytest has no broker and must not need one.** It uses `pytest_girder`'s
  `eagerWorkerTasks` fixture, which runs tasks inline. Girder core tests its own
  `deleteFolderTask` the same way.
- **Submitting needs an assetstore**, because it writes the canonical config JSON. A real
  deployment always has one; a fresh `girder serve` does not. `seed.py` creates one.
- **The IGSN prefix is structured**, not arbitrary: institution (2) + lab (1) + material
  (2) + subcategory (1), each validated against `jsonforms.igsn_institutions` and
  `jsonforms.igsn_materials`. Use `JHAMAB`, as the pytest fixtures do.
- **`jsonforms.igsn_prefix` is a DataCite DOI prefix**, a different thing from the
  `prefix` parameter to `POST /deposition`. Confusingly similar names.
- **`GET /deposition` nests the DataCite fields under `metadata`**; the document the
  create call returns has them at top level. Matching the wrong shape makes a "find or
  create" helper create every time.
- **A standalone deployment must set `jsonforms.projects_enabled` to `false`.** It
  defaults to `true`, and `propagate_to_projects()` then raises a 404 resolving an AIMDL
  collection that does not exist. See `docs/JSONFORMS_COMPATIBILITY.md`.

## Layout

```
girder_flycut/
  __init__.py            FlycutPlugin.load() — registers the dashboard and the REST resource
  rest.py                18 routes under /api/v1/flycut  (604 lines; Phase 5 splits it)
  settings.py            dashboard policy + validate_dashboard, bound to model.dashboard.save
  generate.py engine.py  LightBurn, CSV and resolved JSON output
  web_client/
    main.js              the dashboard shell: six screens in one view  (C1 splits this)
    builder.js           the configuration form  (C1 splits this)
    core/                DOM-free: assess, laser, records, validate — unit-tested
    templates/           dashboard.html, imported as a string
    styles/              dashboard.css, imported for its side effect -> dist/style.css
    dist/                built, gitignored, shipped in the wheel
tests/                   pytest (42) + core.mjs, status.mjs, workflow.cjs,
                         complete_workflow.cjs, bundle.cjs
test/browser/            seed.py + verify.cjs — the only thing that renders the UI
vendor/girder-dashboards/  a committed snapshot of the dependency  (F1; Phase 6 deletes it)
```

## Conventions

Against `../../wholetale-ng/girder/WEB_CLIENT_CONVENTIONS.md`, which is the reference for
anything touching the UI.

- **JavaScript** is linted by `@girder`'s eslint config, formatting rules included. Two
  deliberate exceptions, both explained in `.eslintrc.md`: `promise/no-native` is off
  permanently (the builder is plain DOM with its own `fetch` shim, not Backbone using
  jQuery deferreds), and `no-new-func` is disabled in two suites that still slice source.
- **Python** is `ruff check` at `E4,E7,E9,F`. `I` and `E501` are deferred to Phase 5 per
  Decision 5, which settled on `ruff format` plus import sorting at 120 columns.
- **Styles** are scoped under a single `.g-flycut-dashboard` class rather than prefixing
  each of 288 selectors — which is what the conventions actually ask for. There is no
  shadow root; that class is the only thing keeping the dashboard's CSS away from Girder
  core, and `tests/bundle.cjs` fails if a rule escapes it.
- **Not yet converted:** markup is `.html` and styles are `.css`, not Pug and Stylus. That
  lands with `C1`, when the monolith is split into per-view templates — converting first
  would mean translating one file and immediately re-splitting it.

## Traps

- **The `.cjs` suites slice functions out of source by string offsets and `eval` them.**
  Three slices remain (`renderHome`, `configure`, the submit flow). Those boundaries
  include *indentation*, and they have broken four times: de-indentation in Phase 2, the
  file move in Phase 3, `arrow-parens` in 4a, and `async` in 4c. Do not repair a boundary
  for the fifth time — extract the function and delete the slice.
- **`page.goto` to the URL you are already on does nothing.** All six screens live inside
  the one `#dashboard/:id` route, so the harness has a `reopen()` helper that goes via
  `#dashboards` first.
- **Dismissing a `beforeunload` dialog means "stay on this page"**, so Playwright's
  default dismissal silently cancels the navigation that raised it.
- **A native `confirm()` is dispatched synchronously inside the click handler.** Arm any
  accept/dismiss decision *before* the click, not after.
- **Leaving the builder calls `blank()`**, so anything typed is gone on re-entry.
- **`setuptools` ≥61 defaults `include_package_data` to true**, so `MANIFEST.in` governs
  wheel contents — and a stale `egg-info/SOURCES.txt` will happily put deleted files back
  in. Delete `girder_flycut.egg-info/` before checking what a wheel ships.
- **A bare `build/` in `.gitignore` matches nested directories too.** It silently kept
  `girder_flycut/web_client/build/` out of version control; it is anchored `/build/` now.

## Verifying a change

In increasing order of cost, and none of them is optional for a UI change:

1. `npm run lint && npm run build && npm test`
2. `node test/browser/verify.cjs` against the live instance
3. `pytest tests --mongo-uri …`
4. CI, which runs all three plus its own Girder

The browser harness is the only thing that renders the UI. It found a regression within
minutes of first existing — dropping the shadow root let Bootstrap's
`input[type="file"] { display: block }` override the `hidden` attribute, so two file
inputs were visibly rendering in production. Neither lint nor any other test could see it.
Assume the same is true of whatever you are about to change.
