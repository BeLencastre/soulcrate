#!/usr/bin/env node
// Hooks do Claude Code que dão memória ao repositório (configurados em .claude/settings.json).
//
//   session-start  injeta no contexto: branch, commits recentes, resumo das últimas sessões e pendências
//   post-tool-use  anota o que a sessão mexeu; manifesto de dependência mudou → refaz o mapa de dependências
//   stop           cobra o motivo de dependência nova e pede a revisão de aprendizados quando a etapa mexeu em código
//   pre-compact / session-end   grava o resumo da sessão em .claude/memoria/sessoes/
//
// Memória durável e compartilhada: .claude/memoria/aprendizados.md (versionado, curado, carregado pelo CLAUDE.md).
// Memória de trabalho, local: .claude/memoria/sessoes/ e .claude/memoria/.estado/ (fora do git).
//
// Desligar: SOULCRATE_MEMORIA=desligada. Só a revisão de aprendizados: SOULCRATE_MEMORIA_REVISAO=desligada.
// Limiar da revisão (arquivos mexidos desde a última revisão): SOULCRATE_MEMORIA_LIMIAR (padrão 3).
//
// Um hook nunca pode travar a sessão: qualquer erro vira um aviso no stderr e saída 0.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = process.env.CLAUDE_PROJECT_DIR || resolve(AQUI, '..', '..');

export const ARQ_APRENDIZADOS = '.claude/memoria/aprendizados.md';
const PASTA_SESSOES = '.claude/memoria/sessoes';
const PASTA_ESTADO = '.claude/memoria/.estado';
const MAX_SESSOES = 30;
const MAX_COMANDOS = 40;

const FERRAMENTAS_DE_ARQUIVO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const FERRAMENTAS_DE_SHELL = new Set(['Bash', 'PowerShell']);
/** `git commit`, também com opções globais antes (`git -C app commit`); não casa com `.githooks/pre-commit`. */
const RE_COMMIT = /(?:^|[\s;&|(])git(?:\s+-[Cc]\s+\S+)*\s+commit\b/;
const RE_COMANDO_DE_DEPENDENCIA =
  /\b(?:npm|pnpm|yarn)\s+(?:i|install|add|uninstall|un|remove|rm|update|up|upgrade)\b|\bInstall-Module\b|\bdocker\s+compose\s+pull\b/i;
/** Arquivos que não contam como "mexeu em código" para a revisão de aprendizados. */
const RE_FORA_DA_REVISAO = /^(\.claude\/memoria\/|docs\/dependencias\.(md|justificativas\.json)$)/;

// ----------------------------------------------------------------------------------------------- utilidades

export function caminhoRelativo(caminho, raiz = RAIZ) {
  if (!caminho) return null;
  const absoluto = isAbsolute(caminho) ? caminho : resolve(raiz, caminho);
  const rel = relative(raiz, absoluto).replace(/\\/g, '/');
  return !rel || rel.startsWith('..') || isAbsolute(rel) ? null : rel;
}

function git(args, raiz = RAIZ) {
  const r = spawnSync('git', args, { cwd: raiz, encoding: 'utf8', timeout: 5000, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : '';
}

const agoraIso = () => new Date().toISOString();
const dataLocal = (iso = agoraIso()) => new Date(iso).toLocaleDateString('sv-SE');
const horaLocal = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const idCurto = (sessao) => String(sessao || 'sem-id').replace(/[^\w-]/g, '').slice(0, 8);

function lerEntrada() {
  try {
    const texto = readFileSync(0, 'utf8');
    return texto.trim() ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
}

const responder = (objeto) => process.stdout.write(`${JSON.stringify(objeto)}\n`);
const contextoAdicional = (evento, texto) => responder({ hookSpecificOutput: { hookEventName: evento, additionalContext: texto } });

// ----------------------------------------------------------------------------------------------- estado da sessão

function arquivoEstado(sessao, raiz) {
  return join(raiz, PASTA_ESTADO, `${idCurto(sessao)}.json`);
}

export function estadoVazio(sessao, raiz = RAIZ) {
  return {
    sessao: sessao || 'sem-id',
    inicio: agoraIso(),
    fim: null,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], raiz),
    arquivos: [],
    pendentesRevisao: [],
    commits: 0,
    commitsPendentesRevisao: 0,
    comandos: [],
    dependencias: { novas: [], removidas: [] },
    revisoes: 0,
    aprendizadosEditados: false,
  };
}

export function carregarEstado(sessao, raiz = RAIZ) {
  const arquivo = arquivoEstado(sessao, raiz);
  if (!existsSync(arquivo)) return estadoVazio(sessao, raiz);
  try {
    return { ...estadoVazio(sessao, raiz), ...JSON.parse(readFileSync(arquivo, 'utf8')) };
  } catch {
    return estadoVazio(sessao, raiz);
  }
}

export function salvarEstado(estado, raiz = RAIZ) {
  mkdirSync(join(raiz, PASTA_ESTADO), { recursive: true });
  writeFileSync(arquivoEstado(estado.sessao, raiz), JSON.stringify(estado, null, 2));
}

const adicionarUnico = (lista, item) => (lista.includes(item) ? lista : [...lista, item]);

// ----------------------------------------------------------------------------------------------- dependências

async function sincronizarDependencias(raiz) {
  const script = join(raiz, 'scripts', 'dependencias.mjs');
  if (!existsSync(script)) return null;
  const { sincronizar } = await import(pathToFileURL(script).href);
  return sincronizar({ raiz, escrever: true });
}

function textoPendenciasDependencias(resultado) {
  const linhas = [];
  if (resultado.novas.length) linhas.push(`Dependência nova detectada: ${resultado.novas.join(', ')}.`);
  if (resultado.orfas.length) linhas.push(`Dependência removida do mapa: ${resultado.orfas.join(', ')}.`);
  if (resultado.pendentes.length) {
    linhas.push(
      `Sem motivo registrado (PENDENTE): ${resultado.pendentes.join(', ')}. Preencha "motivo" (e "alternativas", se houve) ` +
        'em docs/dependencias.justificativas.json, rode `node scripts/dependencias.mjs` e confira docs/dependencias.md. ' +
        'O hook acabou de regravar esses arquivos: leia de novo antes de editar. Antes de manter a dependência, aplique a ' +
        'política do CLAUDE.md (seção Dependências): precisa mesmo, saúde do projeto, licença, tamanho, segurança e versão fixa.',
    );
  }
  if (resultado.licencas.length) linhas.push(`Licença a revisar: ${resultado.licencas.join('; ')}.`);
  return linhas.join('\n');
}

// ----------------------------------------------------------------------------------------------- resumo da sessão

export function resumoSessao(estado) {
  const linhas = [
    `# Sessão ${dataLocal(estado.inicio)} ${horaLocal(estado.inicio)} (${idCurto(estado.sessao)})`,
    '',
    `- Branch: \`${estado.branch || '?'}\``,
    `- Arquivos alterados: ${estado.arquivos.length} · commits: ${estado.commits} · revisões de aprendizado: ${estado.revisoes}`,
  ];
  if (estado.fim) linhas.push(`- Fim: ${dataLocal(estado.fim)} ${horaLocal(estado.fim)}`);
  if (estado.dependencias.novas.length) linhas.push(`- Dependências novas: ${estado.dependencias.novas.join(', ')}`);
  if (estado.dependencias.removidas.length) linhas.push(`- Dependências removidas: ${estado.dependencias.removidas.join(', ')}`);
  if (estado.arquivos.length) linhas.push('', '## Arquivos', '', ...estado.arquivos.map((a) => `- \`${a}\``));
  if (estado.comandos.length) linhas.push('', '## Comandos relevantes', '', ...estado.comandos.map((c) => `- \`${c.replace(/`/g, "'")}\``));
  return `${linhas.join('\n')}\n`;
}

function gravarResumo(estado, raiz) {
  if (!estado.arquivos.length && !estado.commits && !estado.comandos.length) return;
  const pasta = join(raiz, PASTA_SESSOES);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, `${dataLocal(estado.inicio)}_${idCurto(estado.sessao)}.md`), resumoSessao(estado));
  // mantém só as últimas MAX_SESSOES (o nome começa pela data, então a ordem alfabética é a cronológica)
  const antigos = readdirSync(pasta).filter((n) => n.endsWith('.md')).sort();
  for (const nome of antigos.slice(0, Math.max(0, antigos.length - MAX_SESSOES))) rmSync(join(pasta, nome), { force: true });
  const estados = join(raiz, PASTA_ESTADO);
  for (const nome of existsSync(estados) ? readdirSync(estados) : []) {
    const caminho = join(estados, nome);
    if (Date.now() - statSync(caminho).mtimeMs > 30 * 24 * 3600 * 1000) rmSync(caminho, { force: true });
  }
}

function sessoesRecentes(raiz, ignorar, quantas = 3) {
  const pasta = join(raiz, PASTA_SESSOES);
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((n) => n.endsWith('.md') && !n.includes(ignorar))
    .sort()
    .slice(-quantas)
    .reverse()
    .map((nome) => {
      const texto = readFileSync(join(pasta, nome), 'utf8');
      const titulo = texto.match(/^# (.+)$/m)?.[1] ?? nome;
      const contagem = texto.match(/^- Arquivos alterados: (.+)$/m)?.[1] ?? '';
      const branch = texto.match(/^- Branch: `(.+)`$/m)?.[1] ?? '?';
      const secao = texto.split(/^## Arquivos$/m)[1]?.split(/^## /m)[0] ?? '';
      const arquivos = [...secao.matchAll(/^- `([^`]+)`$/gm)].map((m) => m[1]).slice(0, 6);
      return `- ${titulo} em \`${branch}\`: ${contagem}${arquivos.length ? ` (${arquivos.join(', ')}${arquivos.length === 6 ? ', …' : ''})` : ''}`;
    });
}

// ----------------------------------------------------------------------------------------------- eventos

export async function aoIniciar(entrada, raiz = RAIZ) {
  const estado = carregarEstado(entrada.session_id, raiz);
  salvarEstado(estado, raiz);

  const partes = ['## Memória do repositório (hook SessionStart)'];
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], raiz);
  const commits = git(['log', '--oneline', '-5'], raiz);
  const sujos = git(['status', '--porcelain'], raiz).split('\n').filter(Boolean).length;
  partes.push(`Branch \`${branch || '?'}\`${sujos ? `, ${sujos} arquivo(s) com mudança não commitada` : ''}. Últimos commits:\n${commits || '(nenhum)'}`);

  if (entrada.source === 'compact' && estado.arquivos.length) {
    partes.push(`Esta sessão (antes da compactação) já mexeu em: ${estado.arquivos.slice(-20).join(', ')}.`);
  }
  const recentes = sessoesRecentes(raiz, idCurto(entrada.session_id));
  if (recentes.length) partes.push(`Sessões anteriores (resumo local em ${PASTA_SESSOES}/):\n${recentes.join('\n')}`);

  try {
    const resultado = await sincronizarDependencias(raiz);
    const texto = resultado && textoPendenciasDependencias(resultado);
    if (texto) partes.push(`Dependências:\n${texto}`);
  } catch (erro) {
    partes.push(`Dependências: não consegui conferir o mapa (${erro.message}).`);
  }

  partes.push(
    `Aprendizados duráveis do projeto: ${ARQ_APRENDIZADOS} (já carregado pelo CLAUDE.md). ` +
      'Registre lá o que for não óbvio e valer para as próximas sessões.',
  );
  contextoAdicional('SessionStart', partes.join('\n\n'));
}

export async function aposFerramenta(entrada, raiz = RAIZ) {
  const ferramenta = entrada.tool_name ?? '';
  const estado = carregarEstado(entrada.session_id, raiz);
  let checarDependencias = false;

  if (FERRAMENTAS_DE_ARQUIVO.has(ferramenta)) {
    const rel = caminhoRelativo(entrada.tool_input?.file_path ?? entrada.tool_input?.notebook_path, raiz);
    if (!rel) return;
    estado.arquivos = adicionarUnico(estado.arquivos, rel);
    if (rel === ARQ_APRENDIZADOS) {
      estado.aprendizadosEditados = true;
      estado.pendentesRevisao = [];
      estado.commitsPendentesRevisao = 0;
    } else if (!RE_FORA_DA_REVISAO.test(rel)) {
      estado.pendentesRevisao = adicionarUnico(estado.pendentesRevisao, rel);
    }
    const { ehManifesto } = await import(pathToFileURL(join(raiz, 'scripts', 'dependencias.mjs')).href).catch(() => ({}));
    checarDependencias = Boolean(ehManifesto?.(rel));
  } else if (FERRAMENTAS_DE_SHELL.has(ferramenta)) {
    const comando = String(entrada.tool_input?.command ?? '').trim();
    if (RE_COMMIT.test(comando)) {
      estado.commits += 1;
      estado.commitsPendentesRevisao += 1;
    }
    checarDependencias = RE_COMANDO_DE_DEPENDENCIA.test(comando);
    if (RE_COMMIT.test(comando) || checarDependencias || /\bgh\s+pr\b|\bgit\s+(push|merge|rebase|tag)\b/.test(comando)) {
      estado.comandos = [...estado.comandos, comando.split('\n')[0].slice(0, 200)].slice(-MAX_COMANDOS);
    }
  }

  let aviso = '';
  if (checarDependencias) {
    const resultado = await sincronizarDependencias(raiz);
    if (resultado) {
      resultado.novas.forEach((id) => (estado.dependencias.novas = adicionarUnico(estado.dependencias.novas, id)));
      resultado.orfas.forEach((id) => (estado.dependencias.removidas = adicionarUnico(estado.dependencias.removidas, id)));
      aviso = textoPendenciasDependencias(resultado);
    }
  }
  salvarEstado(estado, raiz);
  if (aviso) contextoAdicional('PostToolUse', `[hook de dependências] ${aviso}`);
}

export function limiarRevisao() {
  const n = Number.parseInt(process.env.SOULCRATE_MEMORIA_LIMIAR ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export function precisaRevisar(estado, limiar = limiarRevisao()) {
  if (process.env.SOULCRATE_MEMORIA_REVISAO === 'desligada') return false;
  return estado.pendentesRevisao.length >= limiar || (estado.commitsPendentesRevisao > 0 && estado.pendentesRevisao.length > 0);
}

export async function aoParar(entrada, raiz = RAIZ) {
  const estado = carregarEstado(entrada.session_id, raiz);
  try {
    // Já está continuando por causa deste hook: não bloqueia de novo (evita laço).
    if (entrada.stop_hook_active) return;

    const resultado = await sincronizarDependencias(raiz);
    if (resultado?.pendentes.length) {
      responder({
        decision: 'block',
        reason:
          `[hook Stop · dependências] Antes de encerrar, registre o motivo de: ${resultado.pendentes.join(', ')} ` +
          'em docs/dependencias.justificativas.json e rode `node scripts/dependencias.mjs` ' +
          '(ou remova a dependência, se ela não passa na política do CLAUDE.md). O CI recusa motivo PENDENTE.',
      });
      return;
    }

    if (precisaRevisar(estado)) {
      const amostra = estado.pendentesRevisao.slice(0, 8).join(', ');
      estado.pendentesRevisao = [];
      estado.commitsPendentesRevisao = 0;
      estado.revisoes += 1;
      responder({
        decision: 'block',
        reason:
          `[hook Stop · memória] Esta etapa mexeu em ${amostra}${estado.arquivos.length > 8 ? ', …' : ''}. ` +
          `Se ela revelou algo durável e não óbvio (decisão e o porquê, armadilha, comando que funciona, convenção, ` +
          `engano corrigido), registre em ${ARQ_APRENDIZADOS}, na seção certa, uma linha por item com a data de hoje. ` +
          'Corrija ou apague o item que ficou errado. Decisão de arquitetura vai em ADR (docs/adr/). ' +
          'Não registre o que o código, o git log ou o CONTRIBUTING já dizem, nem segredo. ' +
          'Se não há nada novo, não escreva nada e encerre normalmente.',
      });
    }
  } finally {
    salvarEstado(estado, raiz);
    gravarResumo(estado, raiz);
  }
}

export function antesDeCompactar(entrada, raiz = RAIZ) {
  gravarResumo(carregarEstado(entrada.session_id, raiz), raiz);
}

export function aoEncerrar(entrada, raiz = RAIZ) {
  const estado = carregarEstado(entrada.session_id, raiz);
  estado.fim = agoraIso();
  salvarEstado(estado, raiz);
  gravarResumo(estado, raiz);
}

// ----------------------------------------------------------------------------------------------- CLI

const EVENTOS = {
  'session-start': aoIniciar,
  'post-tool-use': aposFerramenta,
  stop: aoParar,
  'pre-compact': antesDeCompactar,
  'session-end': aoEncerrar,
};

async function principal() {
  if (process.env.SOULCRATE_MEMORIA === 'desligada') return;
  const evento = EVENTOS[process.argv[2]];
  if (!evento) {
    process.stderr.write(`memoria.mjs: evento desconhecido "${process.argv[2] ?? ''}" (use ${Object.keys(EVENTOS).join(', ')})\n`);
    return;
  }
  await evento(lerEntrada(), RAIZ);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((erro) => {
    process.stderr.write(`memoria.mjs: ${erro?.stack ?? erro}\n`);
  });
}
