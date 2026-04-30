import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // sia-storage loads its WASM via `new URL(..., import.meta.url)`; excluding
    // it from the deps pre-bundler keeps that URL pointing at the real file.
    //
    // @ffmpeg/ffmpeg spawns a Web Worker via `new Worker(new URL('./worker.js',
    // import.meta.url))`. Vite's pre-bundler rewrites that URL but doesn't
    // actually emit the worker file at the rewritten path, so the worker
    // load 404s and FFmpeg.load() hangs forever. Excluding the package
    // keeps the original `import.meta.url` and the worker resolves correctly.
    // (We're using @ffmpeg/core single-threaded — no SharedArrayBuffer
    // requirement, so no COOP/COEP server headers needed.)
    exclude: ['@siafoundation/sia-storage', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
