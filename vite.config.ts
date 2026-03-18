import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { cpSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import manifest from './manifest.json' with { type: 'json' };

/**
 * Plugin to copy files that are dynamically injected and not processed by Vite.
 * Content scripts are now compiled as Rollup inputs below.
 */
function copyStaticAssets(): Plugin {
  return {
    name: 'copy-static-assets',
    writeBundle() {
      const dist = resolve(import.meta.dirname, 'dist');

      // Content style CSS — injected alongside content script
      mkdirSync(resolve(dist, 'content'), { recursive: true });
      cpSync('content/content-style.css', resolve(dist, 'content/content-style.css'));

      // Theme init — synchronous non-module script in <head> (prevents flash)
      mkdirSync(resolve(dist, 'assets/scripts'), { recursive: true });
      cpSync('assets/scripts/theme-init.js', resolve(dist, 'assets/scripts/theme-init.js'));
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), copyStaticAssets()],
  build: {
    rollupOptions: {
      input: {
        // Pages opened via chrome.tabs.create() or chrome.offscreen.createDocument()
        editor: 'editor/editor.html',
        preview: 'recorder/preview.html',
        history: 'history/history.html',
        settings: 'settings/settings.html',
        welcome: 'welcome/welcome.html',
        permissions: 'permissions/permissions.html',
        offscreen: 'offscreen/recorder-offscreen.html',
        // Content scripts — compiled from TS, injected via chrome.scripting.executeScript()
        'content/content-script': 'content/content-script.ts',
        'content/recording-widget': 'content/recording-widget.ts',
      },
    },
  },
});
