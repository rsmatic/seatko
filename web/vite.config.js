import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.VITE_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  // Sub-path when hosted at e.g. https://rsmatic.github.io/seatko/ (set VITE_BASE=/seatko/).
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    // Use --host to open the scanner on a phone over the LAN (camera access needs HTTPS or localhost).
    proxy: { '/api': api, '/uploads': api },
  },
});
