/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dedicated test config, preferred by vitest over vite.config.ts. It exists
// so tests DON'T load vite.config.ts's sleipnirApiPlugin, whose configureServer
// hook starts the LSP proxy on a fixed port (7081) — that both collides with a
// running dev server and is irrelevant to unit tests. Mirrors the `test` block
// that lives in vite.config.ts for the app.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/04_validation/setup.ts'],
    exclude: ['node_modules/**', '.claude/**', 'release/**'],
  },
})
