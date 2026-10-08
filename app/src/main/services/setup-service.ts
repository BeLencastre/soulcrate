// SetupService (Fase 2): a pós-configuração automática, com a stack no ar. Depois que o assistente grava o .env e o
// slskd.yml, termina sozinho o que antes se fazia à mão nas interfaces web:
//   1. liga a stack e espera os três serviços ficarem saudáveis;
//   2. cria o administrador do Navidrome (SP5: POST /auth/createAdmin);
//   3. configura o Soulbeet pela API dele: URL do slskd, API key e a pasta /music (SP6);
//   4. confere a porta 2234 deste PC (sem UPnP na v1).
// Cada tarefa é idempotente: rodar de novo (depois de trocar a chave, por exemplo) não duplica nada.
// Usuário e senha do Navidrome/Soulbeet são os da Web UI do slskd (passo 4 do assistente), lidos do .env aqui no
// main; nada disso atravessa o IPC e nada é guardado: nem a senha, nem o cookie, nem o token devolvido.
import { connect } from 'node:net';
import { join } from 'node:path';
import { criarErro, erroInesperado, type AppError } from '@shared/erros';
import {
  PORTA_SOULSEEK,
  setupInicial,
  type LoginNavidrome,
  type OpcoesSetup,
  type PortaStatus,
  type SetupEstado,
  type TarefaEstado,
  type TarefaSetup,
  type TarefaSetupId,
} from '@shared/configuracao';
import type { MainEvent } from '@shared/ipc';
import { SERVICOS } from '@shared/servicos';
import { servicoSaudavel, type ProjetoStatus, type StackStatus } from '@shared/stack';
import { redigirSegredos } from '../seguranca';
import { lerChaveSlskd, lerEnv } from './config-validacao';

export interface UrlsSetup {
  navidrome: string;
  soulbeet: string;
}

export interface DependenciasSetup {
  operacoes: {
    ligar(opcoes: { rebuild?: boolean }): unknown;
    aguardar(): Promise<AppError | null>;
  };
  health: { readonly atual: StackStatus; atualizar(opcoes?: { forcar?: boolean }): Promise<StackStatus> };
  projeto(): ProjetoStatus;
  lerArquivo(caminho: string): string | null;
  urls: UrlsSetup;
  /** URL do slskd como o Soulbeet a enxerga (dentro da rede do Docker) */
  urlDoSlskdNoSoulbeet?: string;
  /** a porta do host aceita conexões? */
  portaAceitaConexao(porta: number): Promise<boolean>;
  emitir(evento: MainEvent): void;
  agora(): number;
  dormir(ms: number): Promise<void>;
  /** padrão: o `fetch` global */
  http?: typeof fetch;
  aoErro?(erro: unknown): void;
  /** quanto esperar os serviços ficarem saudáveis depois de ligar */
  esperaServicosMs?: number;
  /** quanto esperar o Soulbeet enxergar o slskd */
  esperaDownloaderMs?: number;
}

const TIMEOUT_HTTP_MS = 15_000;
const ESPERA_SERVICOS_PADRAO_MS = 6 * 60_000;
const ESPERA_DOWNLOADER_PADRAO_MS = 45_000;
const INTERVALO_MS = 2000;

/** "7 min 12 s", "48 s" */
export function formatarDuracao(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

class FalhaDoPasso extends Error {
  constructor(readonly erro: AppError) {
    super(erro.titulo);
  }
}

type Resultado = { estado: TarefaEstado; detalhe: string | null };

export class SetupService {
  private estado: SetupEstado = setupInicial();
  private emAndamento: Promise<void> | null = null;
  /** o que a tarefa "navidrome" precisa se o usuário informou o login de um administrador que já existia */
  private loginManual: LoginNavidrome | null = null;
  private detalheGravacao: string | null = null;
  private modo: OpcoesSetup['modo'] = 'ligar';

  constructor(private readonly dep: DependenciasSetup) {}

  atual(): SetupEstado {
    return structuredClone(this.estado);
  }

  // ------------------------------------------------------------ execução

  /** Roda a pós-configuração do começo. Chamada de novo enquanto roda, devolve a execução que já existe. */
  iniciar(opcoes: OpcoesSetup): SetupEstado {
    if (this.emAndamento) return this.atual();
    this.modo = opcoes.modo;
    this.detalheGravacao = opcoes.detalheGravacao ?? null;
    this.loginManual = null;
    this.estado = setupInicial();
    this.definir('gravar', 'feito', this.detalheGravacao);
    this.rodar('stack');
    return this.atual();
  }

  /** "Tentar de novo": recomeça da primeira tarefa que não terminou. */
  tentarDeNovo(): SetupEstado {
    if (this.emAndamento) return this.atual();
    const primeira = this.estado.tarefas.find((t) => t.id !== 'gravar' && t.estado !== 'feito' && t.estado !== 'aviso');
    this.rodar(primeira?.id ?? 'navidrome');
    return this.atual();
  }

  /** O Navidrome já tinha administrador e a senha do assistente não bateu: segue com o login que o usuário deu. */
  informarLoginNavidrome(login: LoginNavidrome): SetupEstado {
    if (this.emAndamento) return this.atual();
    this.loginManual = login;
    this.rodar('navidrome');
    return this.atual();
  }

  /** Espera a execução atual terminar (para os testes). */
  async aguardar(): Promise<SetupEstado> {
    await this.emAndamento;
    return this.atual();
  }

  private rodar(desde: TarefaSetupId): void {
    this.estado = { ...this.estado, rodando: true, terminou: false };
    this.emitir();
    this.emAndamento = this.executar(desde)
      .catch((e: unknown) => {
        this.dep.aoErro?.(e);
        const tarefa = this.estado.tarefas.find((t) => t.estado === 'agora');
        if (tarefa) this.definir(tarefa.id, 'erro', null, erroInesperado(e));
      })
      .finally(() => {
        this.estado = { ...this.estado, rodando: false, terminou: true };
        this.emAndamento = null;
        this.emitir();
      });
  }

  private async executar(desde: TarefaSetupId): Promise<void> {
    const passos: [TarefaSetupId, () => Promise<Resultado>][] = [
      ['stack', () => this.ligarStack()],
      ['navidrome', () => this.passoNavidrome()],
      ['soulbeet', () => this.passoSoulbeet()],
      ['porta', () => this.passoPorta()],
    ];
    const inicio = passos.findIndex(([id]) => id === desde);
    // o que ainda vai rodar volta para a fila
    for (const [id] of passos.slice(Math.max(inicio, 0))) this.definir(id, 'depois', null);

    for (const [id, fazer] of passos.slice(Math.max(inicio, 0))) {
      this.definir(id, 'agora', null);
      try {
        const r = await fazer();
        this.definir(id, r.estado, r.detalhe);
        // login pendente ou falha: o que vem depois depende disto, então para aqui
        if (r.estado === 'precisa-login' || r.estado === 'erro') return;
      } catch (e) {
        const erro = e instanceof FalhaDoPasso ? e.erro : erroInesperado(e);
        if (!(e instanceof FalhaDoPasso)) this.dep.aoErro?.(e);
        this.definir(id, 'erro', null, erro);
        return;
      }
    }
  }

  // ------------------------------------------------------------ 1. a stack

  private async ligarStack(): Promise<Resultado> {
    const inicio = this.dep.agora();
    this.dep.operacoes.ligar({ rebuild: this.modo === 'recriar' });
    const erro = await this.dep.operacoes.aguardar();
    if (erro) throw new FalhaDoPasso(erro);

    const limite = inicio + (this.dep.esperaServicosMs ?? ESPERA_SERVICOS_PADRAO_MS);
    for (;;) {
      const status = await this.dep.health.atualizar({ forcar: true });
      if (status.servicos.length > 0 && status.servicos.every(servicoSaudavel)) break;
      if (this.dep.agora() >= limite) {
        const pendentes = status.servicos.filter((s) => !servicoSaudavel(s)).map((s) => s.id);
        throw new FalhaDoPasso(
          criarErro('servico.inacessivel', {
            servico: pendentes.map((id) => SERVICOS.find((s) => s.id === id)?.nome ?? id).join(', ') || 'serviço',
            detalhes: `Sem resposta saudável depois de ${formatarDuracao(this.dep.agora() - inicio)}.`,
          }),
        );
      }
      await this.dep.dormir(INTERVALO_MS);
    }
    return {
      estado: 'feito',
      detalhe: `${this.modo === 'recriar' ? 'reinício' : 'primeiro build'}: ${formatarDuracao(this.dep.agora() - inicio)}`,
    };
  }

  // ------------------------------------------------------------ credenciais

  /** Usuário e senha da Web UI do slskd (os mesmos do Navidrome e do Soulbeet), lidos do .env. */
  private credenciais(): LoginNavidrome {
    if (this.loginManual) return this.loginManual;
    const dir = this.dep.projeto().dir;
    const texto = dir ? this.dep.lerArquivo(join(dir, '.env')) : null;
    const env = texto === null ? null : lerEnv(texto);
    const usuario = env?.get('SLSKD_WEB_USER') ?? '';
    const senha = env?.get('SLSKD_WEB_PASSWORD') ?? '';
    if (!usuario || !senha) {
      throw new FalhaDoPasso(
        criarErro('config.invalida', {
          problemas: 1,
          detalhes: 'SLSKD_WEB_USER ou SLSKD_WEB_PASSWORD está vazio no .env.',
        }),
      );
    }
    return { usuario, senha };
  }

  private chaveDoSlskd(): string {
    const dir = this.dep.projeto().dir;
    const env = dir ? this.dep.lerArquivo(join(dir, '.env')) : null;
    const doEnv = env === null ? '' : (lerEnv(env).get('SLSKD_API_KEY_SOULBEET') ?? '');
    if (doEnv) return doEnv;
    const yml = dir ? this.dep.lerArquivo(join(dir, 'slskd', 'slskd.yml')) : null;
    const doYml = yml === null ? null : lerChaveSlskd(yml);
    if (!doYml)
      throw new FalhaDoPasso(criarErro('config.invalida', { problemas: 1, detalhes: 'API key do slskd ausente.' }));
    return doYml;
  }

  // ------------------------------------------------------------ HTTP

  private async chamar(
    nome: string,
    url: string,
    init: { method: string; json?: unknown; cookie?: string },
  ): Promise<Response> {
    const http = this.dep.http ?? fetch;
    const cabecalhos: Record<string, string> = { accept: 'application/json' };
    if (init.json !== undefined) cabecalhos['content-type'] = 'application/json';
    if (init.cookie) cabecalhos.cookie = init.cookie;
    try {
      return await http(url, {
        method: init.method,
        headers: cabecalhos,
        ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
        redirect: 'manual',
      });
    } catch (e) {
      throw new FalhaDoPasso(
        criarErro('servico.inacessivel', {
          servico: nome,
          detalhes: redigirSegredos(e instanceof Error ? e.message : String(e)),
        }),
      );
    }
  }

  private falhou(passo: string, r: Response, onde: string): FalhaDoPasso {
    return new FalhaDoPasso(criarErro('setup.falhou', { passo, detalhes: `${onde} respondeu HTTP ${r.status}.` }));
  }

  // ------------------------------------------------------------ 2. Navidrome

  private async passoNavidrome(): Promise<Resultado> {
    const { usuario, senha } = this.credenciais();
    const base = this.dep.urls.navidrome;
    const criar = await this.chamar('Navidrome', `${base}/auth/createAdmin`, {
      method: 'POST',
      json: { username: usuario, password: senha },
    });
    void criar.body?.cancel();
    if (criar.ok) return { estado: 'feito', detalhe: null };
    if (criar.status !== 403) throw this.falhou('o Navidrome', criar, 'POST /auth/createAdmin');

    // já existe um administrador (instalação anterior): confere se o login do assistente é o dele
    const login = await this.chamar('Navidrome', `${base}/auth/login`, {
      method: 'POST',
      json: { username: usuario, password: senha },
    });
    void login.body?.cancel();
    if (login.ok) return { estado: 'feito', detalhe: 'já havia um administrador' };
    if (login.status === 401 || login.status === 403) return { estado: 'precisa-login', detalhe: null };
    throw this.falhou('o Navidrome', login, 'POST /auth/login');
  }

  // ------------------------------------------------------------ 3. Soulbeet

  private async passoSoulbeet(): Promise<Resultado> {
    const { usuario, senha } = this.credenciais();
    const chave = this.chaveDoSlskd();
    const base = this.dep.urls.soulbeet;
    const passo = 'o Soulbeet';

    const login = await this.chamar('Soulbeet', `${base}/api/auth/login`, {
      method: 'POST',
      json: { username: usuario, password: senha },
    });
    void login.body?.cancel();
    if (login.status === 401 || login.status === 403) return { estado: 'precisa-login', detalhe: null };
    if (!login.ok) throw this.falhou(passo, login, 'POST /api/auth/login');
    // o cookie só vive nesta função: não é guardado
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .find((c) => c.startsWith('auth_token='));
    if (!cookie)
      throw new FalhaDoPasso(criarErro('setup.falhou', { passo, detalhes: 'O Soulbeet não devolveu a sessão.' }));

    const config = await this.chamar('Soulbeet', `${base}/api/config`, {
      method: 'POST',
      cookie,
      json: { config: { slskd_url: this.dep.urlDoSlskdNoSoulbeet ?? 'http://slskd:5030', slskd_api_key: chave } },
    });
    void config.body?.cancel();
    if (!config.ok) throw this.falhou(passo, config, 'POST /api/config');

    // POST /api/folders não é idempotente: só cria se ainda não houver a /music
    const lista = await this.chamar('Soulbeet', `${base}/api/folders`, { method: 'GET', cookie });
    if (!lista.ok) throw this.falhou(passo, lista, 'GET /api/folders');
    const pastas = (await lista.json().catch(() => [])) as { path?: string }[];
    if (!Array.isArray(pastas) || !pastas.some((p) => p.path === '/music')) {
      const nova = await this.chamar('Soulbeet', `${base}/api/folders`, {
        method: 'POST',
        cookie,
        json: { name: 'Music', path: '/music' },
      });
      void nova.body?.cancel();
      if (!nova.ok) throw this.falhou(passo, nova, 'POST /api/folders');
    }

    // confirma: o Soulbeet precisa enxergar o slskd e o beets
    const limite = this.dep.agora() + (this.dep.esperaDownloaderMs ?? ESPERA_DOWNLOADER_PADRAO_MS);
    for (;;) {
      const saude = await this.chamar('Soulbeet', `${base}/api/system/health`, { method: 'GET', cookie });
      if (saude.ok) {
        const s = (await saude.json().catch(() => ({}))) as { downloader_online?: boolean; beets_ready?: boolean };
        if (s.downloader_online === true && s.beets_ready !== false) return { estado: 'feito', detalhe: null };
      } else {
        void saude.body?.cancel();
      }
      if (this.dep.agora() >= limite) {
        return {
          estado: 'aviso',
          detalhe: 'gravado, mas o Soulbeet ainda não enxerga o slskd',
        };
      }
      await this.dep.dormir(INTERVALO_MS);
    }
  }

  // ------------------------------------------------------------ 4. porta 2234

  async verificarPorta(): Promise<PortaStatus> {
    const stackNoAr = this.dep.health.atual.servicos.some((s) => s.id === 'slskd' && s.container === 'running');
    const aceita = await this.dep.portaAceitaConexao(PORTA_SOULSEEK);
    return {
      porta: PORTA_SOULSEEK,
      stackNoAr,
      estado: aceita ? (stackNoAr ? 'escutando' : 'ocupada') : 'livre',
    };
  }

  private async passoPorta(): Promise<Resultado> {
    const p = await this.verificarPorta();
    if (p.estado === 'escutando') return { estado: 'feito', detalhe: 'escutando neste PC' };
    return {
      estado: 'aviso',
      detalhe: p.estado === 'ocupada' ? 'em uso por outro programa' : 'nada escuta na porta 2234',
    };
  }

  // ------------------------------------------------------------ estado

  private definir(id: TarefaSetupId, estado: TarefaEstado, detalhe: string | null, erro: AppError | null = null): void {
    this.estado = {
      ...this.estado,
      tarefas: this.estado.tarefas.map((t): TarefaSetup => (t.id === id ? { id, estado, detalhe, erro } : t)),
    };
    this.emitir();
  }

  private emitir(): void {
    this.dep.emitir({ type: 'setup.state', estado: this.atual() });
  }
}

/** Tenta abrir uma conexão TCP em 127.0.0.1; é como se descobre se algo atende numa porta sem tentar ocupá-la. */
export function portaAceitaConexao(porta: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolver) => {
    const socket = connect({ port: porta, host: '127.0.0.1' });
    const fim = (ok: boolean) => {
      socket.destroy();
      resolver(ok);
    };
    socket.setTimeout(timeoutMs, () => fim(false));
    socket.once('connect', () => fim(true));
    socket.once('error', () => fim(false));
  });
}
