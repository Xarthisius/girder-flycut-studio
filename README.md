# girder-flyer-studio

A girder dashboard developed for use with [girder dashboards](https://github.com/Xarthisius/girder-dashboards/tree/main), [girder jsonforms](https://github.com/Xarthisius/girder-jsonforms/), and [LightBurn Software](https://lightburnsoftware.com/).

Facilitates the specification, creation, and registration of **Flyer Stacks**, which are an array of small circular discs used in laser impact experiments. This is accomplished through automatic specification of templated LightBurn project files through a simplified JSON form, packaging and capture of experimentally relevant metadata, and IGSN registration per flyer stack on girder.

## Features

- Draft → submitted → generated → registered lifecycle.
- LightBurn layout, inventory CSV, and JSON metadata generation.
- Scans girder for foil IGSNs (denoting base material) by contains alternative identifier `foil-igsn`.
- Registration creates `<foil IGSN>-<stack ID>` as a child deposition using JSONForms. 
- Metadata and experiment invariants validated. 

## Admin settings and shared storage

See [Configuration form validation](docs/CONFIGURATION_FORM_VALIDATION.md) for form requirements, acknowledgement rules, and downstream checks.

See [Dashboard configuration](docs/DASHBOARD_CONFIGURATION.md) for administrator setup instructions, a complete settings example, permissions, and the Complete Workflow module.
