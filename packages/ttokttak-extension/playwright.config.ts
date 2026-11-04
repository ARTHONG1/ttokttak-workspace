import { defineConfig } from '@playwright/test'

// Browser tests of the 똑딱작업실 extension against a fake K-에듀파인 page.
// Run after: node packages/ttokttak-extension/build.mjs --dev
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
})
