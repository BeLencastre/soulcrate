// "Testar login" da Conta Beatport (ADR 0007, item 7): o subcomando `beet beatport-testar` faz o login e uma busca no
// Beatport e imprime uma única linha `soulcrate-beatport: <código>`. Este arquivo é o contrato dessa linha: o
// plugin (soulbeet/beets-plugins) escreve, o app lê. Mudou um código? Mude os dois lados.
import { semAnsi } from './biblioteca.js';
import type { AppError } from './erros.js';

/** Os resultados que o subcomando sabe dar. `ok` é o único que significa "funcionou". */
export const CODIGOS_TESTE_BEATPORT = [
  'ok',
  'sem-conta',
  'login-recusado',
  'verificacao',
  'limite',
  'fluxo-mudou',
  'fora-do-ar',
] as const;

export type CodigoTesteBeatport = (typeof CODIGOS_TESTE_BEATPORT)[number];

const PREFIXO = 'soulcrate-beatport:';

function ehCodigo(valor: string): valor is CodigoTesteBeatport {
  return (CODIGOS_TESTE_BEATPORT as readonly string[]).includes(valor);
}

/**
 * Lê o resultado do teste na saída do beets. Tolera outras linhas e cores; usa a última linha do contrato. Sem a
 * linha (ou com um código desconhecido), o fluxo do plugin não é o que o app espera: `fluxo-mudou`.
 */
export function lerResultadoDoTesteBeatport(saida: string): CodigoTesteBeatport {
  const linhas = semAnsi(saida).split(/\r?\n/);
  for (const linha of linhas.reverse()) {
    const t = linha.trim();
    if (!t.startsWith(PREFIXO)) continue;
    const codigo = t.slice(PREFIXO.length).trim();
    return ehCodigo(codigo) ? codigo : 'fluxo-mudou';
  }
  return 'fluxo-mudou';
}

/** O que o IPC `config:testBeatport` devolve: o resultado do teste, ou um erro de ambiente (Docker, stack fora). */
export type ResultadoTesteBeatport =
  { tipo: 'resultado'; codigo: CodigoTesteBeatport } | { tipo: 'erro'; erro: AppError };

/** O que o IPC `config:disconnectBeatport` devolve. */
export type ResultadoDesconectarBeatport = { ok: true } | { ok: false; erro: AppError };
