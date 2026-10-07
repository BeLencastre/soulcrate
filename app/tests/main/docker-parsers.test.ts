import { describe, expect, it } from 'vitest';
import {
  classificarFalhaCompose,
  detectarMarcador,
  estadoDoContainer,
  horaLocal,
  nivelDaLinha,
  parseComposePs,
  parseDesktopStatus,
  parseLinhaLog,
  saudeDoContainer,
  servicosDoPs,
} from '../../src/main/docker-parsers';

const NDJSON = [
  '{"Name":"slskd","Service":"slskd","State":"running","Health":"healthy","Status":"Up 2 hours (healthy)","ExitCode":0}',
  '{"Name":"soulbeet","Service":"soulbeet","State":"running","Health":"starting","Status":"Up 5 seconds (health: starting)","ExitCode":0}',
  '{"Name":"navidrome","Service":"navidrome","State":"exited","Health":"","Status":"Exited (137) 1 minute ago","ExitCode":137}',
].join('\n');

describe('parseComposePs', () => {
  it('lê um objeto por linha (Compose 2.21+)', () => {
    const ps = parseComposePs(NDJSON);
    expect(ps.map((p) => [p.servico, p.estado, p.saude])).toEqual([
      ['slskd', 'running', 'healthy'],
      ['soulbeet', 'running', 'starting'],
      ['navidrome', 'exited', ''],
    ]);
  });

  it('lê um array (versões antigas do Compose)', () => {
    const ps = parseComposePs(`[${NDJSON.split('\n').join(',')}]`);
    expect(ps).toHaveLength(3);
  });

  it('ignora avisos do Compose que não são JSON, linhas quebradas e saída vazia', () => {
    expect(parseComposePs('')).toEqual([]);
    expect(
      parseComposePs('time="..." level=warning msg="The \\"X\\" variable is not set"\n' + NDJSON + '\n{"quebrado"'),
    ).toHaveLength(3);
    expect(parseComposePs('[nao json')).toEqual([]);
  });

  it('tolera campos ausentes', () => {
    expect(parseComposePs('{"Service":"slskd"}')).toEqual([
      { servico: 'slskd', nome: '', estado: '', saude: '', status: '' },
    ]);
  });
});

describe('servicosDoPs', () => {
  it('devolve os três serviços na ordem da stack; o que não aparece é "ausente"', () => {
    const s = servicosDoPs(parseComposePs(NDJSON.split('\n').slice(0, 2).join('\n')));
    expect(s.map((x) => x.id)).toEqual(['slskd', 'soulbeet', 'navidrome']);
    expect(s[0]).toMatchObject({ container: 'running', saude: 'healthy', statusTexto: 'Up 2 hours (healthy)' });
    expect(s[1]).toMatchObject({ container: 'running', saude: 'starting' });
    expect(s[2]).toMatchObject({ container: 'ausente', saude: 'nenhuma', statusTexto: null });
  });

  it('ignora contêineres que não são da stack', () => {
    const s = servicosDoPs(parseComposePs('{"Service":"outro","State":"running"}'));
    expect(s.every((x) => x.container === 'ausente')).toBe(true);
  });

  it('estados desconhecidos viram "ausente" e saúde vazia vira "nenhuma"', () => {
    expect(estadoDoContainer('Running')).toBe('running');
    expect(estadoDoContainer('estranho')).toBe('ausente');
    expect(saudeDoContainer('')).toBe('nenhuma');
    expect(saudeDoContainer('UNHEALTHY')).toBe('unhealthy');
  });
});

describe('parseDesktopStatus', () => {
  it('running = aberto; qualquer outro estado = fechado', () => {
    expect(parseDesktopStatus('{"SessionID":"abc","Status":"running"}')).toBe('aberto');
    expect(parseDesktopStatus('{"Status":"stopped"}')).toBe('fechado');
    expect(parseDesktopStatus('{"Status":"starting"}')).toBe('fechado');
  });
  it('texto que não é JSON (subcomando inexistente) é "desconhecido"', () => {
    expect(parseDesktopStatus("docker: 'desktop' is not a docker command.")).toBe('desconhecido');
    expect(parseDesktopStatus('')).toBe('desconhecido');
    expect(parseDesktopStatus('{"outra":1}')).toBe('desconhecido');
  });
});

describe('parseLinhaLog', () => {
  it('separa contêiner, hora local e texto de `compose logs --timestamps`', () => {
    const l = parseLinhaLog('slskd     | 2026-10-07T22:31:15.123456789Z [INF] Connected to the Soulseek server');
    expect(l.servico).toBe('slskd');
    expect(l.texto).toBe('[INF] Connected to the Soulseek server');
    expect(l.hora).toBe(horaLocal(new Date('2026-10-07T22:31:15.123Z')));
    expect(l.nivel).toBe('info');
  });

  it('marca avisos e erros', () => {
    expect(parseLinhaLog('slskd | 2026-10-07T22:33:40Z [WRN] Transfer from dare204: Errored').nivel).toBe('aviso');
    expect(parseLinhaLog('soulbeet | 2026-10-07T22:33:40Z Traceback (most recent call last)').nivel).toBe('erro');
    expect(nivelDaLinha('[ERR] boom')).toBe('erro');
    expect(nivelDaLinha('tudo bem')).toBe('info');
  });

  it('aceita linha sem prefixo, sem carimbo ou de contêiner desconhecido', () => {
    expect(parseLinhaLog('só texto')).toEqual({ servico: null, hora: null, texto: 'só texto', nivel: 'info' });
    expect(parseLinhaLog('outro | texto').servico).toBeNull();
    expect(parseLinhaLog('navidrome | sem carimbo aqui')).toMatchObject({
      servico: 'navidrome',
      hora: null,
      texto: 'sem carimbo aqui',
    });
  });
});

describe('detectarMarcador', () => {
  it('acha "plugins ok" e "lastgenre ok" no build, e só eles', () => {
    expect(detectarMarcador('#12 4.5 plugins ok - beets 2.11.0')).toBe('plugins ok');
    expect(detectarMarcador('#12 4.9 lastgenre ok')).toBe('lastgenre ok');
    expect(detectarMarcador('AVISO: lastgenre ainda nao importa')).toBeNull();
    expect(detectarMarcador('=> [soulbeet 7/9] RUN python3 /opt/fix-metadata.py')).toBeNull();
  });
});

describe('classificarFalhaCompose', () => {
  it('Docker fechado', () => {
    expect(
      classificarFalhaCompose(
        'error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/json": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.',
      ).codigo,
    ).toBe('docker.fechado');
    expect(classificarFalhaCompose('Cannot connect to the Docker daemon at unix:///var/run/docker.sock').codigo).toBe(
      'docker.fechado',
    );
  });

  it('porta em uso, com o número da porta (mensagens reais do Docker Desktop no Windows)', () => {
    expect(
      classificarFalhaCompose(
        'Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:5030 -> 127.0.0.1:0: listen tcp 127.0.0.1:5030: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.',
      ),
    ).toEqual({ codigo: 'porta.em-uso', porta: '5030' });
    expect(
      classificarFalhaCompose(
        'Error response from daemon: driver failed programming external connectivity on endpoint slskd: Bind for 0.0.0.0:2234 failed: port is already allocated',
      ),
    ).toEqual({ codigo: 'porta.em-uso', porta: '2234' });
    expect(classificarFalhaCompose('Bind for [::]:9765 failed: port is already allocated')).toEqual({
      codigo: 'porta.em-uso',
      porta: '9765',
    });
  });

  it('o resto é falha genérica da operação', () => {
    expect(classificarFalhaCompose('no space left on device').codigo).toBe('operacao.falhou');
    expect(classificarFalhaCompose('').codigo).toBe('operacao.falhou');
  });
});
