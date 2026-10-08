// Handlers de IPC (main): um por canal de `IpcInvoke`. Todo canal confere quem chamou (só a janela principal,
// só em páginas do app) e valida os argumentos: o renderer não é confiável (§6.1).
import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { clipboard, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  AlvoLog,
  AppInfo,
  AppSettings,
  CanalIpc,
  EnvironmentStatus,
  IpcInvoke,
  Limites,
  MainEvent,
} from '@shared/ipc';
import { msg } from '@shared/mensagens';
import { ehServicoId, type ServicoId } from '@shared/servicos';
import type { ConfigPublica } from '@shared/configuracao';
import type { ConfigStatus, ProjetoStatus } from '@shared/stack';
import {
  exigirArquivoExecucao,
  exigirBytes,
  exigirEntrada,
  exigirEntradaPasta,
  exigirFinalidade,
  exigirInicioDeLote,
  exigirLogin,
  exigirModelo,
  exigirNomeDeLista,
  exigirOpcoesAnalise,
  exigirOpcoesSetup,
  exigirRunId,
  exigirTextoDaLista,
} from './ipc-entradas';
import { ehUrlDoApp, podeAbrirNoNavegador } from './seguranca';
import type { AppSettingsService } from './services/app-settings';
import type { ChecksService } from './services/checks-service';
import type { ConfigService } from './services/config-service';
import type { HealthService } from './services/health-service';
import type { ListasService } from './services/listas-service';
import type { LoteService } from './services/lote-service';
import type { LogsService } from './services/logs-service';
import type { OperacoesService } from './services/operacoes-service';
import type { PastaService } from './services/pasta-service';
import { ehPastaDoSoulcrate } from './services/project-service';
import type { SetupService } from './services/setup-service';
import type { WebUiService } from './services/webui-service';

export interface ContextoIpc {
  janela(): BrowserWindow | null;
  urlDev: string | null;
  settings: AppSettingsService;
  health: HealthService;
  operacoes: OperacoesService;
  checks: ChecksService;
  logs: LogsService;
  webui: WebUiService;
  config: ConfigService;
  pasta: PastaService;
  setup: SetupService;
  listas: ListasService;
  lote: LoteService;
  /** pasta proposta para uma instalação nova */
  pastaPadrao: string;
  projeto(): ProjetoStatus;
  validarConfig(dir: string): ConfigStatus;
  existeArquivo(caminho: string): boolean;
  versaoDaStack(): string | null;
  versaoDoApp: string;
  emitir(evento: MainEvent): void;
  mostrarJanela(): void;
  abrirPastaDeLogs(): Promise<void>;
  responderFechamento(naoMostrarDeNovo: boolean): void;
}

const ARQUIVOS_ABRIVEIS = ['.env', 'slskd/slskd.yml'] as const;
const LIMITE_TEXTO_COPIADO = 200_000;

function exigirServico(valor: unknown): ServicoId {
  if (!ehServicoId(valor)) throw new Error('Serviço desconhecido.');
  return valor;
}

function exigirLimites(l: Limites): Limites {
  if (!l || ![l.x, l.y, l.width, l.height].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('Limites inválidos.');
  }
  return l;
}

function exigirAlvoLog(alvo: unknown): AlvoLog {
  if (alvo === 'todos' || ehServicoId(alvo)) return alvo;
  throw new Error('Alvo de log desconhecido.');
}

export function registrarIpc(ctx: ContextoIpc): void {
  const exigirDir = (): string => {
    const dir = ctx.projeto().dir;
    if (!dir) throw new Error('Escolha a pasta do Soulcrate primeiro.');
    return dir;
  };
  const confiavel = (e: IpcMainInvokeEvent): boolean => {
    const win = ctx.janela();
    if (!win || win.isDestroyed() || e.sender !== win.webContents) return false;
    const frame = e.senderFrame;
    return !!frame && frame === e.sender.mainFrame && ehUrlDoApp(frame.url, ctx.urlDev);
  };

  function tratar<K extends CanalIpc>(
    canal: K,
    fn: (
      e: IpcMainInvokeEvent,
      ...args: IpcInvoke[K]['args']
    ) => Promise<IpcInvoke[K]['result']> | IpcInvoke[K]['result'],
  ): void {
    ipcMain.handle(canal, (e, ...args) => {
      if (!confiavel(e)) throw new Error(`IPC recusado: remetente não autorizado (${canal}).`);
      return fn(e, ...(args as IpcInvoke[K]['args']));
    });
  }

  // ------------------------------------------------------------ app
  tratar('app:getInfo', (): AppInfo => {
    const p = ctx.projeto();
    return {
      appVersion: ctx.versaoDoApp,
      stackVersion: ctx.versaoDaStack(),
      projectDir: p.dir,
      electron: process.versions.electron,
      platform: process.platform,
    };
  });
  tratar('app:openLogsFolder', () => ctx.abrirPastaDeLogs());
  tratar('app:copyText', (_e, texto) => {
    if (typeof texto !== 'string' || texto.length > LIMITE_TEXTO_COPIADO) throw new Error('Texto inválido.');
    clipboard.writeText(texto);
  });
  tratar('app:openExternal', async (_e, url) => {
    if (typeof url !== 'string' || !podeAbrirNoNavegador(url)) throw new Error('Esse endereço não pode ser aberto.');
    await shell.openExternal(url);
  });
  tratar('app:getSettings', (): AppSettings => ctx.settings.get());
  tratar('app:setSettings', (_e, parcial): AppSettings => {
    const antes = ctx.settings.get();
    const depois = ctx.settings.set(parcial);
    if (antes.pastaDoProjeto !== depois.pastaDoProjeto) void ctx.health.atualizar({ forcar: true });
    return depois;
  });
  tratar('app:answerClosePrompt', (_e, resposta) => {
    ctx.responderFechamento(resposta?.naoMostrarDeNovo === true);
  });

  // ------------------------------------------------------------ env e stack
  tratar('env:check', async (): Promise<EnvironmentStatus> => {
    const s = await ctx.health.atualizar({ forcar: true });
    return { docker: s.docker, projeto: s.projeto, configuracao: s.configuracao };
  });
  tratar('env:startDockerDesktop', () => ctx.operacoes.abrirDockerDesktop());
  tratar('stack:status', () => ctx.health.atual);
  tratar('stack:up', (_e, opts) => ctx.operacoes.ligar({ rebuild: opts?.rebuild === true }));
  tratar('stack:down', () => ctx.operacoes.desligar());
  tratar('stack:restartService', (_e, servico) => ctx.operacoes.reiniciar(exigirServico(servico)));
  tratar('stack:runChecks', () => ctx.checks.executar());
  tratar('stack:openService', async (_e, servico, onde) => {
    const id = exigirServico(servico);
    if (onde === 'browser') ctx.webui.abrirNoNavegador(id);
    else {
      ctx.mostrarJanela();
      ctx.emitir({ type: 'app.navigate', rota: `/servicos/web/${id}` });
    }
  });

  // ------------------------------------------------------------ projeto e configuração
  tratar('project:get', () => ctx.projeto());
  tratar('project:pickFolder', async () => {
    const win = ctx.janela();
    const opcoes = { title: msg.configuracoes.pasta, properties: ['openDirectory' as const] };
    const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes);
    const dir = r.filePaths[0];
    if (r.canceled || !dir) return null;
    if (!ehPastaDoSoulcrate(dir, ctx.existeArquivo)) {
      return { projeto: ctx.projeto(), erro: msg.configuracoes.pastaSemCompose };
    }
    ctx.settings.set({ pastaDoProjeto: dir });
    await ctx.health.atualizar({ forcar: true });
    return { projeto: ctx.projeto(), erro: null };
  });
  tratar('project:openFolder', async () => {
    const dir = ctx.projeto().dir;
    if (!dir) return;
    const erro = await shell.openPath(dir);
    if (erro) throw new Error(erro);
  });
  tratar('project:openFile', async (_e, arquivo) => {
    const dir = ctx.projeto().dir;
    if (!dir || !(ARQUIVOS_ABRIVEIS as readonly string[]).includes(arquivo)) return;
    const erro = await shell.openPath(join(dir, ...arquivo.split('/')));
    if (erro) throw new Error(erro);
  });
  tratar('config:check', async (): Promise<ConfigStatus> => {
    const dir = ctx.projeto().dir;
    const r: ConfigStatus = dir ? ctx.validarConfig(dir) : { estado: 'sem-projeto', erros: 0, avisos: 0, achados: [] };
    void ctx.health.atualizar({ forcar: true });
    return r;
  });

  tratar('config:read', (): ConfigPublica | null => {
    const dir = ctx.projeto().dir;
    return dir ? ctx.config.ler(dir) : null;
  });
  tratar('config:validate', (_e, entrada) => ctx.config.validar(exigirDir(), exigirEntrada(entrada)));
  tratar('config:write', async (_e, entrada) => {
    const r = ctx.config.gravar(exigirDir(), exigirEntrada(entrada));
    await ctx.health.atualizar({ forcar: true });
    return r;
  });
  tratar('config:pickFolder', async (_e, finalidade, inicial) => {
    const win = ctx.janela();
    const opcoes = {
      title: msg.assistente.escolher[exigirFinalidade(finalidade)],
      properties: ['openDirectory' as const, 'createDirectory' as const],
      ...(typeof inicial === 'string' && isAbsolute(inicial) ? { defaultPath: inicial } : {}),
    };
    const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes);
    const dir = r.filePaths[0];
    return r.canceled || !dir ? null : dir;
  });

  // ------------------------------------------------------------ assistente e pós-configuração
  tratar('setup:prepareFolder', async (_e, entrada) => {
    const r = ctx.pasta.preparar(exigirEntradaPasta(entrada));
    if (r.ok && r.dir) {
      ctx.settings.set({ pastaDoProjeto: r.dir });
      await ctx.health.atualizar({ forcar: true });
    }
    return r;
  });
  tratar('setup:defaultFolder', () => ctx.pastaPadrao);
  tratar('setup:start', (_e, opcoes) => ctx.setup.iniciar(exigirOpcoesSetup(opcoes)));
  tratar('setup:status', () => ctx.setup.atual());
  tratar('setup:retry', () => ctx.setup.tentarDeNovo());
  tratar('setup:provideNavidromeLogin', (_e, login) => ctx.setup.informarLoginNavidrome(exigirLogin(login)));
  tratar('setup:checkPort', () => ctx.setup.verificarPorta());

  // ------------------------------------------------------------ listas e lote em lote (Fase 3)
  tratar('lists:recent', () => ctx.listas.recentes(exigirDir()));
  tratar('lists:read', (_e, nome) => ctx.listas.ler(exigirDir(), exigirNomeDeLista(nome)));
  tratar('lists:save', (_e, nome, texto) =>
    ctx.listas.salvar(exigirDir(), exigirNomeDeLista(nome), exigirTextoDaLista(texto)),
  );
  tratar('lists:create', (_e, modelo) => ctx.listas.criar(exigirDir(), exigirModelo(modelo)));
  tratar('lists:import', async () => {
    const dir = exigirDir();
    const win = ctx.janela();
    const opcoes = {
      title: msg.lote.lista.importarTitulo,
      properties: ['openFile' as const],
      filters: [{ name: msg.lote.lista.filtroArquivos, extensions: ['txt', 'csv'] }],
    };
    const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes);
    const origem = r.filePaths[0];
    return r.canceled || !origem ? null : ctx.listas.importarArquivo(dir, origem);
  });
  tratar('lists:importBytes', (_e, nome, bytes) => {
    if (typeof nome !== 'string' || nome.length > 260) throw new Error('Nome de arquivo inválido.');
    return ctx.listas.importarBytes(exigirDir(), nome, exigirBytes(bytes));
  });
  tratar('lists:analyze', (_e, nome, opcoes) =>
    ctx.listas.analisar(exigirDir(), exigirNomeDeLista(nome), exigirOpcoesAnalise(opcoes)),
  );
  tratar('batch:start', (_e, entrada) => ctx.lote.iniciar(exigirInicioDeLote(entrada)));
  tratar('batch:stop', (_e, runId) => ctx.lote.parar(exigirRunId(runId)));
  tratar('batch:active', () => ctx.lote.ativas());
  tratar('batch:attach', (_e, runId) => ctx.lote.anexar(exigirRunId(runId)));
  tratar('batch:openFile', async (_e, runId, arquivo) => {
    const caminho = ctx.lote.caminhoDoArquivo(exigirRunId(runId), exigirArquivoExecucao(arquivo));
    if (!caminho) return false;
    return (await shell.openPath(caminho)) === '';
  });
  tratar('batch:openFolder', async () => {
    const lotes = join(exigirDir(), 'lotes');
    mkdirSync(lotes, { recursive: true });
    const erro = await shell.openPath(lotes);
    if (erro) throw new Error(erro);
  });

  // ------------------------------------------------------------ logs e Web UIs
  tratar('logs:subscribe', (e, alvo) => ctx.logs.assinar(e.sender.id, exigirAlvoLog(alvo)));
  tratar('logs:unsubscribe', (_e, id) => {
    if (typeof id === 'string') ctx.logs.cancelar(id);
  });
  tratar('webui:show', (_e, servico, limites) => ctx.webui.mostrar(exigirServico(servico), exigirLimites(limites)));
  tratar('webui:setBounds', (_e, limites) => ctx.webui.definirLimites(exigirLimites(limites)));
  tratar('webui:hide', () => ctx.webui.ocultar());
  tratar('webui:goBack', () => ctx.webui.voltar());
  tratar('webui:reload', () => ctx.webui.recarregar());
  tratar('webui:openInBrowser', (_e, servico) => ctx.webui.abrirNoNavegador(exigirServico(servico)));
}
