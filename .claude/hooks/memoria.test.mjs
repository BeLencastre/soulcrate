import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  aoEncerrar,
  aoIniciar,
  aoParar,
  aposFerramenta,
  ARQ_APRENDIZADOS,
  caminhoRelativo,
  carregarEstado,
  estadoVazio,
  precisaRevisar,
  resumoSessao,
} from './memoria.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SESSAO = 'sessao-de-teste-1234';
let raiz;
let saidas;
const escritaOriginal = process.stdout.write.bind(process.stdout);

const escrever = (rel, conteudo) => {
  mkdirSync(dirname(join(raiz, rel)), { recursive: true });
  writeFileSync(join(raiz, rel), typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2));
};
const respostas = () => saidas.map((s) => JSON.parse(s));
const editou = (rel) => aposFerramenta({ session_id: SESSAO, tool_name: 'Edit', tool_input: { file_path: join(raiz, rel) } }, raiz);

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'soulcrate-memoria-'));
  mkdirSync(join(raiz, 'scripts'));
  copyFileSync(join(REPO, 'scripts', 'dependencias.mjs'), join(raiz, 'scripts', 'dependencias.mjs'));
  escrever('docs/dependencias.justificativas.json', { dependencias: {} });
  saidas = [];
  process.stdout.write = (texto) => saidas.push(String(texto)) > 0;
  delete process.env.SOULCRATE_MEMORIA_REVISAO;
  delete process.env.SOULCRATE_MEMORIA_LIMIAR;
});
afterEach(() => {
  process.stdout.write = escritaOriginal;
  rmSync(raiz, { recursive: true, force: true });
});

describe('caminhoRelativo', () => {
  test('caminho absoluto dentro do repositório', () => assert.equal(caminhoRelativo(join(raiz, 'app', 'x.ts'), raiz), 'app/x.ts'));
  test('caminho relativo é resolvido a partir da raiz', () => assert.equal(caminhoRelativo('docs/a.md', raiz), 'docs/a.md'));
  test('fora do repositório é ignorado', () => assert.equal(caminhoRelativo(join(tmpdir(), 'outro.txt'), raiz), null));
  test('vazio é ignorado', () => assert.equal(caminhoRelativo(undefined, raiz), null));
});

describe('PostToolUse', () => {
  test('anota os arquivos alterados e os commits', async () => {
    await editou('app/src/a.ts');
    await editou('app/src/a.ts');
    await aposFerramenta({ session_id: SESSAO, tool_name: 'Bash', tool_input: { command: 'git add -A && git commit -m "x"' } }, raiz);
    const estado = carregarEstado(SESSAO, raiz);
    assert.deepEqual(estado.arquivos, ['app/src/a.ts']);
    assert.equal(estado.commits, 1);
    assert.equal(estado.comandos.length, 1);
  });

  test('manifesto alterado refaz o mapa e avisa da dependência nova', async () => {
    escrever('app/package.json', { dependencies: { 'left-pad': '^1.3.0' } });
    await editou('app/package.json');
    const [resposta] = respostas();
    assert.equal(resposta.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(resposta.hookSpecificOutput.additionalContext, /npm:left-pad/);
    assert.ok(existsSync(join(raiz, 'docs', 'dependencias.md')));
    assert.deepEqual(carregarEstado(SESSAO, raiz).dependencias.novas, ['npm:left-pad']);
  });

  test('só conta commit de verdade', async () => {
    const comandos = [
      'git update-index --add --chmod=+x .githooks/pre-commit .githooks/commit-msg',
      'cat .githooks/commit-msg',
      'git -C app commit -m "x"',
      'npm test && git commit -q -m "y"',
    ];
    for (const command of comandos) await aposFerramenta({ session_id: SESSAO, tool_name: 'Bash', tool_input: { command } }, raiz);
    assert.equal(carregarEstado(SESSAO, raiz).commits, 2);
  });

  test('npm install também dispara o mapa', async () => {
    escrever('app/package.json', { devDependencies: { vitest: '^5.0.0' } });
    await aposFerramenta({ session_id: SESSAO, tool_name: 'PowerShell', tool_input: { command: 'cd app; npm install -D vitest' } }, raiz);
    assert.match(respostas()[0].hookSpecificOutput.additionalContext, /npm:vitest/);
  });

  test('arquivo comum não mexe no mapa nem responde nada', async () => {
    await editou('README.md');
    assert.deepEqual(saidas, []);
    assert.ok(!existsSync(join(raiz, 'docs', 'dependencias.md')));
  });
});

describe('Stop', () => {
  test('bloqueia enquanto houver dependência com motivo PENDENTE', async () => {
    escrever('app/package.json', { dependencies: { 'left-pad': '^1.3.0' } });
    await aoParar({ session_id: SESSAO, stop_hook_active: false }, raiz);
    const [resposta] = respostas();
    assert.equal(resposta.decision, 'block');
    assert.match(resposta.reason, /npm:left-pad/);
  });

  test('não bloqueia de novo quando já está continuando por causa do hook', async () => {
    escrever('app/package.json', { dependencies: { 'left-pad': '^1.3.0' } });
    await aoParar({ session_id: SESSAO, stop_hook_active: true }, raiz);
    assert.deepEqual(saidas, []);
  });

  test('pede a revisão de aprendizados uma vez depois de 3 arquivos', async () => {
    for (const a of ['a.ts', 'b.ts', 'c.ts']) await editou(`app/src/${a}`);
    await aoParar({ session_id: SESSAO }, raiz);
    assert.equal(respostas()[0].decision, 'block');
    assert.match(respostas()[0].reason, /aprendizados\.md/);
    saidas = [];
    await aoParar({ session_id: SESSAO }, raiz);
    assert.deepEqual(saidas, [], 'a mesma etapa não é cobrada duas vezes');
  });

  test('editar os aprendizados conta como revisão feita', async () => {
    for (const a of ['a.ts', 'b.ts', 'c.ts']) await editou(`app/src/${a}`);
    await editou(ARQ_APRENDIZADOS);
    await aoParar({ session_id: SESSAO }, raiz);
    assert.deepEqual(saidas, []);
  });

  test('a revisão pode ser desligada por variável de ambiente', () => {
    const estado = { ...estadoVazio(SESSAO, raiz), pendentesRevisao: ['a', 'b', 'c', 'd'] };
    assert.ok(precisaRevisar(estado));
    process.env.SOULCRATE_MEMORIA_REVISAO = 'desligada';
    assert.ok(!precisaRevisar(estado));
  });

  test('commit com arquivo alterado também pede a revisão', () => {
    const estado = { ...estadoVazio(SESSAO, raiz), pendentesRevisao: ['a'], commitsPendentesRevisao: 1 };
    assert.ok(precisaRevisar(estado, 3));
  });
});

describe('resumo da sessão', () => {
  test('SessionEnd grava o resumo e o próximo SessionStart o mostra', async () => {
    await editou('app/src/a.ts');
    aoEncerrar({ session_id: SESSAO }, raiz);
    const arquivos = readdirSync(join(raiz, '.claude', 'memoria', 'sessoes'));
    assert.equal(arquivos.length, 1);
    assert.match(readFileSync(join(raiz, '.claude', 'memoria', 'sessoes', arquivos[0]), 'utf8'), /`app\/src\/a\.ts`/);

    await aoIniciar({ session_id: 'outra-sessao', source: 'startup' }, raiz);
    const contexto = respostas().at(-1).hookSpecificOutput.additionalContext;
    assert.match(contexto, /Sessões anteriores/);
    assert.match(contexto, /app\/src\/a\.ts/);
  });

  test('sessão sem nada feito não grava resumo', () => {
    aoEncerrar({ session_id: SESSAO }, raiz);
    assert.ok(!existsSync(join(raiz, '.claude', 'memoria', 'sessoes')));
  });

  test('o resumo lista arquivos e comandos', () => {
    const texto = resumoSessao({ ...estadoVazio(SESSAO, raiz), arquivos: ['x.ts'], comandos: ['git commit -m `a`'] });
    assert.match(texto, /## Arquivos\n\n- `x\.ts`/);
    assert.match(texto, /## Comandos relevantes\n\n- `git commit -m 'a'`/);
  });
});
