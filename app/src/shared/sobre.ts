// Tela "Sobre" (Fase 6): as versões do app, da stack e dos componentes lidos dos contêineres, os créditos e o pacote de
// suporte. Só tipos e funções puras: o main preenche, o renderer mostra.
import type { AppError } from './erros.js';

export type ComponenteId = 'slskd' | 'beets' | 'navidrome';

/** Por que a versão de um componente não foi lida. */
export type MotivoSemVersao = 'sem-pasta' | 'docker-fora' | 'stack-desligada' | 'nao-lida';

export interface ComponenteVersao {
  id: ComponenteId;
  nome: string;
  versao: string | null;
  /** `conteiner`: perguntada ao serviço em execução; `imagem`: o rótulo da imagem que o contêiner usa */
  fonte: 'conteiner' | 'imagem' | null;
  motivo: MotivoSemVersao | null;
}

export interface InfoSobre {
  app: {
    versao: string;
    electron: string;
    chromium: string;
    node: string;
    plataforma: string;
    arquitetura: string;
    /** false em desenvolvimento (`npm run dev`) */
    empacotado: boolean;
  };
  stack: {
    /** o arquivo VERSION da pasta do Soulcrate (S3) */
    instalada: string | null;
    /** a versão que este app traz embutida */
    doApp: string | null;
  };
  componentes: ComponenteVersao[];
}

export type ResultadoPacoteSuporte =
  | { ok: true; caminho: string; arquivos: string[]; bytes: number }
  | { ok: false; cancelado: true }
  | { ok: false; cancelado: false; erro: AppError };

export interface Credito {
  nome: string;
  url: string;
  papel: string;
}

export interface CreditosELicenca {
  /** o texto da licença do Soulcrate (MIT); null se o arquivo não está à mão */
  licenca: string | null;
  creditos: Credito[];
  /** licenças de terceiros que o instalador traz (Electron e Chromium), quando existem no disco */
  arquivosDeLicencas: ArquivoDeLicenca[];
}

export type ArquivoDeLicencaId = 'electron' | 'chromium';

export interface ArquivoDeLicenca {
  id: ArquivoDeLicencaId;
  nome: string;
}

/** Só o rótulo (tag) de uma imagem que seja uma versão: `slskd/slskd:0.26.0` → `0.26.0`; `…:latest` → null. */
export function versaoDaImagem(imagem: string | null | undefined): string | null {
  if (!imagem) return null;
  const semDigest = imagem.split('@')[0] ?? '';
  const doisPontos = semDigest.lastIndexOf(':');
  // `registro:5000/nome` tem `:` mas não é rótulo
  if (doisPontos < 0 || semDigest.slice(doisPontos).includes('/')) return null;
  const tag = semDigest.slice(doisPontos + 1);
  return /^v?\d+(\.\d+)+/.test(tag) ? tag.replace(/^v/, '') : null;
}

/** "beets version 2.11.0" (a primeira linha de `beet version`) → `2.11.0`. */
export function versaoDoBeets(saida: string): string | null {
  const m = /beets version\s+(\d+(?:\.\d+)+\S*)/i.exec(saida);
  return m?.[1] ?? null;
}

/** `GET /api/v0/application` do slskd: `{ version: { current: "0.26.0", … } }` → `0.26.0`. */
export function versaoDoSlskd(corpo: unknown): string | null {
  const v = (corpo as { version?: { current?: unknown; full?: unknown } } | null)?.version;
  const bruto = typeof v?.current === 'string' ? v.current : typeof v?.full === 'string' ? v.full : null;
  const m = bruto ? /^v?(\d+(?:\.\d+)+)/.exec(bruto.trim()) : null;
  return m?.[1] ?? null;
}
