// BibliotecaService: o que ele pede ao beets e, principalmente, o que ele RECUSA pedir. Os critérios de aceite da Fase 5
// ("toda operação destrutiva tem pré-visualização e confirmação; nenhuma roda sem a stack no ar") viram testes aqui:
// o `docker` é um dublê que anota cada comando, então dá para afirmar que o `remove` nunca foi chamado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ParadoEmDownloads } from '../../src/shared/biblioteca';
import type { AppError } from '../../src/shared/erros';
import type { MainEvent } from '../../src/shared/ipc';
import { statusInicial, type StackStatus } from '../../src/shared/stack';
import {
  BibliotecaService,
  comandoDoBeet,
  COMANDOS_PERMITIDOS,
  PASTA_DE_TRABALHO,
  PREFIXO_BEET,
  VALIDADE_DO_TOKEN_MS,
  type DependenciasBiblioteca,
} from '../../src/main/services/biblioteca-service';
import type { ResultadoProcesso } from '../../src/main/processos';

const LS = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'biblioteca', 'ls.txt'), 'utf8');
const UPDATE_P = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'biblioteca', 'update-p.txt'), 'utf8');

const resultado = (extra: Partial<ResultadoProcesso> = {}): ResultadoProcesso => ({
  codigo: 0,
  stdout: '',
  stderr: '',
  tempoEsgotado: false,
  erroSpawn: null,
  ...extra,
});

function statusComSoulbeet(estado: 'running' | 'exited' | 'ausente' = 'running'): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: { ...base.docker, instalacao: 'ok', desktop: 'aberto', engine: true },
    servicos: [
      { id: 'slskd', container: 'running', saude: 'healthy', http: true, statusTexto: null },
      { id: 'soulbeet', container: estado, saude: 'healthy', http: true, statusTexto: null },
      { id: 'navidrome', container: 'running', saude: 'healthy', http: true, statusTexto: null },
    ],
  };
}

interface Mundo {
  status: StackStatus;
  /** o que `ls` devolve para cada filtro (a chave é o filtro, sem o `ls -f FORMATO`); o padrão é a fixture */
  respostas: (args: readonly string[]) => Partial<ResultadoProcesso> | undefined;
  chamadas: string[][];
  workdirs: (string | undefined)[];
  loteRodando: boolean;
  parados: ParadoEmDownloads[];
  agora: number;
  eventos: MainEvent[];
  /** processos em streaming: cada um termina quando o teste manda */
  streams: {
    args: string[];
    linhas: (l: string) => void;
    terminar(r?: Partial<ResultadoProcesso>): void;
    encerrado: boolean;
  }[];
  tokensGerados: number;
}

let m: Mundo;

function montar(): BibliotecaService {
  m = {
    status: statusComSoulbeet(),
    respostas: () => undefined,
    chamadas: [],
    workdirs: [],
    loteRodando: false,
    parados: [],
    agora: 1_000_000,
    eventos: [],
    streams: [],
    tokensGerados: 0,
  };
  const dep: DependenciasBiblioteca = {
    docker: {
      exec: (_dir, servico, comando, _timeout, workdir) => {
        expect(servico).toBe('soulbeet');
        const args = comando.slice(PREFIXO_BEET.length);
        expect(comando.slice(0, PREFIXO_BEET.length)).toEqual([...PREFIXO_BEET]);
        m.chamadas.push([...args]);
        m.workdirs.push(workdir);
        const r = m.respostas(args);
        if (r) return Promise.resolve(resultado(r));
        if (args[0] === 'ls') return Promise.resolve(resultado({ stdout: lsPara(args) }));
        return Promise.resolve(resultado());
      },
      execStream: (_dir, servico, comando, aoLinha) => {
        expect(servico).toBe('soulbeet');
        const args = comando.slice(PREFIXO_BEET.length);
        m.chamadas.push([...args]);
        let terminar!: (r: ResultadoProcesso) => void;
        const terminou = new Promise<ResultadoProcesso>((res) => (terminar = res));
        const s = {
          args: [...args],
          linhas: aoLinha,
          encerrado: false,
          terminar: (r: Partial<ResultadoProcesso> = {}) => terminar(resultado(r)),
        };
        m.streams.push(s);
        return {
          pid: 1,
          encerrar: () => {
            s.encerrado = true;
            terminar(resultado({ codigo: null }));
          },
          terminou,
        };
      },
    },
    health: {
      get atual() {
        return m.status;
      },
      atualizar: () => Promise.resolve(m.status),
    },
    projeto: () => ({ dir: 'C:\\Soulcrate', origem: 'configurada' }),
    pastas: () => ({ musica: 'D:\\Musica\\music', downloads: 'D:\\Musica\\downloads' }),
    loteRodando: () => Promise.resolve(m.loteRodando),
    escanearDownloads: () => Promise.resolve(m.parados),
    emitir: (e) => m.eventos.push(e),
    novoId: () => `op-${m.streams.length + 1}`,
    novoToken: () => `token-${++m.tokensGerados}`,
    agora: () => m.agora,
  };
  return new BibliotecaService(dep);
}

/** Um `ls` como o beets o faria: as faixas da fixture que casam com os termos (`artist:`, `title:` e palavras soltas). */
function lsPara(args: readonly string[]): string {
  const termos = args.slice(args.indexOf('-f') + 2);
  return LS.split('\n')
    .filter((l) => l.trim())
    .filter((linha) => {
      const [, artista = '', titulo = ''] = linha.split('\t');
      return termos.every((t) => {
        const [campo, ...resto] = t.split(':');
        const valor = (resto.length ? resto.join(':') : (campo ?? '')).toLowerCase();
        const alvo = resto.length ? (campo === 'artist' ? artista : titulo) : `${artista} ${titulo}`;
        return alvo.toLowerCase().includes(valor);
      });
    })
    .join('\n');
}

const erroDe = (r: { ok: boolean; erro?: AppError }): AppError => {
  if (r.ok || !r.erro) throw new Error('esperava um erro');
  return r.erro;
};
const chamouBeet = (sub: string) => m.chamadas.some((c) => c[0] === sub);

beforeEach(() => {
  montar();
});

describe('comandoDoBeet: a lista fechada', () => {
  it('monta o prefixo do README e o subcomando', () => {
    expect(comandoDoBeet(['ls', 'artist:Azyr'])).toEqual([...PREFIXO_BEET, 'ls', 'artist:Azyr']);
    expect(PREFIXO_BEET).toEqual([
      '/usr/bin/python3',
      '-c',
      'import sys; from beets.ui import main; main(sys.argv[1:])',
      '-c',
      '/config/config.yaml',
      '-l',
      '/music/.beets_library.db',
    ]);
  });

  it('só ls, remove, update, move, keyfinder, autobpm, import e version (que só lê)', () => {
    expect([...COMANDOS_PERMITIDOS].sort()).toEqual([
      'autobpm',
      'import',
      'keyfinder',
      'ls',
      'move',
      'remove',
      'update',
      'version',
    ]);
    for (const ruim of ['modify', 'config', 'shell', 'fields', '-c', '', 'LS', 'ls ; rm']) {
      expect(() => comandoDoBeet([ruim, 'x'])).toThrow(/não permitido/);
    }
    expect(() => comandoDoBeet([])).toThrow(/não permitido/);
  });
});

describe('ler', () => {
  it('pede o ls com o formato em /data, lê as faixas em ordem e olha os parados', async () => {
    const s = montar();
    m.parados = [{ nome: 'f_hard', arquivos: ['a.mp3'], total: 1, modificadoEm: 5 }];
    const r = await s.ler();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(m.chamadas[0]?.slice(0, 2)).toEqual(['ls', '-f']);
    expect(m.workdirs[0]).toBe(PASTA_DE_TRABALHO);
    expect(r.leitura.faixas.map((f) => f.artista)).toEqual(['Azyr', 'Azyr', 'Cloudy', 'Vendex']);
    expect(r.leitura.pastaMusica).toBe('D:\\Musica\\music');
    expect(r.leitura.parados).toHaveLength(1);
    expect(r.leitura.ignoradas).toBe(0);
  });

  it('sem a stack no ar não chama o beets: erro do catálogo com a ação de ligar', async () => {
    const s = montar();
    m.status = statusComSoulbeet('exited');
    const e = erroDe(await s.ler());
    expect(e.codigo).toBe('biblioteca.stack-fora');
    expect(e.acoes.map((a) => a.id)).toContain('ligarStack');
    expect(m.chamadas).toEqual([]);
  });

  it('contêiner do Soulbeet inexistente também é "stack fora"', async () => {
    const s = montar();
    m.status = statusComSoulbeet('ausente');
    expect(erroDe(await s.ler()).codigo).toBe('biblioteca.stack-fora');
  });

  it('Docker fechado e projeto ausente têm o erro de sempre', async () => {
    let s = montar();
    m.status = { ...statusComSoulbeet(), docker: { ...statusComSoulbeet().docker, engine: false } };
    expect(erroDe(await s.ler()).codigo).toBe('docker.fechado');
    s = montar();
    m.status = {
      ...statusComSoulbeet(),
      docker: { ...statusComSoulbeet().docker, engine: false, instalacao: 'ausente' },
    };
    expect(erroDe(await s.ler()).codigo).toBe('docker.ausente');
  });

  it('o beets falhou: erro com as últimas linhas, sem cor e sem segredos', async () => {
    const s = montar();
    m.respostas = () => ({
      codigo: 1,
      stderr: 'error: database is locked\nSLSKD_WEB_PASSWORD=segredo123',
      stdout: '\u001b[1;31mruim\u001b[39;49;00m',
    });
    const e = erroDe(await s.ler());
    expect(e.codigo).toBe('biblioteca.falhou');
    expect(e.detalhes).toContain('database is locked');
    expect(e.detalhes).toContain('ruim');
    expect(e.detalhes).not.toContain('\u001b');
    expect(e.detalhes).not.toContain('segredo123');
  });

  it('tempo esgotado vira erro, não trava', async () => {
    const s = montar();
    m.respostas = () => ({ codigo: null, tempoEsgotado: true });
    expect(erroDe(await s.ler()).codigo).toBe('biblioteca.falhou');
  });

  it('lote rodando não impede de ler (ler não escreve nada)', async () => {
    const s = montar();
    m.loteRodando = true;
    expect((await s.ler()).ok).toBe(true);
  });

  it('caminhoDaFaixa: o arquivo no disco de uma faixa lida, e só dela', async () => {
    const s = montar();
    await s.ler();
    expect(s.caminhoDaFaixa(1)).toBe(join('D:\\Musica\\music', 'Hard Techno', 'Azyr', 'No Escape.wav'));
    expect(s.caminhoDaFaixa(999)).toBeNull();
    expect(s.caminhoDaFaixa(-1)).toBeNull();
  });

  it('caminhoDaFaixa nunca sai de music/ (um caminho com ".." do beets é recusado)', async () => {
    const s = montar();
    m.respostas = () => ({ stdout: '5\tA\tB\t0\t\tX\tFLAC\t1kbps\t/music/../../Windows/system.flac' });
    await s.ler();
    expect(s.caminhoDaFaixa(5)).toBeNull();
  });
});

describe('remover: pré-visualização, token e confirmação', () => {
  it('a prévia roda `ls` com cada termo como UM argumento e devolve o token', async () => {
    const s = montar();
    const r = await s.previaRemocao('artist:"Azyr" title:"Power (Extended Mix)"');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(m.chamadas[0]).toEqual(['ls', '-f', expect.any(String), 'artist:Azyr', 'title:Power (Extended Mix)']);
    expect(r.previa.token).toBe('token-1');
    expect(r.previa.faixas.map((f) => f.id)).toEqual([3]);
    expect(chamouBeet('remove')).toBe(false);
  });

  it('filtro inválido nem chega ao beets', async () => {
    const s = montar();
    for (const filtro of ['', '   ', '-d', 'title:"abc', '^title:x']) {
      const e = erroDe(await s.previaRemocao(filtro));
      expect(e.codigo).toBe('biblioteca.filtro-invalido');
    }
    expect(m.chamadas).toEqual([]);
  });

  it('a mensagem do filtro inválido diz o motivo', async () => {
    const s = montar();
    expect(erroDe(await s.previaRemocao('-f')).mensagem).toMatch(/opções do beets/);
    expect(erroDe(await s.previaRemocao('')).mensagem).toMatch(/biblioteca inteira/);
  });

  it('com lote rodando, nem a prévia: o erro aparece logo ao clicar', async () => {
    const s = montar();
    m.loteRodando = true;
    expect(erroDe(await s.previaRemocao('title:x')).codigo).toBe('biblioteca.ocupada');
    expect(m.chamadas).toEqual([]);
  });

  it('SEM token o remove nunca é chamado', async () => {
    const s = montar();
    for (const token of ['', 'inventado', 'token-1']) {
      const e = erroDe(await s.remover('title:Power', token));
      expect(e.codigo).toBe('biblioteca.mudou');
    }
    expect(chamouBeet('remove')).toBe(false);
  });

  it('o caminho feliz: remove -d -f com exatamente os termos da prévia', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:"Power (Extended Mix)"');
    if (!previa.ok) throw new Error('prévia');
    const r = await s.remover('title:"Power (Extended Mix)"', previa.previa.token);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.remocao.removidas).toEqual([{ artista: 'Azyr', titulo: 'Power (Extended Mix)' }]);
    const remove = m.chamadas.find((c) => c[0] === 'remove');
    expect(remove).toEqual(['remove', '-d', '-f', 'title:Power (Extended Mix)']);
    // a prévia vem antes e a conferência de novo na hora de apagar: ls, ls, remove
    expect(m.chamadas.map((c) => c[0])).toEqual(['ls', 'ls', 'remove']);
  });

  it('o token vale uma vez só', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    expect((await s.remover('title:Power', previa.previa.token)).ok).toBe(true);
    const e = erroDe(await s.remover('title:Power', previa.previa.token));
    expect(e.codigo).toBe('biblioteca.mudou');
    expect(m.chamadas.filter((c) => c[0] === 'remove')).toHaveLength(1);
  });

  it('o token de um filtro não serve para outro', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    const e = erroDe(await s.remover('title:Yeah', previa.previa.token));
    expect(e.codigo).toBe('biblioteca.mudou');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('o token expira', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    m.agora += VALIDADE_DO_TOKEN_MS + 1;
    expect(erroDe(await s.remover('title:Power', previa.previa.token)).codigo).toBe('biblioteca.mudou');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('o token de uma tarefa de manutenção não autoriza uma remoção', async () => {
    const s = montar();
    const previa = await s.previaManutencao('update');
    if (!previa.ok || !previa.previa.token) throw new Error('prévia');
    expect(erroDe(await s.remover('title:Power', previa.previa.token)).codigo).toBe('biblioteca.mudou');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('se o filtro passou a pegar outras faixas, recusa: "o que você conferiu não é o que seria apagado"', async () => {
    const s = montar();
    const previa = await s.previaRemocao('artist:Azyr');
    if (!previa.ok) throw new Error('prévia');
    expect(previa.previa.faixas).toHaveLength(2);
    // entre a prévia e a remoção, uma das faixas some do beets (outro programa, o Soulbeet importando...)
    m.respostas = (args) =>
      args[0] === 'ls' ? { stdout: lsPara(args).split('\n').slice(0, 1).join('\n') } : undefined;
    const e = erroDe(await s.remover('artist:Azyr', previa.previa.token));
    expect(e.codigo).toBe('biblioteca.mudou');
    expect(e.detalhes).toMatch(/2 faixa\(s\); agora o filtro pega 1/);
    expect(chamouBeet('remove')).toBe(false);
  });

  it('se passou a pegar MAIS faixas, também recusa', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    m.respostas = (args) => (args[0] === 'ls' ? { stdout: LS } : undefined);
    expect(erroDe(await s.remover('title:Power', previa.previa.token)).codigo).toBe('biblioteca.mudou');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('prévia que não pega nada: remoção recusada (nunca roda `remove` sem faixas)', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:NaoExiste');
    if (!previa.ok) throw new Error('prévia');
    expect(previa.previa.faixas).toEqual([]);
    expect(erroDe(await s.remover('title:NaoExiste', previa.previa.token)).codigo).toBe('biblioteca.mudou');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('lote rodando recusa remover mesmo com token', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    m.loteRodando = true;
    expect(erroDe(await s.remover('title:Power', previa.previa.token)).codigo).toBe('biblioteca.ocupada');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('stack caiu entre a prévia e a remoção: recusa', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    m.status = statusComSoulbeet('exited');
    expect(erroDe(await s.remover('title:Power', previa.previa.token)).codigo).toBe('biblioteca.stack-fora');
    expect(chamouBeet('remove')).toBe(false);
  });

  it('o beets falhou ao remover: erro com a saída dele', async () => {
    const s = montar();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    m.respostas = (args) => (args[0] === 'remove' ? { codigo: 1, stderr: 'error: permission denied' } : undefined);
    const e = erroDe(await s.remover('title:Power', previa.previa.token));
    expect(e.codigo).toBe('biblioteca.falhou');
    expect(e.detalhes).toContain('permission denied');
  });

  it('depois de remover, a lista de caminhos é esquecida (a tela relê)', async () => {
    const s = montar();
    await s.ler();
    expect(s.caminhoDaFaixa(3)).not.toBeNull();
    const previa = await s.previaRemocao('title:Power');
    if (!previa.ok) throw new Error('prévia');
    await s.remover('title:Power', previa.previa.token);
    expect(s.caminhoDaFaixa(3)).toBeNull();
  });
});

describe('manutenção', () => {
  async function espera(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
  }
  const tipos = () => m.eventos.map((e) => e.type);

  it('update e move: a prévia usa o -p do beets e devolve um token', async () => {
    const s = montar();
    m.respostas = (args) => (args[0] === 'update' ? { stdout: UPDATE_P } : undefined);
    const u = await s.previaManutencao('update');
    expect(u.ok && u.previa).toMatchObject({ tarefa: 'update', afetadas: 1, esquecidas: 1, token: 'token-1' });
    expect(m.chamadas[0]).toEqual(['update', '-p']);
    const mv = await s.previaManutencao('move');
    expect(mv.ok && mv.previa).toMatchObject({ tarefa: 'move', afetadas: 0, token: 'token-2' });
    expect(m.chamadas[1]).toEqual(['move', '-p']);
  });

  it('move -p: o resumo vem no stderr do beets e a lista no stdout; a prévia junta os dois', async () => {
    const s = montar();
    const fx = (n: string) => readFileSync(join(import.meta.dirname, '..', 'fixtures', 'biblioteca', n), 'utf8');
    m.respostas = (args) =>
      args[0] === 'move' ? { stdout: fx('move-p-1-stdout.txt'), stderr: fx('move-p-1-stderr.txt') } : undefined;
    const r = await s.previaManutencao('move');
    expect(r.ok && r.previa).toMatchObject({ tarefa: 'move', afetadas: 1 });
    expect(r.ok && r.previa.linhas.join('\n')).toContain('-> /music/Techno/Azyr/Power (Extended Mix).wav');
  });

  it('tomEBpm e importLeftovers não consultam o beets na prévia', async () => {
    const s = montar();
    for (const t of ['tomEBpm', 'importLeftovers'] as const) {
      const r = await s.previaManutencao(t);
      expect(r.ok && r.previa.token).toBeNull();
    }
    expect(m.chamadas).toEqual([]);
  });

  it('update e move SEM token não rodam', async () => {
    const s = montar();
    for (const tarefa of ['update', 'move'] as const) {
      expect(erroDe(await s.manutencao(tarefa, null)).codigo).toBe('biblioteca.mudou');
      expect(erroDe(await s.manutencao(tarefa, 'inventado')).codigo).toBe('biblioteca.mudou');
    }
    expect(m.streams).toEqual([]);
    expect(m.eventos).toEqual([]);
  });

  it('o token de update não serve para move', async () => {
    const s = montar();
    const u = await s.previaManutencao('update');
    if (!u.ok || !u.previa.token) throw new Error('prévia');
    expect(erroDe(await s.manutencao('move', u.previa.token)).codigo).toBe('biblioteca.mudou');
    expect(m.streams).toEqual([]);
  });

  it('update com token: roda `update` (sem -p), emite início, linhas sem cor e fim', async () => {
    const s = montar();
    const u = await s.previaManutencao('update');
    if (!u.ok || !u.previa.token) throw new Error('prévia');
    const r = await s.manutencao('update', u.previa.token);
    expect(r).toEqual({ ok: true, id: 'op-1', tarefa: 'update' });
    await espera();
    expect(m.streams[0]?.args).toEqual(['update']);
    m.streams[0]?.linhas('\u001b[1;31m  deleted\u001b[39;49;00m');
    m.streams[0]?.linhas('   ');
    m.streams[0]?.terminar({ codigo: 0 });
    await espera();
    expect(m.eventos).toContainEqual({ type: 'library.start', id: 'op-1', tarefa: 'update' });
    expect(m.eventos).toContainEqual({ type: 'library.log', id: 'op-1', linha: '  deleted' });
    expect(m.eventos.at(-1)).toEqual({ type: 'library.end', id: 'op-1', tarefa: 'update', ok: true });
    expect(s.emAndamento).toBeNull();
  });

  it('tomEBpm roda keyfinder e depois autobpm, uma etapa por vez', async () => {
    const s = montar();
    await s.manutencao('tomEBpm', null);
    await espera();
    expect(m.streams.map((x) => x.args)).toEqual([['keyfinder']]);
    m.streams[0]?.terminar({ codigo: 0 });
    await espera();
    expect(m.streams.map((x) => x.args)).toEqual([['keyfinder'], ['autobpm']]);
    expect(s.emAndamento).not.toBeNull();
    m.streams[1]?.terminar({ codigo: 0 });
    await espera();
    expect(m.eventos.at(-1)).toMatchObject({ type: 'library.end', ok: true });
  });

  it('falha de uma etapa: para ali, com a saída dela no erro', async () => {
    const s = montar();
    await s.manutencao('tomEBpm', null);
    await espera();
    m.streams[0]?.linhas('keyfinder: no key returned');
    m.streams[0]?.terminar({ codigo: 1 });
    await espera();
    expect(m.streams).toHaveLength(1); // o autobpm não chegou a rodar
    const fim = m.eventos.at(-1);
    expect(fim).toMatchObject({ type: 'library.end', ok: false });
    expect(fim?.type === 'library.end' && fim.error?.codigo).toBe('biblioteca.falhou');
    expect(fim?.type === 'library.end' && fim.error?.detalhes).toContain('no key returned');
    expect(s.emAndamento).toBeNull();
  });

  it('importLeftovers: um `import -q -s` com /downloads/<nome> de cada item parado, lidos na hora', async () => {
    const s = montar();
    m.parados = [
      { nome: 'f_hard', arquivos: ['a.mp3'], total: 1, modificadoEm: 1 },
      { nome: 'solto.flac', arquivos: ['solto.flac'], total: 1, modificadoEm: 1 },
    ];
    await s.manutencao('importLeftovers', null);
    await espera();
    expect(m.streams[0]?.args).toEqual(['import', '-q', '-s', '/downloads/f_hard', '/downloads/solto.flac']);
    m.streams[0]?.terminar({ codigo: 0 });
    await espera();
    expect(m.eventos.at(-1)).toMatchObject({ type: 'library.end', ok: true });
  });

  it('importLeftovers sem nada parado: termina bem sem chamar o beets', async () => {
    const s = montar();
    await s.manutencao('importLeftovers', null);
    await espera();
    expect(m.streams).toEqual([]);
    expect(m.eventos.map((e) => e.type)).toEqual(['library.start', 'library.log', 'library.end']);
    expect(m.eventos.at(-1)).toMatchObject({ ok: true });
  });

  it('uma por vez: pedir outra enquanto uma roda devolve a que roda', async () => {
    const s = montar();
    const primeira = await s.manutencao('tomEBpm', null);
    const segunda = await s.manutencao('importLeftovers', null);
    expect(segunda).toEqual(primeira);
    await espera();
    expect(m.streams).toHaveLength(1);
    expect(tipos().filter((t) => t === 'library.start')).toHaveLength(1);
  });

  it('com lote rodando ou a stack fora, nenhuma tarefa começa', async () => {
    let s = montar();
    m.loteRodando = true;
    expect(erroDe(await s.manutencao('tomEBpm', null)).codigo).toBe('biblioteca.ocupada');
    expect(erroDe(await s.previaManutencao('update')).codigo).toBe('biblioteca.ocupada');
    s = montar();
    m.status = statusComSoulbeet('exited');
    expect(erroDe(await s.manutencao('tomEBpm', null)).codigo).toBe('biblioteca.stack-fora');
    expect(erroDe(await s.previaManutencao('move')).codigo).toBe('biblioteca.stack-fora');
    expect(m.streams).toEqual([]);
    expect(m.eventos).toEqual([]);
  });

  it('cancelar (ao sair do app) interrompe a espera e termina a operação', async () => {
    const s = montar();
    await s.manutencao('tomEBpm', null);
    await espera();
    s.cancelar();
    await espera();
    expect(m.streams[0]?.encerrado).toBe(true);
    expect(s.emAndamento).toBeNull();
    // o autobpm não começa depois de o app mandar parar
    expect(m.streams).toHaveLength(1);
  });

  it('Docker sumiu no meio: erro de ambiente, não "o beets falhou"', async () => {
    const s = montar();
    await s.manutencao('tomEBpm', null);
    await espera();
    m.streams[0]?.terminar({ codigo: null, erroSpawn: Object.assign(new Error('x'), { code: 'ENOENT' }) });
    await espera();
    const fim = m.eventos.at(-1);
    expect(fim?.type === 'library.end' && fim.error?.codigo).toBe('docker.ausente');
  });
});
