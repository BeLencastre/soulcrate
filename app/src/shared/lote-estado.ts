// Estado de uma execução do lote, calculado a partir dos eventos do baixar-lista.ps1 (docs/eventos-lote.md).
// Puro: o renderer aplica os eventos que o main empurra e a tela só lê o resultado. Os mesmos eventos, na mesma
// ordem, dão sempre o mesmo estado, então reconectar (reabrir o app no meio do lote) é só reaplicar tudo.
import type { EventoLote, Formato, Progress, RunEnd, RunSkip, RunStart } from './eventos-lote.js';
import { STATUS_FINAIS } from './eventos-lote.js';
import { msg } from './mensagens.js';

export type CorStatus = 'neutro' | 'azul' | 'roxo' | 'verde' | 'verdec' | 'laranja' | 'vermelho' | 'cinza';
export type GrupoFaixa = 'andamento' | 'concluida' | 'atencao' | 'pulada';

export interface InfoStatus {
  rotulo: string;
  cor: CorStatus;
  grupo: GrupoFaixa;
}

/** Apêndice B da especificação: status do script → rótulo, grupo e cor. */
export function infoDoStatus(status: string, naFilaDoUsuario = false): InfoStatus {
  const s = msg.lote.status;
  switch (status) {
    case 'pendente':
      return { rotulo: s.aguardando, cor: 'neutro', grupo: 'andamento' };
    case 'buscando':
    case 'verificar':
      return { rotulo: s.buscando, cor: 'azul', grupo: 'andamento' };
    case 'pronta':
      return { rotulo: s.aguardandoVaga, cor: 'neutro', grupo: 'andamento' };
    case 'baixando':
      return { rotulo: naFilaDoUsuario ? s.naFila : s.baixando, cor: 'azul', grupo: 'andamento' };
    case 'importar':
    case 'importando':
      return { rotulo: s.organizando, cor: 'roxo', grupo: 'andamento' };
    case 'importada':
      return { rotulo: s.naBiblioteca, cor: 'verde', grupo: 'concluida' };
    case 'baixada':
      return { rotulo: s.baixada, cor: 'verdec', grupo: 'concluida' };
    case 'baixada (beets falhou)':
      return { rotulo: s.beetsFalhou, cor: 'laranja', grupo: 'atencao' };
    case 'ja na biblioteca':
      return { rotulo: s.jaEstavaNaBiblioteca, cor: 'cinza', grupo: 'pulada' };
    case 'ja feita':
      return { rotulo: s.jaFeita, cor: 'cinza', grupo: 'pulada' };
    case 'nao encontrada':
      return { rotulo: s.naoEncontrada, cor: 'vermelho', grupo: 'atencao' };
    case 'falhou':
      return { rotulo: s.falhou, cor: 'vermelho', grupo: 'atencao' };
    default:
      return { rotulo: status, cor: 'neutro', grupo: 'andamento' };
  }
}

export const ehStatusFinal = (status: string): boolean => (STATUS_FINAIS as readonly string[]).includes(status);

export interface FaixaLote {
  /** posição na lista (ordem em que a faixa apareceu nos eventos, 1 em diante) */
  n: number;
  key: string;
  linha: string;
  status: string;
  /** baixando, mas parado na fila do usuário remoto */
  naFilaDoUsuario: boolean;
  formato: Formato | null;
  usuario: string | null;
  tentativa: number | null;
  /** `note` do `item.final` */
  nota: string;
  /** linha usada na busca, quando o catálogo ou o script a corrigiu */
  linhaBusca: string | null;
  busca: { consulta: string; etapa: number; etapas: number } | null;
  candidatos: number | null;
  ultimaFalha: string | null;
  temDiagnostico: boolean;
  local: string | null;
}

export interface Contagem {
  buscando: number;
  baixando: number;
  naFila: number;
  beets: number;
  aguardando: number;
  /** importada + baixada */
  baixadas: number;
  naoAchadas: number;
  /** falhou + baixada (beets falhou) */
  falhas: number;
  puladas: number;
  /** faixas que já terminaram (inclui as puladas), como o `done` do evento `progress` */
  concluidas: number;
}

export type FaseLote = 'aguardando' | 'rodando' | 'parando' | 'terminou';

export interface AvisoLote {
  codigo: string;
  mensagem: string;
  /** `t` do evento: a tela só mostra avisos recentes */
  t: string;
}

export interface EstadoLote {
  runId: string | null;
  fase: FaseLote;
  inicio: RunStart | null;
  total: number;
  faixas: FaixaLote[];
  /** key → posição em `faixas` */
  indice: Record<string, number>;
  contagem: Contagem;
  progresso: Progress | null;
  pulos: RunSkip | null;
  /** `until` ISO das buscas pausadas por bloqueio; o aviso só vale enquanto estiver no futuro */
  buscasPausadasAte: string | null;
  janelaCheia: boolean;
  /** conferência no MusicBrainz em andamento */
  catalogo: { feitas: number; total: number } | null;
  avisos: AvisoLote[];
  fim: RunEnd | null;
  /** o `run.end` foi inventado pelo app (o processo sumiu sem registrar o fim) */
  fimSintetico: boolean;
  /** quantos eventos já foram aplicados (o main numera os eventos; o renderer ignora repetidos) */
  eventosAplicados: number;
}

export function contagemVazia(): Contagem {
  return {
    buscando: 0,
    baixando: 0,
    naFila: 0,
    beets: 0,
    aguardando: 0,
    baixadas: 0,
    naoAchadas: 0,
    falhas: 0,
    puladas: 0,
    concluidas: 0,
  };
}

export function estadoInicialLote(): EstadoLote {
  return {
    runId: null,
    fase: 'aguardando',
    inicio: null,
    total: 0,
    faixas: [],
    indice: {},
    contagem: contagemVazia(),
    progresso: null,
    pulos: null,
    buscasPausadasAte: null,
    janelaCheia: false,
    catalogo: null,
    avisos: [],
    fim: null,
    fimSintetico: false,
    eventosAplicados: 0,
  };
}

export function contarFaixas(faixas: readonly FaixaLote[]): Contagem {
  const c = contagemVazia();
  for (const f of faixas) {
    switch (f.status) {
      case 'pendente':
      case 'pronta':
        c.aguardando++;
        break;
      case 'buscando':
      case 'verificar':
        c.buscando++;
        break;
      case 'baixando':
        if (f.naFilaDoUsuario) c.naFila++;
        else c.baixando++;
        break;
      case 'importar':
      case 'importando':
        c.beets++;
        break;
      case 'importada':
      case 'baixada':
        c.baixadas++;
        break;
      case 'nao encontrada':
        c.naoAchadas++;
        break;
      case 'falhou':
      case 'baixada (beets falhou)':
        c.falhas++;
        break;
      case 'ja feita':
      case 'ja na biblioteca':
        c.puladas++;
        break;
      default:
        c.aguardando++;
    }
    if (ehStatusFinal(f.status)) c.concluidas++;
  }
  return c;
}

function novaFaixa(n: number, key: string, linha: string): FaixaLote {
  return {
    n,
    key,
    linha,
    status: 'pendente',
    naFilaDoUsuario: false,
    formato: null,
    usuario: null,
    tentativa: null,
    nota: '',
    linhaBusca: null,
    busca: null,
    candidatos: null,
    ultimaFalha: null,
    temDiagnostico: false,
    local: null,
  };
}

/**
 * Aplica um grupo de eventos (na ordem) e devolve o novo estado; o anterior não é alterado. O custo é uma cópia da
 * lista de faixas por grupo, não por evento: 1.000 faixas e dezenas de milhares de eventos continuam leves.
 */
export function aplicarEventos(anterior: EstadoLote, eventos: readonly EventoLote[]): EstadoLote {
  if (eventos.length === 0) return anterior;
  const e: EstadoLote = {
    ...anterior,
    faixas: anterior.faixas.slice(),
    indice: { ...anterior.indice },
    avisos: anterior.avisos.slice(),
  };

  const faixaDe = (key: string, linha: string): FaixaLote => {
    const i = e.indice[key];
    if (i !== undefined) return e.faixas[i] as FaixaLote;
    const f = novaFaixa(e.faixas.length + 1, key, linha);
    e.indice[key] = e.faixas.length;
    e.faixas.push(f);
    return f;
  };
  const guardar = (f: FaixaLote): void => {
    e.faixas[e.indice[f.key] as number] = f;
  };

  for (const ev of eventos) {
    switch (ev.type) {
      case 'run.start':
        e.inicio = ev;
        e.runId = ev.id;
        e.total = ev.total;
        if (e.fase === 'aguardando') e.fase = 'rodando';
        break;
      case 'run.skip':
        e.pulos = ev;
        break;
      case 'catalog.progress':
        e.catalogo = ev.done >= ev.total ? null : { feitas: ev.done, total: ev.total };
        break;
      case 'catalog.result': {
        const f = faixaDe(ev.key, ev.line);
        if (ev.result === 'CORRIGIDO' && ev.searchLine && ev.searchLine !== f.linha) {
          guardar({ ...f, linhaBusca: ev.searchLine });
        }
        break;
      }
      case 'item.status': {
        const f = faixaDe(ev.key, ev.line);
        const novo: FaixaLote = { ...f, status: ev.status, naFilaDoUsuario: false, candidatos: null };
        if (ev.searchLine && ev.searchLine !== ev.line) novo.linhaBusca = ev.searchLine;
        if (ev.search) novo.busca = { consulta: ev.search.query, etapa: ev.search.stage, etapas: ev.search.stages };
        else if (ev.status !== 'pendente' && ev.status !== 'buscando') novo.busca = null;
        if (ev.status === 'pronta') novo.candidatos = ev.candidates ?? null;
        if (ev.status === 'baixando') {
          novo.usuario = ev.user ?? null;
          novo.formato = ev.format ?? null;
          novo.tentativa = ev.attempt ?? null;
          novo.naFilaDoUsuario = ev.remoteQueued === true;
        } else if (
          ev.status === 'pendente' ||
          ev.status === 'buscando' ||
          ev.status === 'verificar' ||
          ev.status === 'pronta'
        ) {
          novo.usuario = null;
          novo.formato = null;
        }
        guardar(novo);
        break;
      }
      case 'item.attemptFailed': {
        const i = e.indice[ev.key];
        if (i === undefined) break;
        const f = e.faixas[i] as FaixaLote;
        guardar({ ...f, ultimaFalha: `${ev.user ?? '—'}: ${ev.reason}`, tentativa: ev.attempt });
        break;
      }
      case 'item.diagnostic': {
        const f = faixaDe(ev.key, ev.line);
        guardar({ ...f, temDiagnostico: true });
        break;
      }
      case 'item.final': {
        const f = faixaDe(ev.key, ev.line);
        guardar({
          ...f,
          status: ev.status,
          naFilaDoUsuario: false,
          nota: ev.note,
          usuario: ev.user ?? f.usuario,
          formato: ev.format ?? f.formato,
          local: ev.local,
          busca: null,
          candidatos: null,
        });
        break;
      }
      case 'progress':
        e.progresso = ev;
        e.buscasPausadasAte = ev.searchesPausedUntil;
        e.janelaCheia = ev.searchWindowFull;
        break;
      case 'search.paused':
        e.buscasPausadasAte = ev.until;
        break;
      case 'search.windowFull':
        e.janelaCheia = ev.full;
        break;
      case 'warning': {
        const resto = e.avisos.filter((a) => a.codigo !== ev.code);
        resto.push({ codigo: ev.code, mensagem: ev.message, t: ev.t });
        e.avisos = resto;
        break;
      }
      case 'run.stopping':
        if (e.fase !== 'terminou') e.fase = 'parando';
        break;
      case 'run.end':
        e.fim = ev;
        e.fase = 'terminou';
        e.catalogo = null;
        break;
      default:
        break;
    }
  }

  e.contagem = contarFaixas(e.faixas);
  e.eventosAplicados = anterior.eventosAplicados + eventos.length;
  return e;
}

/** `run.end` para uma execução cujo processo sumiu sem registrar o fim (encerrada à força, PC desligado...). */
export function criarFimSintetico(motivo: string, t: string): RunEnd {
  return {
    v: 1,
    t,
    type: 'run.end',
    reason: 'interrupted',
    exitCode: 130,
    message: motivo,
    summary: {},
    files: {},
  };
}

// ---------------------------------------------------------------- Leitura da execução (derivados)

export type FiltroFaixas = 'todas' | GrupoFaixa;

export function contarPorGrupo(faixas: readonly FaixaLote[]): Record<FiltroFaixas, number> {
  const r: Record<FiltroFaixas, number> = { todas: faixas.length, andamento: 0, concluida: 0, atencao: 0, pulada: 0 };
  for (const f of faixas) r[infoDoStatus(f.status, f.naFilaDoUsuario).grupo]++;
  return r;
}

/** Minúsculas, sem acento e sem as letras que o NFD não decompõe (ø, æ, ß...): "byorn" acha "Byørn". */
const LETRAS_SEM_DECOMPOSICAO: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ð: 'd',
  đ: 'd',
  ł: 'l',
  þ: 'th',
};
const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[øæœßðđłþ]/g, (c) => LETRAS_SEM_DECOMPOSICAO[c] ?? c);

export function filtrarFaixas(faixas: readonly FaixaLote[], filtro: FiltroFaixas, busca: string): FaixaLote[] {
  const q = semAcento(busca.trim());
  return faixas.filter((f) => {
    if (filtro !== 'todas' && infoDoStatus(f.status, f.naFilaDoUsuario).grupo !== filtro) return false;
    return !q || semAcento(f.linha).includes(q);
  });
}

/** "Artista – Título (Mix)" separado no primeiro " - " (a linha do script sempre usa o hífen simples). */
export function separarLinha(linha: string): { artista: string; titulo: string } {
  const p = linha.indexOf(' - ');
  if (p <= 0) return { artista: '', titulo: linha };
  return { artista: linha.slice(0, p).trim(), titulo: linha.slice(p + 3).trim() };
}

/** O que a coluna "Observação" mostra para a faixa neste momento. */
export function observacaoDaFaixa(f: FaixaLote): string {
  const o = msg.lote.observacao;
  const partes: string[] = [];
  if (ehStatusFinal(f.status)) {
    if (f.nota) partes.push(f.nota);
    if (f.linhaBusca) partes.push(o.tituloCorrigido(f.linhaBusca));
    return partes.join(' · ');
  }
  switch (f.status) {
    case 'pendente':
    case 'buscando':
    case 'verificar':
      if (f.busca) partes.push(o.busca(f.busca.etapa, f.busca.etapas, f.busca.consulta));
      break;
    case 'pronta':
      if (f.candidatos !== null) partes.push(o.candidatos(f.candidatos));
      break;
    case 'baixando':
      if (f.naFilaDoUsuario) partes.push(o.naFilaDoUsuario);
      break;
    case 'importar':
    case 'importando':
      partes.push(o.organizando);
      break;
    default:
      break;
  }
  if (f.linhaBusca) partes.push(o.tituloCorrigido(f.linhaBusca));
  if (f.ultimaFalha) partes.push(o.tentativaFalhou(f.ultimaFalha));
  return partes.join(' · ');
}

// ---------------------------------------------------------------- Barra de progresso por faixa

export type CorSegmento = 'verde' | 'vermelho' | 'cinza' | 'azul' | 'roxo' | 'vazio';

/**
 * A barra do painel: uma célula por faixa (no máximo `maxCelulas`; acima disso, proporcional), na ordem
 * baixadas, atenção, puladas, em andamento, beets, aguardando. Células azuis e roxas pulsam enquanto rodam.
 */
export function segmentosDaBarra(c: Contagem, total: number, maxCelulas = 60): { cor: CorSegmento; ativo: boolean }[] {
  const n = Math.min(Math.max(total, 0), maxCelulas);
  if (n === 0) return [];
  const grupos: { cor: CorSegmento; qtd: number; ativo: boolean }[] = [
    { cor: 'verde', qtd: c.baixadas, ativo: false },
    { cor: 'vermelho', qtd: c.naoAchadas + c.falhas, ativo: false },
    { cor: 'cinza', qtd: c.puladas, ativo: false },
    { cor: 'azul', qtd: c.buscando + c.baixando + c.naFila, ativo: true },
    { cor: 'roxo', qtd: c.beets, ativo: true },
  ];
  const somaGrupos = grupos.reduce((s, g) => s + g.qtd, 0);
  const base = Math.max(total, somaGrupos);
  // maior resto: cada grupo fica com a parte inteira, e as células que sobram vão para os maiores restos
  const cotas = grupos.map((g) => (g.qtd / base) * n);
  const celulas = cotas.map(Math.floor);
  const alvo = Math.round(cotas.reduce((a, b) => a + b, 0));
  let sobra = alvo - celulas.reduce((a, b) => a + b, 0);
  const ordem = cotas.map((q, i) => ({ i, resto: q - Math.floor(q) })).sort((a, b) => b.resto - a.resto);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    if ((grupos[i] as { qtd: number }).qtd > 0) {
      celulas[i] = (celulas[i] as number) + 1;
      sobra--;
    }
  }
  const saida: { cor: CorSegmento; ativo: boolean }[] = [];
  grupos.forEach((g, i) => {
    for (let k = 0; k < (celulas[i] as number); k++) saida.push({ cor: g.cor, ativo: g.ativo });
  });
  while (saida.length < n) saida.push({ cor: 'vazio', ativo: false });
  return saida.slice(0, n);
}

// ---------------------------------------------------------------- Resumo do fim

export interface ResumoFim {
  ok: number;
  naoAchadas: number;
  falhas: number;
  puladas: number;
}

/** Contagens do `summary` do `run.end` (status → quantidade). */
export function resumirFim(summary: Record<string, number>): ResumoFim {
  const n = (k: string) => summary[k] ?? 0;
  return {
    ok: n('importada') + n('baixada'),
    naoAchadas: n('nao encontrada'),
    falhas: n('falhou') + n('baixada (beets falhou)'),
    puladas: n('ja feita') + n('ja na biblioteca'),
  };
}

// ---------------------------------------------------------------- Eventos numerados (reconexão sem perder nem repetir)

/**
 * O main numera o que empurra (`desde` = índice do primeiro item do grupo) e o renderer guarda quantos já aplicou.
 * Devolve só o que ainda não foi aplicado (grupo repetido → `[]`), ou `null` se faltou alguma coisa no meio (o
 * renderer deve pedir o estado de novo).
 */
export function novosDoLote<T>(aplicados: number, desde: number, itens: readonly T[]): T[] | null {
  if (desde > aplicados) return null;
  return itens.slice(aplicados - desde);
}
