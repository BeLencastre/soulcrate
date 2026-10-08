// WebUiService: o Soulbeet, o slskd e o Navidrome dentro do app, cada um numa WebContentsView (§5, Fase 1).
// Partição de sessão própria por serviço (login persiste e um serviço não enxerga os cookies do outro; SP7),
// sem preload, sandbox ligado e navegação presa à porta do próprio serviço (§6.1).
import { shell, WebContentsView, type BrowserWindow } from 'electron';
import type { Limites, MainEvent, WebUiCarga, WebUiEstado } from '@shared/ipc';
import { urlDoServico, type ServicoId } from '@shared/servicos';
import { mesmaOrigemDoServico, particaoDo, podeAbrirNoNavegador } from '../seguranca';

/** Chrome devolve -3 (ERR_ABORTED) quando uma navegação é substituída por outra: não é falha. */
const ERR_ABORTED = -3;

interface Entrada {
  view: WebContentsView;
  carga: WebUiCarga;
  erro: string | null;
}

export interface DependenciasWebUi {
  janela(): BrowserWindow | null;
  emitir(evento: MainEvent): void;
}

export class WebUiService {
  private readonly entradas = new Map<ServicoId, Entrada>();
  private visivel: ServicoId | null = null;

  constructor(private readonly dep: DependenciasWebUi) {}

  mostrar(servico: ServicoId, limites: Limites): void {
    const win = this.dep.janela();
    if (!win || win.isDestroyed()) return;
    const e = this.obter(servico);

    if (this.visivel && this.visivel !== servico) this.esconderView(this.visivel);
    if (!win.contentView.children.includes(e.view)) win.contentView.addChildView(e.view);
    this.visivel = servico;
    this.definirLimites(limites);

    const url = e.view.webContents.getURL();
    if (!url || e.carga === 'erro') void this.carregar(servico);
    else this.emitirEstado(servico);
  }

  definirLimites(limites: Limites): void {
    if (!this.visivel) return;
    const e = this.entradas.get(this.visivel);
    if (!e) return;
    // o renderer mede em pixels CSS; com zoom (menu Exibir) a posição real da janela é pixels CSS x fator de zoom
    const z = this.dep.janela()?.webContents.getZoomFactor() ?? 1;
    const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v * z)) : 0);
    e.view.setBounds({ x: n(limites.x), y: n(limites.y), width: n(limites.width), height: n(limites.height) });
  }

  /** Tira a view da tela (ela continua carregada, com a sessão e a página, para a próxima vez). */
  ocultar(): void {
    if (this.visivel) this.esconderView(this.visivel);
    this.visivel = null;
  }

  voltar(): void {
    const wc = this.visivel ? this.entradas.get(this.visivel)?.view.webContents : undefined;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  recarregar(): void {
    if (this.visivel) void this.carregar(this.visivel);
  }

  abrirNoNavegador(servico: ServicoId): void {
    void shell.openExternal(urlDoServico(servico));
  }

  encerrar(): void {
    for (const e of this.entradas.values()) {
      if (e.view.webContents.isDestroyed()) continue;
      // grava o login (cookies e storage) no disco antes de fechar: ele precisa sobreviver ao app (SP7)
      e.view.webContents.session.flushStorageData();
      void e.view.webContents.session.cookies.flushStore();
      e.view.webContents.close();
    }
    this.entradas.clear();
    this.visivel = null;
  }

  // -------------------------------------------------------------- internos

  private esconderView(servico: ServicoId): void {
    const win = this.dep.janela();
    const e = this.entradas.get(servico);
    if (win && !win.isDestroyed() && e && win.contentView.children.includes(e.view))
      win.contentView.removeChildView(e.view);
  }

  private async carregar(servico: ServicoId): Promise<void> {
    const e = this.obter(servico);
    e.carga = 'carregando';
    e.erro = null;
    this.emitirEstado(servico);
    try {
      await e.view.webContents.loadURL(urlDoServico(servico));
    } catch {
      // did-fail-load já registrou o erro e avisou o renderer
    }
  }

  private obter(servico: ServicoId): Entrada {
    const existente = this.entradas.get(servico);
    if (existente) return existente;

    const view = new WebContentsView({
      webPreferences: {
        partition: particaoDo(servico),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    });
    view.setBackgroundColor('#121417');
    const entrada: Entrada = { view, carga: 'carregando', erro: null };
    this.entradas.set(servico, entrada);

    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (mesmaOrigemDoServico(servico, url)) void wc.loadURL(url);
      else if (podeAbrirNoNavegador(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (evento, url) => {
      if (mesmaOrigemDoServico(servico, url)) return;
      evento.preventDefault();
      if (podeAbrirNoNavegador(url)) void shell.openExternal(url);
    });
    wc.on('will-attach-webview', (evento) => evento.preventDefault());
    wc.session.setPermissionRequestHandler((_c, permissao, resposta) =>
      resposta(permissao === 'clipboard-sanitized-write'),
    );
    wc.session.setPermissionCheckHandler(() => false);

    wc.on('did-start-loading', () => {
      entrada.carga = 'carregando';
      this.emitirEstado(servico);
    });
    wc.on('did-finish-load', () => {
      entrada.carga = 'pronto';
      entrada.erro = null;
      this.emitirEstado(servico);
    });
    wc.on('did-fail-load', (_e, codigo, descricao, _url, ehFramePrincipal) => {
      if (!ehFramePrincipal || codigo === ERR_ABORTED) return;
      entrada.carga = 'erro';
      entrada.erro = `${descricao} (${codigo})`;
      this.emitirEstado(servico);
    });
    wc.on('did-navigate', () => this.emitirEstado(servico));
    wc.on('did-navigate-in-page', () => this.emitirEstado(servico));
    return entrada;
  }

  private emitirEstado(servico: ServicoId): void {
    const e = this.entradas.get(servico);
    if (!e || e.view.webContents.isDestroyed()) return;
    const estado: WebUiEstado = {
      servico,
      carga: e.carga,
      url: e.view.webContents.getURL() || urlDoServico(servico),
      podeVoltar: e.view.webContents.navigationHistory.canGoBack(),
      erro: e.erro,
    };
    this.dep.emitir({ type: 'webui.state', estado });
  }
}
