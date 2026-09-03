import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Auto-updates the cached app shell in the background and activates the
      // new version on the next load — no "add to home screen" popup asking
      // to update, it just stays current like a normal web page.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Fahi Fund',
        short_name: 'Fahi Fund',
        description: 'Fahi Fund — Save Together. Receive in Order.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f7f5',
        theme_color: '#0f8a58',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML/icons) so the app opens
        // instantly and works offline once it's been loaded once.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        // Never let the service worker serve stale API responses or uploaded
        // files — those always need a live network round trip.
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^\/uploads\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'uploads-cache', expiration: { maxEntries: 100 } },
          },
        ],
      },
      devOptions: {
        // Lets the service worker register during `npm run dev` too, so PWA
        // behavior can be tested without a production build.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
