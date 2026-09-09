import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './src/manifest.js';

export default defineConfig({
  // CRXJS's Firefox mode fits Safari too: the background is declared under
  // background.scripts, which Safari runs as a non-persistent page (its
  // default environment), and web_accessible_resources carry no
  // use_dynamic_url, which Safari does not know.
  plugins: [crx({ manifest, browser: 'firefox' })],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
      },
    },
  },
  server: {
    port: 5190,
    strictPort: true,
    hmr: { port: 5190 },
  },
});
