import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    // Relative base so the build works on GitHub Pages (any repo subpath),
    // Netlify, Vercel, Cloudflare Pages, and local `vite preview` without extra config.
    base: './',
    plugins: [react()],
    server: {
        allowedHosts: ['host.docker.internal'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
