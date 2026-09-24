# JSONForms compatibility patch

Flyer Studio 1.0 is tested with Xarthisius/girder-jsonforms commit
`52f29b751c14902b20ee3ca6f1870186ca0d37d1` plus `girder-jsonforms-flycut.patch`.
The patch adds optional child titles and relationship types to `create_batch`,
skips unconfigured AIMD background registration, and limits AIMDL propagation to
its own collection. Other callers retain the original batch defaults.

Apply the patch to a clean checkout of that commit before installing JSONForms.
The root README includes the commands. This dependency remains separate because
it provides the IGSN service and has its own deployment requirements and frontend.
The patch's upstream context is covered by `JSONFORMS_LICENSE`.

The source repository includes the dashboards dependency under
`vendor/girder-dashboards`, with its original license. Install it before Flyer Studio.
No database, assetstore, credentials, or local preview launcher is bundled.
