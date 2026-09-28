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
| **Done** | the correctness risks, the measured cost, and the model's writes — PR #21, #22, items 1–3 and 5 |
| **Left** | three. None is a bug; each is clarity or dead weight |

---

## 1. The stack mutex has two bugs  *(done — `redis-stack-lock`)*

**Landed.** Both questions below were answered as recommended: the lock fails closed,
and `models/lock.py` is gone. `rest/locking.py` now holds the whole mutex — a
`stack_mutex()` wrapper over `redis-py`'s `Lock` plus the `stack_locked` decorator —
and `tests/test_locks.py` is six tests, both probes among them, each confirmed to fail
against the old behaviour before being kept. `redis` is declared in `setup.py`; CI's
pytest job already provisioned a Redis and its comment now says the lock requires one.
The record below is why, kept until this document goes.

`stack_locked` is **thread-safe** in the narrow sense, and deliberately so. It
keeps no shared mutable state, `StackLock()`'s only shared attribute is a
PyMongo collection (which is thread-safe), and mutual exclusion is delegated to
MongoDB's unique `_id` index. That last part matters: the server runs
`gunicorn --workers=4`, so a `threading.Lock` would have covered one worker in
four.

Two things are wrong underneath that, both reproduced rather than reasoned
about.

### The release is not ownership-checked

`hold()` ends with `delete_one({"_id": stack})`, which deletes by id alone. If
the 900-second TTL reclaims the document while the holder is still working, a
second request legitimately acquires the lock -- and the first holder's
`finally` then deletes *the second holder's* document:

```
second holder present while first is still inside: second
after the first holder's finally ran   : None
```

Both writers proceed with neither holding a lock. Mongo's TTL monitor runs
about every 60 seconds, so real expiry is the TTL plus up to a minute.

### Every stack-less configuration shares one mutex

The decorator derives the stack ID from the raw payload *before* the handler
validates anything, so a submit with no `stackid` -- or no `run_params` at all
-- takes the lock `_id: ""`:

```
lock taken for a config with no stackid   : [{'_id': ''}]
lock taken for a config with no run_params: [{'_id': ''}]
```

Two unrelated malformed submits then refuse each other with "This stack is
being changed", which is both wrong and misleading.

### Fix: a thin fail-closed wrapper over redis-py's lock

Redis is not optional infrastructure here. Girder core imports it at module
scope in `notification.py`, which `asgi.py` pulls in, and it reads the same
`GIRDER_NOTIFICATION_REDIS_URL` this would use. It is always present and always
configured.

`redis-py`'s `Lock` stores a per-acquisition token and releases through a Lua
script that compares it, so **the first bug is fixed by the library**. Verified
against a real Redis:

```
expiry then reacquire -- can the first holder steal the second's lock?
  second acquired after expiry: True
  second holder's lock survived our release: True
```

**Wrap it ourselves; do not use `girder_jsonforms.lib.locks.distributed_lock`.**
That one logs and proceeds when Redis errors or acquisition times out -- correct
for the idempotent startup step it was written for, wrong for a mutex guarding
IGSN registration. With Redis unreachable it grants the same lock twice:

```
--- with Redis unreachable ---
  both critical sections ran: ['outer', 'inner']
  => mutual exclusion: LOST
```

Ours takes `blocking=False`, `timeout=900`, raises 409 when the lock is held,
and converts `RedisError` to a 503 rather than proceeding. About twelve lines.

**What it deletes.** `models/lock.py` entirely -- 55 lines, the TTL index,
`ensureExpiry`, its `_guard` call in `load()`, and the "drop stuck documents by
hand" caveat in its docstring. Three of the direct Mongo operations counted in
item 3 go with it.

**The trade-off, stated plainly.** During a Redis outage the request fails
where today it would carry on. Failing closed is the right default for a mutex
guarding IGSN registration, and Girder's own notifications are already degraded
in that state -- but it is a behaviour change, not a free win.

The second bug is independent of the substrate: it lives in `stack_locked`'s
derivation and needs the same guard whichever mutex sits underneath.

**Exit.** A stack-less submit is refused by validation rather than by the lock;
an expired-then-reacquired lock survives its previous holder's release; and both
probes above are regression tests.

---

## 2. The listing endpoints are N+1  *(done — `perf-listing-n1`)*

**Landed.** All three endpoints are now **four queries flat** — two
`Dashboard.findOne` (the gate's and one policy read), one `Folder.find` resolving
the scope, one `Item.find` — against `N+2`/`3N` and `N+1`/`2N` before. At the
endpoints' own 100-configuration limit that is 12 round trips per dashboard open
rather than roughly a thousand.

The rule moved into a `WorkspaceScope`: one query resolves the workspace, its
children and the folders under any Drafts root, and membership is tested against
that. The third `N` was not containment at all but `Item().hasAccess`, which loads
the item's folder and defers to `Folder.hasAccess` — the scope already holds every
such folder, so `scope.hasAccess` is that same call without the load.

`inWorkspace` was pinned first, as this item asked: nine tests in
`tests/test_models.py` cover all three in-workspace layouts (loose, stack folder,
draft under Drafts) and six ways out, and two more assert `scope.hasAccess` never
disagrees with `Item().hasAccess`. `tests/test_listing_cost.py` is the exit
criterion itself — it counts queries at two workspace sizes and fails if either
endpoint's cost grows. It failed on the numbers below before any of this, which is
how they were confirmed.

Two things were deliberately **not** scoped. `stack_matches` and `next_stack_id`
still search the whole instance: the first is what reports a collision outside
this workspace as someone else's stack rather than silently overwriting it, and
the second would otherwise hand out an ID already spent elsewhere. `stack_states`
with no workspace configured also still walks everything, because that is what it
did before and what the client's reuse guard depends on.

The record below is why, kept until this document goes.

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

## 3. Eight of the fifteen direct Mongo writes no longer need to be  *(done — `model-owns-its-writes`)*

**Landed, and the count came out differently than estimated.** Five writes now go
through `FlycutConfig.setState()` and therefore through `save()` and `validate()` —
the whole lifecycle: generate, its `busy` release, delete-files, register, its `busy`
release. Three more moved into the model *as* direct writes, behind names that say
what they are: `claimBusy()`, `claimStatus()` and `replace()`. Five stay where they
are, each now carrying its one-line reason. Fifteen scattered writes became eight,
and none of the eight is a shortcut.

**Two writes were expected to convert and could not**, for a reason the review did
not have: `Item.validate` appends `(n)` to a name that collides with a sibling,
whenever the name being saved differs from the one stored. A configuration's name is
derived from its stack ID, so a silent rename is not acceptable — which rules out a
model save for both replacement paths and for the `createItem` name fix. `setState`
is unaffected because it never changes `name`; that is asserted.

**`setState` reloads before it writes**, which the review did not anticipate either.
A caller holds the document it loaded before the work it is recording — `generate`
uploads files and `claimBusy` flips `busy` in between — so saving that copy back
would undo both. There is a test for exactly that.

The losslessness this item rests on is now pinned rather than spot-checked:
`tests/test_model_writes.py` takes a fully registered configuration, saves it through
the model, and asserts the snapshot, all four timestamps, the registration receipt
and the whole of `meta` come back unchanged.

The record below is why, kept until this document goes.

This was the part of the review with the strongest justification, and **PR #22
removed most of that justification**. Current state:

| kind | count | verdict |
|---|---|---|
| Atomic compare-and-swap, or a mutex | 6 | **Keep.** A read-modify-write would race. |
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

The six that stay are `lock()`, the two draft claims in `save_config` and
`delete_draft` and its rollback, the IGSN reservation's duplicate-key insert, and
`link_input`'s `$setUnion` pipeline. (It was nine; item 1 deleted `StackLock`'s
three outright.) Each is an atomicity requirement, not a shortcut, and each should
say so in one line.

`annotate()` stays because the payload it restores is stored *under* `meta` and
has to equal the artifact file byte for byte — the same invariant
`register_metadata` documents.

**Risk.** Low, but a full-document save has different concurrency semantics from
a partial `$set`: it writes the whole document, so a concurrent change to another
field is lost. Every convertible site is already inside `@stack_locked`, which is
what makes this safe — confirm that before converting each one.

---

## 4. `save_config` is 111 lines

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

## 5. Duplication worth a name  *(done — `model-owns-its-writes`)*

**Landed**, as this item predicted, out of the same work. `schema.stack_id(config)`
is the one definition and `FlycutConfig.stackId(item)` reads it off an item; the
seven hand-written copies across four modules are gone, including the one in
`save_config` that compared against `submitted_stack_ids` without upper-casing while
everything else did. The policy read was item 2. `LifecycleRoutes.rendered()` is the
load-and-filter helper. `FlycutConfig()` is still constructed everywhere; it is a
singleton and nothing measured says it costs anything.

| expression | occurrences | belongs |
|---|---|---|
| `unpack(configuration(item))…["stackid"]…strip().upper()` | 7 | `FlycutConfig.stackId(item)` |
| ~~`policy()["workspace_folder_id"]` | 9~~ | **done in item 2** — four left, none in a loop |
| `FlycutConfig().filter(FlycutConfig().load(id, user=user), user)` | 3 | one helper on the mixin |
| `FlycutConfig()` constructed | 24 | it is a singleton, but reads as a cost |

The first is the definition of "a configuration's stack ID" and is currently
re-derived by hand in four modules.

---

## 6. Dead state, and two overlapping mutexes

`meta.flycut.busy` is written but **never read** — except by its own
compare-and-swap in `lock()`. `meta.flycut.action` is **never read anywhere**,
server or client. Both are spread into the client payload by
`FlycutConfig.filter()`, where `busy` collides by name with the shell's own
request-in-flight flag.

**`lock()` stays, and this is now settled.** It looks redundant — `@stack_locked`
already excludes concurrent operations on the same item, because both requests
derive the same stack ID from it. But item 1 shows how the stack lock can be
*legitimately released while its holder is still working*: the TTL expires and a
second request acquires it. Ownership tokens stop the first holder deleting the
second's lock; they do not stop the expiry itself. `lock()`'s per-item
compare-and-swap is what still refuses the second generation in that window, and
the registration path has the `flycut_registration` duplicate-key reservation as
its own equivalent.

So: keep `lock()` and `busy`, and write that reason where the next reader will
find it, because it is not visible from the call site. Delete `action` — it is
read nowhere, server or client.

The alternative to a backstop is renewing the lock rather than letting it lapse
(`redis-py` exposes `extend()`), but that needs something to drive the renewal
from a synchronous handler. Not worth it unless generation gets much slower.

---

## 7. Long validators and dense expressions

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
| ~~`redis-stack-lock`~~ | ~~1~~ | **done** — the only correctness item, and it deleted a model |
| ~~`perf-listing-n1`~~ | ~~2~~ | **done** — the largest cost a user can feel |
| ~~`model-owns-its-writes`~~ | ~~3 + 5~~ | **done** — the stack-ID helper fell out of the same work |
| `split-save-config` | 4 | easier once the model owns the writes |
| `drop-dead-lifecycle-state` | 6 | just `action` now; see the note there |
| `tidy-validators` | 7 | independent, can go any time |

`redis-stack-lock` wants a Redis service in the pytest job. CI already
provisions one for girder-jsonforms' load-time lock, so nothing there changes.

## What is still open

1. ~~**Does the stack lock fail closed during a Redis outage?**~~ **Answered: yes.**
   A Redis outage now refuses the request rather than running unserialized. This is
   the behaviour change item 1 shipped: before, an outage did not stop a generation.
2. ~~**How far does item 3 go?**~~ **Answered: all eight, and it landed as five.**
   Every write that *could* become a model save did, cleanup paths included. Two
   could not, for a reason found while converting rather than decided: `Item.validate`
   renames on a sibling collision whenever the name changes, and a configuration's
   name is its stack's. See item 3.

*(The earlier question — whether `lock()` survives — is answered in item 6. It
does.)*
