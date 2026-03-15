import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['assets/logo.jpg'],
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true
        },
        manifest: {
          name: 'Mima AI',
          short_name: 'Mima',
          description: 'Your personal AI assistant.',
          theme_color: '#131117',
          background_color: '#131117',
          display: 'standalone',
          icons: [
            {
              src: 'https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg',
              sizes: '192x192',
              type: 'image/jpeg'
            },
            {
              src: 'https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg',
              sizes: '512x512',
              type: 'image/jpeg'
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
