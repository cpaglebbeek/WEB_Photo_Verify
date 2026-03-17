import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      },
      includeAssets: ['appicon.jpg'],
      manifest: {
        name: 'PhotoVerify',
        short_name: 'PhotoVerify',
        description: 'Sovereign Image Protection & Forensic DNA',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'appicon.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'appicon.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      }
    })
  ],
  base: './',
  server: {
    port: 5175
  }
})
