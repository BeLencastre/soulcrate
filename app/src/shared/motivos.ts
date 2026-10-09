// Motivos de recusa do baixar-lista.ps1 traduzidos para a linguagem da tabela "Decida pelo motivo" do README, cada
// um com a ação sugerida (Fase 4). Puro: o main e o renderer usam as mesmas regras, e um teste confere cada linha
// da tabela do README contra elas.
import { msg } from './mensagens.js';
import { RECEITAS, type OpcoesLote } from './opcoes-lote.js';

export type TipoMotivo =
  | 'wav'
  | 'aacAiff'
  | 'aacBaixo'
  | 'mp3320'
  | 'mp3Menor'
  | 'mp3Baixo'
  | 'formato'
  | 'titulo'
  | 'outroArtista'
  | 'tituloComArtista'
  | 'palavraExtra'
  | 'artista'
  | 'mix'
  | 'versao'
  | 'bloqueado'
  | 'curto'
  | 'ilegivel'
  | 'semRespostas'
  | 'semCompativel'
  | 'fila'
  | 'tempo'
  | 'erroUsuario'
  | 'sumiu'
  | 'naoEnfileirou'
  | 'erroInterno'
  | 'desconhecido';

/** Botão que acompanha a ação de um motivo. */
export type BotaoMotivo = 'soulbeet' | 'receita-usuarios-lentos';

export interface MotivoTraduzido {
  tipo: TipoMotivo;
  /** o motivo como o script o escreve */
  bruto: string;
  /** quantos arquivos (ou tentativas) foram recusados por ele */
  n: number;
  rotulo: string;
  acao: string;
  /** o que mudar nas opções do lote para tentar de novo (só o que vale a pena ligar sozinho) */
  sugere: Partial<OpcoesLote>;
  botao: BotaoMotivo | null;
}

const m = msg.historico.motivos;

/** As opções da receita "Usuários lentos, filas longas" (FilaMaxMin e DownloadMaxMin). */
const USUARIOS_LENTOS: Partial<OpcoesLote> = RECEITAS.find((r) => r.id === 'usuariosLentos')?.ajuste ?? {};
/** "Quero tudo, nem que seja MP3 256": o que o README sugere para quem só tem faixa em formato recusado. */
const QUER_TUDO: Partial<OpcoesLote> = { AceitarAacAiff: true, AceitarMp3320: true, AceitarMp3Menor: true };

interface Regra {
  tipo: TipoMotivo;
  re: RegExp;
}

// A ordem importa: `formato <ext>` genérico vem depois do AIFF/AAC, que têm a opção própria.
const REGRAS_DE_ARQUIVO: readonly Regra[] = [
  // lotes antigos (até a stack 1.1.0), quando o WAV precisava de -AceitarWav
  { tipo: 'wav', re: /^formato wav \(use -AceitarWav\)/i },
  { tipo: 'aacAiff', re: /^formato (aiff?|m4a|aac) \(use -Aceitar(?:AacAiff|Wav)\)/i },
  { tipo: 'aacBaixo', re: /^aac (.+?) \(qualidade baixa\)/i },
  { tipo: 'mp3320', re: /^mp3 (.+?) \(use -AceitarMp3320\)/i },
  { tipo: 'mp3Menor', re: /^mp3 (.+?) \(use -AceitarMp3Menor\)/i },
  { tipo: 'mp3Baixo', re: /^mp3 (.+?) \(qualidade baixa\)/i },
  { tipo: 'formato', re: /^formato (\S+)$/i },
  { tipo: 'titulo', re: /^titulo diferente$/i },
  { tipo: 'outroArtista', re: /^outro artista no nome(?:: '(.*)')?$/i },
  { tipo: 'tituloComArtista', re: /^titulo so aparece junto do nome do artista$/i },
  { tipo: 'palavraExtra', re: /^palavra a mais no titulo(?:: '(.*)')?$/i },
  { tipo: 'artista', re: /^artista nao aparece$/i },
  { tipo: 'mix', re: /^mix diferente$/i },
  { tipo: 'versao', re: /^outra versao(?: \('(.*)'\))?$/i },
  { tipo: 'bloqueado', re: /^bloqueado pelo usuario$/i },
  { tipo: 'curto', re: /^curto demais/i },
  { tipo: 'ilegivel', re: /^nome de arquivo ilegivel$/i },
  { tipo: 'erroInterno', re: /^erro interno/i },
  { tipo: 'semRespostas', re: /^0 respostas?$/i },
];

export interface ContextoMotivo {
  /** o diagnóstico traz títulos sugeridos ("talvez seja") */
  temSugestoes?: boolean;
}

function montar(tipo: TipoMotivo, bruto: string, n: number, detalhe: string, ctx: ContextoMotivo): MotivoTraduzido {
  const base = { tipo, bruto, n, sugere: {} as Partial<OpcoesLote>, botao: null as BotaoMotivo | null };
  switch (tipo) {
    case 'wav':
      return { ...base, rotulo: m.wav.rotulo(detalhe), acao: m.wav.acao };
    case 'aacAiff':
      return { ...base, rotulo: m.aacAiff.rotulo(detalhe), acao: m.aacAiff.acao, sugere: QUER_TUDO };
    case 'aacBaixo':
      return { ...base, rotulo: m.aacBaixo.rotulo(detalhe), acao: m.aacBaixo.acao };
    case 'mp3320':
      return { ...base, rotulo: m.mp3320.rotulo(detalhe), acao: m.mp3320.acao, sugere: QUER_TUDO };
    case 'mp3Menor':
      return { ...base, rotulo: m.mp3Menor.rotulo(detalhe), acao: m.mp3Menor.acao, sugere: QUER_TUDO };
    case 'mp3Baixo':
      return { ...base, rotulo: m.mp3Baixo.rotulo(detalhe), acao: m.mp3Baixo.acao };
    case 'formato':
      return { ...base, rotulo: m.formato.rotulo(detalhe), acao: m.formato.acao, botao: 'soulbeet' };
    case 'titulo':
      return {
        ...base,
        rotulo: m.titulo.rotulo,
        acao: ctx.temSugestoes ? m.titulo.acaoComSugestao : m.titulo.acao,
      };
    case 'outroArtista':
      return { ...base, rotulo: m.outroArtista.rotulo(detalhe), acao: m.outroArtista.acao };
    case 'tituloComArtista':
      return { ...base, rotulo: m.tituloComArtista.rotulo, acao: m.tituloComArtista.acao };
    case 'palavraExtra':
      return { ...base, rotulo: m.palavraExtra.rotulo(detalhe), acao: m.palavraExtra.acao };
    case 'artista':
      return { ...base, rotulo: m.artista.rotulo, acao: m.artista.acao };
    case 'mix':
      return { ...base, rotulo: m.mix.rotulo, acao: m.mix.acao };
    case 'versao':
      return { ...base, rotulo: m.versao.rotulo(detalhe), acao: m.versao.acao(detalhe) };
    case 'bloqueado':
      return { ...base, rotulo: m.bloqueado.rotulo, acao: m.bloqueado.acao };
    case 'curto':
      return { ...base, rotulo: m.curto.rotulo, acao: m.curto.acao };
    case 'ilegivel':
      return { ...base, rotulo: m.ilegivel.rotulo, acao: m.ilegivel.acao };
    case 'semRespostas':
      return { ...base, rotulo: m.semRespostas.rotulo, acao: m.semRespostas.acao };
    case 'semCompativel':
      return { ...base, rotulo: m.semCompativel.rotulo(n), acao: m.semCompativel.acao };
    case 'fila':
      return {
        ...base,
        rotulo: m.fila.rotulo,
        acao: m.fila.acao,
        sugere: USUARIOS_LENTOS,
        botao: 'receita-usuarios-lentos',
      };
    case 'tempo':
      return {
        ...base,
        rotulo: m.tempo.rotulo,
        acao: m.tempo.acao,
        sugere: USUARIOS_LENTOS,
        botao: 'receita-usuarios-lentos',
      };
    case 'erroUsuario':
      return { ...base, rotulo: m.erroUsuario.rotulo(detalhe), acao: m.erroUsuario.acao };
    case 'sumiu':
      return { ...base, rotulo: m.sumiu.rotulo, acao: m.sumiu.acao };
    case 'naoEnfileirou':
      return { ...base, rotulo: m.naoEnfileirou.rotulo, acao: m.naoEnfileirou.acao };
    case 'erroInterno':
      return { ...base, rotulo: m.erroInterno.rotulo, acao: m.erroInterno.acao };
    case 'desconhecido':
      return { ...base, rotulo: m.desconhecido.rotulo(bruto), acao: m.desconhecido.acao };
  }
}

/** Um motivo do `reasons` do diagnóstico (`titulo diferente`, `formato aiff (use -AceitarAacAiff)`...) com a ação. */
export function traduzirMotivo(bruto: string, n: number, ctx: ContextoMotivo = {}): MotivoTraduzido {
  const texto = bruto.trim();
  for (const r of REGRAS_DE_ARQUIVO) {
    const achou = r.re.exec(texto);
    if (achou) return montar(r.tipo, texto, n, achou[1] ?? '', ctx);
  }
  return montar('desconhecido', texto, n, '', ctx);
}

/**
 * O que o script escreve em `item.attemptFailed.reason` quando um download falha: `fila longa em u (>4 min)`,
 * `tempo esgotado em u (>20 min)`, `transferencia sumiu da fila (u)`, `nao enfileirou: ...` ou `u: Completed, Errored`.
 */
export function tipoDaTentativa(razao: string): TipoMotivo {
  if (/^fila longa/i.test(razao)) return 'fila';
  if (/^tempo esgotado/i.test(razao)) return 'tempo';
  if (/^transferencia sumiu/i.test(razao)) return 'sumiu';
  if (/^nao enfileirou/i.test(razao)) return 'naoEnfileirou';
  return 'erroUsuario';
}

/** Os motivos de uma faixa que falhou no download: as tentativas agrupadas por tipo, as mais frequentes primeiro. */
export function traduzirTentativas(razoes: readonly string[]): MotivoTraduzido[] {
  const grupos = new Map<TipoMotivo, { n: number; exemplo: string }>();
  for (const r of razoes) {
    const tipo = tipoDaTentativa(r);
    const g = grupos.get(tipo);
    if (g) g.n++;
    else grupos.set(tipo, { n: 1, exemplo: r });
  }
  return [...grupos.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([tipo, g]) => {
      // "ruim: Completed, Errored" → o estado depois dos dois-pontos
      const estado = tipo === 'erroUsuario' ? (g.exemplo.split(': ').slice(1).join(': ') || g.exemplo).trim() : '';
      return montar(tipo, g.exemplo, g.n, estado, {});
    });
}

/** Reúne o que os motivos pedem para tentar de novo (a união das opções sugeridas). */
export function opcoesSugeridas(motivos: readonly MotivoTraduzido[]): Partial<OpcoesLote> {
  return Object.assign({}, ...motivos.map((x) => x.sugere)) as Partial<OpcoesLote>;
}
