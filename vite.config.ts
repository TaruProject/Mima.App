import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['assets/logo.jpg', 'version.json'],
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'navigation-cache',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 0,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              urlPattern: /\/version\.json$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'version-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 0,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
          ],
        },
        manifest: {
          name: 'Mima',
          short_name: 'Mima',
          description: 'Your personal AI assistant.',
          theme_color: '#131117',
          background_color: '#131117',
          display: 'standalone',
          icons: [
            {
              src: '/logo.jpg',
              sizes: '192x192',
              type: 'image/jpeg',
              purpose: 'any maskable',
            },
            {
              src: '/logo.jpg',
              sizes: '512x512',
              type: 'image/jpeg',
              purpose: 'any maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // CSP-friendly build options
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          // Avoid optimizations that may use eval
          drop_console: false,
          drop_debugger: true,
        },
        format: {
          comments: false,
        },
      },
    },
    server: {
      allowedHosts: true,
      hmr: false,
    },
    // Define env variables without using eval
    // NOTE: GEMINI_API_KEY is intentionally NOT exposed to frontend - must use backend proxy
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
  };
});
