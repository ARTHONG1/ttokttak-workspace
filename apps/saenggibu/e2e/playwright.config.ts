import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 5 * 60_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results',
})
