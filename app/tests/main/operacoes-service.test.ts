import { describe, expect, it, vi } from 'vitest';
import type { MainEvent } from '../../src/shared/ipc';
import { DockerService } from '../../src/main/services/docker-service';
import { HealthService } from '../../src/main/services/health-service';
import { OperacoesService } from '../../src/main/services/operacoes-service';
import type { ConfigStatus, ProjetoStatus } from '../../src/shared/stack';
import { ate, ExecutorFalso, FALHA, NAO_EXISTE, OK, type ProcessoFalso, type Respondedor } from './ajudantes';

const CONFIG_OK: ConfigStatus = { estado: 'valida', erros: 0, avisos: 0, achados: [] };
const CONFIG_RUIM: ConfigStatus = {
  estado: 'invalida',
  erros: 2,
  avisos: 0,
  achados: [
    {
      id: 'ENV_EXEMPLO',
      nivel: 'erro',
      arquivo: '.env',
      variavel: 'SLSK_PASSWORD',
      mensagem: 'SLSK_PASSWORD ainda tem o valor de exemplo do .env.example.',
    },
    { id: 'ENV_VAZIA', nivel: 'erro', arquivo: '.env', variavel: 'TZ', mensagem: 'TZ está vazia ou faltando.' },
  ],
};

interface Cenario {
  engine?: boolean;
  instalacao?: 'ok' | 'ausente' | 'fora-do-path';
  projeto?: ProjetoStatus;
  config?: ConfigStatus;
  responder?: Respondedor;
}

/** Executor falso + serviços reais (DockerService, HealthService, OperacoesService) ligados como no app. */
function montar(c: Cenario = {}) {
  const engine = c.engine ?? true;
  const instalacao = c.instalacao ?? 'ok';
  const executor = new ExecutorFalso((cmd, args, op) => {
    if (c.responder) {
      const r = c.responder(cmd, args, op);
      if (r) return r;
    }
    if (instalacao !== 'ok') return NAO_EXISTE;
    if (args[0] === 'version') return engine ? OK('29.0.0') : FALHA('failed to connect to the docker API');
    if (args[0] === 'compose' && args[1] === 'version') return OK('5.0.0');
    if (args[0] === 'desktop') return OK('{"Status":"stopped"}');
    if (args.includes('ps')) return OK('');
    return undefined;
  });
  let relogio = 0;
  const docker = new DockerService({
    executor,
    existe: () => instalacao === 'fora-do-path',
    abrirExecutavel: async () => '',
    programFiles: 'C:\\Program Files',
    dormir: async (ms) => void (relogio += ms),
    agora: () => relogio,
  });
  const projeto = c.projeto ?? { dir: 'C:\\Soulcrate', origem: 'configurada' as const };
  const config = c.config ?? CONFIG_OK;
  const health = new HealthService({
    docker,
    projeto: () => projeto,
    validarConfig: () => config,
    sondar: async () => true,
    agora: () => 1,
  });
  const eventos: MainEvent[] = [];
  let n = 0;
  const op = new OperacoesService({
    docker,
    health,
    projeto: () => projeto,
    validarConfig: () => config,
    emitir: (e) => eventos.push(e),
    novoId: () => `op-${++n}`,
    agora: () => relogio,
  });
  const fim = () => eventos.find((e): e is Extract<MainEvent, { type: 'operation.end' }> => e.type === 'operation.end');
  const logs = () =>
    eventos.filter((e): e is Extract<MainEvent, { type: 'operation.log' }> => e.type === 'operation.log');
  const processo = (): ProcessoFalso => {
    const p = executor.processos[0];
    if (!p) throw new Error('Nenhum processo foi iniciado.');
    return p;
  };
  return { op, health, executor, eventos, fim, logs, processo };
}

describe('OperacoesService.ligar', () => {
  it('caminho feliz: valida, roda o compose up, transmite o log e termina ok', async () => {
    const m = montar();
    const r = m.op.ligar();
    expect(r).toEqual({ id: 'op-1', tipo: 'ligar' });
    expect(m.eventos[0]).toEqual({ type: 'operation.start', id: 'op-1', tipo: 'ligar' });

    await ate(() => m.executor.processos.length === 1);
    expect(m.executor.chamadas.at(-1)).toBe('docker compose --progress plain up -d --build');
    expect(m.health.atual.operacao).toBe('ligando');

    m.processo().finalizar(OK());
    await ate(() => m.fim() !== undefined);
    expect(m.fim()).toEqual({ type: 'operation.end', id: 'op-1', ok: true });
    expect(m.health.atual.operacao).toBeNull();
    expect(m.logs().map((l) => l.line)).toContain('Conferindo o .env e o slskd.yml…');
    expect(m.logs().map((l) => l.line)).toContain('Configuração conferida.');
  });

  it('detecta "plugins ok" e "lastgenre ok" nas linhas do build', async () => {
    const m = montar({
      responder: (_c, args) =>
        args.includes('up')
          ? {
              codigo: 0,
              stdout: '#12 4.5 plugins ok - beets 2.11.0\n#12 4.9 lastgenre ok\n => outra linha',
              stderr: '',
            }
          : undefined,
    });
    m.op.ligar();
    await ate(() => m.fim() !== undefined);
    const marcadores = m
      .logs()
      .filter((l) => l.marcador)
      .map((l) => [l.line, l.marcador]);
    expect(marcadores).toEqual([
      ['#12 4.5 plugins ok - beets 2.11.0', 'plugins ok'],
      ['#12 4.9 lastgenre ok', 'lastgenre ok'],
    ]);
    expect(m.fim()?.ok).toBe(true);
  });

  it('reconstruir passa --force-recreate e mostra "reconstruindo"', async () => {
    const m = montar();
    expect(m.op.ligar({ rebuild: true }).tipo).toBe('reconstruir');
    await ate(() => m.executor.processos.length === 1);
    expect(m.executor.chamadas.at(-1)).toContain('--force-recreate');
    expect(m.health.atual.operacao).toBe('reconstruindo');
    m.processo().finalizar(OK());
    await ate(() => m.fim() !== undefined);
  });

  it('configuração inválida: não chama o Docker e explica o que falta (S4)', async () => {
    const m = montar({ config: CONFIG_RUIM });
    m.op.ligar();
    await ate(() => m.fim() !== undefined);
    const fim = m.fim();
    expect(fim?.ok).toBe(false);
    expect(fim?.error?.codigo).toBe('config.invalida');
    expect(fim?.error?.mensagem).toContain('2 problemas');
    expect(fim?.error?.detalhes).toContain('ENV_EXEMPLO');
    expect(m.executor.processos).toHaveLength(0);
    expect(m.executor.chamadas.some((c) => c.includes(' up '))).toBe(false);
  });

  it('só avisos na configuração: segue em frente', async () => {
    const m = montar({
      config: {
        estado: 'valida',
        erros: 0,
        avisos: 1,
        achados: [
          { id: 'CHAVE_CURTA', nivel: 'aviso', arquivo: '.env', variavel: 'SOULBEET_SECRET_KEY', mensagem: 'curta' },
        ],
      },
    });
    m.op.ligar();
    await ate(() => m.executor.processos.length === 1);
    m.processo().finalizar(OK());
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.ok).toBe(true);
    expect(m.logs().some((l) => l.line.startsWith('[aviso]'))).toBe(true);
  });

  it('Docker ausente, fora do PATH ou fechado: erro do catálogo, sem rodar o compose', async () => {
    for (const [cenario, codigo] of [
      [{ instalacao: 'ausente' as const }, 'docker.ausente'],
      [{ instalacao: 'fora-do-path' as const }, 'docker.fora-do-path'],
      [{ engine: false }, 'docker.fechado'],
    ] as const) {
      const m = montar(cenario);
      m.op.ligar();
      await ate(() => m.fim() !== undefined);
      expect(m.fim()?.error?.codigo, codigo).toBe(codigo);
      expect(m.executor.processos).toHaveLength(0);
    }
  });

  it('sem pasta do Soulcrate: pede a pasta', async () => {
    const m = montar({ projeto: { dir: null, origem: null } });
    m.op.ligar();
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.error?.codigo).toBe('projeto.ausente');
  });

  it('porta em uso: erro específico com a porta, e os detalhes vão sem segredos', async () => {
    const m = montar({
      responder: (_c, args) =>
        args.includes('up')
          ? {
              codigo: 1,
              stdout: '',
              stderr:
                'SLSK_PASSWORD=senha-secreta-123\nError response from daemon: ports are not available: exposing port TCP 127.0.0.1:5030 -> 127.0.0.1:0: listen tcp 127.0.0.1:5030: bind: Only one usage of each socket address',
            }
          : undefined,
    });
    m.op.ligar();
    await ate(() => m.fim() !== undefined);
    const e = m.fim()?.error;
    expect(e?.codigo).toBe('porta.em-uso');
    expect(e?.titulo).toBe('A porta 5030 já está em uso');
    expect(e?.detalhes).not.toContain('senha-secreta-123');
    expect(m.health.atual.operacao).toBeNull();
  });

  it('falha genérica do compose: "Não consegui ligar a stack" com as últimas linhas nos detalhes', async () => {
    const m = montar({
      responder: (_c, args) =>
        args.includes('up') ? { codigo: 1, stdout: '', stderr: 'no space left on device' } : undefined,
    });
    m.op.ligar();
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.error?.codigo).toBe('operacao.falhou');
    expect(m.fim()?.error?.titulo).toBe('Não consegui ligar a stack');
    expect(m.fim()?.error?.detalhes).toContain('no space left on device');
  });

  it('o Docker caiu no meio do `up`: vira "Docker fechado"', async () => {
    const m = montar({
      responder: (_c, args) =>
        args.includes('up')
          ? { codigo: 1, stdout: '', stderr: 'error during connect: open //./pipe/dockerDesktopLinuxEngine' }
          : undefined,
    });
    m.op.ligar();
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.error?.codigo).toBe('docker.fechado');
  });

  it('só uma operação por vez: o segundo pedido acompanha a que já roda', async () => {
    const m = montar();
    const a = m.op.ligar();
    const b = m.op.desligar();
    expect(b).toEqual(a);
    expect(m.eventos.filter((e) => e.type === 'operation.start')).toHaveLength(1);
    await ate(() => m.executor.processos.length === 1);
    m.processo().finalizar(OK());
    await ate(() => m.fim() !== undefined);
    // terminou: já dá para começar outra
    expect(m.op.emAndamento).toBeNull();
    expect(m.op.desligar().tipo).toBe('desligar');
  });

  it('cancelar (ao sair do app) encerra o processo em andamento', async () => {
    const m = montar();
    m.op.ligar();
    await ate(() => m.executor.processos.length === 1);
    m.op.cancelar();
    expect(m.processo().encerrado).toBe(true);
    await ate(() => m.fim() !== undefined);
  });
});

describe('OperacoesService: desligar, reiniciar e abrir o Docker Desktop', () => {
  it('desligar roda `compose down` sem validar a configuração', async () => {
    const m = montar({ config: CONFIG_RUIM });
    m.op.desligar();
    await ate(() => m.executor.processos.length === 1);
    expect(m.executor.chamadas.at(-1)).toBe('docker compose --progress plain down');
    expect(m.health.atual.operacao).toBe('desligando');
    m.processo().finalizar(OK());
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.ok).toBe(true);
  });

  it('reiniciar um serviço roda `compose restart <serviço>` sem mudar o estado da stack', async () => {
    const m = montar();
    m.op.reiniciar('slskd');
    await ate(() => m.executor.processos.length === 1);
    expect(m.executor.chamadas.at(-1)).toBe('docker compose --progress plain restart slskd');
    expect(m.health.atual.operacao).toBeNull();
    m.processo().finalizar(FALHA('boom'));
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.error?.titulo).toBe('Não consegui reiniciar o serviço');
  });

  it('abrir o Docker Desktop: mostra "abrindo", espera a engine e termina ok', async () => {
    let engine = false;
    let chamadasStart = 0;
    const m = montar({
      engine: false,
      responder: (_c, args) => {
        if (args[0] === 'version') return engine ? OK('29.0.0') : FALHA('daemon');
        if (args[0] === 'desktop' && args[1] === 'start') {
          chamadasStart++;
          engine = true;
          return OK();
        }
        return undefined;
      },
    });
    const abrindo: boolean[] = [];
    m.health.aoMudar((s) => abrindo.push(s.docker.abrindo !== null));
    expect(m.op.abrirDockerDesktop().tipo).toBe('abrir-docker');
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.ok).toBe(true);
    expect(chamadasStart).toBe(1);
    expect(abrindo).toContain(true);
    expect(m.health.atual.docker.abrindo).toBeNull();
    expect(m.health.atual.docker.engine).toBe(true);
  });

  it('abrir o Docker Desktop que não sobe em 3 min: erro "não ficou pronto"', async () => {
    const m = montar({
      engine: false,
      responder: (_c, args) => (args[0] === 'desktop' ? OK() : args[0] === 'version' ? FALHA('daemon') : undefined),
    });
    m.op.abrirDockerDesktop();
    await ate(() => m.fim() !== undefined, 5000);
    expect(m.fim()?.error?.codigo).toBe('docker.timeout');
    expect(m.health.atual.docker.abrindo).toBeNull();
  });

  it('abrir o Docker Desktop com a engine já de pé não faz nada', async () => {
    const m = montar();
    m.op.abrirDockerDesktop();
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.ok).toBe(true);
    expect(m.executor.chamadas.some((c) => c.includes('desktop start'))).toBe(false);
  });

  it('abrir o Docker Desktop sem Docker instalado: erro do catálogo', async () => {
    const m = montar({ instalacao: 'ausente' });
    m.op.abrirDockerDesktop();
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.error?.codigo).toBe('docker.ausente');
  });
});

describe('falhas inesperadas', () => {
  it('uma exceção no meio da operação vira erro "inesperado" e libera a próxima', async () => {
    const m = montar();
    const aoErro = vi.fn();
    const op = new OperacoesService({
      docker: {
        ligar: () => {
          throw new Error('boom');
        },
      } as unknown as DockerService,
      health: m.health,
      projeto: () => ({ dir: 'C:\\x', origem: 'configurada' }),
      validarConfig: () => CONFIG_OK,
      emitir: (e) => m.eventos.push(e),
      novoId: () => 'op-x',
      agora: () => 0,
      aoErro,
    });
    // a engine precisa estar de pé para chegar ao compose up
    await m.health.atualizar();
    op.ligar();
    await ate(() => m.fim() !== undefined);
    expect(m.fim()?.error?.codigo).toBe('inesperado');
    expect(m.fim()?.error?.detalhes).toContain('boom');
    expect(aoErro).toHaveBeenCalled();
    expect(op.emAndamento).toBeNull();
  });
});
