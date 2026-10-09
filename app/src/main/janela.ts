// Janela principal com a segurança de base do §6.1: contextIsolation, sandbox, sem nodeIntegration,
// navegação e window.open bloqueados, nenhuma permissão concedida.
import { BrowserWindow, session, shell, type WebContents } from 'electron';
import { podeAbrirNoNavegador, ehUrlDoApp } from './seguranca';

export interface OpcoesJanela {
  preload: string;
  icone: string;
  /** URL do servidor do Vite em desenvolvimento; null no app empacotado */
  urlDev: string | null;
  /** arquivo do build do renderer */
  indexHtml: string;
  /** pode abrir as ferramentas de desenvolvedor */
  devTools: boolean;
  /** cor da janela antes de a página pintar (escura ou clara, conforme o tema) */
  corDeFundo: string;
  /** false quando o Windows abriu o app com o PC: a janela só aparece quando o usuário a chamar pela bandeja */
  mostrarAoPronto: boolean;
}

/** Bloqueia o que não é do app: navegação, `window.open` e `<webview>`; links externos seguros vão para o navegador. */
export function protegerNavegacao(contents: WebContents, urlDev: string | null): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (podeAbrirNoNavegador(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (evento, url) => {
    if (ehUrlDoApp(url, urlDev)) return;
    evento.preventDefault();
    if (podeAbrirNoNavegador(url)) void shell.openExternal(url);
  });
  contents.on('will-attach-webview', (evento) => evento.preventDefault());
}

/** Nenhuma permissão (câmera, notificações, geolocalização...) é concedida às páginas do app. */
export function negarPermissoes(sessao: Electron.Session): void {
  sessao.setPermissionRequestHandler((_contents, _permissao, resposta) => resposta(false));
  sessao.setPermissionCheckHandler(() => false);
}

export function criarJanelaPrincipal(o: OpcoesJanela): BrowserWindow {
  negarPermissoes(session.defaultSession);

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Soulcrate',
    backgroundColor: o.corDeFundo,
    icon: o.icone,
    autoHideMenuBar: true,
    webPreferences: {
      preload: o.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: o.devTools,
    },
  });

  protegerNavegacao(win.webContents, o.urlDev);
  if (o.mostrarAoPronto) win.once('ready-to-show', () => win.show());

  if (o.urlDev) void win.loadURL(o.urlDev);
  else void win.loadFile(o.indexHtml);
  return win;
}
