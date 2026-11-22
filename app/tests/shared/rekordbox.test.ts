// As regras puras do rekordbox XML (src/shared/rekordbox.ts): a árvore de playlists, o Location de cada faixa e o
// texto do arquivo. Os caminhos com Ø, cirílico, &, [ ], ( ) e + são os do teste feito no Rekordbox 7.2.19.
import { describe, expect, it } from 'vitest';
import type { FaixaDaBiblioteca } from '../../src/shared/biblioteca';
import {
  escaparAtributo,
  gerarXml,
  generoDaPasta,
  localizacao,
  montarArvore,
  nomeDaLista,
  PLAYLIST_FORA_DAS_PASTAS,
  resumir,
} from '../../src/shared/rekordbox';

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
      { nome: 'Acid Techno', ids: [2] },
      { nome: 'Hard Techno', ids: [4, 1, 3] },
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
    expect(arvore.generos).toEqual([{ nome: 'Psy-Trance', ids: [1, 2] }]);
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

  it('sem lista nenhuma, a pasta Listas não aparece; biblioteca vazia ainda gera um arquivo válido', () => {
    const xml = gerarXml({ pastaMusica: 'C:\\M', faixas: [], arvore: montarArvore([]), versao: '1' });
    expect(xml).toContain('<COLLECTION Entries="0">');
    expect(xml).toContain('<NODE Type="0" Name="Soulcrate" Count="1">');
    expect(xml).toContain('<NODE Type="0" Name="Gêneros" Count="0">');
    expect(xml).not.toContain('Listas');
  });
});
