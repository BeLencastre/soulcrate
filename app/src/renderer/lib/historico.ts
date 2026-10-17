// Histórico e diagnóstico no renderer (Fase 4): o TanStack Query guarda o que o main leu de lotes/ (o main é a fonte
// da verdade) e as regras de apresentação ficam aqui, sem React, para os testes conferirem.
import { useQuery } from '@tanstack/react-query';
import type { ExecucaoResumo, FimExecucao } from '@shared/historico';
import { msg } from '@shared/mensagens';
import { argumentosDasOpcoes, type OpcoesLote } from '@shared/opcoes-lote';
import { api } from './api';

/** Todas as consultas do histórico começam por aqui: um `invalidateQueries` com esta chave refaz todas. */
export const CHAVE_HISTORICO = ['historico'] as const;

/** Enquanto algo roda, a tela relê a pasta a cada tanto (o `.bat` não avisa o app de nada). */
const RELER_ENQUANTO_RODA_MS = 5000;

export function useExecucoes() {
  return useQuery({
    queryKey: [...CHAVE_HISTORICO, 'execucoes'],
    queryFn: () => api.reports.listRuns(),
    refetchInterval: (q) => (q.state.data?.some((r) => r.fim === 'rodando') ? RELER_ENQUANTO_RODA_MS : false),
  });
}

export function useDetalheDaExecucao(runId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE_HISTORICO, 'execucao', runId ?? ''],
    queryFn: () => (runId ? api.reports.getRun(runId) : Promise.resolve(null)),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.resumo.fim === 'rodando' ? RELER_ENQUANTO_RODA_MS : false),
  });
}

/** O número da linha de cada faixa dentro da lista: pede ao script (-SoAnalisar), então vem depois da tela. */
export function useLinhasNaLista(runId: string | undefined, ativo: boolean) {
  return useQuery({
    queryKey: [...CHAVE_HISTORICO, 'linhas', runId ?? ''],
    queryFn: () => (runId ? api.reports.listLines(runId) : Promise.resolve(null)),
    enabled: !!runId && ativo,
    staleTime: 60_000,
  });
}

/** O rótulo de como a execução terminou ("Concluído", "Parado pelo usuário"...). */
export const rotuloDoFim = (fim: FimExecucao): string => msg.lote.execucao.estado[fim];

/** Onde o "Abrir" de uma linha do histórico leva: o painel ao vivo se for o lote que o app acompanha. */
export function destinoDaExecucao(r: Pick<ExecucaoResumo, 'id' | 'fim'>, acompanhada: string | null): string {
  return r.fim === 'rodando' && acompanhada === r.id ? '/lista/execucao' : `/historico/${r.id}`;
}

/** As opções como no resumo da tela de Opções: `-Retentar -FilaMaxMin 10`; vazio quando é tudo padrão. */
export const opcoesComoTexto = (opcoes: OpcoesLote): string => argumentosDasOpcoes(opcoes).join(' ');

/** "Todos", "Com faixas que faltaram" */
export type FiltroDoHistorico = 'todas' | 'faltas';

export function filtrarExecucoes(execucoes: readonly ExecucaoResumo[], filtro: FiltroDoHistorico): ExecucaoResumo[] {
  return filtro === 'faltas' ? execucoes.filter((r) => r.temFaltas) : execucoes.slice();
}

/** Os segmentos da barra de resultado da linha (proporcionais ao total; o que sobra é "não terminadas"). */
export function segmentosDaLinha(r: Pick<ExecucaoResumo, 'contagem'>): {
  ok: number;
  atencao: number;
  naoVieram: number;
  puladas: number;
  resto: number;
} {
  const c = r.contagem;
  const resto = Math.max(0, c.total - c.ok - c.atencao - c.naoVieram - c.puladas);
  // sem nenhuma faixa registrada (erro antes de ler a lista) a barra fica toda vazia
  return { ok: c.ok, atencao: c.atencao, naoVieram: c.naoVieram, puladas: c.puladas, resto: c.total === 0 ? 1 : resto };
}

/** A frase sob a barra: "27 na biblioteca · 3 não vieram · 0 puladas", ou o motivo do erro. */
export function resumoDaLinha(r: ExecucaoResumo): string {
  const t = msg.historico.resumo;
  const c = r.contagem;
  if (r.fim === 'rodando') return r.progresso ? t.rodando(r.progresso.feitas, r.progresso.total) : t.semFaixas;
  if (c.total === 0) return r.mensagem ? (r.mensagem.split('\n')[0] ?? '').slice(0, 160) : t.semFaixas;
  if (r.fim === 'user' && c.naoTerminadas > 0) return t.parou(c.ok, c.naoTerminadas);
  return t.completo(c);
}

// ---------------------------------------------------------------- Modo DJ

/** "set-sexta.txt" → "set-sexta": o Modo DJ mostra a lista pelo nome, sem a extensão do arquivo. */
export const semExtensao = (nome: string): string => nome.replace(/\.(txt|csv)$/i, '');

/** `nao-baixadas-<id>.txt`: a lista que "Tentar de novo" gera com as faixas que faltaram na execução `<id>`. */
const LISTA_DE_TENTATIVA = /^nao-baixadas-(.+?)(?:\.txt)?$/;

/**
 * Esta execução é uma nova tentativa de outra? Devolve a execução de origem (para o Modo DJ mostrar "set-sexta ·
 * Nova tentativa" em vez de "nao-baixadas-20261007-154809"), ou `null`. Sem a origem na lista, devolve `undefined`.
 */
export function origemDaTentativa(
  r: Pick<ExecucaoResumo, 'lista'>,
  todas: readonly ExecucaoResumo[],
): ExecucaoResumo | null | undefined {
  const id = r.lista ? LISTA_DE_TENTATIVA.exec(r.lista)?.[1] : undefined;
  if (!id) return null;
  return todas.find((x) => x.id === id);
}

/** `@@user\Music\Vendex - Dark Tower.flac` → nome "Vendex - Dark Tower" e formato "FLAC". */
export function arquivoParecido(caminho: string): { nome: string; formato: string | null } {
  const base = caminho.split(/[\\/]/).pop() ?? caminho;
  const ponto = base.lastIndexOf('.');
  if (ponto <= 0) return { nome: base, formato: null };
  return { nome: base.slice(0, ponto), formato: base.slice(ponto + 1).toUpperCase() };
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
