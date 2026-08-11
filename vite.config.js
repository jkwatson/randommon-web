import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    // WSL + a Windows-mounted drive (/mnt/c/...) doesn't reliably deliver
    // filesystem change events to Vite's default watcher, so edits never
    // trigger HMR. Polling works around it.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dungeon: resolve(__dirname, 'dungeon/index.html'),
      },
    },
  },
  test: {
    environment: 'node',
  },
});
