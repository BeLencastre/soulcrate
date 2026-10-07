import { describe, expect, it } from 'vitest';
import { DockerService, type DependenciasDocker } from '../../src/main/services/docker-service';
import { ExecutorFalso, FALHA, NAO_EXISTE, OK, type Respondedor } from './ajudantes';

const EXE = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';

function criar(responder: Respondedor, extras: Partial<DependenciasDocker> = {}) {
  const executor = new ExecutorFalso(responder);
  const abertos: string[] = [];
  let relogio = 0;
  const docker = new DockerService({
    executor,
    existe: () => false,
    abrirExecutavel: async (p) => {
      abertos.push(p);
      return '';
    },
    programFiles: 'C:\\Program Files',
    // tempo virtual: dormir avança o relógio sem esperar de verdade
    dormir: async (ms) => {
      relogio += ms;
    },
    agora: () => relogio,
    ...extras,
  });
  return { docker, executor, abertos };
}

const ENGINE_OK: Respondedor = (_c, args) => {
  if (args[0] === 'version') return OK('29.0.0\n');
  if (args[0] === 'compose' && args[1] === 'version') return OK('5.0.0\n');
  return undefined;
};

describe('DockerService.detectar (SP1)', () => {
  it('engine de pé: instalado, aberto, versões lidas, sem chamar o `docker desktop`', async () => {
    const { docker, executor } = criar(ENGINE_OK);
    expect(await docker.detectar()).toEqual({
      instalacao: 'ok',
      desktop: 'aberto',
      engine: true,
      versaoServidor: '29.0.0',
      compose: '5.0.0',
    });
    expect(executor.chamadas.some((c) => c.includes('desktop'))).toBe(false);
  });

  it('docker fora do PATH e sem o Docker Desktop: não instalado', async () => {
    const { docker } = criar(() => NAO_EXISTE);
    expect(await docker.detectar()).toMatchObject({ instalacao: 'ausente', engine: false });
  });

  it('docker fora do PATH, mas o Docker Desktop está instalado: mensagem específica', async () => {
    const { docker } = criar(() => NAO_EXISTE, { existe: (p) => p === EXE });
    expect(await docker.detectar()).toMatchObject({ instalacao: 'fora-do-path', engine: false });
  });

  it('Docker Desktop fechado: a engine não responde e o `docker desktop status` diz que parou', async () => {
    const { docker } = criar((_c, args) => {
      if (args[0] === 'version')
        return FALHA('failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine');
      if (args[0] === 'compose') return OK('5.0.0');
      if (args[0] === 'desktop') return OK('{"SessionID":"x","Status":"stopped"}');
      return undefined;
    });
    expect(await docker.detectar()).toMatchObject({
      instalacao: 'ok',
      desktop: 'fechado',
      engine: false,
      versaoServidor: null,
      compose: '5.0.0',
    });
  });

  it('Docker Desktop antigo, sem o subcomando: "desconhecido"', async () => {
    const { docker } = criar((_c, args) => {
      if (args[0] === 'desktop') return FALHA("docker: 'desktop' is not a docker command.");
      return FALHA('nope');
    });
    expect(await docker.detectar()).toMatchObject({ instalacao: 'ok', desktop: 'desconhecido', engine: false });
  });

  it('versão vazia com código 0 não conta como engine de pé', async () => {
    const { docker } = criar((_c, args) => (args[0] === 'version' ? OK('\n') : FALHA()));
    expect((await docker.detectar()).engine).toBe(false);
  });
});

describe('DockerService.abrirDockerDesktop (SP2)', () => {
  it('já está aberto: não faz nada', async () => {
    const { docker, executor } = criar(ENGINE_OK);
    expect(await docker.abrirDockerDesktop()).toBe('pronto');
    expect(executor.chamadas.some((c) => c.includes('desktop start'))).toBe(false);
  });

  it('abre com `docker desktop start --detach` e espera a engine, avisando o progresso', async () => {
    let engine = false;
    const { docker, executor } = criar((_c, args) => {
      if (args[0] === 'version') return engine ? OK('29.0.0') : FALHA('daemon');
      if (args[0] === 'desktop' && args[1] === 'start') return OK();
      return undefined;
    });
    let n = 0;
    const progresso: number[] = [];
    const r = await docker.abrirDockerDesktop({
      aoProgresso: (s) => {
        progresso.push(s);
        if (++n === 3) engine = true; // a engine passa a responder na terceira rodada
      },
    });
    expect(r).toBe('pronto');
    expect(executor.chamadas).toContain('docker desktop start --detach');
    expect(progresso).toEqual([0, 2, 4]);
  });

  it('sem o subcomando `desktop`, abre o executável do Docker Desktop', async () => {
    let engine = false;
    const { docker, abertos } = criar(
      (_c, args) => {
        if (args[0] === 'version') return engine ? OK('29.0.0') : FALHA();
        if (args[0] === 'desktop') return FALHA("'desktop' is not a docker command");
        return undefined;
      },
      { existe: (p) => p === EXE },
    );
    const r = await docker.abrirDockerDesktop({ aoProgresso: (s) => void (engine = s >= 4) });
    expect(r).toBe('pronto');
    expect(abertos).toEqual([EXE]);
  });

  it('Docker não instalado: "ausente"', async () => {
    const { docker } = criar(() => NAO_EXISTE);
    expect(await docker.abrirDockerDesktop()).toBe('ausente');
  });

  it('a engine não sobe: estoura o limite (3 min no app) e diz "timeout"', async () => {
    const { docker } = criar((_c, args) => (args[0] === 'desktop' ? OK() : FALHA('daemon')));
    expect(await docker.abrirDockerDesktop({ timeoutMs: 10_000 })).toBe('timeout');
  });

  it('pode ser cancelado', async () => {
    const abort = new AbortController();
    const { docker } = criar((_c, args) => (args[0] === 'desktop' ? OK() : FALHA('daemon')));
    const r = await docker.abrirDockerDesktop({ signal: abort.signal, aoProgresso: (s) => s >= 4 && abort.abort() });
    expect(r).toBe('cancelado');
  });
});

describe('DockerService.compose', () => {
  it('ps: roda na pasta do projeto e devolve os contêineres; falha vira null', async () => {
    const { docker, executor } = criar((_c, args) =>
      args.includes('ps') ? OK('{"Service":"slskd","State":"running","Health":"healthy"}\n') : undefined,
    );
    expect(await docker.composePs('C:\\Soulcrate')).toHaveLength(1);
    expect(executor.chamadas[0]).toBe('docker compose ps -a --format json');

    executor.trocar(() => FALHA('daemon'));
    expect(await docker.composePs('C:\\Soulcrate')).toBeNull();
    executor.trocar(() => NAO_EXISTE);
    expect(await docker.composePs('C:\\Soulcrate')).toBeNull();
  });

  it('ligar equivale ao subir.bat; reconstruir recria os contêineres', () => {
    const { docker, executor } = criar(() => undefined);
    docker.ligar('C:\\Soulcrate', { rebuild: false, aoLinha: () => undefined });
    docker.ligar('C:\\Soulcrate', { rebuild: true, aoLinha: () => undefined });
    expect(executor.chamadas).toEqual([
      'docker compose --progress plain up -d --build',
      'docker compose --progress plain up -d --build --force-recreate',
    ]);
  });

  it('desligar, reiniciar, exec (sem TTY) e logs montam a lista de argumentos certa', () => {
    const { docker, executor } = criar(() => undefined);
    docker.desligar('C:\\x', () => undefined);
    docker.reiniciar('C:\\x', 'slskd', () => undefined);
    void docker.exec('C:\\x', 'soulbeet', ['ls', '-A', '/downloads']);
    docker.logs('C:\\x', 'navidrome', () => undefined);
    docker.logs('C:\\x', 'todos', () => undefined);
    expect(executor.chamadas).toEqual([
      'docker compose --progress plain down',
      'docker compose --progress plain restart slskd',
      'docker compose exec -T soulbeet ls -A /downloads',
      'docker compose logs -f --tail 200 --timestamps --no-color navidrome',
      'docker compose logs -f --tail 200 --timestamps --no-color',
    ]);
  });
});
