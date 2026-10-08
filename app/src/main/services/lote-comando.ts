// Monta o comando que inicia o baixar-lista.ps1 destacado do app (§3.4 e SP3). Tudo aqui é puro e testado, porque é
// o ponto onde aspas, espaços e acentos dão errado: o `-ArgumentList` do Start-Process junta os itens com espaço e
// SEM aspas, então todo item com espaço precisa das suas, e o comando inteiro vai em -EncodedCommand para não
// depender de nenhuma regra de aspas da linha de comando do Windows.
import { join } from 'node:path';
import { arquivosDaExecucao } from '@shared/lote';
import { argumentosDasOpcoes, type OpcoesLote } from '@shared/opcoes-lote';

export const POWERSHELL = 'powershell.exe';

export interface EntradaComando {
  /** pasta do Soulcrate (onde ficam o baixar-lista.ps1, o .env e lotes/) */
  dir: string;
  /** nome do arquivo da lista, dentro de `dir` */
  lista: string;
  idExecucao: string;
  opcoes: OpcoesLote;
  /** só para os testes ponta a ponta (apontam o script para um slskd falso) */
  slskdUrl?: string | null;
}

/** Argumentos do `powershell.exe` que roda o lote (sem as aspas do `-ArgumentList`; ver `comandoDoLancador`). */
export function argumentosDoLote(e: EntradaComando): string[] {
  const arq = arquivosDaExecucao(e.idExecucao);
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    join(e.dir, 'baixar-lista.ps1'),
    '-Lista',
    e.lista,
    '-IdExecucao',
    e.idExecucao,
    '-Eventos',
    arq.eventos,
    '-ArquivoParada',
    arq.parada,
    ...argumentosDasOpcoes(e.opcoes),
    ...(e.slskdUrl ? ['-SlskdUrl', e.slskdUrl] : []),
  ];
}

/** Texto entre aspas simples do PowerShell (`'` vira `''`; nada mais é especial lá dentro). */
export function literalPs(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

/** Item do `-ArgumentList`: com espaço, ganha aspas duplas (o Windows não permite `"` em nome de arquivo). */
export function itemDoArgumentList(valor: string): string {
  return /\s/.test(valor) ? `"${valor}"` : valor;
}

export interface EntradaLancador {
  argumentosDoLote: readonly string[];
  /** onde o lote grava a saída de texto e os erros (arquivos, não pipes: fechar o app não mata o lote) */
  saida: string;
  erro: string;
  cwd: string;
}

/** O PowerShell lançador: inicia o lote escondido, com stdout e stderr em arquivos, e sai. */
export function comandoDoLancador(e: EntradaLancador): string {
  const itens = e.argumentosDoLote.map((a) => literalPs(itemDoArgumentList(a))).join(', ');
  return [
    '$ErrorActionPreference = "Stop"',
    `Start-Process -FilePath ${literalPs(POWERSHELL)} -WindowStyle Hidden -WorkingDirectory ${literalPs(e.cwd)}` +
      ` -RedirectStandardOutput ${literalPs(e.saida)} -RedirectStandardError ${literalPs(e.erro)}` +
      ` -ArgumentList @(${itens})`,
  ].join('; ');
}

/** `-EncodedCommand`: base64 do texto em UTF-16 little-endian. */
export function codificarComando(comando: string): string {
  return Buffer.from(comando, 'utf16le').toString('base64');
}

/** Argumentos completos do lançador, prontos para o `spawn`. */
export function argumentosDoLancador(e: EntradaLancador): string[] {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    codificarComando(comandoDoLancador(e)),
  ];
}
