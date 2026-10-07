import { describe, expect, it } from 'vitest';
import {
  ChecksService,
  compararPastas,
  estadoDosItens,
  resumirLinhaDoBeets,
} from '../../src/main/services/checks-service';
import type { DockerService } from '../../src/main/services/docker-service';
import type { ResultadoProcesso } from '../../src/main/processos';
import { statusInicial, type ServicoStatus, type StackStatus } from '../../src/shared/stack';

const rodando = (
  id: ServicoStatus['id'],
  saude: ServicoStatus['saude'] = 'healthy',
  http: boolean | null = true,
): ServicoStatus => ({
  id,
  container: 'running',
  saude,
  http,
  statusTexto: 'Up',
});

function status(servicos: ServicoStatus[]): StackStatus {
  return {
    ...statusInicial(),
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: {
      instalacao: 'ok',
      desktop: 'aberto',
      engine: true,
      versaoServidor: '29.0.0',
      compose: '5.0.0',
      abrindo: null,
    },
    servicos,
  };
}
const TODOS = [rodando('slskd'), rodando('soulbeet'), rodando('navidrome')];

const resp = (codigo: number, stdout = '', stderr = ''): ResultadoProcesso => ({
  codigo,
  stdout,
  stderr,
  tempoEsgotado: false,
  erroSpawn: null,
});

function criar(
  st: StackStatus,
  exec: (servico: string, cmd: string) => ResultadoProcesso,
  log: string[] | null = null,
) {
  const docker = {
    exec: async (_dir: string, servico: string, comando: readonly string[]) => exec(servico, comando.join(' ')),
  } as unknown as DockerService;
  return new ChecksService({ docker, status: () => st, ultimasLinhas: () => log, agora: () => 123 });
}

const EXEC_OK = (servico: string, cmd: string): ResultadoProcesso => {
  if (cmd.includes('keyfinder-cli')) return resp(0, 'Usage: keyfinder-cli');
  if (cmd.includes('import librosa')) return resp(0, 'beets 2.11.0 - librosa/resampy/beetcamp OK\n');
  if (cmd.includes('lastgenre')) return resp(0, 'lastgenre ok\n');
  if (servico === 'slskd') return resp(0, 'Hard Techno\nlote-1\n');
  return resp(0, 'lote-1\nHard Techno\n');
};

describe('ChecksService.executar', () => {
  it('stack desligada ou Docker fora do ar: não há o que verificar', async () => {
    expect(await criar(status([]), EXEC_OK).executar()).toEqual({ verificadoEm: 123, executado: false, checks: [] });
    const fechado = { ...status(TODOS), docker: { ...status(TODOS).docker, engine: false } };
    expect((await criar(fechado, EXEC_OK).executar()).executado).toBe(false);
  });

  it('tudo certo: cinco verificações verdes, na ordem do protótipo', async () => {
    const r = await criar(status(TODOS), EXEC_OK, [
      'import started Wed Oct  7 00:21:30 2026',
      'asis /downloads/Hard Techno/Omaks - Morning Rave.flac',
    ]).executar();
    expect(r.executado).toBe(true);
    expect(r.checks.map((c) => [c.id, c.estado])).toEqual([
      ['containers', 'ok'],
      ['endpoints', 'ok'],
      ['plugins', 'ok'],
      ['pastas', 'ok'],
      ['importacoes', 'ok'],
    ]);
    const plugins = r.checks.find((c) => c.id === 'plugins');
    expect(plugins?.itens.map((i) => i.texto)).toEqual([
      'keyfinder-cli',
      'beets 2.11.0',
      'librosa, resampy, beetcamp',
      'lastgenre',
    ]);
    expect(r.checks.find((c) => c.id === 'importacoes')?.itens[0]?.texto).toBe('Omaks - Morning Rave.flac');
  });

  it('contêiner parado e endpoint sem resposta aparecem como erro, com explicação', async () => {
    const st = status([
      rodando('slskd', 'unhealthy', false),
      { ...rodando('soulbeet'), container: 'exited', http: null },
      rodando('navidrome'),
    ]);
    const r = await criar(st, EXEC_OK).executar();
    const containers = r.checks.find((c) => c.id === 'containers');
    expect(containers?.estado).toBe('erro');
    expect(containers?.itens.map((i) => i.texto)).toEqual([
      'slskd · unhealthy',
      'soulbeet · exited',
      'navidrome · healthy',
    ]);
    expect(containers?.nota).toBeTruthy();
    const endpoints = r.checks.find((c) => c.id === 'endpoints');
    expect(endpoints?.estado).toBe('erro');
    expect(endpoints?.itens[1]?.texto).toBe('Soulbeet raiz · contêiner parado');
  });

  it('serviço ainda subindo é aviso, não erro', async () => {
    const st = status([rodando('slskd', 'starting', false), rodando('soulbeet'), rodando('navidrome')]);
    const r = await criar(st, EXEC_OK).executar();
    expect(r.checks.find((c) => c.id === 'containers')?.estado).toBe('aviso');
    expect(r.checks.find((c) => c.id === 'endpoints')?.estado).toBe('aviso');
  });

  it('plugins do beets que não importam: erro; lastgenre que não importa: só aviso', async () => {
    const ruim = await criar(status(TODOS), (s, c) =>
      c.includes('import librosa') ? resp(1, '', 'ModuleNotFoundError: librosa') : EXEC_OK(s, c),
    ).executar();
    expect(ruim.checks.find((c) => c.id === 'plugins')?.estado).toBe('erro');
    const aviso = await criar(status(TODOS), (s, c) =>
      c.includes('lastgenre') ? resp(1, '', 'ImportError') : EXEC_OK(s, c),
    ).executar();
    const p = aviso.checks.find((c) => c.id === 'plugins');
    expect(p?.estado).toBe('aviso');
    expect(p?.nota).toContain('Reconstruir');
  });

  it('keyfinder-cli que sai com código ≠ 0 mas mostra o uso conta como funcionando', async () => {
    const r = await criar(status(TODOS), (s, c) =>
      c.includes('keyfinder-cli') ? resp(1, '', 'Usage: keyfinder-cli ...') : EXEC_OK(s, c),
    ).executar();
    expect(r.checks.find((c) => c.id === 'plugins')?.itens[0]).toEqual({ texto: 'keyfinder-cli', estado: 'ok' });
  });

  it('/downloads diferente nos dois contêineres é erro (a regra crítica do docker-compose.yml)', async () => {
    const r = await criar(status(TODOS), (s, c) =>
      c.includes('ls -A') ? resp(0, 'a.mp3\nb.mp3') : c.includes('listdir') ? resp(0, 'a.mp3') : EXEC_OK(s, c),
    ).executar();
    const pastas = r.checks.find((c) => c.id === 'pastas');
    expect(pastas?.estado).toBe('erro');
    expect(pastas?.itens[1]?.texto).toContain('b.mp3');
    expect(pastas?.nota).toContain('DOWNLOADS_DIR');
  });

  it('o `ls` que falha é erro, não "pastas iguais"', async () => {
    const r = await criar(status(TODOS), (s, c) =>
      c.includes('ls -A') ? resp(1, '', 'boom') : EXEC_OK(s, c),
    ).executar();
    expect(r.checks.find((c) => c.id === 'pastas')?.estado).toBe('erro');
  });

  it('beets-import.log ausente ou vazio: "sem importações ainda" (não é erro)', async () => {
    const r = await criar(status(TODOS), EXEC_OK, null).executar();
    expect(r.checks.find((c) => c.id === 'importacoes')).toMatchObject({
      estado: 'ok',
      itens: [{ texto: 'sem importações ainda', estado: 'neutro' }],
    });
  });
});

describe('funções auxiliares', () => {
  it('estadoDosItens: o pior vence', () => {
    expect(
      estadoDosItens([
        { texto: 'a', estado: 'ok' },
        { texto: 'b', estado: 'neutro' },
      ]),
    ).toBe('ok');
    expect(
      estadoDosItens([
        { texto: 'a', estado: 'aviso' },
        { texto: 'b', estado: 'ok' },
      ]),
    ).toBe('aviso');
    expect(
      estadoDosItens([
        { texto: 'a', estado: 'aviso' },
        { texto: 'b', estado: 'erro' },
      ]),
    ).toBe('erro');
  });

  it('compararPastas aponta o que só um dos lados vê', () => {
    expect(compararPastas(['a', 'b'], ['b', 'a'])).toEqual({ iguais: true, so: [] });
    expect(compararPastas(['a'], ['b'])).toEqual({ iguais: false, so: ['a', 'b'] });
    expect(compararPastas([], [])).toEqual({ iguais: true, so: [] });
  });

  it('resumirLinhaDoBeets mostra só o arquivo e corta linhas enormes', () => {
    expect(resumirLinhaDoBeets('asis /downloads/Hard Techno/Omaks - Morning Rave.flac')).toBe(
      'Omaks - Morning Rave.flac',
    );
    expect(resumirLinhaDoBeets('texto qualquer')).toBe('texto qualquer');
    expect(resumirLinhaDoBeets('x'.repeat(300)).length).toBe(108);
  });
});
