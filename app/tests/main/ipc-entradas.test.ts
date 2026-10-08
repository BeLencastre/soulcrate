import { describe, expect, it } from 'vitest';
import {
  exigirArquivoRelatorio,
  exigirChaveDeFaixa,
  exigirCriterioDeLimpeza,
  exigirEntrada,
  exigirEntradaPasta,
  exigirFiltro,
  exigirFinalidade,
  exigirIdDeFaixa,
  exigirLogin,
  exigirOpcoesDaCorrecao,
  exigirOpcoesSetup,
  exigirTarefa,
  exigirTituloEscolhido,
  exigirToken,
  exigirTokenOuNulo,
} from '../../src/main/ipc-entradas';
import { entradaVazia, type ConfigEntrada } from '../../src/shared/configuracao';

const valida = (): ConfigEntrada => ({
  ...entradaVazia({ tz: 'America/Sao_Paulo', pastas: { music: 'D:/m', downloads: 'D:/d', incomplete: 'D:/i' } }),
  slskUsuario: 'dj',
  slskSenha: 'x',
});

describe('exigirEntrada (o renderer não é confiável)', () => {
  it('aceita uma entrada completa e devolve só os campos conhecidos', () => {
    const e = exigirEntrada({ ...valida(), intruso: 'ignorado' });
    expect(e).toEqual(valida());
    expect(e).not.toHaveProperty('intruso');
  });

  it.each([
    ['null', null],
    ['texto', 'oi'],
    ['lista', []],
    ['sem pastas', { ...valida(), pastas: undefined }],
    ['pasta com número', { ...valida(), pastas: { music: 1, downloads: 'a', incomplete: 'b' } }],
    ['senha com número', { ...valida(), slskSenha: 123 }],
    ['booleano como texto', { ...valida(), abrirParaRede: 'sim' }],
    ['texto enorme', { ...valida(), webSenha: 'x'.repeat(5000) }],
  ])('recusa %s', (_nome, bruto) => {
    expect(() => exigirEntrada(bruto)).toThrow();
  });
});

describe('demais entradas', () => {
  it('pasta: modo e caminho', () => {
    expect(exigirEntradaPasta({ modo: 'nova', caminho: 'C:\\x' })).toEqual({ modo: 'nova', caminho: 'C:\\x' });
    expect(() => exigirEntradaPasta({ modo: 'outra', caminho: 'x' })).toThrow();
    expect(() => exigirEntradaPasta({ modo: 'nova', caminho: 5 })).toThrow();
  });

  it('login do Navidrome: usuário e senha não vazios e sem quebra de linha', () => {
    expect(exigirLogin({ usuario: ' antigo ', senha: 's' })).toEqual({ usuario: 'antigo', senha: 's' });
    expect(() => exigirLogin({ usuario: '', senha: 's' })).toThrow();
    expect(() => exigirLogin({ usuario: 'a', senha: '' })).toThrow();
    expect(() => exigirLogin({ usuario: 'a\nb', senha: 's' })).toThrow();
  });

  it('opções do setup: só ligar ou recriar', () => {
    expect(exigirOpcoesSetup({ modo: 'ligar' })).toEqual({ modo: 'ligar', detalheGravacao: null });
    expect(exigirOpcoesSetup({ modo: 'recriar', detalheGravacao: 'backup x' })).toEqual({
      modo: 'recriar',
      detalheGravacao: 'backup x',
    });
    expect(() => exigirOpcoesSetup({ modo: 'apagar' })).toThrow();
    expect(() => exigirOpcoesSetup({ modo: 'ligar', detalheGravacao: 5 })).toThrow();
  });

  it('finalidade da pasta', () => {
    expect(exigirFinalidade('music')).toBe('music');
    expect(() => exigirFinalidade('system32')).toThrow();
  });
});

describe('Fase 4: histórico e diagnóstico', () => {
  it('arquivo do relatório: os conhecidos, mais o log do beets', () => {
    for (const a of ['resultado', 'nao-baixadas', 'diagnostico', 'catalogo', 'log', 'beets']) {
      expect(exigirArquivoRelatorio(a)).toBe(a);
    }
    expect(() => exigirArquivoRelatorio('../../.env')).toThrow();
    expect(() => exigirArquivoRelatorio(undefined)).toThrow();
  });

  it('chave da faixa: texto curto, sem caractere de controle', () => {
    expect(exigirChaveDeFaixa('vendex abaddon')).toBe('vendex abaddon');
    for (const ruim of ['', 'a'.repeat(401), 'a\nb', 'a\0b', 5, null, {}]) {
      expect(() => exigirChaveDeFaixa(ruim), String(ruim)).toThrow();
    }
  });

  it('título escolhido: texto não vazio, curto, sem controle', () => {
    expect(exigirTituloEscolhido('Plague (Kyar Remix)')).toBe('Plague (Kyar Remix)');
    for (const ruim of ['', '   ', 'a'.repeat(301), 'a\r\nb', 7]) {
      expect(() => exigirTituloEscolhido(ruim), String(ruim)).toThrow();
    }
  });

  it('opções da correção: só `atualizarLista`, booleano', () => {
    expect(exigirOpcoesDaCorrecao({ atualizarLista: true })).toEqual({ atualizarLista: true });
    expect(() => exigirOpcoesDaCorrecao({ atualizarLista: 'sim' })).toThrow();
    expect(() => exigirOpcoesDaCorrecao(null)).toThrow();
  });

  it('critério de limpeza: idade em dias ou quantas manter, inteiros dentro do limite', () => {
    expect(exigirCriterioDeLimpeza({ tipo: 'idade', dias: 90 })).toEqual({ tipo: 'idade', dias: 90 });
    expect(exigirCriterioDeLimpeza({ tipo: 'manter', quantas: 0 })).toEqual({ tipo: 'manter', quantas: 0 });
    for (const ruim of [
      { tipo: 'idade', dias: 0 },
      { tipo: 'idade', dias: 1.5 },
      { tipo: 'idade', dias: 99999 },
      { tipo: 'idade' },
      { tipo: 'manter', quantas: -1 },
      { tipo: 'manter', quantas: '3' },
      { tipo: 'tudo' },
      'tudo',
      null,
    ]) {
      expect(() => exigirCriterioDeLimpeza(ruim), JSON.stringify(ruim)).toThrow();
    }
  });
});

describe('Fase 5: biblioteca', () => {
  it('filtro: texto de até 1024 caracteres (a validação do conteúdo é do serviço)', () => {
    expect(exigirFiltro('title:"Northern Power"')).toBe('title:"Northern Power"');
    for (const ruim of ['a'.repeat(1025), 5, null, undefined, {}]) {
      expect(() => exigirFiltro(ruim), String(ruim)).toThrow();
    }
  });

  it('token: texto curto e não vazio; nulo só onde a tarefa dispensa', () => {
    expect(exigirToken('abc-123')).toBe('abc-123');
    for (const ruim of ['', 'a'.repeat(101), 7, null]) expect(() => exigirToken(ruim), String(ruim)).toThrow();
    expect(exigirTokenOuNulo(null)).toBeNull();
    expect(exigirTokenOuNulo(undefined)).toBeNull();
    expect(exigirTokenOuNulo('abc')).toBe('abc');
    expect(() => exigirTokenOuNulo('')).toThrow();
  });

  it('tarefa: só as quatro de manutenção, nunca um comando do beets', () => {
    for (const t of ['update', 'move', 'tomEBpm', 'importLeftovers']) expect(exigirTarefa(t)).toBe(t);
    for (const ruim of ['ls', 'remove', 'modify', 'shell', '', null, 4]) {
      expect(() => exigirTarefa(ruim), String(ruim)).toThrow();
    }
  });

  it('id da faixa: inteiro seguro, não negativo (o renderer nunca manda caminho)', () => {
    expect(exigirIdDeFaixa(0)).toBe(0);
    expect(exigirIdDeFaixa(1204)).toBe(1204);
    for (const ruim of [-1, 1.5, NaN, Infinity, '3', '../x', null, 2 ** 60]) {
      expect(() => exigirIdDeFaixa(ruim), String(ruim)).toThrow();
    }
  });
});
