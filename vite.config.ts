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
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https://*.dzcdn.net https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net https://*.scdn.co https://*.mzstatic.com https://s1.ticketm.net https://*.wikimedia.org https://upload.wikimedia.org https://lh3.googleusercontent.com data:; media-src 'self' https://audio-ssl.itunes.apple.com; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.firebaseio.com https://www.googleapis.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self';",
};

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('src/data/artistPortraits')) {
            return 'data-portraits';
          }
          if (id.includes('server/seedCatalog')) {
            return 'data-catalog';
          }
          if (id.includes('src/data/worldFestivals') || id.includes('src/data/apacTourRadar')) {
            return 'data-world';
          }
          return undefined;
        },
      },
    },
  },
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
