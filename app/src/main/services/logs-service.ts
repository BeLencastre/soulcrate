// LogsService: `docker compose logs -f --tail 200` de um contêiner (ou de todos) em tempo real para o renderer.
// Cada assinatura é um processo; todos são encerrados quando o renderer cancela, a janela fecha ou o app sai (§6.2).
import type { AlvoLog, LinhaLog, MainEvent, SubscriptionId } from '@shared/ipc';
import { parseLinhaLog } from '../docker-parsers';
import type { ProcessoVivo } from '../processos';
import type { DockerService } from './docker-service';

/** As linhas chegam em lotes, para não inundar o IPC quando um contêiner despeja muito log. */
const INTERVALO_LOTE_MS = 100;
const MAX_LINHAS_POR_LOTE = 500;

interface Assinatura {
  id: SubscriptionId;
  dono: number;
  processo: ProcessoVivo | null;
  pendentes: LinhaLog[];
  timer: NodeJS.Timeout | null;
}

export interface DependenciasLogs {
  docker: DockerService;
  projetoDir(): string | null;
  emitir(evento: MainEvent): void;
  novoId(): SubscriptionId;
}

export class LogsService {
  private readonly assinaturas = new Map<SubscriptionId, Assinatura>();

  constructor(private readonly dep: DependenciasLogs) {}

  /** `dono` é o id do webContents que pediu, para limpar tudo se ele for destruído. */
  assinar(dono: number, alvo: AlvoLog): SubscriptionId {
    const id = this.dep.novoId();
    const a: Assinatura = { id, dono, processo: null, pendentes: [], timer: null };
    this.assinaturas.set(id, a);

    const dir = this.dep.projetoDir();
    if (!dir) {
      queueMicrotask(() => {
        this.dep.emitir({ type: 'logs.end', id, motivo: 'sem-projeto' });
        this.assinaturas.delete(id);
      });
      return id;
    }

    a.processo = this.dep.docker.logs(dir, alvo, (linha) => {
      if (!linha.trim()) return;
      a.pendentes.push(parseLinhaLog(linha));
      if (a.pendentes.length >= MAX_LINHAS_POR_LOTE) this.descarregar(a);
      else a.timer ??= setTimeout(() => this.descarregar(a), INTERVALO_LOTE_MS);
    });
    void a.processo.terminou.then((r) => {
      this.descarregar(a);
      if (this.assinaturas.delete(id)) {
        this.dep.emitir({ type: 'logs.end', id, motivo: r.erroSpawn ? 'docker-ausente' : null });
      }
    });
    return id;
  }

  cancelar(id: SubscriptionId): void {
    const a = this.assinaturas.get(id);
    if (!a) return;
    this.assinaturas.delete(id);
    if (a.timer) clearTimeout(a.timer);
    a.processo?.encerrar();
  }

  cancelarDoDono(dono: number): void {
    for (const a of [...this.assinaturas.values()]) if (a.dono === dono) this.cancelar(a.id);
  }

  cancelarTodas(): void {
    for (const id of [...this.assinaturas.keys()]) this.cancelar(id);
  }

  get quantidade(): number {
    return this.assinaturas.size;
  }

  private descarregar(a: Assinatura): void {
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    if (a.pendentes.length === 0 || !this.assinaturas.has(a.id)) return;
    const linhas = a.pendentes;
    a.pendentes = [];
    this.dep.emitir({ type: 'logs.lines', id: a.id, linhas });
  }
}
