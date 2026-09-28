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
| #8 | 4c | `girder.dialog.confirm` (`C5`); laser rules to `core/laser.js` |
| #9 | 4d | The five screens became views over a `WorkflowModel` (`D1`, most of `C1`) |
| #10 | 4e | `builder.js` became six views over a model and two collections (`C1`, `C4`) |
| #11 | 4f | Pug and Stylus (`C2`, `C3`); the client became its own npm project |

**Phase 4 is complete** — 25 of 33 closed.

**In flight:** `phase-5a-imports-and-format`, two commits, not yet a PR. `E5` and `B4`.

### Where to pick up

**Phase 5, server-side alignment.** Nothing on the client is outstanding.
**`docs/HANDOFF_PHASES_5_6.md` is the working document for what remains** — ordering,
file anchors, the measurements behind each step, and the two things to decide first. It
is disposable; delete it when Phase 6 lands.

- **`FlycutConfig` model** registered with `ModelImporter.registerModel`, owning
  `validate()`, lifecycle and workspace containment — the logic now spread across `gate`,
  `config_item`, `in_workspace`, `lifecycle` and `serialize`. *(`E4`)*
- **`StackLock` model** formalising the Phase 0 TTL fix behind the model layer. *(`E2`)*
- **Split `rest.py`** — 764 lines, 18 routes — into `rest/config.py`, `rest/template.py`,
  `rest/settings.py`; replace the 14 `self.gate()` calls with one decorator and use
  `modelParam` where a document is loaded by id. *(`E6`)*
- ~~**Hoist every function-local import.** *(`E5`)*~~ Done in 5a. Two sites stay
  deferred and say why: the circular pair in `FlycutPlugin.load()`, and
  `girder_jsonforms` in `materials.py` and `rest.py`, whose `register_config()` site is
  a `try`/`except ImportError` that degrades to a 503 rather than a lazy import.
- ~~**`ruff format` plus `I`, at 120 columns** — Decision 5. *(`B4`)*~~ Done in 5a.

`pytest tests` is 42 tests at 87% coverage and is the safety net for all of it; run it
after each step rather than at the end.

The conventions the client settled on, in case Phase 6 adds to it:

- **Rules to `core/`, writing to the view.** A screen's state pass is one `applyState()`
  loop over a description from `core/workflow.js`; the builder's `refresh()` is the same
  idea for its three viewer panels.
- **A view's `el` is the thing.** The template holds the contents and
  `tagName`/`id`/`className` supply the wrapper, so nothing nests and `showScreen()` still
  finds a screen by id.
- **Split what follows the data from what follows `busy`.** Rebuilding a picker's options
  every time a button greys out throws away the user's selection.
- **Models arrive with the views that listen to them**, never before.
- **Collections keep their rules in `core/`.** `apply()` hands a transform a copy of the
  list and resets to what comes back, which is what keeps `core/laser.js` testable without
  Backbone.
- **A stylesheet does not know what loads before it.** Where a modifier has to beat its
  base class, write both classes rather than relying on file order.

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
  rest.py                18 routes under /api/v1/flycut  (764 lines; Phase 5 splits it)
  settings.py            dashboard policy + validate_dashboard, bound to model.dashboard.save
  generate.py engine.py  LightBurn, CSV and resolved JSON output
  web_client/
    main.js              the shell: screen visibility, status line, busy guard,
                         and the lifecycle that moves a configuration between screens
    util.js              request, escapeHtml, ask — shared, not DOM-free
    core/                DOM-free: assess, catalog, config, laser, preview, records,
                         submit, validate, workflow
    models/              WorkflowModel, BuilderModel, LaserModel, CustomFieldModel
    collections/         LaserCollection, CustomFieldCollection
    views/               ScreenView + five screens + ConfigBuilderView and its six children
    templates/           one .pug per view, plus pickerScreen/formSection mixins
    stylesheets/         one .styl per view, plus variables.styl
    package.json         the client's own build; the root one lints and tests
    vite.config.ts       the lib build, with the Pug plugin
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
- **Python** is `ruff format` plus `ruff check` at `E4,E5,E7,E9,F,I`, at 120 columns —
  Decision 5, applied in Phase 5a. CI gates `ruff format --check .` as well as
  `ruff check .`, so ruff is pinned exactly in `requirements-dev.txt` and the workflow;
  bump both together. Three prose lines were rewrapped by hand because the formatter
  will not touch them.
- **Styles** are scoped under a single `.g-flycut-dashboard` class rather than prefixing
  each of 288 selectors — which is what the conventions actually ask for. There is no
  shadow root; that class is the only thing keeping the dashboard's CSS away from Girder
  core, and `tests/bundle.cjs` fails if a rule escapes it.
- **Markup is Pug and styles are Stylus**, one file per view, converted in 4f once `C1`
  had split the monolith into per-view templates. See the Stylus trap below — it
  evaluates the right-hand side, so several CSS functions need `unquote()`.

## Traps

- **Source slicing is gone; do not bring it back.** The `.cjs` suites used to extract
  functions from `main.js` by string offsets and `eval` them, and those boundaries broke
  four times in four phases — de-indentation in Phase 2, the file move in Phase 3,
  `arrow-parens` in 4a, `async` in 4c. `D1` closed in 4d. If something in the builder is
  hard to test, extract it to `core/` rather than reaching for the source text.
- **A hidden checkbox still reports itself enabled**, and `#validationAck` is only visible
  once its Status tab is the active one. Submitting without acknowledging fails with a
  toast and no navigation, which in a Playwright script looks exactly like a hang.
- **Backbone delegates on the bubble phase.** The read-only guard on drag and keydown has
  to be attached directly, in the capture phase, or the laser list's own handlers run
  first and a read-only configuration can be reordered.
- **Playwright's `dragTo` cannot grab the laser drag handle** — the card head sits over
  it. The harness dispatches the four drag events the list binds instead, which is also a
  more precise test than driving Chromium's drag implementation.
- **`prop('disabled', true)` on a `<fieldset>` sets the property, not the attribute.** It
  still disables the descendants per spec, so assert on a control inside it rather than on
  the fieldset.
- **pug-lint reads `pugLintConfig` from `package.json`, not `pug-lint`.** With the wrong
  key it exits 0 on anything. Check a deliberately broken file before believing it.
- **Stylus evaluates the right-hand side.** Custom properties, `min()`, `max()`, `clamp()`
  and `color-mix()` all have to go through `unquote()` — the first is opaque data, the
  next three collide with Stylus functions of the same name, and the last it does not
  know.
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
