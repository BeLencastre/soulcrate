// Ajudantes dos testes ponta a ponta: monta uma "pasta do Soulcrate" de mentira, um mundo do dublê do docker
// e abre o app (o build em out/) apontando para eles. Nenhum teste toca na stack nem nos dados reais do usuário.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

const APP_DIR = join(import.meta.dirname, '..', '..');
const DUBLE = join(APP_DIR, 'tests', 'dubles', 'docker-falso.mjs');
const REPO_DIR = join(APP_DIR, '..');
const SLSKD_FALSO = join(REPO_DIR, 'tests', 'dubles', 'slskd-falso.mjs');

export interface MundoContainers {
  [servico: string]: { estado: string; saude?: string } | undefined;
}

export interface MundoDocker {
  engineProntaEm: number | null;
  desktopStatus: string;
  containers: MundoContainers;
  upFalha: 'porta' | null;
  tempoEngineMs: number;
  atrasoMs: number;
}

export const TODOS_NO_AR: MundoContainers = {
  slskd: { estado: 'running', saude: 'healthy' },
  soulbeet: { estado: 'running', saude: 'healthy' },
  navidrome: { estado: 'running', saude: 'healthy' },
};

export const ENV_VALIDO: Record<string, string> = {
  PUID: '1000',
  PGID: '1000',
  TZ: 'America/Sao_Paulo',
  DOWNLOADS_DIR: './downloads',
  INCOMPLETE_DIR: './incomplete',
  MUSIC_DIR: './music',
  SLSK_USERNAME: 'dj_teste',
  SLSK_PASSWORD: 'senha-teste-123',
  SLSKD_WEB_USER: 'admin',
  SLSKD_WEB_PASSWORD: 'outra-senha-456',
  SOULBEET_SECRET_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef',
  SLSKD_API_KEY_SOULBEET: 'abcdef0123456789abcdef0123456789',
};

export interface Ambiente {
  raiz: string;
  projeto: string;
  dados: string;
  estado: string;
  /** altera o "mundo" do docker falso (o que aconteceu por fora do app) */
  mudarMundo(parcial: Partial<MundoDocker> | ((m: MundoDocker) => Partial<MundoDocker>)): void;
  lerMundo(): MundoDocker;
  chamadas(): string[];
  limpar(): void;
}

export function criarAmbiente(
  opcoes: {
    mundo?: Partial<MundoDocker>;
    env?: Record<string, string>;
    semProjeto?: boolean;
    /** Fase 3: copia o baixar-lista.ps1 de verdade (e o modelo de lista) para a pasta do Soulcrate */
    comScript?: boolean;
    /** nome da pasta do Soulcrate (padrão: projeto); com espaço e acento, para pegar o pior caso */
    nomeDaPasta?: string;
  } = {},
): Ambiente {
  const raiz = mkdtempSync(join(tmpdir(), 'sc-e2e-'));
  const projeto = join(raiz, opcoes.nomeDaPasta ?? 'projeto');
  const dados = join(raiz, 'dados');
  const estado = join(raiz, 'docker-mundo.json');
  mkdirSync(dados, { recursive: true });

  if (!opcoes.semProjeto) {
    mkdirSync(join(projeto, 'slskd'), { recursive: true });
    for (const p of ['downloads', 'incomplete', 'music']) mkdirSync(join(projeto, p), { recursive: true });
    writeFileSync(join(projeto, 'docker-compose.yml'), 'name: soulcrate\nservices: {}\n');
    writeFileSync(join(projeto, 'VERSION'), '1.0.0\n');
    const env = { ...ENV_VALIDO, ...opcoes.env };
    writeFileSync(
      join(projeto, '.env'),
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n',
    );
    writeFileSync(
      join(projeto, 'slskd', 'slskd.yml'),
      `web:\n  authentication:\n    api_keys:\n      soulbeet:\n        key: ${ENV_VALIDO.SLSKD_API_KEY_SOULBEET}\n        role: ReadWrite\n`,
    );
    if (opcoes.comScript) {
      for (const f of ['baixar-lista.ps1', 'baixar-lista.lib.ps1', 'lista.exemplo.txt']) {
        copyFileSync(join(REPO_DIR, f), join(projeto, f));
      }
    }
  }

  const inicial: MundoDocker = {
    engineProntaEm: 0,
    desktopStatus: 'running',
    containers: {},
    upFalha: null,
    tempoEngineMs: 1500,
    atrasoMs: 0,
    ...opcoes.mundo,
  };
  writeFileSync(estado, JSON.stringify(inicial, null, 2));

  const ler = (): MundoDocker => JSON.parse(readFileSync(estado, 'utf8')) as MundoDocker;
  return {
    raiz,
    projeto,
    dados,
    estado,
    lerMundo: ler,
    mudarMundo(parcial) {
      const atual = ler();
      const novo = typeof parcial === 'function' ? parcial(atual) : parcial;
      writeFileSync(estado, JSON.stringify({ ...atual, ...novo }, null, 2));
    },
    chamadas() {
      try {
        return readFileSync(`${estado}.chamadas`, 'utf8').split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
    limpar() {
      rmSync(raiz, { recursive: true, force: true });
    },
  };
}

export interface AppAberto {
  app: ElectronApplication;
  janela: Page;
}

export async function abrirApp(amb: Ambiente, extras: Record<string, string> = {}): Promise<AppAberto> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  Object.assign(env, {
    SOULCRATE_DIR: amb.projeto,
    SOULCRATE_USER_DATA: amb.dados,
    SOULCRATE_DOCKER_DUBLE: DUBLE,
    SOULCRATE_DUBLE_ESTADO: amb.estado,
    SOULCRATE_HTTP_DUBLE: '1',
    // isola a pasta padrão (%USERPROFILE%\Soulcrate) e a pasta do repositório da máquina de quem testa
    USERPROFILE: amb.raiz,
    SOULCRATE_SEM_DEV: '1',
    ...extras,
  });
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [APP_DIR], env, cwd: APP_DIR });
  // os testes nunca abrem o navegador de verdade: shell.openExternal só registra o endereço
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __abertosFora: string[] };
    g.__abertosFora = [];
    shell.openExternal = (url: string) => {
      g.__abertosFora.push(url);
      return Promise.resolve();
    };
  });
  const janela = await app.firstWindow();
  await janela.waitForLoadState('domcontentloaded');
  return { app, janela };
}

/** Endereços que o app mandou abrir no navegador do sistema (shell.openExternal), na ordem. */
export function abertosFora(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __abertosFora: string[] }).__abertosFora);
}

// ---------------------------------------------------------------- Fase 3: o lote de verdade contra um slskd falso

export interface ArquivoRemoto {
  usuario: string;
  /** caminho remoto, como o slskd o mostra: `@@a\Music\Azyr\Azyr - No Escape.flac` */
  arquivo: string;
  bitrate?: number;
}

export interface SlskdFalso {
  url: string;
  porta: number;
  fechar(): Promise<void>;
}

/**
 * O slskd falso da suíte do script (tests/dubles/slskd-falso.mjs): responde às buscas com o catálogo e "baixa" gravando
 * arquivos vazios na pasta downloads/ do Soulcrate de teste. A busca de teste do script ("daft punk") precisa de
 * resposta, senão toda faixa sem resposta vira "bloqueio do servidor".
 */
export async function iniciarSlskdFalso(
  amb: Ambiente,
  arquivos: ArquivoRemoto[],
  extras: { usuariosLentos?: string[] } = {},
): Promise<SlskdFalso> {
  const catalogo = join(amb.raiz, 'catalogo-slskd.json');
  const todos = [...arquivos, { usuario: 'canario', arquivo: '@@c\\Music\\Daft Punk\\Daft Punk - One More Time.flac' }];
  writeFileSync(
    catalogo,
    JSON.stringify({
      arquivos: todos,
      usuariosLentos: extras.usuariosLentos ?? [],
      usuariosComErro: [],
      compartilhados: 10,
    }),
  );
  const filho: ChildProcess = spawn(
    process.execPath,
    [
      SLSKD_FALSO,
      '--catalogo',
      catalogo,
      '--downloads',
      join(amb.projeto, 'downloads'),
      '--chave',
      ENV_VALIDO.SLSKD_API_KEY_SOULBEET as string,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  const porta = await new Promise<number>((resolve, reject) => {
    let saida = '';
    const t = setTimeout(() => reject(new Error('o slskd falso não subiu a tempo')), 15_000);
    filho.stdout?.on('data', (d: Buffer) => {
      saida += d.toString('utf8');
      const m = /\{"porta":\s*(\d+)\}/.exec(saida);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    filho.stderr?.on('data', (d: Buffer) => process.stderr.write(`slskd-falso: ${d.toString('utf8')}`));
    filho.once('exit', (c) => reject(new Error(`o slskd falso saiu com o código ${String(c)}`)));
  });
  return {
    url: `http://127.0.0.1:${porta}`,
    porta,
    fechar: () =>
      new Promise((resolve) => {
        if (filho.exitCode !== null) return resolve();
        filho.once('exit', () => resolve());
        filho.kill();
      }),
  };
}

/**
 * Variáveis de ambiente do app para os testes do lote: o slskd falso no lugar do real, as notificações numa lista
 * que o teste confere e um `docker` que sempre falha no PATH dos scripts (o baixar-lista.ps1 chama o `docker` de
 * verdade para ler a biblioteca do beets; aqui "o Docker não está disponível" e nada toca em nenhuma stack).
 */
export function ambienteDoLote(amb: Ambiente, slskd: SlskdFalso): Record<string, string> {
  const bin = join(amb.raiz, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'docker.cmd'), '@echo off\r\nexit /b 1\r\n');
  return {
    SOULCRATE_SLSKD_URL: slskd.url,
    SOULCRATE_DUBLE_NOTIFICACOES: '1',
    PATH: `${bin};${process.env.PATH ?? ''}`,
  };
}

export interface NotificacaoVista {
  titulo: string;
  corpo: string;
}

/** Notificações que o app "mostrou" (o dublê as guarda em vez de abrir o toast do Windows). */
export function notificacoes(app: ElectronApplication): Promise<NotificacaoVista[]> {
  return app.evaluate(() => (globalThis as unknown as { __notificacoes?: NotificacaoVista[] }).__notificacoes ?? []);
}

/** Troca o `shell.openPath` por um registro dos caminhos que o app mandou abrir (nenhum Bloco de Notas na tela). */
export async function registrarAberturas(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __abertos: string[] };
    g.__abertos = [];
    shell.openPath = (caminho: string) => {
      g.__abertos.push(caminho);
      return Promise.resolve('');
    };
  });
}

export function abertos(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __abertos?: string[] }).__abertos ?? []);
}

/**
 * Fecha o app sem esperar os pipes: o lote destacado herda do Electron o stdout e o stderr que o Playwright abriu
 * (o Electron os herda do Playwright e o PowerShell os repassa ao lote), então `app.close()` só voltaria quando o lote
 * terminasse. Fora dos testes não há esse pipe (o app é aberto pelo menu Iniciar) e fechar o app nunca espera o lote.
 */
export async function fecharApp(app: ElectronApplication, limiteMs = 20_000): Promise<void> {
  const processo = app.process();
  const saiu = new Promise<void>((resolve) => {
    if (processo.exitCode !== null) return resolve();
    processo.once('exit', () => resolve());
  });
  void app.evaluate(({ app: a }) => a.quit()).catch(() => undefined);
  await Promise.race([saiu, new Promise((r) => setTimeout(r, limiteMs))]);
  if (processo.exitCode === null) processo.kill();
}

// ---------------------------------------------------------------- Fases 3 e 4: o que os testes do lote repetem

/** Cria o arquivo-sinal de qualquer lote ainda vivo no ambiente e espera as travas sumirem. */
export async function pararLotesRodando(a: Ambiente | undefined): Promise<void> {
  if (!a) return;
  const lotes = join(a.projeto, 'lotes');
  if (!existsSync(lotes)) return;
  for (const f of readdirSync(lotes)) {
    const m = /^estado-.+\.lock$/.exec(f);
    if (!m) continue;
    const id = readFileSync(join(lotes, f), 'utf8').split('\t')[2]?.trim();
    if (id) writeFileSync(join(lotes, `parar-${id}.flag`), 'x');
  }
  for (let i = 0; i < 30 && readdirSync(lotes).some((f) => f.endsWith('.lock')); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  // o que não parou com o arquivo-sinal (o script preso numa espera) é encerrado à força: é só um teste
  for (const f of readdirSync(lotes).filter((n) => n.endsWith('.lock'))) {
    const pid = Number(readFileSync(join(lotes, f), 'utf8').split('\t')[0]);
    if (pid > 0) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  }
  await new Promise((r) => setTimeout(r, 500));
}

export const abrirListaDosRecentes = async (janela: Page, nome: string) => {
  await janela.getByRole('link', { name: 'Baixar lista' }).click();
  await janela
    .getByTestId('lista-recentes')
    .getByRole('button', { name: new RegExp(nome.replace('.', '\\.')) })
    .click();
  await expect(janela.getByTestId('nome-da-lista')).toHaveText(nome);
};

/** Sem MusicBrainz (não há rede nos testes) e sem beets (não há stack): "Só baixar" + "Não conferir os títulos". */
export const opcoesDeTeste = async (janela: Page) => {
  await janela.getByRole('link', { name: 'Revisar opções' }).click();
  await janela.locator('[data-receita="soBaixar"]').click();
  await janela.getByRole('switch', { name: /Não conferir os títulos no MusicBrainz/ }).click();
};
