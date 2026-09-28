import {resolve} from 'path';

import {defineConfig} from 'vite';
import {compileClient} from 'pug';

// Copied from vendor/girder-dashboards, which copied it from girder core. Pug
// compiles to a client-side function so a view calls its template with locals
// rather than interpolating strings.
//
// `doctype: 'html'` is the one addition. These are fragments, so none of them
// declares a doctype, and without it Pug mirrors boolean attributes --
// `hidden="hidden"` rather than `hidden`.
function pugPlugin() {
    return {
        name: 'pug',
        transform(src: string, id: string) {
            if (id.endsWith('.pug')) {
                return {
                    code: `${compileClient(src, {filename: id, compileDebug: false, doctype: 'html'})}\nexport default template`,
                    map: null
                };
            }
        }
    };
}

// Girder core is not bundled: it is the `girder` global the app injects before
// plugin bundles load.
//
// The config sits at the repository root rather than beside the entry, which is
// where girder's conventions put it. That was because two source trees once
// shared one npm project; config_builder/ is gone and moving both into
// web_client/ is the last of this phase's housekeeping.
export default defineConfig({
    plugins: [pugPlugin()],
    build: {
        outDir: resolve(__dirname, 'girder_flycut/web_client/dist'),
        emptyOutDir: true,
        sourcemap: !process.env.SKIP_SOURCE_MAPS,
        lib: {
            entry: resolve(__dirname, 'girder_flycut/web_client/main.js'),
            name: 'GirderPluginFlycut',
            fileName: 'girder-plugin-flycut'
        },
        rollupOptions: {
            output: {
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'style.css';
                    }
                    return '[name].[ext]';
                }
            }
        }
    }
});
