// Protocolo do download em lote (baixar-lista.ps1 -Eventos), versão 1.
// Referência: docs/eventos-lote.md. Fixtures reais: tests/fixtures/lote/ (geradas por tests/Gerar-Fixtures.ps1).
import { semBom } from './texto.js';

export const VERSAO_EVENTOS = 1;

/** Código de saída do baixar-lista.ps1 → motivo no evento run.end. */
export const CODIGOS_SAIDA = {
  0: 'completed',
  1: 'error',
  2: 'user',
  3: 'slskd_down',
  4: 'config',
  5: 'locked',
  130: 'interrupted',
} as const;

export type CodigoSaida = keyof typeof CODIGOS_SAIDA;
export type MotivoFim = (typeof CODIGOS_SAIDA)[CodigoSaida];

export const STATUS_EM_ANDAMENTO = [
  'pendente',
  'buscando',
  'verificar',
  'pronta',
  'baixando',
  'importar',
  'importando',
] as const;
export const STATUS_FINAIS = [
  'importada',
  'baixada',
  'baixada (beets falhou)',
  'nao encontrada',
  'falhou',
  'ja na biblioteca',
  'ja feita',
] as const;
export type StatusEmAndamento = (typeof STATUS_EM_ANDAMENTO)[number];
export type StatusFinal = (typeof STATUS_FINAIS)[number];

/** `WAV/AIFF` só aparece em execuções feitas até a stack 1.1.0; hoje WAV e AIFF são formatos separados. */
export type Formato = 'FLAC' | 'WAV' | 'AIFF' | 'WAV/AIFF' | 'MP3 320' | 'AAC' | 'MP3 256/VBR';

interface Base<T extends string> {
  v: number;
  /** Data e hora local com fuso, ex.: 2026-10-07T16:10:02.994-03:00 */
  t: string;
  type: T;
}

export interface ArquivosExecucao {
  result?: string;
  notDownloaded?: string;
  diagnostic?: string;
  catalog?: string;
  beetsLog?: string;
  runLog?: string;
  state?: string;
  events?: string | null;
}

export interface RunStart extends Base<'run.start'> {
  id: string;
  pid: number;
  list: string;
  listName: string;
  total: number;
  options: Record<string, string | number | boolean>;
  files: ArquivosExecucao;
  powershell: string;
}

export interface RunSkip extends Base<'run.skip'> {
  alreadyDone: number;
  inLibrary: number;
  toProcess: number;
  libraryChecked: boolean;
}

export interface CatalogProgress extends Base<'catalog.progress'> {
  done: number;
  total: number;
}

export interface CatalogResult extends Base<'catalog.result'> {
  key: string;
  line: string;
  result: 'OK' | 'CORRIGIDO' | 'NAO EXISTE' | 'NAO CONFIRMADO' | 'SEM DADOS' | 'INDISPONIVEL';
  searchLine: string;
  similar: string[];
  detail: string;
}

export interface ItemStatus extends Base<'item.status'> {
  key: string;
  line: string;
  status: StatusEmAndamento;
  searchLine?: string;
  search?: { kind: 'q' | 'artist'; query: string; stage: number; stages: number };
  candidates?: number;
  user?: string;
  format?: Formato;
  attempt?: number;
  remoteQueued?: boolean;
}

export interface ItemAttemptFailed extends Base<'item.attemptFailed'> {
  key: string;
  user: string | null;
  attempt: number;
  reason: string;
}

export interface ItemDiagnostic extends Base<'item.diagnostic'> {
  key: string;
  line: string;
  searches: { kind: 'q' | 'artist'; query: string }[];
  skipped: number;
  corrected: string;
  catalog: string;
  remixer: boolean;
  responses: number;
  /** motivo → quantidade de arquivos recusados por ele */
  reasons: Record<string, number>;
  closest: { reason: string; user: string; file: string; score: number }[];
  suggestions: string[];
  artistSearched: boolean;
  artistCatalog: { title: string; users: number }[];
  artistCatalogTotal: number;
}

export interface ItemFinal extends Base<'item.final'> {
  key: string;
  line: string;
  status: StatusFinal;
  note: string;
  via: string;
  /** arquivo baixado em downloads/ (o beets o move depois para music/) */
  local: string | null;
  user: string | null;
  format: Formato | null;
}

export interface SearchCheck extends Base<'search.check'> {
  phase: 'start' | 'end';
  query: string;
  responses?: number;
  blocked?: boolean;
}

export interface SearchPaused extends Base<'search.paused'> {
  until: string;
  minutes: number;
  reason: string;
}

export interface SearchWindowFull extends Base<'search.windowFull'> {
  full: boolean;
  limit: number;
  windowSeconds: number;
}

export interface BeetsBatch extends Base<'beets.batch'> {
  phase: 'start' | 'end';
  count: number;
  keys?: string[];
  ok?: boolean;
  errors?: string[];
  log?: string;
}

export interface Progress extends Base<'progress'> {
  done: number;
  total: number;
  searching: number;
  downloading: number;
  remoteQueued: number;
  waiting: number;
  beets: number;
  ok: number;
  notFound: number;
  failed: number;
  etaMin: number | null;
  searchesPausedUntil: string | null;
  searchWindowFull: boolean;
}

export interface Warning extends Base<'warning'> {
  code: 'slskd_unreachable' | 'musicbrainz_unavailable' | (string & {});
  message: string;
  streak?: number;
  maxStreak?: number;
}

export interface RunStopping extends Base<'run.stopping'> {
  reason: 'user';
}

export interface RunEnd extends Base<'run.end'> {
  reason: MotivoFim;
  exitCode: CodigoSaida;
  message: string;
  /** status → quantidade de faixas */
  summary: Record<string, number>;
  files: ArquivosExecucao;
}

export type EventoLote =
  | RunStart
  | RunSkip
  | CatalogProgress
  | CatalogResult
  | ItemStatus
  | ItemAttemptFailed
  | ItemDiagnostic
  | ItemFinal
  | SearchCheck
  | SearchPaused
  | SearchWindowFull
  | BeetsBatch
  | Progress
  | Warning
  | RunStopping
  | RunEnd;

export type TipoEvento = EventoLote['type'];

export const TIPOS_EVENTO: readonly TipoEvento[] = [
  'run.start',
  'run.skip',
  'catalog.progress',
  'catalog.result',
  'item.status',
  'item.attemptFailed',
  'item.diagnostic',
  'item.final',
  'search.check',
  'search.paused',
  'search.windowFull',
  'beets.batch',
  'progress',
  'warning',
  'run.stopping',
  'run.end',
];

export class EventoInvalidoError extends Error {
  constructor(
    message: string,
    readonly linha: string,
  ) {
    super(message);
    this.name = 'EventoInvalidoError';
  }
}

/**
 * Interpreta uma linha do arquivo de eventos. Linha vazia → null.
 * Tipos desconhecidos são aceitos (o protocolo pode ganhar eventos novos sem mudar a versão);
 * versão diferente da suportada é erro.
 */
export function lerLinhaEvento(linha: string): EventoLote | null {
  const texto = semBom(linha).trim();
  if (!texto) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(texto);
  } catch (e) {
    throw new EventoInvalidoError(`JSON inválido: ${(e as Error).message}`, linha);
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new EventoInvalidoError('o evento não é um objeto', linha);
  }
  const e = obj as Record<string, unknown>;
  if (e['v'] !== VERSAO_EVENTOS)
    throw new EventoInvalidoError(`versão de evento não suportada: ${String(e['v'])}`, linha);
  if (typeof e['type'] !== 'string' || typeof e['t'] !== 'string') {
    throw new EventoInvalidoError('evento sem "type" ou "t"', linha);
  }
  return e as unknown as EventoLote;
}

export function ehTipoConhecido(e: { type: string }): e is EventoLote {
  return (TIPOS_EVENTO as readonly string[]).includes(e.type);
}
