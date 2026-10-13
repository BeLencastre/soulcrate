// Os leitores de playlist com respostas no formato real de cada streaming (recortadas do que os sites devolvem).
import { describe, expect, it } from 'vitest';
import { acharTodos, capaSegura, itensDoYoutube, PlaylistsService } from '../../src/main/services/playlists-service';

const ID_SP = '37i9dQZF1DXcBWIGoYBM5M';

type Rota = (url: string, init?: RequestInit) => Response | Promise<Response>;

function servico(rotas: Record<string, Rota>) {
  const pedidos: { url: string; init?: RequestInit | undefined }[] = [];
  const falhas: string[] = [];
  const svc = new PlaylistsService({
    buscar: async (url, init) => {
      pedidos.push({ url, init });
      const rota = Object.entries(rotas).find(([k]) => url.startsWith(k))?.[1];
      if (!rota) return new Response('não encontrado', { status: 404 });
      return rota(url, init);
    },
    aoFalhar: (s, d) => falhas.push(`${s}: ${d}`),
  });
  return { svc, pedidos, falhas };
}

const html = (corpo: string, status = 200) =>
  new Response(`<!doctype html><html><body>${corpo}</body></html>`, {
    status,
    headers: { 'content-type': 'text/html' },
  });
const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });

// ---------------------------------------------------------------- Spotify

function paginaSpotify(entity: unknown, status?: number) {
  const dados = { props: { pageProps: { ...(status ? { status } : {}), state: { data: { entity } } } } };
  return html(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(dados)}</script>`);
}

describe('Spotify (player incorporado)', () => {
  it('lê nome, dono, capa e faixas', async () => {
    const { svc, pedidos } = servico({
      'https://open.spotify.com/embed/playlist/': () =>
        paginaSpotify({
          name: 'Hard Techno Sexta',
          subtitle: 'belen',
          coverArt: { sources: [{ url: 'https://i.scdn.co/image/abc' }] },
          trackList: [
            { title: 'No Escape', subtitle: 'Azyr', duration: 200_000, entityType: 'track' },
            { title: 'Push Up - Original Mix', subtitle: 'Creeds, Outro', duration: 300_000, entityType: 'track' },
            { title: 'Um episódio', subtitle: 'Podcast', duration: 1, entityType: 'episode' },
          ],
        }),
    });
    const r = await svc.buscar(`https://open.spotify.com/intl-pt/playlist/${ID_SP}?si=x`);
    expect(pedidos[0]?.url).toBe(`https://open.spotify.com/embed/playlist/${ID_SP}`);
    expect(r).toEqual({
      ok: true,
      playlist: {
        servico: 'spotify',
        id: ID_SP,
        url: `https://open.spotify.com/playlist/${ID_SP}`,
        nome: 'Hard Techno Sexta',
        autor: 'belen',
        capa: 'https://i.scdn.co/image/abc',
        faixas: [
          { artista: 'Azyr', titulo: 'No Escape', duracaoMs: 200_000 },
          { artista: 'Creeds, Outro', titulo: 'Push Up - Original Mix', duracaoMs: 300_000 },
        ],
        total: null,
        parcial: false,
      },
    });
  });

  it('100 faixas: o link pode ter cortado o resto', async () => {
    const trackList = Array.from({ length: 100 }, (_, i) => ({ title: `T${i}`, subtitle: 'A', duration: 1 }));
    const { svc } = servico({
      'https://open.spotify.com/embed/': () => paginaSpotify({ name: 'Grande', trackList }),
    });
    const r = await svc.buscar(`https://open.spotify.com/playlist/${ID_SP}`);
    expect(r.ok && r.playlist.parcial).toBe(true);
  });

  it('página de "não encontrado" (privada ou apagada)', async () => {
    const { svc, falhas } = servico({
      'https://open.spotify.com/embed/': () =>
        html(
          `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { status: 404 } } })}</script>`,
        ),
    });
    expect(await svc.buscar(`https://open.spotify.com/playlist/${ID_SP}`)).toMatchObject({
      ok: false,
      erro: { motivo: 'indisponivel', servico: 'spotify' },
    });
    expect(falhas[0]).toMatch(/spotify: indisponivel/);
  });

  it('página sem os dados (o site mudou)', async () => {
    const { svc } = servico({ 'https://open.spotify.com/embed/': () => html('<div>nada</div>') });
    expect(await svc.buscar(`https://open.spotify.com/playlist/${ID_SP}`)).toMatchObject({
      ok: false,
      erro: { motivo: 'formato' },
    });
  });
});

// ---------------------------------------------------------------- Apple Music

function paginaApple(secoes: unknown[], numTracks?: number) {
  const dados = { data: [{ intent: {}, data: { sections: secoes } }] };
  const ld = numTracks
    ? `<script id=schema:music-playlist type="application/ld+json">${JSON.stringify({ numTracks })}</script>`
    : '';
  return html(`${ld}<script type="application/json" id="serialized-server-data">${JSON.stringify(dados)}</script>`);
}

describe('Apple Music (página pública)', () => {
  const cabecalho = (extra: object = {}) => ({
    id: 'header',
    itemKind: 'containerDetailHeaderLockup',
    items: [
      {
        title: 'Hits do momento',
        subtitleLinks: [{ title: 'Apple Music Hits' }],
        artwork: { dictionary: { url: 'https://is1-ssl.mzstatic.com/image/thumb/x/{w}x{h}bb.{f}' } },
        ...extra,
      },
    ],
  });
  const faixas = {
    id: 'track-list',
    itemKind: 'trackLockup',
    items: [
      { title: 'Solar Eclipse', subtitleLinks: [{ title: 'Drake' }, { title: 'Don Toliver' }], duration: 181_270 },
      { title: 'Sem links', artistName: 'ADÉLA', duration: 1000 },
    ],
  };

  it('lê cabeçalho e faixas; o primeiro artista vem do primeiro link', async () => {
    const { svc, pedidos } = servico({
      'https://music.apple.com/br/playlist/': () => paginaApple([cabecalho({ trackCount: 2 }), faixas]),
    });
    const r = await svc.buscar('https://music.apple.com/br/playlist/hits/pl.f4d106fed2bd41149aaacabb233eb5eb');
    expect(pedidos[0]?.url).toBe('https://music.apple.com/br/playlist/pl.f4d106fed2bd41149aaacabb233eb5eb');
    expect(r).toMatchObject({
      ok: true,
      playlist: {
        nome: 'Hits do momento',
        autor: 'Apple Music Hits',
        capa: 'https://is1-ssl.mzstatic.com/image/thumb/x/300x300bb.jpg',
        faixas: [
          { artista: 'Drake', titulo: 'Solar Eclipse', duracaoMs: 181_270 },
          { artista: 'ADÉLA', titulo: 'Sem links', duracaoMs: 1000 },
        ],
        total: 2,
        parcial: false,
      },
    });
  });

  it('a página trouxe menos faixas do que a playlist tem: parcial (total do JSON-LD)', async () => {
    const { svc } = servico({ 'https://music.apple.com/': () => paginaApple([cabecalho(), faixas], 250) });
    const r = await svc.buscar('https://music.apple.com/us/playlist/pl.abcdef1234');
    expect(r).toMatchObject({ ok: true, playlist: { total: 250, parcial: true } });
  });

  it('404 é playlist indisponível', async () => {
    const { svc } = servico({ 'https://music.apple.com/': () => html('', 404) });
    expect(await svc.buscar('https://music.apple.com/us/playlist/pl.abcdef1234')).toMatchObject({
      ok: false,
      erro: { motivo: 'indisponivel', servico: 'apple' },
    });
  });
});

// ---------------------------------------------------------------- YouTube Music

const run = (text: string, pageType?: string) =>
  pageType
    ? {
        text,
        navigationEndpoint: {
          browseEndpoint: {
            browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } },
          },
        },
      }
    : { text };

function itemYt(titulo: string, artistas: object[], tipo = 'MUSIC_VIDEO_TYPE_ATV', duracao = '4:01') {
  return {
    musicResponsiveListItemRenderer: {
      overlay: { watchEndpointMusicConfig: { musicVideoType: tipo } },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [run(titulo)] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: artistas } } },
      ],
      fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: duracao }] } } }],
    },
  };
}

describe('YouTube Music (API do site)', () => {
  const primeira = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicResponsiveHeaderRenderer: {
                        title: { runs: [{ text: 'Videoclipes famosos' }] },
                        subtitle: { runs: [{ text: 'Playlist' }, { text: ' • ' }, { text: '2026' }] },
                        secondSubtitle: { runs: [{ text: '1 bi de visualizações • 3 itens • 13 horas' }] },
                        facepile: { avatarStackViewModel: { text: { content: 'belen' } } },
                        thumbnail: {
                          musicThumbnailRenderer: {
                            thumbnail: { thumbnails: [{ url: 'https://yt3.googleusercontent.com/a=s192' }] },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
        secondaryContents: {
          sectionListRenderer: {
            contents: [
              {
                musicPlaylistShelfRenderer: {
                  contents: [
                    itemYt('Dai Dai', [
                      run('Shakira', 'MUSIC_PAGE_TYPE_ARTIST'),
                      run(' & '),
                      run('Burna Boy', 'MUSIC_PAGE_TYPE_ARTIST'),
                    ]),
                    {
                      continuationItemRenderer: {
                        continuationEndpoint: { continuationCommand: { token: 'PAGINA2' } },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
  const segunda = {
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            // envio de usuário sem artista, mas com "Artista - Título" no nome: é faixa
            itemYt(
              'Vendex - Abaddon (Official Video)',
              [run('Canal qualquer', 'MUSIC_PAGE_TYPE_USER_CHANNEL')],
              'MUSIC_VIDEO_TYPE_UGC',
            ),
            // envio de usuário sem artista e sem traço: vídeo
            itemYt('meu vlog', [run('Canal qualquer', 'MUSIC_PAGE_TYPE_USER_CHANNEL')], 'MUSIC_VIDEO_TYPE_UGC'),
            // o YouTube rotula até música como "episódio": com página de artista, é faixa
            itemYt(
              'Banjaara',
              [run('Mohammed Irfan', 'MUSIC_PAGE_TYPE_ARTIST')],
              'MUSIC_VIDEO_TYPE_PODCAST_EPISODE',
              '5:34',
            ),
          ],
        },
      },
    ],
  };

  it('lê o cabeçalho e segue a paginação', async () => {
    const corpos: unknown[] = [];
    const { svc, pedidos } = servico({
      'https://music.youtube.com/youtubei/v1/browse': (_url, init) => {
        const corpo = JSON.parse(String(init?.body)) as { continuation?: string };
        corpos.push(corpo);
        return json(corpo.continuation === 'PAGINA2' ? segunda : primeira);
      },
    });
    const r = await svc.buscar('https://www.youtube.com/watch?v=x&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI');
    expect(pedidos).toHaveLength(2);
    expect(corpos[0]).toMatchObject({ browseId: 'VLPLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' });
    expect(r).toMatchObject({
      ok: true,
      playlist: {
        servico: 'youtube',
        url: 'https://music.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
        nome: 'Videoclipes famosos',
        autor: 'belen',
        capa: 'https://yt3.googleusercontent.com/a=s192',
        total: 3,
        faixas: [
          { artista: 'Shakira', titulo: 'Dai Dai', duracaoMs: 241_000 },
          { artista: 'Vendex', titulo: 'Abaddon (Official Video)', duracaoMs: 241_000 },
          { artista: 'Canal qualquer', titulo: 'meu vlog', duracaoMs: 241_000, video: true },
          { artista: 'Mohammed Irfan', titulo: 'Banjaara', duracaoMs: 334_000 },
        ],
      },
    });
  });

  it('resposta sem conteúdo: playlist privada ou inexistente', async () => {
    const { svc } = servico({ 'https://music.youtube.com/': () => json({ responseContext: {} }) });
    expect(await svc.buscar('https://music.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx')).toMatchObject({
      ok: false,
      erro: { motivo: 'indisponivel', servico: 'youtube' },
    });
  });

  it('itensDoYoutube pula vídeo apagado (sem título)', () => {
    expect(itensDoYoutube({ a: [itemYt('', [run('X')])] })).toEqual([]);
  });
});

// ---------------------------------------------------------------- Deezer

describe('Deezer (API pública)', () => {
  it('lê a playlist e pagina as faixas só pela própria API', async () => {
    const base = 'https://api.deezer.com/playlist/908622995';
    const { svc, pedidos } = servico({
      [`${base}/tracks?index=0`]: () =>
        json({
          data: [{ title: 'Hey Jude (Remastered 2015)', artist: { name: 'The Beatles' }, duration: 429 }],
          next: `${base}/tracks?limit=100&index=100`,
        }),
      [`${base}/tracks?limit=100&index=100`]: () =>
        json({
          data: [{ title: 'Stand By Me', artist: { name: 'Ben E. King' }, duration: 180 }],
          next: 'https://outro.site/roubar',
        }),
      [base]: () =>
        json({
          title: 'En mode 60',
          nb_tracks: 2,
          creator: { name: 'Alexandre' },
          picture_medium: 'https://cdn-images.dzcdn.net/images/playlist/x/250x250.jpg',
        }),
    });
    const r = await svc.buscar('https://www.deezer.com/br/playlist/908622995');
    expect(pedidos.map((p) => p.url)).toEqual([
      base,
      `${base}/tracks?index=0&limit=100`,
      `${base}/tracks?limit=100&index=100`,
    ]);
    expect(r).toMatchObject({
      ok: true,
      playlist: {
        nome: 'En mode 60',
        autor: 'Alexandre',
        capa: 'https://cdn-images.dzcdn.net/images/playlist/x/250x250.jpg',
        faixas: [
          { artista: 'The Beatles', titulo: 'Hey Jude (Remastered 2015)', duracaoMs: 429_000 },
          { artista: 'Ben E. King', titulo: 'Stand By Me', duracaoMs: 180_000 },
        ],
        total: 2,
        parcial: false,
      },
    });
  });

  it('código 800 é privada/apagada; outro erro da API é "rede"', async () => {
    const um = servico({ 'https://api.deezer.com/': () => json({ error: { type: 'DataException', code: 800 } }) });
    expect(await um.svc.buscar('https://www.deezer.com/playlist/1')).toMatchObject({
      ok: false,
      erro: { motivo: 'indisponivel' },
    });
    const dois = servico({
      'https://api.deezer.com/': () => json({ error: { type: 'Exception', code: 4, message: 'Quota' } }),
    });
    expect(await dois.svc.buscar('https://www.deezer.com/playlist/1')).toMatchObject({
      ok: false,
      erro: { motivo: 'rede' },
    });
  });

  it('playlist sem faixas', async () => {
    const { svc } = servico({
      'https://api.deezer.com/playlist/5/tracks': () => json({ data: [] }),
      'https://api.deezer.com/playlist/5': () => json({ title: 'Vazia', nb_tracks: 0 }),
    });
    expect(await svc.buscar('https://www.deezer.com/playlist/5')).toMatchObject({
      ok: false,
      erro: { motivo: 'vazia' },
    });
  });
});

// ---------------------------------------------------------------- Links, rede e segurança

describe('links e rede', () => {
  it('link de faixa ou de outro site não sai do app', async () => {
    const { svc, pedidos } = servico({});
    expect(await svc.buscar('https://open.spotify.com/track/3zOYmiNOuyDL0ClxJcEJ0T')).toEqual({
      ok: false,
      erro: { motivo: 'nao-e-playlist', servico: 'spotify' },
    });
    expect(await svc.buscar('https://music.amazon.com/playlists/B07H8NDFTJ')).toEqual({
      ok: false,
      erro: { motivo: 'desconhecido', servico: null },
    });
    expect(await svc.buscar('https://exemplo.com/playlist/1')).toMatchObject({
      ok: false,
      erro: { motivo: 'desconhecido' },
    });
    expect(pedidos).toHaveLength(0);
  });

  it('link curto: segue o redirecionamento até a playlist', async () => {
    const { svc, pedidos } = servico({
      'https://link.deezer.com/s/30abc': () =>
        new Response(null, { status: 302, headers: { location: 'https://www.deezer.com/br/playlist/7?host=1' } }),
      'https://api.deezer.com/playlist/7/tracks': () =>
        json({ data: [{ title: 'T', artist: { name: 'A' }, duration: 1 }] }),
      'https://api.deezer.com/playlist/7': () => json({ title: 'Curta' }),
    });
    const r = await svc.buscar('https://link.deezer.com/s/30abc');
    expect(pedidos[0]?.init?.redirect).toBe('manual');
    expect(r).toMatchObject({ ok: true, playlist: { id: '7', nome: 'Curta' } });
  });

  it('link curto que leva a outro site é recusado sem segui-lo', async () => {
    const { svc, pedidos } = servico({
      'https://spotify.link/x': () =>
        new Response(null, { status: 301, headers: { location: 'https://malicioso.example/' } }),
    });
    expect(await svc.buscar('https://spotify.link/x')).toMatchObject({ ok: false, erro: { motivo: 'nao-e-playlist' } });
    expect(pedidos).toHaveLength(1);
  });

  it('sem internet: motivo "rede", com o detalhe para o log', async () => {
    const falhas: string[] = [];
    const svc = new PlaylistsService({
      buscar: () => Promise.reject(new TypeError('fetch failed')),
      aoFalhar: (_s, d) => falhas.push(d),
    });
    expect(await svc.buscar('https://www.deezer.com/playlist/1')).toMatchObject({
      ok: false,
      erro: { motivo: 'rede', servico: 'deezer' },
    });
    expect(falhas[0]).toMatch(/fetch failed/);
  });

  it('manda um user-agent de navegador e um tempo limite', async () => {
    const { svc, pedidos } = servico({ 'https://api.deezer.com/': () => json({ error: { code: 800 } }) });
    await svc.buscar('https://www.deezer.com/playlist/1');
    expect((pedidos[0]?.init?.headers as Record<string, string>)['user-agent']).toMatch(/Mozilla/);
    expect(pedidos[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('capaSegura e acharTodos', () => {
  it('só https dos CDNs dos streamings', () => {
    expect(capaSegura('https://i.scdn.co/image/x')).toBe('https://i.scdn.co/image/x');
    expect(capaSegura('https://cdn-images.dzcdn.net/a.jpg')).toBe('https://cdn-images.dzcdn.net/a.jpg');
    expect(capaSegura('http://i.scdn.co/image/x')).toBeNull();
    expect(capaSegura('https://scdn.co.malicioso.example/x')).toBeNull();
    expect(capaSegura('https://user:senha@i.scdn.co/x')).toBeNull();
    expect(capaSegura('não é url')).toBeNull();
    expect(capaSegura(undefined)).toBeNull();
  });

  it('acharTodos não desce dentro do que achou e tolera ciclos com limite', () => {
    const a: Record<string, unknown> = { alvo: 1, filho: { alvo: 2 } };
    expect(acharTodos({ x: [a, { y: { alvo: 3 } }] }, (o) => 'alvo' in o)).toEqual([a, { alvo: 3 }]);
    const ciclo: Record<string, unknown> = {};
    ciclo.eu = ciclo;
    expect(acharTodos(ciclo, () => false, 50)).toEqual([]);
  });
});
