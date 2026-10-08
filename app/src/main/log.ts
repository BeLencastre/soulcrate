// Log do app (§3.1): electron-log, arquivo rotativo em %APPDATA%\Soulcrate\logs. Tudo passa pelo filtro de segredos (§6.1).
import { dirname } from 'node:path';
import log from 'electron-log/main';
import { redigirSegredos } from './seguranca';

function limpar(dado: unknown): unknown {
  if (typeof dado === 'string') return redigirSegredos(dado);
  if (dado instanceof Error) return redigirSegredos(dado.stack ?? `${dado.name}: ${dado.message}`);
  return dado;
}

export function iniciarLog(): typeof log {
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.fileName = 'main.log';
  log.transports.file.level = 'info';
  log.transports.console.level = process.env.NODE_ENV === 'production' ? false : 'debug';
  log.hooks.push((mensagem) => {
    mensagem.data = mensagem.data.map(limpar);
    return mensagem;
  });
  return log;
}

/** Pasta dos logs ("Ajuda → Abrir pasta de logs"). */
export function pastaDeLogs(): string {
  return dirname(log.transports.file.getFile().path);
}

export { log };
