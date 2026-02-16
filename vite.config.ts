import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      'capacitor-passkey-plugin/adapter': fileURLToPath(new URL('./src/passkey/adapter.ts', import.meta.url)),
      'capacitor-passkey-plugin/storage': fileURLToPath(new URL('./src/passkey/storage.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
});
