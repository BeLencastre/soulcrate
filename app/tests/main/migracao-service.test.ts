import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigracaoService } from '../../src/main/services/migracao-service';
import { ExecutorReal, type Executor } from '../../src/main/processos';
import { ARQUIVOS_DA_STACK } from '../../src/shared/stack-arquivos';

let raiz: string;
let origem: string;
let dir: string;

const p = (base: string, rel: string) => join(base, ...rel.split('/'));
function gravar(base: string, rel: string, texto: string): void {
  mkdirSync(join(p(base, rel), '..'), { recursive: true });
  writeFileSync(p(base, rel), texto);
}
const git = (...args: string[]) =>
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
const temGit = spawnSync('git', ['--version']).status === 0;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sc-migra-'));
  origem = join(raiz, 'app', 'stack');
  dir = join(raiz, 'clone do soulcrate');
  for (const a of ARQUIVOS_DA_STACK) {
    gravar(origem, a, `${a}@app`);
    gravar(dir, a, `${a}@app`);
  }
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('MigracaoService', () => {
  it('uma pasta igual ao que o app traz não tem nada a avisar', async () => {
    const r = await new MigracaoService({ executor: new ExecutorReal(), origemStack: origem }).analisar(dir);
    expect(r).toEqual({ clone: false, alteracoesLocais: [], diferentesDoApp: [], gitIndisponivel: false });
  });

  it('sem git, aponta os arquivos que diferem do app, sem contar a documentação', async () => {
    gravar(dir, 'baixar-lista.ps1', 'meu script');
    gravar(dir, 'README.md', 'meu readme');
    gravar(dir, 'VERSION', '9.9.9\n');
    const r = await new MigracaoService({ executor: new ExecutorReal(), origemStack: origem }).analisar(dir);
    expect(r.diferentesDoApp).toEqual(['baixar-lista.ps1']);
    expect(r.clone).toBe(false);
  });

  it.skipIf(!temGit)('num clone, o git diz quais arquivos da stack têm alteração local', async () => {
    git('init', '-q');
    git('add', '-A');
    expect(git('commit', '-q', '-m', 'base').status).toBe(0);
    gravar(dir, 'docker-compose.yml', 'compose editado à mão');
    gravar(dir, 'lista-minha.txt', 'arquivo do usuário, fora da stack');
    const r = await new MigracaoService({ executor: new ExecutorReal(), origemStack: origem }).analisar(dir);
    expect(r).toMatchObject({ clone: true, alteracoesLocais: ['docker-compose.yml'], gitIndisponivel: false });
    expect(r.diferentesDoApp).toEqual(['docker-compose.yml']);
  });

  it.skipIf(!temGit)(
    'num clone sem alterações locais, não avisa de nada (mesmo com versão diferente do app)',
    async () => {
      gravar(dir, 'baixar-lista.ps1', 'versão mais nova do clone');
      git('init', '-q');
      git('add', '-A');
      git('commit', '-q', '-m', 'base');
      const r = await new MigracaoService({ executor: new ExecutorReal(), origemStack: origem }).analisar(dir);
      expect(r.alteracoesLocais).toEqual([]);
      expect(r.diferentesDoApp).toEqual(['baixar-lista.ps1']);
    },
  );

  it('git ausente ou recusando a pasta: diz que não deu para consultar, e a comparação com o app continua valendo', async () => {
    mkdirSync(join(dir, '.git'));
    gravar(dir, 'subir.bat', 'meu subir');
    const semGit: Executor = {
      executar: () =>
        Promise.resolve({
          codigo: null,
          stdout: '',
          stderr: '',
          tempoEsgotado: false,
          erroSpawn: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        }),
      iniciar: () => {
        throw new Error('não usado');
      },
    };
    const r = await new MigracaoService({ executor: semGit, origemStack: origem }).analisar(dir);
    expect(r).toEqual({ clone: true, alteracoesLocais: [], diferentesDoApp: ['subir.bat'], gitIndisponivel: true });
  });

  it('sem os arquivos no app, só o git fala', async () => {
    const r = await new MigracaoService({ executor: new ExecutorReal(), origemStack: null }).analisar(dir);
    expect(r.diferentesDoApp).toEqual([]);
  });
});
