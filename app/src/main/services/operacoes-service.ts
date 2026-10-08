// OperacoesService: ligar, desligar, reconstruir, reiniciar um serviço e abrir o Docker Desktop.
// Cada uma é uma operação com id: o renderer acompanha por `operation.log` e `operation.end`. Só uma por vez.
import { criarErro, erroInesperado, type AppError } from '@shared/erros';
import type { MainEvent, OperacaoIniciada, OperacaoTipo, OperationId } from '@shared/ipc';
import type { ServicoId } from '@shared/servicos';
import type { ConfigStatus, OperacaoStack, ProjetoStatus } from '@shared/stack';
import { classificarFalhaCompose, detectarMarcador } from '../docker-parsers';
import { redigirSegredos } from '../seguranca';
import type { DockerService } from './docker-service';
import type { HealthService } from './health-service';

export interface DependenciasOperacoes {
  docker: DockerService;
  health: HealthService;
  projeto(): ProjetoStatus;
  validarConfig(dir: string): ConfigStatus;
  emitir(evento: MainEvent): void;
  novoId(): OperationId;
  agora(): number;
  aoErro?(erro: unknown): void;
}

/** Quantas linhas finais da saída entram nos detalhes de um erro. */
const LINHAS_DE_DETALHE = 40;

export class OperacoesService {
  private atual: OperacaoIniciada | null = null;
  private pararAtual: (() => void) | null = null;
  private fimDaAtual: Promise<AppError | null> | null = null;

  constructor(private readonly dep: DependenciasOperacoes) {}

  get emAndamento(): OperacaoIniciada | null {
    return this.atual;
  }

  /** Espera a operação em andamento terminar (o erro, ou null se deu certo); sem operação, devolve null já. */
  aguardar(): Promise<AppError | null> {
    return this.fimDaAtual ?? Promise.resolve(null);
  }

  ligar(opcoes: { rebuild?: boolean } = {}): OperacaoIniciada {
    const rebuild = opcoes.rebuild === true;
    return this.iniciar(rebuild ? 'reconstruir' : 'ligar', (id) => this.trabalhoLigar(id, rebuild));
  }

  desligar(): OperacaoIniciada {
    return this.iniciar('desligar', (id) => this.trabalhoDesligar(id));
  }

  reiniciar(servico: ServicoId): OperacaoIniciada {
    return this.iniciar('reiniciar', (id) => this.trabalhoReiniciar(id, servico));
  }

  abrirDockerDesktop(): OperacaoIniciada {
    return this.iniciar('abrir-docker', (id) => this.trabalhoAbrirDocker(id));
  }

  /** Ao sair do app: interrompe o que estiver rodando (o `compose up` já disparado continua no Docker). */
  cancelar(): void {
    this.pararAtual?.();
  }

  private iniciar(tipo: OperacaoTipo, trabalho: (id: OperationId) => Promise<AppError | null>): OperacaoIniciada {
    if (this.atual) return this.atual; // clique duplo ou bandeja + tela: acompanha a que já roda
    const op: OperacaoIniciada = { id: this.dep.novoId(), tipo };
    this.atual = op;
    this.dep.emitir({ type: 'operation.start', id: op.id, tipo });
    this.fimDaAtual = (async () => {
      let erro: AppError | null = null;
      try {
        erro = await trabalho(op.id);
      } catch (e) {
        this.dep.aoErro?.(e);
        erro = erroInesperado(e);
      } finally {
        this.atual = null;
        this.pararAtual = null;
        this.dep.emitir(
          erro
            ? { type: 'operation.end', id: op.id, ok: false, error: erro }
            : { type: 'operation.end', id: op.id, ok: true },
        );
      }
      return erro;
    })();
    return op;
  }

  private log(id: OperationId, linha: string): void {
    this.dep.emitir({ type: 'operation.log', id, line: linha, marcador: detectarMarcador(linha) });
  }

  /** Erro de ambiente que impede qualquer operação com o compose, ou null se está tudo pronto. */
  private async precondicoes(): Promise<{ dir: string } | AppError> {
    let status = this.dep.health.atual;
    if (!status.docker.engine) status = await this.dep.health.atualizar();
    if (status.docker.instalacao === 'ausente') return criarErro('docker.ausente');
    if (status.docker.instalacao === 'fora-do-path') return criarErro('docker.fora-do-path');
    if (!status.docker.engine) return criarErro('docker.fechado');
    const dir = this.dep.projeto().dir;
    if (!dir) return criarErro('projeto.ausente');
    return { dir };
  }

  private async trabalhoLigar(id: OperationId, rebuild: boolean): Promise<AppError | null> {
    const pre = await this.precondicoes();
    if ('codigo' in pre) return pre;

    // validação (S4) antes do `compose up`, como o subir.bat
    this.log(id, 'Conferindo o .env e o slskd.yml…');
    const cfg = this.dep.validarConfig(pre.dir);
    for (const a of cfg.achados) this.log(id, `${a.nivel === 'erro' ? '[erro]' : '[aviso]'} ${a.mensagem}`);
    if (cfg.erros > 0) {
      const detalhes = cfg.achados
        .filter((a) => a.nivel === 'erro')
        .map((a) => `${a.id}: ${a.mensagem}`)
        .join('\n');
      return criarErro('config.invalida', { problemas: cfg.erros, detalhes });
    }
    this.log(id, 'Configuração conferida.');

    return this.rodarCompose(id, rebuild ? 'reconstruindo' : 'ligando', 'ligando', (aoLinha) =>
      this.dep.docker.ligar(pre.dir, { rebuild, aoLinha }),
    );
  }

  private async trabalhoDesligar(id: OperationId): Promise<AppError | null> {
    const pre = await this.precondicoes();
    if ('codigo' in pre) return pre;
    return this.rodarCompose(id, 'desligando', 'desligando', (aoLinha) => this.dep.docker.desligar(pre.dir, aoLinha));
  }

  private async trabalhoReiniciar(id: OperationId, servico: ServicoId): Promise<AppError | null> {
    const pre = await this.precondicoes();
    if ('codigo' in pre) return pre;
    return this.rodarCompose(id, null, 'reiniciando', (aoLinha) =>
      this.dep.docker.reiniciar(pre.dir, servico, aoLinha),
    );
  }

  private async rodarCompose(
    id: OperationId,
    estado: OperacaoStack | null,
    nome: OperacaoStack | 'reiniciando',
    iniciar: (aoLinha: (l: string) => void) => {
      terminou: Promise<{ codigo: number | null; erroSpawn: unknown }>;
      encerrar(): void;
    },
  ): Promise<AppError | null> {
    const ultimas: string[] = [];
    const aoLinha = (l: string) => {
      ultimas.push(l);
      if (ultimas.length > LINHAS_DE_DETALHE) ultimas.shift();
      this.log(id, l);
    };
    if (estado) this.dep.health.definirOperacao(estado);
    const proc = iniciar(aoLinha);
    this.pararAtual = () => proc.encerrar();
    try {
      const r = await proc.terminou;
      if (r.erroSpawn) return criarErro('docker.ausente');
      if (r.codigo === 0) return null;
      const texto = ultimas.join('\n');
      const f = classificarFalhaCompose(texto);
      const detalhes = redigirSegredos(texto);
      if (f.codigo === 'porta.em-uso') return criarErro('porta.em-uso', { porta: f.porta ?? '?', detalhes });
      if (f.codigo === 'docker.fechado') return criarErro('docker.fechado', { detalhes });
      return criarErro('operacao.falhou', { operacao: nome, detalhes });
    } finally {
      this.dep.health.definirOperacao(null);
      await this.dep.health.atualizar({ forcar: true }).catch((e: unknown) => this.dep.aoErro?.(e));
    }
  }

  private async trabalhoAbrirDocker(id: OperationId): Promise<AppError | null> {
    let status = this.dep.health.atual;
    if (!status.docker.engine) status = await this.dep.health.atualizar();
    if (status.docker.instalacao === 'ausente') return criarErro('docker.ausente');
    if (status.docker.instalacao === 'fora-do-path') return criarErro('docker.fora-do-path');
    if (status.docker.engine) return null;

    const inicio = this.dep.agora();
    const abort = new AbortController();
    this.pararAtual = () => abort.abort();
    this.dep.health.definirAbrindoDocker(inicio);
    this.log(id, 'Abrindo o Docker Desktop…');
    try {
      const r = await this.dep.docker.abrirDockerDesktop({
        signal: abort.signal,
        aoProgresso: (s) => {
          if (s > 0 && s % 10 === 0) this.log(id, `Esperando a engine ficar pronta… ${s} s`);
        },
      });
      if (r === 'pronto') {
        this.log(id, 'Engine pronta.');
        return null;
      }
      if (r === 'ausente') return criarErro('docker.ausente');
      if (r === 'timeout') return criarErro('docker.timeout');
      return null; // cancelado
    } finally {
      this.dep.health.definirAbrindoDocker(null);
      this.dep.health.invalidarDeteccao();
      await this.dep.health.atualizar({ forcar: true }).catch((e: unknown) => this.dep.aoErro?.(e));
    }
  }
}
