/* eslint-disable @typescript-eslint/no-invalid-void-type -- `void` é o resultado dos canais que não devolvem nada */
// Contrato de IPC entre o renderer e o main (Apêndice C da especificação), tipado nos dois lados.
// O renderer só enxerga `window.soulcrate` (preload, via contextBridge). Segredos nunca atravessam este contrato.
import type {
  ResultadoCompartilhamento,
  ResultadoLeitura,
  ResultadoManutencao,
  ResultadoPreviaManutencao,
  ResultadoPreviaRemocao,
  ResultadoRemocao,
  TarefaManutencao,
} from './biblioteca.js';
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
import type { EventoLote } from './eventos-lote.js';
import type {
  ArquivoRelatorio,
  CriterioLimpeza,
  EstadoDaLista,
  ExecucaoDetalhe,
  ExecucaoResumo,
  NovaTentativa,
  PreviaLimpeza,
  ResultadoCorrecao,
  ResultadoLimpeza,
} from './historico.js';
import type {
  AnexoExecucao,
  ArquivoExecucao,
  ListaConteudo,
  ListaRef,
  ModeloLista,
  OpcoesAnalise,
  ResultadoAnalise,
  ResultadoInicio,
  ResumoExecucao,
} from './lote.js';
import type { OpcoesLote } from './opcoes-lote.js';
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
  lists: {
    /** listas da pasta do Soulcrate, as mais recentes primeiro */
    listRecent(): Promise<ListaRef[]>;
    read(nome: string): Promise<ListaConteudo>;
    /** grava o texto da lista (UTF-8, fim de linha do Windows) */
    save(nome: string, texto: string): Promise<ListaRef>;
    create(modelo: ModeloLista): Promise<ListaRef>;
    /** abre o seletor de arquivo do sistema e copia o .txt/.csv escolhido para a pasta do Soulcrate; null se cancelou */
    importFile(): Promise<ListaRef | null>;
    /** arquivo solto na janela: os bytes vão para o main, que grava na pasta do Soulcrate */
    importBytes(nome: string, bytes: Uint8Array): Promise<ListaRef>;
    /** `baixar-lista.ps1 -SoAnalisar` na lista salva (P5) */
    analyze(nome: string, opcoes: OpcoesAnalise): Promise<ResultadoAnalise>;
  };
  batch: {
    /** inicia o lote destacado; erros esperados (stack fora, lista já rodando) voltam em `erro`, sem lançar */
    start(entrada: { lista: string; opcoes: OpcoesLote }): Promise<ResultadoInicio>;
    /** cria o arquivo-sinal: o lote termina o que está em andamento e grava os relatórios */
    stop(runId: string): Promise<void>;
    /** execuções que o app acompanha (inclui as que continuavam vivas ao abrir) */
    active(): Promise<ResumoExecucao[]>;
    /** tudo o que já foi lido de uma execução, para montar o painel; null se o app não a acompanha */
    attach(runId: string): Promise<AnexoExecucao | null>;
    openFile(runId: string, arquivo: ArquivoExecucao): Promise<boolean>;
    /** abre a pasta lotes/ no Explorer */
    openFolder(): Promise<void>;
  };
  reports: {
    /** as execuções de lotes/ (as do app e as do .bat), da mais recente para a mais antiga */
    listRuns(): Promise<ExecucaoResumo[]>;
    /** o detalhe de uma execução, com o diagnóstico de cada faixa que não veio; null se ela não está mais em lotes/ */
    getRun(runId: string): Promise<ExecucaoDetalhe | null>;
    /** o número da linha de cada faixa que não veio dentro da lista (-SoAnalisar); null se a lista não está mais lá */
    listLines(runId: string): Promise<Record<string, number> | null>;
    /** "Talvez seja": guarda a correção e, se der, reescreve a linha na lista da execução */
    applySuggestion(
      runId: string,
      key: string,
      titulo: string,
      opcoes: { atualizarLista: boolean },
    ): Promise<ResultadoCorrecao>;
    /** desfaz a correção (e devolve a linha original à lista, se ela ainda está como o app a deixou) */
    undoSuggestion(runId: string, key: string, opcoes: { atualizarLista: boolean }): Promise<boolean>;
    /** gera nao-baixadas-<id>.txt com as faixas que falharam (já corrigidas) e devolve as opções sugeridas */
    buildRetryList(runId: string): Promise<NovaTentativa>;
    openFile(runId: string, arquivo: ArquivoRelatorio): Promise<boolean>;
    /** "Mostrar no Explorer" para o arquivo de uma faixa */
    revealTrack(runId: string, key: string): Promise<boolean>;
    previewCleanup(criterio: CriterioLimpeza): Promise<PreviaLimpeza>;
    /** manda os relatórios das execuções escolhidas para a Lixeira */
    cleanup(criterio: CriterioLimpeza): Promise<ResultadoLimpeza>;
    /** a memória (estado-<lista>.tsv) que "Reprocessar do zero" apagaria; null se não há */
    listState(runId: string): Promise<EstadoDaLista | null>;
    resetList(runId: string): Promise<boolean>;
  };
  library: {
    /** a biblioteca inteira (`beet ls`) e o que está parado em downloads/; exige a stack no ar */
    list(): Promise<ResultadoLeitura>;
    /** o que um `remove -d` apagaria com este filtro (`beet ls`), mais o token que a remoção exige */
    previewRemove(filtro: string): Promise<ResultadoPreviaRemocao>;
    /** `remove -d -f`, só com o token da prévia do mesmo filtro e se as faixas ainda são as mesmas */
    remove(filtro: string, token: string): Promise<ResultadoRemocao>;
    /** `update -p` e `move -p`; as outras tarefas só confirmam */
    previewMaintenance(tarefa: TarefaManutencao): Promise<ResultadoPreviaManutencao>;
    /** começa a tarefa e devolve o id na hora; o andamento chega por `library.log` e `library.end` */
    maintenance(tarefa: TarefaManutencao, token: string | null): Promise<ResultadoManutencao>;
    /** a tarefa que está rodando agora, para a tela reencontrá-la depois de navegar */
    running(): Promise<{ id: string; tarefa: TarefaManutencao } | null>;
    /** "Mostrar no Explorer" para uma faixa da última leitura (o renderer só fala em id) */
    revealTrack(id: number): Promise<boolean>;
    /** abre `music/` no Explorer */
    openMusicFolder(): Promise<void>;
    /** quantos arquivos o slskd anuncia no Soulseek */
    sharing(): Promise<ResultadoCompartilhamento>;
    /** pede ao slskd uma nova varredura de `music/` */
    rescanSharing(): Promise<ResultadoCompartilhamento>;
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
  /** eventos novos do lote; `desde` é o índice (absoluto) do primeiro deles */
  | { type: 'batch.events'; runId: string; desde: number; eventos: EventoLote[] }
  /** linhas novas do log bruto; `desde` é o índice (absoluto) da primeira */
  | { type: 'batch.log'; runId: string; desde: number; linhas: string[] }
  /** a manutenção da biblioteca (Fase 5): começou, uma linha da saída do beets, terminou */
  | { type: 'library.start'; id: string; tarefa: TarefaManutencao }
  | { type: 'library.log'; id: string; linha: string }
  | { type: 'library.end'; id: string; tarefa: TarefaManutencao; ok: boolean; error?: AppError }
  | { type: 'app.closePrompt' }
  | { type: 'app.navigate'; rota: string }
  /** o app foi aberto com um .txt/.csv ("Abrir com"): vira uma lista na pasta do Soulcrate */
  | { type: 'app.openList'; nome: string };

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
  'lists:recent': { args: []; result: ListaRef[] };
  'lists:read': { args: [nome: string]; result: ListaConteudo };
  'lists:save': { args: [nome: string, texto: string]; result: ListaRef };
  'lists:create': { args: [modelo: ModeloLista]; result: ListaRef };
  'lists:import': { args: []; result: ListaRef | null };
  'lists:importBytes': { args: [nome: string, bytes: Uint8Array]; result: ListaRef };
  'lists:analyze': { args: [nome: string, opcoes: OpcoesAnalise]; result: ResultadoAnalise };
  'batch:start': { args: [entrada: { lista: string; opcoes: OpcoesLote }]; result: ResultadoInicio };
  'batch:stop': { args: [runId: string]; result: void };
  'batch:active': { args: []; result: ResumoExecucao[] };
  'batch:attach': { args: [runId: string]; result: AnexoExecucao | null };
  'batch:openFile': { args: [runId: string, arquivo: ArquivoExecucao]; result: boolean };
  'batch:openFolder': { args: []; result: void };
  'reports:listRuns': { args: []; result: ExecucaoResumo[] };
  'reports:getRun': { args: [runId: string]; result: ExecucaoDetalhe | null };
  'reports:listLines': { args: [runId: string]; result: Record<string, number> | null };
  'reports:applySuggestion': {
    args: [runId: string, key: string, titulo: string, opcoes: { atualizarLista: boolean }];
    result: ResultadoCorrecao;
  };
  'reports:undoSuggestion': {
    args: [runId: string, key: string, opcoes: { atualizarLista: boolean }];
    result: boolean;
  };
  'reports:buildRetryList': { args: [runId: string]; result: NovaTentativa };
  'reports:openFile': { args: [runId: string, arquivo: ArquivoRelatorio]; result: boolean };
  'reports:revealTrack': { args: [runId: string, key: string]; result: boolean };
  'reports:previewCleanup': { args: [criterio: CriterioLimpeza]; result: PreviaLimpeza };
  'reports:cleanup': { args: [criterio: CriterioLimpeza]; result: ResultadoLimpeza };
  'reports:listState': { args: [runId: string]; result: EstadoDaLista | null };
  'reports:resetList': { args: [runId: string]; result: boolean };
  'library:list': { args: []; result: ResultadoLeitura };
  'library:previewRemove': { args: [filtro: string]; result: ResultadoPreviaRemocao };
  'library:remove': { args: [filtro: string, token: string]; result: ResultadoRemocao };
  'library:previewMaintenance': { args: [tarefa: TarefaManutencao]; result: ResultadoPreviaManutencao };
  'library:maintenance': { args: [tarefa: TarefaManutencao, token: string | null]; result: ResultadoManutencao };
  'library:running': { args: []; result: { id: string; tarefa: TarefaManutencao } | null };
  'library:revealTrack': { args: [id: number]; result: boolean };
  'library:openMusicFolder': { args: []; result: void };
  'library:sharing': { args: []; result: ResultadoCompartilhamento };
  'library:rescanSharing': { args: []; result: ResultadoCompartilhamento };
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
