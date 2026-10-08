// A parte pura da Fase 5 (src/shared/biblioteca.ts), conferida contra saídas REAIS do beets 2.11 gravadas em
// tests/fixtures/biblioteca/ (o `ls -f`, o `update -p`, o `move -p` e o `remove` rodados na imagem local/soulbeet-dj
// contra uma biblioteca descartável): o formato que o app lê é o que o beets de verdade escreve.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contarIndicadores,
  ehTarefaDeManutencao,
  filtrarFaixas,
  filtroDaFaixa,
  FORMATO_LS,
  lerCompartilhamento,
  lerFaixas,
  lerLinhaDeFaixa,
  lerPrevia,
  ordenarFaixas,
  rotuloDoFormato,
  semAnsi,
  termosDoFiltro,
  type FaixaDaBiblioteca,
  type ParadoEmDownloads,
} from '../src/shared/biblioteca';

const fixture = (nome: string) => readFileSync(join(import.meta.dirname, 'fixtures', 'biblioteca', nome), 'utf8');

const faixa = (extra: Partial<FaixaDaBiblioteca> = {}): FaixaDaBiblioteca => ({
  id: 1,
  artista: 'Azyr',
  titulo: 'No Escape',
  bpm: 150,
  tom: 'F#m',
  genero: 'Hard Techno',
  formato: 'FLAC',
  arquivo: 'Hard Techno/Azyr/No Escape.flac',
  semGenero: false,
  ...extra,
});

describe('o formato do ls', () => {
  it('pede os nove campos, separados por tabulação', () => {
    expect(FORMATO_LS.split('\t')).toEqual([
      '$id',
      '$artist',
      '$title',
      '$bpm',
      '$initial_key',
      '$genres',
      '$format',
      '$bitrate',
      '$path',
    ]);
  });

  it('lê a saída real do beets', () => {
    const { faixas, ignoradas } = lerFaixas(fixture('ls.txt'));
    expect(ignoradas).toBe(0);
    expect(faixas).toHaveLength(4);
    expect(faixas[0]).toEqual({
      id: 1,
      artista: 'Azyr',
      titulo: 'No Escape',
      bpm: 150,
      tom: 'F#m',
      genero: 'Hard Techno',
      formato: 'WAV',
      arquivo: 'Hard Techno/Azyr/No Escape.wav',
      semGenero: false,
    });
  });

  it('BPM 0 e tom vazio do beets viram "sem"', () => {
    const { faixas } = lerFaixas(fixture('ls.txt'));
    const vendex = faixas.find((f) => f.artista === 'Vendex');
    expect(vendex).toMatchObject({ bpm: null, tom: null, genero: null, semGenero: true });
    expect(vendex?.arquivo).toBe('_Sem Genero/Vendex/Vengeance Of The Masked.wav');
  });

  it('um gênero com vírgula é um gênero só (só o ponto e vírgula separa vários)', () => {
    const { faixas } = lerFaixas(fixture('ls.txt'));
    const cloudy = faixas.find((f) => f.artista === 'Cloudy');
    expect(cloudy?.genero).toBe('Electro, Techno/House, Dance');
    // o beets troca "/" por "_" no nome da pasta: o caminho vem da saída, não do gênero
    expect(cloudy?.arquivo).toBe('Electro, Techno_House, Dance/Cloudy/Yeah (Cloudy Remix).wav');
    expect(cloudy?.semGenero).toBe(false);
  });

  it('vários gêneros: vale o primeiro, o que dá nome à pasta', () => {
    const f = lerLinhaDeFaixa('7\tA\tB\t120\tAm\tHouse; Techno\tFLAC\t900kbps\t/music/House/A/B.flac');
    expect(f?.genero).toBe('House');
  });

  it('um ponto e vírgula colado é parte de um gênero só (só "; " separa vários, como no `%first{$genres}`)', () => {
    const f = lerLinhaDeFaixa(
      '7	A	B	120	Am	Hard Dance;Hardcore;Neo Rave	FLAC	900kbps	/music/Hard Dance;Hardcore;Neo Rave/A/B.flac',
    );
    expect(f?.genero).toBe('Hard Dance;Hardcore;Neo Rave');
    // e o gênero repetido que alguns arquivos trazem ("Psychedelic; Psychedelic; …") vale pelo primeiro
    expect(
      lerLinhaDeFaixa('8	A	B	0		Psychedelic; Psychedelic; Psychedelic	FLAC	1kbps	/music/Psychedelic/A/B.flac')?.genero,
    ).toBe('Psychedelic');
  });

  it('faixa sem título nas tags: o nome do arquivo ocupa o lugar; sem artista fica vazio', () => {
    const f = lerLinhaDeFaixa('9			0			MP3	320kbps	/music/_Sem Genero.mp3');
    expect(f).toMatchObject({ artista: '', titulo: '_Sem Genero', arquivo: '_Sem Genero.mp3' });
  });

  it('"sem gênero" vale para a tag vazia e para a pasta _Sem Genero, mesmo quando só uma das duas acontece', () => {
    // sem a tag, mas o arquivo está fora de _Sem Genero (um arquivo solto em music/)
    expect(lerLinhaDeFaixa('9			0			MP3	320kbps	/music/_Sem Genero.mp3')?.semGenero).toBe(true);
    // com a tag, mas na pasta _Sem Genero (importada antes de o lastgenre achar o gênero)
    expect(lerLinhaDeFaixa('4	A	B	0		House	MP3	320kbps	/music/_Sem Genero/A/B.mp3')?.semGenero).toBe(true);
    expect(lerLinhaDeFaixa('5	A	B	0		House	MP3	320kbps	/music/House/A/B.mp3')?.semGenero).toBe(false);
  });

  it('o caminho vira relativo a music/, com barras normais', () => {
    expect(lerLinhaDeFaixa('1\tA\tB\t0\t\t\tMP3\t320kbps\t/music/_Sem Genero/A/B.mp3')?.arquivo).toBe(
      '_Sem Genero/A/B.mp3',
    );
  });

  it('linha torta, id inválido e arquivo fora de /music são ignorados e contados', () => {
    expect(lerLinhaDeFaixa('lixo')).toBeNull();
    expect(lerLinhaDeFaixa('x\tA\tB\t0\t\t\tMP3\t1kbps\t/music/a.mp3')).toBeNull();
    expect(lerLinhaDeFaixa('1\tA\tB\t0\t\t\tMP3\t1kbps\t/outra/a.mp3')).toBeNull();
    expect(lerFaixas('lixo\n\n1\tA\tB\t0\t\t\tMP3\t320kbps\t/music/g/A/B.mp3\r\n')).toMatchObject({ ignoradas: 1 });
  });

  it('o BPM é arredondado para inteiro (o beets grava inteiro, mas o campo pode vir "150.0")', () => {
    expect(lerLinhaDeFaixa('1\tA\tB\t149.6\tAm\tX\tFLAC\t1kbps\t/music/X/A/B.flac')?.bpm).toBe(150);
  });
});

describe('rotuloDoFormato', () => {
  it.each([
    ['FLAC', '1000kbps', 'FLAC'],
    ['WAVE', '128kbps', 'WAV'],
    ['MP3', '320kbps', 'MP3 320'],
    ['MP3', '245kbps', 'MP3 245'],
    ['MP3', '', 'MP3'],
    ['AIFF', '1411kbps', 'AIFF'],
    ['', '', '?'],
  ])('%s %s → %s', (formato, bitrate, esperado) => {
    expect(rotuloDoFormato(formato, bitrate)).toBe(esperado);
  });
});

describe('ordenarFaixas', () => {
  it('artista, depois título, sem diferenciar maiúsculas nem acento de ordem', () => {
    const f = [
      faixa({ id: 3, artista: 'vendex', titulo: 'b' }),
      faixa({ id: 1, artista: 'Azyr', titulo: 'Power' }),
      faixa({ id: 2, artista: 'Azyr', titulo: 'No Escape' }),
      faixa({ id: 4, artista: 'Éter', titulo: 'x' }),
    ];
    expect(ordenarFaixas(f).map((x) => x.id)).toEqual([2, 1, 4, 3]);
  });
});

describe('semAnsi', () => {
  it('tira as cores que o beets coloca mesmo sem terminal', () => {
    expect(semAnsi('\u001b[1;31m  deleted\u001b[39;49;00m')).toBe('  deleted');
  });
});

describe('indicadores e busca', () => {
  const todas = [
    faixa({ id: 1 }),
    faixa({
      id: 2,
      artista: 'Vendex',
      titulo: 'Vengeance Of The Masked',
      bpm: null,
      tom: null,
      semGenero: true,
      genero: null,
    }),
    faixa({ id: 3, artista: 'Charlie Sparks', titulo: 'Tatakai', bpm: null }),
    faixa({ id: 4, artista: 'Cloudy', titulo: 'Yeah (Cloudy Remix)', tom: null }),
  ];
  const parados: ParadoEmDownloads[] = [
    { nome: 'f_hard', arquivos: ['a.mp3'], total: 1, modificadoEm: 1 },
    { nome: 'f_house', arquivos: ['b.mp3', 'c.mp3'], total: 5, modificadoEm: 2 },
  ];

  it('conta o que falta; os parados são arquivos, não pastas', () => {
    expect(contarIndicadores(todas, parados)).toEqual({ semBpm: 2, semTom: 2, semGenero: 1, parados: 6 });
  });

  it('cada indicador filtra a tabela', () => {
    expect(filtrarFaixas(todas, '', 'bpm').map((f) => f.id)).toEqual([2, 3]);
    expect(filtrarFaixas(todas, '', 'tom').map((f) => f.id)).toEqual([2, 4]);
    expect(filtrarFaixas(todas, '', 'gen').map((f) => f.id)).toEqual([2]);
    // "Parados em downloads/" olha para fora da biblioteca: a tabela fica vazia e a tela lista os parados
    expect(filtrarFaixas(todas, '', 'dl')).toEqual([]);
  });

  it('a busca acha por artista ou título, sem acento, sem maiúsculas, com todas as palavras', () => {
    expect(filtrarFaixas(todas, 'vendex', null).map((f) => f.id)).toEqual([2]);
    expect(filtrarFaixas(todas, 'YEAH remix', null).map((f) => f.id)).toEqual([4]);
    expect(filtrarFaixas(todas, 'cloudy vengeance', null)).toEqual([]);
    expect(filtrarFaixas(todas, '  ', null)).toHaveLength(4);
  });

  it('busca e indicador se combinam', () => {
    expect(filtrarFaixas(todas, 'charlie', 'bpm').map((f) => f.id)).toEqual([3]);
    expect(filtrarFaixas(todas, 'azyr', 'bpm')).toEqual([]);
  });
});

describe('termosDoFiltro (o filtro do beets vira argumentos, nunca uma string de shell)', () => {
  const termos = (t: string) => {
    const r = termosDoFiltro(t);
    if (!r.ok) throw new Error(`recusado: ${r.motivo}`);
    return r.termos;
  };

  it('as aspas juntam o que tem espaço num termo só', () => {
    expect(termos('title:"Northern Power"')).toEqual(['title:Northern Power']);
    expect(termos('artist:"Azyr" title:"Power (Extended Mix)"')).toEqual(['artist:Azyr', 'title:Power (Extended Mix)']);
    expect(termos('  Azyr   Power  ')).toEqual(['Azyr', 'Power']);
  });

  it('a vírgula (OU do beets) e a negação com ^ passam', () => {
    expect(termos('artist:Azyr , artist:Vendex')).toEqual(['artist:Azyr', ',', 'artist:Vendex']);
    expect(termos('artist:Azyr ^title:Power')).toEqual(['artist:Azyr', '^title:Power']);
  });

  it('metacaracteres de shell são texto comum: não há shell', () => {
    expect(termos('title:a;b&c|d$HOME')).toEqual(['title:a;b&c|d$HOME']);
  });

  it('vazio recusado: sem filtro o beets pegaria a biblioteca inteira', () => {
    for (const t of ['', '   ', '""', ',', '^artist:x', ', ^a']) {
      expect(termosDoFiltro(t)).toEqual({ ok: false, motivo: 'vazio' });
    }
  });

  it('aspas abertas recusadas', () => {
    expect(termosDoFiltro('title:"Northern')).toEqual({ ok: false, motivo: 'aspas' });
  });

  it('termo que começa com "-" recusado: o beets o leria como opção (-f, --format, -d...)', () => {
    for (const t of ['-d', '--format=x', 'artist:Azyr -f', '"-x"']) {
      expect(termosDoFiltro(t)).toEqual({ ok: false, motivo: 'opcao' });
    }
    // dentro de um valor o hífen é comum ("Hard-Techno", "e-motion")
    expect(termos('genres:Hard-Techno')).toEqual(['genres:Hard-Techno']);
  });

  it('termos demais ou grandes demais recusados', () => {
    expect(termosDoFiltro(Array.from({ length: 21 }, (_, i) => `a${i}`).join(' '))).toEqual({
      ok: false,
      motivo: 'muitos',
    });
    expect(termosDoFiltro(`title:${'x'.repeat(250)}`)).toEqual({ ok: false, motivo: 'longo' });
  });
});

describe('filtroDaFaixa', () => {
  it('propõe `id:N`: só a faixa clicada (artist: e title: são buscas por trecho e pegariam outras)', () => {
    expect(filtroDaFaixa({ id: 9 })).toBe('id:9');
    expect(termosDoFiltro('id:9')).toEqual({ ok: true, termos: ['id:9'] });
  });
});

describe('lerPrevia (o `-p` do beets)', () => {
  it('update -p real: uma faixa cujo arquivo sumiu será esquecida', () => {
    const p = lerPrevia('update', fixture('update-p.txt'));
    expect(p).toMatchObject({ afetadas: 1, esquecidas: 1, totalDeLinhas: 2 });
    expect(p.linhas).toEqual(['Azyr -  - No Escape', '  deleted']);
  });

  it('update -p sem nada a fazer', () => {
    expect(lerPrevia('update', '')).toMatchObject({ afetadas: 0, esquecidas: 0, totalDeLinhas: 0, linhas: [] });
  });

  it('update -p: tags editadas por fora contam como relidas, não como esquecidas', () => {
    const saida = [
      'Azyr -  - Power',
      '  bpm: 150 -> 152',
      'Cloudy -  - Yeah',
      '\u001b[1;31m  deleted\u001b[39;49;00m',
    ].join('\n');
    expect(lerPrevia('update', saida)).toMatchObject({ afetadas: 2, esquecidas: 1 });
  });

  it('move -p real: nada fora do lugar', () => {
    expect(lerPrevia('move', fixture('move-p.txt'))).toMatchObject({ afetadas: 0, esquecidas: 0 });
  });

  it('move -p real: o resumo vem no stderr e a lista no stdout; juntos dizem o que seria movido', () => {
    const stdout = fixture('move-p-1-stdout.txt');
    const stderr = fixture('move-p-1-stderr.txt');
    expect(stderr).toBe('Moving 1 item (1 already in place).\n');
    const p = lerPrevia('move', `${stderr}\n${stdout}`);
    expect(p.afetadas).toBe(1);
    // as cores do beets (o "Hard " em vermelho) saem
    expect(p.linhas).toEqual([
      'Moving 1 item (1 already in place).',
      '/music/Hard Techno/Azyr/Power (Extended Mix).wav',
      '  -> /music/Techno/Azyr/Power (Extended Mix).wav',
    ]);
  });

  it('move -p sem o resumo: cada "-> destino" é um arquivo a mover', () => {
    expect(lerPrevia('move', fixture('move-p-1-stdout.txt')).afetadas).toBe(1);
  });

  it('move -p: quantos seriam movidos', () => {
    const saida = 'Moving 3 items (12 already in place).\n  a -> b';
    expect(lerPrevia('move', saida)).toMatchObject({ afetadas: 3 });
  });

  it('limita as linhas mostradas mas conta todas', () => {
    const saida = Array.from({ length: 100 }, (_, i) => `faixa ${i}`).join('\n');
    const p = lerPrevia('update', saida);
    expect(p.linhas).toHaveLength(40);
    expect(p.totalDeLinhas).toBe(100);
  });
});

describe('tarefas de manutenção', () => {
  it('só as quatro que o app conhece', () => {
    for (const t of ['update', 'move', 'tomEBpm', 'importLeftovers']) expect(ehTarefaDeManutencao(t)).toBe(true);
    for (const t of ['ls', 'remove', 'modify', 'rm -rf', '', null, 3]) expect(ehTarefaDeManutencao(t)).toBe(false);
  });
});

describe('lerCompartilhamento (GET /api/v0/application do slskd)', () => {
  it('lê os arquivos e a varredura', () => {
    expect(lerCompartilhamento({ shares: { files: 1204, scanning: false } })).toEqual({
      arquivos: 1204,
      escaneando: false,
    });
    expect(lerCompartilhamento({ shares: { files: 0, scanning: true } })).toEqual({ arquivos: 0, escaneando: true });
  });

  it('resposta sem o que se espera não inventa número', () => {
    expect(lerCompartilhamento({})).toEqual({ arquivos: null, escaneando: false });
    expect(lerCompartilhamento(null)).toEqual({ arquivos: null, escaneando: false });
    expect(lerCompartilhamento({ shares: { files: '10' } })).toEqual({ arquivos: null, escaneando: false });
  });
});
