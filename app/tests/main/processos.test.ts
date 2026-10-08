// Executor real, com processos de verdade (o próprio Node): saída, códigos, timeout, ENOENT e encerramento da árvore.
import { describe, expect, it } from 'vitest';
import { DivisorDeLinhas, ExecutorReal } from '../../src/main/processos';
import { ate } from './ajudantes';

const NODE = process.execPath;

describe('DivisorDeLinhas', () => {
  it('junta pedaços, trata \\r\\n, \\n e \\r, e devolve o resto no fim', () => {
    const linhas: string[] = [];
    const d = new DivisorDeLinhas((l) => linhas.push(l));
    d.adicionar('uma\ndu');
    d.adicionar('as\r\ntrês\rquatro');
    expect(linhas).toEqual(['uma', 'duas', 'três']);
    d.terminar();
    expect(linhas).toEqual(['uma', 'duas', 'três', 'quatro']);
    d.terminar();
    expect(linhas).toHaveLength(4);
  });
});

describe('ExecutorReal.executar', () => {
  const ex = new ExecutorReal();

  it('devolve stdout, stderr e o código de saída', async () => {
    const r = await ex.executar(NODE, ['-e', "console.log('olá, ç'); console.error('aviso'); process.exit(3)"]);
    expect(r).toMatchObject({
      codigo: 3,
      stdout: expect.stringContaining('olá, ç') as string,
      stderr: expect.stringContaining('aviso') as string,
      tempoEsgotado: false,
      erroSpawn: null,
    });
  });

  it('executável que não existe: erroSpawn ENOENT, sem lançar', async () => {
    const r = await ex.executar('soulcrate-programa-que-nao-existe', []);
    expect(r.erroSpawn?.code).toBe('ENOENT');
    expect(r.codigo).toBeNull();
  });

  it('timeout mata o processo e marca tempoEsgotado', async () => {
    const inicio = Date.now();
    const r = await ex.executar(NODE, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 300 });
    expect(r.tempoEsgotado).toBe(true);
    expect(Date.now() - inicio).toBeLessThan(5000);
    expect(ex.quantidadeVivos).toBe(0);
  });

  it('AbortSignal encerra o processo', async () => {
    const abort = new AbortController();
    const p = ex.executar(NODE, ['-e', 'setInterval(() => {}, 1000)'], { signal: abort.signal });
    setTimeout(() => abort.abort(), 200);
    const r = await p;
    expect(r.codigo).not.toBe(0);
    expect(ex.quantidadeVivos).toBe(0);
  });

  it('argumentos com espaços, aspas e metacaracteres chegam intactos (sem shell)', async () => {
    const estranho = 'a b "c" & echo hacked | %PATH% $(x) ; `y`';
    const r = await ex.executar(NODE, ['-e', 'process.stdout.write(process.argv[1])', estranho]);
    expect(r.stdout).toBe(estranho);
  });

  it('usa a pasta de trabalho pedida', async () => {
    const r = await ex.executar(NODE, ['-e', 'process.stdout.write(process.cwd())'], { cwd: process.env.TEMP ?? '.' });
    expect(r.stdout.toLowerCase()).toContain((process.env.TEMP ?? '').toLowerCase().replace(/\\$/, ''));
  });
});

describe('ExecutorReal.iniciar', () => {
  it('entrega linha a linha, de stdout e de stderr', async () => {
    const ex = new ExecutorReal();
    const linhas: [string, string][] = [];
    const p = ex.iniciar(NODE, ['-e', "console.log('a'); console.error('b'); console.log('c')"], {
      aoLinha: (l, f) => linhas.push([f, l]),
    });
    const r = await p.terminou;
    expect(r.codigo).toBe(0);
    expect(linhas.filter(([f]) => f === 'stdout').map(([, l]) => l)).toEqual(['a', 'c']);
    expect(linhas.filter(([f]) => f === 'stderr').map(([, l]) => l)).toEqual(['b']);
  });

  it('encerrar() derruba o processo e os filhos dele (como o `docker compose logs -f`)', async () => {
    const ex = new ExecutorReal();
    // o pai cria um neto que fica vivo e avisa o pid dele
    const codigo = `
      const { spawn } = require('node:child_process');
      const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      console.log('neto=' + neto.pid);
      setInterval(() => {}, 1000);
    `;
    let netoPid = 0;
    const p = ex.iniciar(NODE, ['-e', codigo], {
      aoLinha: (l) => {
        const m = /^neto=(\d+)/.exec(l);
        if (m) netoPid = Number(m[1]);
      },
    });
    await ate(() => netoPid > 0, 5000);
    p.encerrar();
    await p.terminou;
    // o neto também precisa ter morrido (taskkill /T no Windows)
    await ate(() => {
      try {
        process.kill(netoPid, 0);
        return false;
      } catch {
        return true;
      }
    }, 8000);
  });

  it('encerrarTodos() limpa tudo o que ficou vivo ao sair do app', async () => {
    const ex = new ExecutorReal();
    const a = ex.iniciar(NODE, ['-e', 'setInterval(() => {}, 1000)'], { aoLinha: () => undefined });
    const b = ex.iniciar(NODE, ['-e', 'setInterval(() => {}, 1000)'], { aoLinha: () => undefined });
    await ate(() => ex.quantidadeVivos === 2);
    ex.encerrarTodos();
    await Promise.all([a.terminou, b.terminou]);
    expect(ex.quantidadeVivos).toBe(0);
  });
});
