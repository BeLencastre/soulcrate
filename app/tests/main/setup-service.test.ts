import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MainEvent } from '../../src/shared/ipc';
import type { SetupEstado, TarefaSetup } from '../../src/shared/configuracao';
import { criarErro, type AppError } from '../../src/shared/erros';
import { statusInicial, type StackStatus } from '../../src/shared/stack';
import {
  formatarDuracao,
  portaAceitaConexao,
  SetupService,
  type DependenciasSetup,
} from '../../src/main/services/setup-service';
import {
  iniciarNavidromeFalso,
  iniciarSoulbeetFalso,
  type NavidromeFalso,
  type SoulbeetFalso,
} from '../dubles/servicos-falsos';

const CHAVE = 'c'.repeat(64);
let dir: string;
let navidrome: NavidromeFalso;
let soulbeet: SoulbeetFalso;
const fechar: (() => Promise<void>)[] = [];

function noAr(saudavel = true): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    servicos: base.servicos.map((s) => ({
      ...s,
      container: 'running',
      saude: saudavel ? 'healthy' : 'unhealthy',
      http: saudavel,
      statusTexto: 'Up',
    })),
  };
}

function escreverEnv(extra: Record<string, string> = {}): void {
  const v: Record<string, string> = {
    SLSKD_WEB_USER: 'dj',
    SLSKD_WEB_PASSWORD: 'senha-do-dj',
    SLSKD_API_KEY_SOULBEET: CHAVE,
    ...extra,
  };
  writeFileSync(
    join(dir, '.env'),
    Object.entries(v)
      .map(([k, x]) => `${k}=${x}`)
      .join('\n'),
  );
}

interface Falsos {
  ligacoes: { rebuild?: boolean }[];
  erroAoLigar: AppError | null;
  status: StackStatus;
  portaAberta: boolean;
  eventos: SetupEstado[];
  tempo: { agora: number };
}

function montar(extra: Partial<DependenciasSetup> = {}): { servico: SetupService; f: Falsos } {
  const f: Falsos = {
    ligacoes: [],
    erroAoLigar: null,
    status: noAr(),
    portaAberta: true,
    eventos: [],
    tempo: { agora: 1_000_000 },
  };
  const servico = new SetupService({
    operacoes: {
      ligar: (o) => {
        f.ligacoes.push(o);
        f.tempo.agora += 7 * 60_000 + 12_000; // o "primeiro build"
        return {};
      },
      aguardar: () => Promise.resolve(f.erroAoLigar),
    },
    health: {
      get atual() {
        return f.status;
      },
      atualizar: () => Promise.resolve(f.status),
    },
    projeto: () => ({ dir, origem: 'configurada' }),
    lerArquivo: (p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    },
    urls: { navidrome: navidrome.url, soulbeet: soulbeet.url },
    portaAceitaConexao: () => Promise.resolve(f.portaAberta),
    emitir: (e: MainEvent) => {
      if (e.type === 'setup.state') f.eventos.push(e.estado);
    },
    agora: () => f.tempo.agora,
    dormir: () => {
      f.tempo.agora += 2000;
      return Promise.resolve();
    },
    esperaServicosMs: 60_000,
    esperaDownloaderMs: 10_000,
    ...extra,
  });
  return { servico, f };
}

const tarefa = (e: SetupEstado, id: TarefaSetup['id']) => e.tarefas.find((t) => t.id === id) as TarefaSetup;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sc-setup-'));
  mkdirSync(join(dir, 'slskd'));
  navidrome = await iniciarNavidromeFalso();
  soulbeet = await iniciarSoulbeetFalso(navidrome);
  fechar.push(navidrome.fechar, soulbeet.fechar);
  escreverEnv();
});
afterEach(async () => {
  await Promise.all(fechar.splice(0).map((f) => f()));
  rmSync(dir, { recursive: true, force: true });
});

describe('formatarDuracao', () => {
  it.each([
    [48_000, '48 s'],
    [432_000, '7 min 12 s'],
    [60_000, '1 min 0 s'],
    [0, '0 s'],
  ])('%d ms → %s', (ms, texto) => {
    expect(formatarDuracao(ms)).toBe(texto);
  });
});

describe('SetupService: o caminho feliz', () => {
  it('liga a stack, cria o admin do Navidrome, configura o Soulbeet e confere a porta', async () => {
    const { servico, f } = montar();
    servico.iniciar({ modo: 'ligar', detalheGravacao: 'backup .env.bak-2026-10-07' });
    const e = await servico.aguardar();

    expect(e.terminou).toBe(true);
    expect(e.rodando).toBe(false);
    expect(e.tarefas.map((t) => [t.id, t.estado])).toEqual([
      ['gravar', 'feito'],
      ['stack', 'feito'],
      ['navidrome', 'feito'],
      ['soulbeet', 'feito'],
      ['porta', 'feito'],
    ]);
    expect(tarefa(e, 'gravar').detalhe).toBe('backup .env.bak-2026-10-07');
    expect(tarefa(e, 'stack').detalhe).toBe('primeiro build: 7 min 12 s');
    expect(f.ligacoes).toEqual([{ rebuild: false }]);

    // o Navidrome ganhou o administrador com o usuário e a senha da Web UI
    expect(navidrome.usuarios.get('dj')).toBe('senha-do-dj');
    // o Soulbeet recebeu a URL do slskd (nome do contêiner), a MESMA chave do .env e a pasta /music
    expect(soulbeet.config).toEqual({ slskd_url: 'http://slskd:5030', slskd_api_key: CHAVE });
    expect(soulbeet.pastas.map((p) => p.path)).toEqual(['/music']);
  });

  it('emite o estado a cada mudança, na ordem das tarefas', async () => {
    const { servico, f } = montar();
    servico.iniciar({ modo: 'ligar' });
    await servico.aguardar();
    const agora = f.eventos.flatMap((e) => e.tarefas.filter((t) => t.estado === 'agora').map((t) => t.id));
    expect([...new Set(agora)]).toEqual(['stack', 'navidrome', 'soulbeet', 'porta']);
    expect(f.eventos.at(-1)?.terminou).toBe(true);
  });

  it('rodar de novo é idempotente: não duplica a pasta /music nem cria outro administrador', async () => {
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    await servico.aguardar();
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(e.tarefas.every((t) => t.estado === 'feito')).toBe(true);
    expect(soulbeet.pastas).toHaveLength(1);
    expect(navidrome.usuarios.size).toBe(1);
    expect(tarefa(e, 'navidrome').detalhe).toBe('já havia um administrador');
  });

  it('modo recriar (Aplicar e reiniciar) força a recriação dos contêineres', async () => {
    const { servico, f } = montar();
    servico.iniciar({ modo: 'recriar' });
    const e = await servico.aguardar();
    expect(f.ligacoes).toEqual([{ rebuild: true }]);
    expect(tarefa(e, 'stack').detalhe).toBe('reinício: 7 min 12 s');
  });

  it('a chave nova do .env chega ao Soulbeet (trocar a chave e rodar de novo)', async () => {
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    await servico.aguardar();
    escreverEnv({ SLSKD_API_KEY_SOULBEET: 'd'.repeat(64) });
    servico.iniciar({ modo: 'recriar' });
    await servico.aguardar();
    expect(soulbeet.config.slskd_api_key).toBe('d'.repeat(64));
  });

  it('sem a chave no .env, usa a do slskd.yml', async () => {
    escreverEnv({ SLSKD_API_KEY_SOULBEET: '' });
    writeFileSync(
      join(dir, 'slskd', 'slskd.yml'),
      `web:\n  authentication:\n    api_keys:\n      soulbeet:\n        key: "${'e'.repeat(40)}"\n`,
    );
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    await servico.aguardar();
    expect(soulbeet.config.slskd_api_key).toBe('e'.repeat(40));
  });
});

describe('SetupService: quando algo não vai bem', () => {
  it('a stack não liga: para na primeira tarefa e o resto fica na fila', async () => {
    const { servico, f } = montar();
    f.erroAoLigar = criarErro('porta.em-uso', { porta: '5030' });
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'stack').estado).toBe('erro');
    expect(tarefa(e, 'stack').erro?.codigo).toBe('porta.em-uso');
    expect(['navidrome', 'soulbeet', 'porta'].map((id) => tarefa(e, id as TarefaSetup['id']).estado)).toEqual([
      'depois',
      'depois',
      'depois',
    ]);
    expect(navidrome.chamadas).toEqual([]);
  });

  it('os serviços não ficam saudáveis a tempo: erro citando quem não responde', async () => {
    const { servico, f } = montar();
    f.status = noAr(false);
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'stack').estado).toBe('erro');
    expect(tarefa(e, 'stack').erro?.codigo).toBe('servico.inacessivel');
    expect(tarefa(e, 'stack').erro?.titulo).toContain('slskd');
  });

  it('o Navidrome já tem outro administrador: pede o login e depois segue com ele', async () => {
    await navidrome.fechar();
    navidrome = await iniciarNavidromeFalso({ adminExistente: { usuario: 'antigo', senha: 'senha-antiga' } });
    soulbeet = await iniciarSoulbeetFalso(navidrome);
    fechar.push(navidrome.fechar, soulbeet.fechar);
    const { servico } = montar();

    servico.iniciar({ modo: 'ligar' });
    let e = await servico.aguardar();
    expect(tarefa(e, 'navidrome').estado).toBe('precisa-login');
    expect(tarefa(e, 'soulbeet').estado).toBe('depois');
    expect(navidrome.usuarios.has('dj')).toBe(false); // não cria um segundo administrador

    servico.informarLoginNavidrome({ usuario: 'antigo', senha: 'senha-antiga' });
    e = await servico.aguardar();
    expect(e.tarefas.map((t) => t.estado)).toEqual(['feito', 'feito', 'feito', 'feito', 'feito']);
    expect(soulbeet.config.slskd_api_key).toBe(CHAVE);
  });

  it('login errado do administrador antigo: continua pedindo', async () => {
    await navidrome.fechar();
    navidrome = await iniciarNavidromeFalso({ adminExistente: { usuario: 'antigo', senha: 'senha-antiga' } });
    soulbeet = await iniciarSoulbeetFalso(navidrome);
    fechar.push(navidrome.fechar, soulbeet.fechar);
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    await servico.aguardar();
    servico.informarLoginNavidrome({ usuario: 'antigo', senha: 'errada' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'navidrome').estado).toBe('precisa-login');
  });

  it('o Navidrome não responde (porta fechada): erro de serviço inacessível, sem derrubar o app', async () => {
    await navidrome.fechar();
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'navidrome').estado).toBe('erro');
    expect(tarefa(e, 'navidrome').erro?.codigo).toBe('servico.inacessivel');
    expect(tarefa(e, 'soulbeet').estado).toBe('depois');
  });

  it('"Tentar de novo" recomeça da tarefa que falhou, sem religar a stack', async () => {
    let navidromeCaido = true;
    const { servico, f } = montar({
      http: (url, init) =>
        navidromeCaido && String(url).startsWith(navidrome.url)
          ? Promise.reject(new Error('ECONNREFUSED'))
          : fetch(url, init),
    });
    servico.iniciar({ modo: 'ligar' });
    expect(tarefa(await servico.aguardar(), 'navidrome').estado).toBe('erro');
    navidromeCaido = false;
    servico.tentarDeNovo();
    const e = await servico.aguardar();
    expect(f.ligacoes).toHaveLength(1);
    expect(tarefa(e, 'navidrome').estado).toBe('feito');
    expect(tarefa(e, 'soulbeet').estado).toBe('feito');
  });

  it('o Soulbeet ainda não enxerga o slskd: grava tudo e avisa, sem marcar erro', async () => {
    soulbeet.saudeOffline.restantes = 9999;
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'soulbeet').estado).toBe('aviso');
    expect(tarefa(e, 'soulbeet').detalhe).toContain('slskd');
    expect(tarefa(e, 'porta').estado).toBe('feito');
  });

  it('o Soulbeet passa a enxergar o slskd depois de algumas tentativas', async () => {
    soulbeet.saudeOffline.restantes = 2;
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    expect(tarefa(await servico.aguardar(), 'soulbeet').estado).toBe('feito');
  });

  it('.env sem usuário ou senha da Web UI: erro de configuração, nenhuma chamada', async () => {
    escreverEnv({ SLSKD_WEB_PASSWORD: '' });
    const { servico } = montar();
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'navidrome').estado).toBe('erro');
    expect(tarefa(e, 'navidrome').erro?.codigo).toBe('config.invalida');
    expect(navidrome.chamadas).toEqual([]);
  });

  it('nenhuma senha nem chave aparece no estado nem nos erros que vão para o renderer', async () => {
    escreverEnv({ SLSKD_WEB_PASSWORD: '' });
    const a = montar();
    a.servico.iniciar({ modo: 'ligar' });
    await a.servico.aguardar();
    await navidrome.fechar();
    escreverEnv();
    const b = montar();
    b.servico.iniciar({ modo: 'ligar' });
    await b.servico.aguardar();
    for (const x of [a, b]) {
      const json = JSON.stringify(x.f.eventos);
      expect(json).not.toContain('senha-do-dj');
      expect(json).not.toContain(CHAVE);
    }
  });

  it('chamadas simultâneas a iniciar() não rodam duas vezes', async () => {
    const { servico, f } = montar();
    servico.iniciar({ modo: 'ligar' });
    servico.iniciar({ modo: 'ligar' });
    await servico.aguardar();
    expect(f.ligacoes).toHaveLength(1);
  });
});

describe('porta 2234', () => {
  it('com a stack no ar e a porta atendendo: escutando', async () => {
    const { servico } = montar();
    expect(await servico.verificarPorta()).toEqual({ porta: 2234, estado: 'escutando', stackNoAr: true });
  });

  it('com a stack no ar e nada atendendo: livre (o Docker não publicou)', async () => {
    const { servico, f } = montar();
    f.portaAberta = false;
    expect((await servico.verificarPorta()).estado).toBe('livre');
    servico.iniciar({ modo: 'ligar' });
    const e = await servico.aguardar();
    expect(tarefa(e, 'porta').estado).toBe('aviso');
    expect(tarefa(e, 'porta').detalhe).toContain('2234');
  });

  it('com a stack desligada e a porta atendendo: ocupada por outro programa', async () => {
    const { servico, f } = montar();
    f.status = statusInicial();
    expect(await servico.verificarPorta()).toEqual({ porta: 2234, estado: 'ocupada', stackNoAr: false });
  });
});

describe('portaAceitaConexao (TCP de verdade)', () => {
  it('detecta uma porta aberta e uma fechada', async () => {
    const server = createServer((s) => s.end());
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
    const porta = (server.address() as { port: number }).port;
    expect(await portaAceitaConexao(porta)).toBe(true);
    await new Promise((ok) => server.close(ok));
    expect(await portaAceitaConexao(porta)).toBe(false);
  });
});
