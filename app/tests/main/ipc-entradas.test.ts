import { describe, expect, it } from 'vitest';
import {
  exigirEntrada,
  exigirEntradaPasta,
  exigirFinalidade,
  exigirLogin,
  exigirOpcoesSetup,
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
