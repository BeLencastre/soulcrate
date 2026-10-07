// Processo principal do app Soulcrate (Electron): liga os serviços (§3.2), a janela, a bandeja e o IPC.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { app, Menu, powerMonitor, shell, type BrowserWindow } from 'electron';
import { CANAL_EVENTOS, type MainEvent } from '@shared/ipc';
import { Bandeja } from './bandeja';
import { ExecutorComDockerFalso, VAR_DOCKER_DUBLE, VAR_HTTP_DUBLE } from './duble-docker';
import { registrarIpc } from './ipc';
import { criarJanelaPrincipal } from './janela';
import { iniciarLog, pastaDeLogs } from './log';
import { criarMenu } from './menu';
import { ExecutorReal } from './processos';
import { AppSettingsService } from './services/app-settings';
import { ChecksService } from './services/checks-service';
import { validarConfiguracao } from './services/config-validacao';
import { DockerService } from './services/docker-service';
import { HealthService, INTERVALO_OCULTO_MS, INTERVALO_VISIVEL_MS } from './services/health-service';
import { LogsService } from './services/logs-service';
import { OperacoesService } from './services/operacoes-service';
import { lerVersaoDaStack, resolverProjeto } from './services/project-service';
import { WebUiService } from './services/webui-service';

/** `--smoke-test`: abre a janela, confere o preload e o IPC e sai (usado pelo CI para testar o instalador). */
const SMOKE = process.argv.includes('--smoke-test');
const TIMEOUT_SMOKE_MS = 60_000;

// A pasta de dados é a mesma em desenvolvimento e instalado (%APPDATA%\Soulcrate).
app.setName('Soulcrate');
if (SMOKE) app.setPath('userData', join(tmpdir(), `soulcrate-smoke-${process.pid}`));
else if (!app.isPackaged && process.env.SOULCRATE_USER_DATA) app.setPath('userData', process.env.SOULCRATE_USER_DATA);
else app.setPath('userData', join(app.getPath('appData'), 'Soulcrate'));

const log = iniciarLog();
const urlDev = !app.isPackaged ? (process.env.ELECTRON_RENDERER_URL ?? null) : null;
const pastaRecursos = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');

const existeArquivo = (p: string): boolean => {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
};

function lerArquivo(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function ultimasLinhas(arquivo: string, n: number): string[] | null {
  const texto = lerArquivo(arquivo);
  if (texto === null) return null;
  return texto.split(/\r?\n/).filter(Boolean).slice(-n);
}

async function sondarHttp(url: string, timeoutMs: number): Promise<boolean> {
  if (!app.isPackaged && process.env[VAR_HTTP_DUBLE] === '1') return true;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    void r.body?.cancel();
    return r.status < 500;
  } catch {
    return false;
  }
}

async function principal(): Promise<void> {
  if (!SMOKE && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  log.info(`Soulcrate ${app.getVersion()} (Electron ${process.versions.electron}) iniciando${SMOKE ? ' [smoke]' : ''}`);

  // ---------------------------------------------------------------- serviços
  const settings = new AppSettingsService(join(app.getPath('userData'), 'settings.json'));
  const executorReal = new ExecutorReal();
  const dublePath = !app.isPackaged ? process.env[VAR_DOCKER_DUBLE] : undefined;
  const executor = dublePath ? new ExecutorComDockerFalso(executorReal, dublePath) : executorReal;

  const docker = new DockerService({
    executor,
    existe: existsSync,
    abrirExecutavel: (p) => shell.openPath(p),
    programFiles: process.env.ProgramFiles ?? 'C:\\Program Files',
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    agora: Date.now,
  });

  const projeto = () =>
    resolverProjeto(
      {
        configurada: settings.get().pastaDoProjeto,
        ambiente: process.env.SOULCRATE_DIR ?? null,
        // em desenvolvimento, a pasta-mãe de app/ é o repositório (os testes e2e desligam isto: SOULCRATE_SEM_DEV)
        desenvolvimento:
          app.isPackaged || process.env.SOULCRATE_SEM_DEV === '1' ? null : resolve(app.getAppPath(), '..'),
        padrao: join(homedir(), 'Soulcrate'),
      },
      existeArquivo,
    );
  const validarConfig = (dir: string) => validarConfiguracao(dir);

  let janela: BrowserWindow | null = null;
  let bandeja: Bandeja | null = null;
  let saindo = false;
  let avisoPendente = false;

  const emitir = (evento: MainEvent): void => {
    if (janela && !janela.isDestroyed() && !janela.webContents.isDestroyed())
      janela.webContents.send(CANAL_EVENTOS, evento);
  };
  const aoErro = (e: unknown) => log.error('Erro inesperado:', e);

  const health = new HealthService({ docker, projeto, validarConfig, sondar: sondarHttp, agora: Date.now, aoErro });
  const operacoes = new OperacoesService({
    docker,
    health,
    projeto,
    validarConfig,
    emitir,
    novoId: randomUUID,
    agora: Date.now,
    aoErro,
  });
  const checks = new ChecksService({ docker, status: () => health.atual, ultimasLinhas, agora: Date.now });
  const logs = new LogsService({ docker, projetoDir: () => projeto().dir, emitir, novoId: randomUUID });
  const webui = new WebUiService({ janela: () => janela, emitir });

  health.aoMudar((status) => {
    emitir({ type: 'stack.status', status });
    bandeja?.atualizar(status);
  });

  // ---------------------------------------------------------------- janela
  const mostrarJanela = (): void => {
    if (!janela || janela.isDestroyed()) return;
    if (janela.isMinimized()) janela.restore();
    janela.show();
    janela.focus();
  };
  const abrirPastaDeLogs = async (): Promise<void> => {
    const erro = await shell.openPath(pastaDeLogs());
    if (erro) log.warn('Não consegui abrir a pasta de logs:', erro);
  };
  const sair = (): void => {
    saindo = true;
    app.quit();
  };
  const esconderJanela = (): void => {
    janela?.hide();
    health.definirIntervalo(INTERVALO_OCULTO_MS);
  };

  registrarIpc({
    janela: () => janela,
    urlDev,
    settings,
    health,
    operacoes,
    checks,
    logs,
    webui,
    projeto,
    validarConfig,
    existeArquivo,
    versaoDaStack: () => lerVersaoDaStack(projeto().dir, lerArquivo),
    versaoDoApp: app.getVersion(),
    emitir,
    mostrarJanela,
    abrirPastaDeLogs,
    responderFechamento: (naoMostrarDeNovo) => {
      avisoPendente = false;
      if (naoMostrarDeNovo) settings.set({ avisoBandejaDispensado: true });
      esconderJanela();
    },
  });

  janela = criarJanelaPrincipal({
    preload: join(import.meta.dirname, '../preload/index.cjs'),
    icone: join(pastaRecursos, 'icon.png'),
    urlDev,
    indexHtml: join(import.meta.dirname, '../renderer/index.html'),
    devTools: !app.isPackaged,
  });
  const win = janela;
  const idDoContents = win.webContents.id;
  log.info(`Pasta do Soulcrate: ${projeto().dir ?? '(não definida)'}`);

  // fechar a janela minimiza para a bandeja (D7); a primeira vez mostra o aviso
  win.on('close', (e) => {
    if (saindo || SMOKE) return;
    if (!settings.get().minimizarParaBandeja) {
      e.preventDefault();
      sair();
      return;
    }
    e.preventDefault();
    if (!settings.get().avisoBandejaDispensado && !avisoPendente) {
      avisoPendente = true;
      emitir({ type: 'app.closePrompt' });
      return;
    }
    avisoPendente = false;
    esconderJanela();
  });
  const aoVisivel = () => {
    health.definirIntervalo(INTERVALO_VISIVEL_MS);
    void health.atualizar();
  };
  win.on('show', aoVisivel);
  win.on('restore', aoVisivel);
  win.on('minimize', () => health.definirIntervalo(INTERVALO_OCULTO_MS));
  win.on('closed', () => {
    logs.cancelarDoDono(idDoContents);
    janela = null;
  });

  app.on('second-instance', mostrarJanela);
  powerMonitor.on('resume', () => {
    health.invalidarDeteccao();
    void health.atualizar({ forcar: true });
  });

  const menu = criarMenu({ abrirPastaDeLogs: () => void abrirPastaDeLogs(), sair, devTools: !app.isPackaged });
  Menu.setApplicationMenu(menu);

  bandeja = new Bandeja(
    join(pastaRecursos, 'tray'),
    {
      abrir: mostrarJanela,
      ligar: () => void operacoes.ligar(),
      desligar: () => void operacoes.desligar(),
      abrirServico: (id) => {
        mostrarJanela();
        emitir({ type: 'app.navigate', rota: `/servicos/web/${id}` });
      },
      sair,
    },
    health.atual,
  );

  health.iniciar();

  app.on('before-quit', () => {
    saindo = true;
  });
  app.on('will-quit', () => {
    health.parar();
    operacoes.cancelar();
    logs.cancelarTodas();
    webui.encerrar();
    executorReal.encerrarTodos();
    bandeja?.destruir();
    log.info('Soulcrate encerrado');
  });
  // a janela some na bandeja: o app só sai por "Sair"
  app.on('window-all-closed', () => undefined);

  if (SMOKE) executarSmoke(win);
}

/** Confere que a página carregou e que o preload responde ao IPC; sai com 0 (ok) ou 1 (falha). */
function executarSmoke(win: BrowserWindow): void {
  const falhar = (motivo: string) => {
    log.error(`smoke: ${motivo}`);
    console.error(`SOULCRATE_SMOKE_FALHOU: ${motivo}`);
    app.exit(1);
  };
  const timer = setTimeout(() => falhar('tempo esgotado esperando a janela'), TIMEOUT_SMOKE_MS);
  win.webContents.once('did-fail-load', (_e, codigo, descricao) =>
    falhar(`falha ao carregar a página (${codigo} ${descricao})`),
  );
  win.webContents.once('did-finish-load', () => {
    void win.webContents
      .executeJavaScript('window.soulcrate.app.getInfo()')
      .then((info: { appVersion: string }) => {
        clearTimeout(timer);
        console.log(`SOULCRATE_SMOKE_OK ${info.appVersion}`);
        app.exit(0);
      })
      .catch((e: unknown) => falhar(`window.soulcrate.app.getInfo falhou: ${String(e)}`));
  });
}

principal().catch((e: unknown) => {
  log.error('Falha ao iniciar:', e);
  app.exit(1);
});

process.on('unhandledRejection', (e) => log.error('Promessa rejeitada sem tratamento:', e));
process.on('uncaughtException', (e) => log.error('Exceção sem tratamento:', e));
