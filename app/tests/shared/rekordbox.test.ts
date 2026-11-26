// As regras puras do rekordbox XML (src/shared/rekordbox.ts): a árvore de playlists, o Location de cada faixa e o
// texto do arquivo. Os caminhos com Ø, cirílico, &, [ ], ( ) e + são os do teste feito no Rekordbox 7.2.19.
import { describe, expect, it } from 'vitest';
import type { FaixaDaBiblioteca } from '../../src/shared/biblioteca';
import {
  artistaDaPasta,
  escaparAtributo,
  gerarXml,
  generoDaPasta,
  localizacao,
  montarArvore,
  nomeDaLista,
  PLAYLIST_FORA_DAS_PASTAS,
  PLAYLIST_TODAS,
  resumir,
} from '../../src/shared/rekordbox';

const SO_GENERO = { subgenero: false, artista: false };
const ARTISTA = { subgenero: false, artista: true };
const SUBGENERO = { subgenero: true, artista: false };
const SUBGENERO_E_ARTISTA = { subgenero: true, artista: true };

const faixa = (id: number, arquivo: string, extra: Partial<FaixaDaBiblioteca> = {}): FaixaDaBiblioteca => ({
  id,
  artista: 'Azyr',
  titulo: 'No Escape',
  bpm: 150,
  tom: 'F#m',
  genero: 'Hard Techno',
  formato: 'FLAC',
  arquivo,
  semGenero: false,
  subgenero: null,
  ...extra,
});

describe('a árvore', () => {
  it('uma playlist por pasta de gênero, em ordem alfabética, com as faixas como num caixote', () => {
    const arvore = montarArvore([
      faixa(3, 'Hard Techno/Vendex/Plague.flac', { artista: 'Vendex', titulo: 'Plague' }),
      faixa(1, 'Hard Techno/Azyr/Power.flac', { titulo: 'Power' }),
      faixa(2, 'Acid Techno/AZYR/The Bassline.flac', { artista: 'AZYR', titulo: 'The Bassline' }),
      faixa(4, 'Hard Techno/Azyr/No Escape.flac'),
    ]);
    expect(arvore.generos).toEqual([
      { nome: 'Acid Techno', ids: [2], filhos: null },
      { nome: 'Hard Techno', ids: [4, 1, 3], filhos: null },
    ]);
    expect(arvore.listas).toEqual([]);
  });

  it('o gênero é o nome da pasta, não a tag: _Sem Genero e coletâneas entram como qualquer pasta', () => {
    expect(generoDaPasta('_Sem Genero/Luciid/Bye Bye.flac')).toBe('_Sem Genero');
    expect(generoDaPasta('Techno/Various Artists/A - B.flac')).toBe('Techno');
    expect(generoDaPasta('Techno/solta.flac')).toBe('Techno');
    expect(generoDaPasta('solta-na-raiz.flac')).toBe(PLAYLIST_FORA_DAS_PASTAS);
  });

  it('junta pastas que só mudam em maiúsculas (o Rekordbox recusa dois nomes iguais no mesmo nível)', () => {
    const arvore = montarArvore([
      faixa(1, 'Psy-Trance/A/x.flac', { artista: 'A' }),
      faixa(2, 'psy-trance/B/y.flac', { artista: 'B' }),
    ]);
    expect(arvore.generos).toEqual([{ nome: 'Psy-Trance', ids: [1, 2], filhos: null }]);
  });

  it('uma playlist por lista, na ordem das linhas, sem repetir e só com o que está na biblioteca', () => {
    const faixas = [
      faixa(1, 'Hard Techno/Azyr/a.flac'),
      faixa(2, 'Hard Techno/Azyr/b.flac'),
      faixa(3, 'Techno/X/c.flac'),
    ];
    const arvore = montarArvore(faixas, [
      { arquivo: 'techno-pesado.txt', ids: [3, null, 1, 3, 99, undefined] },
      { arquivo: 'vazia.txt', ids: [null, 99] },
      { arquivo: 'Abertura.csv', ids: [2] },
    ]);
    expect(arvore.listas).toEqual([
      { nome: 'Abertura', ids: [2] },
      { nome: 'techno-pesado', ids: [3, 1] },
    ]);
  });

  it('por gênero e artista: uma pasta por gênero com Todas e uma playlist por pasta de artista', () => {
    const arvore = montarArvore(
      [
        faixa(3, 'Hard Techno/Vendex/Plague.flac', { artista: 'Vendex', titulo: 'Plague' }),
        faixa(1, 'Hard Techno/Azyr/Power.flac', { titulo: 'Power' }),
        faixa(2, 'Acid Techno/AZYR/The Bassline.flac', { artista: 'AZYR', titulo: 'The Bassline' }),
        faixa(4, 'Hard Techno/Azyr/No Escape.flac'),
      ],
      [],
      ARTISTA,
    );
    expect(arvore.generos).toEqual([
      { nome: 'Acid Techno', ids: [2], filhos: [{ nome: 'AZYR', ids: [2], filhos: null }] },
      {
        nome: 'Hard Techno',
        ids: [4, 1, 3],
        filhos: [
          { nome: 'Azyr', ids: [4, 1], filhos: null },
          { nome: 'Vendex', ids: [3], filhos: null },
        ],
      },
    ]);
  });

  it('o artista sai do caminho, com o disco em qualquer organização: a pasta, ou o começo do nome do arquivo', () => {
    // disco por gênero e artista
    expect(artistaDaPasta('Techno/Various Artists/A - B.flac')).toBe('Various Artists');
    expect(artistaDaPasta('Techno/Azyr/No Escape - Part 2.flac')).toBe('Azyr');
    // disco só por gênero: "Artista - Título", cortando no primeiro " - " (o título pode ter outros)
    expect(artistaDaPasta('Techno/Azyr - No Escape.flac')).toBe('Azyr');
    expect(artistaDaPasta('Techno/Above & Beyond - Sun - Moon (Extended).flac')).toBe('Above & Beyond');
    expect(artistaDaPasta('Techno/Various Artists - A, B - No Escape.flac')).toBe('Various Artists');
    // sem artista no caminho
    expect(artistaDaPasta('Techno/No Escape.flac')).toBe(PLAYLIST_FORA_DAS_PASTAS);
    expect(artistaDaPasta('Techno/ - No Escape.flac')).toBe(PLAYLIST_FORA_DAS_PASTAS);
    expect(artistaDaPasta('solta.flac')).toBe(PLAYLIST_FORA_DAS_PASTAS);
  });

  it('Rekordbox por gênero e artista com o disco só por gênero (ou no meio da reorganização): junta pelo artista', () => {
    const arvore = montarArvore(
      [
        faixa(1, 'Techno/Azyr - Power.flac', { titulo: 'Power' }),
        faixa(2, 'Techno/Azyr/No Escape.flac'),
        faixa(3, 'Techno/Vendex - Plague.flac', { artista: 'Vendex', titulo: 'Plague' }),
      ],
      [],
      ARTISTA,
    );
    expect(arvore.generos).toEqual([
      {
        nome: 'Techno',
        ids: [2, 1, 3],
        filhos: [
          { nome: 'Azyr', ids: [2, 1], filhos: null },
          { nome: 'Vendex', ids: [3], filhos: null },
        ],
      },
    ]);
  });

  it('Rekordbox só por gênero com o disco por gênero e artista: uma playlist por gênero', () => {
    const arvore = montarArvore(
      [faixa(1, 'Techno/Azyr/Power.flac'), faixa(2, 'Techno/Vendex/Plague.flac', { artista: 'Vendex' })],
      [],
      SO_GENERO,
    );
    expect(arvore.generos).toEqual([{ nome: 'Techno', ids: [1, 2], filhos: null }]);
  });

  describe('com subgênero (ADR 0007)', () => {
    const faixas = [
      faixa(1, 'Techno/Peak Time/Azyr/Power.flac', { titulo: 'Power', subgenero: 'Peak Time' }),
      faixa(2, 'Techno/Peak Time/Vendex/Plague.flac', { artista: 'Vendex', subgenero: 'Peak Time' }),
      faixa(3, 'Techno/Hard Techno/Azyr/Bass.flac', { subgenero: 'Hard Techno' }),
      faixa(4, 'Techno/_Sem Subgenero/Luciid/Bye.flac', { artista: 'Luciid', subgenero: null }),
    ];
    const folha = (nome: string, ids: number[]) => ({ nome, ids, filhos: null });

    it('as quatro árvores: só gênero, gênero e artista, gênero e subgênero, os três níveis', () => {
      const de = (n: typeof SO_GENERO) => montarArvore(faixas, [], n).generos;
      expect(de(SO_GENERO)).toEqual([folha('Techno', [3, 1, 4, 2])]);
      expect(de(ARTISTA)).toEqual([
        {
          nome: 'Techno',
          ids: [3, 1, 4, 2],
          filhos: [folha('Azyr', [3, 1]), folha('Luciid', [4]), folha('Vendex', [2])],
        },
      ]);
      expect(de(SUBGENERO)).toEqual([
        {
          nome: 'Techno',
          ids: [3, 1, 4, 2],
          filhos: [folha('_Sem Subgenero', [4]), folha('Hard Techno', [3]), folha('Peak Time', [1, 2])],
        },
      ]);
      expect(de(SUBGENERO_E_ARTISTA)).toEqual([
        {
          nome: 'Techno',
          ids: [3, 1, 4, 2],
          filhos: [
            { nome: '_Sem Subgenero', ids: [4], filhos: [folha('Luciid', [4])] },
            { nome: 'Hard Techno', ids: [3], filhos: [folha('Azyr', [3])] },
            { nome: 'Peak Time', ids: [1, 2], filhos: [folha('Azyr', [1]), folha('Vendex', [2])] },
          ],
        },
      ]);
    });

    it('o subgênero vem do banco, então o Rekordbox o tem mesmo com o disco sem esse nível', () => {
      const arvore = montarArvore([faixa(1, 'Techno/Azyr/Power.flac', { subgenero: 'Peak Time' })], [], SUBGENERO);
      expect(arvore.generos[0]?.filhos).toEqual([folha('Peak Time', [1])]);
    });

    it('o artista sai do caminho com ou sem a pasta de subgênero no disco', () => {
      expect(artistaDaPasta('Techno/Peak Time/Azyr/No Escape.flac', 'Peak Time')).toBe('Azyr');
      expect(artistaDaPasta('Techno/peak time/Azyr/No Escape.flac', 'Peak Time')).toBe('Azyr');
      expect(artistaDaPasta('Techno/_Sem Subgenero/Azyr/No Escape.flac')).toBe('Azyr');
      expect(artistaDaPasta('Techno/Peak Time/Azyr - No Escape.flac', 'Peak Time')).toBe('Azyr');
      expect(artistaDaPasta('Techno/_Sem Subgenero/Azyr - No Escape.flac')).toBe('Azyr');
      // sem subgênero no disco, a segunda pasta continua sendo o artista
      expect(artistaDaPasta('Techno/Azyr/No Escape.flac', 'Peak Time')).toBe('Azyr');
      expect(artistaDaPasta('Techno/Azyr/No Escape.flac')).toBe('Azyr');
      // uma faixa só com gênero e subgênero (sem artista no caminho)
      expect(artistaDaPasta('Techno/Peak Time/No Escape.flac', 'Peak Time')).toBe(PLAYLIST_FORA_DAS_PASTAS);
    });

    it('misturando faixas com e sem pasta de subgênero (meio da reorganização), o artista junta', () => {
      const mistas = [
        faixa(1, 'Techno/Peak Time/Azyr/a.flac', { subgenero: 'Peak Time' }),
        faixa(2, 'Techno/Azyr/b.flac', { subgenero: 'Peak Time' }),
      ];
      expect(montarArvore(mistas, [], SUBGENERO_E_ARTISTA).generos[0]?.filhos).toEqual([
        { nome: 'Peak Time', ids: [1, 2], filhos: [folha('Azyr', [1, 2])] },
      ]);
    });

    it('um subgênero chamado Todas não colide com a playlist do gênero inteiro', () => {
      const arvore = montarArvore([faixa(1, 'Techno/Todas/Azyr/x.flac', { subgenero: 'Todas' })], [], SUBGENERO);
      expect(arvore.generos[0]?.filhos).toEqual([folha('Todas (subgênero)', [1])]);
    });
  });

  it('um artista chamado Todas não colide com a playlist do gênero inteiro', () => {
    const arvore = montarArvore([faixa(1, 'Techno/todas/x.flac')], [], ARTISTA);
    expect(arvore.generos[0]?.filhos).toEqual([{ nome: `todas (artista)`, ids: [1], filhos: null }]);
    expect(PLAYLIST_TODAS).toBe('Todas');
  });

  it('o nome da playlist da lista é o arquivo sem a extensão', () => {
    expect(nomeDaLista('techno-pesado.txt')).toBe('techno-pesado');
    expect(nomeDaLista('spotify.2026.csv')).toBe('spotify.2026');
  });

  it('o resumo conta faixas, gêneros, listas e as listas que ficaram de fora', () => {
    const faixas = [faixa(1, 'Techno/A/a.flac')];
    const arvore = montarArvore(faixas, [{ arquivo: 'l.txt', ids: [1] }]);
    expect(resumir(faixas, arvore, ['quebrada.txt'])).toEqual({
      faixas: 1,
      generos: 1,
      listas: 1,
      listasComFalha: ['quebrada.txt'],
    });
  });
});

describe('o Location', () => {
  const raiz = 'C:\\DJ\\soulcrate-teste\\musicas';
  it.each([
    [
      'Hard Techno/BYØRN/Shivaya (SveTec Remix).wav',
      'file://localhost/C:/DJ/soulcrate-teste/musicas/Hard%20Techno/BY%C3%98RN/Shivaya%20%28SveTec%20Remix%29.wav',
    ],
    [
      'Electronic/ZAPRAVKA/Пришел увидел.flac',
      'file://localhost/C:/DJ/soulcrate-teste/musicas/Electronic/ZAPRAVKA/%D0%9F%D1%80%D0%B8%D1%88%D0%B5%D0%BB%20%D1%83%D0%B2%D0%B8%D0%B4%D0%B5%D0%BB.flac',
    ],
    [
      'Hard Techno/Luke Noize/Luke Noize - I Told You [FREE DL + SPOTIFY].flac',
      'file://localhost/C:/DJ/soulcrate-teste/musicas/Hard%20Techno/Luke%20Noize/Luke%20Noize%20-%20I%20Told%20You%20%5BFREE%20DL%20%2B%20SPOTIFY%5D.flac',
    ],
    [
      'Hard Techno/Restricted & Nik Sitz/Tunnel Vision (extended mix).flac',
      'file://localhost/C:/DJ/soulcrate-teste/musicas/Hard%20Techno/Restricted%20%26%20Nik%20Sitz/Tunnel%20Vision%20%28extended%20mix%29.flac',
    ],
  ])('%s', (arquivo, esperado) => {
    expect(localizacao(raiz, arquivo)).toBe(esperado);
  });

  it('aceita a pasta com barra normal ou no fim, e um caminho de rede', () => {
    expect(localizacao('C:/DJ/Musics/', 'Techno/A/x.flac')).toBe('file://localhost/C:/DJ/Musics/Techno/A/x.flac');
    expect(localizacao('\\\\nas\\musica', 'Techno/A/x.flac')).toBe('file://localhost//nas/musica/Techno/A/x.flac');
  });
});

describe('o XML', () => {
  it('escapa o que o XML não aceita cru e some com caracteres de controle', () => {
    expect(escaparAtributo(`Restricted & Nik "Sitz" <'x'>`)).toBe(
      'Restricted &amp; Nik &quot;Sitz&quot; &lt;&apos;x&apos;&gt;',
    );
    expect(escaparAtributo('a\u0001b\tc\nd')).toBe('ab&#9;c&#10;d');
  });

  it('gera a coleção e a árvore Soulcrate › Gêneros e Soulcrate › Listas', () => {
    const faixas = [
      faixa(7, 'Hard Techno/Restricted & Nik Sitz/Tunnel Vision.flac', {
        artista: 'Restricted & Nik Sitz',
        titulo: 'Tunnel Vision',
      }),
      faixa(2, 'Acid Techno/AZYR/The Bassline.flac', { artista: 'AZYR', titulo: 'The Bassline' }),
    ];
    const arvore = montarArvore(faixas, [{ arquivo: 'techno-pesado.txt', ids: [7, 2] }]);
    expect(gerarXml({ pastaMusica: 'C:\\DJ\\Musics', faixas, arvore, versao: '1.2.0' })).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<DJ_PLAYLISTS Version="1.0.0">',
        '  <PRODUCT Name="Soulcrate" Version="1.2.0" Company="Soulcrate" />',
        '  <COLLECTION Entries="2">',
        '    <TRACK TrackID="7" Name="Tunnel Vision" Artist="Restricted &amp; Nik Sitz" Location="file://localhost/C:/DJ/Musics/Hard%20Techno/Restricted%20%26%20Nik%20Sitz/Tunnel%20Vision.flac" />',
        '    <TRACK TrackID="2" Name="The Bassline" Artist="AZYR" Location="file://localhost/C:/DJ/Musics/Acid%20Techno/AZYR/The%20Bassline.flac" />',
        '  </COLLECTION>',
        '  <PLAYLISTS>',
        '    <NODE Type="0" Name="ROOT" Count="1">',
        '      <NODE Type="0" Name="Soulcrate" Count="2">',
        '        <NODE Type="0" Name="Gêneros" Count="2">',
        '          <NODE Type="1" Name="Acid Techno" KeyType="0" Entries="1">',
        '            <TRACK Key="2" />',
        '          </NODE>',
        '          <NODE Type="1" Name="Hard Techno" KeyType="0" Entries="1">',
        '            <TRACK Key="7" />',
        '          </NODE>',
        '        </NODE>',
        '        <NODE Type="0" Name="Listas" Count="1">',
        '          <NODE Type="1" Name="techno-pesado" KeyType="0" Entries="2">',
        '            <TRACK Key="7" />',
        '            <TRACK Key="2" />',
        '          </NODE>',
        '        </NODE>',
        '      </NODE>',
        '    </NODE>',
        '  </PLAYLISTS>',
        '</DJ_PLAYLISTS>',
        '',
      ].join('\n'),
    );
  });

  it('por gênero e artista: o gênero vira pasta, com Todas primeiro e os artistas em seguida', () => {
    const faixas = [
      faixa(1, 'Hard Techno/Azyr/Power.flac', { titulo: 'Power' }),
      faixa(3, 'Hard Techno/Vendex/Plague.flac', { artista: 'Vendex', titulo: 'Plague' }),
    ];
    const xml = gerarXml({
      pastaMusica: 'C:\\M',
      faixas,
      arvore: montarArvore(faixas, [], ARTISTA),
      versao: '1',
    });
    expect(xml).toContain(
      [
        '        <NODE Type="0" Name="Gêneros" Count="1">',
        '          <NODE Type="0" Name="Hard Techno" Count="3">',
        '            <NODE Type="1" Name="Todas" KeyType="0" Entries="2">',
        '              <TRACK Key="1" />',
        '              <TRACK Key="3" />',
        '            </NODE>',
        '            <NODE Type="1" Name="Azyr" KeyType="0" Entries="1">',
        '              <TRACK Key="1" />',
        '            </NODE>',
        '            <NODE Type="1" Name="Vendex" KeyType="0" Entries="1">',
        '              <TRACK Key="3" />',
        '            </NODE>',
        '          </NODE>',
        '        </NODE>',
      ].join('\n'),
    );
  });

  it('com subgênero e artista: pastas dentro de pastas, cada uma com Todas primeiro', () => {
    const faixas = [
      faixa(1, 'Techno/Peak Time/Azyr/Power.flac', { titulo: 'Power', subgenero: 'Peak Time' }),
      faixa(2, 'Techno/_Sem Subgenero/Vendex/Plague.flac', { artista: 'Vendex', subgenero: null }),
    ];
    const xml = gerarXml({
      pastaMusica: 'C:\\M',
      faixas,
      arvore: montarArvore(faixas, [], SUBGENERO_E_ARTISTA),
      versao: '1',
    });
    expect(xml).toContain(
      [
        '        <NODE Type="0" Name="Gêneros" Count="1">',
        '          <NODE Type="0" Name="Techno" Count="3">',
        '            <NODE Type="1" Name="Todas" KeyType="0" Entries="2">',
        '              <TRACK Key="1" />',
        '              <TRACK Key="2" />',
        '            </NODE>',
        '            <NODE Type="0" Name="_Sem Subgenero" Count="2">',
        '              <NODE Type="1" Name="Todas" KeyType="0" Entries="1">',
        '                <TRACK Key="2" />',
        '              </NODE>',
        '              <NODE Type="1" Name="Vendex" KeyType="0" Entries="1">',
        '                <TRACK Key="2" />',
        '              </NODE>',
        '            </NODE>',
        '            <NODE Type="0" Name="Peak Time" Count="2">',
        '              <NODE Type="1" Name="Todas" KeyType="0" Entries="1">',
        '                <TRACK Key="1" />',
        '              </NODE>',
        '              <NODE Type="1" Name="Azyr" KeyType="0" Entries="1">',
        '                <TRACK Key="1" />',
        '              </NODE>',
        '            </NODE>',
        '          </NODE>',
        '        </NODE>',
      ].join('\n'),
    );
  });

  it('um subgênero chamado Todas vira "Todas (subgênero)" no XML, sem repetir o nome da playlist de cima', () => {
    const faixas = [faixa(1, 'Techno/Todas/Azyr/x.flac', { subgenero: 'Todas' })];
    const xml = gerarXml({ pastaMusica: 'C:\\M', faixas, arvore: montarArvore(faixas, [], SUBGENERO), versao: '1' });
    expect(xml).toContain('<NODE Type="1" Name="Todas (subgênero)" KeyType="0" Entries="1">');
    expect(xml.match(/Name="Todas"/g)).toHaveLength(1);
  });

  it('sem lista nenhuma, a pasta Listas não aparece; biblioteca vazia ainda gera um arquivo válido', () => {
    const xml = gerarXml({ pastaMusica: 'C:\\M', faixas: [], arvore: montarArvore([]), versao: '1' });
    expect(xml).toContain('<COLLECTION Entries="0">');
    expect(xml).toContain('<NODE Type="0" Name="Soulcrate" Count="1">');
    expect(xml).toContain('<NODE Type="0" Name="Gêneros" Count="0">');
    expect(xml).not.toContain('Listas');
  });
});
