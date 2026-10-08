import { defineConfig } from '@playwright/test';

// Testes ponta a ponta do app Electron (§7). Rodam contra o build (`npm run build`) e um dublê do `docker`:
// nada aqui toca na stack real. Veja tests/e2e/ajudantes.ts.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  outputDir: 'test-results',
});
