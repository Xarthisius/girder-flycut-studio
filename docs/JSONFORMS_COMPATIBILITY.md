# JSONForms compatibility

Flyer Studio depends on **girder-jsonforms 2.1.1 or newer**, an ordinary PyPI release:

```
girder-jsonforms>=2.1.1
```

2.1.1 is the floor rather than a preference. Stack registration creates each stack as a
child deposition via `create_batch()`'s `relation_type`, `inverse_relation_type` and
`child_titles` arguments, and 2.1.1 is the first release that has them — the `igsn` branch
that carried them was merged and released.

**This used to be a git reference, and it needed a checkout with its frontend built by
hand.** A pip-from-git install has no `web_client/dist`, so JSONForms'
`registerPluginStaticContent` raised `FileNotFoundError` on `style.css` as soon as
anything touched the server. The published wheel ships that directory, so none of that
applies any more: no clone, no `npm run build`, no `--no-deps`.

No patch is needed. There used to be one; every hunk is now either upstream or
unnecessary:

| Hunk | Status |
|---|---|
| `create_batch()` relationships and child titles | Upstreamed as [PR #34](https://github.com/Xarthisius/girder-jsonforms/pull/34), merged into `igsn` on 2026-09-25 as `51500a3`, in a better form: keyword-only, validated, and tested. Released in 2.1.1. |
| Skip the AIMD portal task when `AIMD_PORTAL_TOKEN` is unset | Unnecessary in a deployment: every Girder install has a broker — core itself enqueues `deleteFolderTask.delay()` on `DELETE /folder/:id` — and the task returns early without a token, so the worst case is a queued no-op and a log line per registration. Tests have no broker, and use pytest_girder's `eagerWorkerTasks` fixture to run tasks inline, which is how girder core tests its own folder deletion. |
| Skip AIMDL project propagation for non-AIMDL items | Replaced by configuration. See below. |

## Configure `jsonforms.projects_enabled`

**A standalone Flyer Studio deployment must set `jsonforms.projects_enabled` to `false`.**

`PROJECTS_ENABLED` defaults to `true`. With it on, every item save carrying `meta.igsn`
reaches `propagate_to_projects()`, which calls `AIMDL._get_base_parent()` — and that
raises `RestException("AIMDL collection not found. Please ensure the collection exists.",
404)` when there is no AIMDL collection, which is exactly the case here. Turning the
setting off returns at the first line of that function instead, before the lookup.

Set it from the admin console under **Plugins → JSONForms**, or:

```sh
girder shell -c "from girder.models.setting import Setting; \
  Setting().set('jsonforms.projects_enabled', False)"
```

A combined AIMDL and Flyer Studio deployment should leave it `true`: the AIMDL collection
exists, the lookup resolves, and the `baseParentId` comparison already skips items that
live outside it.

## Related dependencies

This dependency stays separate because it provides the IGSN service and carries its own
deployment requirements and frontend. girder-dashboards is a pinned PyPI dependency
(`girder-dashboards==0.2.0`), installed before Flyer Studio. No database,
assetstore, credentials, or local preview launcher is bundled.
