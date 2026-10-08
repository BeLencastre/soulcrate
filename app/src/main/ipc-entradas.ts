// Validação do que o renderer envia ao main nos canais da Fase 2: o renderer não é confiável (§6.1), então cada
// entrada é conferida campo a campo, com tipo e tamanho, antes de chegar aos serviços.
import type { ConfigEntrada, EntradaPasta, LoginNavidrome, OpcoesSetup, PastasConfig } from '@shared/configuracao';
import type { ArquivoRelatorio, CriterioLimpeza } from '@shared/historico';
import type { FinalidadePasta } from '@shared/ipc';
import {
  ehIdDeExecucao,
  LIMITE_LISTA_BYTES,
  nomeDeListaValido,
  type ArquivoExecucao,
  type ModeloLista,
  type OpcoesAnalise,
} from '@shared/lote';
import { validarOpcoes, type OpcoesLote } from '@shared/opcoes-lote';

/** Nenhum campo do formulário tem motivo para passar disto (uma senha de 255 caracteres já é enorme). */
const LIMITE_TEXTO = 1024;

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.length > LIMITE_TEXTO) throw new Error(`Campo inválido: ${campo}.`);
  return valor;
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') throw new Error(`Campo inválido: ${campo}.`);
  return valor;
}

function objeto(valor: unknown, campo: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error(`Campo inválido: ${campo}.`);
  return valor as Record<string, unknown>;
}

export function exigirEntrada(bruto: unknown): ConfigEntrada {
  const o = objeto(bruto, 'entrada');
  const p = objeto(o.pastas, 'pastas');
  const pastas: PastasConfig = {
    music: texto(p.music, 'pastas.music'),
    downloads: texto(p.downloads, 'pastas.downloads'),
    incomplete: texto(p.incomplete, 'pastas.incomplete'),
  };
  return {
    pastas,
    slskUsuario: texto(o.slskUsuario, 'slskUsuario'),
    slskSenha: texto(o.slskSenha, 'slskSenha'),
    webUsuario: texto(o.webUsuario, 'webUsuario'),
    webSenha: texto(o.webSenha, 'webSenha'),
    regenerarChaves: booleano(o.regenerarChaves, 'regenerarChaves'),
    tz: texto(o.tz, 'tz'),
    puid: texto(o.puid, 'puid'),
    pgid: texto(o.pgid, 'pgid'),
    musicbrainzContato: texto(o.musicbrainzContato, 'musicbrainzContato'),
    abrirParaRede: booleano(o.abrirParaRede, 'abrirParaRede'),
  };
}

export function exigirEntradaPasta(bruto: unknown): EntradaPasta {
  const o = objeto(bruto, 'pasta');
  if (o.modo !== 'nova' && o.modo !== 'existente') throw new Error('Campo inválido: modo.');
  return { modo: o.modo, caminho: texto(o.caminho, 'caminho') };
}

export function exigirLogin(bruto: unknown): LoginNavidrome {
  const o = objeto(bruto, 'login');
  const usuario = texto(o.usuario, 'usuario').trim();
  const senha = texto(o.senha, 'senha');
  if (!usuario || !senha) throw new Error('Informe o usuário e a senha.');
  if (/[\r\n\0]/.test(usuario + senha)) throw new Error('Usuário ou senha inválidos.');
  return { usuario, senha };
}

export function exigirOpcoesSetup(bruto: unknown): OpcoesSetup {
  const o = objeto(bruto, 'opcoes');
  if (o.modo !== 'ligar' && o.modo !== 'recriar') throw new Error('Campo inválido: modo.');
  const detalhe = o.detalheGravacao;
  if (detalhe !== undefined && detalhe !== null && typeof detalhe !== 'string')
    throw new Error('Campo inválido: detalheGravacao.');
  return { modo: o.modo, detalheGravacao: typeof detalhe === 'string' ? detalhe.slice(0, 200) : null };
}

export function exigirFinalidade(valor: unknown): FinalidadePasta {
  if (valor === 'project' || valor === 'music' || valor === 'downloads' || valor === 'incomplete') return valor;
  throw new Error('Finalidade de pasta desconhecida.');
}

// ---------------------------------------------------------------- Fase 3: listas e lote

export function exigirNomeDeLista(valor: unknown): string {
  if (!nomeDeListaValido(valor)) throw new Error('Nome de lista inválido.');
  return valor;
}

export function exigirModelo(valor: unknown): ModeloLista {
  if (valor === 'exemplo' || valor === 'vazia') return valor;
  throw new Error('Modelo de lista desconhecido.');
}

export function exigirTextoDaLista(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length > LIMITE_LISTA_BYTES) throw new Error('Texto da lista inválido.');
  return valor;
}

export function exigirBytes(valor: unknown): Uint8Array {
  if (!(valor instanceof Uint8Array) || valor.byteLength > LIMITE_LISTA_BYTES) throw new Error('Arquivo inválido.');
  return valor;
}

export function exigirOpcoesAnalise(bruto: unknown): OpcoesAnalise {
  const o = objeto(bruto, 'opcoes');
  return { biblioteca: booleano(o.biblioteca, 'biblioteca'), retentar: booleano(o.retentar, 'retentar') };
}

export function exigirInicioDeLote(bruto: unknown): { lista: string; opcoes: OpcoesLote } {
  const o = objeto(bruto, 'lote');
  return { lista: exigirNomeDeLista(o.lista), opcoes: validarOpcoes(o.opcoes) };
}

export function exigirRunId(valor: unknown): string {
  if (!ehIdDeExecucao(valor)) throw new Error('Execução inválida.');
  return valor;
}

export function exigirArquivoExecucao(valor: unknown): ArquivoExecucao {
  if (
    valor === 'resultado' ||
    valor === 'nao-baixadas' ||
    valor === 'diagnostico' ||
    valor === 'catalogo' ||
    valor === 'log'
  ) {
    return valor;
  }
  throw new Error('Arquivo da execução desconhecido.');
}

// ---------------------------------------------------------------- Fase 4: histórico e diagnóstico

export function exigirArquivoRelatorio(valor: unknown): ArquivoRelatorio {
  if (valor === 'beets') return valor;
  return exigirArquivoExecucao(valor);
}

/** A chave de uma faixa é a linha normalizada do script: texto curto, sem caracteres de controle. */
export function exigirChaveDeFaixa(valor: unknown): string {
  // eslint-disable-next-line no-control-regex -- caracteres de controle não existem numa chave
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > 400 || /[\u0000-\u001f]/.test(valor)) {
    throw new Error('Faixa inválida.');
  }
  return valor;
}

export function exigirTituloEscolhido(valor: unknown): string {
  // eslint-disable-next-line no-control-regex -- caracteres de controle não existem num título
  if (typeof valor !== 'string' || valor.trim().length === 0 || valor.length > 300 || /[\u0000-\u001f]/.test(valor)) {
    throw new Error('Título inválido.');
  }
  return valor;
}

export function exigirOpcoesDaCorrecao(bruto: unknown): { atualizarLista: boolean } {
  const o = objeto(bruto, 'opcoes');
  return { atualizarLista: booleano(o.atualizarLista, 'atualizarLista') };
}

export function exigirCriterioDeLimpeza(bruto: unknown): CriterioLimpeza {
  const o = objeto(bruto, 'criterio');
  if (o.tipo === 'idade') {
    if (typeof o.dias !== 'number' || !Number.isInteger(o.dias) || o.dias < 1 || o.dias > 3650) {
      throw new Error('Campo inválido: dias.');
    }
    return { tipo: 'idade', dias: o.dias };
  }
  if (o.tipo === 'manter') {
    if (typeof o.quantas !== 'number' || !Number.isInteger(o.quantas) || o.quantas < 0 || o.quantas > 100_000) {
      throw new Error('Campo inválido: quantas.');
    }
    return { tipo: 'manter', quantas: o.quantas };
  }
  throw new Error('Critério de limpeza desconhecido.');
}
