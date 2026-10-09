import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: {rollupOptions: {output: {manualChunks: {react: ['react', 'react-dom'], map: ['leaflet', '@geoman-io/leaflet-geoman-free']}}}}, preview: { allowedHosts: ['geo.ag7su.com'] }, server: { hmr: false, allowedHosts: ['geo.ag7su.com'], port: 5173, proxy: { '/api': 'http://127.0.0.1:8081', '/healthz': 'http://127.0.0.1:8081' } } });
