# Backend review — what is left

A working document for the Python side, written after the review that produced
PR #21 (jsonforms hooks in the test suites) and PR #22 (timestamps as dates,
the config snapshot out of `meta`). **It is disposable; delete it when the last
item lands.**

Everything below was measured against `review-config-out-of-meta`, not read off
the code. Line numbers drift, so each item names an anchor instead.

| | |
|---|---|
| **Python** | 2,628 lines across 27 modules |
| **Tests** | 68 pytest at 88%, five Node suites, an 89-check browser harness |
| **Done** | the two issues that were correctness risks — see PR #21, #22 |
| **Left** | six, none of them a bug; all are cost, clarity, or dead weight |

---

## 1. The listing endpoints are N+1  *(highest value)*

**Measured**, by counting model calls per request:

| endpoint | `Dashboard.findOne` | `Folder.load` | at N=100 |
|---|---|---|---|
| `GET /flycut/config` | N+2 | 3N | **402 round trips** |
| `GET /flycut/stack-states` | N+1 | 2N | 301 |
| `GET /flycut/submitted-stacks` | N+1 | 2N | 301 |

Opening the dashboard calls all three, so a workspace at the endpoint's own
100-configuration limit costs **roughly a thousand round trips per page load**.
Generated configurations add one `File.findOne` each on top, from `lifecycle()`
resolving file ids.

**Cause.** `FlycutConfig.inWorkspace()` calls `studio_settings.policy()` — which
is a `Dashboard().findOne()` plus a deepcopy — and then loads the item's folder
and usually its parent. It runs once per item, and three endpoints iterate every
configuration in the instance.

**Fix, cheapest first.**

1. **Resolve the policy once per request.** Nine call sites read
   `policy()["workspace_folder_id"]`; most are in loops or in functions called
   from loops. Passing the resolved policy in removes N of the N+2.
2. **Resolve the workspace's folder ids once.** `inWorkspace` walks parents per
   item to answer a question about a fixed, small set of folders: the workspace,
   its `Drafts`, and the per-stack folders directly under it. One query for that
   set, then a membership test, removes the 3N.
3. **Scope the Mongo query.** `CONFIG_QUERY` finds every configuration in the
   instance and filters in Python. Adding the workspace to the query means fewer
   documents come back at all.

**Risk.** `inWorkspace` *is* the containment rule — it decides what a user is
allowed to see. Changing it changes access. Pin the current behaviour with tests
first: `tests/test_models.py` already covers the in-workspace and out-of-workspace
cases, and the drafts-subfolder case needs one more.

**Exit.** `Dashboard.findOne` constant per request; `Folder.load` independent of
N; the three endpoints' totals flat as configurations are added.

---

## 2. Eight of the eighteen direct Mongo writes no longer need to be

This was the part of the review with the strongest justification, and **PR #22
removed most of that justification**. Current state:

| kind | count | verdict |
|---|---|---|
| Atomic compare-and-swap, or a mutex | 9 | **Keep.** A read-modify-write would race. |
| Restoring a file-mirroring payload after a save | 1 | **Keep.** `annotate()`; see below. |
| Plain partial writes to `meta.flycut` | 8 | **Convertible now.** |

**Why they were unavoidable, and no longer are.** girder-jsonforms rewrites
ISO-8601 strings under `meta` into dates on every item save. Before #22,
`meta.flycut` held four ISO strings and `meta.config` held the operator's
snapshot, so any model save corrupted both. Now the timestamps *are* dates —
coercion passes over them unchanged — and the snapshot lives outside `meta`.

Verified rather than assumed: a plain `Item().save()` on a fully generated
configuration is lossless. Snapshot unchanged, timestamps unchanged, whole `meta`
byte-identical.

**Fix.** Give `FlycutConfig` the named methods these call sites are written
around, so the Mongo detail lives in the model — which is where `E4` said a
configuration's rules belong — and each call site reads as intent:

```python
FlycutConfig().setState(item, status="generated", files=..., generatedAt=...)
FlycutConfig().claim(item, expect="draft", become="deleting")  # the CAS, returns bool
```

The nine that stay are `lock()`, the two draft claims in `save_config` and
`delete_draft` and its rollback, the IGSN reservation's duplicate-key insert, the
three `StackLock` operations, and `link_input`'s `$setUnion` pipeline. Each is an
atomicity requirement, not a shortcut, and each should say so in one line.

`annotate()` stays because the payload it restores is stored *under* `meta` and
has to equal the artifact file byte for byte — the same invariant
`register_metadata` documents.

**Risk.** Low, but a full-document save has different concurrency semantics from
a partial `$set`: it writes the whole document, so a concurrent change to another
field is lost. Every convertible site is already inside `@stack_locked`, which is
what makes this safe — confirm that before converting each one.

---

## 3. `save_config` is 111 lines

One function doing: a size check, packing, a draft guard, submit-time validation,
name derivation, state assembly, stack-collision arbitration across three
different 409s, and three separate persistence paths.

The name line is a nested ternary with an `or` in the middle:

```python
name = f"stack{stack}-config" if submit else name or (f"stack{stack}-config" if stack else "Untitled draft")
```

**Fix.** Extract the pieces that have names already: `_render(config, submit)`,
`_derive_name(...)`, `_initial_state(...)`, `_resolve_stack_collision(...)`. The
three persistence paths — overwrite an existing stack, update a draft, create new
— are the natural seams.

**Exit.** No function over ~40 lines in `rest/config.py`.

---

## 4. Duplication worth a name

| expression | occurrences | belongs |
|---|---|---|
| `unpack(configuration(item))…["stackid"]…strip().upper()` | 7 | `FlycutConfig.stackId(item)` |
| `policy()["workspace_folder_id"]` | 9 | resolved once per request — see item 1 |
| `FlycutConfig().filter(FlycutConfig().load(id, user=user), user)` | 3 | one helper on the mixin |
| `FlycutConfig()` constructed | 24 | it is a singleton, but reads as a cost |

The first is the definition of "a configuration's stack ID" and is currently
re-derived by hand in four modules.

---

## 5. Dead state, and two overlapping mutexes

`meta.flycut.busy` is written but **never read** — except by its own
compare-and-swap in `lock()`. `meta.flycut.action` is **never read anywhere**,
server or client. Both are spread into the client payload by
`FlycutConfig.filter()`, where `busy` collides by name with the shell's own
request-in-flight flag.

`lock()` also looks redundant: `@stack_locked` already excludes concurrent
operations on the same item, because both requests derive the same stack ID from
it. The one argument for keeping it is `StackLock`'s 900-second TTL — if a
generation outran it, `busy` would still guard.

**Decide, then act:** either delete `lock()`, `busy` and `action` outright, or
keep `lock()` and write that TTL argument down where the next reader will find
it. `action` goes either way.

---

## 6. Long validators and dense expressions

Not urgent, but each cost a re-read during the review:

- `settings.validate_settings` — 70 lines, six unrelated validations.
- `validation.normalize_config` — 50 lines, six more, mixing validation with
  normalisation.
- `validation.normalize_config`'s custom-fields check — a triple negative inside
  an `any()`.
- `rest/config.next_stack_id` — a hand-rolled Crockford Base32 encoder whose
  `if value: break` is an overflow guard that reads like a bug.
- `rest/config.stack_states` — rebuilds its `rank` dict on every iteration.

**Fix.** Split the two validators along the groups they already have; give the
encoder a name and a docstring; hoist `rank`.

---

## Suggested branches

One per item, in this order. The first two are worth doing; the rest are tidying.

| branch | item | why this order |
|---|---|---|
| `perf-listing-n1` | 1 | the only item with a user-visible cost |
| `model-owns-its-writes` | 2 + 4 | the stack-ID helper falls out of the same work |
| `split-save-config` | 3 | easier once the model owns the writes |
| `drop-dead-lifecycle-state` | 5 | needs the decision below first |
| `tidy-validators` | 6 | independent, can go any time |

## Two things to decide first

1. **Does `lock()` survive?** It is either redundant with `@stack_locked` or it is
   the guard for a lock that outran its TTL. That is a question about which
   failure you want to be protected from, not a code question — see item 5.
2. **How far does item 2 go?** Converting all eight writes is the consistent
   answer; converting only the ones outside `finally` blocks is the conservative
   one. The difference is whether a whole-document save in a cleanup path is
   acceptable when the lock is already held.
