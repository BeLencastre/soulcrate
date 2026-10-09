// Histórico e diagnóstico (Fase 4): como ler uma execução de `lotes/` e transformá-la no que as telas mostram.
// Puro: o main lê os arquivos e entrega o texto/os eventos; aqui se decide o que cada execução significa. Uma execução
// do app tem o arquivo de eventos (JSONL, P3); uma do `.bat` antigo só tem o `resultado-*.txt` (e o `diagnostico-*.txt`),
// e a mesma estrutura sai das duas.
import type {
  CatalogResult,
  EventoLote,
  Formato,
  ItemDiagnostic,
  MotivoFim,
  Progress,
  RunEnd,
  RunStart,
  ArquivosExecucao,
} from './eventos-lote.js';
import { ehStatusFinal, infoDoStatus, separarLinha, type CorStatus } from './lote-estado.js';
import type { ArquivoExecucao, ListaRef } from './lote.js';
import { msg } from './mensagens.js';
import { opcoesSugeridas, traduzirMotivo, traduzirTentativas, type MotivoTraduzido } from './motivos.js';
import {
  ehOpcaoBooleana,
  ehOpcaoNumerica,
  LIMITES,
  novasOpcoes,
  OPCOES_PADRAO,
  type OpcaoId,
  type OpcoesLote,
} from './opcoes-lote.js';
import { normalizar, semBom } from './texto.js';

// ---------------------------------------------------------------- Tipos que atravessam o IPC

export type FimExecucao = 'rodando' | MotivoFim;
/** de onde veio a leitura: eventos (P3), só o `resultado-*.txt` (execução antiga) ou só o log da tela */
export type FonteExecucao = 'eventos' | 'resultado' | 'log';

export interface ContagemExecucao {
  total: number;
  /** importada + baixada */
  ok: number;
  /** não encontrada + falhou (as linhas do `nao-baixadas-*.txt`) */
  naoVieram: number;
  /** já feita + já na biblioteca */
  puladas: number;
  /** baixada, mas o beets falhou */
  atencao: number;
  /** o que sobrou: faixas em andamento ou que nem chegaram a começar */
  naoTerminadas: number;
}

export interface ExecucaoResumo {
  id: string;
  /** epoch ms */
  inicio: number;
  duracaoMs: number | null;
  /** nome da lista como a execução registrou; null nas antigas */
  lista: string | null;
  fonte: FonteExecucao;
  fim: FimExecucao;
  /** `message` do `run.end` (o motivo, quando terminou com erro) */
  mensagem: string;
  contagem: ContagemExecucao;
  /** só enquanto roda: quantas já terminaram */
  progresso: { feitas: number; total: number } | null;
  temFaltas: boolean;
}

/** Arquivos de uma execução que o botão "Abrir" sabe abrir. */
export type ArquivoRelatorio = ArquivoExecucao | 'beets';

export interface ArquivoRelatorioInfo {
  tipo: ArquivoRelatorio;
  nome: string;
  bytes: number;
}

export interface ArquivoDaFaixa {
  /** como mostrar: `music/Hard Techno/Azyr/No Escape.flac` */
  caminho: string;
  onde: 'biblioteca' | 'downloads';
}

export type GrupoHistorico = 'bib' | 'nao' | 'inc' | 'outro';

export interface FaixaHistorico {
  n: number;
  key: string;
  linha: string;
  artista: string;
  titulo: string;
  status: string;
  rotuloStatus: string;
  corStatus: CorStatus;
  grupo: GrupoHistorico;
  /** o que merece uma segunda olhada (título aproximado, busca pelo artista, beets falhou) */
  paraConferir: boolean;
  /** o texto âmbar da tabela */
  nota: string;
  formato: Formato | null;
  usuario: string | null;
  arquivo: ArquivoDaFaixa | null;
  /** terminou como `nao encontrada` ou `falhou`: tem diagnóstico */
  temDiagnostico: boolean;
}

export interface CorrecaoFaixa {
  /** o título escolhido */
  titulo: string;
  /** a linha nova: "Artista - Título" */
  linha: string;
  /** a lista original também foi reescrita nesta linha (e como estava antes) */
  lista: { nome: string; numero: number; original: string; escrita: string } | null;
  em: string;
}

export type CorMusicbrainz = 'verde' | 'azul' | 'laranja' | 'neutro';

export interface DiagnosticoFaixa {
  key: string;
  linha: string;
  artista: string;
  titulo: string;
  status: 'nao encontrada' | 'falhou';
  rotuloStatus: string;
  corStatus: CorStatus;
  /** uma frase para a lista da esquerda */
  resumo: string;
  musicbrainz: { resultado: string; rotulo: string; cor: CorMusicbrainz; similares: string[] } | null;
  buscas: { tipo: 'q' | 'artist'; consulta: string }[];
  /** quantas respostas as buscas tiveram; null quando a execução não registrou */
  respostas: number | null;
  /** a explicação que o script guardou (`existe, mas so em formato/qualidade recusados...`) */
  nota: string;
  motivos: MotivoTraduzido[];
  /** "talvez seja": títulos do catálogo do artista parecidos com o da linha */
  sugestoes: string[];
  arquivos: { motivo: string; usuario: string; arquivo: string }[];
  /** `falhou`: o motivo de cada tentativa de download que não deu certo */
  tentativas: string[];
  catalogo: { titulo: string; usuarios: number }[];
  catalogoTotal: number;
  artistaBuscado: boolean;
  correcao: CorrecaoFaixa | null;
}

export interface Retentativa {
  /** o nome da lista que "Tentar de novo" gera na pasta do Soulcrate */
  arquivo: string;
  faixas: number;
  /** as opções com que o lote abre: as da execução, mais as sugeridas pelos motivos */
  opcoes: OpcoesLote;
  sugeridas: OpcaoId[];
  /** a lista já rodou uma vez: o `-Retentar` é preciso para tentar de novo o que falhou */
  retentar: boolean;
}

export type FiltroDetalhe = 'todas' | 'bib' | 'nao' | 'conf' | 'inc';

export interface ExecucaoDetalhe {
  resumo: ExecucaoResumo;
  /** o `.txt` ou `.csv` da lista ainda está na pasta do Soulcrate */
  listaExiste: boolean;
  /** as opções que a execução registrou; null nas antigas */
  opcoes: OpcoesLote | null;
  faixas: FaixaHistorico[];
  filtros: Record<FiltroDetalhe, number>;
  arquivos: ArquivoRelatorioInfo[];
  diagnosticos: DiagnosticoFaixa[];
  retentativa: Retentativa | null;
  /** há memória (`estado-<lista>.tsv`) que "Reprocessar do zero" pode apagar */
  podeReprocessar: boolean;
}

export type CriterioLimpeza = { tipo: 'idade'; dias: number } | { tipo: 'manter'; quantas: number };

export interface PreviaLimpeza {
  execucoes: number;
  arquivos: number;
  bytes: number;
}

export interface ResultadoLimpeza extends PreviaLimpeza {
  /** arquivos que não puderam ir para a Lixeira */
  falhas: number;
}

export interface EstadoDaLista {
  lista: string;
  /** faixas registradas na memória da lista */
  faixas: number;
  rodando: boolean;
}

export type MotivoListaNaoAtualizada = 'sem-lista' | 'csv' | 'nao-achou' | 'editando';

export interface ResultadoCorrecao {
  correcao: CorrecaoFaixa;
  listaAtualizada: boolean;
  motivoNaoAtualizada: MotivoListaNaoAtualizada | null;
}

export interface NovaTentativa {
  lista: ListaRef;
  retentativa: Retentativa;
}

// ---------------------------------------------------------------- Datas e nomes

const dois = (n: number) => String(n).padStart(2, '0');

/**
 * O `id` de uma execução é a hora em que ela começou: `20261007-161002` (o app e o script) ou, com sufixo, `-2`.
 * O formato `2026-10-06_2102` aparece nos relatórios antigos. Hora local, como o script a gravou.
 */
export function dataDoId(id: string): number | null {
  const a = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?$/.exec(id);
  const b = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(?:\d{2})?$/.exec(id);
  const p = a ?? b;
  if (!p) return null;
  const n = (i: number) => Number(p[i]);
  const d = new Date(n(1), n(2) - 1, n(3), n(4), n(5), a ? n(6) : 0);
  return Number.isNaN(d.getTime()) || d.getMonth() !== n(2) - 1 ? null : d.getTime();
}

const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Hoje", "Ontem", "Sáb, 04/10" (com o ano quando não é o atual). */
export function rotuloDoDia(ms: number, agora: number): string {
  const d = new Date(ms);
  const hoje = new Date(agora);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(hoje) - dia(d)) / 86_400_000);
  if (dif === 0) return msg.historico.hoje;
  if (dif === 1) return msg.historico.ontem;
  const ano = d.getFullYear() === hoje.getFullYear() ? '' : `/${d.getFullYear()}`;
  return `${DIAS_ABREV[d.getDay()] ?? ''}, ${dois(d.getDate())}/${dois(d.getMonth() + 1)}${ano}`;
}

/** "22:14" */
export function rotuloDaHora(ms: number): string {
  const d = new Date(ms);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "ontem, 21:02", "hoje, 22:14", "sáb, 04/10, 19:40" (a frase do cabeçalho, em minúsculas). */
export function rotuloDoMomento(ms: number, agora: number): string {
  return `${rotuloDoDia(ms, agora).toLowerCase()}, ${rotuloDaHora(ms)}`;
}

// ---------------------------------------------------------------- Resumo (a linha do histórico)

const SOMA = (s: Record<string, number>, ...ks: string[]) => ks.reduce((t, k) => t + (s[k] ?? 0), 0);

/** Conta o `summary` do `run.end` (status → quantidade) no que a tela mostra. */
export function contagemDoResumo(summary: Record<string, number>, totalDeclarado = 0): ContagemExecucao {
  const ok = SOMA(summary, 'importada', 'baixada');
  const naoVieram = SOMA(summary, 'nao encontrada', 'falhou');
  const puladas = SOMA(summary, 'ja feita', 'ja na biblioteca');
  const atencao = SOMA(summary, 'baixada (beets falhou)');
  const soma = Object.values(summary).reduce((a, b) => a + b, 0);
  const total = Math.max(totalDeclarado, soma);
  return {
    total,
    ok,
    naoVieram,
    puladas,
    atencao,
    naoTerminadas: Math.max(0, total - ok - naoVieram - puladas - atencao),
  };
}

export interface DadosDoResumo {
  id: string;
  fonte: FonteExecucao;
  inicioEvento: RunStart | null;
  fimEvento: RunEnd | null;
  progresso: Progress | null;
  /** status → quantidade: o `summary` do `run.end` ou a contagem do `resultado-*.txt` */
  summary: Record<string, number> | null;
  /** quando começou, se não houver `run.start` (o id, ou a data do arquivo) */
  inicioMs: number;
  /** quando terminou, se não houver `run.end` (a data do `resultado-*.txt`) */
  fimMs: number | null;
  /** a trava (P8) da lista tem um processo vivo com este id */
  rodando: boolean;
  agora: number;
}

const tempo = (iso: string): number | null => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const EM_ANDAMENTO = ['pendente', 'buscando', 'verificar', 'pronta', 'baixando', 'importar', 'importando'];

/** A linha do histórico: quando, quanto durou, como terminou e o que saiu. */
export function resumirExecucao(d: DadosDoResumo): ExecucaoResumo {
  const inicio = (d.inicioEvento ? tempo(d.inicioEvento.t) : null) ?? d.inicioMs;
  const lista = d.inicioEvento ? d.inicioEvento.list : null;

  let fim: FimExecucao;
  let mensagem = '';
  if (d.fimEvento) {
    fim = d.fimEvento.reason;
    mensagem = d.fimEvento.message;
  } else if (d.rodando) {
    fim = 'rodando';
  } else if (d.fonte === 'eventos') {
    fim = 'interrupted';
    mensagem = msg.lote.fim.sumiu;
  } else {
    // sem eventos não há como saber: terminou, a menos que o relatório tenha faixas no meio do caminho
    const resto = Object.keys(d.summary ?? {}).some((k) => EM_ANDAMENTO.includes(k));
    fim = d.fonte === 'log' ? 'interrupted' : resto ? 'interrupted' : 'completed';
    if (fim === 'interrupted') mensagem = d.fonte === 'log' ? msg.historico.semRelatorio : msg.lote.fim.sumiu;
  }

  let contagem: ContagemExecucao;
  let progresso: ExecucaoResumo['progresso'] = null;
  if ((fim === 'rodando' || !d.summary) && d.progresso) {
    const p = d.progresso;
    const total = Math.max(p.total, d.inicioEvento?.total ?? 0);
    contagem = {
      total,
      ok: p.ok,
      naoVieram: p.notFound + p.failed,
      puladas: Math.max(0, p.done - p.ok - p.notFound - p.failed),
      atencao: 0,
      naoTerminadas: Math.max(0, total - p.done),
    };
    progresso = { feitas: p.done, total };
  } else if (d.summary) {
    contagem = contagemDoResumo(d.summary, d.inicioEvento?.total ?? 0);
    if (fim === 'rodando') progresso = { feitas: contagem.total - contagem.naoTerminadas, total: contagem.total };
  } else {
    const total = d.inicioEvento?.total ?? 0;
    contagem = { total, ok: 0, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: total };
    if (fim === 'rodando') progresso = { feitas: 0, total };
  }

  let duracaoMs: number | null = null;
  const fimMs = d.fimEvento ? tempo(d.fimEvento.t) : fim === 'rodando' ? d.agora : d.fimMs;
  if (fimMs !== null && fimMs >= inicio && fimMs - inicio < 14 * 86_400_000) duracaoMs = fimMs - inicio;

  return {
    id: d.id,
    inicio,
    duracaoMs,
    lista,
    fonte: d.fonte,
    fim,
    mensagem,
    contagem,
    progresso,
    temFaltas: contagem.naoVieram > 0,
  };
}

// ---------------------------------------------------------------- Leitura bruta de uma execução

export interface FaixaBase {
  n: number;
  key: string;
  linha: string;
  status: string;
  /** `note` do `item.final` (a explicação do script) */
  nota: string;
  /** `via` do `item.final`: como a faixa foi achada, quando não foi do jeito comum */
  via: string;
  formato: Formato | null;
  usuario: string | null;
  /** onde o arquivo baixado ficou (em downloads/, relativo à pasta do Soulcrate ou absoluto) */
  local: string | null;
}

export type DiagBruto = Pick<
  ItemDiagnostic,
  | 'searches'
  | 'skipped'
  | 'corrected'
  | 'catalog'
  | 'remixer'
  | 'responses'
  | 'reasons'
  | 'closest'
  | 'suggestions'
  | 'artistSearched'
  | 'artistCatalog'
  | 'artistCatalogTotal'
>;

export interface ExecucaoBruta {
  id: string;
  fonte: FonteExecucao;
  inicioEvento: RunStart | null;
  fimEvento: RunEnd | null;
  progresso: Progress | null;
  faixas: FaixaBase[];
  diagnosticos: Record<string, DiagBruto>;
  catalogo: Record<string, CatalogResult>;
  /** key → o motivo de cada tentativa de download que falhou */
  tentativas: Record<string, string[]>;
  /** arquivos que a execução registrou (`run.start.files`, depois `run.end.files`) */
  arquivos: ArquivosExecucao;
}

/** Mapa por chave de faixa: a chave é uma linha da lista do usuário, e `constructor` ou `__proto__` não podem colidir com o objeto. */
const semProto = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

const faixaVazia = (n: number, key: string, linha: string): FaixaBase => ({
  n,
  key,
  linha,
  status: 'pendente',
  nota: '',
  via: '',
  formato: null,
  usuario: null,
  local: null,
});

/** Aplica os eventos de uma execução (a ordem em que as faixas aparecem é a da lista). */
export function lerExecucaoDeEventos(id: string, eventos: readonly EventoLote[]): ExecucaoBruta {
  const r: ExecucaoBruta = {
    id,
    fonte: 'eventos',
    inicioEvento: null,
    fimEvento: null,
    progresso: null,
    faixas: [],
    diagnosticos: semProto<DiagBruto>(),
    catalogo: semProto<CatalogResult>(),
    tentativas: semProto<string[]>(),
    arquivos: {},
  };
  const indice = new Map<string, number>();
  const faixa = (key: string, linha: string): FaixaBase => {
    const i = indice.get(key);
    if (i !== undefined) return r.faixas[i] as FaixaBase;
    const f = faixaVazia(r.faixas.length + 1, key, linha);
    indice.set(key, r.faixas.length);
    r.faixas.push(f);
    return f;
  };

  for (const e of eventos) {
    switch (e.type) {
      case 'run.start':
        r.inicioEvento = e;
        r.arquivos = { ...r.arquivos, ...e.files };
        break;
      case 'item.status': {
        const f = faixa(e.key, e.line);
        f.status = e.status;
        if (e.user) f.usuario = e.user;
        if (e.format) f.formato = e.format;
        break;
      }
      case 'item.final': {
        const f = faixa(e.key, e.line);
        f.status = e.status;
        f.nota = e.note;
        f.via = e.via;
        f.local = e.local;
        f.usuario = e.user ?? f.usuario;
        f.formato = e.format ?? f.formato;
        break;
      }
      case 'item.attemptFailed':
        (r.tentativas[e.key] ??= []).push(e.reason);
        break;
      case 'item.diagnostic':
        r.diagnosticos[e.key] = e;
        break;
      case 'catalog.result':
        r.catalogo[e.key] = e;
        break;
      case 'progress':
        r.progresso = e;
        break;
      case 'run.end':
        r.fimEvento = e;
        r.arquivos = { ...r.arquivos, ...e.files };
        break;
      default:
        break;
    }
  }
  return r;
}

/** `resultado-<id>.txt`: `STATUS<TAB>linha<TAB>nota ou caminho  [via]`, uma faixa por linha. */
export function lerResultadoAntigo(id: string, texto: string): ExecucaoBruta {
  const r: ExecucaoBruta = {
    id,
    fonte: 'resultado',
    inicioEvento: null,
    fimEvento: null,
    progresso: null,
    faixas: [],
    diagnosticos: semProto<DiagBruto>(),
    catalogo: semProto<CatalogResult>(),
    tentativas: semProto<string[]>(),
    arquivos: {},
  };
  const vistas = new Set<string>();
  for (const bruta of semBom(texto).split(/\r?\n/)) {
    if (!bruta.trim()) continue;
    const [st = '', linha = '', resto = ''] = bruta.split('\t');
    const status = st.trim().toLowerCase();
    if (!status || !linha.trim()) continue;
    const key = normalizar(linha);
    if (vistas.has(key)) continue; // o script só grava uma por faixa; repetida seria ruído
    vistas.add(key);
    const f = faixaVazia(r.faixas.length + 1, key, linha.trim());
    f.status = status;
    const detalhe = resto.trim();
    if (status === 'nao encontrada' || status === 'falhou' || status === 'ja feita') {
      f.nota = detalhe;
    } else {
      const m = /^(.*?)(?:\s{2}\[(.*)\])?$/.exec(detalhe);
      f.local = m?.[1]?.trim() ? m[1].trim() : null;
      f.via = m?.[2]?.trim() ?? '';
    }
    r.faixas.push(f);
  }
  return r;
}

/** Status → quantidade de um conjunto de faixas (o `summary` que o `run.end` traria). */
export function contarStatus(faixas: readonly FaixaBase[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const f of faixas) s[f.status] = (s[f.status] ?? 0) + 1;
  return s;
}

// ---------------------------------------------------------------- `diagnostico-<id>.txt` (execuções antigas)

/**
 * O diagnóstico em texto do script, para quem rodou pelo `.bat` e não tem os eventos. O resultado é indexado pela
 * chave normalizada da linha (`### Vendex - Plague` → `vendex plague`).
 */
export function lerDiagnosticoTexto(texto: string): Record<string, DiagBruto> {
  const saida = semProto<DiagBruto>();
  let d: DiagBruto | null = null;
  let emArquivos = false;

  for (const bruta of semBom(texto).split(/\r?\n/)) {
    const cab = /^### (.+)$/.exec(bruta);
    if (cab) {
      d = {
        searches: [],
        skipped: 0,
        corrected: '',
        catalog: '',
        remixer: false,
        responses: -1, // o texto não diz quantas respostas houve
        reasons: {},
        closest: [],
        suggestions: [],
        artistSearched: false,
        artistCatalog: [],
        artistCatalogTotal: 0,
      };
      saida[normalizar(cab[1] ?? '')] = d;
      emArquivos = false;
      continue;
    }
    if (!d) continue;
    const t = bruta.trim();
    if (!t) continue;

    if (emArquivos && /^\s{6}\S/.test(bruta) && bruta.includes(' :: ')) {
      const p = bruta.indexOf(' :: ');
      const esq = bruta.slice(0, p).trim();
      const arquivo = bruta.slice(p + 4).trim();
      const m = /^(.*?)\s+(\S+)$/.exec(esq);
      d.closest.push({ reason: (m?.[1] ?? esq).trim(), user: m?.[2] ?? '', file: arquivo, score: 0 });
      continue;
    }
    emArquivos = false;

    if (t.startsWith('buscas: ')) {
      d.searches = t
        .slice('buscas: '.length)
        .split(' | ')
        .map((b) => {
          const a = /^\[artista\] (.*)$/.exec(b);
          return a ? { kind: 'artist' as const, query: a[1] ?? '' } : { kind: 'q' as const, query: b };
        });
    } else if (/^\((\d+) busca\(s\) pulada/.test(t)) {
      d.skipped = Number(/^\((\d+)/.exec(t)?.[1] ?? 0);
    } else if (t.startsWith('catalogo: ')) {
      d.catalog = t.slice('catalogo: '.length);
    } else if (t.startsWith('motivos: ')) {
      for (const m of t.slice('motivos: '.length).matchAll(/(.+?) x(\d+)(?:; |$)/g)) {
        d.reasons[(m[1] ?? '').trim()] = Number(m[2]);
      }
    } else if (t === 'arquivos mais parecidos:') {
      emArquivos = true;
    } else if (t.startsWith('talvez seja: ')) {
      d.suggestions = t
        .slice('talvez seja: '.length)
        .split(' | ')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (t.startsWith("catalogo de '")) {
      const m = /^catalogo de '.*' no Soulseek \((\d+) titulos?[^)]*\): (.*)$/.exec(t);
      d.artistSearched = true;
      d.artistCatalogTotal = Number(m?.[1] ?? 0);
      d.artistCatalog = (m?.[2] ?? '')
        .split(' | ')
        .map((s) => s.trim())
        .filter((s) => s && s !== '...')
        .map((s) => {
          const u = /^(.*) \((\d+)\)$/.exec(s);
          return u ? { title: (u[1] ?? '').trim(), users: Number(u[2]) } : { title: s, users: 1 };
        });
    } else if (/^a busca so por '.*' nao achou nenhuma faixa desse artista$/.test(t)) {
      d.artistSearched = true;
    } else if (t.startsWith('(o artista da linha e o remixer')) {
      d.remixer = true;
    }
  }
  return saida;
}

// ---------------------------------------------------------------- Opções da execução

/** As opções do `run.start` que o app conhece, no formato do formulário; o resto (`SlskdUrl`) fica de fora. */
export function opcoesDaExecucao(opcoes: Record<string, string | number | boolean> | undefined): OpcoesLote | null {
  if (!opcoes) return null;
  const r = novasOpcoes();
  for (const [id, v] of Object.entries(opcoes)) {
    if (ehOpcaoBooleana(id) && typeof v === 'boolean') r[id] = v;
    else if (ehOpcaoNumerica(id) && typeof v === 'number' && Number.isInteger(v)) {
      const { min, max } = LIMITES[id];
      if (v >= min && v <= max) r[id] = v;
    }
  }
  return r;
}

// ---------------------------------------------------------------- Faixas

export function grupoDoStatus(status: string): GrupoHistorico {
  switch (status) {
    case 'importada':
    case 'baixada':
    case 'ja na biblioteca':
    case 'ja feita':
      return 'bib';
    case 'nao encontrada':
    case 'falhou':
      return 'nao';
    default:
      return ehStatusFinal(status) ? 'outro' : 'inc';
  }
}

/** Como o script achou a faixa, em português ("veio da busca pelo artista"), a partir do `via`. */
export function explicarVia(via: string): string {
  const v = msg.historico.via;
  return via
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (/^busca pelo artista$/i.test(p)) return v.buscaArtista;
      const aprox = /^titulo aproximado: '(.*)'$/i.exec(p);
      if (aprox) return v.tituloAproximado(aprox[1] ?? '');
      if (/^titulo original da lista/i.test(p)) return v.tituloOriginal;
      return p;
    })
    .join(' · ');
}

const ehOkComVia = (f: FaixaBase) => (f.status === 'importada' || f.status === 'baixada') && f.via !== '';

export function faixaParaHistorico(f: FaixaBase): FaixaHistorico {
  const info = infoDoStatus(f.status);
  const { artista, titulo } = separarLinha(f.linha);
  const beetsFalhou = f.status === 'baixada (beets falhou)';
  const conferir = ehOkComVia(f) || beetsFalhou;
  const nota = beetsFalhou
    ? [msg.historico.via.beetsFalhou, f.via ? explicarVia(f.via) : ''].filter(Boolean).join(' · ')
    : ehOkComVia(f)
      ? explicarVia(f.via)
      : '';
  return {
    n: f.n,
    key: f.key,
    linha: f.linha,
    artista,
    titulo,
    status: f.status,
    rotuloStatus: info.rotulo,
    corStatus: info.cor,
    grupo: grupoDoStatus(f.status),
    paraConferir: conferir,
    nota,
    formato: f.formato,
    usuario: f.usuario,
    arquivo: null,
    temDiagnostico: f.status === 'nao encontrada' || f.status === 'falhou',
  };
}

export function contarFiltros(faixas: readonly FaixaHistorico[]): Record<FiltroDetalhe, number> {
  const r: Record<FiltroDetalhe, number> = { todas: faixas.length, bib: 0, nao: 0, conf: 0, inc: 0 };
  for (const f of faixas) {
    if (f.grupo === 'bib') r.bib++;
    else if (f.grupo === 'nao') r.nao++;
    else if (f.grupo === 'inc') r.inc++;
    if (f.paraConferir) r.conf++;
  }
  return r;
}

export function filtrarFaixasHistorico(
  faixas: readonly FaixaHistorico[],
  filtro: FiltroDetalhe,
  busca: string,
): FaixaHistorico[] {
  const q = normalizar(busca);
  return faixas.filter((f) => {
    if (filtro === 'bib' && f.grupo !== 'bib') return false;
    if (filtro === 'nao' && f.grupo !== 'nao') return false;
    if (filtro === 'inc' && f.grupo !== 'inc') return false;
    if (filtro === 'conf' && !f.paraConferir) return false;
    return !q || normalizar(f.linha).includes(q);
  });
}

// ---------------------------------------------------------------- Diagnóstico

export function rotuloMusicbrainz(resultado: string): { rotulo: string; cor: CorMusicbrainz } {
  const rotulo = msg.historico.mb[resultado] ?? resultado;
  switch (resultado) {
    case 'OK':
      return { rotulo, cor: 'verde' };
    case 'CORRIGIDO':
      return { rotulo, cor: 'azul' };
    case 'NAO EXISTE':
    case 'NAO CONFIRMADO':
      return { rotulo, cor: 'laranja' };
    default:
      return { rotulo, cor: 'neutro' };
  }
}

/** Quantas respostas as buscas tiveram, a partir do que o script escreveu na nota (`ninguem tem (0 respostas)`). */
export function respostasDaNota(nota: string): number | null {
  const m = /\((\d+) respostas?\)/.exec(nota) ?? /^(\d+) respostas?\b/.exec(nota);
  return m ? Number(m[1]) : null;
}

const TIPOS_DE_FORMATO = new Set(['wav', 'aacAiff', 'aacBaixo', 'mp3320', 'mp3Menor', 'mp3Baixo', 'formato']);

function resumoDaFalta(
  status: DiagnosticoFaixa['status'],
  motivos: readonly MotivoTraduzido[],
  sugestoes: readonly string[],
  nota: string,
): string {
  const r = msg.historico.resumoDaFalta;
  if (status === 'falhou') return /^erro interno/i.test(nota) ? r.erroInterno : r.usuarios;
  if (motivos.some((m) => TIPOS_DE_FORMATO.has(m.tipo))) return r.soFormato;
  if (motivos.some((m) => m.tipo === 'titulo') || sugestoes.length > 0) return r.tituloErrado;
  if (motivos.some((m) => m.tipo === 'semRespostas')) return r.ninguemTem;
  if (motivos.some((m) => m.tipo === 'semCompativel')) return r.semCompativel;
  return r.generico;
}

/** O diagnóstico de uma faixa que não veio, com os motivos traduzidos e a ação de cada um. */
export function diagnosticarFaixa(
  f: FaixaBase,
  bruta: Pick<ExecucaoBruta, 'diagnosticos' | 'catalogo' | 'tentativas'>,
  correcao: CorrecaoFaixa | null,
): DiagnosticoFaixa {
  const status = f.status === 'falhou' ? 'falhou' : 'nao encontrada';
  const info = infoDoStatus(status);
  const { artista, titulo } = separarLinha(f.linha);
  const diag = bruta.diagnosticos[f.key] ?? null;
  const tentativas = bruta.tentativas[f.key] ?? [];
  const mb = bruta.catalogo[f.key] ?? null;

  const respostas = diag && diag.responses >= 0 ? diag.responses : respostasDaNota(f.nota);
  const sugestoes = diag?.suggestions ?? [];

  let motivos: MotivoTraduzido[];
  if (status === 'falhou') {
    motivos = /^erro interno/i.test(f.nota) ? [traduzirMotivo(f.nota, 1)] : traduzirTentativas(tentativas);
  } else {
    const entradas = Object.entries(diag?.reasons ?? {}).sort((a, b) => b[1] - a[1]);
    motivos = entradas.map(([bruto, n]) => traduzirMotivo(bruto, n, { temSugestoes: sugestoes.length > 0 }));
    if (motivos.length === 0) {
      if (respostas === 0) motivos = [traduzirMotivo('0 respostas', 0)];
      else if (respostas !== null && respostas > 0) motivos = [semCompativel(respostas)];
    }
  }

  return {
    key: f.key,
    linha: f.linha,
    artista,
    titulo,
    status,
    rotuloStatus: info.rotulo,
    corStatus: info.cor,
    resumo: resumoDaFalta(status, motivos, sugestoes, f.nota),
    musicbrainz: mb ? { resultado: mb.result, ...rotuloMusicbrainz(mb.result), similares: mb.similar } : null,
    buscas: (diag?.searches ?? []).map((s) => ({ tipo: s.kind, consulta: s.query })),
    respostas,
    nota: f.nota,
    motivos,
    sugestoes,
    arquivos: (diag?.closest ?? []).map((c) => ({ motivo: c.reason, usuario: c.user, arquivo: c.file })),
    tentativas,
    catalogo: (diag?.artistCatalog ?? []).map((c) => ({ titulo: c.title, usuarios: c.users })),
    catalogoTotal: diag?.artistCatalogTotal ?? 0,
    artistaBuscado: diag?.artistSearched ?? false,
    correcao,
  };
}

/** "0 respostas" e "N respostas, nenhuma compatível" não são motivos do `reasons`: o script só os escreve na nota. */
function semCompativel(n: number): MotivoTraduzido {
  return {
    tipo: 'semCompativel',
    bruto: `${n} respostas`,
    n,
    rotulo: msg.historico.motivos.semCompativel.rotulo(n),
    acao: msg.historico.motivos.semCompativel.acao,
    sugere: {},
    botao: null,
  };
}

// ---------------------------------------------------------------- Detalhe completo

export interface ContextoDetalhe {
  /** correções já escolhidas, por chave da faixa */
  correcoes: Record<string, CorrecaoFaixa>;
  /** `estado-nao-baixadas-<id>.tsv` já existe: o lote da lista nova precisa do `-Retentar` */
  retentar: boolean;
  /** nome da lista de "tentar de novo" (`nao-baixadas-<id>.txt`) */
  arquivoDaRetentativa: string;
}

/** As linhas da lista de "tentar de novo": as que falharam, com a correção escolhida no lugar da original. */
export function linhasParaTentarDeNovo(
  faixas: readonly FaixaBase[],
  correcoes: Record<string, CorrecaoFaixa>,
): string[] {
  return faixas
    .filter((f) => f.status === 'nao encontrada' || f.status === 'falhou')
    .map((f) => correcoes[f.key]?.linha ?? f.linha);
}

export function montarRetentativa(
  bruta: ExecucaoBruta,
  diagnosticos: readonly DiagnosticoFaixa[],
  ctx: ContextoDetalhe,
): Retentativa | null {
  const faixas = bruta.faixas.filter((f) => f.status === 'nao encontrada' || f.status === 'falhou');
  if (faixas.length === 0) return null;
  const base = opcoesDaExecucao(bruta.inicioEvento?.options) ?? novasOpcoes();
  const sugerido = opcoesSugeridas(diagnosticos.flatMap((d) => d.motivos));
  const opcoes: OpcoesLote = { ...base, ...sugerido, Retentar: ctx.retentar };
  const sugeridas = (Object.keys(sugerido) as OpcaoId[]).filter((id) => opcoes[id] !== base[id]);
  return { arquivo: ctx.arquivoDaRetentativa, faixas: faixas.length, opcoes, sugeridas, retentar: ctx.retentar };
}

/** Tudo o que a tela de detalhe e a de diagnóstico mostram, menos o que só o disco sabe (arquivos, lista, memória). */
export function detalharExecucao(
  bruta: ExecucaoBruta,
  ctx: ContextoDetalhe,
): Pick<ExecucaoDetalhe, 'faixas' | 'filtros' | 'diagnosticos' | 'retentativa' | 'opcoes'> {
  const faixas = bruta.faixas.map(faixaParaHistorico);
  const diagnosticos = bruta.faixas
    .filter((f) => f.status === 'nao encontrada' || f.status === 'falhou')
    .map((f) => diagnosticarFaixa(f, bruta, ctx.correcoes[f.key] ?? null));
  return {
    faixas,
    filtros: contarFiltros(faixas),
    diagnosticos,
    retentativa: montarRetentativa(bruta, diagnosticos, ctx),
    opcoes: opcoesDaExecucao(bruta.inicioEvento?.options),
  };
}

/** O que as opções da retentativa mudam em relação ao padrão do script, para o resumo do rodapé. */
export function opcoesFora(opcoes: OpcoesLote): OpcaoId[] {
  return (Object.keys(OPCOES_PADRAO) as OpcaoId[]).filter((id) => opcoes[id] !== OPCOES_PADRAO[id]);
}
