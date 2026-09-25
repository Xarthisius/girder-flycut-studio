## Installation

Use an environment with Python 3.10+ and MongoDB. From this folder:

```sh
# In a directory alongside this repository:
git clone https://github.com/Xarthisius/girder-jsonforms.git ../girder-jsonforms
git -C ../girder-jsonforms checkout 52f29b751c14902b20ee3ca6f1870186ca0d37d1
git -C ../girder-jsonforms apply ../girder-flycut-studio/patches/girder-jsonforms-flycut.patch
python -m pip install -e ../girder-jsonforms
python -m pip install ./vendor/girder-dashboards .
```

The bundled dashboard dependency requires Girder 5.0.13.dev27 or newer. Pip still needs access to standard Python dependencies unless they are already installed. This folder is not a bundled Python runtime or database.

Build the JSONForms frontend with `npm install && npm run build` in its `girder_jsonforms/web_client` folder, and enable/load the `jsonforms` plugin alongside Flyer Studio.

Start your Girder server with its normal MongoDB and assetstore configuration, then enable **Flyer Studio** in the dashboards administration page and grant the intended users access. The plugin entry point is `flycut`, Python package is `girder_flycut`, and distribution remains `girder-flycut` to replace the current installation cleanly. Do not install the older, separate studio implementation alongside it.

The supplied JSONForms patch is required: it adds configurable child titles/relationships and avoids unrelated AIMDL hooks on standalone installations. See [dependency notes](docs/JSONFORMS_COMPATIBILITY.md).