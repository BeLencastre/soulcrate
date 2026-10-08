import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  indexarBiblioteca,
  localizarNaBiblioteca,
  nomesDeArtista,
  type FaixaParaLocalizar,
  type IndiceBiblioteca,
} from '../../src/main/services/arquivos-biblioteca';

let raiz: string;
beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sc-biblioteca-'));
});
afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

const criar = (rel: string) => {
  const abs = join(raiz, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, '');
};

const JANELA = { inicio: 1_000_000, fim: 2_000_000 };
const faixa = (artista: string, titulo: string, extra: Partial<FaixaParaLocalizar> = {}): FaixaParaLocalizar => ({
  artista,
  titulo,
  local: null,
  formato: null,
  ...extra,
});
const sempreNaJanela = () => 1_500_000;
const nuncaNaJanela = () => 10;

describe('indexarBiblioteca', () => {
  it('indexa só áudio, pelo nome sem extensão normalizado, e pula pastas ocultas', async () => {
    criar('Hard Techno/Azyr/No Escape.flac');
    criar('Hard Techno/Azyr/capa.jpg');
    criar('Techno/Byørn/2 LOUD.MP3');
    criar('.beets/lixo.flac');
    criar('Hard Techno/Azyr/notas.txt');
    const i = await indexarBiblioteca(raiz);
    expect(i.total).toBe(2);
    expect(i.porNome.get('no escape')).toEqual(['Hard Techno/Azyr/No Escape.flac']);
    expect(i.porNome.get('2 loud')).toEqual(['Techno/Byørn/2 LOUD.MP3']);
    expect(i.parcial).toBe(false);
  });

  it('pasta que não existe: índice vazio, sem erro', async () => {
    const i = await indexarBiblioteca(join(raiz, 'nao-existe'));
    expect(i.total).toBe(0);
  });
});

describe('localizarNaBiblioteca', () => {
  let indice: IndiceBiblioteca;
  const indexar = async () => {
    indice = await indexarBiblioteca(raiz);
  };

  it('acha pelo título quando o artista está numa das pastas', async () => {
    criar('Hard Techno/Azyr/No Escape.flac');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Azyr', 'No Escape'), JANELA, nuncaNaJanela)).toBe(
      'Hard Techno/Azyr/No Escape.flac',
    );
  });

  it('acha pelo título quando só a data do arquivo bate com a execução (o beets pôs o arquivo na pasta de outro artista)', async () => {
    criar('_Sem Genero/Luciid/Bye Bye (NOVAH Remix).mp3');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Novah', 'Bye Bye (NOVAH Remix)'), JANELA, sempreNaJanela)).toBe(
      '_Sem Genero/Luciid/Bye Bye (NOVAH Remix).mp3',
    );
  });

  it('o mesmo título de outro artista, e de antes da execução, não vale', async () => {
    criar('Pop/Outro Artista/No Escape.mp3');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Azyr', 'No Escape'), JANELA, nuncaNaJanela)).toBeNull();
  });

  it('entre títulos iguais, escolhe o do artista certo', async () => {
    criar('Pop/Outro Artista/No Escape.mp3');
    criar('Hard Techno/Azyr/No Escape.flac');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Azyr', 'No Escape'), JANELA, sempreNaJanela)).toBe(
      'Hard Techno/Azyr/No Escape.flac',
    );
  });

  it('colaborações: qualquer um dos artistas nas pastas serve', async () => {
    criar('Hard Techno/Charlie Sparks/Power.flac');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Azyr & Charlie Sparks', 'Power'), JANELA, nuncaNaJanela)).toBe(
      'Hard Techno/Charlie Sparks/Power.flac',
    );
    expect(nomesDeArtista('Azyr & Charlie Sparks feat. Zed Trip')).toEqual(
      expect.arrayContaining(['azyr', 'charlie sparks', 'zed trip']),
    );
  });

  it('o título que o beets gravou pode ser o do arquivo baixado, não o da linha', async () => {
    criar('Hard Techno/Vendex/Abbadon.flac');
    await indexar();
    // a lista dizia "Abaddon"; o arquivo baixado era "Vendex - Abbadon.flac"
    expect(
      localizarNaBiblioteca(
        indice,
        faixa('Vendex', 'Abaddon', { local: 'downloads/Vendex/Vendex - Abbadon.flac' }),
        JANELA,
        nuncaNaJanela,
      ),
    ).toBe('Hard Techno/Vendex/Abbadon.flac');
  });

  it('o título sem o mix também serve, com menos pontos que o título completo', async () => {
    criar('Hard Techno/Creeds/Push Up.mp3');
    criar('Hard Techno/Creeds/Push Up (Original Mix).mp3');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Creeds', 'Push Up (Original Mix)'), JANELA, nuncaNaJanela)).toBe(
      'Hard Techno/Creeds/Push Up (Original Mix).mp3',
    );
    // sem o arquivo com o mix na biblioteca, cai no sem mix
    rmSync(join(raiz, 'Hard Techno', 'Creeds', 'Push Up (Original Mix).mp3'));
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Creeds', 'Push Up (Original Mix)'), JANELA, nuncaNaJanela)).toBe(
      'Hard Techno/Creeds/Push Up.mp3',
    );
  });

  it('desempata pela extensão do formato e pela data mais recente', async () => {
    criar('G/Azyr/Faixa.mp3');
    criar('G/Azyr/Faixa.flac');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Azyr', 'Faixa', { formato: 'FLAC' }), JANELA, nuncaNaJanela)).toBe(
      'G/Azyr/Faixa.flac',
    );
  });

  it('acentos, maiúsculas e pontuação não atrapalham', async () => {
    criar('Techno/Byørn/2 LOUD!.flac');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Byørn', '2 loud'), JANELA, nuncaNaJanela)).toBe(
      'Techno/Byørn/2 LOUD!.flac',
    );
  });

  it('sem nenhum arquivo com o nome, nada', async () => {
    criar('G/Azyr/Outra.flac');
    await indexar();
    expect(localizarNaBiblioteca(indice, faixa('Azyr', 'No Escape'), JANELA, sempreNaJanela)).toBeNull();
  });

  it('janela aberta (execução rodando): vale qualquer data depois do início', async () => {
    criar('G/Qualquer/Faixa.flac');
    await indexar();
    expect(
      localizarNaBiblioteca(indice, faixa('Azyr', 'Faixa'), { inicio: 1_000_000, fim: null }, () => 5_000_000),
    ).toBe('G/Qualquer/Faixa.flac');
  });
});
