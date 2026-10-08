// Tipos e regras puras do download em lote (Fase 3) compartilhados entre o main e o renderer:
// listas, resultado da análise, execuções e os nomes de arquivo que o baixar-lista.ps1 usa.
import type { AnaliseLista } from './analise-lista.js';
import type { AppError } from './erros.js';
import type { EventoLote } from './eventos-lote.js';

export type TipoLista = 'txt' | 'csv';

/** Uma lista na pasta do Soulcrate. O renderer a conhece pelo nome do arquivo, nunca por um caminho. */
export interface ListaRef {
  nome: string;
  tipo: TipoLista;
  /** epoch ms */
  modificadaEm: number;
  bytes: number;
}

export interface ListaConteudo extends ListaRef {
  texto: string;
  /** .csv: o app só lê (a edição do texto cru estragaria as colunas) */
  somenteLeitura: boolean;
}

export interface ResultadoAnalise {
  analise: AnaliseLista;
  /** última vez que um lote mexeu no `estado-<lista>.tsv`; null se a lista nunca rodou */
  ultimaExecucaoEm: number | null;
}

export interface OpcoesAnalise {
  /** conferir também o que já está na biblioteca (precisa da stack no ar) */
  biblioteca: boolean;
  /** `-Retentar`: o que falhou antes volta a contar como "para baixar" */
  retentar: boolean;
}

/** Modelo de uma lista nova. */
export type ModeloLista = 'exemplo' | 'vazia';

export interface ResumoExecucao {
  runId: string;
  /** nome da lista (`run.start.list`); null enquanto o `run.start` não chegou */
  lista: string | null;
  pid: number | null;
  /** `t` do `run.start` */
  iniciouEm: string | null;
  terminou: boolean;
}

export type ResultadoInicio = { ok: true; runId: string } | { ok: false; erro: AppError };

/** Tudo o que o main já leu de uma execução, para o renderer (re)montar o painel. */
export interface AnexoExecucao {
  eventos: EventoLote[];
  /** as últimas linhas do log bruto (as mais antigas saem de memória) */
  log: string[];
  /** quantas linhas o log já teve ao todo; as de `log` são as últimas desse total */
  logTotal: number;
  resumo: ResumoExecucao;
}

/** Arquivo de uma execução que o botão "Abrir" sabe abrir. */
export type ArquivoExecucao = 'resultado' | 'nao-baixadas' | 'diagnostico' | 'catalogo' | 'log';

export const ARQUIVO_EXEMPLO = 'lista.exemplo.txt';
export const LIMITE_LISTA_BYTES = 5_000_000;

const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Nome de arquivo de lista aceito: só o nome (sem pasta), `.txt` ou `.csv`, sem caracteres proibidos no Windows. */
export function nomeDeListaValido(nome: unknown): nome is string {
  if (typeof nome !== 'string') return false;
  if (nome.length === 0 || nome.length > 120) return false;
  // eslint-disable-next-line no-control-regex -- caracteres de controle também são proibidos em nomes de arquivo
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(nome)) return false;
  if (nome.startsWith('.') || /[ .]$/.test(nome)) return false;
  if (RESERVADOS_WINDOWS.test(nome)) return false;
  return /\.(txt|csv)$/i.test(nome);
}

export function tipoDaLista(nome: string): TipoLista {
  return /\.csv$/i.test(nome) ? 'csv' : 'txt';
}

/**
 * Nome do `estado-<lista>.tsv` e da trava `estado-<lista>.lock`, como o script os calcula:
 * `GetFileNameWithoutExtension($Lista) -replace '[^\w\-]+', '_'` (o `\w` do .NET inclui letras com acento).
 */
export function nomeDoEstado(arquivoDaLista: string): string {
  const base = arquivoDaLista.replace(/\.[^./\\]*$/, '');
  return base.replace(/[^\p{L}\p{Mn}\p{Nd}\p{Pc}-]+/gu, '_');
}

const dois = (n: number) => String(n).padStart(2, '0');

/** `20261007-161002`, o mesmo formato que o script usa quando não recebe `-IdExecucao`. */
export function idDeExecucao(d: Date): string {
  return `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
}

/** Arquivos que o app e o script combinam para uma execução, todos em `lotes/` e conhecidos de antemão. */
export function arquivosDaExecucao(id: string) {
  return {
    eventos: `lotes/eventos-${id}.jsonl`,
    parada: `lotes/parar-${id}.flag`,
    saida: `lotes/saida-${id}.log`,
    erro: `lotes/erro-${id}.log`,
  } as const;
}

export const ehIdDeExecucao = (valor: unknown): valor is string =>
  typeof valor === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(valor);
