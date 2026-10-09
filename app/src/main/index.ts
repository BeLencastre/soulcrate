// Processo principal do app Soulcrate (Electron): liga os serviços (§3.2), a janela, a bandeja e o IPC.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, homedir, release, tmpdir, type as tipoDoSistema } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { app, dialog, Menu, nativeTheme, Notification, powerMonitor, shell, type BrowserWindow } from 'electron';
import type { EstadoAtualizacao, MotivoIndisponivel } from '@shared/atualizacao';
import { CANAL_EVENTOS, type MainEvent, type OndeAbrirServico } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import { listaDoArgv } from './argv';
import { Bandeja } from './bandeja';
import { ExecutorComDockerFalso, VAR_DOCKER_DUBLE, VAR_HTTP_DUBLE } from './duble-docker';
import { registrarIpc } from './ipc';
import { criarJanelaPrincipal } from './janela';
import { iniciarLog, pastaDeLogs } from './log';
import { criarMenu } from './menu';
import {
  aplicarPreferencias,
  ARGUMENTO_ESCONDIDO,
  fundoDaJanela,
  iniciarEscondido,
  type DepsPreferencias,
} from './preferencias';
import { ExecutorReal, LancadorReal } from './processos';
import { AppSettingsService } from './services/app-settings';
import { criarUpdaterDuble } from './duble-atualizador';
import { AtualizadorService, type AutoUpdaterLike, type DependenciasAtualizador } from './services/atualizador-service';
import { BibliotecaService } from './services/biblioteca-service';
import { ChecksService } from './services/checks-service';
import { ConfigService } from './services/config-service';
import { validarConfiguracao } from './services/config-validacao';
import { DockerService } from './services/docker-service';
import { escanearDownloads } from './services/downloads-parados';
import { HealthService, INTERVALO_OCULTO_MS, INTERVALO_VISIVEL_MS } from './services/health-service';
import { ListasService } from './services/listas-service';
import { LogsService } from './services/logs-service';
import { MigracaoService } from './services/migracao-service';
import { LoteService, processoVivoReal, type NotificacaoLote } from './services/lote-service';
import { OperacoesService } from './services/operacoes-service';
import { PastaService } from './services/pasta-service';
import { RelatoriosService } from './services/relatorios-service';
import { lerVersaoDaStack, resolverProjeto } from './services/project-service';
import { portaAceitaConexao, SetupService } from './services/setup-service';
import { SlskdService } from './services/slskd-service';
import { SobreService } from './services/sobre-service';
import { StackAtualizacaoService } from './services/stack-atualizacao-service';
import { SuporteService } from './services/suporte-service';
import { WebUiService } from './services/webui-service';
import { servicoDe, servicoSaudavel } from '@shared/stack';
import { urlDoServico, type ServicoId } from '@shared/servicos';

/** `--smoke-test`: abre a janela, confere o preload e o IPC e sai (usado pelo CI para testar o instalador). */
const SMOKE = process.argv.includes('--smoke-test');
const TIMEOUT_SMOKE_MS = 60_000;

// A pasta de dados é a mesma em desenvolvimento e instalado (%APPDATA%\Soulcrate).
app.setName('Soulcrate');
// as notificações do Windows precisam do mesmo id do instalador (electron-builder.yml: appId)
app.setAppUserModelId('br.com.soulcrate.app');
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

/**
 * Onde o app fala com o Navidrome e o Soulbeet na pós-configuração. Fora do app empacotado, os testes ponta a ponta
 * apontam para servidores falsos com SOULCRATE_SETUP_URLS='{"navidrome":"http://127.0.0.1:1","soulbeet":"…"}'.
 */
function urlsDoSetup(): { navidrome: string; soulbeet: string } {
  const padrao = { navidrome: urlDoServico('navidrome'), soulbeet: urlDoServico('soulbeet') };
  const bruto = !app.isPackaged ? process.env.SOULCRATE_SETUP_URLS : undefined;
  if (!bruto) return padrao;
  try {
    const o = JSON.parse(bruto) as Partial<typeof padrao>;
    return { navidrome: o.navidrome ?? padrao.navidrome, soulbeet: o.soulbeet ?? padrao.soulbeet };
  } catch {
    return padrao;
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
  // tema e "iniciar com o Windows" (Fase 6). O tema vale antes de a janela existir: a janela nasce da cor certa.
  // Nos testes ponta a ponta, o registro do Windows vira uma variável que o teste lê (nada é registrado de verdade).
  const inicioDuble = !app.isPackaged && process.env.SOULCRATE_DUBLE_INICIO_WINDOWS === '1';
  const depsPreferencias: DepsPreferencias = {
    definirTema: (fonte) => {
      nativeTheme.themeSource = fonte;
    },
    definirInicioComWindows: (ligado) => {
      if (SMOKE) return;
      if (inicioDuble) {
        (globalThis as unknown as { __inicioComWindows?: boolean }).__inicioComWindows = ligado;
        return;
      }
      // fora do app instalado, registraria o electron.exe solto da pasta do projeto no Windows de quem desenvolve
      if (!app.isPackaged) return;
      app.setLoginItemSettings({ openAtLogin: ligado, args: [ARGUMENTO_ESCONDIDO] });
    },
  };
  aplicarPreferencias(settings.get(), null, depsPreferencias);
  const abertoComOWindows =
    !SMOKE && iniciarEscondido(process.argv, app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin);
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

  let aoFimDeLote: (() => void) | null = null;
  const emitir = (evento: MainEvent): void => {
    if (janela && !janela.isDestroyed() && !janela.webContents.isDestroyed())
      janela.webContents.send(CANAL_EVENTOS, evento);
    // o lote terminou: a atualização dos arquivos da stack que esperava por ele pode entrar agora
    if (evento.type === 'batch.events' && evento.eventos.some((ev) => ev.type === 'run.end')) aoFimDeLote?.();
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

  // assistente de configuração (Fase 2)
  const config = new ConfigService();
  // os arquivos da stack que acompanham o app: no instalado, a pasta resources/stack; em desenvolvimento, o repositório
  const origemStack = app.isPackaged ? join(process.resourcesPath, 'stack') : resolve(app.getAppPath(), '..');
  const pasta = new PastaService({ config, origemStack });
  const pastaPadrao = PastaService.pastaPadrao(homedir());
  const setup = new SetupService({
    operacoes,
    health,
    projeto,
    lerArquivo,
    urls: urlsDoSetup(),
    portaAceitaConexao: (porta) => portaAceitaConexao(porta),
    emitir,
    agora: Date.now,
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    aoErro,
  });

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
  /** "Abrir" uma Web UI: no app, no navegador, ou onde a preferência do usuário mandar (Configurações → Aplicativo) */
  const abrirServico = (id: ServicoId, onde: OndeAbrirServico): void => {
    const noNavegador = onde === 'browser' || (onde === 'preferencia' && settings.get().abrirWebUi === 'navegador');
    if (noNavegador) {
      webui.abrirNoNavegador(id);
      return;
    }
    mostrarJanela();
    emitir({ type: 'app.navigate', rota: `/servicos/web/${id}` });
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

  // download em lote (Fase 3)
  const listas = new ListasService({ executor, agora: Date.now });
  // nos testes ponta a ponta, as notificações viram uma lista que o teste confere (nada aparece na tela de quem testa)
  const notificacoesDuble = !app.isPackaged && process.env.SOULCRATE_DUBLE_NOTIFICACOES === '1';
  const notificar = (n: NotificacaoLote): void => {
    const quer = n.tipo === 'pausa' ? settings.get().avisarBuscasPausadas : settings.get().avisarFimDoLote;
    if (!quer) return;
    if (notificacoesDuble) {
      const g = globalThis as unknown as { __notificacoes?: NotificacaoLote[] };
      (g.__notificacoes ??= []).push(n);
      return;
    }
    if (!Notification.isSupported()) return;
    const nota = new Notification({ title: n.titulo, body: n.corpo });
    nota.on('click', () => {
      mostrarJanela();
      emitir({ type: 'app.navigate', rota: '/lista/execucao' });
    });
    nota.show();
  };
  const lote = new LoteService({
    lancador: new LancadorReal(),
    projeto,
    // sem sondagem ainda (atualizadoEm 0) não dá para dizer que está fora: o próprio script confere (código 3)
    slskdNoAr: () => health.atual.atualizadoEm === 0 || servicoSaudavel(servicoDe(health.atual, 'slskd')),
    emitir,
    notificar,
    agora: Date.now,
    processoVivo: processoVivoReal,
    aoErro,
    slskdUrl: !app.isPackaged ? (process.env.SOULCRATE_SLSKD_URL ?? null) : null,
  });
  /** `music/` e `downloads/` no disco do PC, como o `.env` as define (relativas valem a partir da pasta do Soulcrate) */
  const pastasDoDisco = (dir: string): { musica: string; downloads: string } => {
    let pastas = { music: '', downloads: '' };
    try {
      const lida = config.ler(dir).pastas;
      pastas = { music: lida.music, downloads: lida.downloads };
    } catch {
      /* sem .env legível: vale o padrão do modelo (./music, ./downloads) */
    }
    return {
      musica: resolve(dir, pastas.music || './music'),
      downloads: resolve(dir, pastas.downloads || './downloads'),
    };
  };
  // histórico e diagnóstico (Fase 4): relatórios de lotes/. Apagar manda para a Lixeira; os testes ponta a ponta
  // trocam a Lixeira por apagar de vez (a Lixeira de quem testa não é lugar de arquivo temporário)
  const lixeiraDuble = !app.isPackaged && process.env.SOULCRATE_DUBLE_LIXEIRA === '1';
  const relatorios = new RelatoriosService({
    projeto,
    agora: Date.now,
    processoVivo: processoVivoReal,
    pastas: (dir) => {
      const p = pastasDoDisco(dir);
      return { musica: p.musica, downloads: p.downloads };
    },
    listas,
    descartar: (caminho) => (lixeiraDuble ? rm(caminho, { force: true }) : shell.trashItem(caminho)),
    aoErro,
  });
  // biblioteca e manutenção (Fase 5): o beets pelo contêiner do Soulbeet e o compartilhamento pela API do slskd
  const biblioteca = new BibliotecaService({
    docker,
    health,
    projeto,
    pastas: pastasDoDisco,
    loteRodando: async () => (await lote.ativas()).some((r) => !r.terminou),
    escanearDownloads,
    emitir,
    novoId: randomUUID,
    novoToken: randomUUID,
    agora: Date.now,
    aoErro,
  });
  const slskd = new SlskdService({
    projeto,
    lerArquivo,
    urlBase: () =>
      !app.isPackaged ? (process.env.SOULCRATE_SLSKD_URL ?? urlDoServico('slskd')) : urlDoServico('slskd'),
  });

  // ---------------------------------------------------------------- Sobre, suporte e atualizações (Fases 6 e 7)
  const sobre = new SobreService({
    docker,
    health,
    projeto,
    slskdVersao: () => slskd.versao(),
    versaoDaStack: () => lerVersaoDaStack(projeto().dir, lerArquivo),
    versaoDaStackDoApp: () => lerVersaoDaStack(origemStack, lerArquivo),
    app: {
      versao: app.getVersion(),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      plataforma: process.platform,
      arquitetura: process.arch,
      empacotado: app.isPackaged,
    },
    aoErro,
  });
  const suporte = new SuporteService({
    agora: () => new Date(),
    pastaDeLogs,
    projeto,
    status: () => health.atual,
    config: validarConfig,
    settings: () => settings.get(),
    lerArquivo,
    composePsTexto: (dir) => docker.composePsTexto(dir),
    sobre: () => sobre.info(),
    sistema: { release: release(), arquitetura: arch(), tipo: tipoDoSistema() },
    aoErro,
  });
  const migracao = new MigracaoService({ executor, origemStack });
  const stackAtualizacao = new StackAtualizacaoService({
    origemStack: existeArquivo(join(origemStack, 'docker-compose.yml')) ? origemStack : null,
    projeto,
    loteRodando: () => Promise.resolve(lote.rodandoAgora),
    operacaoEmCurso: () => health.atual.operacao !== null,
    agora: Date.now,
    aoErro,
  });
  /** Atualiza os arquivos da stack da pasta (§3.3). Espera, sem mexer em nada, um lote ou uma operação terminar. */
  let novaTentativaDaStack: NodeJS.Timeout | null = null;
  const atualizarArquivosDaStack = async (): Promise<void> => {
    const r = await stackAtualizacao.aplicar();
    if (!r.ok) {
      log.error('Não consegui atualizar os arquivos da stack:', r.erro.detalhes);
      return;
    }
    // esperando um lote ou uma operação (ligar, desligar…): o fim do lote chama de novo, mas uma operação não avisa
    // ninguém; confere outra vez em um minuto, até não haver mais o que esperar
    if (r.esperando && !novaTentativaDaStack) {
      novaTentativaDaStack = setTimeout(() => {
        novaTentativaDaStack = null;
        void atualizarArquivosDaStack().catch(aoErro);
      }, 60_000);
      novaTentativaDaStack.unref();
    }
    if (r.resultado) {
      log.info(
        `Arquivos da stack atualizados (${r.resultado.versaoAnterior ?? '?'} → ${r.resultado.versaoNova ?? '?'}): ` +
          `${r.resultado.atualizados.length} trocados, ${r.resultado.copiados.length} copiados, ${r.resultado.mantidos.length} mantidos.`,
      );
      emitir({ type: 'stackFiles.changed' });
    }
  };
  /**
   * O `electron-updater` de verdade só existe no app instalado (o electron-builder grava o `app-update.yml` ao lado do
   * app). Em desenvolvimento não há o que atualizar; nos testes ponta a ponta entra um dublê (duble-atualizador.ts).
   */
  const criarDepsDoAtualizador = (): DependenciasAtualizador => {
    let updater: AutoUpdaterLike | null = null;
    let motivo: MotivoIndisponivel | null = 'desenvolvimento';
    if (!app.isPackaged && process.env.SOULCRATE_DUBLE_ATUALIZADOR === '1') {
      updater = criarUpdaterDuble();
      motivo = null;
    } else if (app.isPackaged && !SMOKE) {
      if (existsSync(join(process.resourcesPath, 'app-update.yml'))) {
        try {
          // CommonJS dentro de um main em ESM: `require` explícito, que dá a mesma instância em todo lugar
          const requerer = createRequire(import.meta.url);
          const real = (requerer('electron-updater') as { autoUpdater: AutoUpdaterLike & { logger: unknown } })
            .autoUpdater;
          real.logger = log;
          updater = real;
          motivo = null;
        } catch (e) {
          // a atualização é opcional: se o módulo não carrega, o app abre do mesmo jeito e a tela diz que não há atualização
          log.error('Não consegui carregar o electron-updater:', e);
          motivo = 'sem-instalador';
        }
      } else {
        motivo = 'sem-instalador';
      }
    }
    return {
      updater,
      motivoIndisponivel: motivo,
      loteRodando: () => lote.rodandoAgora,
      aoMudar: (estado: EstadoAtualizacao) => {
        if (estado.estado === 'pronta') log.info(`Atualização ${estado.versao} baixada: vale ao reiniciar o app.`);
        emitir({ type: 'update.state', estado });
      },
      agora: Date.now,
      aoErro: (e) => log.warn('Atualização do app:', e),
    };
  };
  const atualizador = new AtualizadorService(criarDepsDoAtualizador());
  aoFimDeLote = () => {
    // dá tempo de o serviço do lote marcar a execução como terminada antes de conferir
    setTimeout(() => void atualizarArquivosDaStack().catch(aoErro), 3_000).unref();
  };
  /** O pacote de suporte: onde salvar (nos testes, um caminho combinado por variável de ambiente) */
  const escolherDestinoDoPacote = async (nomeSugerido: string): Promise<string | null> => {
    const duble = !app.isPackaged ? process.env.SOULCRATE_DUBLE_DESTINO_SUPORTE : undefined;
    if (duble) return duble;
    const opcoes = {
      title: msg.suporte.salvarTitulo,
      defaultPath: join(app.getPath('desktop'), nomeSugerido),
      filters: [{ name: msg.suporte.filtroZip, extensions: ['zip'] }],
    };
    const r =
      janela && !janela.isDestroyed()
        ? await dialog.showSaveDialog(janela, opcoes)
        : await dialog.showSaveDialog(opcoes);
    return r.canceled || !r.filePath ? null : r.filePath;
  };

  /** "Abrir com" e a linha de comando: um .txt/.csv vira uma lista na pasta do Soulcrate e abre no editor (§6.2) */
  const abrirListaDoArgv = (argv: readonly string[]): void => {
    const dir = projeto().dir;
    const arquivo = listaDoArgv(argv, existeArquivo);
    if (!dir || !arquivo) return;
    try {
      emitir({ type: 'app.openList', nome: listas.importarArquivo(dir, arquivo).nome });
    } catch (e) {
      aoErro(e);
    }
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
    config,
    pasta,
    setup,
    listas,
    lote,
    relatorios,
    biblioteca,
    slskd,
    sobre,
    suporte,
    atualizador,
    stackAtualizacao,
    migracao,
    origemStack,
    pastaDoExecutavel: dirname(process.execPath),
    escolherDestinoDoPacote,
    pastaPadrao,
    projeto,
    validarConfig,
    existeArquivo,
    pastasDoDisco,
    versaoDaStack: () => lerVersaoDaStack(projeto().dir, lerArquivo),
    versaoDoApp: app.getVersion(),
    emitir,
    mostrarJanela,
    abrirServico,
    aplicarPreferencias: (depois, antes) => aplicarPreferencias(depois, antes, depsPreferencias),
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
    corDeFundo: fundoDaJanela(nativeTheme.shouldUseDarkColors),
    mostrarAoPronto: !abertoComOWindows,
  });
  const win = janela;
  // aberto com o PC: fica só na bandeja até o usuário chamar (a sondagem já corre no ritmo da janela escondida)
  if (abertoComOWindows) health.definirIntervalo(INTERVALO_OCULTO_MS);
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

  app.on('second-instance', (_e, argv) => {
    mostrarJanela();
    abrirListaDoArgv(argv);
  });
  powerMonitor.on('resume', () => {
    health.invalidarDeteccao();
    void health.atualizar({ forcar: true });
  });

  const irParaSobre = (): void => {
    mostrarJanela();
    emitir({ type: 'app.navigate', rota: '/configuracoes?secao=sobre' });
  };
  const menu = criarMenu({
    abrirPastaDeLogs: () => void abrirPastaDeLogs(),
    abrirSobre: irParaSobre,
    sair,
    devTools: !app.isPackaged,
  });
  Menu.setApplicationMenu(menu);

  bandeja = new Bandeja(
    join(pastaRecursos, 'tray'),
    {
      abrir: mostrarJanela,
      ligar: () => void operacoes.ligar(),
      desligar: () => void operacoes.desligar(),
      abrirServico: (id) => abrirServico(id, 'preferencia'),
      sair,
    },
    health.atual,
  );

  health.iniciar();
  if (!SMOKE) {
    // um lote iniciado antes de o app fechar continua rodando: volta a acompanhá-lo (e a notificar quando terminar). Só
    // depois disso vale atualizar os arquivos da stack da pasta (§3.3): com um lote rodando a atualização espera
    void lote
      .reconectar()
      .then(() => atualizarArquivosDaStack())
      .catch(aoErro);
    // atualização do app (§5, Fase 7): alguns segundos depois de abrir e a cada 24 h. Com o dublê do atualizador, o
    // teste decide quando "a internet" é consultada (a agenda em si é testada à parte)
    if (process.env.SOULCRATE_DUBLE_ATUALIZADOR !== '1' || app.isPackaged) atualizador.iniciar();
  }
  // a janela ainda está carregando: espera o renderer assinar os eventos antes de pedir para abrir a lista
  if (!SMOKE) win.webContents.once('did-finish-load', () => setTimeout(() => abrirListaDoArgv(process.argv), 500));

  app.on('before-quit', () => {
    saindo = true;
    atualizador.aoSair();
  });
  app.on('will-quit', () => {
    health.parar();
    operacoes.cancelar();
    biblioteca.cancelar();
    logs.cancelarTodas();
    webui.encerrar();
    lote.encerrar();
    executorReal.encerrarTodos();
    atualizador.parar();
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
  // o instalador precisa trazer os arquivos da stack: sem eles o assistente não cria a pasta do Soulcrate
  if (app.isPackaged && !existsSync(join(process.resourcesPath, 'stack', 'docker-compose.yml'))) {
    clearTimeout(timer);
    return falhar('o instalador não trouxe os arquivos da stack (resources/stack)');
  }
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
