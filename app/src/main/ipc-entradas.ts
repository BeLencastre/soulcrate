// Validação do que o renderer envia ao main nos canais da Fase 2: o renderer não é confiável (§6.1), então cada
// entrada é conferida campo a campo, com tipo e tamanho, antes de chegar aos serviços.
import type { ConfigEntrada, EntradaPasta, LoginNavidrome, OpcoesSetup, PastasConfig } from '@shared/configuracao';
import type { FinalidadePasta } from '@shared/ipc';

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
