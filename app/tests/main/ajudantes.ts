// Dublês compartilhados dos testes dos serviços do main: um Executor falso que responde por "linha de comando".
import type { Executor, OpcoesProcesso, OpcoesStream, ProcessoVivo, ResultadoProcesso } from '../../src/main/processos';

export type Resposta = Partial<ResultadoProcesso> & { atraso?: number };
export type Respondedor = (comando: string, args: readonly string[], opcoes: OpcoesProcesso) => Resposta | undefined;

export const OK = (stdout = ''): Resposta => ({ codigo: 0, stdout, stderr: '' });
export const FALHA = (stderr = 'falhou', codigo = 1): Resposta => ({ codigo, stdout: '', stderr });
export const NAO_EXISTE: Resposta = {
  codigo: null,
  erroSpawn: Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException,
};

const completo = (r: Resposta): ResultadoProcesso => ({
  codigo: null,
  stdout: '',
  stderr: '',
  tempoEsgotado: false,
  erroSpawn: null,
  ...r,
});

export interface ProcessoFalso extends ProcessoVivo {
  /** termina o processo com este resultado */
  finalizar(r?: Resposta): void;
  encerrado: boolean;
}

/** Executor cujas respostas vêm de uma função; guarda cada chamada em `chamadas` ("docker compose ps -a ..."). */
export class ExecutorFalso implements Executor {
  readonly chamadas: string[] = [];
  readonly processos: ProcessoFalso[] = [];

  constructor(private responder: Respondedor) {}

  trocar(responder: Respondedor): void {
    this.responder = responder;
  }

  executar(comando: string, args: readonly string[], opcoes: OpcoesProcesso = {}): Promise<ResultadoProcesso> {
    this.chamadas.push([comando, ...args].join(' '));
    const r = this.responder(comando, args, opcoes) ?? FALHA(`sem resposta para: ${comando} ${args.join(' ')}`);
    if (r.atraso) return new Promise((res) => setTimeout(() => res(completo(r)), r.atraso));
    return Promise.resolve(completo(r));
  }

  iniciar(comando: string, args: readonly string[], opcoes: OpcoesStream): ProcessoVivo {
    this.chamadas.push([comando, ...args].join(' '));
    let resolver!: (r: ResultadoProcesso) => void;
    const terminou = new Promise<ResultadoProcesso>((res) => (resolver = res));
    const processo: ProcessoFalso = {
      pid: 1000 + this.processos.length,
      encerrado: false,
      terminou,
      encerrar() {
        processo.encerrado = true;
        resolver(completo({ codigo: null }));
      },
      finalizar(r = OK()) {
        resolver(completo(r));
      },
    };
    this.processos.push(processo);
    // o respondedor pode despejar linhas e já decidir como termina
    const r = this.responder(comando, args, opcoes);
    if (r) {
      const linhas = [...(r.stdout ?? '').split('\n'), ...(r.stderr ?? '').split('\n')].filter(Boolean);
      queueMicrotask(() => {
        for (const l of linhas) opcoes.aoLinha(l, 'stdout');
        if (r.codigo !== undefined || r.erroSpawn) processo.finalizar(r);
      });
    }
    return processo;
  }
}

export const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera até a condição valer (ou falha), para os eventos assíncronos dos serviços. */
export async function ate(cond: () => boolean, ms = 2000): Promise<void> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (cond()) return;
    await esperar(5);
  }
  throw new Error('Condição não aconteceu a tempo.');
}
