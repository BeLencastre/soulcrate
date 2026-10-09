// LoteService (BatchService, §3.2): inicia o baixar-lista.ps1 destacado, acompanha o arquivo de eventos e o log de
// saída, para o lote com segurança (arquivo-sinal) e se reconecta a execuções que continuam vivas (trava P8).
// O lote NÃO é filho do app: fechar o app não o mata (§3.4). O app só lê os arquivos que ele grava.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { criarErro } from '@shared/erros';
import { lerLinhaEvento, type EventoLote, type RunEnd } from '@shared/eventos-lote';
import {
  arquivosDaExecucao,
  ehIdDeExecucao,
  idDeExecucao,
  nomeDeListaValido,
  nomeDoEstado,
  type AnexoExecucao,
  type ArquivoExecucao,
  type ResultadoInicio,
  type ResumoExecucao,
} from '@shared/lote';
import { criarFimSintetico, resumirFim } from '@shared/lote-estado';
import { msg } from '@shared/mensagens';
import type { MainEvent } from '@shared/ipc';
import type { OpcoesLote } from '@shared/opcoes-lote';
import type { ProjetoStatus } from '@shared/stack';
import { semBom } from '@shared/texto';
import { LeitorIncremental } from '../leitor-incremental';
import type { Lancador } from '../processos';
import { argumentosDoLancador, argumentosDoLote, POWERSHELL } from './lote-comando';

/** Quanto do log bruto fica em memória (o arquivo em `lotes/` guarda tudo). */
export const MAX_LINHAS_LOG = 5000;
const TIMEOUT_LANCADOR_MS = 30_000;
/** Execuções já terminadas que o app guarda na memória (as mais recentes); as de antes só existem em lotes/. */
export const MAX_EXECUCOES_TERMINADAS = 5;

export interface Trava {
  pid: number;
  inicio: string;
  id: string;
}

/** `lotes/estado-<lista>.lock`: uma linha `PID<TAB>início<TAB>id` (docs/eventos-lote.md, "Trava"). */
export function lerTrava(arquivo: string): Trava | null {
  let texto: string;
  try {
    texto = readFileSync(arquivo, 'utf8');
  } catch {
    return null;
  }
  const [pid, inicio, id] = semBom(texto.split(/\r?\n/)[0] ?? '').split('\t');
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return null;
  return { pid: n, inicio: inicio ?? '', id: id ?? '' };
}

/** O processo existe? (`kill(pid, 0)` não envia sinal; EPERM quer dizer que existe mas não é nosso.) */
export function processoVivoReal(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface NotificacaoLote {
  /** `pausa`: o servidor do Soulseek bloqueou as buscas por alguns minutos; `fim`: o lote terminou (ou parou, ou falhou) */
  tipo: 'fim' | 'pausa';
  titulo: string;
  corpo: string;
}

export interface DepsLoteService {
  lancador: Lancador;
  projeto(): ProjetoStatus;
  /** o slskd responde agora (a stack está no ar) */
  slskdNoAr(): boolean;
  emitir(evento: MainEvent): void;
  notificar(n: NotificacaoLote): void;
  agora(): number;
  processoVivo(pid: number): boolean;
  aoErro(e: unknown): void;
  /** intervalo da leitura dos arquivos (SP4: 500 ms) */
  intervaloMs?: number;
  /** quanto esperar o primeiro sinal do lote antes de dar a execução por perdida */
  semSinalMs?: number;
  /** só nos testes ponta a ponta: aponta o script para um slskd falso */
  slskdUrl?: string | null;
}

interface Acompanhamento {
  id: string;
  dir: string;
  eventos: EventoLote[];
  log: string[];
  /** índice absoluto da primeira linha de `log` (as mais antigas saem de memória) */
  logBase: number;
  leitorEventos: LeitorIncremental;
  leitorLog: LeitorIncremental;
  resumo: ResumoExecucao;
  timer: NodeJS.Timeout | null;
  lendo: boolean;
  /** o `run.end` já foi lido; falta só a última leitura do log */
  fimVisto: boolean;
  criadoEm: number;
  mortes: number;
  /** `files` do `run.start`/`run.end`, para o botão "Abrir" */
  arquivos: Partial<Record<ArquivoExecucao, string>>;
  /** `lista` pedida, usada até o `run.start` chegar */
  listaPedida: string | null;
}

export class LoteService {
  private readonly acomp = new Map<string, Acompanhamento>();
  private readonly intervalo: number;
  private readonly semSinal: number;

  constructor(private readonly d: DepsLoteService) {
    this.intervalo = d.intervaloMs ?? 500;
    this.semSinal = d.semSinalMs ?? 30_000;
  }

  // ------------------------------------------------------------ iniciar e parar

  async iniciar(entrada: { lista: string; opcoes: OpcoesLote }): Promise<ResultadoInicio> {
    const dir = this.d.projeto().dir;
    if (!dir) return { ok: false, erro: criarErro('projeto.ausente') };
    const { lista, opcoes } = entrada;
    if (!nomeDeListaValido(lista)) throw new Error('Nome de lista inválido.');

    const falha = (detalhes: string): ResultadoInicio => ({
      ok: false,
      erro: criarErro('lote.nao-iniciou', { detalhes }),
    });
    if (!existsSync(join(dir, lista))) return falha(`A lista ${lista} não existe na pasta do Soulcrate.`);
    if (!existsSync(join(dir, 'baixar-lista.ps1'))) return falha('O baixar-lista.ps1 não está na pasta do Soulcrate.');
    if (!this.d.slskdNoAr()) return { ok: false, erro: criarErro('lote.stack-fora') };

    const rodando = this.listaRodando(dir, lista);
    if (rodando) return { ok: false, erro: criarErro('lote.lista-rodando', { lista, desde: rodando.inicio }) };

    const lotes = join(dir, 'lotes');
    try {
      mkdirSync(lotes, { recursive: true });
    } catch (e) {
      return falha(`Não consegui criar a pasta lotes/: ${(e as Error).message}`);
    }
    const id = this.novoId(lotes);
    const arq = arquivosDaExecucao(id);
    const args = argumentosDoLancador({
      argumentosDoLote: argumentosDoLote({
        dir,
        lista,
        idExecucao: id,
        opcoes,
        ...(this.d.slskdUrl ? { slskdUrl: this.d.slskdUrl } : {}),
      }),
      saida: join(dir, arq.saida),
      erro: join(dir, arq.erro),
      cwd: dir,
    });
    const r = await this.d.lancador.lancar(POWERSHELL, args, { cwd: dir, timeoutMs: TIMEOUT_LANCADOR_MS });
    if (r.erroSpawn) return falha(`Não consegui abrir o PowerShell: ${r.erroSpawn.message}`);
    if (r.tempoEsgotado) return falha('O PowerShell não respondeu em 30 segundos.');
    if (r.codigo !== 0) return falha(`O lançador do lote saiu com o código ${String(r.codigo)}.`);

    this.acompanhar(id, dir, lista);
    return { ok: true, runId: id };
  }

  /** Cria o arquivo-sinal; o lote termina o que está em andamento, grava os relatórios e sai (P4). */
  parar(runId: string): void {
    const a = this.acomp.get(runId);
    if (!a || a.fimVisto) return;
    const arquivo = join(a.dir, arquivosDaExecucao(a.id).parada);
    mkdirSync(join(a.dir, 'lotes'), { recursive: true });
    writeFileSync(arquivo, `${new Date(this.d.agora()).toISOString()}\n`, 'utf8');
  }

  // ------------------------------------------------------------ consulta e reconexão

  /** Procura execuções que continuam vivas (trava com PID ativo e arquivo de eventos) e passa a acompanhá-las. */
  async reconectar(): Promise<void> {
    const dir = this.d.projeto().dir;
    if (!dir) return;
    let nomes: string[];
    try {
      nomes = readdirSync(join(dir, 'lotes'));
    } catch {
      return;
    }
    const novas: Acompanhamento[] = [];
    for (const nome of nomes) {
      if (!/^estado-.+\.lock$/.test(nome)) continue;
      const trava = lerTrava(join(dir, 'lotes', nome));
      if (!trava || !ehIdDeExecucao(trava.id) || this.acomp.has(trava.id)) continue;
      if (!this.d.processoVivo(trava.pid)) continue;
      if (!existsSync(join(dir, arquivosDaExecucao(trava.id).eventos))) continue; // iniciada pelo .bat: sem eventos
      const a = this.acompanhar(trava.id, dir, null);
      a.resumo.pid = trava.pid;
      novas.push(a);
    }
    // uma primeira leitura já traz o `run.start` (nome da lista, horário) para o resumo
    await Promise.all(novas.map((a) => this.sondar(a)));
  }

  /** Há um lote do app rodando agora? (síncrono: serve ao que não pode esperar uma promessa, como o `before-quit`.) */
  get rodandoAgora(): boolean {
    return [...this.acomp.values()].some((a) => !a.resumo.terminou);
  }

  async ativas(): Promise<ResumoExecucao[]> {
    await this.reconectar();
    return [...this.acomp.values()].map((a) => ({ ...a.resumo }));
  }

  anexar(runId: string): AnexoExecucao | null {
    const a = this.acomp.get(runId);
    if (!a) return null;
    return {
      eventos: a.eventos.slice(),
      log: a.log.slice(),
      logTotal: a.logBase + a.log.length,
      resumo: { ...a.resumo },
    };
  }

  /** Caminho absoluto de um arquivo da execução (só dentro de lotes/), ou null se ainda não existe. */
  caminhoDoArquivo(runId: string, arquivo: ArquivoExecucao): string | null {
    const a = this.acomp.get(runId);
    const rel = a?.arquivos[arquivo];
    if (!a || !rel) return null;
    const abs = resolve(a.dir, rel);
    const lotes = resolve(a.dir, 'lotes') + sep;
    return abs.startsWith(lotes) && existsSync(abs) ? abs : null;
  }

  encerrar(): void {
    for (const a of this.acomp.values()) this.pararTimer(a);
  }

  // ------------------------------------------------------------ internos

  private listaRodando(dir: string, lista: string): Trava | null {
    const trava = lerTrava(join(dir, 'lotes', `estado-${nomeDoEstado(lista)}.lock`));
    return trava && this.d.processoVivo(trava.pid) ? trava : null;
  }

  /** `yyyyMMdd-HHmmss`, com sufixo se já existe uma execução com esse id (duas listas iniciadas no mesmo segundo). */
  private novoId(lotes: string): string {
    const base = idDeExecucao(new Date(this.d.agora()));
    let id = base;
    for (let n = 2; existsSync(join(lotes, `eventos-${id}.jsonl`)) || this.acomp.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  private acompanhar(id: string, dir: string, lista: string | null): Acompanhamento {
    const arq = arquivosDaExecucao(id);
    const a: Acompanhamento = {
      id,
      dir,
      eventos: [],
      log: [],
      logBase: 0,
      leitorEventos: new LeitorIncremental(join(dir, arq.eventos)),
      leitorLog: new LeitorIncremental(join(dir, arq.saida)),
      resumo: { runId: id, lista, pid: null, iniciouEm: null, terminou: false },
      timer: null,
      lendo: false,
      fimVisto: false,
      criadoEm: this.d.agora(),
      mortes: 0,
      arquivos: { log: `lotes/execucao-${id}.log` },
      listaPedida: lista,
    };
    this.podar();
    this.acomp.set(id, a);
    a.timer = setInterval(() => void this.sondar(a), this.intervalo);
    a.timer.unref();
    return a;
  }

  /** Esquece as execuções terminadas mais antigas: cada uma guarda todos os eventos e o log na memória. */
  private podar(): void {
    const terminadas = [...this.acomp.values()].filter((a) => a.fimVisto);
    for (const a of terminadas.slice(0, Math.max(0, terminadas.length - MAX_EXECUCOES_TERMINADAS + 1))) {
      this.pararTimer(a);
      this.acomp.delete(a.id);
    }
  }

  private pararTimer(a: Acompanhamento): void {
    if (a.timer) clearInterval(a.timer);
    a.timer = null;
  }

  /** Uma leitura dos dois arquivos; no máximo uma por vez para cada execução. */
  private async sondar(a: Acompanhamento): Promise<void> {
    if (a.lendo) return;
    a.lendo = true;
    try {
      const linhas = await a.leitorEventos.lerNovas();
      const novos: EventoLote[] = [];
      for (const linha of linhas) {
        try {
          const ev = lerLinhaEvento(linha);
          if (ev) novos.push(ev);
        } catch (e) {
          this.d.aoErro(e); // linha ruim vai para o log; não derruba a leitura
        }
      }
      const linhasLog = await a.leitorLog.lerNovas();

      // a última leitura depois do `run.end` já aconteceu: só falta parar o relógio
      if (a.fimVisto) {
        this.registrarLog(a, linhasLog);
        this.pararTimer(a);
        return;
      }
      this.registrarEventos(a, novos);
      this.registrarLog(a, linhasLog);
      if (a.fimVisto) return;

      this.conferirSeSumiu(a, novos.length);
    } catch (e) {
      this.d.aoErro(e);
    } finally {
      a.lendo = false;
    }
  }

  private registrarEventos(a: Acompanhamento, novos: EventoLote[]): void {
    if (novos.length === 0) return;
    const desde = a.eventos.length;
    a.eventos.push(...novos);
    this.d.emitir({ type: 'batch.events', runId: a.id, desde, eventos: novos });
    for (const ev of novos) this.aoEvento(a, ev);
  }

  private registrarLog(a: Acompanhamento, linhas: string[]): void {
    if (linhas.length === 0) return;
    const desde = a.logBase + a.log.length;
    a.log.push(...linhas);
    if (a.log.length > MAX_LINHAS_LOG) {
      const sobra = a.log.length - MAX_LINHAS_LOG;
      a.log.splice(0, sobra);
      a.logBase += sobra;
    }
    this.d.emitir({ type: 'batch.log', runId: a.id, desde, linhas });
  }

  private aoEvento(a: Acompanhamento, ev: EventoLote): void {
    switch (ev.type) {
      case 'run.start':
        a.resumo.lista = ev.list;
        a.resumo.pid = ev.pid;
        a.resumo.iniciouEm = ev.t;
        this.guardarArquivos(a, ev.files);
        break;
      case 'search.paused':
        this.d.notificar({
          tipo: 'pausa',
          titulo: msg.lote.notificacao.buscasPausadasTitulo,
          corpo: msg.lote.notificacao.buscasPausadasCorpo(horaLocal(ev.until), a.resumo.lista ?? a.listaPedida),
        });
        break;
      case 'run.end':
        this.guardarArquivos(a, ev.files);
        a.fimVisto = true;
        a.resumo.terminou = true;
        this.d.notificar(notificacaoDoFim(ev, a.resumo.lista ?? a.listaPedida));
        break;
      default:
        break;
    }
  }

  private guardarArquivos(a: Acompanhamento, f: RunEnd['files']): void {
    const mapa: [ArquivoExecucao, string | undefined][] = [
      ['resultado', f.result],
      ['nao-baixadas', f.notDownloaded],
      ['diagnostico', f.diagnostic],
      ['catalogo', f.catalog],
      ['log', f.runLog],
    ];
    for (const [chave, rel] of mapa) if (rel) a.arquivos[chave] = rel;
  }

  /**
   * O processo sumiu sem escrever o `run.end` (encerrado à força, PC desligado)? Duas sondagens seguidas sem o processo
   * e sem novidade bastam. Se o lote nem chegou a escrever o primeiro evento (PowerShell sem permissão para rodar o
   * script, por exemplo), o `erro-<id>.log` costuma explicar.
   */
  private conferirSeSumiu(a: Acompanhamento, novidades: number): void {
    const pid = a.resumo.pid;
    if (pid !== null) {
      a.mortes = this.d.processoVivo(pid) ? 0 : a.mortes + 1;
      if (a.mortes >= 2 && novidades === 0) this.sintetizarFim(a, msg.lote.fim.sumiu);
      return;
    }
    if (this.d.agora() - a.criadoEm < this.semSinal) return;
    const erro = lerFim(join(a.dir, arquivosDaExecucao(a.id).erro), 600);
    this.sintetizarFim(a, erro ? `${msg.lote.fim.naoComecou} ${erro}` : msg.lote.fim.naoComecou);
  }

  private sintetizarFim(a: Acompanhamento, motivo: string): void {
    const fim = criarFimSintetico(motivo, new Date(this.d.agora()).toISOString());
    this.registrarEventos(a, [fim]);
  }
}

function lerFim(arquivo: string, max: number): string {
  try {
    return readFileSync(arquivo, 'utf8').trim().slice(-max);
  } catch {
    return '';
  }
}

export function horaLocal(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function notificacaoDoFim(fim: RunEnd, lista: string | null): NotificacaoLote {
  const n = msg.lote.notificacao;
  const r = resumirFim(fim.summary);
  const titulo = n.titulo[fim.reason];
  const contagem = fim.reason === 'completed' || fim.reason === 'user' ? n.contagem(r) : fim.message;
  return { tipo: 'fim', titulo, corpo: lista ? `${lista}: ${contagem}` : contagem };
}
