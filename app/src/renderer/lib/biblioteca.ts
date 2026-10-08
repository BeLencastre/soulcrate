// Biblioteca no renderer (Fase 5): o TanStack Query guarda o que o main leu do beets e do slskd (o main é a fonte da
// verdade) e o Zustand guarda a manutenção em andamento, que sobrevive a trocar de tela. As regras de apresentação
// ficam aqui, sem React, para os testes conferirem.
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import type { ParadoEmDownloads, TarefaManutencao } from '@shared/biblioteca';
import type { AppError } from '@shared/erros';
import { rotuloDoMomento } from '@shared/historico';
import type { MainEvent } from '@shared/ipc';
import { api } from './api';

/** Todas as consultas da biblioteca começam por aqui: um `invalidateQueries` com esta chave refaz todas. */
export const CHAVE_BIBLIOTECA = ['biblioteca'] as const;

/** Enquanto o slskd varre a pasta, a tela relê o número a cada tanto. */
const RELER_VARREDURA_MS = 3000;

/** A biblioteca inteira. A chave inclui "o Soulbeet está de pé": ao ligar a stack, a tela lê sozinha. */
export function useLeituraDaBiblioteca(soulbeetNoAr: boolean) {
  return useQuery({
    queryKey: [...CHAVE_BIBLIOTECA, 'leitura', soulbeetNoAr],
    queryFn: () => api.library.list(),
    staleTime: 20_000,
    // o resultado carrega o erro do catálogo (stack fora...), então a leitura nunca "falha": só retorna `ok: false`
    retry: false,
  });
}

export function useCompartilhamento(slskdNoAr: boolean) {
  return useQuery({
    queryKey: [...CHAVE_BIBLIOTECA, 'compartilhamento', slskdNoAr],
    queryFn: () => api.library.sharing(),
    enabled: slskdNoAr,
    retry: false,
    refetchInterval: (q) => {
      const r = q.state.data;
      return r?.ok && r.compartilhamento.escaneando ? RELER_VARREDURA_MS : false;
    },
  });
}

/** "ontem, 21:02": desde quando há coisa parada em `downloads/` (a mais antiga). */
export function desdeQuandoParado(parados: readonly ParadoEmDownloads[], agora: number): string | null {
  if (parados.length === 0) return null;
  return rotuloDoMomento(Math.min(...parados.map((p) => p.modificadoEm)), agora);
}

// ---------------------------------------------------------------- Manutenção em andamento (Zustand)

/** O painel guarda no máximo isto; um `autobpm` em milhares de faixas escreve uma linha por faixa. */
export const MAX_LINHAS_MANUTENCAO = 1500;

export interface OperacaoManutencao {
  id: string;
  tarefa: TarefaManutencao;
  linhas: string[];
  terminou: boolean;
  erro: AppError | null;
}

interface ManutencaoStore {
  operacao: OperacaoManutencao | null;
  aoEvento(e: MainEvent): void;
  /** o app foi (re)aberto: se o main diz que há uma tarefa rodando, volta a mostrá-la */
  reconectar(): Promise<void>;
  dispensar(): void;
}

export const useManutencao = create<ManutencaoStore>((set, get) => ({
  operacao: null,
  aoEvento: (e) => {
    if (e.type === 'library.start') {
      set({ operacao: { id: e.id, tarefa: e.tarefa, linhas: [], terminou: false, erro: null } });
    } else if (e.type === 'library.log') {
      set((s) => {
        if (s.operacao?.id !== e.id) return s;
        const linhas = [...s.operacao.linhas, e.linha];
        if (linhas.length > MAX_LINHAS_MANUTENCAO) linhas.splice(0, linhas.length - MAX_LINHAS_MANUTENCAO);
        return { operacao: { ...s.operacao, linhas } };
      });
    } else if (e.type === 'library.end') {
      set((s) =>
        s.operacao?.id === e.id ? { operacao: { ...s.operacao, terminou: true, erro: e.error ?? null } } : s,
      );
    }
  },
  async reconectar() {
    if (get().operacao) return;
    const rodando = await api.library.running().catch(() => null);
    if (rodando && !get().operacao) {
      set({ operacao: { id: rodando.id, tarefa: rodando.tarefa, linhas: [], terminou: false, erro: null } });
    }
  },
  dispensar: () => set({ operacao: null }),
}));

export const manutencaoRodando = (s: ManutencaoStore): boolean => !!s.operacao && !s.operacao.terminou;
