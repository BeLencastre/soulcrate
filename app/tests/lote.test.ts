import { describe, expect, it } from 'vitest';
import {
  arquivosDaExecucao,
  ehIdDeExecucao,
  idDeExecucao,
  nomeDeListaValido,
  nomeDoEstado,
  tipoDaLista,
} from '../src/shared/lote';

describe('nomeDeListaValido', () => {
  it.each(['lista.txt', 'set-sabado.txt', 'Set de Sábado.TXT', 'spotify.csv', 'lista (2).txt', 'a.b.txt'])(
    'aceita %s',
    (nome) => expect(nomeDeListaValido(nome)).toBe(true),
  );

  it.each([
    '',
    'lista',
    'lista.md',
    '..\\x.txt',
    '../x.txt',
    'sub/x.txt',
    'C:\\x.txt',
    'x:y.txt',
    '.env.txt',
    '..txt',
    'con.txt',
    'NUL.csv',
    'lpt1.txt',
    'a?.txt',
    'a*.txt',
    'a|b.txt',
    'a<b>.txt',
    'termina com ponto..txt.',
    'termina-com-espaco.txt ',
    'quebra\nlinha.txt',
    `${'a'.repeat(120)}.txt`,
  ])('recusa %j', (nome) => expect(nomeDeListaValido(nome)).toBe(false));

  it('recusa o que não é texto', () => {
    expect(nomeDeListaValido(undefined)).toBe(false);
    expect(nomeDeListaValido(42)).toBe(false);
    expect(nomeDeListaValido({ nome: 'a.txt' })).toBe(false);
  });
});

describe('nomeDoEstado (igual ao do baixar-lista.ps1)', () => {
  it.each([
    ['lista.txt', 'lista'],
    ['set-sabado.txt', 'set-sabado'],
    ['set de sábado.txt', 'set_de_sábado'],
    ['spotify (2).csv', 'spotify_2_'],
    ['a.b.txt', 'a_b'],
    ['Hard_Techno 2026!.txt', 'Hard_Techno_2026_'],
    ['açaí & café.txt', 'açaí_café'],
  ])('%s → estado-%s', (arquivo, esperado) => expect(nomeDoEstado(arquivo)).toBe(esperado));
});

describe('execução', () => {
  it('o id tem o formato do script (yyyyMMdd-HHmmss, hora local)', () => {
    expect(idDeExecucao(new Date(2026, 9, 7, 16, 10, 2))).toBe('20261007-161002');
    expect(idDeExecucao(new Date(2026, 0, 3, 4, 5, 6))).toBe('20260103-040506');
  });

  it('ids aceitos são os que o script aceita (letras, números, - e _)', () => {
    expect(ehIdDeExecucao('20261007-161002')).toBe(true);
    expect(ehIdDeExecucao('20261007-161002-2')).toBe(true);
    for (const ruim of ['', 'a b', '../x', 'a/b', 'x'.repeat(65), 7, null]) expect(ehIdDeExecucao(ruim)).toBe(false);
  });

  it('os arquivos da execução ficam em lotes/ e são conhecidos de antemão', () => {
    expect(arquivosDaExecucao('abc')).toEqual({
      eventos: 'lotes/eventos-abc.jsonl',
      parada: 'lotes/parar-abc.flag',
      saida: 'lotes/saida-abc.log',
      erro: 'lotes/erro-abc.log',
    });
  });

  it('tipo da lista pela extensão', () => {
    expect(tipoDaLista('a.txt')).toBe('txt');
    expect(tipoDaLista('a.CSV')).toBe('csv');
  });
});
