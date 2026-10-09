// A atualização do app e dos arquivos da stack no renderer (Fase 7): o main empurra o estado por eventos
// (`update.state`, `stackFiles.changed`); aqui ficam as consultas e o texto de cada estado.
import { useQuery } from '@tanstack/react-query';
import type { EstadoAtualizacao } from '@shared/atualizacao';
import { msg } from '@shared/mensagens';
import { api } from './api';

export const chaveAtualizacao = ['update', 'state'] as const;
export const chaveArquivosDaStack = ['stackFiles', 'status'] as const;

export function useEstadoAtualizacao(): EstadoAtualizacao | undefined {
  return useQuery({
    queryKey: chaveAtualizacao,
    queryFn: () => api.update.state(),
    staleTime: Infinity,
  }).data;
}

export function useArquivosDaStack() {
  return useQuery({
    queryKey: chaveArquivosDaStack,
    queryFn: () => api.stackFiles.status(),
    staleTime: Infinity,
  });
}

/** "hoje às 14:30" / "08/10 às 14:30" */
export function quandoFoi(ms: number, agora = Date.now()): string {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mesmoDia = d.toDateString() === new Date(agora).toDateString();
  return mesmoDia
    ? `hoje às ${hora}`
    : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

/** O texto da linha de estado da atualização (Configurações → Sobre). */
export function textoDaAtualizacao(e: EstadoAtualizacao): string {
  const t = msg.atualizacao;
  switch (e.estado) {
    case 'indisponivel':
      return t.indisponivel[e.motivo];
    case 'ocioso':
      return t.ocioso;
    case 'verificando':
      return t.verificando;
    case 'atualizado':
      return t.atualizado(quandoFoi(e.ultimaChecagemEm));
    case 'baixando':
      return t.baixando(e.versao, e.percentual);
    case 'pronta':
      return t.pronta(e.versao);
    case 'erro':
      return e.erro.titulo;
  }
}
