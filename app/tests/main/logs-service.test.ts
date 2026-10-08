import { describe, expect, it, vi } from 'vitest';
import type { MainEvent } from '../../src/shared/ipc';
import type { DockerService } from '../../src/main/services/docker-service';
import { LogsService } from '../../src/main/services/logs-service';
import { ate, ExecutorFalso, OK } from './ajudantes';

function criar(dir: string | null = 'C:\\Soulcrate') {
  const executor = new ExecutorFalso(() => undefined);
  const docker = {
    logs: (d: string, alvo: string, aoLinha: (l: string) => void) =>
      executor.iniciar('docker', ['compose', 'logs', alvo], { cwd: d, aoLinha }),
  } as unknown as DockerService;
  const eventos: MainEvent[] = [];
  let n = 0;
  const logs = new LogsService({
    docker,
    projetoDir: () => dir,
    emitir: (e) => eventos.push(e),
    novoId: () => `sub-${++n}`,
  });
  return { logs, executor, eventos };
}

describe('LogsService', () => {
  it('transmite as linhas em lotes, já separadas em contêiner, hora e nível', async () => {
    const executor = new ExecutorFalso((_c, args) =>
      args.includes('slskd')
        ? { stdout: 'slskd | 2026-10-07T22:31:15Z [INF] Logged in\nslskd | 2026-10-07T22:33:40Z [WRN] Errored\n\n' }
        : undefined,
    );
    const docker = {
      logs: (d: string, alvo: string, aoLinha: (l: string) => void) =>
        executor.iniciar('docker', ['compose', 'logs', alvo], { cwd: d, aoLinha }),
    } as unknown as DockerService;
    const eventos: MainEvent[] = [];
    const logs = new LogsService({
      docker,
      projetoDir: () => 'C:\\x',
      emitir: (e) => eventos.push(e),
      novoId: () => 'sub-1',
    });

    expect(logs.assinar(7, 'slskd')).toBe('sub-1');
    await ate(() => eventos.some((e) => e.type === 'logs.lines'));
    const lote = eventos.find((e): e is Extract<MainEvent, { type: 'logs.lines' }> => e.type === 'logs.lines');
    expect(lote?.id).toBe('sub-1');
    expect(lote?.linhas.map((l) => [l.servico, l.texto, l.nivel])).toEqual([
      ['slskd', '[INF] Logged in', 'info'],
      ['slskd', '[WRN] Errored', 'aviso'],
    ]);
    expect(executor.chamadas[0]).toBe('docker compose logs slskd');
  });

  it('cancelar encerra o processo e silencia a assinatura', async () => {
    const { logs, executor, eventos } = criar();
    const id = logs.assinar(1, 'todos');
    expect(logs.quantidade).toBe(1);
    logs.cancelar(id);
    expect(executor.processos[0]?.encerrado).toBe(true);
    expect(logs.quantidade).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(eventos.filter((e) => e.type === 'logs.end')).toHaveLength(0);
  });

  it('quando o `logs -f` termina sozinho (contêineres pararam), avisa o fim', async () => {
    const { logs, executor, eventos } = criar();
    const id = logs.assinar(1, 'slskd');
    executor.processos[0]?.finalizar(OK());
    await ate(() => eventos.some((e) => e.type === 'logs.end'));
    expect(eventos.find((e) => e.type === 'logs.end')).toEqual({ type: 'logs.end', id, motivo: null });
    expect(logs.quantidade).toBe(0);
  });

  it('sem pasta do Soulcrate: termina logo, sem rodar nada', async () => {
    const { logs, executor, eventos } = criar(null);
    const id = logs.assinar(1, 'slskd');
    await ate(() => eventos.length > 0);
    expect(eventos[0]).toEqual({ type: 'logs.end', id, motivo: 'sem-projeto' });
    expect(executor.processos).toHaveLength(0);
  });

  it('cancelarDoDono e cancelarTodas limpam as assinaturas da janela que fechou e as do app que sai', () => {
    const { logs, executor } = criar();
    logs.assinar(1, 'slskd');
    logs.assinar(1, 'soulbeet');
    logs.assinar(2, 'navidrome');
    logs.cancelarDoDono(1);
    expect(logs.quantidade).toBe(1);
    expect(executor.processos.map((p) => p.encerrado)).toEqual([true, true, false]);
    logs.cancelarTodas();
    expect(logs.quantidade).toBe(0);
    expect(executor.processos.every((p) => p.encerrado)).toBe(true);
  });

  it('um lote grande é entregue de uma vez, sem esperar o intervalo', async () => {
    vi.useFakeTimers();
    try {
      const linhas = Array.from({ length: 600 }, (_v, i) => `slskd | 2026-10-07T22:00:00Z linha ${i}`).join('\n');
      const executor = new ExecutorFalso(() => ({ stdout: linhas }));
      const docker = {
        logs: (d: string, a: string, aoLinha: (l: string) => void) =>
          executor.iniciar('docker', ['logs', a], { cwd: d, aoLinha }),
      } as unknown as DockerService;
      const eventos: MainEvent[] = [];
      const logs = new LogsService({
        docker,
        projetoDir: () => 'C:\\x',
        emitir: (e) => eventos.push(e),
        novoId: () => 's',
      });
      logs.assinar(1, 'slskd');
      await vi.advanceTimersByTimeAsync(0);
      const lotes = eventos.filter((e): e is Extract<MainEvent, { type: 'logs.lines' }> => e.type === 'logs.lines');
      expect(lotes[0]?.linhas).toHaveLength(500); // o teto por lote
      await vi.advanceTimersByTimeAsync(200);
      const todas = eventos
        .filter((e): e is Extract<MainEvent, { type: 'logs.lines' }> => e.type === 'logs.lines')
        .flatMap((e) => e.linhas);
      expect(todas).toHaveLength(600); // o resto sai no intervalo seguinte, nada se perde
    } finally {
      vi.useRealTimers();
    }
  });
});
