import type { SoulcrateApi } from '@shared/ipc';

declare global {
  interface Window {
    /** API exposta pelo preload (contextBridge). Só existe dentro do Electron. */
    soulcrate: SoulcrateApi;
  }
}

export {};
