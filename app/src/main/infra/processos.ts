// Execução de processos externos (§6.1 e §6.2): sempre com lista de argumentos, nunca com string de shell;
// timeout em tudo; todo filho fica registrado e é encerrado, com a árvore inteira, quando o app sai.
import { spawn, type ChildProcess } from 'node:child_process';

export interface OpcoesProcesso {
  cwd?: string;
  /** padrão: sem limite (use sempre que houver risco de travar) */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ResultadoProcesso {
  /** null quando o processo foi morto (timeout, abortado) ou não chegou a rodar */
  codigo: number | null;
  stdout: string;
  stderr: string;
  tempoEsgotado: boolean;
  /** falha ao iniciar (ENOENT: o executável não existe no PATH) */
  erroSpawn: NodeJS.ErrnoException | null;
}

export interface ProcessoVivo {
  pid: number | undefined;
  /** encerra o processo e seus filhos */
  encerrar(): void;
  terminou: Promise<ResultadoProcesso>;
}

export interface OpcoesStream extends OpcoesProcesso {
  /** chamado para cada linha completa de stdout ou stderr (sem o fim de linha) */
  aoLinha(linha: string, fonte: 'stdout' | 'stderr'): void;
}

/** Interface que os serviços usam; os testes trocam por um dublê. */
export interface Executor {
  executar(comando: string, args: readonly string[], opcoes?: OpcoesProcesso): Promise<ResultadoProcesso>;
  iniciar(comando: string, args: readonly string[], opcoes: OpcoesStream): ProcessoVivo;
}

/** Junta pedaços de saída em linhas, tratando \r\n, \n e \r (o BuildKit usa \r em modo tty). */
export class DivisorDeLinhas {
  private resto = '';

  constructor(private readonly aoLinha: (linha: string) => void) {}

  adicionar(pedaco: string): void {
    const texto = this.resto + pedaco;
    const partes = texto.split(/\r\n|\n|\r/);
    this.resto = partes.pop() ?? '';
    for (const p of partes) this.aoLinha(p);
  }

  terminar(): void {
    if (this.resto) this.aoLinha(this.resto);
    this.resto = '';
  }
}

export class ExecutorReal implements Executor {
  private readonly vivos = new Set<ChildProcess>();

  executar(comando: string, args: readonly string[], opcoes: OpcoesProcesso = {}): Promise<ResultadoProcesso> {
    const bufs: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };
    const vivo = this.rodar(comando, args, opcoes, {
      stdout: (p) => bufs.stdout.push(p),
      stderr: (p) => bufs.stderr.push(p),
    });
    return vivo.terminou.then((r) => ({ ...r, stdout: bufs.stdout.join(''), stderr: bufs.stderr.join('') }));
  }

  iniciar(comando: string, args: readonly string[], opcoes: OpcoesStream): ProcessoVivo {
    const out = new DivisorDeLinhas((l) => opcoes.aoLinha(l, 'stdout'));
    const err = new DivisorDeLinhas((l) => opcoes.aoLinha(l, 'stderr'));
    const vivo = this.rodar(comando, args, opcoes, {
      stdout: (p) => out.adicionar(p),
      stderr: (p) => err.adicionar(p),
    });
    return {
      pid: vivo.pid,
      encerrar: vivo.encerrar,
      terminou: vivo.terminou.then((r) => {
        out.terminar();
        err.terminar();
        return r;
      }),
    };
  }

  /** Encerra todos os filhos que ainda estão vivos (chamado ao sair do app). */
  encerrarTodos(): void {
    for (const filho of [...this.vivos]) matarArvore(filho);
  }

  get quantidadeVivos(): number {
    return this.vivos.size;
  }

  private rodar(
    comando: string,
    args: readonly string[],
    opcoes: OpcoesProcesso,
    saida: { stdout: (p: string) => void; stderr: (p: string) => void },
  ): ProcessoVivo {
    let filho: ChildProcess;
    try {
      filho = spawn(comando, [...args], {
        cwd: opcoes.cwd,
        env: opcoes.env ?? process.env,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const erro = e as NodeJS.ErrnoException;
      return {
        pid: undefined,
        encerrar: () => undefined,
        terminou: Promise.resolve({ codigo: null, stdout: '', stderr: '', tempoEsgotado: false, erroSpawn: erro }),
      };
    }
    this.vivos.add(filho);
    filho.stdout?.setEncoding('utf8');
    filho.stderr?.setEncoding('utf8');
    filho.stdout?.on('data', saida.stdout);
    filho.stderr?.on('data', saida.stderr);

    let tempoEsgotado = false;
    let timer: NodeJS.Timeout | undefined;
    if (opcoes.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        tempoEsgotado = true;
        matarArvore(filho);
      }, opcoes.timeoutMs);
    }
    const aoAbortar = () => matarArvore(filho);
    opcoes.signal?.addEventListener('abort', aoAbortar, { once: true });
    if (opcoes.signal?.aborted) aoAbortar();

    const terminou = new Promise<ResultadoProcesso>((resolve) => {
      let erroSpawn: NodeJS.ErrnoException | null = null;
      let resolvido = false;
      const fim = (codigo: number | null) => {
        if (resolvido) return;
        resolvido = true;
        if (timer) clearTimeout(timer);
        opcoes.signal?.removeEventListener('abort', aoAbortar);
        this.vivos.delete(filho);
        resolve({ codigo, stdout: '', stderr: '', tempoEsgotado, erroSpawn });
      };
      filho.once('error', (e: NodeJS.ErrnoException) => {
        erroSpawn = e;
        fim(null);
      });
      filho.once('close', (codigo) => fim(codigo));
    });
    return { pid: filho.pid, encerrar: () => matarArvore(filho), terminou };
  }
}

/** No Windows, `kill()` não alcança os netos (o `docker compose logs -f` cria um processo filho): taskkill /T. */
export function matarArvore(filho: ChildProcess): void {
  if (filho.exitCode !== null || filho.killed || filho.pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on(
        'error',
        () => filho.kill(),
      );
    } catch {
      filho.kill();
    }
  } else {
    filho.kill('SIGTERM');
  }
}

// ---------------------------------------------------------------- Lançador (processo que não pode morrer com o app)

export interface OpcoesLancamento {
  cwd?: string;
  timeoutMs: number;
}

export interface ResultadoLancamento {
  /** código de saída do lançador (0 = o processo destacado foi iniciado); null se não terminou ou não rodou */
  codigo: number | null;
  tempoEsgotado: boolean;
  erroSpawn: NodeJS.ErrnoException | null;
}

/** Inicia o lançador de um processo destacado e espera só o lançador sair (SP3). */
export interface Lancador {
  lancar(comando: string, args: readonly string[], opcoes: OpcoesLancamento): Promise<ResultadoLancamento>;
}

/**
 * O lançador roda sem pipe nenhum (`stdio: 'ignore'`) e a espera é pelo evento `exit`, não por `close`: o processo que
 * ele cria com `Start-Process` herda os handles do lançador, e um pipe de saída só fecharia quando o lote terminasse
 * (SP3, "Armadilha encontrada: handles herdados"). Não entra em `ExecutorReal.vivos` de propósito: o lote não é filho
 * do app e não deve ser encerrado junto com ele.
 */
export class LancadorReal implements Lancador {
  lancar(comando: string, args: readonly string[], opcoes: OpcoesLancamento): Promise<ResultadoLancamento> {
    return new Promise((resolve) => {
      let filho: ChildProcess;
      try {
        filho = spawn(comando, [...args], { cwd: opcoes.cwd, windowsHide: true, shell: false, stdio: 'ignore' });
      } catch (e) {
        resolve({ codigo: null, tempoEsgotado: false, erroSpawn: e as NodeJS.ErrnoException });
        return;
      }
      let tempoEsgotado = false;
      let resolvido = false;
      const fim = (r: ResultadoLancamento) => {
        if (resolvido) return;
        resolvido = true;
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        tempoEsgotado = true;
        matarArvore(filho);
        fim({ codigo: null, tempoEsgotado: true, erroSpawn: null });
      }, opcoes.timeoutMs);
      filho.once('error', (e: NodeJS.ErrnoException) => fim({ codigo: null, tempoEsgotado, erroSpawn: e }));
      filho.once('exit', (codigo) => fim({ codigo, tempoEsgotado, erroSpawn: null }));
    });
  }
}
