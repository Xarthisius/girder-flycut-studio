# JSONForms compatibility

Flyer Studio depends on Xarthisius/girder-jsonforms from its **`igsn` branch**, declared
directly in `setup.py`:

```
girder-jsonforms @ git+https://github.com/Xarthisius/girder-jsonforms.git@igsn
```

The branch is required rather than preferred. Stack registration creates each stack as a
child deposition via `create_batch()`'s `relation_type`, `inverse_relation_type` and
`child_titles` arguments, which have never been released to PyPI.

Install it from a checkout with its frontend built, rather than letting pip resolve that
reference — see [INSTALLATION.md](INSTALLATION.md). The package ships only prebuilt
frontend assets, so a pip-from-git install has no `web_client/dist`, and JSONForms' own
`registerPluginStaticContent` raises `FileNotFoundError` on `style.css` as soon as
anything touches the server. Its CI builds the frontend for the same reason.

No patch is needed. There used to be one; every hunk is now either upstream or
unnecessary:

| Hunk | Status |
|---|---|
| `create_batch()` relationships and child titles | Upstreamed as [PR #34](https://github.com/Xarthisius/girder-jsonforms/pull/34), merged into `igsn` on 2026-09-25 as `51500a3`, in a better form: keyword-only, validated, and tested. |
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
deployment requirements and frontend. `vendor/girder-dashboards` ships the dashboards
dependency with its original licence; install it before Flyer Studio. No database,
assetstore, credentials, or local preview launcher is bundled.
