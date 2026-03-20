import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: '.','
            filename: 'sw.js',
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
                name: 'Notify',
                short_name: 'Notify',
                description: 'Smart Smart Reminders & Visitor Notifications',
                theme_color: '#020617',
                background_color: '#020617',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            },
            devOptions: {
                enabled: true
            }
        })
    ],
    build: {
        rollupOptions: {
            // This stops Vite from complaining about Capacitor!
            external: [
                '/@capacitor/core/',
                '/@capacitor/local-notifications/',
                '@capacitor/core',
                '@capacitor/local-notifications'
            ],
        }
    }
})