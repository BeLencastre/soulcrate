// Gancho de teste (nunca no app empacotado): um `electron-updater` de mentira, ligado por SOULCRATE_DUBLE_ATUALIZADOR=1.
// O teste ponta a ponta guia o que "a internet" responde pelo `globalThis` do processo principal:
//   globalThis.__updaterResposta = 'nenhuma' | 'nova' | 'erro'   (padrão: nenhuma)
//   globalThis.__updaterVersao   = '9.9.9'                      (a versão "nova")
// e lê o que o app pediu em `globalThis.__updaterInstalou` (quitAndInstall nunca fecha o app de teste).
import { EventEmitter } from 'node:events';
import type { AutoUpdaterLike } from './services/atualizador-service';

interface Estado {
  __updater?: DubleDoAtualizador;
  __updaterResposta?: 'nenhuma' | 'nova' | 'erro';
  __updaterVersao?: string;
  __updaterInstalou?: { silencioso: boolean | undefined; reabrir: boolean | undefined } | null;
  __updaterChecagens?: number;
}

const g = globalThis as unknown as Estado;

export class DubleDoAtualizador extends EventEmitter implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;

  async checkForUpdates(): Promise<unknown> {
    g.__updaterChecagens = (g.__updaterChecagens ?? 0) + 1;
    this.emit('checking-for-update');
    await new Promise((r) => setTimeout(r, 150));
    const resposta = g.__updaterResposta ?? 'nenhuma';
    if (resposta === 'erro') throw new Error('getaddrinfo ENOTFOUND github.com (dublê)');
    if (resposta === 'nenhuma') {
      this.emit('update-not-available');
      return null;
    }
    const version = g.__updaterVersao ?? '9.9.9';
    this.emit('update-available', { version });
    for (const percent of [20, 60, 100]) {
      await new Promise((r) => setTimeout(r, 100));
      this.emit('download-progress', { percent });
    }
    this.emit('update-downloaded', { version });
    return null;
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    g.__updaterInstalou = { silencioso: isSilent, reabrir: isForceRunAfter };
  }
}

export function criarUpdaterDuble(): DubleDoAtualizador {
  const u = new DubleDoAtualizador();
  g.__updater = u;
  g.__updaterInstalou = null;
  return u;
}
