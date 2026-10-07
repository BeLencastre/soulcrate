// HealthService (§3.2 e §6.2): sonda o Docker, os contêineres e os endpoints HTTP e publica o estado da stack.
// Sobrevive ao Docker reiniciar, ao slskd cair e à suspensão do PC: cada ciclo recomeça do que consegue medir.
import { SERVICOS, type ServicoInfo } from '@shared/servicos';
import {
  servicoAusente,
  statusInicial,
  type ConfigStatus,
  type DockerStatus,
  type OperacaoStack,
  type ProjetoStatus,
  type ServicoStatus,
  type StackStatus,
} from '@shared/stack';
import { servicosDoPs, type ContainerPs } from '../docker-parsers';
import type { DeteccaoDocker, DockerService } from './docker-service';

/** §6.4: a cada 5 s com a janela visível e a cada 30 s quando está minimizada ou na bandeja. */
export const INTERVALO_VISIVEL_MS = 5_000;
export const INTERVALO_OCULTO_MS = 30_000;
const TIMEOUT_HTTP_MS = 2_500;

export interface DependenciasHealth {
  docker: DockerService;
  projeto(): ProjetoStatus;
  validarConfig(dir: string): ConfigStatus;
  /** `true` se o endereço respondeu com sucesso dentro do tempo */
  sondar(url: string, timeoutMs: number): Promise<boolean>;
  agora(): number;
  /** erros inesperados do ciclo (vão para o log) */
  aoErro?(erro: unknown): void;
}

export function urlDeSaude(s: ServicoInfo): string {
  return `http://127.0.0.1:${s.porta}${s.caminhoSaude}`;
}

/** O que muda de uma sondagem para outra (ignora `atualizadoEm`, que sempre muda). */
function assinatura(s: StackStatus): string {
  // só importa se já houve uma sondagem (a primeira sempre é publicada), não quando foi
  return JSON.stringify({ ...s, atualizadoEm: s.atualizadoEm > 0 });
}

export class HealthService {
  private status: StackStatus = statusInicial();
  private ultimaAssinatura = assinatura(this.status);
  private readonly ouvintes = new Set<(s: StackStatus) => void>();
  private emAndamento: Promise<StackStatus> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private intervaloMs = INTERVALO_VISIVEL_MS;
  private rodando = false;

  /** última detecção do Docker; reaproveitada enquanto o `compose ps` funciona */
  private deteccao: DeteccaoDocker | null = null;
  private operacao: OperacaoStack | null = null;
  private abrindoDesde: number | null = null;

  constructor(private readonly dep: DependenciasHealth) {}

  get atual(): StackStatus {
    return this.status;
  }

  aoMudar(ouvinte: (s: StackStatus) => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  iniciar(): void {
    if (this.rodando) return;
    this.rodando = true;
    void this.laco();
  }

  parar(): void {
    this.rodando = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  definirIntervalo(ms: number): void {
    if (ms === this.intervaloMs) return;
    this.intervaloMs = ms;
    // reagenda já com o novo ritmo (a espera atual pode ter sido de 30 s)
    if (this.rodando && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      void this.laco();
    }
  }

  definirOperacao(op: OperacaoStack | null): void {
    this.operacao = op;
    this.publicar({ ...this.status, operacao: op });
  }

  definirAbrindoDocker(desdeMs: number | null): void {
    this.abrindoDesde = desdeMs;
    this.publicar({
      ...this.status,
      docker: { ...this.status.docker, abrindo: desdeMs === null ? null : { desdeMs } },
    });
  }

  /** O Docker pode ter mudado de estado por causa do que o app acabou de fazer: sonda de novo do zero. */
  invalidarDeteccao(): void {
    this.deteccao = null;
  }

  /**
   * Faz uma sondagem agora. Se já há uma em andamento, espera por ela; com `forcar`, espera e faz outra
   * (o estado pode ter mudado logo depois que ela começou, por exemplo no fim de um `compose up`).
   */
  async atualizar(opcoes: { forcar?: boolean } = {}): Promise<StackStatus> {
    if (this.emAndamento) {
      const anterior = this.emAndamento;
      if (!opcoes.forcar) return anterior;
      await anterior.catch(() => undefined);
      if (this.emAndamento) return this.emAndamento;
    }
    const p = this.ciclo().finally(() => {
      if (this.emAndamento === p) this.emAndamento = null;
    });
    this.emAndamento = p;
    return p;
  }

  private async laco(): Promise<void> {
    if (!this.rodando || this.timer) return;
    try {
      await this.atualizar();
    } catch (e) {
      this.dep.aoErro?.(e);
    }
    if (!this.rodando) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.laco();
    }, this.intervaloMs);
  }

  private async ciclo(): Promise<StackStatus> {
    const projeto = this.dep.projeto();
    let ps: ContainerPs[] | null = null;

    // Caminho rápido: com a engine de pé basta o `compose ps` (~1 s). Se ele falhar, detecta tudo de novo.
    if (this.deteccao?.engine && projeto.dir) ps = await this.dep.docker.composePs(projeto.dir);
    if (!this.deteccao?.engine || ps === null || !projeto.dir) {
      this.deteccao = await this.dep.docker.detectar();
      if (this.deteccao.engine && projeto.dir && ps === null) ps = await this.dep.docker.composePs(projeto.dir);
    }
    const det = this.deteccao;

    const docker: DockerStatus = {
      instalacao: det.instalacao,
      desktop: det.desktop,
      engine: det.engine,
      versaoServidor: det.versaoServidor,
      compose: det.compose,
      abrindo: this.abrindoDesde === null ? null : { desdeMs: this.abrindoDesde },
    };

    const configuracao: ConfigStatus = projeto.dir
      ? this.dep.validarConfig(projeto.dir)
      : { estado: 'sem-projeto', erros: 0, avisos: 0, achados: [] };

    let servicos: ServicoStatus[] = SERVICOS.map((s) => servicoAusente(s.id));
    if (ps) servicos = await this.sondarHttp(servicosDoPs(ps));

    const novo: StackStatus = {
      atualizadoEm: this.dep.agora(),
      projeto,
      docker,
      configuracao,
      servicos,
      operacao: this.operacao,
    };
    this.publicar(novo);
    return this.status;
  }

  private async sondarHttp(servicos: ServicoStatus[]): Promise<ServicoStatus[]> {
    return Promise.all(
      servicos.map(async (s) => {
        if (s.container !== 'running') return s;
        const info = SERVICOS.find((x) => x.id === s.id);
        if (!info) return s;
        const ok = await this.dep.sondar(urlDeSaude(info), TIMEOUT_HTTP_MS).catch(() => false);
        return { ...s, http: ok };
      }),
    );
  }

  private publicar(novo: StackStatus): void {
    const sig = assinatura(novo);
    this.status = novo;
    if (sig === this.ultimaAssinatura) return;
    this.ultimaAssinatura = sig;
    for (const o of [...this.ouvintes]) {
      try {
        o(novo);
      } catch (e) {
        this.dep.aoErro?.(e);
      }
    }
  }
}
