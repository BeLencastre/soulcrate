// O painel do download no Modo DJ (protótipo "DJ · Baixar lista › Download"): três contadores no lugar de nove, os
// filtros pelo que importa (chegou, não veio, em andamento) e a faixa de aviso sem termos técnicos. Funções puras,
// sobre o mesmo estado do lote que o painel do Modo Dev usa.
import { msgDj } from '@shared/mensagens-dj';
import {
  ehStatusFinal,
  filtrarFaixas,
  infoDoStatus,
  type EstadoLote,
  type FaixaLote,
  type InfoStatus,
} from '@shared/lote-estado';
import { faixaDoPainel, type FaixaDoPainel } from './lote-painel';

export type GrupoDj = 'andamento' | 'chegaram' | 'naoVieram' | 'pulada';
export type FiltroDj = 'todas' | Exclude<GrupoDj, 'pulada'>;
export const FILTROS_DJ: readonly FiltroDj[] = ['todas', 'andamento', 'chegaram', 'naoVieram'];

export const infoNoDj = (f: Pick<FaixaLote, 'status' | 'naFilaDoUsuario'>): InfoStatus =>
  infoDoStatus(f.status, f.naFilaDoUsuario, msgDj.lote.status);

/** O grupo da faixa para quem só quer saber se ela chegou: "baixada, sem organizar" chegou (o arquivo está lá). */
export function grupoDj(f: Pick<FaixaLote, 'status' | 'naFilaDoUsuario'>): GrupoDj {
  const g = infoNoDj(f).grupo;
  switch (g) {
    case 'andamento':
      return 'andamento';
    case 'concluida':
      return 'chegaram';
    case 'pulada':
      return 'pulada';
    case 'atencao':
      return f.status === 'baixada (beets falhou)' ? 'chegaram' : 'naoVieram';
  }
}

export function contarDj(faixas: readonly FaixaLote[]): Record<GrupoDj | 'todas', number> {
  const r = { todas: faixas.length, andamento: 0, chegaram: 0, naoVieram: 0, pulada: 0 };
  for (const f of faixas) r[grupoDj(f)]++;
  return r;
}

export function filtrarDj(faixas: readonly FaixaLote[], filtro: FiltroDj, busca: string): FaixaLote[] {
  // a busca é a mesma do Modo Dev (sem acento, "byorn" acha "Byørn"); o filtro é o do DJ
  return filtrarFaixas(faixas, 'todas', busca).filter((f) => filtro === 'todas' || grupoDj(f) === filtro);
}

/** Ficou arquivo em downloads esperando a organização (baixou com "Organizar depois" desligado, ou ela falhou). */
export function esperandoOrganizar(faixas: readonly Pick<FaixaLote, 'status'>[]): boolean {
  return faixas.some((f) => f.status === 'baixada' || f.status === 'baixada (beets falhou)');
}

/** A observação da faixa no Modo DJ: só a nota do fim (a busca em andamento e os candidatos ficam no Modo Dev). */
export const notaDj = (f: Pick<FaixaLote, 'status' | 'nota'>): string => (ehStatusFinal(f.status) ? f.nota : '');

/**
 * A faixa de aviso acima do progresso, com as palavras do Modo DJ. O fim tem o seu próprio aviso ("Download
 * concluído"), então aqui só entram os avisos de enquanto baixa.
 */
export function faixaDoPainelDj(e: EstadoLote, agora: number): FaixaDoPainel | null {
  const f = faixaDoPainel(e, agora);
  if (!f) return null;
  const d = msgDj.lote.download.faixa;
  if (f.id === 'iniciando') return { ...f, titulo: d.iniciando[0], texto: d.iniciando[1] };
  if (f.id === 'parando') return { ...f, titulo: d.parando[0], texto: d.parando[1] };
  if (f.id === 'janela') return { ...f, titulo: d.janela[0], texto: d.janela[1] };
  if (f.id === 'pausado') return { ...f, texto: d.pausado };
  if (f.id === 'catalogo') return { ...f, texto: d.catalogo };
  if (f.id === 'aviso-musicbrainz_unavailable') return { ...f, titulo: d.avisoMusicbrainz };
  if (f.id.startsWith('aviso-')) return { ...f, titulo: d.avisoSlskd };
  return null; // "concluído" e "relatórios gravados": o Modo DJ mostra o aviso do fim
}
