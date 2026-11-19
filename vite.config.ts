import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Security headers applied to local dev and preview servers.
// TODO(security): In standalone non-Vite production deployments (`server/index.mjs` with SERVE_STATIC=1),
// strict `script-src 'self'` CSP is enforced; Vite preview uses pre-compiled asset bundles.
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https://*.scdn.co https://*.mzstatic.com https://s1.ticketm.net data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self';",
};

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Bound strictly to loopback 127.0.0.1 per mandatory security guidelines
    host: '127.0.0.1',
    port: 5182,
    strictPort: true,
    hmr: false,
    watch: {
      ignored: ['**/server/**'],
    },
    allowedHosts: true,
    headers: securityHeaders,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3102',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5182,
    strictPort: true,
    allowedHosts: true,
    headers: securityHeaders,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3102',
        changeOrigin: false,
      },
    },
  },
});
