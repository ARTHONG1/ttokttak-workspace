import { defineConfig } from '@playwright/test'

// Browser tests of the 똑딱 에듀파인 연결 extension against a fake K-에듀파인 page.
// Run after: node packages/edufine-link/build.mjs --dev
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
})

