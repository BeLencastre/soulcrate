// BeatportService: o "Testar login" roda `beet beatport-testar` no contêiner do Soulbeet e traduz a linha do resultado.
// O docker é um dublê que anota o comando; nada fala com o Beatport de verdade.
import { describe, expect, it } from 'vitest';
import { statusInicial, type StackStatus } from '../../src/shared/stack';
import { BeatportService, TIMEOUT_TESTE_BEATPORT_MS } from '../../src/main/services/beatport-service';
import { comandoDoBeet, PASTA_DE_TRABALHO } from '../../src/main/services/biblioteca-service';
import type { ResultadoProcesso } from '../../src/main/infra/processos';

const resultado = (extra: Partial<ResultadoProcesso> = {}): ResultadoProcesso => ({
  codigo: 0,
  stdout: '',
  stderr: '',
  tempoEsgotado: false,
  erroSpawn: null,
  ...extra,
});

function status(
  soulbeet: 'running' | 'exited' | 'ausente' = 'running',
  docker: Partial<StackStatus['docker']> = {},
): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: { ...base.docker, instalacao: 'ok', desktop: 'aberto', engine: true, ...docker },
    servicos: [
      { id: 'slskd', container: 'running', saude: 'healthy', http: true, statusTexto: null },
      { id: 'soulbeet', container: soulbeet, saude: 'healthy', http: true, statusTexto: null },
      { id: 'navidrome', container: 'running', saude: 'healthy', http: true, statusTexto: null },
    ],
  };
}

interface Chamada {
  dir: string;
  servico: string;
  comando: readonly string[];
  timeout: number | undefined;
  workdir: string | undefined;
}

function montar(st: StackStatus, resposta: Partial<ResultadoProcesso> = {}, dir: string | null = 'C:\\Soulcrate') {
  const chamadas: Chamada[] = [];
  const servico = new BeatportService({
    docker: {
      exec: (d, s, comando, timeout, workdir) => {
        chamadas.push({ dir: d, servico: s, comando, timeout, workdir });
        return Promise.resolve(resultado(resposta));
      },
    },
    health: { atual: st, atualizar: () => Promise.resolve(st) },
    projeto: () => ({ dir, origem: 'configurada' }),
  });
  return { servico, chamadas };
}

describe('BeatportService.testarLogin', () => {
  it('roda beatport-testar no contêiner do soulbeet, em /data, com 60 s, e devolve o código lido', async () => {
    const { servico, chamadas } = montar(status(), { stdout: 'soulcrate-beatport: ok\n' });
    expect(await servico.testarLogin()).toEqual({ tipo: 'resultado', codigo: 'ok' });
    expect(chamadas).toEqual([
      {
        dir: 'C:\\Soulcrate',
        servico: 'soulbeet',
        comando: comandoDoBeet(['beatport-testar']),
        timeout: TIMEOUT_TESTE_BEATPORT_MS,
        workdir: PASTA_DE_TRABALHO,
      },
    ]);
    expect(TIMEOUT_TESTE_BEATPORT_MS).toBe(60_000);
  });

  it.each(['sem-conta', 'login-recusado', 'verificacao', 'limite', 'fluxo-mudou', 'fora-do-ar'] as const)(
    'traduz %s, mesmo que o beets saia com código diferente de zero',
    async (codigo) => {
      const { servico } = montar(status(), { codigo: 1, stderr: `soulcrate-beatport: ${codigo}\n` });
      expect(await servico.testarLogin()).toEqual({ tipo: 'resultado', codigo });
    },
  );

  it('sem a linha do contrato (erro do Python, por exemplo), o fluxo mudou', async () => {
    const { servico } = montar(status(), { codigo: 1, stderr: 'Traceback (most recent call last):\n' });
    expect(await servico.testarLogin()).toEqual({ tipo: 'resultado', codigo: 'fluxo-mudou' });
  });

  it('tempo esgotado: o Beatport não respondeu (fora-do-ar)', async () => {
    const { servico } = montar(status(), { codigo: null, tempoEsgotado: true });
    expect(await servico.testarLogin()).toEqual({ tipo: 'resultado', codigo: 'fora-do-ar' });
  });

  it('stack desligada, Docker ausente ou fechado e sem pasta usam os erros que já existem, sem rodar nada', async () => {
    const casos: [StackStatus, string][] = [
      [status('exited'), 'biblioteca.stack-fora'],
      [status('ausente'), 'biblioteca.stack-fora'],
      [status('running', { instalacao: 'ausente' }), 'docker.ausente'],
      [status('running', { instalacao: 'fora-do-path' }), 'docker.fora-do-path'],
      [status('running', { engine: false }), 'docker.fechado'],
    ];
    for (const [st, codigo] of casos) {
      const { servico, chamadas } = montar(st);
      const r = await servico.testarLogin();
      expect(r.tipo === 'erro' && r.erro.codigo).toBe(codigo);
      expect(chamadas).toEqual([]);
    }
    const semPasta = montar(status(), {}, null);
    const r = await semPasta.servico.testarLogin();
    expect(r.tipo === 'erro' && r.erro.codigo).toBe('projeto.ausente');
  });

  it('docker.exe sumiu (erro ao iniciar): docker.ausente', async () => {
    const { servico } = montar(status(), {
      codigo: null,
      erroSpawn: Object.assign(new Error('x'), { code: 'ENOENT' }),
    });
    const r = await servico.testarLogin();
    expect(r.tipo === 'erro' && r.erro.codigo).toBe('docker.ausente');
  });
});
