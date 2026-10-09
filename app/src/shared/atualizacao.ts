// Atualização do app (§5, Fase 7): o estado que o `electron-updater` leva à tela Sobre e ao Início. Só tipos.
import type { AppError } from './erros.js';

export type MotivoIndisponivel =
  /** `npm run dev` ou app desempacotado: não há instalador para atualizar */
  | 'desenvolvimento'
  /** o app foi aberto de um zip ou de uma pasta, sem instalador (nenhum `app-update.yml`) */
  | 'sem-instalador';

export type EstadoAtualizacao =
  | { estado: 'indisponivel'; motivo: MotivoIndisponivel }
  | { estado: 'ocioso'; ultimaChecagemEm: number | null }
  | { estado: 'verificando' }
  | { estado: 'atualizado'; ultimaChecagemEm: number }
  | { estado: 'baixando'; versao: string; percentual: number }
  /** baixada: é aplicada ao reiniciar o app, e nunca durante um lote */
  | { estado: 'pronta'; versao: string }
  | { estado: 'erro'; erro: AppError; ultimaChecagemEm: number | null };

export type ResultadoReiniciar = { ok: true } | { ok: false; erro: AppError };

/** Checagem na abertura (depois de uns segundos, para não competir com o início do app) e a cada 24 h. */
export const INTERVALO_CHECAGEM_MS = 24 * 60 * 60 * 1000;
export const ATRASO_PRIMEIRA_CHECAGEM_MS = 15_000;

export const estadoAtualizacaoInicial = (): EstadoAtualizacao => ({ estado: 'ocioso', ultimaChecagemEm: null });
