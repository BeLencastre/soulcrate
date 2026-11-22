// Playlists no Rekordbox pelo rekordbox XML, o formato de troca oficial da Pioneer: o app grava um arquivo que o
// Rekordbox lê em Preferências › Avançado › Banco de dados › rekordbox xml › Imported Library, e a pessoa importa a
// pasta "Soulcrate" para as playlists dela. O app nunca toca no banco do Rekordbox (ADR 0004).
//
// Aqui ficam as regras puras: a árvore (uma playlist por gênero e uma por lista baixada), o caminho de cada faixa
// (`Location`) e o texto do XML. Nada de disco, processo ou DOM.
import { ordenarFaixas, type FaixaDaBiblioteca } from './biblioteca.js';
import type { AppError } from './erros.js';

/** Onde o arquivo fica, dentro da pasta do Soulcrate. É dado do usuário: a atualização da stack não toca nele. */
export const PASTA_REKORDBOX = 'rekordbox';
export const ARQUIVO_REKORDBOX_XML = 'soulcrate.xml';

export const PASTA_RAIZ = 'Soulcrate';
export const PASTA_GENEROS = 'Gêneros';
export const PASTA_LISTAS = 'Listas';
/** Arquivo solto na raiz de `music/`, fora de qualquer pasta de gênero (não deveria existir, mas não some). */
export const PLAYLIST_FORA_DAS_PASTAS = '_Outras';

// ---------------------------------------------------------------- Modelo

export interface PlaylistRekordbox {
  nome: string;
  /** `$id` do beets, na ordem da playlist */
  ids: number[];
}

/** Uma lista baixada: o nome do arquivo e, na ordem das linhas, o `$id` da faixa que casou (null se nenhuma). */
export interface ListaParaRekordbox {
  arquivo: string;
  ids: readonly (number | null | undefined)[];
}

export interface ArvoreRekordbox {
  generos: PlaylistRekordbox[];
  listas: PlaylistRekordbox[];
}

export interface ResumoRekordbox {
  faixas: number;
  generos: number;
  listas: number;
  /** listas que o app não conseguiu analisar (ficaram de fora desta vez) */
  listasComFalha: string[];
}

/** O que o cartão do Rekordbox mostra. */
export interface EstadoRekordbox {
  /** o arquivo que o Rekordbox lê */
  caminho: string;
  /** epoch ms da última gravação; null se o arquivo ainda não existe */
  geradoEm: number | null;
  /** o resumo da última geração desde que o app abriu; null antes dela */
  resumo: ResumoRekordbox | null;
  gerando: boolean;
  /** o erro da última tentativa (também das automáticas); null se deu certo */
  erro: AppError | null;
}

export type ResultadoRekordbox = { ok: true; estado: EstadoRekordbox } | { ok: false; erro: AppError };

// ---------------------------------------------------------------- Árvore

/** Chave de comparação dos nomes: o Rekordbox não aceita dois nomes iguais no mesmo nível da árvore. */
const chave = (nome: string) => nome.normalize('NFC').toLocaleLowerCase('pt-BR');
const porNome = (a: PlaylistRekordbox, b: PlaylistRekordbox) => a.nome.localeCompare(b.nome, 'pt-BR');

/** A pasta de gênero da faixa: a primeira parte do caminho em `music/` (o mesmo nome do disco, sem copiar regras). */
export function generoDaPasta(arquivo: string): string {
  const partes = arquivo.split('/').filter(Boolean);
  return partes.length >= 2 && partes[0] ? partes[0] : PLAYLIST_FORA_DAS_PASTAS;
}

/** "techno-pesado.txt" → "techno-pesado". */
export function nomeDaLista(arquivo: string): string {
  return arquivo.replace(/\.[^./\\]*$/, '') || arquivo;
}

/** Junta, sem repetir, os ids que chegam com o mesmo nome (sem diferenciar maiúsculas). */
function agrupar(entradas: Iterable<{ nome: string; ids: Iterable<number> }>): PlaylistRekordbox[] {
  const grupos = new Map<string, { nome: string; ids: number[]; vistos: Set<number> }>();
  for (const { nome, ids } of entradas) {
    let g = grupos.get(chave(nome));
    if (!g) {
      g = { nome, ids: [], vistos: new Set() };
      grupos.set(chave(nome), g);
    }
    for (const id of ids) {
      if (g.vistos.has(id)) continue;
      g.vistos.add(id);
      g.ids.push(id);
    }
  }
  return [...grupos.values()].map(({ nome, ids }) => ({ nome, ids }));
}

/**
 * Uma playlist por pasta de gênero (faixas como num caixote: artista e título) e uma por lista baixada (na ordem da
 * lista, só com faixas que estão na biblioteca; lista sem nenhuma fica de fora).
 */
export function montarArvore(
  faixas: readonly FaixaDaBiblioteca[],
  listas: readonly ListaParaRekordbox[] = [],
): ArvoreRekordbox {
  const generos = agrupar(ordenarFaixas(faixas).map((f) => ({ nome: generoDaPasta(f.arquivo), ids: [f.id] })));
  const naBiblioteca = new Set(faixas.map((f) => f.id));
  const dasListas = agrupar(
    listas.map((l) => ({
      nome: nomeDaLista(l.arquivo),
      ids: l.ids.filter((id): id is number => typeof id === 'number' && naBiblioteca.has(id)),
    })),
  ).filter((p) => p.ids.length > 0);
  return { generos: generos.sort(porNome), listas: dasListas.sort(porNome) };
}

// ---------------------------------------------------------------- Location

/** Codifica uma parte do caminho em UTF-8 percentual, incluindo `! ' ( ) *` (o `encodeURIComponent` os deixa). */
function codificarParte(parte: string): string {
  return encodeURIComponent(parte).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/**
 * O `Location` do rekordbox XML: `file://localhost/C:/DJ/Musics/Hard%20Techno/Azyr/No%20Escape.flac`. A letra do
 * drive fica como está; o resto é codificado parte por parte. Um caminho de rede (`\\servidor\pasta`) vira
 * `file://localhost//servidor/pasta/...`, que não foi conferido no Rekordbox.
 */
export function localizacao(pastaMusica: string, arquivo: string): string {
  const deRede = /^[\\/]{2}[^\\/]/.test(pastaMusica);
  const partes = [...pastaMusica.split(/[\\/]+/), ...arquivo.split('/')].filter(Boolean);
  const codificadas = partes.map((p, i) => (i === 0 && /^[A-Za-z]:$/.test(p) ? p : codificarParte(p)));
  return `file://localhost/${deRede ? '/' : ''}${codificadas.join('/')}`;
}

// ---------------------------------------------------------------- XML

// caracteres que o XML 1.0 não aceita nem escapados: some com eles (aparecem em tag malfeita)
// eslint-disable-next-line no-control-regex -- é justamente a faixa de controle que o XML recusa
const PROIBIDOS_NO_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function escaparAtributo(valor: string): string {
  return valor
    .replace(PROIBIDOS_NO_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

const atributos = (pares: [string, string | number][]) =>
  pares.map(([nome, valor]) => `${nome}="${escaparAtributo(String(valor))}"`).join(' ');

function pasta(nome: string, filhos: string[], recuo: string): string[] {
  return [
    `${recuo}<NODE ${atributos([
      ['Type', '0'],
      ['Name', nome],
      ['Count', filhos.length],
    ])}>`,
    ...filhos,
    `${recuo}</NODE>`,
  ];
}

function playlist(p: PlaylistRekordbox, recuo: string): string {
  const cabeca = `${recuo}<NODE ${atributos([
    ['Type', '1'],
    ['Name', p.nome],
    ['KeyType', '0'],
    ['Entries', p.ids.length],
  ])}>`;
  return [cabeca, ...p.ids.map((id) => `${recuo}  <TRACK Key="${id}" />`), `${recuo}</NODE>`].join('\n');
}

export interface EntradaXml {
  /** `music/` no disco do PC */
  pastaMusica: string;
  faixas: readonly FaixaDaBiblioteca[];
  arvore: ArvoreRekordbox;
  /** versão do app, no `PRODUCT` */
  versao: string;
}

/**
 * O rekordbox XML inteiro. Cada faixa leva só o necessário para o Rekordbox achar o arquivo e mostrá-la antes de
 * importar (`TrackID`, `Name`, `Artist`, `Location`): BPM, tom, gênero e cues ficam com as tags e com a análise do
 * próprio Rekordbox, para o XML nunca contradizer o arquivo.
 */
export function gerarXml({ pastaMusica, faixas, arvore, versao }: EntradaXml): string {
  const colecao = faixas.map(
    (f) =>
      `    <TRACK ${atributos([
        ['TrackID', f.id],
        ['Name', f.titulo],
        ['Artist', f.artista],
        ['Location', localizacao(pastaMusica, f.arquivo)],
      ])} />`,
  );
  const r = '        ';
  const filhos = [
    ...pasta(
      PASTA_GENEROS,
      arvore.generos.map((g) => playlist(g, `${r}  `)),
      r,
    ),
    ...(arvore.listas.length > 0
      ? pasta(
          PASTA_LISTAS,
          arvore.listas.map((l) => playlist(l, `${r}  `)),
          r,
        )
      : []),
  ];
  // o Count conta as pastas filhas (Gêneros e, se houver, Listas), não as linhas
  const raiz = [
    `      <NODE ${atributos([
      ['Type', '0'],
      ['Name', PASTA_RAIZ],
      ['Count', arvore.listas.length > 0 ? 2 : 1],
    ])}>`,
    ...filhos,
    '      </NODE>',
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    `  <PRODUCT ${atributos([
      ['Name', 'Soulcrate'],
      ['Version', versao],
      ['Company', 'Soulcrate'],
    ])} />`,
    `  <COLLECTION Entries="${faixas.length}">`,
    ...colecao,
    '  </COLLECTION>',
    '  <PLAYLISTS>',
    '    <NODE Type="0" Name="ROOT" Count="1">',
    ...raiz,
    '    </NODE>',
    '  </PLAYLISTS>',
    '</DJ_PLAYLISTS>',
    '',
  ].join('\n');
}

export function resumir(
  faixas: readonly FaixaDaBiblioteca[],
  arvore: ArvoreRekordbox,
  listasComFalha: string[],
): ResumoRekordbox {
  return { faixas: faixas.length, generos: arvore.generos.length, listas: arvore.listas.length, listasComFalha };
}
