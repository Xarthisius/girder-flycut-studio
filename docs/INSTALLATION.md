## Installation

Use an environment with Python 3.10+ and MongoDB. From this folder:

```sh
python -m pip install ./vendor/girder-dashboards .
```

`setup.py` depends on girder-jsonforms directly from its **`igsn` branch**, so pip
fetches it for you:

```
girder-jsonforms @ git+https://github.com/Xarthisius/girder-jsonforms.git@igsn
```

That branch is required, not a preference: Flyer Studio registers each stack as a child
deposition using `create_batch()`'s `relation_type`, `inverse_relation_type` and
`child_titles` arguments, which have never been released to PyPI.

### The two remaining guards

Flyer Studio has no AIMD portal token and no Celery broker. It runs inside Girder and
acts as the signed-in user; that authentication is the whole authorisation story, and
nothing in this plugin talks to the AIMD portal. girder-jsonforms on `igsn` does not yet
assume that, so two of its AIMDL hooks fire on the registration path and fail:

- `handle_deposition_registration()` enqueues `register_deposition_with_aimd.delay()`.
  The task returns early when `AIMD_PORTAL_TOKEN` is unset, but `.delay()` still needs a
  broker to enqueue it at all.
- `propagate_to_projects()` assumes every item lives in the AIMDL collection, which
  items in a user's personal workspace cannot.

Until those land upstream, install girder-jsonforms from a patched checkout rather than
letting pip resolve the bare git reference:

```sh
# In a directory alongside this repository:
git clone -b igsn https://github.com/Xarthisius/girder-jsonforms.git ../girder-jsonforms
git -C ../girder-jsonforms apply ../girder-flycut-studio/patches/girder-jsonforms-flycut.patch
python -m pip install -e ../girder-jsonforms
python -m pip install ./vendor/girder-dashboards
python -m pip install --no-deps .
```

`--no-deps` on the last line is load-bearing: without it pip re-resolves the
`git+...@igsn` reference from `setup.py` and replaces the patched checkout you just
installed with an unpatched one.

Upstreaming both guards, the way `create_batch` went up as PR #34, removes this step and
makes the dependency in `setup.py` sufficient on its own. That is the proper fix.

The bundled dashboard dependency requires Girder 5.0.13.dev27 or newer. Pip still needs access to standard Python dependencies unless they are already installed. This folder is not a bundled Python runtime or database.

Build the JSONForms frontend with `npm install && npm run build` in its `girder_jsonforms/web_client` folder, and enable/load the `jsonforms` plugin alongside Flyer Studio.

Start your Girder server with its normal MongoDB and assetstore configuration, then enable **Flyer Studio** in the dashboards administration page and grant the intended users access. The plugin entry point is `flycut`, Python package is `girder_flycut`, and distribution remains `girder-flycut` to replace the current installation cleanly. Do not install the older, separate studio implementation alongside it.

The configurable child titles and relationships that half of this patch used to supply
were upstreamed as [PR #34](https://github.com/Xarthisius/girder-jsonforms/pull/34) and
merged into `igsn`; only the standalone-deployment guards above remain. See
[dependency notes](JSONFORMS_COMPATIBILITY.md).