import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    // the NEIS browser tests launch Chromium once; a CI runner can take a while
    hookTimeout: 60000,
  },
})
