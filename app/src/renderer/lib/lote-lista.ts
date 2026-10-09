// Regras da tela Lista que não dependem de React: o aviso de cada linha da pré-visualização e a cor do marcador
// de cada linha do editor, a partir da análise do script (-SoAnalisar).
import type { LinhaAnalise } from '@shared/analise-lista';
import { msg } from '@shared/mensagens';
import type { CorChip } from '../components/ui';

export interface AvisoDaLinha {
  texto: string;
  cor: CorChip;
}

/** O que a coluna "Aviso" diz sobre a linha: o estado (duplicada, já feita...) vale mais que um alerta de leitura. */
export function avisoDaLinha(l: LinhaAnalise): AvisoDaLinha | null {
  const a = msg.lote.lista.avisos;
  if (l.status === 'repetida') return { texto: a.duplicada(l.duplicateOf ?? 0), cor: 'laranja' };
  if (l.status === 'ja na biblioteca') return { texto: a.naBiblioteca, cor: 'cinza' };
  if (l.status === 'ja feita') return { texto: a.jaFeita, cor: 'cinza' };
  if (l.status === 'ignorada') return { texto: a.ignorada, cor: 'laranja' };
  const w = l.warnings[0];
  if (!w) return null;
  if (/sem ' - '/.test(w)) return { texto: a.semTraco, cor: 'laranja' };
  if (/titulo vazio/.test(w)) return { texto: a.tituloVazio, cor: 'laranja' };
  if (/remixer/.test(w)) return { texto: a.remixer, cor: 'azul' };
  return { texto: w, cor: 'laranja' };
}

/** Linha que o lote não vai baixar: aparece esmaecida. */
export const linhaPulada = (l: LinhaAnalise): boolean =>
  l.status === 'repetida' || l.status === 'ja feita' || l.status === 'ja na biblioteca' || l.status === 'ignorada';

export type CorMarcador = 'verde' | 'laranja' | 'cinza' | 'azul';

/** Cor do quadradinho de cada linha do arquivo no editor (número da linha → cor); linhas sem faixa ficam sem marcador. */
export function marcadoresDoEditor(linhas: readonly LinhaAnalise[]): Map<number, CorMarcador> {
  const m = new Map<number, CorMarcador>();
  for (const l of linhas) {
    const aviso = avisoDaLinha(l);
    let cor: CorMarcador = 'verde';
    if (aviso?.cor === 'laranja') cor = 'laranja';
    else if (aviso?.cor === 'cinza') cor = 'cinza';
    else if (aviso?.cor === 'azul') cor = 'azul';
    m.set(l.sourceLine, cor);
  }
  return m;
}

export const COR_DO_MARCADOR: Record<CorMarcador, string> = {
  verde: 'var(--color-led-verde)',
  laranja: 'var(--color-led-laranja)',
  cinza: 'var(--color-led-cinza-2)',
  azul: 'var(--color-led-azul)',
};
