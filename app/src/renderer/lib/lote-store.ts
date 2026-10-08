// Estado do download em lote no renderer (Zustand, §3.1): o rascunho (a lista aberta, o texto, as opções) e a execução
// que o painel acompanha. O main é a fonte da verdade da execução: aqui só se aplicam os eventos que ele empurra.
import { create } from 'zustand';
import type { EventoLote } from '@shared/eventos-lote';
import type { MainEvent } from '@shared/ipc';
import type {
  ListaConteudo,
  ListaRef,
  ModeloLista,
  OpcoesAnalise,
  ResultadoAnalise,
  ResumoExecucao,
} from '@shared/lote';
import { aplicarEventos, estadoInicialLote, novosDoLote, type EstadoLote } from '@shared/lote-estado';
import { msg } from '@shared/mensagens';
import { novasOpcoes, type OpcoesLote } from '@shared/opcoes-lote';
import { api } from './api';

const CHAVE_ULTIMA_LISTA = 'soulcrate.ultimaLista';
/** O log bruto fica com as últimas linhas; o arquivo em lotes/ tem tudo. */
export const MAX_LINHAS_LOG_UI = 5000;

function lembrarLista(nome: string | null): void {
  try {
    if (nome) localStorage.setItem(CHAVE_ULTIMA_LISTA, nome);
    else localStorage.removeItem(CHAVE_ULTIMA_LISTA);
  } catch {
    /* sem localStorage (janela anônima, testes): a lista só não é reaberta na próxima vez */
  }
}

export function ultimaListaLembrada(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_LISTA);
  } catch {
    return null;
  }
}

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** O Electron embrulha o erro do main ("Error invoking remote method…"): tira o prefixo para mostrar ao usuário. */
export const semPrefixoIpc = (texto: string): string =>
  texto.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

// ---------------------------------------------------------------- Rascunho (lista aberta e opções)

export interface AnaliseGuardada {
  resultado: ResultadoAnalise;
  /** o texto salvo que foi analisado: só vale para o editor enquanto o texto for este */
  texto: string;
}

interface RascunhoStore {
  lista: ListaConteudo | null;
  texto: string;
  /** o que está no arquivo agora (o último texto salvo ou lido) */
  textoSalvo: string;
  salvoEm: number | null;
  salvando: boolean;
  analise: AnaliseGuardada | null;
  analisando: boolean;
  erroAnalise: string | null;
  /** erro das ações de abrir, criar, importar e salvar */
  erro: string | null;
  opcoes: OpcoesLote;
  recentes: ListaRef[];
  abrir(nome: string): Promise<boolean>;
  criar(modelo: ModeloLista): Promise<void>;
  importarArquivo(): Promise<void>;
  importarBytes(nome: string, bytes: Uint8Array): Promise<void>;
  editar(texto: string): void;
  salvar(): Promise<boolean>;
  analisar(o: OpcoesAnalise): Promise<void>;
  carregarRecentes(): Promise<void>;
  definirOpcoes(opcoes: OpcoesLote): void;
  limparErro(): void;
}

let sequenciaAnalise = 0;
/** o salvamento que está acontecendo agora (só um por vez) */
let salvamentoAtual: Promise<boolean> | null = null;

export const useRascunho = create<RascunhoStore>((set, get) => ({
  lista: null,
  texto: '',
  textoSalvo: '',
  salvoEm: null,
  salvando: false,
  analise: null,
  analisando: false,
  erroAnalise: null,
  erro: null,
  opcoes: novasOpcoes(),
  recentes: [],

  async abrir(nome) {
    // o que foi digitado na lista que está aberta não se perde ao trocar de lista
    if (!(await get().salvar())) return false;
    try {
      const l = await api.lists.read(nome);
      sequenciaAnalise++; // análise em andamento da lista anterior não vale mais
      set({
        lista: l,
        texto: l.texto,
        textoSalvo: l.texto,
        salvoEm: l.modificadaEm,
        analise: null,
        analisando: false,
        erroAnalise: null,
        erro: null,
      });
      lembrarLista(l.nome);
      return true;
    } catch (e) {
      lembrarLista(null);
      set({ erro: `${msg.lote.lista.erroAbrir}: ${semPrefixoIpc(mensagemDe(e))}` });
      return false;
    }
  },

  async criar(modelo) {
    try {
      const ref = await api.lists.create(modelo);
      await get().abrir(ref.nome);
      void get().carregarRecentes();
    } catch (e) {
      set({ erro: `${msg.lote.lista.erroAbrir}: ${semPrefixoIpc(mensagemDe(e))}` });
    }
  },

  async importarArquivo() {
    try {
      const ref = await api.lists.importFile();
      if (!ref) return;
      await get().abrir(ref.nome);
      void get().carregarRecentes();
    } catch (e) {
      set({ erro: `${msg.lote.lista.erroImportar}: ${semPrefixoIpc(mensagemDe(e))}` });
    }
  },

  async importarBytes(nome, bytes) {
    try {
      const ref = await api.lists.importBytes(nome, bytes);
      await get().abrir(ref.nome);
      void get().carregarRecentes();
    } catch (e) {
      set({ erro: `${msg.lote.lista.erroImportar}: ${semPrefixoIpc(mensagemDe(e))}` });
    }
  },

  editar(texto) {
    if (get().lista?.somenteLeitura) return;
    set({ texto });
  },

  async salvar() {
    // um salvamento em andamento (a pausa na digitação) pode estar gravando um texto mais antigo: espera ele
    // terminar e confere de novo o que falta, em vez de desistir (quem chama é o "Iniciar lote")
    while (salvamentoAtual) await salvamentoAtual;
    const { lista, texto, textoSalvo } = get();
    if (!lista || lista.somenteLeitura) return true;
    if (texto === textoSalvo) return true;
    set({ salvando: true });
    salvamentoAtual = (async () => {
      try {
        const ref = await api.lists.save(lista.nome, texto);
        // o texto pode ter mudado enquanto salvava: o que ficou no arquivo é `texto`, não o que está no editor agora
        set({ textoSalvo: texto, salvoEm: ref.modificadaEm, salvando: false, erro: null });
        return true;
      } catch (e) {
        set({ salvando: false, erro: `${msg.lote.lista.erroSalvar}: ${semPrefixoIpc(mensagemDe(e))}` });
        return false;
      }
    })();
    let ok: boolean;
    try {
      ok = await salvamentoAtual;
    } finally {
      salvamentoAtual = null;
    }
    // o que foi digitado enquanto salvava também precisa ir para o arquivo antes de quem pediu seguir adiante
    return ok && get().texto !== get().textoSalvo ? get().salvar() : ok;
  },

  async analisar(o) {
    const { lista, textoSalvo } = get();
    if (!lista) return;
    const minha = ++sequenciaAnalise;
    set({ analisando: true });
    try {
      const resultado = await api.lists.analyze(lista.nome, o);
      if (minha !== sequenciaAnalise) return;
      set({ analise: { resultado, texto: textoSalvo }, analisando: false, erroAnalise: null });
    } catch (e) {
      if (minha !== sequenciaAnalise) return;
      const texto = semPrefixoIpc(mensagemDe(e));
      // uma análise cancelada por outra mais nova não é erro
      set({ analisando: false, ...(/cancelada/i.test(texto) ? {} : { erroAnalise: texto }) });
    }
  },

  async carregarRecentes() {
    try {
      set({ recentes: await api.lists.listRecent() });
    } catch {
      set({ recentes: [] });
    }
  },

  definirOpcoes: (opcoes) => set({ opcoes }),
  limparErro: () => set({ erro: null }),
}));

/** O texto do editor ainda não foi para o arquivo. */
export const estaSujo = (s: Pick<RascunhoStore, 'texto' | 'textoSalvo'>): boolean => s.texto !== s.textoSalvo;

// ---------------------------------------------------------------- Execução (o painel ao vivo)

interface GrupoPendente<T> {
  desde: number;
  itens: T[];
}

interface ExecucaoStore {
  runId: string | null;
  /** o estado completo (`attach`) já chegou; antes disso, os eventos ficam guardados à parte */
  anexado: boolean;
  estado: EstadoLote;
  log: string[];
  logAplicadas: number;
  pendentesEventos: GrupoPendente<EventoLote>[];
  pendentesLog: GrupoPendente<string>[];
  resumo: ResumoExecucao | null;
  /** o usuário clicou em Parar (o `run.stopping` do script só chega no próximo ciclo dele) */
  pediuParar: boolean;
  anexar(runId: string): Promise<void>;
  /** procura execuções que continuam vivas e passa a mostrar a mais recente */
  reconectar(): Promise<void>;
  parar(): Promise<void>;
  aoEvento(e: MainEvent): void;
  esquecer(): void;
}

const execucaoVazia = {
  runId: null,
  anexado: false,
  estado: estadoInicialLote(),
  log: [] as string[],
  logAplicadas: 0,
  pendentesEventos: [] as GrupoPendente<EventoLote>[],
  pendentesLog: [] as GrupoPendente<string>[],
  resumo: null,
  pediuParar: false,
};

function cortarLog(log: string[]): string[] {
  return log.length > MAX_LINHAS_LOG_UI ? log.slice(log.length - MAX_LINHAS_LOG_UI) : log;
}

export const useExecucao = create<ExecucaoStore>((set, get) => ({
  ...execucaoVazia,

  async anexar(runId) {
    set({ ...execucaoVazia, estado: estadoInicialLote(), runId });
    const anexo = await api.batch.attach(runId);
    if (get().runId !== runId) return; // o usuário já passou para outra execução
    if (!anexo) {
      set({ anexado: true });
      return;
    }
    let estado = aplicarEventos(estadoInicialLote(), anexo.eventos);
    let log = anexo.log;
    let logAplicadas = anexo.logTotal;
    let lacuna = false;
    // o que chegou enquanto o estado completo vinha a caminho: aplica só o que o estado ainda não tem
    for (const g of get().pendentesEventos) {
      const novos = novosDoLote(estado.eventosAplicados, g.desde, g.itens);
      if (novos === null) lacuna = true;
      else estado = aplicarEventos(estado, novos);
    }
    for (const g of get().pendentesLog) {
      const novas = novosDoLote(logAplicadas, g.desde, g.itens);
      if (novas === null) lacuna = true;
      else {
        log = cortarLog([...log, ...novas]);
        logAplicadas += novas.length;
      }
    }
    set({ anexado: true, estado, log, logAplicadas, resumo: anexo.resumo, pendentesEventos: [], pendentesLog: [] });
    if (lacuna) await get().anexar(runId);
  },

  async reconectar() {
    try {
      const resumos = await api.batch.active();
      // a mais recente que ainda está rodando; se nenhuma roda, não mostra nada de uma execução antiga
      const viva = [...resumos].reverse().find((r) => !r.terminou);
      if (viva && get().runId !== viva.runId) await get().anexar(viva.runId);
    } catch (e) {
      console.error('Não consegui procurar lotes em andamento:', e);
    }
  },

  async parar() {
    const { runId } = get();
    if (!runId) return;
    await api.batch.stop(runId);
    set({ pediuParar: true });
  },

  aoEvento(e) {
    if (e.type === 'batch.events') {
      const s = get();
      if (e.runId !== s.runId) return;
      if (!s.anexado) {
        set({ pendentesEventos: [...s.pendentesEventos, { desde: e.desde, itens: e.eventos }] });
        return;
      }
      const novos = novosDoLote(s.estado.eventosAplicados, e.desde, e.eventos);
      if (novos === null) {
        void get().anexar(e.runId);
        return;
      }
      if (novos.length > 0) set({ estado: aplicarEventos(s.estado, novos) });
    } else if (e.type === 'batch.log') {
      const s = get();
      if (e.runId !== s.runId) return;
      if (!s.anexado) {
        set({ pendentesLog: [...s.pendentesLog, { desde: e.desde, itens: e.linhas }] });
        return;
      }
      const novas = novosDoLote(s.logAplicadas, e.desde, e.linhas);
      if (novas === null) {
        void get().anexar(e.runId);
        return;
      }
      if (novas.length > 0) set({ log: cortarLog([...s.log, ...novas]), logAplicadas: s.logAplicadas + novas.length });
    }
  },

  esquecer: () => set({ ...execucaoVazia, estado: estadoInicialLote() }),
}));

/** Há uma execução em andamento no painel? */
export const execucaoRodando = (s: Pick<ExecucaoStore, 'runId' | 'estado'>): boolean =>
  s.runId !== null && s.estado.fase !== 'terminou';
