import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ListasService } from '../../src/main/services/listas-service';
import { RelatoriosService } from '../../src/main/services/relatorios-service';
import { msg } from '../../src/shared/mensagens';
import { ExecutorFalso, OK } from './ajudantes';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'lote');
const T = '2026-10-07T15:48:09.420-03:00';
const INICIO_MS = Date.parse(T);

const ID_NOVO = '20261007-154809';
const ID_ANTIGO = '20261005-210000';
const ID_LOG = '20261001-100000';
const ID_RODANDO = '20261008-090000';
const AGORA = Date.parse('2026-10-08T12:00:00-03:00');

let dir: string;
let vivos: Set<number>;
let erros: unknown[];
let descartados: string[];
let analises: number;
/** o que "o script" devolve no `-SoAnalisar` */
let aoAnalisar: () => void;
let linhasDaAnalise: { sourceLine: number; key: string; status?: string }[];
let falharAoDescartar: (caminho: string) => boolean;
let svc: RelatoriosService;

const lotes = () => join(dir, 'lotes');
const escrever = (rel: string, conteudo: string | Buffer = '') => {
  const abs = join(dir, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, conteudo);
  return abs;
};
const copiarFixture = (nome: string, destino: string) => {
  mkdirSync(dirname(join(dir, destino)), { recursive: true });
  copyFileSync(join(FIXTURES, nome), join(dir, destino));
};
const datar = (rel: string, ms: number) => utimesSync(join(dir, ...rel.split('/')), ms / 1000, ms / 1000);

const ev = (type: string, resto: object = {}) => JSON.stringify({ v: 1, t: T, type, ...resto });
const linhaDeEventos = (...eventos: string[]) => `${eventos.join('\n')}\n`;
const runStart = (id: string, lista = 'lista.txt', total = 1, extra: object = {}) =>
  ev('run.start', {
    id,
    pid: 4242,
    list: lista,
    listName: 'lista',
    total,
    options: { Paralelo: 5, AceitarWav: false },
    files: { state: 'lotes/estado-lista.tsv' },
    powershell: '5.1',
    ...extra,
  });
const final = (key: string, line: string, status: string, extra: object = {}) =>
  ev('item.final', { key, line, status, note: '', via: '', local: null, user: null, format: null, ...extra });
const runEnd = (summary: object, reason = 'completed', exitCode = 0) =>
  ev('run.end', { reason, exitCode, message: '', summary, files: {} });

function criar(): RelatoriosService {
  const executor = new ExecutorFalso((_c, args) => {
    analises++;
    aoAnalisar();
    const saida = args[args.indexOf('-SaidaAnalise') + 1] as string;
    writeFileSync(
      saida,
      JSON.stringify({
        v: 1,
        ok: true,
        list: 'x',
        total: linhasDaAnalise.length,
        unique: linhasDaAnalise.length,
        duplicates: 0,
        alreadyDone: 0,
        libraryChecked: false,
        inLibrary: null,
        toProcess: linhasDaAnalise.length,
        lines: linhasDaAnalise.map((l) => ({
          line: l.key,
          artist: '',
          title: '',
          mix: '',
          original: true,
          remixer: false,
          queries: [],
          duplicateOf: null,
          previous: null,
          warnings: [],
          status: 'nova',
          ...l,
        })),
      }),
    );
    return OK();
  });
  const listas = new ListasService({ executor, agora: () => AGORA });
  return new RelatoriosService({
    projeto: () => ({ dir, origem: 'configurada' }),
    agora: () => AGORA,
    processoVivo: (pid) => vivos.has(pid),
    pastas: () => ({ musica: join(dir, 'music'), downloads: join(dir, 'downloads') }),
    listas,
    descartar: (caminho) => {
      if (falharAoDescartar(caminho)) return Promise.reject(new Error('em uso'));
      descartados.push(caminho);
      rmSync(caminho, { force: true });
      return Promise.resolve();
    },
    aoErro: (e) => erros.push(e),
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sc-relatorios-'));
  vivos = new Set();
  erros = [];
  descartados = [];
  analises = 0;
  linhasDaAnalise = [];
  aoAnalisar = () => undefined;
  falharAoDescartar = () => false;
  mkdirSync(lotes(), { recursive: true });
  // uma execução do app, completa (fixture real), e uma do .bat, só com os relatórios
  copiarFixture('eventos-completo.jsonl', `lotes/eventos-${ID_NOVO}.jsonl`);
  copiarFixture('resultado-exemplo.txt', `lotes/resultado-${ID_NOVO}.txt`);
  copiarFixture('nao-baixadas-exemplo.txt', `lotes/nao-baixadas-${ID_NOVO}.txt`);
  copiarFixture('diagnostico-exemplo.txt', `lotes/diagnostico-${ID_NOVO}.txt`);
  escrever(`lotes/execucao-${ID_NOVO}.log`, 'tela');
  copiarFixture('estado-lista.tsv', 'lotes/estado-lista.tsv');
  copiarFixture('resultado-exemplo.txt', `lotes/resultado-${ID_ANTIGO}.txt`);
  copiarFixture('diagnostico-exemplo.txt', `lotes/diagnostico-${ID_ANTIGO}.txt`);
  copiarFixture('nao-baixadas-exemplo.txt', `lotes/nao-baixadas-${ID_ANTIGO}.txt`);
  svc = criar();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('listar', () => {
  it('lê as execuções do app e as do .bat, da mais recente para a mais antiga', async () => {
    escrever(`lotes/execucao-${ID_LOG}.log`, 'só o log');
    const r = await svc.listar();
    expect(r.map((x) => [x.id, x.fonte, x.fim])).toEqual([
      [ID_NOVO, 'eventos', 'completed'],
      [ID_ANTIGO, 'resultado', 'completed'],
      [ID_LOG, 'log', 'interrupted'],
    ]);
    const novo = r[0];
    expect(novo).toMatchObject({
      lista: 'lista.txt',
      duracaoMs: 26_347,
      temFaltas: true,
      contagem: { total: 6, ok: 4, naoVieram: 2, puladas: 0 },
    });
    expect(novo?.inicio).toBe(INICIO_MS);
    // a antiga não registrou a lista; a data vem do id, e a duração da gravação do relatório
    expect(r[1]).toMatchObject({ lista: null, contagem: { total: 6, ok: 4, naoVieram: 2 } });
    expect(r[1]?.inicio).toBe(new Date(2026, 9, 5, 21, 0, 0).getTime());
    expect(r[2]?.mensagem).toBe(msg.historico.semRelatorio);
  });

  it('ignora o que não é uma execução: a memória das listas, a trava, o cache do catálogo e nomes estranhos', async () => {
    mkdirSync(join(lotes(), 'catalogo-mb'));
    escrever('lotes/estado-outra.tsv', 'x');
    escrever('lotes/parar-solto.flag', '');
    escrever('lotes/resultado-nome com espaço.txt', 'x');
    escrever('lotes/README.txt', 'x');
    expect((await svc.listar()).map((x) => x.id).sort()).toEqual([ID_ANTIGO, ID_NOVO].sort());
  });

  it('o lote que o processo ainda segura (trava com PID vivo) está rodando, com o andamento do último progress', async () => {
    escrever(
      `lotes/eventos-${ID_RODANDO}.jsonl`,
      linhaDeEventos(
        runStart(ID_RODANDO, 'set.txt', 30),
        ev('progress', { done: 14, total: 30, ok: 10, notFound: 2, failed: 2, etaMin: 5 }),
      ),
    );
    escrever('lotes/estado-set.lock', `4242\t${T}\t${ID_RODANDO}\n`);
    vivos.add(4242);
    const r = (await svc.listar()).find((x) => x.id === ID_RODANDO);
    expect(r).toMatchObject({
      fim: 'rodando',
      lista: 'set.txt',
      progresso: { feitas: 14, total: 30 },
      contagem: { ok: 10, naoVieram: 4, total: 30 },
    });
  });

  it('o mesmo arquivo sem processo vivo é um lote interrompido', async () => {
    escrever(`lotes/eventos-${ID_RODANDO}.jsonl`, linhaDeEventos(runStart(ID_RODANDO, 'set.txt', 30)));
    escrever('lotes/estado-set.lock', `4242\t${T}\t${ID_RODANDO}\n`);
    const r = (await svc.listar()).find((x) => x.id === ID_RODANDO);
    expect(r?.fim).toBe('interrupted');
  });

  it('um arquivo de eventos enorme é lido só pelas pontas (o fim traz o run.end)', async () => {
    const id = '20261009-100000';
    const progresso = ev('progress', { done: 1, total: 3, ok: 1, notFound: 0, failed: 0, etaMin: 1 });
    const corpo = [
      runStart(id, 'enorme.txt', 3),
      ...Array.from({ length: 4000 }, () => progresso),
      runEnd({ baixada: 2, 'nao encontrada': 1 }),
    ];
    escrever(`lotes/eventos-${id}.jsonl`, `${corpo.join('\n')}\n`);
    expect(readFileSync(join(lotes(), `eventos-${id}.jsonl`)).length).toBeGreaterThan(400_000);
    const r = (await svc.listar()).find((x) => x.id === id);
    expect(r).toMatchObject({ fim: 'completed', lista: 'enorme.txt', contagem: { total: 3, ok: 2, naoVieram: 1 } });
    expect(erros).toEqual([]);
  });

  it('um evento ilegível vai para o log de erros e não derruba a leitura', async () => {
    escrever(
      `lotes/eventos-${ID_RODANDO}.jsonl`,
      `${runStart(ID_RODANDO)}\n{isto não é json\n${runEnd({ baixada: 1 })}\n`,
    );
    const r = (await svc.listar()).find((x) => x.id === ID_RODANDO);
    expect(r?.fim).toBe('completed');
    expect(erros.length).toBeGreaterThan(0);
  });

  it('sem a pasta lotes/ ou sem pasta do Soulcrate: lista vazia', async () => {
    rmSync(lotes(), { recursive: true });
    expect(await svc.listar()).toEqual([]);
    const sem = new RelatoriosService({
      projeto: () => ({ dir: null, origem: null }),
      agora: () => AGORA,
      processoVivo: () => false,
      pastas: () => ({ musica: null, downloads: null }),
      listas: new ListasService({ executor: new ExecutorFalso(() => OK()), agora: () => AGORA }),
      descartar: () => Promise.resolve(),
      aoErro: () => undefined,
    });
    expect(await sem.listar()).toEqual([]);
    expect(await sem.detalhe(ID_NOVO)).toBeNull();
  });
});

describe('detalhe', () => {
  it('traz as faixas, os relatórios que existem, as opções usadas e o que a lista e a memória permitem', async () => {
    escrever('lista.txt', 'Azyr - No Escape\r\n');
    const d = await svc.detalhe(ID_NOVO);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.resumo.fim).toBe('completed');
    expect(d.faixas).toHaveLength(6);
    expect(d.filtros).toEqual({ todas: 6, bib: 4, nao: 2, conf: 1, inc: 0 });
    expect(d.arquivos.map((a) => [a.tipo, a.nome])).toEqual([
      ['resultado', `resultado-${ID_NOVO}.txt`],
      ['nao-baixadas', `nao-baixadas-${ID_NOVO}.txt`],
      ['diagnostico', `diagnostico-${ID_NOVO}.txt`],
      ['log', `execucao-${ID_NOVO}.log`],
    ]);
    expect(d.listaExiste).toBe(true);
    expect(d.podeReprocessar).toBe(true);
    expect(d.opcoes).toMatchObject({ Paralelo: 5, SemBeets: true });
    expect(d.diagnosticos.map((x) => x.key)).toEqual(['vendex plague', 'fulano inexistente nada aqui']);
    expect(d.retentativa).toMatchObject({ arquivo: `nao-baixadas-${ID_NOVO}.txt`, faixas: 2, retentar: false });
  });

  it('o arquivo da faixa: em downloads/ enquanto o beets não organizou, depois em music/ (com o artista e a data certos)', async () => {
    // "Vendex - Abbadon.flac" ainda está em downloads/ (o beets não o moveu)
    escrever('downloads/Vendex/Vendex - Abbadon.flac');
    // o beets moveu estes dois para music/; o primeiro tem um homônimo de outro artista, de antes da execução
    escrever('music/Hard Techno/Azyr/No Escape.mp3');
    escrever('music/Pop/Outro/No Escape.mp3');
    escrever('music/Hard Techno/Creeds/Push Up (Original Mix).flac');
    escrever('music/Techno/Byørn/2 LOUD.flac');
    for (const rel of [
      'music/Hard Techno/Azyr/No Escape.mp3',
      'music/Hard Techno/Creeds/Push Up (Original Mix).flac',
      'music/Techno/Byørn/2 LOUD.flac',
    ]) {
      datar(rel, INICIO_MS + 10_000);
    }
    datar('music/Pop/Outro/No Escape.mp3', INICIO_MS - 90 * 86_400_000);

    const d = await svc.detalhe(ID_NOVO);
    const por = (key: string) => d?.faixas.find((f) => f.key === key)?.arquivo ?? null;
    expect(por('azyr no escape')).toEqual({ caminho: 'music/Hard Techno/Azyr/No Escape.mp3', onde: 'biblioteca' });
    expect(por('creeds push up original mix')).toEqual({
      caminho: 'music/Hard Techno/Creeds/Push Up (Original Mix).flac',
      onde: 'biblioteca',
    });
    expect(por('byorn 2 loud')?.caminho).toBe('music/Techno/Byørn/2 LOUD.flac');
    expect(por('vendex abaddon')).toEqual({ caminho: 'downloads/Vendex/Vendex - Abbadon.flac', onde: 'downloads' });
    // as que não vieram não têm arquivo
    expect(por('vendex plague')).toBeNull();
    expect(por('fulano inexistente nada aqui')).toBeNull();
  });

  it('o arquivo que o beets moveu e ninguém acha em music/ fica sem caminho (a tela diz "não achei")', async () => {
    const d = await svc.detalhe(ID_NOVO);
    expect(d?.faixas.find((f) => f.key === 'azyr no escape')?.arquivo).toBeNull();
  });

  it('execução do .bat: as faixas vêm do resultado e o diagnóstico, do diagnostico-*.txt', async () => {
    const d = await svc.detalhe(ID_ANTIGO);
    expect(d?.resumo).toMatchObject({ fonte: 'resultado', lista: null });
    expect(d?.opcoes).toBeNull();
    expect(d?.faixas).toHaveLength(6);
    expect(d?.podeReprocessar).toBe(false); // não se sabe qual é a lista
    const plague = d?.diagnosticos.find((x) => x.key === 'vendex plague');
    expect(plague?.motivos.map((m) => m.tipo)).toEqual(['wav', 'titulo']);
    expect(plague?.sugestoes).toEqual(['Plague']);
    expect(d?.retentativa?.faixas).toBe(2);
  });

  it('execução que não existe: null', async () => {
    expect(await svc.detalhe('20200101-000000')).toBeNull();
  });

  it('execução cujo processo sumiu sem o run.end: interrompida, com as faixas que chegaram a terminar', async () => {
    escrever(
      `lotes/eventos-${ID_RODANDO}.jsonl`,
      linhaDeEventos(
        runStart(ID_RODANDO, 'set.txt', 2),
        ev('item.status', { key: 'a b', line: 'A - B', status: 'baixando' }),
        final('c d', 'C - D', 'baixada'),
      ),
    );
    const d = await svc.detalhe(ID_RODANDO);
    expect(d?.resumo.fim).toBe('interrupted');
    expect(d?.filtros).toMatchObject({ bib: 1, inc: 1 });
  });
});

describe('caminhos que o app abre', () => {
  it('um relatório existente, só dentro de lotes/', async () => {
    expect(await svc.caminhoDoArquivo(ID_NOVO, 'resultado')).toBe(join(lotes(), `resultado-${ID_NOVO}.txt`));
    expect(await svc.caminhoDoArquivo(ID_NOVO, 'log')).toBe(join(lotes(), `execucao-${ID_NOVO}.log`));
    expect(await svc.caminhoDoArquivo(ID_NOVO, 'catalogo')).toBeNull(); // não existe
    expect(await svc.caminhoDoArquivo(ID_NOVO, 'beets')).toBeNull();
    expect(await svc.caminhoDoArquivo('20200101-000000', 'resultado')).toBeNull();
  });

  it('o arquivo de uma faixa, para o Explorer', async () => {
    const abs = escrever('downloads/Vendex/Vendex - Abbadon.flac');
    expect(await svc.caminhoDaFaixa(ID_NOVO, 'vendex abaddon')).toBe(abs);
    expect(await svc.caminhoDaFaixa(ID_NOVO, 'vendex plague')).toBeNull();
    expect(await svc.caminhoDaFaixa(ID_NOVO, 'nao-existe')).toBeNull();
  });
});

describe('número da linha na lista', () => {
  it('pede ao script a posição das faixas que não vieram', async () => {
    escrever('baixar-lista.ps1', '# script');
    escrever('lista.txt', '# c\r\nAzyr - No Escape\r\nVendex - Plague\r\nFulano Inexistente - Nada Aqui\r\n');
    linhasDaAnalise = [
      { sourceLine: 2, key: 'azyr no escape' },
      { sourceLine: 3, key: 'vendex plague' },
      { sourceLine: 4, key: 'fulano inexistente nada aqui' },
    ];
    expect(await svc.linhasNaLista(ID_NOVO)).toEqual({ 'vendex plague': 3, 'fulano inexistente nada aqui': 4 });
  });

  it('sem a lista na pasta (ou numa execução antiga): null, sem rodar nada', async () => {
    expect(await svc.linhasNaLista(ID_NOVO)).toBeNull();
    expect(await svc.linhasNaLista(ID_ANTIGO)).toBeNull();
    expect(analises).toBe(0);
  });
});

describe('corrigir pela sugestão ("talvez seja")', () => {
  const ID = '20261010-100000';
  /** uma execução com "Vendex - Plage" (erro de digitação) que o catálogo do artista corrige */
  function montar(lista = '# minha lista\r\nAzyr - No Escape\r\nVendex - Plage\r\nOutro - Faixa\r\n') {
    escrever('baixar-lista.ps1', '# script');
    escrever('lista.txt', lista);
    escrever(
      `lotes/eventos-${ID}.jsonl`,
      linhaDeEventos(
        runStart(ID, 'lista.txt', 3),
        final('azyr no escape', 'Azyr - No Escape', 'baixada'),
        ev('item.diagnostic', {
          key: 'vendex plage',
          line: 'Vendex - Plage',
          searches: [{ kind: 'q', query: 'Vendex Plage' }],
          skipped: 0,
          corrected: '',
          catalog: '',
          remixer: false,
          responses: 2,
          reasons: { 'titulo diferente': 2 },
          closest: [],
          suggestions: ['Plague', 'Plague (Kyar Remix)'],
          artistSearched: true,
          artistCatalog: [
            { title: 'Plague', users: 3 },
            { title: 'Abbadon', users: 1 },
          ],
          artistCatalogTotal: 2,
        }),
        final('vendex plage', 'Vendex - Plage', 'nao encontrada', { note: '2 respostas, nenhuma compativel' }),
        final('outro faixa', 'Outro - Faixa', 'nao encontrada', { note: 'ninguem tem (0 respostas)' }),
        runEnd({ baixada: 1, 'nao encontrada': 2 }),
      ),
    );
    linhasDaAnalise = [
      { sourceLine: 2, key: 'azyr no escape' },
      { sourceLine: 3, key: 'vendex plage' },
      { sourceLine: 4, key: 'outro faixa' },
    ];
  }
  const lista = () => readFileSync(join(dir, 'lista.txt'), 'utf8');
  const arquivoDeCorrecoes = () => join(dir, '.soulcrate', `correcoes-${ID}.json`);

  it('troca o título na linha da lista, guarda a escolha e a faixa aparece como corrigida', async () => {
    montar();
    const r = await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    expect(r).toMatchObject({
      listaAtualizada: true,
      motivoNaoAtualizada: null,
      correcao: {
        titulo: 'Plague',
        linha: 'Vendex - Plague',
        lista: { nome: 'lista.txt', numero: 3, original: 'Vendex - Plage' },
      },
    });
    // o resto da lista fica como estava, com o fim de linha do Windows
    expect(lista()).toBe('# minha lista\r\nAzyr - No Escape\r\nVendex - Plague\r\nOutro - Faixa\r\n');
    expect(existsSync(arquivoDeCorrecoes())).toBe(true);
    const d = await svc.detalhe(ID);
    expect(d?.diagnosticos.find((x) => x.key === 'vendex plage')?.correcao).toMatchObject({ linha: 'Vendex - Plague' });
  });

  it('o catálogo do artista também vale como escolha', async () => {
    montar();
    const r = await svc.corrigir(ID, 'vendex plage', 'Abbadon', { atualizarLista: true });
    expect(r.correcao.linha).toBe('Vendex - Abbadon');
    expect(lista()).toContain('Vendex - Abbadon');
  });

  it('corrigir de novo troca a linha que o app escreveu, sem pedir outra análise', async () => {
    montar();
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    expect(analises).toBe(1);
    const r = await svc.corrigir(ID, 'vendex plage', 'Plague (Kyar Remix)', { atualizarLista: true });
    expect(analises).toBe(1);
    expect(r.correcao.lista).toMatchObject({
      numero: 3,
      original: 'Vendex - Plage',
      escrita: 'Vendex - Plague (Kyar Remix)',
    });
    expect(lista()).toBe('# minha lista\r\nAzyr - No Escape\r\nVendex - Plague (Kyar Remix)\r\nOutro - Faixa\r\n');
  });

  it('desfazer devolve a linha original e esquece a escolha', async () => {
    montar();
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    expect(await svc.desfazerCorrecao(ID, 'vendex plage', { atualizarLista: true })).toBe(true);
    expect(lista()).toBe('# minha lista\r\nAzyr - No Escape\r\nVendex - Plage\r\nOutro - Faixa\r\n');
    expect((await svc.detalhe(ID))?.diagnosticos.find((x) => x.key === 'vendex plage')?.correcao).toBeNull();
    expect(await svc.desfazerCorrecao(ID, 'vendex plage', { atualizarLista: true })).toBe(false);
  });

  it('desfazer não mexe numa linha que o usuário mudou depois', async () => {
    montar();
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    writeFileSync(
      join(dir, 'lista.txt'),
      '# minha lista\r\nAzyr - No Escape\r\nVendex - Plague (editada por mim)\r\nOutro - Faixa\r\n',
    );
    expect(await svc.desfazerCorrecao(ID, 'vendex plage', { atualizarLista: true })).toBe(false);
    expect(lista()).toContain('(editada por mim)');
    expect(existsSync(arquivoDeCorrecoes())).toBe(true); // a correção em si foi esquecida, a lista ficou como está
    expect((await svc.detalhe(ID))?.diagnosticos.find((x) => x.key === 'vendex plage')?.correcao).toBeNull();
  });

  it('desfazer com o editor sujo não escreve na lista nem esquece a correção', async () => {
    montar();
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    await expect(svc.desfazerCorrecao(ID, 'vendex plage', { atualizarLista: false })).rejects.toThrow(/não salvas/);
    expect(lista()).toContain('Vendex - Plague');
    expect((await svc.detalhe(ID))?.diagnosticos.find((x) => x.key === 'vendex plage')?.correcao).not.toBeNull();
  });

  it('corrigir de novo sem poder reescrever a lista não perde o que o app deixou lá: desfazer ainda restaura', async () => {
    montar();
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    const r = await svc.corrigir(ID, 'vendex plage', 'Plague (Kyar Remix)', { atualizarLista: false });
    expect(r).toMatchObject({ listaAtualizada: false, motivoNaoAtualizada: 'editando' });
    expect(r.correcao.lista).toMatchObject({ original: 'Vendex - Plage', escrita: 'Vendex - Plague' });
    expect(await svc.desfazerCorrecao(ID, 'vendex plage', { atualizarLista: true })).toBe(true);
    expect(lista()).toBe('# minha lista\r\nAzyr - No Escape\r\nVendex - Plage\r\nOutro - Faixa\r\n');
  });

  it('o que foi salvo na lista enquanto o script analisava não se perde', async () => {
    montar();
    // o "script" demora; nesse meio-tempo outro programa acrescenta uma linha ao arquivo
    aoAnalisar = () =>
      writeFileSync(
        join(dir, 'lista.txt'),
        '# minha lista\r\nAzyr - No Escape\r\nVendex - Plage\r\nOutro - Faixa\r\nNova - Faixa\r\n',
      );
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    expect(lista()).toBe('# minha lista\r\nAzyr - No Escape\r\nVendex - Plague\r\nOutro - Faixa\r\nNova - Faixa\r\n');
  });

  it('uma linha chamada "constructor" não derruba a leitura da execução', async () => {
    escrever(
      `lotes/eventos-${ID}.jsonl`,
      linhaDeEventos(
        runStart(ID, 'lista.txt', 1),
        ev('item.attemptFailed', { key: 'constructor', user: 'a', attempt: 1, reason: 'fila longa em a (>4 min)' }),
        final('constructor', 'constructor', 'falhou', { note: 'x' }),
        runEnd({ falhou: 1 }),
      ),
    );
    const d = await svc.detalhe(ID);
    expect(d?.diagnosticos.map((x) => x.key)).toEqual(['constructor']);
    expect(d?.diagnosticos[0]?.motivos.map((m) => m.tipo)).toEqual(['fila']);
  });

  it('se a linha da lista já não é a da execução, a lista não é tocada e a correção vale só para o "tentar de novo"', async () => {
    montar('# minha lista\r\nAzyr - No Escape\r\nOutra coisa agora\r\nOutro - Faixa\r\n');
    const r = await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    expect(r).toMatchObject({ listaAtualizada: false, motivoNaoAtualizada: 'nao-achou', correcao: { lista: null } });
    expect(lista()).toContain('Outra coisa agora');
    const nova = await svc.novaTentativa(ID);
    expect(readFileSync(join(dir, nova.lista.nome), 'utf8')).toBe('Vendex - Plague\r\nOutro - Faixa');
  });

  it('com a lista aberta e suja no editor, o app não escreve por baixo dele', async () => {
    montar();
    const r = await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: false });
    expect(r).toMatchObject({ listaAtualizada: false, motivoNaoAtualizada: 'editando' });
    expect(lista()).toContain('Vendex - Plage');
    expect(analises).toBe(0);
  });

  it('lista em CSV (só leitura) e lista que sumiu', async () => {
    montar();
    rmSync(join(dir, 'lista.txt'));
    expect((await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true })).motivoNaoAtualizada).toBe(
      'sem-lista',
    );
    montar();
    // a execução diz que a lista era um CSV
    const csv = escrever('lista.csv', 'Artist,Track\nVendex,Plage\n');
    writeFileSync(
      join(lotes(), `eventos-${ID}.jsonl`),
      readFileSync(join(lotes(), `eventos-${ID}.jsonl`), 'utf8').replaceAll('"lista.txt"', '"lista.csv"'),
    );
    expect((await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true })).motivoNaoAtualizada).toBe(
      'csv',
    );
    expect(readFileSync(csv, 'utf8')).toBe('Artist,Track\nVendex,Plage\n');
  });

  it('só se corrige uma faixa que não veio, com um título que o diagnóstico sugeriu', async () => {
    montar();
    await expect(svc.corrigir(ID, 'vendex plage', 'Qualquer coisa', { atualizarLista: true })).rejects.toThrow(
      /sugest/,
    );
    await expect(svc.corrigir(ID, 'azyr no escape', 'Plague', { atualizarLista: true })).rejects.toThrow(
      /não está entre/,
    );
    await expect(svc.corrigir('20200101-000000', 'x', 'Plague', { atualizarLista: true })).rejects.toThrow(
      /não encontrada/,
    );
    expect(lista()).toContain('Vendex - Plage');
  });

  it('"tentar de novo" gera nao-baixadas-<id>.txt com as correções e as opções sugeridas', async () => {
    montar();
    await svc.corrigir(ID, 'vendex plage', 'Plague', { atualizarLista: true });
    const r = await svc.novaTentativa(ID);
    expect(r.lista.nome).toBe(`nao-baixadas-${ID}.txt`);
    expect(readFileSync(join(dir, r.lista.nome), 'utf8')).toBe('Vendex - Plague\r\nOutro - Faixa');
    expect(r.retentativa).toMatchObject({ faixas: 2, retentar: false });
    // gerar de novo (depois de outra correção) refaz o arquivo em vez de criar um segundo
    await svc.corrigir(ID, 'vendex plage', 'Plague (Kyar Remix)', { atualizarLista: true });
    const de_novo = await svc.novaTentativa(ID);
    expect(de_novo.lista.nome).toBe(r.lista.nome);
    expect(readFileSync(join(dir, de_novo.lista.nome), 'utf8')).toBe('Vendex - Plague (Kyar Remix)\r\nOutro - Faixa');
  });

  it('se a lista de "tentar de novo" já rodou, o lote abre com -Retentar', async () => {
    montar();
    writeFileSync(join(lotes(), `estado-nao-baixadas-${ID}.tsv`), 'falhou\toutro faixa\tOutro - Faixa\n');
    const r = await svc.novaTentativa(ID);
    expect(r.retentativa.retentar).toBe(true);
    expect(r.retentativa.opcoes.Retentar).toBe(true);
  });

  it('sem faixas que falharam, não há o que tentar de novo', async () => {
    escrever(
      `lotes/eventos-${ID}.jsonl`,
      linhaDeEventos(runStart(ID), final('a b', 'A - B', 'baixada'), runEnd({ baixada: 1 })),
    );
    await expect(svc.novaTentativa(ID)).rejects.toThrow(/não tem faixas/);
  });
});

describe('apagar execuções antigas', () => {
  /** quatro execuções, de 5 a 100 dias atrás, mais a que está rodando */
  function montarVarias() {
    const dias = { a: 5, b: 40, c: 70, d: 100 } as const;
    for (const [nome, d] of Object.entries(dias)) {
      const quando = new Date(AGORA - d * 86_400_000);
      const p = (n: number) => String(n).padStart(2, '0');
      const id = `${quando.getFullYear()}${p(quando.getMonth() + 1)}${p(quando.getDate())}-120000`;
      escrever(`lotes/resultado-${id}.txt`, `BAIXADA\tA - ${nome}\tx`);
      escrever(`lotes/execucao-${id}.log`, 'log');
      if (nome === 'c') escrever(`.soulcrate/correcoes-${id}.json`, '{"v":1,"correcoes":{}}');
    }
  }

  it('a prévia conta execuções, arquivos e bytes do critério, sem apagar nada', async () => {
    montarVarias();
    const antes = (await svc.listar()).length;
    const p = await svc.previaDaLimpeza({ tipo: 'idade', dias: 30 });
    // as de 40, 70 e 100 dias (as do beforeEach são de 2026-10-05 e 07: 3 e 1 dias atrás)
    expect(p).toMatchObject({ execucoes: 3, arquivos: 7 });
    expect(p.bytes).toBeGreaterThan(0);
    expect(descartados).toEqual([]);
    expect((await svc.listar()).length).toBe(antes);
  });

  it('manda para a Lixeira as execuções antigas, com os arquivos que elas deixaram, e deixa as outras', async () => {
    montarVarias();
    const r = await svc.limpar({ tipo: 'idade', dias: 60 });
    expect(r).toMatchObject({ execucoes: 2, arquivos: 5, falhas: 0 });
    expect(descartados.every((c) => c.startsWith(lotes()) || c.includes('.soulcrate'))).toBe(true);
    const restam = (await svc.listar()).map((x) => x.id);
    expect(restam).toContain(ID_NOVO);
    expect(restam).toHaveLength(4); // as 2 do beforeEach, a de 5 dias e a de 40
    // a memória das listas nunca é tocada
    expect(existsSync(join(lotes(), 'estado-lista.tsv'))).toBe(true);
  });

  it('"manter as N mais recentes"', async () => {
    montarVarias();
    const r = await svc.limpar({ tipo: 'manter', quantas: 2 });
    expect(r.execucoes).toBe(4);
    expect((await svc.listar()).map((x) => x.id)).toHaveLength(2);
  });

  it('o que está rodando nunca é apagado', async () => {
    escrever(`lotes/eventos-${ID_RODANDO}.jsonl`, linhaDeEventos(runStart(ID_RODANDO, 'set.txt', 30)));
    escrever('lotes/estado-set.lock', `4242\t${T}\t${ID_RODANDO}\n`);
    vivos.add(4242);
    const r = await svc.limpar({ tipo: 'manter', quantas: 0 });
    expect(r.execucoes).toBe(2);
    expect(existsSync(join(lotes(), `eventos-${ID_RODANDO}.jsonl`))).toBe(true);
  });

  it('um arquivo que não vai para a Lixeira é contado como falha, e a execução não conta como apagada', async () => {
    falharAoDescartar = (c) => c.endsWith(`execucao-${ID_NOVO}.log`);
    const r = await svc.limpar({ tipo: 'manter', quantas: 0 });
    expect(r.falhas).toBe(1);
    expect(r.execucoes).toBe(1); // só a antiga saiu inteira
    expect(existsSync(join(lotes(), `execucao-${ID_NOVO}.log`))).toBe(true);
    expect(erros.length).toBe(1);
  });
});

describe('reprocessar a lista do zero', () => {
  it('mostra o que a memória tem e a manda para a Lixeira', async () => {
    const estado = await svc.estadoDaLista(ID_NOVO);
    expect(estado).toEqual({ lista: 'lista.txt', faixas: 6, rodando: false });
    expect(await svc.reprocessarLista(ID_NOVO)).toBe(true);
    expect(descartados).toEqual([join(lotes(), 'estado-lista.tsv')]);
    expect(await svc.estadoDaLista(ID_NOVO)).toBeNull();
    expect((await svc.detalhe(ID_NOVO))?.podeReprocessar).toBe(false);
    expect(await svc.reprocessarLista(ID_NOVO)).toBe(false);
  });

  it('não reprocessa uma lista que está rodando', async () => {
    escrever('lotes/estado-lista.lock', `4242\t${T}\t${ID_NOVO}\n`);
    vivos.add(4242);
    expect((await svc.estadoDaLista(ID_NOVO))?.rodando).toBe(true);
    await expect(svc.reprocessarLista(ID_NOVO)).rejects.toThrow(/rodando/);
    expect(descartados).toEqual([]);
  });

  it('execução antiga não diz qual era a lista: não há memória a apagar', async () => {
    expect(await svc.estadoDaLista(ID_ANTIGO)).toBeNull();
    expect(await svc.reprocessarLista(ID_ANTIGO)).toBe(false);
  });

  it('só apaga arquivos estado-*.tsv de dentro de lotes/, mesmo que o run.start diga outra coisa', async () => {
    escrever('segredo.tsv', 'x');
    escrever(
      `lotes/eventos-${ID_RODANDO}.jsonl`,
      linhaDeEventos(
        runStart(ID_RODANDO, 'lista.txt', 1, { files: { state: '../segredo.tsv' } }),
        runEnd({ baixada: 1 }),
      ),
    );
    // o `files.state` malicioso é ignorado: vale o nome calculado a partir da lista (estado-lista.tsv)
    expect((await svc.estadoDaLista(ID_RODANDO))?.lista).toBe('lista.txt');
    await svc.reprocessarLista(ID_RODANDO);
    expect(existsSync(join(dir, 'segredo.tsv'))).toBe(true);
    expect(descartados).toEqual([join(lotes(), 'estado-lista.tsv')]);
  });
});
