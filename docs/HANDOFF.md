# Flyer Studio 1.0.2 handoff

The `studio-draft-import-polish` changes are incorporated into `main`.

## Release and installation

The Python distribution is **girder-flycut**; its Girder plugin entry point is
**flycut**. The repository is named girder-flycut-studio.

```sh
python -m pip install 'girder-flycut==1.0.2'
```

For installation before index publication, install the matching wheel from the
GitHub release or the local `dist/` directory. Wheels include the built browser
bundle, stylesheet, catalogs, and generation templates; Node is only needed to
build from source. See [installation](INSTALLATION.md) for Girder setup.

## Changes to demonstrate

- Stack ID no longer offers autocomplete suggestions.
- Copy and Download in the JSON tab work with incomplete configurations.
- Upload configuration JSON to the workspace Drafts folder, then refresh the
  configuration list. Imported drafts require validation and submission.
- Configuration tooltips display through a dedicated Girder view.
- Generated metadata item fields contain identifiers without duplicated JSON.

## Release process

Versions in setup.py and both package.json files must agree. Build the client
before `python -m build`; validate with `twine check dist/*` and `check-manifest`.
The `v1.0.2` tag triggers `.github/workflows/release.yml`: build, PyPI trusted
publishing, then a signed GitHub release. PyPI must authorize the repository's
release.yml workflow with the `pypi` environment for project `girder-flycut`.
A successful build alone does not mean publication succeeded; check the publish
job and the package index.

## Deployment configuration

Configure Girder, MongoDB, Redis, the dashboard workspace and JSONForms/IGSN
services for the destination environment. Local preview services and credentials
are not a deployment configuration. See [development](DEVELOPMENT.md),
[JSONForms compatibility](JSONFORMS_COMPATIBILITY.md), and
[form validation](CONFIGURATION_FORM_VALIDATION.md).
