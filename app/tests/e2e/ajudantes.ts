// Ajudantes dos testes ponta a ponta: monta uma "pasta do Soulcrate" de mentira, um mundo do dublê do docker
// e abre o app (o build em out/) apontando para eles. Nenhum teste toca na stack nem nos dados reais do usuário.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const APP_DIR = join(import.meta.dirname, '..', '..');
const DUBLE = join(APP_DIR, 'tests', 'dubles', 'docker-falso.mjs');

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
  opcoes: { mundo?: Partial<MundoDocker>; env?: Record<string, string>; semProjeto?: boolean } = {},
): Ambiente {
  const raiz = mkdtempSync(join(tmpdir(), 'sc-e2e-'));
  const projeto = join(raiz, 'projeto');
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
