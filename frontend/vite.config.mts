import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['app.localhost', 'ops.localhost', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Capacitor requires relative paths for assets
    base: './',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui':    ['lucide-react'],
          'vendor-store': ['zustand'],
          'vendor-i18n':  ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
});
