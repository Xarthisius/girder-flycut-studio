# Not a runnable app any more

`app.js` moved to `girder_flycut/web_client/builder.js` in Phase 3, so `index.html`
no longer has a script to load. That is deliberate: Decision 3 in
`docs/CONVERSION_PLAN.md` settled that the plugin owns its sources and this directory
does not stay standalone.

What is left here is the markup and stylesheet that
`girder_flycut/web_client/build/generate-sources.mjs` still slices at build time.
Phase 4 moves those into the plugin as Pug and Stylus, deletes the generator's
substitutions, and deletes this directory.
