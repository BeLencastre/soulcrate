// Biblioteca (Fase 5): tipos e regras puras compartilhadas entre o main (que fala com o beets) e o renderer (que mostra
// a tabela). Nada aqui toca em disco, em Docker ou em React, para os testes conferirem sem nenhum dos três.
import type { AppError } from './erros.js';
import { normalizar } from './texto.js';

// ---------------------------------------------------------------- Modelo

export interface FaixaDaBiblioteca {
  /** `$id` do beets: identifica a faixa para "Mostrar no Explorer" (o renderer nunca manda caminho) */
  id: number;
  artista: string;
  titulo: string;
  /** null quando o beets guarda 0 (sem BPM) */
  bpm: number | null;
  tom: string | null;
  /** o primeiro gênero (o que dá nome à pasta); null quando não há */
  genero: string | null;
  /** FLAC, WAV, MP3 320... */
  formato: string;
  /** caminho relativo a `music/`, com `/` (`Hard Techno/Azyr/No Escape.flac`) */
  arquivo: string;
  /** a pasta raiz é `_Sem Genero` */
  semGenero: boolean;
}

/** O que sobrou em `downloads/` (a pasta ou o arquivo solto, no primeiro nível) e o beets não importou. */
export interface ParadoEmDownloads {
  /** nome da pasta (ou do arquivo) dentro de `downloads/` */
  nome: string;
  /** os primeiros arquivos de áudio, relativos à pasta (o nome, se for um arquivo solto) */
  arquivos: string[];
  /** quantos arquivos de áudio há ao todo (pode passar de `arquivos.length`) */
  total: number;
  /** epoch ms do arquivo mais recente: o app só considera "parado" o que está quieto há um tempo */
  modificadoEm: number;
}

export interface LeituraBiblioteca {
  /** a pasta `music/` no disco (a que o Rekordbox monitora) */
  pastaMusica: string;
  pastaDownloads: string;
  /** epoch ms */
  lidaEm: number;
  faixas: FaixaDaBiblioteca[];
  /** linhas da saída do beets que não deu para entender */
  ignoradas: number;
  parados: ParadoEmDownloads[];
}

export type ResultadoLeitura = { ok: true; leitura: LeituraBiblioteca } | { ok: false; erro: AppError };

// ---------------------------------------------------------------- Leitura da saída do beets

/** Formato do `ls -f`: campos separados por tabulação (nenhum deles costuma ter uma). */
export const FORMATO_LS = [
  '$id',
  '$artist',
  '$title',
  '$bpm',
  '$initial_key',
  '$genres',
  '$format',
  '$bitrate',
  '$path',
].join('\t');

/** A pasta `music/` como o contêiner a vê (`/music`, o mesmo caminho no slskd e no Soulbeet). */
export const MUSICA_NO_CONTEINER = '/music';
export const DOWNLOADS_NO_CONTEINER = '/downloads';
export const PASTA_SEM_GENERO = '_Sem Genero';

// eslint-disable-next-line no-control-regex -- é justamente a sequência de escape ANSI que o beets colore a saída
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** O beets colore a saída mesmo sem terminal (`\e[1;31m  deleted\e[39;49;00m`). */
export function semAnsi(texto: string): string {
  return texto.replace(ANSI, '');
}

/** `WAVE` vira `WAV`; `MP3` + `320kbps` vira `MP3 320`; o resto fica como o beets diz. */
export function rotuloDoFormato(formato: string, bitrate: string): string {
  const f = formato.trim().toUpperCase();
  if (f === 'WAVE') return 'WAV';
  if (f === 'MP3') {
    const kbps = /(\d+)/.exec(bitrate)?.[1];
    return kbps ? `MP3 ${kbps}` : 'MP3';
  }
  return f || '?';
}

/** Uma linha do `ls -f FORMATO_LS`; null se ela não tem o formato esperado ou o arquivo está fora de `/music`. */
export function lerLinhaDeFaixa(linha: string): FaixaDaBiblioteca | null {
  const campos = linha.replace(/\r$/, '').split('\t');
  if (campos.length < 9) return null;
  const [id, artista, titulo, bpm, tom, generos, formato, bitrate, caminho] = campos as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 0) return null;
  const prefixo = `${MUSICA_NO_CONTEINER}/`;
  // o caminho pode ter tabulação (muito raro): o que sobra depois do 9º campo faz parte dele
  const completo = [caminho, ...campos.slice(9)].join('\t');
  if (!completo.startsWith(prefixo)) return null;
  const arquivo = completo.slice(prefixo.length);
  const bpmNumero = Math.round(Number(bpm));
  // vários gêneros vêm separados por "; " (ponto e vírgula e espaço); um ";" colado é parte de um gênero só
  // ("Hard Dance;Hardcore;Neo Rave"), e a pasta usa o primeiro, como o `%first{$genres}` do config.yaml
  const primeiroGenero = generos.split('; ')[0]?.trim() ?? '';
  // faixa sem título nas tags (o beets a guarda assim): o nome do arquivo ocupa o lugar na tabela
  const nomeDoArquivo = (arquivo.split('/').pop() ?? arquivo).replace(/\.[^./]+$/, '');
  return {
    id: numero,
    artista: artista.trim(),
    titulo: titulo.trim() || nomeDoArquivo,
    bpm: Number.isFinite(bpmNumero) && bpmNumero > 0 ? bpmNumero : null,
    tom: tom.trim() || null,
    genero: primeiroGenero || null,
    formato: rotuloDoFormato(formato, bitrate),
    arquivo,
    // "sem gênero": sem a tag ou na pasta `_Sem Genero` (as duas coisas costumam andar juntas, mas nem sempre)
    semGenero: !primeiroGenero || arquivo.split('/')[0] === PASTA_SEM_GENERO,
  };
}

/** Lê toda a saída do `ls`; devolve as faixas e quantas linhas não deu para entender. */
export function lerFaixas(saida: string): { faixas: FaixaDaBiblioteca[]; ignoradas: number } {
  const faixas: FaixaDaBiblioteca[] = [];
  let ignoradas = 0;
  for (const linha of saida.split('\n')) {
    if (!linha.trim()) continue;
    const f = lerLinhaDeFaixa(linha);
    if (f) faixas.push(f);
    else ignoradas++;
  }
  return { faixas, ignoradas };
}

/** Artista e título, nessa ordem, para ordenar a tabela como um caixote de discos. */
export function ordenarFaixas(faixas: readonly FaixaDaBiblioteca[]): FaixaDaBiblioteca[] {
  const chave = (s: string) => s.toLocaleLowerCase('pt-BR');
  return faixas.slice().sort((a, b) => {
    const porArtista = chave(a.artista).localeCompare(chave(b.artista), 'pt-BR');
    return porArtista || chave(a.titulo).localeCompare(chave(b.titulo), 'pt-BR') || a.id - b.id;
  });
}

// ---------------------------------------------------------------- Indicadores e filtro da tabela

export type IndicadorId = 'bpm' | 'tom' | 'gen' | 'dl';

export interface Indicadores {
  semBpm: number;
  semTom: number;
  semGenero: number;
  /** arquivos de áudio parados em `downloads/` */
  parados: number;
}

export function contarIndicadores(
  faixas: readonly FaixaDaBiblioteca[],
  parados: readonly ParadoEmDownloads[],
): Indicadores {
  return {
    semBpm: faixas.filter((f) => f.bpm === null).length,
    semTom: faixas.filter((f) => f.tom === null).length,
    semGenero: faixas.filter((f) => f.semGenero).length,
    parados: parados.reduce((soma, p) => soma + p.total, 0),
  };
}

/** Busca por artista ou título (sem acento, sem maiúsculas, todas as palavras) e, se houver, um indicador. */
export function filtrarFaixas(
  faixas: readonly FaixaDaBiblioteca[],
  busca: string,
  indicador: IndicadorId | null,
): FaixaDaBiblioteca[] {
  // o indicador "Parados em downloads/" olha para fora da biblioteca: a tabela fica vazia e a tela lista os parados
  if (indicador === 'dl') return [];
  const palavras = normalizar(busca).split(' ').filter(Boolean);
  return faixas.filter((f) => {
    if (indicador === 'bpm' && f.bpm !== null) return false;
    if (indicador === 'tom' && f.tom !== null) return false;
    if (indicador === 'gen' && !f.semGenero) return false;
    if (palavras.length === 0) return true;
    const texto = normalizar(`${f.artista} ${f.titulo}`);
    return palavras.every((p) => texto.includes(p));
  });
}

// ---------------------------------------------------------------- Filtro do beets (remoção)

const MAX_TERMOS = 20;
const MAX_TAMANHO_TERMO = 200;

export type MotivoFiltro = 'vazio' | 'aspas' | 'opcao' | 'longo' | 'muitos';
export type TermosDoFiltro = { ok: true; termos: string[] } | { ok: false; motivo: MotivoFiltro };

/**
 * Quebra o texto do filtro nos termos do beets, como um terminal faria com as aspas: `title:"Northern Power"` é um
 * termo só (`title:Northern Power`). Cada termo vira **um argumento** do comando (nunca passa por um shell), então
 * só é preciso barrar o que o beets leria como opção (`-f`, `--format`) e o filtro vazio, que pegaria a biblioteca toda.
 */
export function termosDoFiltro(texto: string): TermosDoFiltro {
  const termos: string[] = [];
  let atual = '';
  let temAtual = false;
  let dentroDeAspas = false;
  for (const c of texto) {
    if (c === '"') {
      dentroDeAspas = !dentroDeAspas;
      temAtual = true;
    } else if (!dentroDeAspas && /\s/.test(c)) {
      if (temAtual) termos.push(atual);
      atual = '';
      temAtual = false;
    } else {
      atual += c;
      temAtual = true;
    }
  }
  if (dentroDeAspas) return { ok: false, motivo: 'aspas' };
  if (temAtual) termos.push(atual);
  const uteis = termos.filter((t) => t !== '');
  if (uteis.length === 0) return { ok: false, motivo: 'vazio' };
  if (uteis.length > MAX_TERMOS) return { ok: false, motivo: 'muitos' };
  if (uteis.some((t) => t.length > MAX_TAMANHO_TERMO)) return { ok: false, motivo: 'longo' };
  if (uteis.some((t) => t.startsWith('-'))) return { ok: false, motivo: 'opcao' };
  // só vírgulas ou só negações não escolhem nada de verdade: o beets pegaria a biblioteca inteira
  if (uteis.every((t) => t === ',' || t.startsWith('^'))) return { ok: false, motivo: 'vazio' };
  return { ok: true, termos: uteis };
}

/**
 * O filtro que o botão de remover de uma linha propõe: `id:N`, que pega só aquela faixa. `artist:` e `title:` são
 * buscas por trecho (`title:Power` pega "Power" e "Power (Extended Mix)", e `artist:` vazio pega a biblioteca
 * inteira), então a linha clicada não seria a única a sair. O usuário pode trocar por um filtro mais largo, e o
 * app lista tudo o que ele pega antes de apagar.
 */
export function filtroDaFaixa(f: Pick<FaixaDaBiblioteca, 'id'>): string {
  return `id:${f.id}`;
}

/** A partir de quantas faixas a remoção pede para digitar o número (um filtro largo demais apaga muita coisa de vez). */
export const REMOCAO_EM_MASSA = 25;
/** Quantas faixas a pré-visualização lista (o resto vira "e mais N"). */
export const FAIXAS_NA_PREVIA = 50;

export interface PreviaRemocao {
  /** o filtro como será usado (termos separados por espaço, com aspas onde há espaço) */
  filtro: string;
  /** só vale para este filtro e para este conjunto de faixas; a remoção o exige */
  token: string;
  /** todas as faixas que o filtro pega (a tela lista as primeiras) */
  faixas: FaixaDaBiblioteca[];
}

export type ResultadoPreviaRemocao = { ok: true; previa: PreviaRemocao } | { ok: false; erro: AppError };

export interface RemocaoFeita {
  /** as faixas que saíram, como a prévia as mostrou */
  removidas: { artista: string; titulo: string }[];
}

export type ResultadoRemocao = { ok: true; remocao: RemocaoFeita } | { ok: false; erro: AppError };

// ---------------------------------------------------------------- Manutenção

/**
 * As tarefas de manutenção que o app sabe pedir ao beets (o §5 da especificação: sem comando livre na v1):
 * `update`, `move`, `keyfinder` + `autobpm` das faixas sem, e `import -q -s` do que sobrou em `downloads/`.
 */
export type TarefaManutencao = 'update' | 'move' | 'tomEBpm' | 'importLeftovers';

export const TAREFAS_DE_MANUTENCAO: readonly TarefaManutencao[] = ['tomEBpm', 'importLeftovers', 'update', 'move'];

export const ehTarefaDeManutencao = (v: unknown): v is TarefaManutencao =>
  typeof v === 'string' && (TAREFAS_DE_MANUTENCAO as readonly string[]).includes(v);

/** As tarefas que mexem na biblioteca sem volta fácil: pedem a pré-visualização (o beets com `-p`) e o token. */
export const TAREFAS_COM_PREVIA: readonly TarefaManutencao[] = ['update', 'move'];

export interface PreviaManutencao {
  tarefa: TarefaManutencao;
  /** devolvido para as tarefas com prévia; a execução o exige */
  token: string | null;
  /** quantas faixas a tarefa mexeria (0 = nada a fazer) */
  afetadas: number;
  /** o que o beets disse que faria, sem cor, as primeiras linhas */
  linhas: string[];
  /** quantas linhas a saída teve ao todo */
  totalDeLinhas: number;
  /** `update`: faixas cujo arquivo sumiu e que o banco esqueceria */
  esquecidas: number;
}

export type ResultadoPreviaManutencao = { ok: true; previa: PreviaManutencao } | { ok: false; erro: AppError };

export type ResultadoManutencao = { ok: true; id: string; tarefa: TarefaManutencao } | { ok: false; erro: AppError };

const LINHAS_NA_PREVIA = 40;

/** Lê o que `update -p` e `move -p` disseram: quantas faixas seriam alteradas, movidas ou esquecidas. */
export function lerPrevia(tarefa: 'update' | 'move', saida: string): Omit<PreviaManutencao, 'token' | 'tarefa'> {
  const todas = semAnsi(saida)
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '');
  const base = { linhas: todas.slice(0, LINHAS_NA_PREVIA), totalDeLinhas: todas.length };
  if (tarefa === 'move') {
    // "Moving 3 items (12 already in place)." / "Moving 1 item (1 already in place)." O beets escreve esse resumo no
    // stderr e a lista das mudanças no stdout: quem chama junta as duas saídas. Sem o resumo, cada "-> destino"
    // é um arquivo a mover.
    const m = /Moving\s+(\d+)\s+items?/i.exec(todas.join('\n'));
    const setas = todas.filter((l) => /^\s*->\s/.test(l)).length;
    return { ...base, afetadas: m?.[1] ? Number(m[1]) : setas, esquecidas: 0 };
  }
  // update -p: uma linha por faixa mexida (sem recuo); "  deleted" logo abaixo = o arquivo não existe mais
  const esquecidas = todas.filter((l) => /^\s+deleted$/i.test(l)).length;
  const cabecalhos = todas.filter((l) => !/^\s/.test(l)).length;
  return { ...base, afetadas: cabecalhos, esquecidas: Math.min(esquecidas, cabecalhos) };
}

// ---------------------------------------------------------------- Compartilhamento (slskd)

export interface Compartilhamento {
  /** arquivos que o slskd anuncia no Soulseek; null se a API não disse */
  arquivos: number | null;
  /** o slskd está varrendo a pasta agora */
  escaneando: boolean;
}

export type ResultadoCompartilhamento =
  { ok: true; compartilhamento: Compartilhamento } | { ok: false; erro: AppError };

/** A resposta de `GET /api/v0/application` do slskd, só com o que o app lê. */
export function lerCompartilhamento(corpo: unknown): Compartilhamento {
  const shares = (corpo as { shares?: { files?: unknown; scanning?: unknown } } | null)?.shares;
  const arquivos = typeof shares?.files === 'number' && Number.isFinite(shares.files) ? shares.files : null;
  return { arquivos, escaneando: shares?.scanning === true };
}
