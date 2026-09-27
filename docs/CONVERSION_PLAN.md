# Flyer Studio Conversion Plan

Flyer Studio works, ships a correct wheel, and honours the girder-dashboards contract. What it does
not have is a web client anyone can lint, review, or safely change. This is the full issue register
and a seven-phase route to a conventional Girder 5 dashboard plugin.

| | |
|---|---|
| **Audited** | `1f317f9` (Docs update) |
| **Against** | `girder/WEB_CLIENT_CONVENTIONS.md`, `girder/CLAUDE.md`, `girder-dashboards/docs/extending.md` |
| **Issues** | 33 — 8 critical, 14 major, 11 minor |
| **Phases** | 7 |

---

## Where it stands

| Measure | Verdict | |
|---|---|---|
| Dashboards contract | **Pass** | Load order, key match, settings, static registration all correct |
| Client stack | **0 / 5** | No Vite, Pug, Stylus, `package.json`, or `dist` |
| Automation | **None** | No CI, no lint config of any kind |
| Ruff (dashboards ruleset) | **34** | 26 import-order, 4 unused imports, 3 unused locals, 1 multi-import |

The UI is a standalone static app in `config_builder/static/` that predates the Girder integration.
`build_dashboard.py` welds it into a plugin by slicing `index.html` on `<body>`, applying fifteen
exact-string replacements, regex-rewriting the CSS, and substituting all three into
`client_wrapper.js` at the markers `/* TEMPLATE */`, `/* STYLES */` and `/* BUILDER */`. The 909-line
result is committed and served raw. One Backbone view mounts the whole thing into a shadow root.

That design is coherent and it demonstrably works. The cost is that the source of record cannot be
parsed by any JavaScript tool, the build fails silently when markup moves, and none of it is checked
by anything on push.

---

## Verified working

Confirmed by running it, not by reading it. None of this should be disturbed by the conversion.

- **The build is reproducible.** Rebuilding produces a byte-identical `main.js`; the committed bundle
  is in sync.
- **All three Node suites pass** — `status.cjs`, `workflow.cjs`, `complete_workflow.cjs` — and
  `node --check` is clean on the bundle.
- **The wheel is correct:** 27 files, `web_client/main.js` present, no tests, no vendor, no build
  sources.
- **The dashboards contract is honoured.** `getPlugin("dashboards").load(info)` precedes
  `registerPluginStaticContent`, so the dashboards bundle is injected first and
  `girder.plugins.dashboards` exists when `main.js` runs.
- **Python and client halves agree on the key** — `KEY = "flycut-config"` matches
  `registerDashboard('flycut-config', …)`.
- **The `model.dashboard.save` handler is key-guarded** (`settings.py:79`), so it does not validate
  other plugins' dashboards — the obvious cross-plugin hazard is avoided.
- **Girder widgets are mounted in the light DOM.** `BrowserWidget` renders into
  `#g-dialog-container`, and `guardNavigation` explicitly exempts that container.
- **Listeners are torn down.** `beforeunload` and the capture-phase `click` guard are removed in
  `cleanupBuilder`, called from `destroy()`.
- **All 18 REST routes carry an access decorator** (14 `@access.user`, 4 `@access.admin`) — no
  handler falls through to Girder's admin-only default.

---

## Issue register

Severity is about risk to correctness and to the team's ability to change the code, not about
effort. Each issue names the phase that closes it.

### Index

| ID | Severity | Phase | Issue |
|---|---|---|---|
| A1 | Critical | ~~1~~ ✓ | The client source of record is not valid JavaScript |
| A2 | Critical | ~~0~~ ✓ | The build is exact-string replacement that fails silently |
| A3 | Major | ~~2~~ ✓ | No Vite build; static content is served from a source directory |
| A4 | Major | ~~2~~ ✓ | A 909-line generated file is committed |
| A5 | Major | ~~1~~ ✓ | No `package.json` for the client |
| A6 | Minor | ~~4~~ ✓ | CSS is rewritten by regex at build time |
| B1 | Critical | 0 | There is no CI |
| B2 | Critical | ~~0~~ ✓ | No lint configuration of any kind |
| B3 | Major | 0 | 34 ruff findings, 8 of them genuine dead code |
| B4 | Minor | 5 | 253 lines exceed 100 characters |
| B5 | Major | ~~6~~ 0 | The Python test suite has no reproducible environment |
| C1 | Major | 4 | One Backbone view for six screens |
| C2 | Major | 4 | Markup is a JSON-encoded string constant |
| C3 | Major | 4 | Styles are a JSON-encoded string constant |
| C4 | Critical | 4 | `app.js` is a module-global singleton and cannot be instantiated twice |
| C5 | Minor | ~~4~~ ✓ | Three `no-alert` violations |
| C6 | Minor | 6 | No plugin config page |
| C7 | Minor | ~~3~~ ✓ | Dead and cross-file-coupled functions in `app.js` |
| D1 | Major | ~~3~~ 3 left | JavaScript tests extract functions by string-slicing the source |
| D2 | Major | ~~6~~ ✓ | No end-to-end browser test |
| D3 | Minor | 0 | No coverage measurement |
| E1 | Critical | 0 | A test-only endpoint is exposed in the production API |
| E2 | Critical | 0 | The stack mutex has no expiry, so a crash wedges a stack forever |
| E3 | Critical | 0 | A startup migration can take the server down |
| E4 | Major | 5 | Configurations are Items with a metadata blob and no model |
| E5 | Minor | 5 | Function-local imports throughout, including redundant ones |
| E6 | Major | 5 | One 604-line Resource with 18 routes and a hand-rolled gate |
| E7 | Minor | 6 | Four admin endpoints no shipped UI can reach |
| F1 | Major | 6 | A stale committed copy of a PyPI dependency |
| F2 | Major | ~~6~~ 0 | A required dependency is not installable from any index |
| F3 | Minor | 6 | Thin package metadata and no `LICENSE` |
| F4 | Minor | ~~2~~ ✓ | No single source of version truth |
| G1 | Minor | 6 | A complete admin screen is built, wired, and permanently hidden |

---

### A · Build and toolchain

#### A1 — The client source of record is not valid JavaScript
**Critical · Phase 1**

`client_wrapper.js:23` is `style.textContent = /* STYLES */;`, with the same pattern at lines 26 and
49. No parser accepts it — eslint reports *Parsing error: Unexpected token ;*. Four hundred and fifty
lines of client code cannot be linted, formatted, type-checked, or navigated by an editor. Only the
generated output can.

**Fix** — Make the wrapper export a factory taking `{ template, styles, createBuilder }`, and emit
those three as generated ES modules instead of substituting strings into a comment.

#### A2 — The build is exact-string replacement that fails silently
**Critical · ~~Phase 0 (guarded)~~ → closed in Phase 4a**

*Revised in Phase 2.* Guarded in Phase 0 and ported from Python to JavaScript in Phase 2,
but **not removed**. The plan said retiring `build_dashboard.py` would "remove every
needle"; that was wrong. The needles exist because the markup is derived from
`config_builder/static/index.html`, not because a Python script did the deriving. They
disappear only when the markup stops being sliced out of the standalone builder, which is
**Decision 3**. **Closed in Phase 4a.** The plugin owns its markup and stylesheet as plain files, the
generator is deleted, and the deferred `eslint --fix` ran in the same commit — 1,279
findings, with the minified bundle byte-identical before and after.

Fifteen `str.replace()` calls at `build_dashboard.py:8–28` match literal markup such as
`<span class="input-wrap"><input id="stackid" …></span>`. A whitespace change in `index.html` turns
the matching call into a no-op — no error, just a button that quietly stops existing. Only the
`re.search` for `<header>` at line 13 would actually raise.

**Fix** — Assert every needle is present before replacing, and have CI rebuild and fail on
`git diff --exit-code`. Cheap, and it makes A2 harmless until Phase 2 retires the script.

#### A3 — No Vite build; static content is served from a source directory
**Major · Phase 2**

`__init__.py:30` registers `staticDir=web_client` with `js=["/main.js"]`. Every other Girder plugin
builds a UMD library to `web_client/dist/` and registers that. Here `web_client/` is simultaneously a
source directory and a build output directory.

**Fix** — A conventional `vite.config.ts` producing `dist/girder-plugin-flycut.umd.cjs` +
`dist/style.css`; register those.

#### A4 — A 909-line generated file is committed
**Major · Phase 2**

`girder_flycut/web_client/main.js` is build output under version control. Two people touching the UI
in the same week produce an unmergeable conflict in a file nobody can review, and every diff is
noise.

**Fix** — Gitignore `dist/`, build in CI, ship it via `package_data` as girder-dashboards does.

#### A5 — No `package.json` for the client
**Major · Phase 1**

There is no npm project anywhere outside `vendor/`, so there is nowhere to declare a client
dependency, no lockfile, and no `npm run lint` / `build` / `dev` entry point.

**Fix** — Add `girder_flycut/web_client/package.json` with a committed `package-lock.json`, mirroring
girder-dashboards.

#### A6 — CSS is rewritten by regex at build time
**Minor · Phase 4**

`build_dashboard.py:20–21` does `.replace(':root', ':host')` and
`re.sub(r'(?<![-\w])body\{', ':host{display:block;', css)`. Both depend on the stylesheet's exact
formatting; the first also rewrites `:root` anywhere it appears, including inside a comment or a
media query.

**Fix** — Disappears with Stylus and a real build.

---

### B · CI and linting

#### B1 — There is no CI
**Critical · Phase 0**

No `.github/` directory. Nothing runs on push or pull request. The build → `node --check` → three
Node suites → `pytest` sequence is written down in `DEVELOPMENT.md` and executed by hand.

**Fix** — One workflow file running exactly that sequence. The commands already exist; only the
wiring is missing.

#### B2 — No lint configuration of any kind
**Critical · Phase 0**

No `ruff.toml`, `.flake8`, `setup.cfg`, `tox.ini`, or `.eslintrc`. Python and JavaScript are both
unchecked, which is why B3 and C5 went unnoticed.

**Fix** — `ruff.toml` in Phase 0; eslint in Phase 1; pug-lint and stylelint arrive with Phase 4.

#### B3 — 34 ruff findings, 8 of them genuine dead code
**Major · Phase 0**

Under girder-dashboards' ruleset (`E4,E7,E9,F,I`): 26 `I001` import-order, 4 `F401` unused imports,
3 `F841` unused locals, 1 `E401`. The eight non-import-order findings are real: unused `parent`,
`source`, `other` locals in `test_api.py`, an unused `copy` in `test_dashboard.py`, and three unused
imports.

**Fix** — Fix the eight by hand now; decide separately (see Decision 5) whether to adopt import
sorting wholesale.

#### B4 — 253 lines exceed 100 characters
**Minor · Phase 5**

Against Girder core's flake8 limit, across tracked Python. The longest is 581 characters; `rest.py`
alone has 80 over-length lines. The code is deliberately dense, but at this width a diff is
unreadable in review and `git blame` stops being informative.

**Fix** — A limit chosen in Decision 5, applied module by module during the Phase 5 split.

#### B5 — The Python test suite has no reproducible environment
**Major · ~~Phase 6~~ → resolved in Phase 0**

Running the 37 tests used to require cloning girder-jsonforms at commit `52f29b7` and applying a
patch by hand. These tests were not run during the audit and no claim was made about them.

**Outcome** — resolved. The suite now runs: **42 passed** locally against MongoDB, 87% coverage, with
no monkeypatching left in `tests/`. The CI `pytest` job provisions MongoDB and Redis, builds the
JSONForms frontend, and runs the same command. Two environment requirements were discovered by
running it, neither previously written down: JSONForms' frontend must be built, and its
`deposition.created` handler enqueues a Celery task, so tests take pytest_girder's
`eagerWorkerTasks` fixture. A `tox.ini` wrapping this into one local command remains worthwhile.

---

### C · Web-client conventions

#### C4 — `app.js` is a module-global singleton and cannot be instantiated twice
**Critical · Phase 4**

It holds module-level `state`, `draggedLaserId`, `activeHelp` and `acknowledgedSnapshot`, and
registers twenty-five `addEventListener` calls at top level during script evaluation. It only works
because the build inlines it once inside a closure. This is the hard blocker for everything
downstream: no second instance, no clean re-render, no unit test of a view.

**Fix** — Phase 3 lifts the pure logic out; Phase 4 moves the remaining state into Backbone models so
each view instance owns its own.

#### C1 — One Backbone view for six screens
**Major · Phase 4**

A single `Dashboard` view renders `workflowHome`, `configurationPicker`, `lightburnPicker`,
`registrationPicker`, `builderScreen` and `adminSettingsScreen`, toggling `.hidden` via
`showScreen()`. There is no `events` hash; every listener is wired imperatively inside a 300-line
`startBuilder`.

**Fix** — The screens already map one-to-one onto views — see the Phase 4 decomposition.

#### C2 — Markup is a JSON-encoded string constant
**Major · Phase 4**

The entire UI is one `container.innerHTML = "…"` assignment spanning a single line of the bundle. No
Pug, so no `pug-lint`, no template reuse, no mixins, and no diffable markup.

**Fix** — One `templates/<camelCase>.pug` per view; the laser card and custom-field row are natural
mixins.

#### C3 — Styles are a JSON-encoded string constant
**Major · Phase 4**

Same shape as C2: `style.textContent = "…"`. No Stylus, no `stylelint`, no shared token file, and no
`css=[…]` in the static registration.

**Fix** — `stylesheets/<camelCase>.styl` imported from each view module, with tokens in
`variables.styl`.

#### C5 — Three `no-alert` violations
**Minor · ~~Phase 4~~ → closed in 4c**

*Done.* `canLeave()` returns a promise over `girder.dialog.confirm` now, and the
capture-phase navigation guard — which could not decide inside the event once asking
became asynchronous — stops every link while the form is dirty and re-issues the click
once the answer arrives.

The browser harness was extended to cover accepting the prompt *before* the change, since
that was the half most likely to break and nothing asserted it. The same three checks pass
across the conversion, reporting `girder modal` where they reported `native confirm`.

The unsaved-changes guard and the delete-files confirmation in `client_wrapper.js`, plus one
inherited from `app.js`. Conventions §7 wants `girder.dialog.confirm`. Note that the browser
`confirm()` is synchronous and load-bearing inside `canLeave()`, so this needs the call site
restructured, not a substitution.

**Fix** — Make `canLeave` return a promise and await it at each of its three call sites.

#### C6 — No plugin config page
**Minor · Phase 6**

There is no `routes.js` and no `exposePluginConfig` call, so `#plugins/flycut/config` does not exist.
Admin policy is edited as raw JSON in the dashboards settings dialog — which
`DASHBOARD_CONFIGURATION.md` documents, but which means an admin hand-writes ObjectIds into a
textarea.

**Fix** — Resurrect the already-written admin screen as a proper config page (see G1 and Decision 4).

#### C7 — Dead and cross-file-coupled functions in `app.js`
**Minor · Phase 3**

`persistCache` is defined and never called. `cleanupTooltips` is defined in `app.js` but only ever
called from `client_wrapper.js` — a dependency that exists solely because the build concatenates the
two files.

**Fix** — Delete the first; make the second an explicit export consumed by the view's `destroy`.

---

### D · Testing

#### D1 — JavaScript tests extract functions by string-slicing the source
**Major · Phase 3 (mostly) · remainder in Phase 4**

*Revised in Phase 3.* Eight slices became four. `tests/status.mjs` imports
`assessConfiguration`, `restoreImportedLaser` and `exportDecision` outright and slices
nothing; `groupedOptions` and `selectableConfigs` are imported by the other two suites.
What is left is `renderHome`, `canLeave`, `configure` and the submit flow — all DOM
orchestration over the shell's closure, which cannot be imported until Phase 4 turns the
shell into Backbone views. Those four are the reason the eslint `no-new-func` disables
survive.

`status.cjs` does
`new Function(source.slice(source.indexOf('function assessConfiguration('), source.indexOf('\nfunction configurationStatus')))`,
and `workflow.cjs` and `complete_workflow.cjs` use the same technique. Renaming or reordering a
function in `app.js` silently changes what is under test, or throws. The coverage is genuinely good;
the coupling is to file layout rather than to a module boundary.

**Fix** — Phase 3 makes these functions importable, at which point the slicing is replaced by
`require()` and the assertions stay as they are.

#### D2 — No end-to-end browser test
**Major · ~~Phase 6~~ → done before Phase 4c**

*Pulled forward.* Phase 4c restructures 932 lines of UI and 173 of markup, and nothing
in the suite rendered any of it. Building the harness against the current, known-good UI
had to come first, or the decomposition would have been unverifiable.

It earned its place immediately: the first screenshot showed a stray "Choose File"
control in the builder's top bar. Dropping the shadow root in Phase 4b let Girder's
Bootstrap reach the dashboard, and `input[type="file"] { display: block }` outranks the
user-agent rule behind the `hidden` attribute — so two file inputs that are meant to be
invisible were rendering. Neither lint nor any existing test could have seen it. Fixed,
and the harness now fails if anything marked `[hidden]` is rendered.

It drives the full lifecycle — submit, generate, register — rather than stopping at the
screens, because those buttons live in the shell's closure and are exactly what Phase 4c
moves. A run mints a real stack IGSN against the local allocator and leaves the stack ID
spent; the next run asserts it is locked and that AUTO picks the next free one.

`DEVELOPMENT.md` calls the existing browser harness "supplementary, not a deployed-portal test".
girder-dashboards runs ~62 checks against a live instance in CI and caught two defects that way that
neither its Python tests nor its build could see.

**Fix** — Model a `test/browser/` harness on the dashboards one; the draft → submitted → generated →
registered lifecycle is exactly what it should walk.

#### D3 — No coverage measurement
**Minor · Phase 0**

37 Python tests and three Node suites, with no idea which of the 1,706 Python lines they reach.

**Fix** — `--cov=girder_flycut` in the CI pytest invocation.

---

### E · Server-side and Girder conventions

#### E1 — A test-only endpoint is exposed in the production API
**Critical · Phase 0**

`rest.py:84` routes `POST /flycut/config/:id/mock-register` to `rest.py:495`, decorated
`@access.user`. Any user with dashboard access can drive a generated configuration to `registered`
with a fabricated IGSN — and the UI knows about it, hiding the IGSN link when `registration.mock` is
set. Its only callers are two lines in `test_api.py`.

**Fix** — Delete the route and call the underlying function directly from the test, or gate it behind
a setting that is off by default. Deleting is cleaner: the test already has a server fixture.

#### E2 — The stack mutex has no expiry, so a crash wedges a stack forever
**Critical · Phase 0**

`rest.py:52` reaches past the model layer into `Item().collection.database['flycut_stack_locks']` and
uses `insert_one` / `delete_one` as a lock. If the process dies between those two calls, that stack
ID returns HTTP 409 — "This stack is being changed" — permanently, with no operator-visible way to
clear it. `DEVELOPMENT.md` already acknowledges the same hazard for `meta.flycut.busy`.

**Fix** — Add a TTL index on an `acquired` timestamp so the lock self-heals. One index, and the
failure mode is gone.

#### E3 — A startup migration can take the server down
**Critical · Phase 0**

`__init__.py:26–29` runs a one-time rename on every `load()`, and the `Dashboard().save(existing)`
fires the `model.dashboard.save` handler bound at line 17. If stored settings have stopped validating
— say a creator group was deleted, giving *"creators: user/group no longer exists"* —
`validate_dashboard` raises `ValidationException` during plugin load, and Girder does not start.

**Fix** — Wrap the migration in `try/except` and log, or delete it outright now that the rename has
shipped.

#### E4 — Configurations are Items with a metadata blob and no model
**Major · Phase 5**

A configuration is an `Item` carrying `meta.flycut`, with its lifecycle, ACL checks and workspace
containment spread across `rest.py` (`gate`, `config_item`, `in_workspace`, `lifecycle`, `serialize`),
`artifacts.py` and `storage.py`. Girder's convention is a `Model` subclass registered with
`ModelImporter.registerModel`, which is also where `validate()` belongs.

**Fix** — A `FlycutConfig` model owning lifecycle and containment; `rest.py` keeps only routing and
serialization.

#### E6 — One 604-line Resource with 18 routes and a hand-rolled gate
**Major · Phase 5**

Every handler opens with `self.gate()`, which re-loads the dashboard document and re-checks the ACL
on each request — 14 times over. Girder offers `modelParam` for auto-loading with access enforcement,
and a decorator would cover the rest.

**Fix** — Split into `rest/config.py`, `rest/template.py`, `rest/settings.py`; replace `gate()` with a
single decorator.

#### E5 — Function-local imports throughout, including redundant ones
**Minor · Phase 5**

`from bson import ObjectId` appears at `rest.py:3` and is then re-imported inside three separate
methods at lines 170, 479 and 503. `User`, `Group`, `Collection`, `re`, `math` and `getResourcePath`
are all imported inside handlers. This is most of the 26 `I001` findings.

**Fix** — Hoist to module top during the Phase 5 split; the circular-import risk that usually
motivates this pattern does not apply here.

#### E7 — Four admin endpoints no shipped UI can reach
**Minor · Phase 6**

`GET`/`PUT /flycut/settings`, `/settings/principals` and `/settings/workspace` exist and work, but
the only screen that calls them is permanently hidden (G1). They are dead surface area or a missing
feature, depending on Decision 4.

**Fix** — Keep them and build the config page, or delete all four with the screen.

---

### F · Packaging and dependencies

#### F1 — A stale committed copy of a PyPI dependency
**Major · Phase 6**

`vendor/girder-dashboards/` is a 30-file snapshot of the upstream repository, including a force-added
prebuilt `dist/` via four `.gitignore` negations — while `setup.py` declares `girder-dashboards>=0.2.0`
from PyPI. Two copies exist and they have already diverged: the snapshot predates upstream's lint
configuration.

**Fix** — Delete `vendor/` and install from an index. If a pre-release is needed, pin an exact version
rather than vendoring a tree.

#### F2 — A required dependency is not installable from any index
**Major · ~~Phase 6~~ → resolved in Phase 0**

*Revised twice while executing Phase 0; both revisions came from maintainer correction.*

The dependency is girder-jsonforms' **`igsn` branch** — not a PyPI release, and not the
pinned commit `52f29b7` that `INSTALLATION.md` used to name. `setup.py` now declares it
directly: `girder-jsonforms @ git+https://github.com/Xarthisius/girder-jsonforms.git@igsn`.

`patches/girder-jsonforms-flycut.patch` is **deleted**. Every hunk was either upstream or
unnecessary:

| Hunk | Outcome |
|---|---|
| `create_batch()` relationships and child titles | Upstreamed as [PR #34](https://github.com/Xarthisius/girder-jsonforms/pull/34), merged into `igsn` on 2026-09-25 as `51500a3` — keyword-only, validated, tested. |
| Skip the AIMD task when `AIMD_PORTAL_TOKEN` is unset | Unnecessary. It existed to avoid `.delay()` without a broker, but every Girder deployment has one: core enqueues `deleteFolderTask.delay()` on `DELETE /folder/:id` (`girder/api/v1/folder.py:311,395`). The task already returns early without a token. |
| Skip AIMDL propagation for non-AIMDL items | Replaced by configuration. `PROJECTS_ENABLED` defaults to `true`, and with it on `propagate_to_projects()` calls `AIMDL._get_base_parent()`, which raises `RestException(404)` when no AIMDL collection exists. Setting `jsonforms.projects_enabled` to `false` returns at that function's first line instead. |

**Outcome** — one documented setting replaces 83 lines of patch, and CI no longer applies
one. The dependency is still installed from a checkout rather than by pip resolving the
reference, but for an unrelated reason: girder-jsonforms ships only prebuilt frontend
assets, so a pip-from-git install has no `web_client/dist` and its `load()` raises
`FileNotFoundError`. Its own CI builds the frontend for the same reason. That is a
packaging gap in the dependency, not a patch, and it no longer blocks B5.

#### F3 — Thin package metadata and no `LICENSE`
**Minor · Phase 6**

`setup.py` carries name, version, description, packages and entry point. No `long_description`,
classifiers, `url`, or author. There is no `LICENSE` file in the repository root — the only one in
the tree belongs to the vendored dependency under `vendor/`.

**Fix** — Fill out the metadata and add the project's own licence file.

#### F4 — No single source of version truth
**Minor · Phase 2**

`1.0.0` lives only in `setup.py`. Once `package.json` arrives (A5) there will be two places to forget.

**Fix** — Pick one as canonical and have the build or a CI check assert the other matches.
girder-dashboards has exactly this drift today, at 0.1.0 versus 0.2.0.

---

### G · Dead UI

#### G1 — A complete admin screen is built, wired, and permanently hidden
**Minor · Phase 6**

`#adminSettingsBtn` carries `class="…hidden"` in `workflow.html:3` *and* is hidden again at
`client_wrapper.js:253`; nothing anywhere removes the class. That leaves 29 lines of
`adminSettingsScreen` markup, a workspace browser, a principal search and a save handler unreachable.
`DASHBOARD_CONFIGURATION.md` states this is deliberate — so it is not a bug, but it is a finished
feature parked behind a hard-coded flag.

**Fix** — Promote it to a real config page (C6), or delete it and its four endpoints (E7). Leaving it
hidden is the one option that costs something every time someone reads the file.

---

## Divergences that are not defects

Worth stating explicitly so the conversion does not "fix" them by reflex.

- **Zero `g-` prefixed selectors is correct here.** Conventions §6 mandates the prefix because plugin
  CSS is concatenated into one global stylesheet with no scoping. Shadow DOM provides real isolation
  instead, which is a stronger answer to the same problem — not a violation of it. It only becomes a
  gap if Decision 1 drops the shadow root.
- **Reading policy server-side rather than from the handed-in `settings` prop** is the safer choice.
  The dashboard view receives `settings`, but `rest.py` re-reads it from the document on every
  request, so a tampered client cannot widen its own permissions.
- **`css=[]` in the static registration** follows from the shadow root: styles must be injected
  inside it, so there is no external stylesheet to register.

---

## Roadmap

Each phase is independently shippable and leaves the plugin working. Phases 0–2 are pure
infrastructure and change no behaviour. Phase 3 is the hinge: it is what makes Phase 4 tractable.
Sizes are relative, not estimates.

| Phase | Title | Size | Issues closed |
|---|---|---|---|
| 0 | Stop the bleeding | S | 8 |
| 1 | Make the client source real JavaScript | M | 2 |
| 2 | Introduce the real build | S | 3 |
| 3 | Extract the DOM-free core | M | 2 |
| 4 | Backbone decomposition | XL | 6 |
| 5 | Server-side alignment | L | 4 |
| 6 | Packaging, dependencies, and the last mile | L | 8 |

### Phase 0 — Stop the bleeding

*Automation and the three latent production failures. No architecture change.* **Size S · 8 issues**

- **CI workflow** running the `DEVELOPMENT.md` sequence verbatim: `build_dashboard.py`,
  `node --check`, the three `.cjs` suites, then `ruff`. Python tests join in Phase 6 when F2 unblocks
  them. *(B1)*
- **Rebuild-drift gate:** CI rebuilds and runs `git diff --exit-code`, so a committed bundle can
  never fall out of sync. *(A2, A4)*
- **Assert before replacing** in `build_dashboard.py` — every needle must be found. *(A2)*
- **`ruff.toml`** plus the eight genuine dead-code fixes. *(B2, B3)*
- **Delete `mock-register`** and call the function directly from `test_api.py`. *(E1)*
- **TTL index** on `flycut_stack_locks`. *(E2)*
- **`try/except` around the startup migration**, or delete it. *(E3)*
- **`--cov=girder_flycut`** wired into the pytest invocation. *(D3)*

**Exit** — CI is green on push; a stale bundle is impossible; no test-only route is reachable in
production; a crashed worker no longer wedges a stack ID.

### Phase 1 — Make the client source real JavaScript

*Every file parses. Still no framework change and no visual change.* **Size M · 2 issues**

- **Turn `client_wrapper.js` into a module** exporting a factory:
  `createFlycutDashboard({ template, styles, createBuilder })`. The three placeholder comments become
  parameters. *(A1)*
- **Emit the template and styles as generated ES modules** — `web_client/generated/template.js` and
  `styles.js`, each a single exported string — instead of substituting into a comment.
  `build_dashboard.py` shrinks to a generator.
- **Wrap `app.js` in an exported `createBuilder(mount, currentUser)`** so its top-level listeners run
  per instance rather than at evaluation. This is the first half of C4 and is mechanical: the body
  moves inside a function, nothing else changes yet.
- **`package.json` + `package-lock.json` + `.eslintrc.json`** extending `@girder`, with
  `npm run lint`. *(A5, B2)*

**Exit** — `npm run lint` passes over every client file. An editor can navigate the source. The three
`.cjs` suites still pass unchanged.

### Phase 2 — Introduce the real build

*Vite replaces the Python welder; the bundle leaves version control.* **Size S · 3 issues**

- **`vite.config.ts`** copied from girder-dashboards: UMD lib build, pug plugin, `assetFileNames`
  forcing `style.css`. Output `dist/girder-plugin-flycut.umd.cjs`. *(A3)*
- **Repoint `registerPluginStaticContent`** at `web_client/dist` with `css=['/style.css']` once styles
  leave the shadow root, or keep `css=[]` if Decision 1 keeps it.
- **Gitignore `dist/`**; build in CI; ship via `package_data` and `MANIFEST.in` exactly as
  girder-dashboards does. *(A4)*
- **Retire `build_dashboard.py`.** The generator from Phase 1 becomes a Vite plugin or a prebuild
  script. *(A2, A6)*
- **Version check** asserting `setup.py` and `package.json` agree. *(F4)*

**Exit** — `npm ci && npm run build` produces the bundle; the wheel carries `dist/` and nothing else;
no generated file is tracked.

### Phase 3 — Extract the DOM-free core

*The hinge. Pure logic becomes importable, and the tests stop slicing strings.* **Size M · 2 issues**

New `web_client/core/`, mirroring what `slicer_cli_web/parser/` does for widget specs —
transformation separated from rendering, and therefore unit-testable:

| Module | Contents |
|---|---|
| `assess.js` | `assessConfiguration`, `configurationStatus`, the six warning rules |
| `laser.js` | `makeLaser`, `moveLaser`, `normalizeLayerNames`, `resolveLaserForLayer`, `usedLaserCount`, `restoreImportedLaser` |
| `config.js` | `configObject`, `finalConfigObject`, `draftObject` |
| `validate.js` | `validate`, `confirmExport`'s decision logic separated from its prompting |
| `material.js` | `applyMaterialDefaults`, `presetFieldNames` |

- **Rewrite the three `.cjs` suites to `require()` these modules.** The assertions are already good
  and stay as they are; only the extraction mechanism changes. *(D1)*
- **Delete `persistCache`; export `cleanupTooltips` properly.** *(C7)*

**Exit** — No `new Function` and no `indexOf`/`slice` in any test. Renaming a function breaks the
import, loudly, instead of silently emptying a test.

### Phase 4 — Backbone decomposition

*The real conversion. Screens become views, state moves into models, markup becomes Pug.*
**Size XL · 6 issues**

- **Models first, views second** — the `slicer_cli_web` pattern, where `WidgetModel` normalizes and
  validates on `set()` and views merely `listenTo(model, 'change', render)`. Here: `LaserModel` /
  `LaserCollection` (ordering, the 28 cap, default-badge semantics), `CustomFieldCollection`, and
  `FlycutConfigModel` / `FlycutConfigCollection` against `resourceName: 'flycut/config'`. Module-level
  `state` disappears into these. *(C4)*
- **Shell:** `FlycutDashboardView` replaces `showScreen()` with child views it creates and destroys.
- **Screen views:** `WorkflowHomeView`, `ConfigurationPickerView`, `GenerationPickerView`,
  `RegistrationPickerView` — each maps one-to-one onto a section already in `workflow.html`. *(C1)*
- **Builder views:** `ConfigBuilderView` composing `RunParametersView`, `LaserListView` /
  `LaserCardView`, `CustomFieldsView`, `PreviewView`, `JsonPanelView`, `StatusPanelView`. Children
  tracked with `parentView: this` so `View.destroy()` reclaims them.
- **Templates to Pug**, one `templates/<camelCase>.pug` per view; the laser card and custom-field row
  become mixins, and the four picker screens share a base via `extends`. *(C2)*
- **Styles to Stylus**, one file per view, tokens in `variables.styl`, imported for side effect from
  the view module. *(C3)*
- **Resolve the shadow root** per Decision 1. If dropped, every selector gains a `g-flycut-` prefix in
  the same pass.
- **`girder.dialog.confirm`** replaces the three `confirm()` calls; `canLeave()` becomes
  promise-returning. *(C5)*
- **pug-lint and stylelint** join `npm run lint`.

**Exit** — Zero HTML or CSS string constants. Every view extends `girder.views.View` with an `events`
hash, `render` returning `this`, and `export default` last. All four linters clean.
`config_builder/static/` is deletable, per Decision 3.

### Phase 5 — Server-side alignment

*Model layer, resource split, and the Python style question settled.* **Size L · 4 issues**

- **`FlycutConfig` model** registered with `ModelImporter.registerModel`, owning `validate()`,
  lifecycle, and workspace containment — the logic currently spread across `gate`, `config_item`,
  `in_workspace`, `lifecycle` and `serialize`. *(E4)*
- **`StackLock` model** formalizing the Phase 0 TTL fix behind the model layer. *(E2)*
- **Split `rest.py`** into `rest/config.py`, `rest/template.py`, `rest/settings.py`; replace the 14
  `self.gate()` calls with one decorator and use `modelParam` where a document is loaded by id. *(E6)*
- **Hoist every function-local import**, removing the three redundant `ObjectId` re-imports. *(E5)*
- **Apply the line-length decision** module by module. *(B4)*

**Exit** — Ruff clean at the chosen settings. No REST module over ~250 lines. A configuration's rules
live in one file.

### Phase 6 — Packaging, dependencies, and the last mile

*Installable from an index; Python tests and a browser suite in CI.* **Size L · 8 issues**

- **Resolve the jsonforms patch** — the blocking item. Upstream it, or publish a fork under its own
  name. Until then CI cannot run a single Python test. *(F2, B5)*
- **Delete `vendor/`** and its four `.gitignore` negations; depend on a pinned PyPI girder-dashboards.
  *(F1)*
- **Python tests into CI**, with a `tox.ini` that provisions the environment in one command.
- **Config page decision executed** — either `routes.js` + `exposePluginConfig('flycut', …)` +
  `ConfigView` reusing the already-written admin markup, or delete the screen and its four endpoints.
  *(C6, E7, G1)*
- **Browser end-to-end harness** modelled on `girder-dashboards/test/browser`, walking draft →
  submitted → generated → registered. *(D2)*
- **Package metadata and `LICENSE`.** *(F3)*

**Exit** — `pip install girder-flycut` works from an index. CI runs lint, Python tests, Node tests,
and a browser pass. No file in the repository is a copy of something that lives elsewhere.

---

## Decisions — all answered

Answered by the maintainer on 2026-09-27, after Phase 2. Each is recorded with what it
changes, because several rewrite the phases that follow.

### 1. Drop the shadow root — done in Phase 4b

**Done.** The dashboard is ordinary light DOM under a single `.g-flycut-dashboard` class,
`registerPluginStaticContent` carries `css=['/style.css']`, and the JS bundle lost 22 kB
when the stylesheet stopped being a string inside it.

Scoping is by one root class rather than a prefix on each of 288 selectors — which is what
the conventions actually ask for ("root every rule under a plugin-specific `g-` class") and
leaves the markup and every `querySelector` in the builder untouched. `tests/bundle.cjs`
fails if any rule in the built `style.css` escapes that root.

### 2. JSONForms dependency — resolved in Phase 0

The `igsn` branch by direct git reference; the patch is deleted. See F2.

### 3. `config_builder/static/` does **not** stay standalone — Phase 4 deletes it

The plugin takes ownership of its markup.

**Changes, and they are the largest in this plan:**

- **A2 and A6 get deleted rather than guarded.** The literal needles exist because the
  markup is derived from `index.html`. Once the plugin owns it, `generate-sources.mjs`
  loses its substitutions entirely and most of the file goes with them.
- **The eslint formatting pass unblocks** the moment the markup moves, since nothing
  matches `app.js`'s text any more. `.eslintrc.md`'s deferral ends there.
- **Phase 3's core extraction serves one consumer,** so the extracted modules can live
  inside `girder_flycut/web_client/` instead of somewhere both halves can reach.
- **Phase 4 absorbs `app.js`** instead of wrapping it.

### 4. Build the config page — Phase 6

Promote the hidden admin screen to `#plugins/flycut/config` via `exposePluginConfig`. The
markup, workspace browser, principal search and save handler already exist; the four
`@access.admin` endpoints they call stay. Closes C6, E7 and G1 together, and removes a
misconfiguration class that `DASHBOARD_CONFIGURATION.md` currently documents as
troubleshooting — admins hand-write ObjectIds into a JSON textarea today.

### 5. `ruff format` plus import sorting at 120 columns — Phase 5

Adopt `ruff format` repo-wide (18 files change, including all of `girder_flycut/`) and
enable `I`. Keep the 120-column limit already in `ruff.toml` rather than
girder-dashboards' 88: it respects the existing dense style while ending the
581-character line and making diffs reviewable.

**Changes:** B4 becomes a formatter run plus a CI step rather than a manual rewrap, and
E5's import hoisting is what `I` then enforces.

## Measurements

Everything quoted above, gathered by running the tools rather than reading the code.

| Measure | Value | How |
|---|---|---|
| Python source | 1,706 lines | `wc -l girder_flycut/*.py` |
| Largest Python module | 604 lines | `rest.py`, 18 routes |
| Generated client bundle | 909 lines | `web_client/main.js`, committed |
| Hand-written client source | 2 files | `client_wrapper.js` 450 + `app.js` 459 |
| Ruff findings | 34 | 26 I001 · 4 F401 · 3 F841 · 1 E401 |
| Lines over 100 chars | 253 | max 581, in `build_dashboard.py` |
| ESLint findings | 4 | 1 parse failure · 3 `no-alert` |
| Pug / Stylus / Vite files | 0 | excluding `vendor/` |
| Python tests | 37 | 24 API · 13 dashboard — *not run* |
| Node suites | 3 | all pass |
| Wheel contents | 27 files | correct — no tests, vendor, or sources |
| Vendored dependency | 30 files | `vendor/girder-dashboards/`, stale |

---

Audited against `1f317f9` on a clean tree; no files were modified. References are `file:line` at that
commit. Conventions cited are `girder/WEB_CLIENT_CONVENTIONS.md`, `girder/CLAUDE.md`, and
`girder-dashboards/docs/extending.md`.
