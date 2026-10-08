// Regras do painel ao vivo (tela Execução) que não dependem de React: o estado que o chip mostra, a faixa de aviso,
// o erro do fim e os textos de tempo. Puro e testado, para a tela só desenhar.
import { criarErro, type AppError } from '@shared/erros';
import type { MotivoFim, RunEnd } from '@shared/eventos-lote';
import type { EstadoLote } from '@shared/lote-estado';
import { msg } from '@shared/mensagens';
import type { CorChip } from '../components/ui';

export type TomFaixa = 'azul' | 'laranja' | 'ambar' | 'verde';

export interface FaixaDoPainel {
  tom: TomFaixa;
  titulo: string;
  texto: string;
  /** o quadradinho pisca (algo em andamento) */
  pulsa: boolean;
  id: string;
}

export type ChaveEstado = keyof typeof msg.lote.execucao.estado;

/** Um aviso (`warning`) do script só vale por este tempo: ele se resolve sozinho e o evento não diz quando. */
const VALIDADE_AVISO_MS = 90_000;

/** O fim foi "limpo" (o lote fez o que devia): sem cartão de erro. */
export const FIM_SEM_ERRO: readonly MotivoFim[] = ['completed', 'user'];

export function horaCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Buscas pausadas e ainda no futuro? (o `until` vem com fuso: a comparação é em instantes, não em texto) */
export function pausadoAte(e: EstadoLote, agora: number): string | null {
  if (!e.buscasPausadasAte) return null;
  const t = Date.parse(e.buscasPausadasAte);
  return Number.isFinite(t) && t > agora ? e.buscasPausadasAte : null;
}

export function chaveDoEstado(e: EstadoLote, agora: number): ChaveEstado {
  if (e.fase === 'terminou') return e.fim?.reason ?? 'interrupted';
  if (e.fase === 'parando') return 'parando';
  if (e.fase === 'aguardando') return 'preparando';
  return pausadoAte(e, agora) ? 'pausado' : 'rodando';
}

const COR_DO_ESTADO: Record<ChaveEstado, CorChip> = {
  preparando: 'neutro',
  rodando: 'azul',
  pausado: 'laranja',
  parando: 'laranja',
  completed: 'verde',
  user: 'neutro',
  error: 'vermelho',
  slskd_down: 'vermelho',
  config: 'vermelho',
  locked: 'vermelho',
  interrupted: 'laranja',
};

export function corDoEstado(chave: ChaveEstado): CorChip {
  return COR_DO_ESTADO[chave];
}

/** A faixa colorida acima do progresso: limite de buscas, pausa, parando, relatórios gravados... ou nada. */
export function faixaDoPainel(e: EstadoLote, agora: number): FaixaDoPainel | null {
  const f = msg.lote.execucao.faixa;
  const montar = (id: string, tom: TomFaixa, par: readonly [string, string], pulsa: boolean): FaixaDoPainel => ({
    id,
    tom,
    titulo: par[0],
    texto: par[1],
    pulsa,
  });

  if (e.fase === 'terminou') {
    if (e.fimSintetico || !e.fim) return null;
    if (e.fim.reason === 'completed') return montar('concluido', 'verde', f.concluido, false);
    if (e.fim.reason === 'user') return montar('gravados', 'verde', f.gravados, false);
    return null; // os outros fins têm o cartão de erro
  }
  if (e.fase === 'parando') return montar('parando', 'ambar', f.parando, true);
  if (e.fase === 'aguardando') return montar('iniciando', 'azul', f.iniciando, true);

  const ate = pausadoAte(e, agora);
  if (ate) return montar('pausado', 'laranja', f.pausado(horaCurta(ate)), true);
  if (e.janelaCheia) {
    const limite = Number(e.inicio?.options['BuscasPorJanela'] ?? 30);
    return montar('janela', 'azul', f.janelaCheia(limite, 220), true);
  }
  if (e.catalogo) return montar('catalogo', 'azul', f.catalogo(e.catalogo.feitas, e.catalogo.total), true);

  const aviso = e.avisos.find((a) => agora - Date.parse(a.t) < VALIDADE_AVISO_MS);
  if (aviso) {
    const titulo =
      aviso.codigo === 'musicbrainz_unavailable' ? msg.lote.execucao.avisoMusicbrainz : msg.lote.execucao.avisoSlskd;
    return montar(`aviso-${aviso.codigo}`, 'laranja', [titulo, aviso.mensagem], true);
  }
  return null;
}

/** O cartão de erro do fim que não foi "concluído" nem "parado pelo usuário"; null nos outros casos. */
export function erroDoFim(fim: RunEnd | null, lista: string | null): AppError | null {
  if (!fim || FIM_SEM_ERRO.includes(fim.reason)) return null;
  const detalhes = fim.message || null;
  switch (fim.reason) {
    case 'slskd_down':
      return criarErro('lote.slskd-fora', { detalhes });
    case 'config':
      return criarErro('lote.config', { detalhes });
    case 'locked':
      return criarErro('lote.lista-rodando', { ...(lista ? { lista } : {}), detalhes });
    case 'interrupted':
      return criarErro('lote.interrompido', { detalhes });
    default:
      return criarErro('lote.erro', { detalhes });
  }
}

/** "42 s", "18 min", "1 h 05 min" */
export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Há quanto tempo rodou: do `run.start` até agora, ou até o `run.end`. */
export function duracaoDoLote(e: EstadoLote, agora: number): number | null {
  if (!e.inicio) return null;
  const inicio = Date.parse(e.inicio.t);
  const fim = e.fim ? Date.parse(e.fim.t) : agora;
  return Number.isFinite(inicio) && Number.isFinite(fim) ? Math.max(0, fim - inicio) : null;
}

/** "há 12 s", "há 3 min", "há 2 h", "há 4 d" */
export function haQuanto(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** `dd/MM` como na faixa de retomada ("Esta lista já rodou em 04/10"). */
export function dataCurta(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
