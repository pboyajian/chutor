import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { UserConfig } from 'vitest/config'

const vitestConfig: UserConfig = {
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['server/**', 'node'],
    ],
  }
}

export default defineConfig({
  plugins: [react()],
  test: vitestConfig.test
})

