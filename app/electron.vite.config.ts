import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

/**
 * CSP do renderer (§6.1): sem `unsafe-eval`, só recursos do próprio app.
 * Entra só no build: o modo dev precisa do script inline do HMR do Vite.
 * `style-src 'unsafe-inline'` cobre os atributos `style` que o React gera.
 */
const POLITICA_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

function cspNoBuild(): Plugin {
  return {
    name: 'soulcrate:csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: POLITICA_CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/main/index.ts') } } },
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        // preload com sandbox: true não pode ser ESM
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss(), cspNoBuild()],
    build: { rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/renderer/index.html') } } },
  },
});
