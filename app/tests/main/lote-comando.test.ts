import { describe, expect, it } from 'vitest';
import {
  argumentosDoLancador,
  argumentosDoLote,
  codificarComando,
  comandoDoLancador,
  itemDoArgumentList,
  literalPs,
} from '../../src/main/services/lote-comando';
import { novasOpcoes } from '../../src/shared/opcoes-lote';

const dir = 'C:\\Users\\João da Silva\\Soulcrate';

describe('argumentosDoLote', () => {
  const base = { dir, lista: 'set-sabado.txt', idExecucao: '20261007-161002', opcoes: novasOpcoes() };

  it('chama o .ps1 direto (não o .bat) com lista, id, eventos e arquivo de parada', () => {
    expect(argumentosDoLote(base)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      `${dir}\\baixar-lista.ps1`,
      '-Lista',
      'set-sabado.txt',
      '-IdExecucao',
      '20261007-161002',
      '-Eventos',
      'lotes/eventos-20261007-161002.jsonl',
      '-ArquivoParada',
      'lotes/parar-20261007-161002.flag',
    ]);
  });

  it('acrescenta só as opções que diferem do padrão', () => {
    const a = argumentosDoLote({ ...base, opcoes: { ...novasOpcoes(), Paralelo: 8, AceitarWav: true } });
    expect(a.slice(14)).toEqual(['-Paralelo', '8', '-AceitarWav']);
  });

  it('só aponta o slskd para outro endereço quando pedido (testes ponta a ponta)', () => {
    expect(argumentosDoLote(base)).not.toContain('-SlskdUrl');
    expect(argumentosDoLote({ ...base, slskdUrl: 'http://127.0.0.1:1234' }).slice(-2)).toEqual([
      '-SlskdUrl',
      'http://127.0.0.1:1234',
    ]);
  });
});

describe('aspas', () => {
  it('texto do PowerShell entre aspas simples; a aspa simples é dobrada', () => {
    expect(literalPs('abc')).toBe("'abc'");
    expect(literalPs("O'Brien")).toBe("'O''Brien'");
    expect(literalPs('$x `y "z"')).toBe('\'$x `y "z"\'');
  });

  it('item do -ArgumentList: só ganha aspas duplas se tiver espaço', () => {
    expect(itemDoArgumentList('-Lista')).toBe('-Lista');
    expect(itemDoArgumentList('C:\\a b\\c.ps1')).toBe('"C:\\a b\\c.ps1"');
    expect(itemDoArgumentList('lista de sábado.txt')).toBe('"lista de sábado.txt"');
  });
});

describe('lançador', () => {
  const entrada = {
    argumentosDoLote: ['-File', `${dir}\\baixar-lista.ps1`, '-Lista', "lista do O'Brien.txt", '-Paralelo', '8'],
    saida: `${dir}\\lotes\\saida-x.log`,
    erro: `${dir}\\lotes\\erro-x.log`,
    cwd: dir,
  };

  it('é um Start-Process escondido, com a saída em arquivos e todo caminho com espaço entre aspas', () => {
    const c = comandoDoLancador(entrada);
    expect(c).toContain("Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden");
    expect(c).toContain(`-WorkingDirectory '${dir}'`);
    expect(c).toContain(`-RedirectStandardOutput '${dir}\\lotes\\saida-x.log'`);
    expect(c).toContain(`-RedirectStandardError '${dir}\\lotes\\erro-x.log'`);
    expect(c).toContain(`'"${dir}\\baixar-lista.ps1"'`);
    expect(c).toContain(`'"lista do O''Brien.txt"'`);
    expect(c).toContain("'-Paralelo', '8'");
    expect(c).not.toMatch(/-PassThru|-Wait/); // o lançador sai na hora; o lote segue sozinho
  });

  it('vai em -EncodedCommand (base64 de UTF-16LE): nenhuma regra de aspas da linha de comando importa', () => {
    const args = argumentosDoLancador(entrada);
    expect(args.slice(0, 5)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
    ]);
    expect(args).toHaveLength(6);
    const decodificado = Buffer.from(args[5] as string, 'base64').toString('utf16le');
    expect(decodificado).toBe(comandoDoLancador(entrada));
    expect(codificarComando('á')).toBe(Buffer.from('á', 'utf16le').toString('base64'));
  });
});
