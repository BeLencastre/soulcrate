import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { criarZip, dataDos } from '../../src/main/zip';
import { lerZip } from './ajudantes-zip';

const pastas: string[] = [];
afterEach(() => {
  while (pastas.length) rmSync(pastas.pop() as string, { recursive: true, force: true });
});

describe('criarZip', () => {
  it('guarda e devolve os arquivos (texto, vazio, binário e nome com acento)', () => {
    const binario = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7) % 256));
    const zip = criarZip([
      { nome: 'versoes.txt', dados: Buffer.from('app 1.0.0\r\nstack 1.0.0\r\n'.repeat(50), 'utf8') },
      { nome: 'logs/vazio.log', dados: Buffer.alloc(0) },
      { nome: 'logs/relatório-ação.txt', dados: Buffer.from('não encontrada ♪', 'utf8') },
      { nome: 'binario.bin', dados: binario },
    ]);
    const lido = lerZip(zip);
    expect([...lido.keys()]).toEqual(['versoes.txt', 'logs/vazio.log', 'logs/relatório-ação.txt', 'binario.bin']);
    expect(lido.get('versoes.txt')?.toString('utf8')).toBe('app 1.0.0\r\nstack 1.0.0\r\n'.repeat(50));
    expect(lido.get('logs/vazio.log')?.length).toBe(0);
    expect(lido.get('logs/relatório-ação.txt')?.toString('utf8')).toBe('não encontrada ♪');
    expect(lido.get('binario.bin')?.equals(binario)).toBe(true);
  });

  it('comprime o que se repete e não incha o que não comprime', () => {
    const repetido = Buffer.from('linha de log igual\n'.repeat(2000));
    const zip = criarZip([{ nome: 'a.log', dados: repetido }]);
    expect(zip.length).toBeLessThan(repetido.length / 10);
  });

  it('recusa nomes que escapariam da pasta de destino', () => {
    const dados = Buffer.from('x');
    for (const nome of ['../fora.txt', 'a/../../b.txt', '/abs.txt', 'C:/x.txt', 'a\\b.txt', '', 'a//b.txt']) {
      expect(() => criarZip([{ nome, dados }]), nome).toThrow(/inválido/);
    }
  });

  it('grava a data no formato do MS-DOS', () => {
    expect(dataDos(new Date(2026, 9, 8, 14, 30, 22))).toEqual({
      data: ((2026 - 1980) << 9) | (10 << 5) | 8,
      hora: (14 << 11) | (30 << 5) | 11,
    });
  });

  // o Expand-Archive do Windows é o leitor que o usuário (e o suporte) de fato vai usar
  it.skipIf(process.platform !== 'win32')('o Expand-Archive do Windows abre o pacote, acentos inclusive', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'sc-zip-'));
    pastas.push(raiz);
    const arquivo = join(raiz, 'pacote.zip');
    writeFileSync(
      arquivo,
      criarZip([
        { nome: 'app/main.log', dados: Buffer.from('linha 1\nlinha 2\n'.repeat(100)) },
        { nome: 'relatório.txt', dados: Buffer.from('não encontrada', 'utf8') },
        { nome: 'vazio.txt', dados: Buffer.alloc(0) },
      ]),
    );
    const destino = join(raiz, 'saida');
    const r = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${arquivo}' -DestinationPath '${destino}'`,
      ],
      { encoding: 'utf8' },
    );
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(readFileSync(join(destino, 'app', 'main.log'), 'utf8')).toBe('linha 1\nlinha 2\n'.repeat(100));
    expect(readFileSync(join(destino, 'relatório.txt'), 'utf8')).toBe('não encontrada');
    expect(readFileSync(join(destino, 'vazio.txt'), 'utf8')).toBe('');
  });
});
