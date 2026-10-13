import { describe, expect, it } from 'vitest';
import {
  cabecalhoDaOrigem,
  chaveDaLinha,
  duracaoDaPlaylist,
  lerOrigem,
  limparTitulo,
  linhaDaFaixa,
  mesclarPlaylist,
  nomeDeArquivoDaPlaylist,
  origemDoTexto,
  primeiroArtista,
  reconhecerLink,
  revisarPlaylist,
  STREAMINGS,
  textoDaPlaylist,
  type FaixaPlaylist,
  type PlaylistImportada,
} from '../../src/shared/playlists';

const ID_SP = '37i9dQZF1DXcBWIGoYBM5M';

function playlist(faixas: FaixaPlaylist[], extra: Partial<PlaylistImportada> = {}): PlaylistImportada {
  return {
    servico: 'spotify',
    id: ID_SP,
    url: `https://open.spotify.com/playlist/${ID_SP}`,
    nome: 'Hard Techno Sexta',
    autor: 'belen',
    capa: null,
    faixas,
    total: null,
    parcial: false,
    ...extra,
  };
}
const f = (artista: string, titulo: string, extra: Partial<FaixaPlaylist> = {}): FaixaPlaylist => ({
  artista,
  titulo,
  duracaoMs: 300_000,
  ...extra,
});

describe('streamings aceitos', () => {
  it('são os quatro com playlist pública gratuita (a Amazon Music fica de fora)', () => {
    expect(STREAMINGS.map((s) => s.id)).toEqual(['spotify', 'apple', 'youtube', 'deezer']);
    expect(STREAMINGS.map((s) => s.nome)).not.toContain('Amazon Music');
  });
});

describe('reconhecerLink', () => {
  it.each([
    [`https://open.spotify.com/playlist/${ID_SP}?si=abc123`, 'spotify', ID_SP],
    [`https://open.spotify.com/intl-pt/playlist/${ID_SP}`, 'spotify', ID_SP],
    [`open.spotify.com/playlist/${ID_SP}`, 'spotify', ID_SP],
    [`spotify:playlist:${ID_SP}`, 'spotify', ID_SP],
    [
      'https://music.apple.com/br/playlist/hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
      'apple',
      'pl.f4d106fed2bd41149aaacabb233eb5eb',
    ],
    ['https://music.apple.com/us/playlist/minha/pl.u-vEe5t44Rjbm', 'apple', 'pl.u-vEe5t44Rjbm'],
    [
      'https://music.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
      'youtube',
      'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
    ],
    [
      'https://www.youtube.com/watch?v=abc&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
      'youtube',
      'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
    ],
    ['https://www.deezer.com/br/playlist/908622995', 'deezer', '908622995'],
    ['https://deezer.com/playlist/908622995?utm_source=x', 'deezer', '908622995'],
  ])('%s → playlist de %s', (link, servico, id) => {
    const r = reconhecerLink(link);
    expect(r).toMatchObject({ tipo: 'playlist', servico, id });
  });

  it('devolve o link canônico (sem rastreio nem idioma)', () => {
    expect(reconhecerLink(`https://open.spotify.com/intl-pt/playlist/${ID_SP}?si=x`)).toMatchObject({
      url: `https://open.spotify.com/playlist/${ID_SP}`,
    });
    expect(reconhecerLink('https://www.deezer.com/br/playlist/1?utm=2')).toMatchObject({
      url: 'https://www.deezer.com/playlist/1',
    });
    expect(reconhecerLink('https://music.apple.com/BR/playlist/x/pl.abcdef1234')).toMatchObject({
      url: 'https://music.apple.com/br/playlist/pl.abcdef1234',
    });
  });

  it.each([
    ['https://open.spotify.com/track/3zOYmiNOuyDL0ClxJcEJ0T', 'spotify', 'faixa'],
    ['https://open.spotify.com/album/3zOYmiNOuyDL0ClxJcEJ0T', 'spotify', 'album'],
    ['spotify:track:3zOYmiNOuyDL0ClxJcEJ0T', 'spotify', 'faixa'],
    ['https://music.apple.com/br/album/nicole-kidman/6792883860?i=6792884088', 'apple', 'faixa'],
    ['https://music.apple.com/br/album/nicole-kidman/6792883860', 'apple', 'album'],
    ['https://music.apple.com/library/playlist/p.abc', 'apple', 'biblioteca'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'video'],
    ['https://music.youtube.com/watch?v=x&list=RDAMVMx1234567890', 'youtube', 'mix'],
    ['https://www.deezer.com/br/track/3135556', 'deezer', 'faixa'],
  ])('%s → não é playlist (%s, %s)', (link, servico, conteudo) => {
    expect(reconhecerLink(link)).toEqual({ tipo: 'outro', servico, conteudo });
  });

  it('links curtos ficam para o main resolver', () => {
    expect(reconhecerLink('https://link.deezer.com/s/30abc')).toMatchObject({ tipo: 'curto', servico: 'deezer' });
    expect(reconhecerLink('https://spotify.link/AbCd')).toMatchObject({ tipo: 'curto', servico: 'spotify' });
  });

  it('vazio, inválido e de outro site', () => {
    expect(reconhecerLink('  ')).toEqual({ tipo: 'vazio' });
    expect(reconhecerLink('não é link')).toEqual({ tipo: 'invalido' });
    expect(reconhecerLink('ftp://open.spotify.com/playlist/x')).toEqual({ tipo: 'invalido' });
    expect(reconhecerLink('https://music.amazon.com/playlists/B07H8NDFTJ')).toEqual({ tipo: 'desconhecido' });
    expect(reconhecerLink(`https://open.spotify.com/playlist/${'a'.repeat(3000)}`)).toEqual({ tipo: 'invalido' });
  });
});

describe('faixa → linha da lista', () => {
  it('"Título - X Remix" do Spotify vira "Título (X Remix)", como o script faz no CSV', () => {
    expect(limparTitulo('Push Up - Original Mix')).toBe('Push Up (Original Mix)');
    expect(limparTitulo('Direct It To The Roof - Azyr Remix')).toBe('Direct It To The Roof (Azyr Remix)');
    expect(limparTitulo('Rein Me In (with Olivia Dean)')).toBe('Rein Me In (with Olivia Dean)');
  });

  it('tira o que o YouTube põe no título e a remasterização', () => {
    expect(limparTitulo('Tatakai (Official Video)')).toBe('Tatakai');
    expect(limparTitulo('Abaddon [Official Audio]')).toBe('Abaddon');
    expect(limparTitulo('Banjaara (Lyric Video) (HD)')).toBe('Banjaara');
    expect(limparTitulo('Hey Jude (Remastered 2015)')).toBe('Hey Jude');
    expect(limparTitulo('Hey Jude - Remastered 2015')).toBe('Hey Jude');
    expect(limparTitulo('Push Up (Video Edit)')).toBe('Push Up (Video Edit)');
  });

  it('vários artistas: fica o primeiro; "&" é parte do nome', () => {
    expect(primeiroArtista('KAROL G, Judeline, rusowsky')).toBe('KAROL G');
    expect(primeiroArtista('Dave feat. Tems')).toBe('Dave');
    expect(primeiroArtista('Above & Beyond')).toBe('Above & Beyond');
    expect(primeiroArtista('Azyr - Topic')).toBe('Azyr');
  });

  it('monta "Artista - Título" e nunca começa com # (viraria comentário)', () => {
    expect(linhaDaFaixa({ artista: 'Creeds', titulo: 'Push Up - Original Mix' })).toBe(
      'Creeds - Push Up (Original Mix)',
    );
    expect(linhaDaFaixa({ artista: '#1 Dads', titulo: 'So Soldiers' })).toBe('1 Dads - So Soldiers');
    expect(linhaDaFaixa({ artista: '', titulo: 'Sem artista' })).toBe('Sem artista');
    expect(linhaDaFaixa({ artista: 'A\nB', titulo: 'T\r\nU' })).toBe('A B - T U');
  });

  it('a chave ignora acento, caixa e pontuação', () => {
    expect(chaveDaLinha('Byørn - Música!')).toBe(chaveDaLinha('byørn   musica'));
  });
});

describe('revisarPlaylist', () => {
  it('marca repetidas (com a primeira ocorrência) e vídeos, e conta o que vai baixar', () => {
    const r = revisarPlaylist(
      playlist([
        f('Azyr', 'No Escape'),
        f('AZYR', 'No Escape'),
        f('Creeds', 'Push Up - Original Mix'),
        f('Canal', 'vlog do dia', { video: true }),
      ]),
    );
    expect(r.faixas.map((x) => [x.n, x.duplicadaDe, x.video])).toEqual([
      [1, null, false],
      [2, 1, false],
      [3, null, false],
      [4, null, true],
    ]);
    expect(r).toMatchObject({ paraBaixar: 2, duplicadas: 1, videos: 1 });
    expect(r.faixas[2]?.titulo).toBe('Push Up (Original Mix)');
  });
});

describe('texto da lista e primeira linha', () => {
  const p = playlist([f('Azyr', 'No Escape'), f('Azyr', 'No Escape'), f('Canal', 'vlog', { video: true })]);

  it('guarda a origem na primeira linha, uma faixa por linha, vídeo comentado', () => {
    expect(textoDaPlaylist(p, { lembrar: true })).toBe(
      `# Spotify · Hard Techno Sexta · https://open.spotify.com/playlist/${ID_SP}\n` +
        'Azyr - No Escape\nAzyr - No Escape\n# Canal - vlog\n',
    );
  });

  it('sem "lembrar", não há primeira linha de origem', () => {
    expect(textoDaPlaylist(p, { lembrar: false })).toBe('Azyr - No Escape\nAzyr - No Escape\n# Canal - vlog\n');
  });

  it('a primeira linha volta a ser lida (ida e volta), inclusive com BOM', () => {
    const linha = cabecalhoDaOrigem({
      servico: 'deezer',
      nome: 'Warmup · domingo',
      url: 'https://www.deezer.com/playlist/9',
    });
    expect(linha).toBe('# Deezer · Warmup - domingo · https://www.deezer.com/playlist/9');
    expect(lerOrigem(`\uFEFF${linha}`)).toEqual({
      servico: 'deezer',
      nome: 'Warmup - domingo',
      url: 'https://www.deezer.com/playlist/9',
    });
    expect(origemDoTexto(`${linha}\nAzyr - No Escape`)?.servico).toBe('deezer');
  });

  it('comentário comum, link que não bate com o streaming ou outro site: não é origem', () => {
    expect(lerOrigem('# Uma faixa por linha')).toBeNull();
    expect(lerOrigem('# Spotify · X · https://www.deezer.com/playlist/9')).toBeNull();
    expect(lerOrigem('# Amazon Music · X · https://music.amazon.com/playlists/B1')).toBeNull();
    expect(lerOrigem('Spotify · X · https://open.spotify.com/playlist/' + ID_SP)).toBeNull();
  });
});

describe('mesclarPlaylist ("Atualizar da playlist")', () => {
  it('só as faixas novas entram, no fim; nada é apagado nem mudado', () => {
    const texto = `# Spotify · X · https://open.spotify.com/playlist/${ID_SP}\nazyr - no escape\nMinha faixa - Extra\n`;
    const r = mesclarPlaylist(
      texto,
      playlist([f('Azyr', 'No Escape'), f('Vendex', 'Abaddon'), f('Vendex', 'Abaddon')]),
    );
    expect(r.novas).toBe(1);
    expect(r.texto).toBe(`${texto}Vendex - Abaddon\n`);
  });

  it('uma faixa que a pessoa comentou conta como presente', () => {
    const r = mesclarPlaylist('# Azyr - No Escape', playlist([f('Azyr', 'No Escape')]));
    expect(r).toEqual({ texto: '# Azyr - No Escape', novas: 0 });
  });

  it('lista sem quebra de linha no fim', () => {
    expect(mesclarPlaylist('A - B', playlist([f('C', 'D')])).texto).toBe('A - B\nC - D\n');
  });
});

describe('nome do arquivo e duração', () => {
  it('nome da playlist vira um nome de arquivo simples', () => {
    expect(nomeDeArquivoDaPlaylist('Hard Techno Sexta')).toBe('hard-techno-sexta');
    expect(nomeDeArquivoDaPlaylist('Músicas: curtidas / 2026!')).toBe('musicas-curtidas-2026');
    expect(nomeDeArquivoDaPlaylist('★★★')).toBe('playlist');
  });

  it('duração total, ou null se alguma faixa não diz a sua', () => {
    expect(duracaoDaPlaylist([{ duracaoMs: 60 * 60_000 }, { duracaoMs: 6 * 60_000 }])).toBe('1 h 6 min');
    expect(duracaoDaPlaylist([{ duracaoMs: 38 * 60_000 }])).toBe('38 min');
    expect(duracaoDaPlaylist([{ duracaoMs: 120 * 60_000 }])).toBe('2 h');
    expect(duracaoDaPlaylist([{ duracaoMs: null }])).toBeNull();
    expect(duracaoDaPlaylist([])).toBeNull();
  });
});
