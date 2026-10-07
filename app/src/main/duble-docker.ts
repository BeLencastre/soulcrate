// Ganchos de teste (nunca no app empacotado): trocam o `docker` por um script Node e as sondagens HTTP por "ok",
// para rodar o app (e2e e `npm run dev`) sem Docker de verdade. Ligados por variáveis de ambiente.
import type { Executor, OpcoesProcesso, OpcoesStream, ProcessoVivo, ResultadoProcesso } from './processos';

/** Script que faz o papel do `docker` (veja tests/e2e/dubles/docker-falso.mjs). */
export const VAR_DOCKER_DUBLE = 'SOULCRATE_DOCKER_DUBLE';
/** `1`: toda sondagem HTTP responde que está no ar. */
export const VAR_HTTP_DUBLE = 'SOULCRATE_HTTP_DUBLE';

/** Roda `docker ...` como `electron <script> ...` (o Electron como Node, com ELECTRON_RUN_AS_NODE). */
export class ExecutorComDockerFalso implements Executor {
  constructor(
    private readonly real: Executor,
    private readonly script: string,
  ) {}

  private traduzir(
    comando: string,
    args: readonly string[],
    env?: NodeJS.ProcessEnv,
  ): [string, string[], NodeJS.ProcessEnv | undefined] {
    if (comando !== 'docker') return [comando, [...args], env];
    return [process.execPath, [this.script, ...args], { ...(env ?? process.env), ELECTRON_RUN_AS_NODE: '1' }];
  }

  executar(comando: string, args: readonly string[], opcoes: OpcoesProcesso = {}): Promise<ResultadoProcesso> {
    const [c, a, env] = this.traduzir(comando, args, opcoes.env);
    return this.real.executar(c, a, { ...opcoes, ...(env ? { env } : {}) });
  }

  iniciar(comando: string, args: readonly string[], opcoes: OpcoesStream): ProcessoVivo {
    const [c, a, env] = this.traduzir(comando, args, opcoes.env);
    return this.real.iniciar(c, a, { ...opcoes, ...(env ? { env } : {}) });
  }
}
