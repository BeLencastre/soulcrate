import { describe, expect, it, vi } from 'vitest';
import type { ContainerPs } from '../../src/main/docker-parsers';
import type { DeteccaoDocker, DockerService } from '../../src/main/services/docker-service';
import { HealthService, INTERVALO_OCULTO_MS, INTERVALO_VISIVEL_MS } from '../../src/main/services/health-service';
import { resumirStack, type ConfigStatus, type StackStatus } from '../../src/shared/stack';
import { ate } from './ajudantes';

const ENGINE: DeteccaoDocker = {
  instalacao: 'ok',
  desktop: 'aberto',
  engine: true,
  versaoServidor: '29.0.0',
  compose: '5.0.0',
};
const FECHADO: DeteccaoDocker = {
  instalacao: 'ok',
  desktop: 'fechado',
  engine: false,
  versaoServidor: null,
  compose: '5.0.0',
};
const CONFIG_OK: ConfigStatus = { estado: 'valida', erros: 0, avisos: 0, achados: [] };

const ps = (servico: string, estado: string, saude = ''): ContainerPs => ({
  servico,
  nome: servico,
  estado,
  saude,
  status: `${estado} ${saude}`,
});
const TODOS: ContainerPs[] = [
  ps('slskd', 'running', 'healthy'),
  ps('soulbeet', 'running', 'healthy'),
  ps('navidrome', 'running', 'healthy'),
];

function criar() {
  const mundo = {
    deteccao: ENGINE as DeteccaoDocker,
    ps: [] as ContainerPs[] | null,
    http: true,
    dir: 'C:\\Soulcrate' as string | null,
    config: CONFIG_OK,
    detectar: vi.fn(),
    composePs: vi.fn(),
    sondar: vi.fn(),
  };
  mundo.detectar.mockImplementation(async () => mundo.deteccao);
  mundo.composePs.mockImplementation(async () => mundo.ps);
  mundo.sondar.mockImplementation(async () => mundo.http);
  const docker = { detectar: mundo.detectar, composePs: mundo.composePs } as unknown as DockerService;
  const health = new HealthService({
    docker,
    projeto: () => (mundo.dir ? { dir: mundo.dir, origem: 'configurada' } : { dir: null, origem: null }),
    validarConfig: () => mundo.config,
    sondar: mundo.sondar,
    agora: () => 1_000,
  });
  const emitidos: StackStatus[] = [];
  health.aoMudar((s) => emitidos.push(s));
  return { health, mundo, emitidos };
}

describe('HealthService', () => {
  it('uma sondagem completa: Docker, configuração, contêineres e HTTP', async () => {
    const { health, mundo } = criar();
    mundo.ps = TODOS;
    const s = await health.atualizar();
    expect(s.docker).toMatchObject({ instalacao: 'ok', engine: true, versaoServidor: '29.0.0', abrindo: null });
    expect(s.configuracao.estado).toBe('valida');
    expect(s.servicos.map((x) => [x.id, x.container, x.saude, x.http])).toEqual([
      ['slskd', 'running', 'healthy', true],
      ['soulbeet', 'running', 'healthy', true],
      ['navidrome', 'running', 'healthy', true],
    ]);
    expect(s.atualizadoEm).toBe(1_000);
    expect(resumirStack(s).estado).toBe('no-ar');
    // sonda cada Web UI no endpoint certo (D4)
    expect(mundo.sondar.mock.calls.map((c) => c[0]).sort()).toEqual([
      'http://127.0.0.1:4533/ping',
      'http://127.0.0.1:5030/health',
      'http://127.0.0.1:9765/',
    ]);
  });

  it('caminho rápido: com a engine de pé só roda o `compose ps` (sem detectar de novo)', async () => {
    const { health, mundo } = criar();
    mundo.ps = TODOS;
    await health.atualizar();
    await health.atualizar();
    await health.atualizar();
    expect(mundo.detectar).toHaveBeenCalledTimes(1);
    expect(mundo.composePs).toHaveBeenCalledTimes(3); // um por ciclo
  });

  it('o Docker fecha por fora: o `compose ps` falha e a detecção completa roda de novo', async () => {
    const { health, mundo } = criar();
    mundo.ps = TODOS;
    await health.atualizar();
    mundo.ps = null;
    mundo.deteccao = FECHADO;
    const s = await health.atualizar();
    expect(mundo.detectar).toHaveBeenCalledTimes(2);
    expect(s.docker).toMatchObject({ engine: false, desktop: 'fechado' });
    expect(s.servicos.every((x) => x.container === 'ausente')).toBe(true);
    expect(resumirStack(s).motivo).toBe('docker-fechado');
  });

  it('o Docker volta: o app se recupera sozinho no ciclo seguinte', async () => {
    const { health, mundo } = criar();
    mundo.deteccao = FECHADO;
    mundo.ps = null;
    await health.atualizar();
    mundo.deteccao = ENGINE;
    mundo.ps = TODOS;
    const s = await health.atualizar();
    expect(resumirStack(s).estado).toBe('no-ar');
  });

  it('contêiner derrubado por fora vira erro; o HTTP só é sondado nos que estão rodando', async () => {
    const { health, mundo } = criar();
    mundo.ps = [ps('slskd', 'exited'), ps('soulbeet', 'running', 'healthy'), ps('navidrome', 'running', 'healthy')];
    const s = await health.atualizar();
    expect(s.servicos[0]).toMatchObject({ container: 'exited', http: null });
    expect(resumirStack(s)).toMatchObject({ estado: 'erro', motivo: 'servico-parou', servicos: ['slskd'] });
    expect(mundo.sondar).toHaveBeenCalledTimes(2);
  });

  it('uma sondagem HTTP que lança conta como "não respondeu"', async () => {
    const { health, mundo } = criar();
    mundo.ps = TODOS;
    mundo.sondar.mockRejectedValue(new Error('boom'));
    const s = await health.atualizar();
    expect(s.servicos.every((x) => x.http === false)).toBe(true);
  });

  it('sem pasta do Soulcrate: configuração "sem-projeto" e nenhum `compose ps`', async () => {
    const { health, mundo } = criar();
    mundo.dir = null;
    const s = await health.atualizar();
    expect(s.configuracao.estado).toBe('sem-projeto');
    expect(mundo.composePs).not.toHaveBeenCalled();
    expect(s.docker.engine).toBe(true);
  });

  it('só publica quando algo mudou (o `atualizadoEm` não conta)', async () => {
    const { health, mundo, emitidos } = criar();
    mundo.ps = TODOS;
    await health.atualizar();
    const aposPrimeira = emitidos.length;
    expect(aposPrimeira).toBeGreaterThan(0);
    await health.atualizar();
    await health.atualizar();
    expect(emitidos).toHaveLength(aposPrimeira);
    mundo.ps = [ps('slskd', 'exited'), ...TODOS.slice(1)];
    await health.atualizar();
    expect(emitidos).toHaveLength(aposPrimeira + 1);
  });

  it('a primeira sondagem sempre é publicada, mesmo quando o resultado é igual ao estado inicial', async () => {
    const { health, mundo, emitidos } = criar();
    // Docker "desconhecido" e fora do ar, sem pasta: idêntico ao estado inicial, exceto por já ter sido medido
    mundo.deteccao = { instalacao: 'ok', desktop: 'desconhecido', engine: false, versaoServidor: null, compose: null };
    mundo.dir = null;
    expect(health.atual.atualizadoEm).toBe(0);
    await health.atualizar();
    expect(emitidos).toHaveLength(1);
    expect(emitidos[0]?.atualizadoEm).toBeGreaterThan(0);
    expect(resumirStack(emitidos[0] as StackStatus).motivo).toBe('docker-fechado');
  });

  it('operação em andamento e "abrindo o Docker" entram no estado e saem dele', async () => {
    const { health, mundo, emitidos } = criar();
    mundo.ps = TODOS;
    await health.atualizar();
    health.definirOperacao('ligando');
    expect(health.atual.operacao).toBe('ligando');
    expect(resumirStack(health.atual).motivo).toBe('operacao');
    // a próxima sondagem não apaga a operação
    expect((await health.atualizar()).operacao).toBe('ligando');
    health.definirOperacao(null);
    expect(health.atual.operacao).toBeNull();

    health.definirAbrindoDocker(5);
    expect(health.atual.docker.abrindo).toEqual({ desdeMs: 5 });
    expect((await health.atualizar()).docker.abrindo).toEqual({ desdeMs: 5 });
    health.definirAbrindoDocker(null);
    expect(health.atual.docker.abrindo).toBeNull();
    expect(emitidos.at(-1)?.docker.abrindo).toBeNull();
  });

  it('duas sondagens ao mesmo tempo dividem o mesmo ciclo; `forcar` faz outro depois', async () => {
    const { health, mundo } = criar();
    mundo.ps = TODOS;
    let solta!: () => void;
    mundo.composePs.mockImplementationOnce(() => new Promise((r) => (solta = () => r(TODOS))));
    // primeiro ciclo detecta e chama composePs (que fica pendurado)
    const a = health.atualizar();
    const b = health.atualizar();
    await ate(() => mundo.composePs.mock.calls.length === 1);
    solta();
    await Promise.all([a, b]);
    expect(mundo.detectar).toHaveBeenCalledTimes(1);

    const antes = mundo.composePs.mock.calls.length;
    await health.atualizar({ forcar: true });
    expect(mundo.composePs.mock.calls.length).toBe(antes + 1);
  });

  it('ritmo: 5 s com a janela visível e 30 s na bandeja (§6.4)', () => {
    expect(INTERVALO_VISIVEL_MS).toBe(5_000);
    expect(INTERVALO_OCULTO_MS).toBe(30_000);
  });

  it('o laço sonda sozinho no ritmo definido e para quando mandam parar', async () => {
    vi.useFakeTimers();
    try {
      const { health, mundo } = criar();
      mundo.ps = TODOS;
      health.iniciar();
      await vi.advanceTimersByTimeAsync(0);
      const inicial = mundo.composePs.mock.calls.length;
      await vi.advanceTimersByTimeAsync(INTERVALO_VISIVEL_MS);
      expect(mundo.composePs.mock.calls.length).toBeGreaterThan(inicial);

      health.definirIntervalo(INTERVALO_OCULTO_MS);
      await vi.advanceTimersByTimeAsync(0);
      const apos = mundo.composePs.mock.calls.length;
      await vi.advanceTimersByTimeAsync(INTERVALO_VISIVEL_MS * 2);
      expect(mundo.composePs.mock.calls.length).toBe(apos); // mais lento: nada em 10 s
      await vi.advanceTimersByTimeAsync(INTERVALO_OCULTO_MS);
      expect(mundo.composePs.mock.calls.length).toBeGreaterThan(apos);

      health.parar();
      const parou = mundo.composePs.mock.calls.length;
      await vi.advanceTimersByTimeAsync(INTERVALO_OCULTO_MS * 3);
      expect(mundo.composePs.mock.calls.length).toBe(parou);
    } finally {
      vi.useRealTimers();
    }
  });
});
