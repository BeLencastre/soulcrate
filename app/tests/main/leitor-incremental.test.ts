import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LeitorIncremental } from '../../src/main/leitor-incremental';

let dir: string;
let arquivo: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sc-leitor-'));
  arquivo = join(dir, 'eventos.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('LeitorIncremental (SP4)', () => {
  it('arquivo que ainda não existe: nada para ler', async () => {
    expect(await new LeitorIncremental(arquivo).lerNovas()).toEqual([]);
  });

  it('lê só o que chegou desde a última leitura', async () => {
    const l = new LeitorIncremental(arquivo);
    writeFileSync(arquivo, 'a\nb\n');
    expect(await l.lerNovas()).toEqual(['a', 'b']);
    expect(await l.lerNovas()).toEqual([]);
    appendFileSync(arquivo, 'c\n');
    expect(await l.lerNovas()).toEqual(['c']);
  });

  it('guarda o pedaço de linha sem \\n até a próxima leitura', async () => {
    const l = new LeitorIncremental(arquivo);
    writeFileSync(arquivo, 'um\ndo');
    expect(await l.lerNovas()).toEqual(['um']);
    appendFileSync(arquivo, 'is\ntrês\n');
    expect(await l.lerNovas()).toEqual(['dois', 'três']);
  });

  it('remonta linhas cortadas byte a byte, inclusive no meio de caracteres de 2, 3 e 4 bytes', async () => {
    const linhas = ['{"a":"Byørn – 2 LOUD áéíõç"}', '{"b":"€ 𝄞"}', '{"c":1}'];
    const bytes = Buffer.from(linhas.map((x) => `${x}\n`).join(''), 'utf8');
    const l = new LeitorIncremental(arquivo);
    writeFileSync(arquivo, '');
    const lidas: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      appendFileSync(arquivo, bytes.subarray(i, i + 1));
      lidas.push(...(await l.lerNovas()));
    }
    expect(lidas).toEqual(linhas);
  });

  it('ignora o BOM do começo e o \\r do fim de linha', async () => {
    const l = new LeitorIncremental(arquivo);
    writeFileSync(arquivo, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x\r\ny\r\n')]));
    expect(await l.lerNovas()).toEqual(['x', 'y']);
  });

  it('arquivo recriado (menor que o offset): recomeça do zero', async () => {
    const l = new LeitorIncremental(arquivo);
    writeFileSync(arquivo, 'aaaaaaaaaa\nbbbbbbbbbb\n');
    expect(await l.lerNovas()).toHaveLength(2);
    writeFileSync(arquivo, 'novo\n');
    expect(await l.lerNovas()).toEqual(['novo']);
  });

  it('um arquivo grande é lido por inteiro, em blocos, sem perder nem repetir linhas', async () => {
    const linhas = Array.from({ length: 30_000 }, (_, i) => `{"n":${i},"texto":"${'x'.repeat(60)}"}`);
    writeFileSync(arquivo, `${linhas.join('\n')}\n`);
    const lidas = await new LeitorIncremental(arquivo).lerNovas();
    expect(lidas).toHaveLength(linhas.length);
    expect(lidas[0]).toBe(linhas[0]);
    expect(lidas.at(-1)).toBe(linhas.at(-1));
  });
});
