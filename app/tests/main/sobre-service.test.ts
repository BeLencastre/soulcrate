import { describe, expect, it } from 'vitest';
import type { ContainerPs } from '../../src/main/docker-parsers';
import { SobreService, type DependenciasSobre } from '../../src/main/services/sobre-service';
import { versaoDaImagem, versaoDoBeets, versaoDoSlskd } from '../../src/shared/sobre';
import { statusInicial, type ContainerEstado, type StackStatus } from '../../src/shared/stack';

describe('leitura de versões', () => {
  it('versaoDaImagem: só um rótulo que é versão', () => {
    expect(versaoDaImagem('slskd/slskd:0.26.0')).toBe('0.26.0');
    expect(versaoDaImagem('deluan/navidrome:0.64.2')).toBe('0.64.2');
    expect(versaoDaImagem('deluan/navidrome:v0.64.2')).toBe('0.64.2');
    expect(versaoDaImagem('docker.io/slskd/slskd:0.26.0@sha256:abc')).toBe('0.26.0');
    expect(versaoDaImagem('local/soulbeet-dj:latest')).toBeNull();
    expect(versaoDaImagem('docccccc/soulbeet:full')).toBeNull();
    expect(versaoDaImagem('registro:5000/imagem')).toBeNull();
    expect(versaoDaImagem('imagem-sem-tag')).toBeNull();
    expect(versaoDaImagem(undefined)).toBeNull();
    expect(versaoDaImagem('')).toBeNull();
  });

  it('versaoDoBeets: a primeira linha de `beet version`', () => {
    expect(versaoDoBeets('beets version 2.11.0\nPython version 3.11.2\nplugins: autobpm, keyfinder')).toBe('2.11.0');
    expect(versaoDoBeets('Traceback (most recent call last)')).toBeNull();
    expect(versaoDoBeets('')).toBeNull();
  });

  it('versaoDoSlskd: `version.current` do GET /api/v0/application', () => {
    expect(versaoDoSlskd({ version: { current: '0.26.0', full: '0.26.0.0' } })).toBe('0.26.0');
    expect(versaoDoSlskd({ version: { full: 'v0.26.0.0' } })).toBe('0.26.0.0');
    expect(versaoDoSlskd({ shares: { files: 3 } })).toBeNull();
    expect(versaoDoSlskd(null)).toBeNull();
    expect(versaoDoSlskd({ version: { current: 'dev' } })).toBeNull();
  });
});

function statusCom(
  noAr: Partial<Record<'slskd' | 'soulbeet' | 'navidrome', ContainerEstado>>,
  engine = true,
): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    docker: { ...base.docker, engine },
    servicos: base.servicos.map((s) => ({
      ...s,
      container: noAr[s.id] ?? 'ausente',
      saude: noAr[s.id] === 'running' ? 'healthy' : 'nenhuma',
      http: noAr[s.id] === 'running' ? true : null,
    })),
  };
}

const ps = (servico: string, imagem?: string): ContainerPs => ({
  servico,
  nome: servico,
  estado: 'running',
  saude: 'healthy',
  status: 'Up',
  ...(imagem ? { imagem } : {}),
});

const PS_COMPLETO = [
  ps('slskd', 'slskd/slskd:0.26.0'),
  ps('soulbeet', 'local/soulbeet-dj:latest'),
  ps('navidrome', 'deluan/navidrome:0.64.2'),
];
const TODOS = { slskd: 'running', soulbeet: 'running', navidrome: 'running' } as const;

function criar(
  o: Partial<DependenciasSobre> & {
    status?: StackStatus;
    psResultado?: ContainerPs[] | null;
    beets?: { codigo: number; stdout: string };
  } = {},
) {
  const comandos: string[][] = [];
  const s = new SobreService({
    docker: {
      composePs: () => Promise.resolve(o.psResultado === undefined ? PS_COMPLETO : o.psResultado),
      exec: (_dir, servico, comando) => {
        comandos.push([servico, ...comando]);
        const r = o.beets ?? { codigo: 0, stdout: 'beets version 2.11.0\nPython version 3.11\n' };
        return Promise.resolve({ ...r, stderr: '', tempoEsgotado: false, erroSpawn: null });
      },
    },
    health: { atual: o.status ?? statusCom(TODOS) },
    projeto: () => ({ dir: 'C:\\Soulcrate', origem: 'configurada' }),
    slskdVersao: () => Promise.resolve('0.26.0'),
    versaoDaStack: () => '1.0.0',
    versaoDaStackDoApp: () => '1.1.0',
    app: {
      versao: '1.2.3',
      electron: '44',
      chromium: '140',
      node: '24',
      plataforma: 'win32',
      arquitetura: 'x64',
      empacotado: true,
    },
    aoErro: () => undefined,
    ...o,
  });
  return { s, comandos };
}

describe('SobreService', () => {
  it('stack no ar: slskd pela API, beets pelo contêiner e Navidrome pelo rótulo da imagem', async () => {
    const { s, comandos } = criar();
    const info = await s.info();
    expect(info.app.versao).toBe('1.2.3');
    expect(info.stack).toEqual({ instalada: '1.0.0', doApp: '1.1.0' });
    expect(info.componentes).toEqual([
      { id: 'slskd', nome: 'slskd', versao: '0.26.0', fonte: 'conteiner', motivo: null },
      { id: 'beets', nome: 'Soulbeet · beets', versao: '2.11.0', fonte: 'conteiner', motivo: null },
      { id: 'navidrome', nome: 'Navidrome', versao: '0.64.2', fonte: 'imagem', motivo: null },
    ]);
    // o único comando do beets é o `version`, dentro do contêiner do Soulbeet
    expect(comandos).toHaveLength(1);
    expect(comandos[0]?.[0]).toBe('soulbeet');
    expect(comandos[0]?.at(-1)).toBe('version');
  });

  it('slskd que não responde pela API cai para o rótulo da imagem', async () => {
    const { s } = criar({ slskdVersao: () => Promise.resolve(null) });
    expect((await s.componentes())[0]).toMatchObject({ versao: '0.26.0', fonte: 'imagem' });
  });

  it('sem pasta do Soulcrate, ou com o Docker fechado, diz por quê e não roda nada', async () => {
    const semPasta = criar({ projeto: () => ({ dir: null, origem: null }) });
    expect((await semPasta.s.componentes()).map((c) => c.motivo)).toEqual(['sem-pasta', 'sem-pasta', 'sem-pasta']);
    const fechado = criar({ status: statusCom({}, false) });
    expect((await fechado.s.componentes()).map((c) => c.motivo)).toEqual(['docker-fora', 'docker-fora', 'docker-fora']);
    expect(fechado.comandos).toEqual([]);
  });

  it('stack desligada: o `docker compose ps` sem contêineres não dá versão, e a tela diz "ligue a stack"', async () => {
    const { s, comandos } = criar({ status: statusCom({}), psResultado: [] });
    const c = await s.componentes();
    expect(c.every((x) => x.versao === null && x.motivo === 'stack-desligada')).toBe(true);
    expect(comandos).toEqual([]);
  });

  it('o beets falhando não derruba os outros', async () => {
    const { s } = criar({ beets: { codigo: 1, stdout: 'Traceback' } });
    const c = await s.componentes();
    expect(c[1]).toMatchObject({ id: 'beets', versao: null, motivo: 'nao-lida' });
    expect(c[0]?.versao).toBe('0.26.0');
    expect(c[2]?.versao).toBe('0.64.2');
  });

  it('o compose ps que lança também não derruba a tela', async () => {
    const erros: unknown[] = [];
    const { s } = criar({
      aoErro: (e) => erros.push(e),
      docker: {
        composePs: () => Promise.reject(new Error('docker travou')),
        exec: () => Promise.reject(new Error('docker travou')),
      },
    });
    const c = await s.componentes();
    expect(c).toHaveLength(3);
    expect(erros.length).toBeGreaterThan(0);
  });
});
