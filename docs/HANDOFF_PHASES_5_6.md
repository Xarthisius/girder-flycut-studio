# Handoff — Phases 5 and 6

A working document for the two phases that remain. `docs/CONVERSION_PLAN.md` stays the
authority on *what* each issue is; this is *how to finish them*, with the anchors and the
measurements taken on 2026-09-27. **Delete this file when Phase 6 lands.**

| | |
|---|---|
| **Closed** | 28 of 33. Phases 0–4 complete; Phase 5 steps 1–3 done. |
| **Left** | 5 — `E6` (Phase 5) and `C6 E7 F1 F3 G1` (Phase 6) |
| **Baseline** | PR #11 is merged. `E5` and `B4` landed on `phase-5a-imports-and-format`. |

**Line numbers below predate `B4`.** The formatter rewrapped 18 files and grew
`rest.py` from 608 lines to 764, so re-grep for an anchor rather than trusting the
number next to it.

### The two questions, answered

1. **`E501` is a CI gate, at 120 columns** — Decision 5 unchanged. `ruff.toml` selects
   `E5` and `I`, and CI runs `ruff format --check .` too, which is why ruff is pinned
   exactly in both `requirements-dev.txt` and the workflow. 88 columns was considered
   and rejected: it leaves 20 prose lines to rewrap by hand against 120's three.
2. **The in-dashboard admin button goes.** The screen lives at the route. So `G1` is a
   deletion rather than the one-line hide recorded below, **and the harness's 11 admin
   checks must be moved to drive `#plugins/flycut/config`** instead of un-hiding the
   button, or they quietly stop testing anything.

---

## Ground truth, measured

Not from the plan — from running the tools on `193bad7`.

| | |
|---|---|
| Python | 1,742 lines across 16 modules |
| `rest.py` | 608 lines, 18 routes, 14 `self.gate()` calls |
| pytest | 42 tests, 2 subtests, **87% coverage**, ~16s |
| Lines over 100 chars | 225 · over 120: **74** · longest 275 (`generate.py:67`) |
| `ruff check --select I` | 14 `I001` (all auto-fixable) |
| `ruff format --line-length 120` | **16 of 19 files** would change |
| Function-local imports | 22, in 6 modules |
| `vendor/girder-dashboards` | 61 files — and see F1 below |

### The safety net, and its holes

`pytest tests` is the net for everything in Phase 5. **Run it after each step, not at the
end** — a 16-second suite is cheap and the refactors below are wide.

What it does *not* cover, so change these with care:

- **The four `@access.admin` settings routes.** Only the browser harness reaches them, by
  un-hiding a button (`test/browser/verify.cjs`, the admin section). If you touch
  `get_settings` / `save_settings` / `settings_principals` / `settings_workspace`, run
  `node test/browser/verify.cjs`.
- **`engine.py` at 74%** and `template_identity.py` at 77% — the LightBurn XML paths.
- The browser harness is 89 checks and spends **two stack IDs per run**; it is the only
  thing that renders the UI.

---

## Phase 5 — server-side alignment

~~Step 1 (`E5`)~~, ~~Step 2 (`B4`)~~ and ~~Step 3 (`E4`/`E2`)~~ are done; they are kept
below for the record. **Resume at Step 4.**

Four issues: `E5`, `B4`, `E4`/`E2`, `E6`. **Do them in that order.** Formatting before
restructuring keeps the restructuring diff readable; hoisting imports before formatting
means the formatter sorts the final set.

### ~~Step 1~~ — `E5`: hoist the function-local imports  ✅

**Done.** 20 of the 22 hoisted. The `girder_jsonforms` prediction below was wrong: that
import is not a deferral but the body of a `try`/`except ImportError` that degrades
`register_config()` to a 503, and `rest.py` imports `materials` at module scope, so
hoisting the `materials.py` copy alone would turn a missing dependency into a failed
plugin import. Both stay deferred, and both now carry a comment saying so.

22 of them. Mostly mechanical, with **two exceptions that must stay local**:

- **`__init__.py:16-20`, inside `FlycutPlugin.load()`.** `settings.py:11` does
  `from . import KEY`, so hoisting `.settings` or `.rest` into `__init__.py`'s module scope
  is circular. They are deferred on purpose. **Leave them.**
- **`rest.py:529`, `from girder_jsonforms.models.deposition import Deposition`**, and the
  same import in `materials.py:7`. `girder-jsonforms` is a hard dependency, so this
  *probably* hoists cleanly — but it is the one import that reaches into another plugin,
  and plugin load order is not something this module controls. Hoist it, then confirm the
  server still starts (`girder serve`, or the live instance) rather than trusting pytest,
  which imports differently.

The rest are safe: `rest.py` already imports `.validation` at module level (line 28), so
the local one at line 349 is redundant; `.inventory` imports nothing; the `girder.models.*`
and `bson`/`re` ones are plain deferrals with no reason behind them. Three redundant
`ObjectId` re-imports go (`rest.py:195`, `rest.py:504`, and the module-level one at line 3
already covers both).

### ~~Step 2~~ — `B4`: Decision 5's formatter run  ✅

**Done**, and the three-residual-line prediction held exactly. Proven formatting-only
by AST-comparing every changed file against its previous revision with import and alias
order normalised; the only residual difference was two docstrings in `engine.py`.

`ruff format` plus `I`, at the 120 columns already in `ruff.toml`.

```sh
.venv/bin/python -m ruff check --select I --fix girder_flycut tests
.venv/bin/python -m ruff format --line-length 120 girder_flycut tests
```

16 files change. **Do it as its own commit with no other change in it**, the way Phase 4a
did the deferred `eslint --fix` — a formatting commit mixed with logic is unreviewable.

**`ruff format` does not fix everything.** 74 lines are over 120 now; formatting leaves
**exactly 3**, all prose the formatter will not rewrap. Line numbers are post-format:

- `engine.py:208` (131) — the `apply_cut_defaults_to_flyer` docstring
- `rest.py:691` (127)
- `settings.py:57` (122)

Rewrap those three by hand in the same commit, then add `E501` and `I` to `ruff.toml`'s
select list and to CI so they stay fixed. Right now `ruff.toml` selects `E4,E7,E9,F` only.

Verify: `ruff check .`, `pytest tests`, and `git diff --stat` should be formatting only.

### ~~Step 3~~ — `E4` and `E2`: the model layer  ✅

**Done.** `FlycutConfig` subclasses `Item` rather than standing beside it. One correction
to the table below: `validate()` is reachable only on the creation path, which 5b routed
through the model for that reason. Every other configuration write is a partial
`update_one` with `$set`/`$unset` on nested `meta.flycut` fields and bypasses the model
entirely; converting those is not part of `E4`, and several are deliberate atomic field
flips whose concurrency a whole-document save would not preserve. `rest.py` is 684 lines
now, and `tests/test_models.py` adds 14 tests.

`FlycutConfig`, registered with `ModelImporter.registerModel`. It absorbs the logic
currently spread across five methods of the REST resource:

| Now | Line | Becomes |
|---|---|---|
| `Flycut.gate` | `rest.py:112` | a decorator (see `E6`), not the model |
| `Flycut.in_workspace` | `rest.py:167` | `FlycutConfig.inWorkspace` |
| `Flycut.config_item` | `rest.py:183` | `FlycutConfig.load` with the workspace check |
| `Flycut.lifecycle` | `rest.py:189` | `FlycutConfig.lifecycle` |
| `Flycut.serialize` | `rest.py:219` | `FlycutConfig.filter` |

`lifecycle()` is the interesting one: **status is derived, not stored.** A configuration is
`generated` because its file ids still resolve, `registered` because it has a registration.
Keep that — several tests depend on deleting files returning a configuration to
`submitted`, and so does the harness.

`StackLock` formalises the Phase 0 TTL fix. The pieces are already isolated at
`rest.py:41-90`: `LOCK_COLLECTION`, `stack_locks()`, `ensure_lock_expiry()` and the
`@stack_locked` decorator. This is a move, not a redesign. Do not change the TTL or the
index without reading the comment at `rest.py:41` first — a crash that leaves a lock behind
is what it exists for.

**Risk.** `serialize()` is what every screen in the client reads. Changing its output shape
breaks the UI silently — pytest asserts on it, but the browser harness is what proves the
pickers still populate. Run both.

### Step 4 — `E6`: split `rest.py`

684 lines, 18 routes. Into `rest/config.py`, `rest/template.py`, `rest/settings.py`, per
the plan. Two things go with it:

- **The 14 `self.gate()` calls become one decorator.** `gate()` checks that the dashboard
  document exists, is enabled, and is readable by the current user; it returns the user,
  which is why every call site assigns it. A decorator that injects the user keeps that.
- **`modelParam` where a document is loaded by id** — the five routes taking `:id`.

Exit: no REST module over ~250 lines, and a configuration's rules in one file.

---

## Phase 6 — packaging and the last mile

Five issues. `F1` first: it is the cheapest and it unblocks a simpler CI.

### `F1` — delete `vendor/`, and it is safer than recorded

**The plan calls the vendored copy "stale". It is not.** Measured:

- `girder-dashboards` **0.2.0 is published on PyPI** (releases: 0.1.0, 0.1.1, 0.2.0).
- The published wheel's 9 files are **byte-identical** to `vendor/girder-dashboards/`,
  including the prebuilt `web_client/dist/`, which is the thing CI depends on.

So this is a clean deletion:

1. `requirements.txt:4` — `./vendor/girder-dashboards` → `girder-dashboards==0.2.0`.
   `setup.py` already says `girder-dashboards>=0.2.0` and needs no change.
2. `.github/workflows/build-test.yaml` — two `pip install ./vendor/girder-dashboards`
   lines become nothing; pip resolves it.
3. Delete `vendor/`, and the four `.gitignore` negations at lines 20-23 plus line 7.
4. `pugLintConfig.excludeFiles` in `package.json` still lists `**/vendor/` — harmless, but
   remove it.

Verify with a clean venv: `pip install -r requirements.txt && pytest tests`.

### `C6` / `E7` / `G1` — the config page

Decision 4: promote the hidden admin screen to `#plugins/flycut/config`. These three close
together and the work is already mostly done.

- `AdminSettingsView` exists, is a proper view, and **has 11 browser checks** — the policy
  loads, collections populate, the four roles render, adding a principal lists it, adding
  it twice does not duplicate, removing restores, saving round-trips. That coverage was
  added in 4d precisely so this promotion would be safe.
- The four `@access.admin` endpoints it calls (`rest.py:121`, `:136`, `:145`, `:157`) stay.
  That is `E7`.
- `G1` is `WorkflowHomeView.js:31`, one line: `this.$('#adminSettingsBtn').addClass('hidden')`.

What is missing is only the Girder plumbing: a `routes.js` with
`router.route('plugins/flycut/config', ...)` and `exposePluginConfig('flycut', ...)`, and a
`ConfigView` that mounts `AdminSettingsView`. There is no `routes.js` in the client today —
grep confirms `exposePluginConfig` appears nowhere.

Decide what happens to the in-dashboard button. Either it goes (the screen lives at the
route) or it stays un-hidden as a shortcut. **If it goes, move the harness's admin section
to drive the route instead of un-hiding the button**, or 11 checks quietly stop testing
anything.

`docs/DASHBOARD_CONFIGURATION.md` documents hand-writing ObjectIds into a JSON textarea as
troubleshooting. That paragraph is what this deletes.

### `F3` — package metadata and `LICENSE`

- **There is no `LICENSE` file.** `package.json` and `setup.py` both say BSD-3-Clause; the
  text is missing. Add it.
- `setup.py` has no `classifiers`, no `long_description`, no `author`, no `url`.
- Consider `pyproject.toml` — it currently holds only a ruff pointer.

### Optional, from the Phase 6 list

A `tox.ini` that provisions the test environment in one command. The Python suite is
already in CI (that happened in Phase 0 with `B5`), so this is convenience, not a gap.

---

## Environment and commands

`CLAUDE.md` has the full set and the environment truths that cost real time. The short
version:

```sh
export PATH=/usr/bin:$PATH && hash -r     # node 24, not the nvm default

# Python
.venv/bin/python -m ruff check .
.venv/bin/python -m pytest tests --mongo-uri mongodb://127.0.0.1:27017 -q \
    --cov=girder_flycut --cov-report=term

# Browser (two npm projects)
npm ci && npm --prefix girder_flycut/web_client ci
npm run lint && npm run build && npm test

# The live instance — bind-mounts this tree, so it serves whatever is checked out
export NODE_TLS_REJECT_UNAUTHORIZED=0
export GIRDER_URL=https://girder.local.xarthisius.xyz
export GIRDER_ADMIN=admin GIRDER_PASSWORD=arglebargle123
node test/browser/verify.cjs
```

Phase 5 is server-side, so `npm run build` only matters if you touch the client. Phase 6's
config page is both.

## Suggested branches

One per step, each its own PR, as every phase so far:

| Branch | Closes |
|---|---|
| `phase-5a-imports-and-format` | `E5`, `B4` |
| `phase-5b-models` | `E4`, `E2` |
| `phase-5c-rest-split` | `E6` |
| `phase-6a-drop-vendor` | `F1` |
| `phase-6b-config-page` | `C6`, `E7`, `G1` |
| `phase-6c-metadata` | `F3` |

`phase-6a` is independent of everything in Phase 5 and can go first if a quick win is
useful.

## Two things to decide before starting

1. **Does the in-dashboard admin button survive the config page?** Affects `G1` and the
   harness. See above.
2. **Does `E501` become a CI gate, or just the formatter's output?** Three lines will not
   rewrap themselves. Gating means fixing them; not gating means the 120-column limit is
   advisory and will drift again.
