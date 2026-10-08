// DockerService (§3.2): detecta o Docker, abre o Docker Desktop e roda `docker compose`.
// A ordem e os tempos vêm das investigações SP1 e SP2 (docs/spikes/).
import { join } from 'node:path';
import type { AlvoLog } from '@shared/ipc';
import type { DockerDesktopEstado, DockerInstalacao } from '@shared/stack';
import { parseComposePs, parseDesktopStatus, type ContainerPs } from '../docker-parsers';
import type { Executor, OpcoesProcesso, ProcessoVivo, ResultadoProcesso } from '../processos';

/** Tempos medidos no SP1: 0,7–2 s para detectar; o primeiro `compose ps` a frio chegou a 14 s. */
export const TIMEOUT_DETECCAO_MS = 10_000;
export const TIMEOUT_PS_MS = 30_000;
/** SP2: a engine pode levar mais de 1 min para subir depois de ligar o PC. */
export const TIMEOUT_ABRIR_DOCKER_MS = 180_000;
const INTERVALO_ENGINE_MS = 2_000;

export interface DeteccaoDocker {
  instalacao: DockerInstalacao;
  desktop: DockerDesktopEstado;
  engine: boolean;
  versaoServidor: string | null;
  compose: string | null;
}

export interface DependenciasDocker {
  executor: Executor;
  /** o arquivo existe? (injetado para os testes) */
  existe(caminho: string): boolean;
  /** abre um executável com o programa padrão (shell.openPath) */
  abrirExecutavel(caminho: string): Promise<string>;
  /** `%ProgramFiles%` */
  programFiles: string;
  dormir(ms: number): Promise<void>;
  agora(): number;
}

export type ResultadoAbrirDocker = 'pronto' | 'timeout' | 'cancelado' | 'ausente';

export class DockerService {
  constructor(private readonly dep: DependenciasDocker) {}

  get executavelDesktop(): string {
    return join(this.dep.programFiles, 'Docker', 'Docker', 'Docker Desktop.exe');
  }

  private docker(args: readonly string[], opcoes: OpcoesProcesso = {}): Promise<ResultadoProcesso> {
    return this.dep.executor.executar('docker', args, { timeoutMs: TIMEOUT_DETECCAO_MS, ...opcoes });
  }

  /**
   * SP1: `docker version` diz se há cliente (ENOENT = não instalado) e se a engine responde; o
   * `docker desktop status` só entra quando a engine não responde, para separar "fechado" de "outro problema".
   */
  async detectar(): Promise<DeteccaoDocker> {
    const [engine, compose] = await Promise.all([
      this.docker(['version', '--format', '{{.Server.Version}}']),
      this.docker(['compose', 'version', '--short']),
    ]);

    if (engine.erroSpawn) {
      const instalacao: DockerInstalacao = this.dep.existe(this.executavelDesktop) ? 'fora-do-path' : 'ausente';
      return { instalacao, desktop: 'desconhecido', engine: false, versaoServidor: null, compose: null };
    }

    const versao = engine.codigo === 0 ? engine.stdout.trim() : '';
    const composeVersao = compose.codigo === 0 && compose.stdout.trim() ? compose.stdout.trim() : null;
    if (versao) {
      return { instalacao: 'ok', desktop: 'aberto', engine: true, versaoServidor: versao, compose: composeVersao };
    }

    const desktop = await this.docker(['desktop', 'status', '--format', 'json']);
    return {
      instalacao: 'ok',
      desktop: desktop.codigo === 0 ? parseDesktopStatus(desktop.stdout) : 'desconhecido',
      engine: false,
      versaoServidor: null,
      compose: composeVersao,
    };
  }

  /** A engine responde agora? (usado no laço de espera depois de abrir o Docker Desktop) */
  async engineResponde(): Promise<boolean> {
    const r = await this.docker(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 8_000 });
    return r.codigo === 0 && r.stdout.trim().length > 0;
  }

  /**
   * SP2: `docker desktop start --detach` (ou o executável, se a CLI não tiver o subcomando) e espera a engine
   * responder, de 2 em 2 s, por até 3 min. `aoProgresso` recebe os segundos decorridos.
   */
  async abrirDockerDesktop(
    opcoes: { timeoutMs?: number; signal?: AbortSignal; aoProgresso?: (segundos: number) => void } = {},
  ): Promise<ResultadoAbrirDocker> {
    const limite = opcoes.timeoutMs ?? TIMEOUT_ABRIR_DOCKER_MS;
    const inicio = this.dep.agora();

    if (await this.engineResponde()) return 'pronto';

    const start = await this.docker(['desktop', 'start', '--detach'], { timeoutMs: 30_000 });
    if (start.erroSpawn) {
      if (!this.dep.existe(this.executavelDesktop)) return 'ausente';
      await this.dep.abrirExecutavel(this.executavelDesktop);
    } else if (start.codigo !== 0) {
      // Docker Desktop antigo, sem `docker desktop`: abre o programa
      if (!this.dep.existe(this.executavelDesktop)) return 'ausente';
      await this.dep.abrirExecutavel(this.executavelDesktop);
    }

    while (this.dep.agora() - inicio < limite) {
      if (opcoes.signal?.aborted) return 'cancelado';
      opcoes.aoProgresso?.(Math.floor((this.dep.agora() - inicio) / 1000));
      await this.dep.dormir(INTERVALO_ENGINE_MS);
      if (opcoes.signal?.aborted) return 'cancelado';
      if (await this.engineResponde()) return 'pronto';
    }
    return 'timeout';
  }

  // -------------------------------------------------------------- compose

  /** `docker compose ps -a`: null se o comando falhou (engine fora do ar, projeto inválido...). */
  async composePs(dir: string): Promise<ContainerPs[] | null> {
    const r = await this.docker(['compose', 'ps', '-a', '--format', 'json'], { cwd: dir, timeoutMs: TIMEOUT_PS_MS });
    if (r.erroSpawn || r.codigo !== 0) return null;
    return parseComposePs(r.stdout);
  }

  /**
   * `docker compose up -d --build`, equivalente ao subir.bat. `rebuild` acrescenta `--force-recreate`: refaz a
   * imagem (com o cache das camadas) e recria os contêineres. Saída linha a linha em `aoLinha`.
   */
  ligar(dir: string, opcoes: { rebuild: boolean; aoLinha: (linha: string) => void }): ProcessoVivo {
    const args = ['compose', '--progress', 'plain', 'up', '-d', '--build'];
    if (opcoes.rebuild) args.push('--force-recreate');
    return this.dep.executor.iniciar('docker', args, { cwd: dir, aoLinha: (l) => opcoes.aoLinha(l) });
  }

  /** `docker compose down`, equivalente ao parar.bat. */
  desligar(dir: string, aoLinha: (linha: string) => void): ProcessoVivo {
    return this.dep.executor.iniciar('docker', ['compose', '--progress', 'plain', 'down'], {
      cwd: dir,
      aoLinha: (l) => aoLinha(l),
    });
  }

  reiniciar(dir: string, servico: string, aoLinha: (linha: string) => void): ProcessoVivo {
    return this.dep.executor.iniciar('docker', ['compose', '--progress', 'plain', 'restart', servico], {
      cwd: dir,
      aoLinha: (l) => aoLinha(l),
    });
  }

  /** `docker compose exec -T <serviço> ...` (sem TTY: o status.bat rodava num console, o app não). */
  exec(dir: string, servico: string, comando: readonly string[], timeoutMs = 20_000): Promise<ResultadoProcesso> {
    return this.docker(['compose', 'exec', '-T', servico, ...comando], { cwd: dir, timeoutMs });
  }

  /** `docker compose logs -f --tail 200` de um serviço ou de todos. */
  logs(dir: string, alvo: AlvoLog, aoLinha: (linha: string) => void): ProcessoVivo {
    const args = ['compose', 'logs', '-f', '--tail', '200', '--timestamps', '--no-color'];
    if (alvo !== 'todos') args.push(alvo);
    return this.dep.executor.iniciar('docker', args, { cwd: dir, aoLinha: (l) => aoLinha(l) });
  }
}
