#!/usr/bin/env node
// Mapa de dependências do Soulcrate.
//
// Lê os manifestos do repositório (npm do app, imagens Docker, fontes fixadas no Dockerfile, GitHub Actions,
// módulos do PowerShell e a versão do Node), junta com o motivo de cada dependência registrado em
// docs/dependencias.justificativas.json e gera docs/dependencias.md.
//
//   node scripts/dependencias.mjs           atualiza o mapa; dependência nova ganha um motivo "PENDENTE"
//   node scripts/dependencias.mjs --check   só confere (CI e pre-commit): sai com 1 se algo estiver faltando
//   node scripts/dependencias.mjs --json    atualiza e imprime o resultado em JSON (usado pelos hooks)
//
// Sem dependências: só a biblioteca padrão do Node, para rodar antes do `npm ci`.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RAIZ_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ARQ_MAPA = 'docs/dependencias.md';
export const ARQ_JUSTIFICATIVAS = 'docs/dependencias.justificativas.json';
export const PENDENTE = 'PENDENTE';

/** Arquivos que declaram dependências: mexer em um deles pede o mapa refeito. Caminhos relativos, com "/". */
const MANIFESTOS = [
  /^app\/package(-lock)?\.json$/,
  /^app\/\.nvmrc$/,
  /^docker-compose\.ya?ml$/,
  /(^|\/)Dockerfile[^/]*$/,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^tests\/[^/]+\.ps1$/,
];

/** Licenças aceitas sem conversa nas dependências que vão dentro do app (o Soulcrate é MIT). */
const LICENCAS_PERMISSIVAS = new Set([
  '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'CC-BY-4.0', 'ISC', 'MIT',
  'OFL-1.1', 'Python-2.0', 'Unlicense', 'Zlib',
]);

const PASTAS_IGNORADAS = new Set(['.git', 'node_modules', '.claude', 'out', 'dist', 'coverage', 'test-results']);

export function ehManifesto(caminhoRelativo) {
  const p = caminhoRelativo.replace(/\\/g, '/').replace(/^\.\//, '');
  return MANIFESTOS.some((r) => r.test(p));
}

const ler = (raiz, rel) => readFileSync(join(raiz, rel), 'utf8').replace(/^﻿/, '');
const lerSeExiste = (raiz, rel) => (existsSync(join(raiz, rel)) ? ler(raiz, rel) : null);

function listarArquivos(raiz, filtro, rel = '') {
  const saida = [];
  for (const entrada of readdirSync(join(raiz, rel), { withFileTypes: true })) {
    if (PASTAS_IGNORADAS.has(entrada.name)) continue;
    const caminho = rel ? `${rel}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) saida.push(...listarArquivos(raiz, filtro, caminho));
    else if (filtro(caminho)) saida.push(caminho);
  }
  return saida.sort();
}

// ----------------------------------------------------------------------------------------------- coletores

export function coletarNpm(raiz) {
  const texto = lerSeExiste(raiz, 'app/package.json');
  if (!texto) return [];
  const pkg = JSON.parse(texto);
  const lock = JSON.parse(lerSeExiste(raiz, 'app/package-lock.json') ?? '{"packages":{}}');
  const secoes = [
    ['dependencies', 'runtime'],
    ['devDependencies', 'dev'],
    ['optionalDependencies', 'opcional'],
    ['peerDependencies', 'peer'],
  ];
  const deps = [];
  for (const [secao, escopo] of secoes) {
    for (const [nome, faixa] of Object.entries(pkg[secao] ?? {})) {
      const travada = lock.packages?.[`node_modules/${nome}`] ?? {};
      deps.push({
        id: `npm:${nome}`,
        ecossistema: 'npm',
        nome,
        versao: travada.version ? `${faixa} → ${travada.version}` : faixa,
        licenca: typeof travada.license === 'string' ? travada.license : '',
        escopo,
        origens: ['app/package.json'],
      });
    }
  }
  return deps;
}

export function coletarAmbiente(raiz) {
  const nvmrc = lerSeExiste(raiz, 'app/.nvmrc');
  return nvmrc
    ? [{ id: 'runtime:node', ecossistema: 'runtime', nome: 'Node.js', versao: nvmrc.trim(), escopo: 'dev', origens: ['app/.nvmrc'] }]
    : [];
}

/** "docker.io/org/img:tag@sha256:..." → { nome: "org/img", versao: "tag@sha256:abcdef123456" } */
export function separarImagem(ref) {
  let resto = ref.replace(/^docker\.io\//, '');
  let digest = '';
  const arroba = resto.indexOf('@');
  if (arroba >= 0) {
    digest = resto.slice(arroba + 1).replace(/^(sha256:[0-9a-f]{12})[0-9a-f]*$/, '$1');
    resto = resto.slice(0, arroba);
  }
  const doisPontos = resto.lastIndexOf(':');
  const temTag = doisPontos > resto.lastIndexOf('/');
  const nome = temTag ? resto.slice(0, doisPontos) : resto;
  const tag = temTag ? resto.slice(doisPontos + 1) : '';
  return { nome, versao: [tag || (digest ? '' : 'latest (sem versão fixa)'), digest].filter(Boolean).join('@') };
}

export function coletarCompose(raiz) {
  const deps = [];
  for (const rel of ['docker-compose.yml', 'docker-compose.yaml']) {
    const texto = lerSeExiste(raiz, rel);
    if (!texto) continue;
    for (const [, ref] of texto.matchAll(/^\s*image:\s*["']?([^\s"'#]+)/gm)) {
      if (ref.startsWith('local/')) continue; // imagem construída aqui: as dependências vêm do Dockerfile
      const { nome, versao } = separarImagem(ref);
      deps.push({ id: `docker:${nome}`, ecossistema: 'docker', nome, versao, escopo: 'runtime', origens: [rel] });
    }
  }
  return deps;
}

export function coletarDockerfiles(raiz) {
  const deps = [];
  for (const rel of listarArquivos(raiz, (c) => /(^|\/)Dockerfile[^/]*$/.test(c))) {
    const texto = ler(raiz, rel);
    const estagios = new Set();
    for (const [, ref, estagio] of texto.matchAll(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/gim)) {
      if (!estagios.has(ref) && ref !== 'scratch') {
        const { nome, versao } = separarImagem(ref);
        deps.push({ id: `docker:${nome}`, ecossistema: 'docker', nome, versao, escopo: 'build', origens: [rel] });
      }
      if (estagio) estagios.add(estagio);
    }
    // Fontes fixadas por ARG: XYZ_VERSION=v1.2 ou XYZ_COMMIT=<sha> (git clone) e listas "pacote==versão" (pip).
    for (const [, nomeArg, valor] of texto.matchAll(/^ARG\s+(\w+)=["']?([^"'\r\n]*)["']?\s*$/gm)) {
      const fixo = nomeArg.match(/^(\w+?)_(VERSION|COMMIT)$/);
      if (fixo) {
        const nome = fixo[1].toLowerCase().replace(/_/g, '-');
        const versao = fixo[2] === 'COMMIT' ? valor.slice(0, 12) : valor;
        deps.push({ id: `git:${nome}`, ecossistema: 'git', nome, versao, escopo: 'build', origens: [rel] });
        continue;
      }
      for (const [, nome, versao] of valor.matchAll(/(?:^|\s)([A-Za-z0-9_.-]+)==(\S+)/g)) {
        deps.push({ id: `pip:${nome.toLowerCase()}`, ecossistema: 'pip', nome, versao, escopo: 'build', origens: [rel] });
      }
    }
  }
  return deps;
}

export function coletarActions(raiz) {
  const pasta = '.github/workflows';
  if (!existsSync(join(raiz, pasta))) return [];
  const deps = [];
  for (const rel of listarArquivos(raiz, (c) => c.startsWith(`${pasta}/`) && /\.ya?ml$/.test(c), pasta)) {
    const texto = ler(raiz, rel);
    for (const [, nome, versao] of texto.matchAll(/^\s*-?\s*uses:\s*["']?([^\s"'#@]+)@([^\s"'#]+)/gm)) {
      if (nome.startsWith('./')) continue;
      deps.push({ id: `actions:${nome}`, ecossistema: 'actions', nome, versao, escopo: 'ci', origens: [rel] });
    }
    for (const [, nome, resto] of texto.matchAll(/Install-Module\s+(?:-Name\s+)?([\w.]+)([^\r\n]*)/g)) {
      const versao = resto.match(/-(?:Minimum|Required)Version\s+([\w.]+)/)?.[1];
      deps.push({ id: `psgallery:${nome}`, ecossistema: 'psgallery', nome, versao: versao ? `>= ${versao}` : '', escopo: 'ci', origens: [rel] });
    }
  }
  return deps;
}

export function coletarPowerShell(raiz) {
  if (!existsSync(join(raiz, 'tests'))) return [];
  const deps = [];
  for (const rel of listarArquivos(raiz, (c) => /^tests\/[^/]+\.ps1$/.test(c), 'tests')) {
    const texto = ler(raiz, rel);
    for (const [, corpo] of texto.matchAll(/^#Requires\s+-Modules\s+@\{([^}]*)\}/gim)) {
      const nome = corpo.match(/ModuleName\s*=\s*['"]([^'"]+)['"]/i)?.[1];
      const versao = corpo.match(/(?:Module|Required)Version\s*=\s*['"]([^'"]+)['"]/i)?.[1];
      if (nome) deps.push({ id: `psgallery:${nome}`, ecossistema: 'psgallery', nome, versao: versao ? `>= ${versao}` : '', escopo: 'teste', origens: [rel] });
    }
  }
  return deps;
}

/** Junta as ocorrências da mesma dependência (por id), somando origens, versões e escopos. */
export function consolidar(lista) {
  const porId = new Map();
  for (const dep of lista) {
    const atual = porId.get(dep.id);
    if (!atual) {
      porId.set(dep.id, { ...dep, origens: [...dep.origens], versoes: new Set([dep.versao]), escopos: new Set([dep.escopo]) });
      continue;
    }
    dep.origens.forEach((o) => atual.origens.includes(o) || atual.origens.push(o));
    atual.versoes.add(dep.versao);
    atual.escopos.add(dep.escopo);
    atual.licenca ||= dep.licenca;
  }
  return [...porId.values()]
    .map(({ versoes, escopos, ...dep }) => ({
      ...dep,
      versao: [...versoes].filter(Boolean).join(' · '),
      escopo: [...escopos].join(', '),
      origens: dep.origens.sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function coletar(raiz = RAIZ_PADRAO) {
  return consolidar([
    ...coletarNpm(raiz),
    ...coletarAmbiente(raiz),
    ...coletarCompose(raiz),
    ...coletarDockerfiles(raiz),
    ...coletarActions(raiz),
    ...coletarPowerShell(raiz),
  ]);
}

// ----------------------------------------------------------------------------------------------- registro

export function lerJustificativas(raiz = RAIZ_PADRAO) {
  const texto = lerSeExiste(raiz, ARQ_JUSTIFICATIVAS);
  if (!texto) return { dependencias: {} };
  const dados = JSON.parse(texto);
  return { ...dados, dependencias: dados.dependencias ?? {} };
}

const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local

export function serializarJustificativas(dados) {
  const ordenadas = Object.fromEntries(Object.entries(dados.dependencias).sort(([a], [b]) => a.localeCompare(b, 'en')));
  return `${JSON.stringify({ ...dados, dependencias: ordenadas }, null, 2)}\n`;
}

export function problemaDeLicenca(dep) {
  if (dep.ecossistema !== 'npm' || !dep.escopo.includes('runtime')) return null;
  if (!dep.licenca) return `${dep.id}: sem licença declarada no package-lock.json`;
  const partes = dep.licenca.replace(/[()]/g, '').split(/\s+OR\s+/);
  return partes.some((l) => LICENCAS_PERMISSIVAS.has(l.trim()))
    ? null
    : `${dep.id}: licença ${dep.licenca} fora da lista permissiva (o app é distribuído sob MIT); registre a análise em "licencaRevisada"`;
}

// ----------------------------------------------------------------------------------------------- mapa

const ECOSSISTEMAS = [
  ['npm', 'npm (app desktop)', 'O que o `npm ci` instala em `app/`. **runtime** vai dentro do instalador; **dev** só no desenvolvimento, no build e nos testes.'],
  ['docker', 'Imagens Docker', 'Imagens que a stack roda (`docker-compose.yml`, escopo runtime) ou usa para construir a imagem do Soulbeet (`Dockerfile`, escopo build).'],
  ['git', 'Fontes compiladas no build', 'Repositórios clonados e compilados dentro do `Dockerfile`, fixados por tag ou commit.'],
  ['pip', 'Pacotes Python', 'Instalados por cima da imagem do Soulbeet (plugins do beets).'],
  ['actions', 'GitHub Actions', 'Ações de terceiros usadas pelos workflows do CI e da release.'],
  ['psgallery', 'Módulos do PowerShell', 'Instalados da PowerShell Gallery para os testes.'],
  ['runtime', 'Ambiente', 'Ferramentas que precisam estar na máquina de quem desenvolve.'],
];

const celula = (texto) => String(texto ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function gerarMapa(deps, justificativas) {
  const motivoDe = (id) => justificativas.dependencias[id]?.motivo ?? PENDENTE;
  const linhas = [
    '# Mapa de dependências',
    '',
    '<!-- Gerado por `node scripts/dependencias.mjs`. Não edite à mão: mude o manifesto ou o motivo em dependencias.justificativas.json e rode o script de novo. -->',
    '',
    'Tudo de que o Soulcrate depende e **por que** depende. O mapa é refeito a partir dos manifestos pelo `scripts/dependencias.mjs` (os hooks do Claude Code rodam o script quando um manifesto muda, e o CI confere que ele está em dia). O motivo de cada item mora em [`dependencias.justificativas.json`](dependencias.justificativas.json); a política para adicionar uma dependência está no [`CLAUDE.md`](../CLAUDE.md#dependências).',
    '',
  ];
  const contagem = ECOSSISTEMAS.map(([eco, titulo]) => [titulo, deps.filter((d) => d.ecossistema === eco).length]).filter(([, n]) => n);
  linhas.push(`**${deps.length} dependências:** ${contagem.map(([t, n]) => `${t.toLowerCase()} ${n}`).join(' · ')}.`, '');

  const pendentes = deps.filter((d) => motivoDe(d.id) === PENDENTE);
  if (pendentes.length) {
    linhas.push('> [!WARNING]', `> Sem motivo registrado: ${pendentes.map((d) => `\`${d.id}\``).join(', ')}.`, '');
  }

  for (const [eco, titulo, descricao] of ECOSSISTEMAS) {
    const doGrupo = deps.filter((d) => d.ecossistema === eco);
    if (!doGrupo.length) continue;
    const comLicenca = eco === 'npm';
    linhas.push(`## ${titulo}`, '', descricao, '');
    linhas.push(comLicenca ? '| Pacote | Versão | Escopo | Licença | Por que existe |' : '| Nome | Versão | Escopo | Onde | Por que existe |');
    linhas.push(comLicenca ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- |');
    for (const d of doGrupo) {
      const quarta = comLicenca ? d.licenca || '?' : d.origens.map((o) => `\`${o}\``).join(', ');
      linhas.push(`| \`${celula(d.nome)}\` | ${celula(d.versao) || '—'} | ${d.escopo} | ${celula(quarta)} | ${celula(motivoDe(d.id))} |`);
    }
    linhas.push('');
  }
  return `${linhas.join('\n').trimEnd()}\n`;
}

// ----------------------------------------------------------------------------------------------- orquestração

const normalizarFimDeLinha = (t) => (t ?? '').replace(/\r\n/g, '\n');

/**
 * Compara manifestos, registro de motivos e mapa.
 * Com `escrever`, cria o motivo PENDENTE das dependências novas, remove o das que saíram e regrava o mapa.
 */
export function sincronizar({ raiz = RAIZ_PADRAO, escrever = false } = {}) {
  const deps = coletar(raiz);
  const justificativas = lerJustificativas(raiz);
  const ids = new Set(deps.map((d) => d.id));

  const novas = deps.filter((d) => !justificativas.dependencias[d.id]).map((d) => d.id);
  const orfas = Object.keys(justificativas.dependencias).filter((id) => !ids.has(id));

  const atualizado = { ...justificativas, dependencias: { ...justificativas.dependencias } };
  for (const id of novas) atualizado.dependencias[id] = { motivo: PENDENTE, adicionada: hoje() };
  for (const id of orfas) delete atualizado.dependencias[id];

  const pendentes = deps.filter((d) => atualizado.dependencias[d.id].motivo === PENDENTE).map((d) => d.id);
  const licencas = deps
    .filter((d) => !atualizado.dependencias[d.id].licencaRevisada)
    .map(problemaDeLicenca)
    .filter(Boolean);

  const mapa = gerarMapa(deps, atualizado);
  const mapaAtual = normalizarFimDeLinha(lerSeExiste(raiz, ARQ_MAPA));
  const registroMudou = novas.length > 0 || orfas.length > 0;
  const mapaDesatualizado = mapaAtual !== mapa;

  if (escrever) {
    if (registroMudou || mapaDesatualizado) mkdirSync(join(raiz, dirname(ARQ_MAPA)), { recursive: true });
    if (registroMudou) writeFileSync(join(raiz, ARQ_JUSTIFICATIVAS), serializarJustificativas(atualizado));
    if (mapaDesatualizado) writeFileSync(join(raiz, ARQ_MAPA), mapa);
  }

  return {
    total: deps.length,
    novas,
    orfas,
    pendentes,
    licencas,
    mapaDesatualizado: escrever ? false : mapaDesatualizado,
    registroDesatualizado: escrever ? false : registroMudou,
    gravou: escrever && (registroMudou || mapaDesatualizado),
  };
}

export function problemas(resultado) {
  const lista = [];
  const semRegistro = resultado.registroDesatualizado ? resultado.novas : [];
  if (semRegistro.length) lista.push(`Dependências sem registro em ${ARQ_JUSTIFICATIVAS}: ${semRegistro.join(', ')}`);
  if (resultado.registroDesatualizado && resultado.orfas.length) {
    lista.push(`Registro de dependências que não existem mais: ${resultado.orfas.join(', ')}`);
  }
  const pendentes = resultado.pendentes.filter((id) => !semRegistro.includes(id));
  if (pendentes.length) lista.push(`Dependências com motivo ${PENDENTE}: ${pendentes.join(', ')}`);
  lista.push(...resultado.licencas);
  if (resultado.mapaDesatualizado) lista.push(`${ARQ_MAPA} está desatualizado`);
  return lista;
}

function principal(argv) {
  const conferir = argv.includes('--check');
  const resultado = sincronizar({ escrever: !conferir });
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(resultado)}\n`);
    return 0;
  }
  const lista = problemas(resultado);
  if (!conferir) {
    if (resultado.novas.length) console.log(`Novas: ${resultado.novas.join(', ')} (motivo ${PENDENTE} criado em ${ARQ_JUSTIFICATIVAS})`);
    if (resultado.orfas.length) console.log(`Removidas do registro: ${resultado.orfas.join(', ')}`);
    console.log(resultado.gravou ? `Mapa atualizado: ${ARQ_MAPA} (${resultado.total} dependências)` : `Mapa em dia (${resultado.total} dependências)`);
  }
  if (!lista.length) {
    if (conferir) console.log(`Dependências em dia (${resultado.total}).`);
    return 0;
  }
  console.error(lista.map((p) => `✗ ${p}`).join('\n'));
  console.error(`\nRode \`node scripts/dependencias.mjs\`, preencha o "motivo" em ${ARQ_JUSTIFICATIVAS} e commite os dois arquivos.`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv.slice(2));
}
