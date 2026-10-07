import type { SoulcrateApi } from '@shared/ipc';

/** A única porta do renderer para o main: `window.soulcrate`, exposta pelo preload. */
export const api: SoulcrateApi = window.soulcrate;
