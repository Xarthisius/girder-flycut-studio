import {resolve} from 'path';

import {defineConfig} from 'vite';

// Girder core is not bundled: it is the `girder` global the app injects before
// plugin bundles load.
//
// The config sits at the repository root rather than beside the entry, which is
// where girder's conventions put it, because the sources are spread across
// girder_flycut/ and config_builder/ and there is one npm project covering
// both. Consolidating is Phase 4 work.
export default defineConfig({
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
