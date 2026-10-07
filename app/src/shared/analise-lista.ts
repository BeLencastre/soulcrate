// Saída do baixar-lista.ps1 -SoAnalisar (pré-visualização da lista). Referência: docs/eventos-lote.md.
import { semBom } from './texto.js';

export type StatusLinhaAnalise = 'nova' | 'repetida' | 'ignorada' | 'ja feita' | 'ja na biblioteca';

export interface LinhaAnalise {
  /** linha no arquivo (no .csv, a linha do registro; o cabeçalho é a 1) */
  sourceLine: number;
  line: string;
  key: string;
  artist: string;
  title: string;
  mix: string;
  original: boolean;
  remixer: boolean;
  queries: string[];
  status: StatusLinhaAnalise;
  /** em "repetida": sourceLine da primeira ocorrência */
  duplicateOf: number | null;
  /** status da execução anterior desta lista, se houver */
  previous: string | null;
  warnings: string[];
}

export interface AnaliseListaOk {
  v: 1;
  ok: true;
  list: string;
  total: number;
  unique: number;
  duplicates: number;
  alreadyDone: number;
  libraryChecked: boolean;
  inLibrary: number | null;
  toProcess: number;
  lines: LinhaAnalise[];
}

export interface AnaliseListaErro {
  v: 1;
  ok: false;
  list: string;
  error: string;
}

export type AnaliseLista = AnaliseListaOk | AnaliseListaErro;

export function lerAnaliseLista(texto: string): AnaliseLista {
  const obj = JSON.parse(semBom(texto)) as AnaliseLista;
  if (obj.v !== 1) throw new Error(`versão da análise não suportada: ${String(obj.v)}`);
  return obj;
}
