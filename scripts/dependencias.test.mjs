import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  ARQ_JUSTIFICATIVAS,
  ARQ_MAPA,
  coletar,
  ehManifesto,
  PENDENTE,
  problemaDeLicenca,
  problemas,
  separarImagem,
  sincronizar,
} from './dependencias.mjs';

let raiz;
const escrever = (rel, conteudo) => {
  mkdirSync(dirname(join(raiz, rel)), { recursive: true });
  writeFileSync(join(raiz, rel), typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2));
};
const lerJson = (rel) => JSON.parse(readFileSync(join(raiz, rel), 'utf8'));

function repositorioMinimo() {
  escrever('app/package.json', { dependencies: { yaml: '^2.9.1' }, devDependencies: { vitest: '^5.0.3' } });
  escrever('app/package-lock.json', {
    packages: {
      'node_modules/yaml': { version: '2.9.1', license: 'ISC' },
      'node_modules/vitest': { version: '5.0.3', license: 'MIT' },
    },
  });
  escrever('docker-compose.yml', 'services:\n  a:\n    image: slskd/slskd:0.26.0   # fixa\n  b:\n    image: local/soulbeet-dj:latest\n');
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'soulcrate-deps-'));
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('separarImagem', () => {
  test('tag simples', () => assert.deepEqual(separarImagem('deluan/navidrome:0.64.2'), { nome: 'deluan/navidrome', versao: '0.64.2' }));
  test('registro docker.io e digest encurtado', () =>
    assert.deepEqual(separarImagem(`docker.io/org/img:full@sha256:${'c419f11ee147'}${'6'.repeat(52)}`), {
      nome: 'org/img',
      versao: 'full@sha256:c419f11ee147',
    }));
  test('sem tag acusa a falta de versão fixa', () => assert.equal(separarImagem('debian').versao, 'latest (sem versão fixa)'));
  test('porta do registro não é confundida com tag', () =>
    assert.deepEqual(separarImagem('localhost:5000/img'), { nome: 'localhost:5000/img', versao: 'latest (sem versão fixa)' }));
});

describe('ehManifesto', () => {
  for (const caminho of ['app/package.json', 'app/package-lock.json', 'docker-compose.yml', 'soulbeet/Dockerfile', '.github/workflows/ci.yml', 'tests/x.Tests.ps1', 'app\\package.json']) {
    test(`reconhece ${caminho}`, () => assert.ok(ehManifesto(caminho)));
  }
  for (const caminho of ['app/src/main/index.ts', 'README.md', 'tests/dubles/x.ps1']) {
    test(`ignora ${caminho}`, () => assert.ok(!ehManifesto(caminho)));
  }
});

describe('coletar', () => {
  test('lê npm com versão travada e licença, e o compose sem as imagens locais', () => {
    repositorioMinimo();
    const deps = coletar(raiz);
    assert.deepEqual(
      deps.map((d) => d.id),
      ['docker:slskd/slskd', 'npm:vitest', 'npm:yaml'],
    );
    const yaml = deps.find((d) => d.id === 'npm:yaml');
    assert.equal(yaml.versao, '^2.9.1 → 2.9.1');
    assert.equal(yaml.licenca, 'ISC');
    assert.equal(yaml.escopo, 'runtime');
  });

  test('Dockerfile: imagens dos estágios, fontes fixadas por ARG e pacotes pip', () => {
    escrever(
      'soulbeet/Dockerfile',
      [
        'FROM docker.io/org/base:full@sha256:abcdef1234567890 AS base',
        'FROM debian:bookworm-slim AS compilador',
        'ARG LIBFOO_VERSION=v2.2.6',
        'ARG FOO_CLI_COMMIT=c8a0c6f188f2d9cf4e07',
        'ARG PINS="beetcamp==0.25.0 librosa==0.11.0"',
        'FROM base',
      ].join('\n'),
    );
    const deps = coletar(raiz);
    assert.deepEqual(
      deps.map((d) => `${d.id}@${d.versao}`),
      [
        'docker:debian@bookworm-slim',
        'docker:org/base@full@sha256:abcdef123456',
        'git:foo-cli@c8a0c6f188f2',
        'git:libfoo@v2.2.6',
        'pip:beetcamp@0.25.0',
        'pip:librosa@0.11.0',
      ],
    );
  });

  test('Actions e módulos do PowerShell somam as origens', () => {
    escrever('.github/workflows/ci.yml', 'steps:\n  - uses: actions/checkout@v4\n  - run: Install-Module Pester -MinimumVersion 5.5.0 -Force\n');
    escrever('.github/workflows/release.yml', 'steps:\n  - uses: actions/checkout@v4\n  - uses: ./.github/acao-local\n');
    escrever('tests/a.Tests.ps1', "\uFEFF#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }\n");
    const [checkout, pester] = coletar(raiz);
    assert.equal(checkout.id, 'actions:actions/checkout');
    assert.deepEqual(checkout.origens, ['.github/workflows/ci.yml', '.github/workflows/release.yml']);
    assert.equal(pester.id, 'psgallery:Pester');
    assert.equal(pester.versao, '>= 5.5.0');
    assert.equal(pester.escopo, 'ci, teste');
  });
});

describe('sincronizar', () => {
  test('dependência nova ganha motivo PENDENTE e o mapa é gravado', () => {
    repositorioMinimo();
    const r = sincronizar({ raiz, escrever: true });
    assert.deepEqual(r.novas, ['docker:slskd/slskd', 'npm:vitest', 'npm:yaml']);
    assert.equal(lerJson(ARQ_JUSTIFICATIVAS).dependencias['npm:yaml'].motivo, PENDENTE);
    assert.match(readFileSync(join(raiz, ARQ_MAPA), 'utf8'), /\| `yaml` \| \^2\.9\.1 → 2\.9\.1 \| runtime \| ISC \| PENDENTE \|/);
    assert.ok(problemas(r).some((p) => p.includes(PENDENTE)));
  });

  test('com motivo preenchido e mapa refeito, a conferência passa', () => {
    repositorioMinimo();
    sincronizar({ raiz, escrever: true });
    const dados = lerJson(ARQ_JUSTIFICATIVAS);
    for (const entrada of Object.values(dados.dependencias)) entrada.motivo = 'teste';
    escrever(ARQ_JUSTIFICATIVAS, dados);
    sincronizar({ raiz, escrever: true });
    assert.deepEqual(problemas(sincronizar({ raiz })), []);
  });

  test('--check não grava nada e acusa a dependência sem registro', () => {
    repositorioMinimo();
    const r = sincronizar({ raiz });
    assert.equal(r.gravou, false);
    assert.ok(r.mapaDesatualizado);
    const lista = problemas(r);
    assert.ok(lista.some((p) => p.startsWith('Dependências sem registro')));
    assert.ok(!lista.some((p) => p.includes(`motivo ${PENDENTE}`)), 'a mesma dependência não é acusada duas vezes');
  });

  test('dependência removida sai do registro', () => {
    repositorioMinimo();
    sincronizar({ raiz, escrever: true });
    escrever('app/package.json', { devDependencies: { vitest: '^5.0.3' } });
    const r = sincronizar({ raiz, escrever: true });
    assert.deepEqual(r.orfas, ['npm:yaml']);
    assert.equal(lerJson(ARQ_JUSTIFICATIVAS).dependencias['npm:yaml'], undefined);
  });

  test('fim de linha CRLF no mapa (checkout do Windows) não conta como desatualizado', () => {
    repositorioMinimo();
    sincronizar({ raiz, escrever: true });
    const mapa = readFileSync(join(raiz, ARQ_MAPA), 'utf8');
    writeFileSync(join(raiz, ARQ_MAPA), mapa.replace(/\n/g, '\r\n'));
    assert.equal(sincronizar({ raiz }).mapaDesatualizado, false);
  });
});

describe('problemaDeLicenca', () => {
  const dep = (licenca, escopo = 'runtime') => ({ id: 'npm:x', ecossistema: 'npm', licenca, escopo });
  test('permissiva passa', () => assert.equal(problemaDeLicenca(dep('MIT')), null));
  test('expressão OR com uma permissiva passa', () => assert.equal(problemaDeLicenca(dep('(GPL-3.0 OR MIT)')), null));
  test('copyleft em runtime é acusada', () => assert.match(problemaDeLicenca(dep('GPL-3.0')), /fora da lista permissiva/));
  test('sem licença em runtime é acusada', () => assert.match(problemaDeLicenca(dep('')), /sem licença/));
  test('dev não é conferida', () => assert.equal(problemaDeLicenca(dep('GPL-3.0', 'dev')), null));
});
