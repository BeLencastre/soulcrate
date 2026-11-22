// RekordboxService: lê o beets e as listas que já rodaram, grava o rekordbox XML e o refaz sozinho quando a
// biblioteca muda, mas só depois de a pessoa tê-lo gerado uma vez. A biblioteca, as listas e o disco são dublês.
import { beforeEach, describe, expect, it } from 'vitest';
import type { FaixaDaBiblioteca, ResultadoLeitura } from '../../src/shared/biblioteca';
import { criarErro } from '../../src/shared/erros';
import type { MainEvent } from '../../src/shared/ipc';
import type { LinhaAnalise } from '../../src/shared/analise-lista';
import type { ListaRef, ResultadoAnalise } from '../../src/shared/lote';
import type { OrganizacaoDasPastas } from '../../src/shared/organizacao';
import { caminhoDoXml, RekordboxService, type FsRekordbox } from '../../src/main/services/rekordbox-service';
import { ate } from './ajudantes';

const DIR = 'C:\\Soulcrate';
const XML = caminhoDoXml(DIR);
const ESTADO = (lista: string) => `C:\\Soulcrate\\lotes\\estado-${lista}.tsv`;

const faixa = (id: number, arquivo: string, titulo = `Faixa ${id}`): FaixaDaBiblioteca => ({
  id,
  artista: 'Azyr',
  titulo,
  bpm: 150,
  tom: 'F#m',
  genero: 'Hard Techno',
  formato: 'FLAC',
  arquivo,
  semGenero: false,
});

const linha = (sourceLine: number, extra: Partial<LinhaAnalise>): LinhaAnalise => ({
  sourceLine,
  line: `Azyr - Faixa ${sourceLine}`,
  key: `azyr faixa ${sourceLine}`,
  artist: 'Azyr',
  title: `Faixa ${sourceLine}`,
  mix: '',
  original: true,
  remixer: false,
  queries: [],
  status: 'ja feita',
  duplicateOf: null,
  previous: 'importada',
  warnings: [],
  libraryId: null,
  ...extra,
});

const analise = (lines: LinhaAnalise[], extra: { libraryChecked?: boolean } = {}): ResultadoAnalise => ({
  analise: {
    v: 1,
    ok: true,
    list: 'x',
    total: lines.length,
    unique: lines.length,
    duplicates: 0,
    alreadyDone: 0,
    libraryChecked: extra.libraryChecked ?? true,
    inLibrary: 0,
    toProcess: 0,
    lines,
  },
  ultimaExecucaoEm: 1,
});

const ref = (nome: string): ListaRef => ({ nome, tipo: 'txt', modificadaEm: 1, bytes: 10 });

interface Mundo {
  leitura: ResultadoLeitura | Promise<ResultadoLeitura>;
  leituras: number;
  listas: ListaRef[];
  analises: Record<string, () => Promise<ResultadoAnalise>>;
  analisadas: string[];
  arquivos: Map<string, { conteudo: string; em: number }>;
  falharGravacao: boolean;
  eventos: MainEvent[];
  dir: string | null;
  relogio: number;
  organizacao: OrganizacaoDasPastas;
}
let m: Mundo;

function montar(): RekordboxService {
  m = {
    leitura: {
      ok: true,
      leitura: {
        pastaMusica: 'C:\\DJ\\Musics',
        pastaDownloads: 'C:\\DJ\\Downloads',
        lidaEm: 1,
        faixas: [faixa(1, 'Hard Techno/Azyr/A.flac', 'A'), faixa(2, 'Acid Techno/Azyr/B.flac', 'B')],
        ignoradas: 0,
        parados: [],
      },
    },
    leituras: 0,
    listas: [],
    analises: {},
    analisadas: [],
    arquivos: new Map(),
    falharGravacao: false,
    eventos: [],
    dir: DIR,
    relogio: 1000,
    organizacao: 'genero',
  };
  const fs: FsRekordbox = {
    modificadoEm: (c) => m.arquivos.get(c)?.em ?? null,
    existe: (c) => m.arquivos.has(c),
    escreverAtomico(c, conteudo) {
      if (m.falharGravacao) throw new Error('EPERM: operation not permitted');
      m.arquivos.set(c, { conteudo, em: ++m.relogio });
    },
  };
  return new RekordboxService({
    biblioteca: {
      ler: () => {
        m.leituras++;
        return Promise.resolve(m.leitura);
      },
    },
    listas: {
      recentes: () => m.listas,
      analisar: (_dir, nome, opcoes, extra) => {
        // com a biblioteca, e sem cancelar a análise que o editor esteja fazendo da mesma lista
        expect(opcoes).toEqual({ biblioteca: true, retentar: false });
        expect(extra).toEqual({ independente: true });
        m.analisadas.push(nome);
        const a = m.analises[nome];
        return a ? a() : Promise.reject(new Error(`sem análise para ${nome}`));
      },
    },
    projeto: () => ({ dir: m.dir, origem: 'configurada' }),
    organizacao: (dir) => {
      expect(dir).toBe(DIR);
      return m.organizacao;
    },
    fs,
    versao: '9.9.9',
    emitir: (e) => m.eventos.push(e),
  });
}

const xml = () => m.arquivos.get(XML)?.conteudo ?? '';
const estados = () => m.eventos.flatMap((e) => (e.type === 'rekordbox.state' ? [e.estado] : []));

let svc: RekordboxService;
beforeEach(() => {
  svc = montar();
});

describe('gerar', () => {
  it('grava na pasta do Soulcrate uma playlist por gênero e devolve o resumo', async () => {
    expect(svc.estado()).toEqual({ caminho: XML, geradoEm: null, resumo: null, gerando: false, erro: null });
    const r = await svc.gerar();
    expect(XML).toBe('C:\\Soulcrate\\rekordbox\\soulcrate.xml');
    expect(r).toEqual({
      ok: true,
      estado: {
        caminho: XML,
        geradoEm: 1001,
        resumo: { faixas: 2, generos: 2, listas: 0, listasComFalha: [] },
        gerando: false,
        erro: null,
      },
    });
    expect(xml()).toContain('<PRODUCT Name="Soulcrate" Version="9.9.9" Company="Soulcrate" />');
    expect(xml()).toContain('<NODE Type="1" Name="Acid Techno" KeyType="0" Entries="1">');
    expect(xml()).toContain('Location="file://localhost/C:/DJ/Musics/Hard%20Techno/Azyr/A.flac"');
    // o cartão acompanha: começou (gerando) e terminou
    expect(estados().map((e) => e.gerando)).toEqual([true, false]);
  });

  it('a escolha do Rekordbox por gênero e artista: cada gênero vira pasta com Todas e uma playlist por artista', async () => {
    m.organizacao = 'genero-artista';
    await svc.gerar();
    expect(xml()).toContain('<NODE Type="0" Name="Acid Techno" Count="2">');
    expect(xml()).toContain('<NODE Type="1" Name="Todas" KeyType="0" Entries="1">');
    expect(xml()).toContain('<NODE Type="1" Name="Azyr" KeyType="0" Entries="1">');
    expect(xml()).not.toContain('<NODE Type="1" Name="Acid Techno"');
  });

  it('Rekordbox por gênero e artista mesmo com o disco só por gênero: o artista sai do nome do arquivo', async () => {
    m.organizacao = 'genero-artista';
    const lida = await m.leitura;
    if (!lida.ok) throw new Error('leitura do dublê');
    m.leitura = {
      ok: true,
      leitura: {
        ...lida.leitura,
        faixas: [faixa(1, 'Hard Techno/Azyr - A.flac', 'A'), faixa(2, 'Hard Techno/Vendex - B.flac', 'B')],
      },
    };
    await svc.gerar();
    expect(xml()).toContain('<NODE Type="0" Name="Hard Techno" Count="3">');
    expect(xml()).toContain('<NODE Type="1" Name="Azyr" KeyType="0" Entries="1">');
    expect(xml()).toContain('<NODE Type="1" Name="Vendex" KeyType="0" Entries="1">');
    expect(xml()).toContain('Location="file://localhost/C:/DJ/Musics/Hard%20Techno/Azyr%20-%20A.flac"');
  });

  it('uma playlist por lista que já rodou, na ordem da lista; a que nunca rodou nem é analisada', async () => {
    m.listas = [ref('techno-pesado.txt'), ref('nunca-rodou.txt')];
    m.arquivos.set(ESTADO('techno-pesado'), { conteudo: '', em: 1 });
    m.analises['techno-pesado.txt'] = () =>
      Promise.resolve(
        analise([
          linha(1, { libraryId: 2 }),
          linha(2, { libraryId: null, status: 'nova' }),
          linha(3, { libraryId: 1, status: 'ja na biblioteca' }),
          linha(4, { libraryId: 2, status: 'repetida', duplicateOf: 1 }),
        ]),
      );
    const r = await svc.gerar();
    expect(m.analisadas).toEqual(['techno-pesado.txt']);
    expect(r.ok && r.estado.resumo).toEqual({ faixas: 2, generos: 2, listas: 1, listasComFalha: [] });
    expect(xml()).toMatch(
      /<NODE Type="1" Name="techno-pesado" KeyType="0" Entries="2">\s*<TRACK Key="2" \/>\s*<TRACK Key="1" \/>/,
    );
  });

  it('uma lista que não deu para analisar fica de fora, sem derrubar o resto', async () => {
    m.listas = [ref('quebrada.txt'), ref('sem-beets.txt'), ref('antiga.txt'), ref('boa.txt')];
    for (const l of ['quebrada', 'sem-beets', 'antiga', 'boa']) m.arquivos.set(ESTADO(l), { conteudo: '', em: 1 });
    m.analises['quebrada.txt'] = () => Promise.reject(new Error('A análise da lista demorou demais.'));
    m.analises['sem-beets.txt'] = () =>
      Promise.resolve(analise([linha(1, { libraryId: 1 })], { libraryChecked: false }));
    // script anterior à stack 1.3.0: a análise não traz o libraryId
    m.analises['antiga.txt'] = () => {
      const semId: LinhaAnalise = linha(1, {});
      delete semId.libraryId;
      return Promise.resolve(analise([semId]));
    };
    m.analises['boa.txt'] = () => Promise.resolve(analise([linha(1, { libraryId: 1 })]));
    const r = await svc.gerar();
    expect(r.ok && r.estado.resumo?.listasComFalha).toEqual(['quebrada.txt', 'sem-beets.txt', 'antiga.txt']);
    expect(r.ok && r.estado.resumo?.listas).toBe(1);
    expect(xml()).toContain('Name="boa"');
  });

  it('stack desligada: devolve o erro da leitura e não grava nada', async () => {
    m.leitura = { ok: false, erro: criarErro('biblioteca.stack-fora') };
    const r = await svc.gerar();
    expect(r).toEqual({ ok: false, erro: expect.objectContaining({ codigo: 'biblioteca.stack-fora' }) });
    expect(m.arquivos.has(XML)).toBe(false);
    expect(svc.estado()?.erro?.codigo).toBe('biblioteca.stack-fora');
  });

  it('não conseguiu gravar: o erro do catálogo, com o caminho nos detalhes', async () => {
    m.falharGravacao = true;
    const r = await svc.gerar();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.codigo).toBe('rekordbox.nao-gravou');
    expect(r.erro.titulo).toBe('Não consegui gravar o arquivo para o Rekordbox');
    expect(r.erro.detalhes).toContain(XML);
    expect(r.erro.acoes.map((a) => a.id)).toEqual(['tentarDeNovo', 'copiarDetalhes', 'abrirLog']);
  });

  it('sem pasta do Soulcrate: sem estado e sem gravar', async () => {
    m.dir = null;
    expect(svc.estado()).toBeNull();
    const r = await svc.gerar();
    expect(r.ok === false && r.erro.codigo).toBe('projeto.ausente');
  });

  it('dois cliques: uma geração só', async () => {
    let soltar: (r: ResultadoLeitura) => void = () => undefined;
    const pronta = m.leitura as ResultadoLeitura;
    m.leitura = new Promise<ResultadoLeitura>((r) => (soltar = r));
    const a = svc.gerar();
    const b = svc.gerar();
    expect(svc.estado()?.gerando).toBe(true);
    soltar(pronta);
    expect(await a).toEqual(await b);
    expect(m.leituras).toBe(1);
  });
});

describe('atualizar sozinho', () => {
  it('não cria o arquivo: só refaz o que a pessoa já gerou uma vez', async () => {
    svc.atualizarSeJaExiste();
    await Promise.resolve();
    expect(m.leituras).toBe(0);
    expect(m.arquivos.has(XML)).toBe(false);

    await svc.gerar();
    m.leitura = {
      ok: true,
      leitura: {
        ...(m.leitura as Extract<ResultadoLeitura, { ok: true }>).leitura,
        faixas: [faixa(9, 'Techno/X/Z.flac')],
      },
    };
    svc.atualizarSeJaExiste();
    await ate(() => xml().includes('TrackID="9"'));
    expect(xml()).not.toContain('TrackID="1"');
  });

  it('a biblioteca mudou durante uma geração: refaz quando ela termina', async () => {
    await svc.gerar();
    let soltar: (r: ResultadoLeitura) => void = () => undefined;
    const pronta = m.leitura as ResultadoLeitura;
    m.leitura = new Promise<ResultadoLeitura>((r) => (soltar = r));
    svc.atualizarSeJaExiste();
    svc.atualizarSeJaExiste();
    svc.atualizarSeJaExiste();
    expect(m.leituras).toBe(2);
    m.leitura = pronta;
    soltar(pronta);
    await ate(() => m.leituras === 3 && !svc.estado()?.gerando);
    expect(m.leituras).toBe(3);
  });

  it('uma falha automática fica no estado, para o cartão mostrar', async () => {
    await svc.gerar();
    m.falharGravacao = true;
    svc.atualizarSeJaExiste();
    await ate(() => svc.estado()?.erro !== null && !svc.estado()?.gerando);
    expect(svc.estado()?.erro?.codigo).toBe('rekordbox.nao-gravou');
    // o resumo da última geração boa continua
    expect(svc.estado()?.resumo?.faixas).toBe(2);
    expect(estados().at(-1)?.erro?.codigo).toBe('rekordbox.nao-gravou');
  });
});
