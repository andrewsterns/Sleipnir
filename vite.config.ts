/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/04_tests/setup.ts'],
    server: {
      deps: {
        inline: [/@csstools/, /@asamuzakjp/],
      },
    },
  },
})
