// Os ajustes do lote como o Modo DJ os mostra (protótipo "DJ · Baixar lista › Ajustes"): interruptores sem "não" nem
// "sem" no nome (alguns dizem o contrário do flag do script) e o resumo em palavras. O que vai para o script continua
// sendo o mesmo `OpcoesLote`: aqui só se traduz ida e volta. Funções puras, para os testes conferirem.
import { msgDj } from '@shared/mensagens-dj';
import {
  GRUPOS_BOOLEANOS,
  LIMITES,
  ehOpcaoNumerica,
  opcoesAlteradas,
  type OpcaoBooleanaId,
  type OpcoesLote,
} from '@shared/opcoes-lote';

const ITENS = msgDj.lote.ajustes.itens;

export function invertidoNoDj(id: OpcaoBooleanaId): boolean {
  const item = ITENS[id];
  return 'invertido' in item && item.invertido;
}

/** O interruptor do DJ está ligado? ("Organizar depois de baixar" ligado = `-SemBeets` desligado.) */
export function marcadoNoDj(id: OpcaoBooleanaId, opcoes: OpcoesLote): boolean {
  return invertidoNoDj(id) ? !opcoes[id] : opcoes[id];
}

/** O valor do flag do script quando o interruptor do DJ vai para `marcado`. */
export function opcaoDoDj(id: OpcaoBooleanaId, marcado: boolean): Partial<OpcoesLote> {
  return { [id]: invertidoNoDj(id) ? !marcado : marcado };
}

export interface LinhaDoResumo {
  rotulo: string;
  valor: string;
  /** difere do padrão (o valor aparece em âmbar) */
  mudou: boolean;
}

const QUALIDADE: readonly { id: OpcaoBooleanaId; nome: string }[] = [
  { id: 'AceitarAacAiff', nome: 'AIFF/AAC' },
  { id: 'AceitarMp3320', nome: 'MP3 320' },
  { id: 'AceitarMp3Menor', nome: 'MP3 256/V0' },
];

const ROTULO_CURTO: Partial<Record<OpcaoBooleanaId, { rotulo: string; desligado: string }>> = {
  SemBeets: { rotulo: msgDj.lote.ajustes.linhas.organizar, desligado: msgDj.lote.ajustes.linhas.organizarDepois },
  SemCatalogo: { rotulo: msgDj.lote.ajustes.linhas.catalogo, desligado: msgDj.lote.ajustes.linhas.semConferir },
  SemBuscaArtista: {
    rotulo: msgDj.lote.ajustes.linhas.buscaArtista,
    desligado: msgDj.lote.ajustes.linhas.semBuscaArtista,
  },
};

/**
 * As linhas do resumo: a qualidade sempre (é a pergunta que todo DJ faz) e, depois, cada ajuste que difere do
 * padrão, com o valor de agora em poucas palavras.
 */
export function linhasDoResumoDj(opcoes: OpcoesLote): LinhaDoResumo[] {
  const l = msgDj.lote.ajustes.linhas;
  const aceitos = QUALIDADE.filter((q) => opcoes[q.id]).map((q) => q.nome);
  const linhas: LinhaDoResumo[] = [
    { rotulo: l.qualidade, valor: l.qualidadeValor(aceitos), mudou: aceitos.length > 0 },
  ];
  const qualidade = new Set<string>(GRUPOS_BOOLEANOS.find((g) => g.id === 'qualidade')?.itens ?? []);
  for (const id of opcoesAlteradas(opcoes)) {
    if (qualidade.has(id)) continue;
    if (ehOpcaoNumerica(id)) {
      const unidade = LIMITES[id].unidade;
      linhas.push({ rotulo: ITENS[id].titulo, valor: `${opcoes[id]}${unidade ? ` ${unidade}` : ''}`, mudou: true });
      continue;
    }
    const curto = ROTULO_CURTO[id];
    const marcado = marcadoNoDj(id, opcoes);
    linhas.push({
      rotulo: curto?.rotulo ?? ITENS[id].titulo,
      valor: curto && !marcado ? curto.desligado : marcado ? l.ligado : l.desligado,
      mudou: true,
    });
  }
  return linhas;
}

/** Quantos ajustes de Velocidade e paciência mudaram (o selo do cabeçalho recolhível). */
export function numericosAlterados(opcoes: OpcoesLote): number {
  return opcoesAlteradas(opcoes).filter(ehOpcaoNumerica).length;
}
