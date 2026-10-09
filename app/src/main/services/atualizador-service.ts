// AtualizadorService (§5, Fase 7): a atualização do app pelo `electron-updater`, com os GitHub Releases como fonte.
//   - procura na abertura (alguns segundos depois) e a cada 24 h, em silêncio; o download também é em segundo plano;
//   - a atualização é aplicada ao REINICIAR o app, e nunca durante um lote: o botão "Reiniciar e atualizar" recusa
//     enquanto um lote roda, e ao sair do app o instalador só entra se nenhum lote está rodando;
//   - sem telemetria (§6.1): a única conversa do app com a internet é esta checagem.
// O `electron-updater` entra por `AutoUpdaterLike`, então tudo aqui é testado sem rede e sem Electron.
import { criarErro, type AppError } from '@shared/erros';
import {
  ATRASO_PRIMEIRA_CHECAGEM_MS,
  INTERVALO_CHECAGEM_MS,
  type EstadoAtualizacao,
  type MotivoIndisponivel,
  type ResultadoReiniciar,
} from '@shared/atualizacao';
import { redigirSegredos } from '../seguranca';

/** O pedaço do `autoUpdater` do electron-updater que o app usa. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  /** só se a pessoa aceitou pré-lançamentos */
  allowPrerelease: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(evento: 'checking-for-update' | 'update-not-available', ouvinte: () => void): unknown;
  on(evento: 'update-available' | 'update-downloaded', ouvinte: (info: { version: string }) => void): unknown;
  on(evento: 'download-progress', ouvinte: (p: { percent: number }) => void): unknown;
  on(evento: 'error', ouvinte: (e: Error) => void): unknown;
}

export interface DependenciasAtualizador {
  /** null quando não há como atualizar neste app (desenvolvimento, sem instalador) */
  updater: AutoUpdaterLike | null;
  motivoIndisponivel: MotivoIndisponivel | null;
  /** há um lote do app rodando agora? (síncrono: o `before-quit` não espera promessas) */
  loteRodando(): boolean;
  /** avisa a tela (evento `update.state`) */
  aoMudar(estado: EstadoAtualizacao): void;
  agora(): number;
  aoErro(e: unknown): void;
  /** agenda `fn` daqui a `ms`; devolve o cancelamento. Injetável para os testes. */
  agendar?(fn: () => void, ms: number): () => void;
  /** repete `fn` a cada `ms`; devolve o cancelamento */
  repetir?(fn: () => void, ms: number): () => void;
}

const agendarPadrao = (fn: () => void, ms: number): (() => void) => {
  const t = setTimeout(fn, ms);
  t.unref();
  return () => clearTimeout(t);
};
const repetirPadrao = (fn: () => void, ms: number): (() => void) => {
  const t = setInterval(fn, ms);
  t.unref();
  return () => clearInterval(t);
};

export class AtualizadorService {
  private estadoAtual: EstadoAtualizacao;
  private ultimaChecagemEm: number | null = null;
  private versaoBaixada: string | null = null;
  private cancelar: (() => void)[] = [];

  constructor(private readonly d: DependenciasAtualizador) {
    this.estadoAtual =
      d.updater === null
        ? { estado: 'indisponivel', motivo: d.motivoIndisponivel ?? 'desenvolvimento' }
        : { estado: 'ocioso', ultimaChecagemEm: null };
    if (d.updater) this.ligar(d.updater);
  }

  get estado(): EstadoAtualizacao {
    return this.estadoAtual;
  }

  private mudar(e: EstadoAtualizacao): void {
    this.estadoAtual = e;
    this.d.aoMudar(e);
  }

  private ligar(u: AutoUpdaterLike): void {
    // baixa sozinha; quem decide quando aplicar é o app (reiniciar, ou sair sem lote rodando)
    u.autoDownload = true;
    u.autoInstallOnAppQuit = true;
    u.allowPrerelease = false;
    u.on('checking-for-update', () => this.mudar({ estado: 'verificando' }));
    u.on('update-available', (info) => this.mudar({ estado: 'baixando', versao: info.version, percentual: 0 }));
    u.on('update-not-available', () => {
      this.ultimaChecagemEm = this.d.agora();
      this.mudar({ estado: 'atualizado', ultimaChecagemEm: this.ultimaChecagemEm });
    });
    u.on('download-progress', (p) => {
      if (this.estadoAtual.estado !== 'baixando') return;
      this.mudar({ ...this.estadoAtual, percentual: Math.max(0, Math.min(100, Math.round(p.percent))) });
    });
    u.on('update-downloaded', (info) => {
      this.ultimaChecagemEm = this.d.agora();
      this.versaoBaixada = info.version;
      this.mudar({ estado: 'pronta', versao: info.version });
    });
    u.on('error', (e) => this.falhou(e));
  }

  private falhou(e: unknown): void {
    this.d.aoErro(e);
    this.ultimaChecagemEm = this.d.agora();
    // uma atualização já baixada continua valendo, mesmo que a checagem seguinte tenha falhado
    if (this.versaoBaixada) {
      this.mudar({ estado: 'pronta', versao: this.versaoBaixada });
      return;
    }
    const detalhes = e instanceof Error ? (e.stack ?? e.message) : String(e);
    const erro: AppError = criarErro('atualizacao.falhou', { detalhes: redigirSegredos(detalhes) });
    this.mudar({ estado: 'erro', erro, ultimaChecagemEm: this.ultimaChecagemEm });
  }

  /** Liga a checagem da abertura e a de a cada 24 h. Sem efeito onde a atualização não existe. */
  iniciar(): void {
    if (!this.d.updater) return;
    const agendar = this.d.agendar ?? agendarPadrao;
    const repetir = this.d.repetir ?? repetirPadrao;
    this.cancelar.push(
      agendar(() => void this.verificar(), ATRASO_PRIMEIRA_CHECAGEM_MS),
      repetir(() => void this.verificar(), INTERVALO_CHECAGEM_MS),
    );
  }

  parar(): void {
    for (const c of this.cancelar.splice(0)) c();
  }

  /** Procura atualização agora (o botão "Procurar atualização" e as checagens automáticas). */
  async verificar(): Promise<EstadoAtualizacao> {
    const u = this.d.updater;
    if (!u) return this.estadoAtual;
    // já está procurando, baixando ou com uma pronta para aplicar: não há o que procurar
    if (['verificando', 'baixando', 'pronta'].includes(this.estadoAtual.estado)) return this.estadoAtual;
    this.mudar({ estado: 'verificando' });
    try {
      await u.checkForUpdates();
    } catch (e) {
      this.falhou(e);
    }
    return this.estadoAtual;
  }

  /** "Reiniciar e atualizar": só com uma atualização pronta, e nunca com um lote rodando. */
  reiniciarEAtualizar(): ResultadoReiniciar {
    const u = this.d.updater;
    if (!u || this.estadoAtual.estado !== 'pronta') {
      return {
        ok: false,
        erro: criarErro('atualizacao.falhou', { detalhes: 'Não há atualização pronta para aplicar.' }),
      };
    }
    if (this.d.loteRodando()) return { ok: false, erro: criarErro('atualizacao.lote-rodando') };
    // silencioso e já reabrindo o app: a pessoa só vê a janela fechar e abrir de novo
    u.quitAndInstall(true, true);
    return { ok: true };
  }

  /**
   * Chamado no `before-quit`: ao sair, o instalador só entra se nenhum lote está rodando. (Fechar o app não mata o
   * lote, mas trocar os arquivos do app por baixo de uma execução em andamento é o que a §5 manda evitar.)
   */
  aoSair(): void {
    if (this.d.updater) this.d.updater.autoInstallOnAppQuit = !this.d.loteRodando();
  }
}
