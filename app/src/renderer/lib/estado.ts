// Estado do renderer (§3.1): TanStack Query guarda o que vem do main (o main é a fonte da verdade) e
// Zustand guarda só estado de interface (painel do log aberto, operação em curso, diálogos).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { AppError } from '@shared/erros';
import type { MainEvent, MarcadorBuild, OperacaoTipo, OperationId, WebUiEstado } from '@shared/ipc';
import type { ServicoId } from '@shared/servicos';
import { statusInicial, type StackStatus } from '@shared/stack';
import { api } from './api';

export const chaveStatus = ['stack', 'status'] as const;

/** Estado da stack, atualizado a cada evento `stack.status` do main. */
export function useStackStatus(): StackStatus {
  const { data } = useQuery({
    queryKey: chaveStatus,
    queryFn: () => api.stack.status(),
    staleTime: Infinity,
  });
  return data ?? statusInicial();
}

/** Relógio que atualiza a cada `ms` enquanto `ativo` (para "há 4 s", "esperando… 18 s"). */
export function useAgora(ativo: boolean, ms = 1000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    // atualiza já (o valor guardado pode ser de antes de `ativo` ligar) e depois a cada `ms`
    const primeiro = setTimeout(() => setAgora(Date.now()), 0);
    const t = setInterval(() => setAgora(Date.now()), ms);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, [ativo, ms]);
  return agora;
}

// ---------------------------------------------------------------- Zustand

export interface LinhaOperacao {
  texto: string;
  marcador: MarcadorBuild | null;
}

export interface OperacaoUi {
  id: OperationId;
  tipo: OperacaoTipo;
  linhas: LinhaOperacao[];
  marcadores: MarcadorBuild[];
  terminou: boolean;
  erro: AppError | null;
}

/** O painel de log guarda no máximo isto; o build do Soulbeet despeja centenas de linhas. */
export const MAX_LINHAS_OPERACAO = 1500;

interface EstadoUi {
  operacao: OperacaoUi | null;
  logAberto: boolean;
  dialogoBandeja: boolean;
  webui: Partial<Record<ServicoId, WebUiEstado>>;
  definirLogAberto(aberto: boolean): void;
  dispensarOperacao(): void;
  abrirDialogoBandeja(aberto: boolean): void;
  aoEvento(e: MainEvent): void;
}

export const useUi = create<EstadoUi>((set) => ({
  operacao: null,
  logAberto: false,
  dialogoBandeja: false,
  webui: {},
  definirLogAberto: (aberto) => set({ logAberto: aberto }),
  dispensarOperacao: () => set({ operacao: null }),
  abrirDialogoBandeja: (aberto) => set({ dialogoBandeja: aberto }),
  aoEvento: (e) => {
    switch (e.type) {
      case 'operation.start':
        set({
          operacao: { id: e.id, tipo: e.tipo, linhas: [], marcadores: [], terminou: false, erro: null },
          // ligar e reconstruir despejam o build: abre o painel para o usuário acompanhar
          ...(e.tipo === 'ligar' || e.tipo === 'reconstruir' ? { logAberto: true } : {}),
        });
        break;
      case 'operation.log':
        set((s) => {
          if (s.operacao?.id !== e.id) return s;
          const linhas = [...s.operacao.linhas, { texto: e.line, marcador: e.marcador }];
          if (linhas.length > MAX_LINHAS_OPERACAO) linhas.splice(0, linhas.length - MAX_LINHAS_OPERACAO);
          const marcadores =
            e.marcador && !s.operacao.marcadores.includes(e.marcador)
              ? [...s.operacao.marcadores, e.marcador]
              : s.operacao.marcadores;
          return { operacao: { ...s.operacao, linhas, marcadores } };
        });
        break;
      case 'operation.end':
        set((s) =>
          s.operacao?.id === e.id ? { operacao: { ...s.operacao, terminou: true, erro: e.error ?? null } } : s,
        );
        break;
      case 'webui.state':
        set((s) => ({ webui: { ...s.webui, [e.estado.servico]: e.estado } }));
        break;
      case 'app.closePrompt':
        set({ dialogoBandeja: true });
        break;
      default:
        break;
    }
  },
}));

/** Liga os eventos do main ao cache do Query e ao Zustand. Chamado uma vez, no App. */
export function ligarEventos(qc: QueryClient, navegar: (rota: string) => void): () => void {
  return api.onEvent((e) => {
    if (e.type === 'stack.status') qc.setQueryData(chaveStatus, e.status);
    else if (e.type === 'app.navigate') navegar(e.rota);
    else useUi.getState().aoEvento(e);
  });
}

export function useLigarEventos(navegar: (rota: string) => void): void {
  const qc = useQueryClient();
  useEffect(() => ligarEventos(qc, navegar), [qc, navegar]);
}
