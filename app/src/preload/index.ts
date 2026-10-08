// Preload: expõe `window.soulcrate` (API mínima e tipada, §3.2). Nenhum `ipcRenderer` cru chega ao renderer:
// só as funções abaixo, cada uma ligada a um canal conhecido de `IpcInvoke`.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CANAL_EVENTOS, type CanalIpc, type IpcInvoke, type MainEvent, type SoulcrateApi } from '../shared/ipc';

function chamar<K extends CanalIpc>(canal: K, ...args: IpcInvoke[K]['args']): Promise<IpcInvoke[K]['result']> {
  return ipcRenderer.invoke(canal, ...args) as Promise<IpcInvoke[K]['result']>;
}

const api: SoulcrateApi = {
  app: {
    getInfo: () => chamar('app:getInfo'),
    openLogsFolder: () => chamar('app:openLogsFolder'),
    copyText: (texto) => chamar('app:copyText', texto),
    openExternal: (url) => chamar('app:openExternal', url),
    getSettings: () => chamar('app:getSettings'),
    setSettings: (parcial) => chamar('app:setSettings', parcial),
    answerClosePrompt: (resposta) => chamar('app:answerClosePrompt', resposta),
  },
  env: {
    check: () => chamar('env:check'),
    startDockerDesktop: () => chamar('env:startDockerDesktop'),
  },
  stack: {
    status: () => chamar('stack:status'),
    up: (opts) => (opts ? chamar('stack:up', opts) : chamar('stack:up')),
    down: () => chamar('stack:down'),
    restartService: (servico) => chamar('stack:restartService', servico),
    runChecks: () => chamar('stack:runChecks'),
    openService: (servico, onde) => chamar('stack:openService', servico, onde),
  },
  project: {
    get: () => chamar('project:get'),
    pickFolder: () => chamar('project:pickFolder'),
    openFolder: () => chamar('project:openFolder'),
    openFile: (arquivo) => chamar('project:openFile', arquivo),
  },
  config: {
    check: () => chamar('config:check'),
    read: () => chamar('config:read'),
    validate: (entrada) => chamar('config:validate', entrada),
    write: (entrada) => chamar('config:write', entrada),
    pickFolder: (finalidade, inicial) =>
      inicial === undefined
        ? chamar('config:pickFolder', finalidade)
        : chamar('config:pickFolder', finalidade, inicial),
  },
  setup: {
    prepareFolder: (entrada) => chamar('setup:prepareFolder', entrada),
    defaultFolder: () => chamar('setup:defaultFolder'),
    start: (opcoes) => chamar('setup:start', opcoes),
    status: () => chamar('setup:status'),
    retry: () => chamar('setup:retry'),
    provideNavidromeLogin: (login) => chamar('setup:provideNavidromeLogin', login),
    checkPort: () => chamar('setup:checkPort'),
  },
  lists: {
    listRecent: () => chamar('lists:recent'),
    read: (nome) => chamar('lists:read', nome),
    save: (nome, texto) => chamar('lists:save', nome, texto),
    create: (modelo) => chamar('lists:create', modelo),
    importFile: () => chamar('lists:import'),
    importBytes: (nome, bytes) => chamar('lists:importBytes', nome, bytes),
    analyze: (nome, opcoes) => chamar('lists:analyze', nome, opcoes),
  },
  batch: {
    start: (entrada) => chamar('batch:start', entrada),
    stop: (runId) => chamar('batch:stop', runId),
    active: () => chamar('batch:active'),
    attach: (runId) => chamar('batch:attach', runId),
    openFile: (runId, arquivo) => chamar('batch:openFile', runId, arquivo),
    openFolder: () => chamar('batch:openFolder'),
  },
  reports: {
    listRuns: () => chamar('reports:listRuns'),
    getRun: (runId) => chamar('reports:getRun', runId),
    listLines: (runId) => chamar('reports:listLines', runId),
    applySuggestion: (runId, key, titulo, opcoes) => chamar('reports:applySuggestion', runId, key, titulo, opcoes),
    undoSuggestion: (runId, key, opcoes) => chamar('reports:undoSuggestion', runId, key, opcoes),
    buildRetryList: (runId) => chamar('reports:buildRetryList', runId),
    openFile: (runId, arquivo) => chamar('reports:openFile', runId, arquivo),
    revealTrack: (runId, key) => chamar('reports:revealTrack', runId, key),
    previewCleanup: (criterio) => chamar('reports:previewCleanup', criterio),
    cleanup: (criterio) => chamar('reports:cleanup', criterio),
    listState: (runId) => chamar('reports:listState', runId),
    resetList: (runId) => chamar('reports:resetList', runId),
  },
  logs: {
    subscribe: (alvo) => chamar('logs:subscribe', alvo),
    unsubscribe: (id) => chamar('logs:unsubscribe', id),
  },
  webui: {
    show: (servico, limites) => chamar('webui:show', servico, limites),
    setBounds: (limites) => chamar('webui:setBounds', limites),
    hide: () => chamar('webui:hide'),
    goBack: () => chamar('webui:goBack'),
    reload: () => chamar('webui:reload'),
    openInBrowser: (servico) => chamar('webui:openInBrowser', servico),
  },
  onEvent: (ouvinte) => {
    const aoReceber = (_e: IpcRendererEvent, evento: MainEvent) => ouvinte(evento);
    ipcRenderer.on(CANAL_EVENTOS, aoReceber);
    return () => {
      ipcRenderer.removeListener(CANAL_EVENTOS, aoReceber);
    };
  },
};

contextBridge.exposeInMainWorld('soulcrate', api);
