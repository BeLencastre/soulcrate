/* eslint-disable @typescript-eslint/no-invalid-void-type -- `void` é o resultado dos canais que não devolvem nada */
// Contrato de IPC entre o renderer e o main (Apêndice C da especificação), tipado nos dois lados.
// O renderer só enxerga `window.soulcrate` (preload, via contextBridge). Segredos nunca atravessam este contrato.
import type {
  ConfigEntrada,
  ConfigPublica,
  EntradaPasta,
  LoginNavidrome,
  OpcoesSetup,
  PortaStatus,
  ResultadoGravacao,
  ResultadoPasta,
  ResultadoValidacao,
  SetupEstado,
} from './configuracao.js';
import type { AppError } from './erros.js';
import type { ServicoId } from './servicos.js';
import type { ConfigStatus, DockerStatus, ProjetoStatus, StackStatus } from './stack.js';

export type OperationId = string;
export type SubscriptionId = string;

export interface AppInfo {
  appVersion: string;
  /** versão da stack (arquivo VERSION da pasta do Soulcrate); null sem pasta ou sem o arquivo */
  stackVersion: string | null;
  projectDir: string | null;
  electron: string;
  platform: string;
}

/** Preferências do app (não da stack), guardadas em userData. */
export interface AppSettings {
  /** fechar a janela esconde o app na bandeja em vez de sair (D7) */
  minimizarParaBandeja: boolean;
  /** o aviso "O Soulcrate continua na bandeja" já foi mostrado e dispensado */
  avisoBandejaDispensado: boolean;
  /** pasta do Soulcrate escolhida pelo usuário */
  pastaDoProjeto: string | null;
}

export interface EnvironmentStatus {
  docker: DockerStatus;
  projeto: ProjetoStatus;
  configuracao: ConfigStatus;
}

// ---------------------------------------------------------------- Operações

export type OperacaoTipo = 'ligar' | 'desligar' | 'reconstruir' | 'reiniciar' | 'abrir-docker';

export interface OperacaoIniciada {
  id: OperationId;
  tipo: OperacaoTipo;
}

/** Marcadores que o app reconhece na saída do build da imagem do Soulbeet. */
export type MarcadorBuild = 'plugins ok' | 'lastgenre ok';

// ---------------------------------------------------------------- Verificações (status.bat)

export type CheckId = 'containers' | 'endpoints' | 'plugins' | 'pastas' | 'importacoes';
export type CheckEstado = 'ok' | 'aviso' | 'erro';

export interface CheckItem {
  texto: string;
  estado: CheckEstado | 'neutro';
}

export interface HealthCheckResult {
  id: CheckId;
  estado: CheckEstado;
  itens: CheckItem[];
  /** explicação mostrada quando o estado não é ok */
  nota: string | null;
}

export interface ChecksResultado {
  /** epoch ms */
  verificadoEm: number;
  /** false quando a stack está desligada: não há o que verificar */
  executado: boolean;
  checks: HealthCheckResult[];
}

// ---------------------------------------------------------------- Logs

export type AlvoLog = ServicoId | 'todos';
export type NivelLog = 'info' | 'aviso' | 'erro';

export interface LinhaLog {
  /** de que contêiner veio (útil na aba "todos") */
  servico: ServicoId | null;
  /** HH:mm:ss no horário local, quando a linha tem carimbo */
  hora: string | null;
  texto: string;
  nivel: NivelLog;
}

// ---------------------------------------------------------------- Web UIs

export interface Limites {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WebUiCarga = 'carregando' | 'pronto' | 'erro';

export interface WebUiEstado {
  servico: ServicoId;
  carga: WebUiCarga;
  url: string;
  podeVoltar: boolean;
  /** descrição técnica da falha, quando carga = 'erro' */
  erro: string | null;
}

/** Para que serve a pasta que o usuário vai escolher no seletor do sistema. */
export type FinalidadePasta = 'project' | 'music' | 'downloads' | 'incomplete';

// ---------------------------------------------------------------- Requisições (renderer → main)

export interface SoulcrateApi {
  app: {
    getInfo(): Promise<AppInfo>;
    openLogsFolder(): Promise<void>;
    copyText(texto: string): Promise<void>;
    /** só `https:` e as portas locais conhecidas; qualquer outra coisa é recusada */
    openExternal(url: string): Promise<void>;
    getSettings(): Promise<AppSettings>;
    setSettings(parcial: Partial<AppSettings>): Promise<AppSettings>;
    /** resposta do aviso da primeira vez que a janela é fechada: `naoMostrarDeNovo` e `esconder` */
    answerClosePrompt(resposta: { naoMostrarDeNovo: boolean }): Promise<void>;
  };
  env: {
    check(): Promise<EnvironmentStatus>;
    startDockerDesktop(): Promise<OperacaoIniciada>;
  };
  stack: {
    status(): Promise<StackStatus>;
    up(opts?: { rebuild?: boolean }): Promise<OperacaoIniciada>;
    down(): Promise<OperacaoIniciada>;
    restartService(servico: ServicoId): Promise<OperacaoIniciada>;
    runChecks(): Promise<ChecksResultado>;
    openService(servico: ServicoId, onde: 'app' | 'browser'): Promise<void>;
  };
  project: {
    get(): Promise<ProjetoStatus>;
    /** abre o seletor de pasta; devolve o projeto atualizado, ou null se o usuário cancelou ou a pasta não serve */
    pickFolder(): Promise<{ projeto: ProjetoStatus; erro: string | null } | null>;
    openFolder(): Promise<void>;
    openFile(arquivo: '.env' | 'slskd/slskd.yml'): Promise<void>;
  };
  config: {
    /** confere o .env e o slskd.yml agora */
    check(): Promise<ConfigStatus>;
    /** o que a pasta do Soulcrate já tem configurado, sem segredos; null sem pasta */
    read(): Promise<ConfigPublica | null>;
    /** confere o formulário (pastas, disco, OneDrive, campos) sem gravar nada */
    validate(entrada: ConfigEntrada): Promise<ResultadoValidacao>;
    /** grava o .env e o slskd.yml (gera as chaves, faz backup). Senhas em branco mantêm as que já existem */
    write(entrada: ConfigEntrada): Promise<ResultadoGravacao>;
    /** abre o seletor de pasta do sistema; null se o usuário cancelou */
    pickFolder(finalidade: FinalidadePasta, inicial?: string): Promise<string | null>;
  };
  setup: {
    /** passo 1 do assistente: copia a stack para uma pasta nova (ou confere uma existente) e passa a usá-la */
    prepareFolder(entrada: EntradaPasta): Promise<ResultadoPasta>;
    /** pasta proposta para uma instalação nova (`Soulcrate` no perfil do usuário) */
    defaultFolder(): Promise<string>;
    /** liga a stack e termina a configuração sozinho (Navidrome, Soulbeet, porta 2234) */
    start(opcoes: OpcoesSetup): Promise<SetupEstado>;
    status(): Promise<SetupEstado>;
    retry(): Promise<SetupEstado>;
    /** o Navidrome já tinha administrador: segue com o login que o usuário informou (não é guardado) */
    provideNavidromeLogin(login: LoginNavidrome): Promise<SetupEstado>;
    checkPort(): Promise<PortaStatus>;
  };
  logs: {
    subscribe(alvo: AlvoLog): Promise<SubscriptionId>;
    unsubscribe(id: SubscriptionId): Promise<void>;
  };
  webui: {
    show(servico: ServicoId, limites: Limites): Promise<void>;
    setBounds(limites: Limites): Promise<void>;
    hide(): Promise<void>;
    goBack(): Promise<void>;
    reload(): Promise<void>;
    openInBrowser(servico: ServicoId): Promise<void>;
  };
  /** assina os eventos do main; devolve a função que cancela a assinatura */
  onEvent(ouvinte: (evento: MainEvent) => void): () => void;
}

// ---------------------------------------------------------------- Eventos (main → renderer)

export type MainEvent =
  | { type: 'stack.status'; status: StackStatus }
  | { type: 'operation.start'; id: OperationId; tipo: OperacaoTipo }
  | { type: 'operation.log'; id: OperationId; line: string; marcador: MarcadorBuild | null }
  | { type: 'operation.end'; id: OperationId; ok: boolean; error?: AppError }
  | { type: 'logs.lines'; id: SubscriptionId; linhas: LinhaLog[] }
  | { type: 'logs.end'; id: SubscriptionId; motivo: string | null }
  | { type: 'webui.state'; estado: WebUiEstado }
  | { type: 'setup.state'; estado: SetupEstado }
  | { type: 'app.closePrompt' }
  | { type: 'app.navigate'; rota: string };

// ---------------------------------------------------------------- Canais

/** Cada canal de `ipcRenderer.invoke`: argumentos e resultado. É a única tabela que preload e main precisam seguir. */
export interface IpcInvoke {
  'app:getInfo': { args: []; result: AppInfo };
  'app:openLogsFolder': { args: []; result: void };
  'app:copyText': { args: [texto: string]; result: void };
  'app:openExternal': { args: [url: string]; result: void };
  'app:getSettings': { args: []; result: AppSettings };
  'app:setSettings': { args: [parcial: Partial<AppSettings>]; result: AppSettings };
  'app:answerClosePrompt': { args: [resposta: { naoMostrarDeNovo: boolean }]; result: void };
  'env:check': { args: []; result: EnvironmentStatus };
  'env:startDockerDesktop': { args: []; result: OperacaoIniciada };
  'stack:status': { args: []; result: StackStatus };
  'stack:up': { args: [opts?: { rebuild?: boolean }]; result: OperacaoIniciada };
  'stack:down': { args: []; result: OperacaoIniciada };
  'stack:restartService': { args: [servico: ServicoId]; result: OperacaoIniciada };
  'stack:runChecks': { args: []; result: ChecksResultado };
  'stack:openService': { args: [servico: ServicoId, onde: 'app' | 'browser']; result: void };
  'project:get': { args: []; result: ProjetoStatus };
  'project:pickFolder': { args: []; result: { projeto: ProjetoStatus; erro: string | null } | null };
  'project:openFolder': { args: []; result: void };
  'project:openFile': { args: [arquivo: '.env' | 'slskd/slskd.yml']; result: void };
  'config:check': { args: []; result: ConfigStatus };
  'config:read': { args: []; result: ConfigPublica | null };
  'config:validate': { args: [entrada: ConfigEntrada]; result: ResultadoValidacao };
  'config:write': { args: [entrada: ConfigEntrada]; result: ResultadoGravacao };
  'config:pickFolder': { args: [finalidade: FinalidadePasta, inicial?: string]; result: string | null };
  'setup:prepareFolder': { args: [entrada: EntradaPasta]; result: ResultadoPasta };
  'setup:defaultFolder': { args: []; result: string };
  'setup:start': { args: [opcoes: OpcoesSetup]; result: SetupEstado };
  'setup:status': { args: []; result: SetupEstado };
  'setup:retry': { args: []; result: SetupEstado };
  'setup:provideNavidromeLogin': { args: [login: LoginNavidrome]; result: SetupEstado };
  'setup:checkPort': { args: []; result: PortaStatus };
  'logs:subscribe': { args: [alvo: AlvoLog]; result: SubscriptionId };
  'logs:unsubscribe': { args: [id: SubscriptionId]; result: void };
  'webui:show': { args: [servico: ServicoId, limites: Limites]; result: void };
  'webui:setBounds': { args: [limites: Limites]; result: void };
  'webui:hide': { args: []; result: void };
  'webui:goBack': { args: []; result: void };
  'webui:reload': { args: []; result: void };
  'webui:openInBrowser': { args: [servico: ServicoId]; result: void };
}

export type CanalIpc = keyof IpcInvoke;

/** Canal único por onde o main empurra eventos para o renderer. */
export const CANAL_EVENTOS = 'soulcrate:evento';
