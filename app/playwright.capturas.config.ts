import { defineConfig } from '@playwright/test';

// Gera as capturas de tela do README (docs/img). Não é uma suíte de testes: `npm run capturas`. Veja tests/capturas.
export default defineConfig({
  testDir: 'tests/capturas',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: 'test-results/capturas-readme',
});
