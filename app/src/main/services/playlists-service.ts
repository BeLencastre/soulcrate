// PlaylistsService: busca uma playlist pública de streaming pelo link e devolve as faixas (protótipos
// "importacao-playlist"). Só caminhos gratuitos e sem conta: a API pública do Deezer e as páginas públicas do Spotify
// (o player incorporado), da Apple Music e do YouTube Music. Nada aqui grava arquivo: o renderer monta a lista e a
// cria pelo ListasService. O renderer nunca escolhe para onde o app se conecta: o endereço é montado aqui a partir
// do id que o reconhecimento do link extraiu.
import {
  reconhecerLink,
  type ErroPlaylist,
  type FaixaPlaylist,
  type MotivoErroPlaylist,
  type PlaylistImportada,
  type ResultadoBuscaPlaylist,
  type StreamingId,
} from '@shared/playlists';

const TIMEOUT_MS = 20_000;
const LIMITE_RESPOSTA = 20_000_000;
const MAX_PAGINAS = 60;
const MAX_REDIRECIONAMENTOS = 5;
/** o Spotify entrega no máximo isto pelo player incorporado */
const LIMITE_SPOTIFY_LINK = 100;
const NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const VERSAO_YTMUSIC = '1.20251001.01.00';

/** Os CDNs de capa de cada streaming: outra origem não vira <img> na tela. */
const HOSTS_DE_CAPA = [
  'scdn.co',
  'spotifycdn.com',
  'mzstatic.com',
  'ytimg.com',
  'googleusercontent.com',
  'ggpht.com',
  'dzcdn.net',
];
/** Para onde um link curto pode redirecionar. */
const HOSTS_DE_REDIRECIONAMENTO = [
  'spotify.link',
  'spotify.app.link',
  'open.spotify.com',
  'link.deezer.com',
  'deezer.page.link',
  'deezer.com',
  'www.deezer.com',
];

export type Buscador = (url: string, init?: RequestInit) => Promise<Response>;

export interface DepsPlaylists {
  buscar: Buscador;
  /** registra no log do app o detalhe de uma falha (a tela mostra só o motivo) */
  aoFalhar?(servico: StreamingId | null, detalhe: string): void;
}

export class FalhaPlaylist extends Error {
  constructor(
    readonly motivo: MotivoErroPlaylist,
    detalhe: string,
  ) {
    super(detalhe);
    this.name = 'FalhaPlaylist';
  }
}

interface Resposta {
  status: number;
  corpo: string;
}

export class PlaylistsService {
  constructor(private readonly d: DepsPlaylists) {}

  async buscar(link: string): Promise<ResultadoBuscaPlaylist> {
    let r = reconhecerLink(link);
    let servico: StreamingId | null = 'servico' in r ? r.servico : null;
    try {
      if (r.tipo === 'curto') r = await this.resolverCurto(r.url);
      servico = 'servico' in r ? r.servico : servico;
      if (r.tipo === 'outro') return this.erro({ motivo: 'nao-e-playlist', servico: r.servico });
      if (r.tipo !== 'playlist') {
        return this.erro({ motivo: 'desconhecido', servico: null });
      }
      const p = await this.porServico(r.servico, r.id, r.url);
      if (p.faixas.length === 0) return this.erro({ motivo: 'vazia', servico: r.servico });
      return { ok: true, playlist: p };
    } catch (e) {
      if (e instanceof FalhaPlaylist) return this.erro({ motivo: e.motivo, servico, detalhe: e.message });
      const detalhe = e instanceof Error ? e.message : String(e);
      return this.erro({ motivo: 'formato', servico, detalhe });
    }
  }

  private erro(erro: ErroPlaylist): ResultadoBuscaPlaylist {
    if (erro.detalhe) this.d.aoFalhar?.(erro.servico, `${erro.motivo}: ${erro.detalhe}`);
    return { ok: false, erro };
  }

  private porServico(servico: StreamingId, id: string, url: string): Promise<PlaylistImportada> {
    switch (servico) {
      case 'spotify':
        return this.spotify(id, url);
      case 'apple':
        return this.apple(id, url);
      case 'youtube':
        return this.youtube(id, url);
      case 'deezer':
        return this.deezer(id, url);
    }
  }

  // ------------------------------------------------------------ rede

  private async pedir(url: string, init: RequestInit = {}): Promise<Resposta & { resposta: Response }> {
    let resposta: Response;
    try {
      resposta = await this.d.buscar(url, {
        ...init,
        headers: { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8', ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new FalhaPlaylist('rede', `${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const corpo = await resposta.text();
    if (corpo.length > LIMITE_RESPOSTA) throw new FalhaPlaylist('formato', `${url}: resposta grande demais`);
    return { status: resposta.status, corpo, resposta };
  }

  private async pagina(url: string): Promise<string> {
    const r = await this.pedir(url);
    if (r.status === 404 || r.status === 410) throw new FalhaPlaylist('indisponivel', `${url}: HTTP ${r.status}`);
    if (r.status >= 400) throw new FalhaPlaylist('rede', `${url}: HTTP ${r.status}`);
    return r.corpo;
  }

  private async json(url: string, init?: RequestInit): Promise<unknown> {
    const r = await this.pedir(url, init);
    if (r.status === 404) throw new FalhaPlaylist('indisponivel', `${url}: HTTP 404`);
    if (r.status >= 400) throw new FalhaPlaylist('rede', `${url}: HTTP ${r.status}`);
    try {
      return JSON.parse(r.corpo) as unknown;
    } catch {
      throw new FalhaPlaylist('formato', `${url}: resposta não é JSON`);
    }
  }

  /** spotify.link / link.deezer.com: segue os redirecionamentos (só para hosts dos streamings) até o link de verdade. */
  private async resolverCurto(inicio: string): Promise<ReturnType<typeof reconhecerLink>> {
    let url = inicio;
    for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i++) {
      const r = await this.pedir(url, { redirect: 'manual' });
      const destino = r.resposta.headers.get('location');
      if (r.status >= 300 && r.status < 400 && destino) {
        const proximo = new URL(destino, url);
        const reconhecido = reconhecerLink(proximo.href);
        if (reconhecido.tipo === 'playlist' || reconhecido.tipo === 'outro') return reconhecido;
        if (proximo.protocol !== 'https:' || !HOSTS_DE_REDIRECIONAMENTO.includes(proximo.hostname.toLowerCase())) {
          throw new FalhaPlaylist('nao-e-playlist', `link curto levou a ${proximo.hostname}`);
        }
        url = proximo.href;
        continue;
      }
      if (r.status >= 400) throw new FalhaPlaylist('indisponivel', `${url}: HTTP ${r.status}`);
      // página intermediária (o link curto abre uma página que manda para o app): o link de verdade está nela
      const achado =
        /https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/[A-Za-z0-9]{22}/.exec(r.corpo) ??
        /https:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?playlist\/\d+/.exec(r.corpo);
      if (achado) return reconhecerLink(achado[0]);
      throw new FalhaPlaylist('nao-e-playlist', 'o link curto não leva a uma playlist');
    }
    throw new FalhaPlaylist('rede', 'redirecionamentos demais');
  }

  // ------------------------------------------------------------ Spotify (player incorporado)

  private async spotify(id: string, url: string): Promise<PlaylistImportada> {
    const html = await this.pagina(`https://open.spotify.com/embed/playlist/${id}`);
    const dados = jsonDoScript(html, /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    const props = obj(obj(dados).props).pageProps;
    if (num(obj(props).status) === 404) throw new FalhaPlaylist('indisponivel', 'Spotify: página não encontrada');
    const entidade = obj(obj(obj(obj(props).state).data).entity);
    const lista = arr(entidade.trackList);
    if (!entidade.name && !entidade.title && lista.length === 0) {
      throw new FalhaPlaylist('indisponivel', 'Spotify: a página não trouxe a playlist');
    }
    const faixas: FaixaPlaylist[] = [];
    for (const t of lista) {
      const o = obj(t);
      const titulo = str(o.title);
      if (!titulo || (o.entityType !== undefined && o.entityType !== 'track')) continue;
      faixas.push({ artista: str(o.subtitle), titulo, duracaoMs: num(o.duration) });
    }
    const capas = arr(obj(entidade.coverArt).sources).map((s) => str(obj(s).url));
    return {
      servico: 'spotify',
      id,
      url,
      nome: str(entidade.name) || str(entidade.title) || 'Playlist do Spotify',
      autor: str(entidade.subtitle) || null,
      capa: capaSegura(capas[0]),
      faixas,
      total: null,
      parcial: lista.length >= LIMITE_SPOTIFY_LINK,
    };
  }

  // ------------------------------------------------------------ Apple Music (página pública)

  private async apple(id: string, url: string): Promise<PlaylistImportada> {
    const html = await this.pagina(url);
    const dados = jsonDoScript(
      html,
      /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/,
    );
    const secoes = acharTodos(dados, (o) => typeof o.itemKind === 'string' && Array.isArray(o.items));
    const cabecalho = obj(arr(secoes.find((s) => s.itemKind === 'containerDetailHeaderLockup')?.items)[0]);
    const faixas: FaixaPlaylist[] = [];
    for (const s of secoes.filter((x) => x.itemKind === 'trackLockup')) {
      for (const t of arr(s.items)) {
        const o = obj(t);
        const titulo = str(o.title);
        if (!titulo) continue;
        const artistas = arr(o.subtitleLinks).map((l) => str(obj(l).title));
        faixas.push({ artista: artistas[0] || str(o.artistName), titulo, duracaoMs: num(o.duration) });
      }
    }
    if (!cabecalho.title && faixas.length === 0) {
      throw new FalhaPlaylist('indisponivel', 'Apple Music: a página não trouxe a playlist');
    }
    const total = num(cabecalho.trackCount) ?? numFaixasDoLd(html);
    const arte = str(obj(obj(cabecalho.artwork).dictionary).url);
    return {
      servico: 'apple',
      id,
      url,
      nome: str(cabecalho.title) || 'Playlist da Apple Music',
      autor: str(obj(arr(cabecalho.subtitleLinks)[0]).title) || null,
      capa: capaSegura(arte.replace('{w}x{h}', '300x300').replace('{f}', 'jpg')),
      faixas,
      total,
      parcial: total !== null && total > faixas.length,
    };
  }

  // ------------------------------------------------------------ YouTube Music (a API do próprio site)

  private async youtube(id: string, url: string): Promise<PlaylistImportada> {
    const contexto = { client: { clientName: 'WEB_REMIX', clientVersion: VERSAO_YTMUSIC, hl: 'pt', gl: 'BR' } };
    const pedirBrowse = (corpo: Record<string, unknown>) =>
      this.json('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://music.youtube.com' },
        body: JSON.stringify({ context: contexto, ...corpo }),
      });

    const primeira = obj(await pedirBrowse({ browseId: `VL${id}` }));
    if (!primeira.contents) throw new FalhaPlaylist('indisponivel', 'YouTube Music: a playlist não abriu');
    const prateleira = acharTodos(primeira, (o) => 'musicPlaylistShelfRenderer' in o)[0]?.musicPlaylistShelfRenderer;
    const cabecalho =
      acharTodos(primeira, (o) => 'musicResponsiveHeaderRenderer' in o || 'musicDetailHeaderRenderer' in o).map((o) =>
        obj(o.musicResponsiveHeaderRenderer ?? o.musicDetailHeaderRenderer),
      )[0] ?? {};

    const faixas: FaixaPlaylist[] = [];
    let itens = itensDoYoutube(prateleira);
    let token = tokenDeContinuacao(prateleira);
    faixas.push(...itens);
    for (let pagina = 1; token && pagina < MAX_PAGINAS; pagina++) {
      const seguinte = await pedirBrowse({ continuation: token });
      itens = itensDoYoutube(seguinte);
      if (itens.length === 0) break;
      faixas.push(...itens);
      token = tokenDeContinuacao(seguinte);
    }

    const nome = textoDeRuns(cabecalho.title);
    if (!nome && faixas.length === 0)
      throw new FalhaPlaylist('indisponivel', 'YouTube Music: playlist vazia ou privada');
    // o dono vem no "strapline" ou na pilha de avatares; o "subtitle" só diz o tipo ("Playlist • 2026")
    const autor =
      textoDeRuns(cabecalho.straplineTextOne) ||
      str(acharTodos(cabecalho.facepile, (o) => typeof o.content === 'string')[0]?.content) ||
      null;
    // "1 bi de visualizações • 182 itens • Mais de 13 horas", "100 músicas • 6 horas e 29 minutos"
    const total = /(\d[\d.,]*)\s+(?:itens|músicas|faixas|vídeos|episódios|items|songs|tracks|videos|episodes)\b/i.exec(
      textoDeRuns(cabecalho.secondSubtitle),
    );
    const nTotal = total ? Number((total[1] ?? '').replace(/[.,]/g, '')) : null;
    const miniaturas = acharTodos(cabecalho.thumbnail, (o) => Array.isArray(o.thumbnails))[0]?.thumbnails;
    const capa = arr(miniaturas)
      .map((t) => str(obj(t).url))
      .at(-1);
    return {
      servico: 'youtube',
      id,
      url,
      nome: nome || 'Playlist do YouTube Music',
      autor,
      capa: capaSegura(capa),
      faixas,
      total: nTotal,
      parcial: nTotal !== null && nTotal > faixas.length,
    };
  }

  // ------------------------------------------------------------ Deezer (API pública, sem chave)

  private async deezer(id: string, url: string): Promise<PlaylistImportada> {
    const base = `https://api.deezer.com/playlist/${id}`;
    const p = obj(await this.json(base));
    erroDoDeezer(p);
    const faixas: FaixaPlaylist[] = [];
    let proxima: string | null = `${base}/tracks?index=0&limit=100`;
    for (let pagina = 0; proxima && pagina < MAX_PAGINAS * 2; pagina++) {
      const r = obj(await this.json(proxima));
      erroDoDeezer(r);
      for (const t of arr(r.data)) {
        const o = obj(t);
        const titulo = str(o.title);
        if (!titulo) continue;
        const segundos = num(o.duration);
        faixas.push({
          artista: str(obj(o.artist).name),
          titulo,
          duracaoMs: segundos === null ? null : segundos * 1000,
        });
      }
      const n = str(r.next);
      // só segue a paginação da própria API
      proxima = n.startsWith(`${base}/tracks?`) ? n : null;
    }
    const total = num(p.nb_tracks);
    return {
      servico: 'deezer',
      id,
      url,
      nome: str(p.title) || 'Playlist do Deezer',
      autor: str(obj(p.creator).name) || null,
      capa: capaSegura(str(p.picture_medium)),
      faixas,
      total,
      parcial: total !== null && total > faixas.length,
    };
  }
}

// ---------------------------------------------------------------- leitura defensiva do JSON dos streamings

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Todos os objetos (em profundidade) que satisfazem `pred`, sem descer dentro dos achados. */
export function acharTodos(raiz: unknown, pred: (o: Obj) => boolean, limite = 100_000): Obj[] {
  const achados: Obj[] = [];
  const pilha: unknown[] = [raiz];
  let visitados = 0;
  while (pilha.length > 0 && visitados++ < limite) {
    const v = pilha.pop();
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) pilha.push(v[i]);
    } else if (v && typeof v === 'object') {
      const o = v as Obj;
      if (pred(o)) {
        achados.push(o);
        continue;
      }
      const chaves = Object.keys(o);
      for (let i = chaves.length - 1; i >= 0; i--) pilha.push(o[chaves[i] ?? '']);
    }
  }
  return achados;
}

function jsonDoScript(html: string, re: RegExp): unknown {
  const m = re.exec(html);
  if (!m) throw new FalhaPlaylist('formato', 'a página não trouxe os dados da playlist');
  try {
    return JSON.parse(m[1] ?? '') as unknown;
  } catch {
    throw new FalhaPlaylist('formato', 'os dados da página não são JSON');
  }
}

function numFaixasDoLd(html: string): number | null {
  const m = /<script id=["']?schema:music-playlist["']? type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    return num(obj(JSON.parse(m[1] ?? '')).numTracks);
  } catch {
    return null;
  }
}

export function capaSegura(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    return HOSTS_DE_CAPA.some((h) => host === h || host.endsWith(`.${h}`)) ? u.href : null;
  } catch {
    return null;
  }
}

function erroDoDeezer(o: Obj): void {
  const e = obj(o.error);
  if (!o.error) return;
  const codigo = num(e.code);
  // 800: "no data" (playlist privada, apagada ou id errado); 4: cota de pedidos
  if (codigo === 800) throw new FalhaPlaylist('indisponivel', `Deezer: ${str(e.message) || 'sem dados'}`);
  throw new FalhaPlaylist('rede', `Deezer ${String(codigo)}: ${str(e.message)}`);
}

const textoDeRuns = (v: unknown): string =>
  arr(obj(v).runs)
    .map((r) => (typeof obj(r).text === 'string' ? (obj(r).text as string) : ''))
    .join('')
    .trim();

/** "4:01" ou "1:02:03" → ms */
function duracaoDoTexto(t: string): number | null {
  if (!/^\d+(?::\d{1,2}){1,2}$/.test(t)) return null;
  return t.split(':').reduce((s, p) => s * 60 + Number(p), 0) * 1000;
}

function tokenDeContinuacao(raiz: unknown): string | null {
  const achado = acharTodos(raiz, (o) => 'continuationCommand' in o || 'nextContinuationData' in o)[0];
  if (!achado) return null;
  return str(obj(achado.continuationCommand).token) || str(obj(achado.nextContinuationData).continuation) || null;
}

const tipoDePagina = (run: unknown): string =>
  str(
    obj(
      obj(obj(obj(obj(run).navigationEndpoint).browseEndpoint).browseEndpointContextSupportedConfigs)
        .browseEndpointContextMusicConfig,
    ).pageType,
  );
const ehPaginaDeArtista = (run: unknown): boolean => tipoDePagina(run) === 'MUSIC_PAGE_TYPE_ARTIST';

/** As faixas de uma página da playlist do YouTube Music (musicResponsiveListItemRenderer). */
export function itensDoYoutube(raiz: unknown): FaixaPlaylist[] {
  const faixas: FaixaPlaylist[] = [];
  for (const item of acharTodos(raiz, (o) => 'musicResponsiveListItemRenderer' in o)) {
    const r = obj(item.musicResponsiveListItemRenderer);
    const colunas = arr(r.flexColumns).map((c) =>
      arr(obj(obj(obj(c).musicResponsiveListItemFlexColumnRenderer).text).runs),
    );
    const titulo = str(obj(colunas[0]?.[0]).text);
    if (!titulo) continue; // vídeo apagado ou indisponível
    const runs = colunas[1] ?? [];
    const artistas = runs.filter((x) => {
      const tipo = tipoDePagina(x);
      return tipo === 'MUSIC_PAGE_TYPE_ARTIST' || tipo === 'MUSIC_PAGE_TYPE_USER_CHANNEL';
    });
    const artista = str(obj(artistas[0] ?? runs[0]).text);
    const tipoDoVideo = str(acharTodos(r, (o) => typeof o.musicVideoType === 'string')[0]?.musicVideoType);
    const duracao = duracaoDoTexto(
      str(obj(arr(obj(obj(obj(arr(r.fixedColumns)[0]).musicResponsiveListItemFixedColumnRenderer).text).runs)[0]).text),
    );
    // envio de usuário ou episódio sem página de artista: só é faixa se o título já vem como "Artista - Título"
    // (o YouTube rotula até músicas como "episódio"; o que decide é ter um artista reconhecido)
    const suspeito =
      (tipoDoVideo === 'MUSIC_VIDEO_TYPE_UGC' || tipoDoVideo === 'MUSIC_VIDEO_TYPE_PODCAST_EPISODE') &&
      !artistas.some(ehPaginaDeArtista);
    if (suspeito) {
      const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(titulo);
      if (m) faixas.push({ artista: m[1] ?? '', titulo: m[2] ?? titulo, duracaoMs: duracao });
      else faixas.push({ artista, titulo, duracaoMs: duracao, video: true });
    } else {
      faixas.push({ artista, titulo, duracaoMs: duracao });
    }
  }
  return faixas;
}
