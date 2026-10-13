// Importação de playlists de streaming (protótipos "importacao-playlist"): os streamings aceitos, o reconhecimento do
// link colado, a conversão das faixas para o formato da lista (Artista - Título (Mix)), a revisão antes de importar e a
// primeira linha que guarda de onde a lista veio. Tudo puro: o main busca a playlist, o renderer monta a lista.
//
// Só entram streamings cuja playlist pública dá para ler de graça, sem conta de desenvolvedor paga: o Deezer pela
// API pública, Spotify, Apple Music e YouTube Music pelas páginas públicas. A Amazon Music fica de fora (a página
// pública não traz as faixas e a API está em beta fechado). Não há login: só playlists públicas, pelo link.

export type StreamingId = 'spotify' | 'apple' | 'youtube' | 'deezer';

export interface Streaming {
  id: StreamingId;
  /** as duas letras do quadradinho (não há logos de marca no app) */
  sigla: string;
  nome: string;
  /** o placeholder do campo de link */
  exemplo: string;
  /** o caminho no menu do streaming até "copiar link" */
  menu: string;
  /** como copiar o link no app do streaming */
  dica: string;
}

export const STREAMINGS: readonly Streaming[] = [
  {
    id: 'spotify',
    sigla: 'SP',
    nome: 'Spotify',
    exemplo: 'https://open.spotify.com/playlist/…',
    menu: '⋯ › Compartilhar › Copiar link da playlist',
    dica: 'No Spotify: ⋯ › Compartilhar › Copiar link da playlist. A playlist precisa ser pública.',
  },
  {
    id: 'apple',
    sigla: 'AM',
    nome: 'Apple Music',
    exemplo: 'https://music.apple.com/br/playlist/…',
    menu: '⋯ › Compartilhar › Copiar link',
    dica: 'No Apple Music: ⋯ › Compartilhar › Copiar link. A playlist precisa estar no seu perfil público.',
  },
  {
    id: 'youtube',
    sigla: 'YT',
    nome: 'YouTube Music',
    exemplo: 'https://music.youtube.com/playlist?list=…',
    menu: '⋮ › Compartilhar › Copiar',
    dica: 'No YouTube Music: ⋮ › Compartilhar › Copiar. Vídeos que não são faixas aparecem marcados na revisão.',
  },
  {
    id: 'deezer',
    sigla: 'DZ',
    nome: 'Deezer',
    exemplo: 'https://www.deezer.com/br/playlist/…',
    menu: '⋯ › Compartilhar › Copiar link',
    dica: 'No Deezer: ⋯ › Compartilhar › Copiar link. A playlist precisa ser pública.',
  },
];

export const ehStreamingId = (v: unknown): v is StreamingId => STREAMINGS.some((s) => s.id === v);

export function streamingPorId(id: StreamingId): Streaming {
  const s = STREAMINGS.find((x) => x.id === id);
  if (!s) throw new Error(`Streaming desconhecido: ${id}`);
  return s;
}

/** Links nunca passam disto (um link de playlist tem menos de 200 caracteres). */
export const LIMITE_LINK = 2048;

// ---------------------------------------------------------------- Reconhecer o link

/** O que o link é, quando é de um streaming conhecido mas não de uma playlist. */
export type OutroConteudo = 'faixa' | 'album' | 'artista' | 'podcast' | 'video' | 'perfil' | 'biblioteca' | 'mix';

export type LinkReconhecido =
  | { tipo: 'vazio' }
  /** não é um endereço (nem dá para ler como um) */
  | { tipo: 'invalido' }
  /** é um endereço, mas de nenhum dos streamings aceitos */
  | { tipo: 'desconhecido' }
  | { tipo: 'outro'; servico: StreamingId; conteudo: OutroConteudo }
  /** link curto (spotify.link, link.deezer.com): o main segue o redirecionamento antes de buscar */
  | { tipo: 'curto'; servico: StreamingId; url: string }
  | { tipo: 'playlist'; servico: StreamingId; id: string; url: string };

const RE_ID_SPOTIFY = /^[A-Za-z0-9]{22}$/;
const RE_ID_APPLE = /^pl\.[A-Za-z0-9-]{8,80}$/;
const RE_ID_YOUTUBE = /^[A-Za-z0-9_-]{10,64}$/;
const RE_ID_DEEZER = /^\d{1,15}$/;

const OUTROS_SPOTIFY: Record<string, OutroConteudo> = {
  track: 'faixa',
  album: 'album',
  artist: 'artista',
  episode: 'podcast',
  show: 'podcast',
  user: 'perfil',
  collection: 'biblioteca',
};
const OUTROS_APPLE: Record<string, OutroConteudo> = {
  song: 'faixa',
  album: 'album',
  artist: 'artista',
  'music-video': 'video',
  podcast: 'podcast',
  curator: 'perfil',
  profile: 'perfil',
  library: 'biblioteca',
};
const OUTROS_DEEZER: Record<string, OutroConteudo> = {
  track: 'faixa',
  album: 'album',
  artist: 'artista',
  episode: 'podcast',
  show: 'podcast',
  profile: 'perfil',
};

function comoUrl(texto: string): URL | null {
  const t = texto.trim();
  if (!t) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

const hostDe = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '');
/** caminho sem o prefixo de idioma/país (`/intl-pt/`, `/br/`, `/pt/`) */
const partes = (u: URL) => u.pathname.split('/').filter(Boolean);

function reconhecerSpotify(u: URL): LinkReconhecido {
  const p = partes(u).filter((x) => !/^intl-[a-z]{2}(-[a-z]{2})?$/i.test(x) && x !== 'embed');
  const [tipo, id] = p;
  if (tipo === 'playlist' && id && RE_ID_SPOTIFY.test(id)) {
    return { tipo: 'playlist', servico: 'spotify', id, url: `https://open.spotify.com/playlist/${id}` };
  }
  const outro = tipo ? OUTROS_SPOTIFY[tipo] : undefined;
  if (outro) return { tipo: 'outro', servico: 'spotify', conteudo: outro };
  return { tipo: 'outro', servico: 'spotify', conteudo: 'perfil' };
}

function reconhecerApple(u: URL): LinkReconhecido {
  const p = partes(u);
  // /br/playlist/nome/pl.xxx  ou  /playlist/pl.xxx
  const i = p.indexOf('playlist');
  if (p[0] === 'library' || p.includes('library')) return { tipo: 'outro', servico: 'apple', conteudo: 'biblioteca' };
  if (i >= 0) {
    const id = p.slice(i + 1).find((x) => RE_ID_APPLE.test(x));
    if (id) {
      const primeiro = p[0] ?? '';
      const pais = /^[a-z]{2}$/i.test(primeiro) ? primeiro.toLowerCase() : 'us';
      return { tipo: 'playlist', servico: 'apple', id, url: `https://music.apple.com/${pais}/playlist/${id}` };
    }
  }
  // /br/album/nome/123?i=456 é uma faixa dentro do álbum
  if (p.includes('album') && u.searchParams.has('i')) return { tipo: 'outro', servico: 'apple', conteudo: 'faixa' };
  const outro = p.map((x) => OUTROS_APPLE[x]).find((x) => x !== undefined);
  return { tipo: 'outro', servico: 'apple', conteudo: outro ?? 'perfil' };
}

function reconhecerYoutube(u: URL): LinkReconhecido {
  const lista = u.searchParams.get('list');
  if (lista && RE_ID_YOUTUBE.test(lista)) {
    // RD… são as mixes automáticas ("Mix", "Rádio"): mudam a cada vez e não abrem como playlist
    if (/^RD/.test(lista)) return { tipo: 'outro', servico: 'youtube', conteudo: 'mix' };
    if (/^(LL|LM|WL)$/.test(lista)) return { tipo: 'outro', servico: 'youtube', conteudo: 'biblioteca' };
    return {
      tipo: 'playlist',
      servico: 'youtube',
      id: lista,
      url: `https://music.youtube.com/playlist?list=${lista}`,
    };
  }
  const p = partes(u);
  if (p[0] === 'channel' || p[0] === 'browse' || p[0]?.startsWith('@')) {
    return { tipo: 'outro', servico: 'youtube', conteudo: 'artista' };
  }
  if (p[0] === 'podcast') return { tipo: 'outro', servico: 'youtube', conteudo: 'podcast' };
  if (p[0] === 'library') return { tipo: 'outro', servico: 'youtube', conteudo: 'biblioteca' };
  return { tipo: 'outro', servico: 'youtube', conteudo: 'video' };
}

function reconhecerDeezer(u: URL): LinkReconhecido {
  const p = partes(u).filter((x) => !/^[a-z]{2}(-[a-z]{2})?$/i.test(x));
  const [tipo, id] = p;
  if (tipo === 'playlist' && id && RE_ID_DEEZER.test(id)) {
    return { tipo: 'playlist', servico: 'deezer', id, url: `https://www.deezer.com/playlist/${id}` };
  }
  const outro = tipo ? OUTROS_DEEZER[tipo] : undefined;
  if (outro) return { tipo: 'outro', servico: 'deezer', conteudo: outro };
  return { tipo: 'outro', servico: 'deezer', conteudo: 'perfil' };
}

/** De qual streaming é o link colado e se é de uma playlist (o diálogo troca o streaming sozinho). */
export function reconhecerLink(texto: string): LinkReconhecido {
  if (typeof texto !== 'string' || !texto.trim()) return { tipo: 'vazio' };
  if (texto.length > LIMITE_LINK) return { tipo: 'invalido' };
  const t = texto.trim();
  // URI do app do Spotify: spotify:playlist:ID
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/i.exec(t);
  if (uri) {
    const tipo = (uri[1] ?? '').toLowerCase();
    const id = uri[2] ?? '';
    if (tipo === 'playlist' && RE_ID_SPOTIFY.test(id)) {
      return { tipo: 'playlist', servico: 'spotify', id, url: `https://open.spotify.com/playlist/${id}` };
    }
    return { tipo: 'outro', servico: 'spotify', conteudo: OUTROS_SPOTIFY[tipo] ?? 'faixa' };
  }
  const u = comoUrl(t);
  if (!u || !u.hostname.includes('.')) return { tipo: 'invalido' };
  const host = hostDe(u);
  const https = new URL(u.href.replace(/^http:/i, 'https:'));
  if (host === 'open.spotify.com' || host === 'play.spotify.com') return reconhecerSpotify(u);
  if (host === 'spotify.link' || host === 'spotify.app.link')
    return { tipo: 'curto', servico: 'spotify', url: https.href };
  if (host === 'music.apple.com' || host === 'itunes.apple.com') return reconhecerApple(u);
  if (host === 'music.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    return reconhecerYoutube(u);
  }
  if (host === 'deezer.com') return reconhecerDeezer(u);
  if (host === 'link.deezer.com' || host === 'deezer.page.link')
    return { tipo: 'curto', servico: 'deezer', url: https.href };
  return { tipo: 'desconhecido' };
}

// ---------------------------------------------------------------- A playlist buscada

export interface FaixaPlaylist {
  artista: string;
  titulo: string;
  duracaoMs: number | null;
  /** YouTube: vídeo que não parece uma faixa (envio de usuário sem "Artista - Título", episódio de podcast) */
  video?: boolean;
}

export interface PlaylistImportada {
  servico: StreamingId;
  id: string;
  /** o link canônico da playlist (é o que fica guardado na primeira linha da lista) */
  url: string;
  nome: string;
  autor: string | null;
  /** https de um CDN conhecido do streaming; null se não veio */
  capa: string | null;
  faixas: FaixaPlaylist[];
  /** quantas faixas o streaming diz que a playlist tem (pode ser mais do que veio); null se não diz */
  total: number | null;
  /** o streaming entregou só uma parte (o Spotify, pelo link, para nas 100 primeiras) */
  parcial: boolean;
}

export type MotivoErroPlaylist =
  /** não é um link de playlist (faixa, álbum, perfil…) */
  | 'nao-e-playlist'
  /** link que não é de nenhum streaming aceito */
  | 'desconhecido'
  /** a playlist é privada, foi apagada ou o link está errado */
  | 'indisponivel'
  /** sem internet, tempo esgotado, o streaming recusou */
  | 'rede'
  /** a página do streaming mudou e o app não achou as faixas */
  | 'formato'
  | 'vazia';

export interface ErroPlaylist {
  motivo: MotivoErroPlaylist;
  servico: StreamingId | null;
  /** o detalhe técnico (vai para o log; a tela usa o texto do motivo) */
  detalhe?: string;
}

export type ResultadoBuscaPlaylist = { ok: true; playlist: PlaylistImportada } | { ok: false; erro: ErroPlaylist };

// ---------------------------------------------------------------- Faixa → linha da lista

const espacos = (s: string) => s.replace(/\s+/g, ' ').trim();

/** O que o YouTube põe no título de um vídeo e não faz parte do nome da faixa. */
const RE_LIXO_VIDEO =
  /\s*[([](?:official\s+)?(?:music\s+|lyrics?\s+|hd\s+|4k\s+)?(?:video|vídeo|audio|áudio|visuali[sz]er|lyrics?|letra|clipe|clip|videoclipe)(?:\s+oficial|\s+officiel|\s+official)?(?:\s+hd|\s+4k)?[)\]]/gi;
const RE_HD = /\s*[([](?:hd|hq|4k|explicit|clean)[)\]]/gi;
/** "(Remastered 2015)", "- Remasterizado": o lote não procura pela remasterização */
const RE_REMASTER =
  /\s*(?:[([][^()[\]]*\bremaster(?:ed|izad[oa])?\b[^()[\]]*[)\]]|\s-\s[^-]*\bremaster(?:ed|izad[oa])?\b.*$)/gi;
/** "Título - X Remix" (como o Spotify escreve) vira "Título (X Remix)", a mesma regra do baixar-lista.ps1 para CSV */
const RE_MIX_COM_TRACO = /\s+-\s+((?:[^-]*?)\b(?:Remix|Mix|Edit|Version|Rework|Dub|VIP|Bootleg)\b.*)$/i;

export function limparTitulo(titulo: string): string {
  let t = espacos(titulo.replace(/[\r\n\t]+/g, ' '));
  t = t.replace(RE_LIXO_VIDEO, '').replace(RE_HD, '').replace(RE_REMASTER, '');
  t = t.replace(RE_MIX_COM_TRACO, ' ($1)');
  return espacos(t);
}

/**
 * Vários artistas ("A, B", "A feat. B"): o primeiro basta para a busca (a mesma regra do CSV no script). O "&" fica:
 * é parte do nome de muita dupla ("Above & Beyond"), e os leitores já entregam o primeiro artista quando sabem separar.
 */
export function primeiroArtista(artistas: string): string {
  const a = espacos(artistas.replace(/[\r\n\t]+/g, ' ')).replace(/\s+-\s+Topic$/i, '');
  const primeiro = espacos(a.split(/\s*(?:,|;|\s(?:feat|ft)\.?\s)\s*/i)[0] ?? '');
  return primeiro || a;
}

/** A linha que vai para a lista. "#" no começo viraria comentário, então sai. */
export function linhaDaFaixa(f: Pick<FaixaPlaylist, 'artista' | 'titulo'>): string {
  const artista = primeiroArtista(f.artista).replace(/^#+\s*/, '');
  const titulo = limparTitulo(f.titulo);
  if (!artista) return titulo.replace(/^#+\s*/, '');
  return `${artista} - ${titulo}`;
}

/** Chave para achar repetidas: sem acento, caixa ou pontuação (a análise do script é a palavra final). */
export function chaveDaLinha(linha: string): string {
  return linha
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// ---------------------------------------------------------------- Revisão

export interface FaixaRevisada {
  /** 1, 2, 3… na ordem da playlist */
  n: number;
  artista: string;
  titulo: string;
  linha: string;
  /** n da primeira vez que a faixa aparece; null se não é repetida */
  duplicadaDe: number | null;
  video: boolean;
}

export interface Revisao {
  faixas: FaixaRevisada[];
  paraBaixar: number;
  duplicadas: number;
  videos: number;
}

export function revisarPlaylist(p: Pick<PlaylistImportada, 'faixas'>): Revisao {
  const vistas = new Map<string, number>();
  const faixas: FaixaRevisada[] = [];
  let duplicadas = 0;
  let videos = 0;
  p.faixas.forEach((f, i) => {
    const n = i + 1;
    const linha = linhaDaFaixa(f);
    const chave = chaveDaLinha(linha);
    const primeira = chave ? vistas.get(chave) : undefined;
    const video = f.video === true;
    if (primeira !== undefined) duplicadas++;
    else if (chave) vistas.set(chave, n);
    if (video) videos++;
    faixas.push({
      n,
      artista: primeiroArtista(f.artista),
      titulo: limparTitulo(f.titulo),
      linha,
      duplicadaDe: primeira ?? null,
      video,
    });
  });
  const paraBaixar = faixas.filter((f) => f.duplicadaDe === null && !f.video && f.linha).length;
  return { faixas, paraBaixar, duplicadas, videos };
}

// ---------------------------------------------------------------- A lista gerada e a primeira linha

export interface OrigemLista {
  servico: StreamingId;
  nome: string;
  url: string;
}

const SEP = ' · ';

/** `# Spotify · Hard Techno Sexta · https://open.spotify.com/playlist/…`: o lote ignora (começa com #). */
export function cabecalhoDaOrigem(o: OrigemLista): string {
  const nome = espacos(o.nome.replace(/·/g, '-')) || 'Playlist';
  return `# ${streamingPorId(o.servico).nome}${SEP}${nome}${SEP}${o.url}`;
}

/** Lê a primeira linha de uma lista importada; null se a lista não veio de uma playlist. */
export function lerOrigem(primeiraLinha: string): OrigemLista | null {
  const m = /^\uFEFF?#\s*(.+?)\s+·\s+(.*)\s+·\s+(https:\/\/\S+)\s*$/.exec(primeiraLinha);
  const [, nomeDoServico = '', nome = '', url = ''] = m ?? [];
  if (!m) return null;
  const s = STREAMINGS.find((x) => x.nome.toLowerCase() === nomeDoServico.toLowerCase());
  if (!s) return null;
  const link = reconhecerLink(url);
  if (link.tipo !== 'playlist' || link.servico !== s.id) return null;
  return { servico: s.id, nome, url: link.url };
}

export const origemDoTexto = (texto: string): OrigemLista | null => lerOrigem(texto.split('\n', 1)[0] ?? '');

/** A linha que vai para a lista; vídeo que não parece faixa entra comentado (o lote ignora, a pessoa decide). */
function linhaParaLista(f: FaixaRevisada): string {
  return f.video ? `# ${f.linha}` : f.linha;
}

/**
 * O texto da lista nova: a primeira linha guarda a origem (se a pessoa quer atualizar depois) e cada faixa vira uma
 * linha, na ordem da playlist. Repetidas entram também: a análise do lote as marca e pula.
 */
export function textoDaPlaylist(p: PlaylistImportada, o: { lembrar: boolean }): string {
  const linhas = revisarPlaylist(p)
    .faixas.filter((f) => f.linha)
    .map(linhaParaLista);
  const cabeca = o.lembrar ? [cabecalhoDaOrigem({ servico: p.servico, nome: p.nome, url: p.url })] : [];
  return `${[...cabeca, ...linhas].join('\n')}\n`;
}

/**
 * "Atualizar da playlist": as faixas da playlist que ainda não estão na lista entram no fim; nenhuma linha é apagada
 * nem mudada. Uma faixa conta como já presente se a lista tem a mesma linha, mesmo comentada ou editada só na caixa.
 */
export function mesclarPlaylist(texto: string, p: PlaylistImportada): { texto: string; novas: number } {
  const presentes = new Set(
    texto
      .split('\n')
      .map((l) => chaveDaLinha(l.replace(/^\s*#\s*/, '')))
      .filter(Boolean),
  );
  const novas: string[] = [];
  for (const f of revisarPlaylist(p).faixas) {
    const chave = chaveDaLinha(f.linha);
    if (!chave || presentes.has(chave)) continue;
    presentes.add(chave);
    novas.push(linhaParaLista(f));
  }
  if (novas.length === 0) return { texto, novas: 0 };
  const base = texto.replace(/\n*$/, '');
  return { texto: `${base}${base ? '\n' : ''}${novas.join('\n')}\n`, novas: novas.length };
}

/** "Hard Techno Sexta" → "hard-techno-sexta" (o diálogo acrescenta o .txt). */
export function nomeDeArquivoDaPlaylist(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return base || 'playlist';
}

/** "2 h 6 min", "38 min" */
export function duracaoDaPlaylist(faixas: readonly Pick<FaixaPlaylist, 'duracaoMs'>[]): string | null {
  if (faixas.length === 0 || faixas.some((f) => f.duracaoMs === null)) return null;
  const min = Math.round(faixas.reduce((s, f) => s + (f.duracaoMs ?? 0), 0) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
