import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  opcoesSugeridas,
  tipoDaTentativa,
  traduzirMotivo,
  traduzirTentativas,
  type TipoMotivo,
} from '../src/shared/motivos';

const REPO = join(import.meta.dirname, '..', '..');

/**
 * Cada linha da tabela "Decida pelo motivo" do README, com o texto exato que o baixar-lista.ps1 escreve em `reasons`
 * (baixar-lista.lib.ps1, `Test-File`) e o tipo de ação esperado.
 */
const CASOS: { readme: RegExp; bruto: string; tipo: TipoMotivo; acao: RegExp; sugere?: object; botao?: string }[] = [
  {
    readme: /^formato aiff\/m4a\/aac \(use -AceitarAacAiff\)$/,
    bruto: 'formato aiff (use -AceitarAacAiff)',
    tipo: 'aacAiff',
    acao: /-AceitarAacAiff/,
    sugere: { AceitarAacAiff: true, AceitarMp3320: true, AceitarMp3Menor: true },
  },
  {
    readme: /^formato aiff\/m4a\/aac \(use -AceitarAacAiff\)$/,
    bruto: 'formato m4a (use -AceitarAacAiff)',
    tipo: 'aacAiff',
    acao: /-AceitarAacAiff/,
    sugere: { AceitarAacAiff: true, AceitarMp3320: true, AceitarMp3Menor: true },
  },
  {
    readme: /^mp3 320 kbps \(use -AceitarMp3320\)$/,
    bruto: 'mp3 320 kbps (use -AceitarMp3320)',
    tipo: 'mp3320',
    acao: /-AceitarMp3320/,
    sugere: { AceitarAacAiff: true, AceitarMp3320: true, AceitarMp3Menor: true },
  },
  {
    readme: /^mp3 256 kbps$/,
    bruto: 'mp3 256 kbps (use -AceitarMp3Menor)',
    tipo: 'mp3Menor',
    acao: /-AceitarMp3Menor/,
    sugere: { AceitarAacAiff: true, AceitarMp3320: true, AceitarMp3Menor: true },
  },
  {
    readme: /^mp3 2xx kbps VBR \(use -AceitarMp3Menor\)$/,
    bruto: 'mp3 230 kbps VBR (use -AceitarMp3Menor)',
    tipo: 'mp3Menor',
    acao: /-AceitarMp3Menor/,
  },
  {
    readme: /^mp3 192\/128 kbps \(qualidade baixa\)$/,
    bruto: 'mp3 192 kbps (qualidade baixa)',
    tipo: 'mp3Baixo',
    acao: /Compre a faixa ou procure outra versão/,
    sugere: {},
  },
  {
    readme: /^aac 128 kbps \(qualidade baixa\)$/,
    bruto: 'aac 128 kbps (qualidade baixa)',
    tipo: 'aacBaixo',
    acao: /Compre a faixa ou procure outra versão/,
    sugere: {},
  },
  {
    readme: /^formato opus\/ogg\/wma$/,
    bruto: 'formato opus',
    tipo: 'formato',
    acao: /Compre a faixa ou baixe pelo Soulbeet/,
    botao: 'soulbeet',
  },
  {
    readme: /^titulo diferente$/,
    bruto: 'titulo diferente',
    tipo: 'titulo',
    acao: /título da linha provavelmente está errado/,
  },
  {
    readme: /^outro artista no nome$/,
    bruto: "outro artista no nome: 'Marie Vaunt'",
    tipo: 'outroArtista',
    acao: /A recusa estava certa/,
  },
  {
    readme: /^titulo so aparece junto do nome do artista$/,
    bruto: 'titulo so aparece junto do nome do artista',
    tipo: 'tituloComArtista',
    acao: /A recusa estava certa/,
  },
  {
    readme: /^palavra a mais no titulo$/,
    bruto: "palavra a mais no titulo: 'masked'",
    tipo: 'palavraExtra',
    acao: /-TituloAproximado/,
  },
  {
    readme: /^palavra a mais no titulo$/,
    bruto: "palavra a mais no titulo: 'power'",
    tipo: 'palavraExtra',
    acao: /a recusa estava certa/,
  },
  {
    readme: /^artista nao aparece$/,
    bruto: 'artista nao aparece',
    tipo: 'artista',
    acao: /Troque o artista principal/,
  },
  { readme: /^mix diferente$/, bruto: 'mix diferente', tipo: 'mix', acao: /nome exato do remix/ },
  {
    readme: /^outra versao \('edit'\)$/,
    bruto: "outra versao ('edit')",
    tipo: 'versao',
    acao: /versão "edit"/,
  },
  {
    readme: /^0 respostas$/,
    bruto: '0 respostas',
    tipo: 'semRespostas',
    acao: /Ninguém compartilha nada desse artista/,
  },
];

describe('tabela "Decida pelo motivo" do README', () => {
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  const secao = /\*\*2\. Decida pelo motivo:\*\*([\s\S]*?)Se a faixa aparece como `NAO EXISTE`/.exec(readme)?.[1] ?? '';
  const linhas = secao
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .slice(2); // cabeçalho e separador
  /** o primeiro bloco com crases de cada linha (mp3 tem dois, separados por " / ") */
  const motivos = linhas.flatMap((l) => {
    // o exemplo entre parênteses (ex.: `Vengeance Of The Masked`) não é um motivo
    const primeira = (l.split('|')[1] ?? '').replace(/\(ex\.:[^)]*\)/g, '');
    return [...primeira.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
  });

  it('encontrou a tabela e todas as linhas dela', () => {
    expect(linhas).toHaveLength(15);
  });

  it('toda linha do README tem um caso aqui (se o README ganhar um motivo, este teste avisa)', () => {
    const textos = [...new Set(motivos)];
    for (const t of textos) {
      // a coluna do README mistura o motivo e uma observação (`titulo diferente` + lista de títulos...)
      const coberto = CASOS.some((c) => c.readme.test(t));
      const observacao = /\+ lista|com o título certo|\(outra faixa\)|mesmo após/.test(t);
      expect(coberto || observacao, `o README tem um motivo sem caso no teste: ${t}`).toBe(true);
    }
  });

  it.each(CASOS)('$bruto → ação "$acao"', ({ bruto, tipo, acao, sugere, botao }) => {
    const m = traduzirMotivo(bruto, 3);
    expect(m.tipo).toBe(tipo);
    expect(m.n).toBe(3);
    expect(m.rotulo).not.toBe('');
    expect(m.acao).toMatch(acao);
    if (sugere) expect(m.sugere).toEqual(sugere);
    expect(m.botao).toBe(botao ?? null);
  });

  it('o motivo `0 respostas` (mesmo após a busca pelo artista) também tem ação', () => {
    expect(traduzirMotivo('0 respostas', 0).acao).toMatch(/Confira a grafia do artista, tente outro dia ou compre/);
  });
});

describe('traduzirMotivo', () => {
  it('"formato aiff/m4a" (com a opção) e "formato opus" (sem opção) não se confundem', () => {
    expect(traduzirMotivo('formato aif (use -AceitarAacAiff)', 1).tipo).toBe('aacAiff');
    expect(traduzirMotivo('formato aac (use -AceitarAacAiff)', 1).rotulo).toBe('Formato AAC');
    expect(traduzirMotivo('formato opus', 1).tipo).toBe('formato');
    expect(traduzirMotivo('formato ogg', 1).rotulo).toBe('Formato ogg');
  });

  it('lotes antigos (stack até 1.1.0): o WAV recusado por -AceitarWav não pede opção nenhuma, o AIFF pede -AceitarAacAiff', () => {
    const wav = traduzirMotivo('formato wav (use -AceitarWav)', 1);
    expect(wav.tipo).toBe('wav');
    expect(wav.sugere).toEqual({});
    expect(traduzirMotivo('formato aiff (use -AceitarWav)', 1).tipo).toBe('aacAiff');
  });

  it('o rótulo traz o que o script escreveu entre aspas', () => {
    expect(traduzirMotivo("outro artista no nome: 'Marie Vaunt'", 1).rotulo).toBe('Outro artista no nome: Marie Vaunt');
    expect(traduzirMotivo("palavra a mais no titulo: 'masked'", 1).rotulo).toBe('Palavra a mais no título: masked');
    expect(traduzirMotivo('mp3 256 kbps (use -AceitarMp3Menor)', 1).rotulo).toBe('MP3 256 kbps');
  });

  it('"título diferente" muda de conselho quando há sugestões', () => {
    expect(traduzirMotivo('titulo diferente', 1, { temSugestoes: true }).acao).toMatch(/sugeridos acima/);
    expect(traduzirMotivo('titulo diferente', 1, { temSugestoes: false }).acao).not.toMatch(/sugeridos acima/);
  });

  it('motivo que o app não conhece mostra o texto do script e manda olhar o arquivo mais parecido', () => {
    const m = traduzirMotivo('coisa nova do script', 2);
    expect(m.tipo).toBe('desconhecido');
    expect(m.rotulo).toBe('coisa nova do script');
    expect(m.acao).toMatch(/arquivo mais parecido/);
  });

  it('não liga sozinho a opção que aceita título errado (-TituloAproximado)', () => {
    expect(traduzirMotivo("palavra a mais no titulo: 'x'", 1).sugere).toEqual({});
  });
});

describe('tentativas de download que falharam', () => {
  it('classifica cada razão que o script escreve', () => {
    expect(tipoDaTentativa('fila longa em ruim (>4 min)')).toBe('fila');
    expect(tipoDaTentativa('tempo esgotado em ruim (>20 min)')).toBe('tempo');
    expect(tipoDaTentativa('transferencia sumiu da fila (ruim)')).toBe('sumiu');
    expect(tipoDaTentativa('nao enfileirou: 500')).toBe('naoEnfileirou');
    expect(tipoDaTentativa('ruim: Completed, Errored')).toBe('erroUsuario');
  });

  it('agrupa por tipo, o mais frequente primeiro, e a fila longa sugere a receita "usuários lentos"', () => {
    const m = traduzirTentativas([
      'ruim: Completed, Errored',
      'fila longa em a (>4 min)',
      'fila longa em b (>4 min)',
      'fila longa em c (>4 min)',
    ]);
    expect(m.map((x) => [x.tipo, x.n])).toEqual([
      ['fila', 3],
      ['erroUsuario', 1],
    ]);
    expect(m[0]?.sugere).toEqual({ FilaMaxMin: 10, DownloadMaxMin: 40 });
    expect(m[0]?.botao).toBe('receita-usuarios-lentos');
    expect(m[1]?.rotulo).toBe('A transferência falhou (Completed, Errored)');
    expect(m[1]?.sugere).toEqual({});
  });

  it('sem tentativas, nada', () => {
    expect(traduzirTentativas([])).toEqual([]);
  });
});

describe('opcoesSugeridas', () => {
  it('reúne o que os motivos pedem, sem repetir', () => {
    const motivos = [
      traduzirMotivo('formato aiff (use -AceitarAacAiff)', 2),
      traduzirMotivo('mp3 256 kbps (use -AceitarMp3Menor)', 1),
      ...traduzirTentativas(['fila longa em a (>4 min)']),
    ];
    expect(opcoesSugeridas(motivos)).toEqual({
      AceitarAacAiff: true,
      AceitarMp3320: true,
      AceitarMp3Menor: true,
      FilaMaxMin: 10,
      DownloadMaxMin: 40,
    });
  });

  it('motivos que só dizem "a recusa estava certa" não pedem nada', () => {
    expect(opcoesSugeridas([traduzirMotivo('titulo diferente', 3), traduzirMotivo('mix diferente', 1)])).toEqual({});
  });
});
