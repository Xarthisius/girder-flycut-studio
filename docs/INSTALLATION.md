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

### Configure `jsonforms.projects_enabled`

A standalone Flyer Studio deployment must turn JSONForms' project propagation **off**:

```sh
girder shell -c "from girder.models.setting import Setting; \
  Setting().set('jsonforms.projects_enabled', False)"
```

It defaults to `true`, and with it on every item save carrying `meta.igsn` reaches
`propagate_to_projects()`, which raises a 404 when there is no AIMDL collection. Leave it
`true` only if you are also running AIMDL. See [dependency notes](JSONFORMS_COMPATIBILITY.md).

The bundled dashboard dependency requires Girder 5.0.13.dev27 or newer. Pip still needs access to standard Python dependencies unless they are already installed. This folder is not a bundled Python runtime or database.

Build the JSONForms frontend with `npm install && npm run build` in its `girder_jsonforms/web_client` folder, and enable/load the `jsonforms` plugin alongside Flyer Studio.

Start your Girder server with its normal MongoDB and assetstore configuration, then enable **Flyer Studio** in the dashboards administration page and grant the intended users access. The plugin entry point is `flycut`, Python package is `girder_flycut`, and distribution remains `girder-flycut` to replace the current installation cleanly. Do not install the older, separate studio implementation alongside it.

No JSONForms patch is required any more: `create_batch` went upstream as
[PR #34](https://github.com/Xarthisius/girder-jsonforms/pull/34), and the other two hunks
turned out to be unnecessary or replaceable by the setting above. See
[dependency notes](JSONFORMS_COMPATIBILITY.md).