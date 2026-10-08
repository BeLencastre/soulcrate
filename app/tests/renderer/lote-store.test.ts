// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lerLinhaEvento, type EventoLote } from '../../src/shared/eventos-lote';
import type { AnexoExecucao, ListaConteudo, ResultadoAnalise } from '../../src/shared/lote';
import completoRaw from '../fixtures/lote/eventos-completo.jsonl?raw';

const api = vi.hoisted(() => ({
  lists: {
    read: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    importFile: vi.fn(),
    importBytes: vi.fn(),
    analyze: vi.fn(),
    listRecent: vi.fn(),
  },
  batch: { attach: vi.fn(), active: vi.fn(), stop: vi.fn(), start: vi.fn() },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

const { useExecucao, useRascunho, estaSujo, execucaoRodando, semPrefixoIpc } =
  await import('../../src/renderer/lib/lote-store');

const COMPLETO = completoRaw
  .split('\n')
  .map(lerLinhaEvento)
  .filter((e): e is EventoLote => e !== null);
const resumo = (terminou = false) => ({ runId: 'exemplo', lista: 'lista.txt', pid: 1, iniciouEm: 't', terminou });
const anexo = (n: number, log: string[] = [], logTotal = log.length): AnexoExecucao => ({
  eventos: COMPLETO.slice(0, n),
  log,
  logTotal,
  resumo: resumo(),
});

beforeEach(() => {
  for (const g of Object.values(api)) for (const f of Object.values(g)) f.mockReset();
  useExecucao.getState().esquecer();
  useRascunho.setState({
    lista: null,
    texto: '',
    textoSalvo: '',
    salvoEm: null,
    salvando: false,
    analise: null,
    analisando: false,
    erroAnalise: null,
    erro: null,
    recentes: [],
  });
});

describe('execução: anexar e acompanhar', () => {
  it('monta o painel com o que o main já leu e continua com o que ele empurra', async () => {
    api.batch.attach.mockResolvedValue(anexo(10));
    await useExecucao.getState().anexar('exemplo');
    const s = useExecucao.getState();
    expect(s.runId).toBe('exemplo');
    expect(s.anexado).toBe(true);
    expect(s.estado.eventosAplicados).toBe(10);
    expect(s.estado.inicio?.id).toBe('exemplo');
    expect(s.resumo?.lista).toBe('lista.txt');

    useExecucao
      .getState()
      .aoEvento({ type: 'batch.events', runId: 'exemplo', desde: 10, eventos: COMPLETO.slice(10, 20) });
    expect(useExecucao.getState().estado.eventosAplicados).toBe(20);

    useExecucao.getState().aoEvento({ type: 'batch.events', runId: 'exemplo', desde: 20, eventos: COMPLETO.slice(20) });
    expect(useExecucao.getState().estado.fase).toBe('terminou');
    expect(useExecucao.getState().estado.contagem.concluidas).toBe(6);
  });

  it('o que chegou antes do estado completo é guardado e só entra o que o estado ainda não tem', async () => {
    let entregar!: (a: AnexoExecucao) => void;
    api.batch.attach.mockReturnValue(new Promise<AnexoExecucao>((r) => (entregar = r)));
    const pronto = useExecucao.getState().anexar('exemplo');

    // chegam, em ordem, antes da resposta: 0-5, 5-12 e 12-16
    for (const [d, a] of [
      [0, 5],
      [5, 12],
      [12, 16],
    ] as const) {
      useExecucao
        .getState()
        .aoEvento({ type: 'batch.events', runId: 'exemplo', desde: d, eventos: COMPLETO.slice(d, a) });
    }
    expect(useExecucao.getState().anexado).toBe(false);
    expect(useExecucao.getState().estado.eventosAplicados).toBe(0);

    entregar(anexo(12)); // o estado completo já tinha 12 eventos
    await pronto;
    const s = useExecucao.getState();
    expect(s.anexado).toBe(true);
    expect(s.estado.eventosAplicados).toBe(16); // 12 do estado + os 4 novos do último grupo, sem repetir nenhum
    expect(s.pendentesEventos).toEqual([]);
  });

  it('um grupo repetido é ignorado', async () => {
    api.batch.attach.mockResolvedValue(anexo(10));
    await useExecucao.getState().anexar('exemplo');
    useExecucao
      .getState()
      .aoEvento({ type: 'batch.events', runId: 'exemplo', desde: 5, eventos: COMPLETO.slice(5, 10) });
    expect(useExecucao.getState().estado.eventosAplicados).toBe(10);
  });

  it('faltou um pedaço no meio: pede o estado completo de novo', async () => {
    api.batch.attach.mockResolvedValueOnce(anexo(10)).mockResolvedValueOnce(anexo(30));
    await useExecucao.getState().anexar('exemplo');
    useExecucao
      .getState()
      .aoEvento({ type: 'batch.events', runId: 'exemplo', desde: 15, eventos: COMPLETO.slice(15, 20) });
    await vi.waitFor(() => expect(api.batch.attach).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(useExecucao.getState().estado.eventosAplicados).toBe(30));
  });

  it('eventos de outra execução são ignorados', async () => {
    api.batch.attach.mockResolvedValue(anexo(10));
    await useExecucao.getState().anexar('exemplo');
    useExecucao
      .getState()
      .aoEvento({ type: 'batch.events', runId: 'outra', desde: 10, eventos: COMPLETO.slice(10, 12) });
    expect(useExecucao.getState().estado.eventosAplicados).toBe(10);
  });

  it('execução que o main não acompanha: painel vazio, sem erro', async () => {
    api.batch.attach.mockResolvedValue(null);
    await useExecucao.getState().anexar('fantasma');
    expect(useExecucao.getState()).toMatchObject({ runId: 'fantasma', anexado: true });
    expect(useExecucao.getState().estado.faixas).toEqual([]);
  });

  it('trocar de execução no meio descarta a resposta da anterior', async () => {
    let entregar!: (a: AnexoExecucao | null) => void;
    api.batch.attach.mockReturnValueOnce(new Promise((r) => (entregar = r))).mockResolvedValueOnce(anexo(3));
    const primeira = useExecucao.getState().anexar('velha');
    await useExecucao.getState().anexar('exemplo');
    entregar(anexo(30));
    await primeira;
    expect(useExecucao.getState().runId).toBe('exemplo');
    expect(useExecucao.getState().estado.eventosAplicados).toBe(3);
  });

  it('log bruto: guarda as linhas, sem repetir as que o estado completo já trouxe, e corta no limite', async () => {
    api.batch.attach.mockResolvedValue(anexo(2, ['a', 'b', 'c'], 3));
    await useExecucao.getState().anexar('exemplo');
    useExecucao.getState().aoEvento({ type: 'batch.log', runId: 'exemplo', desde: 2, linhas: ['c', 'd'] });
    expect(useExecucao.getState().log).toEqual(['a', 'b', 'c', 'd']);
    expect(useExecucao.getState().logAplicadas).toBe(4);

    const muitas = Array.from({ length: 6000 }, (_, i) => `l${i}`);
    useExecucao.getState().aoEvento({ type: 'batch.log', runId: 'exemplo', desde: 4, linhas: muitas });
    expect(useExecucao.getState().log).toHaveLength(5000);
    expect(useExecucao.getState().log.at(-1)).toBe('l5999');
    expect(useExecucao.getState().logAplicadas).toBe(6004);
  });

  it('parar pede ao main e marca que o pedido foi feito', async () => {
    api.batch.attach.mockResolvedValue(anexo(10));
    api.batch.stop.mockResolvedValue(undefined);
    await useExecucao.getState().anexar('exemplo');
    await useExecucao.getState().parar();
    expect(api.batch.stop).toHaveBeenCalledWith('exemplo');
    expect(useExecucao.getState().pediuParar).toBe(true);
  });

  it('rodando = tem execução e ela ainda não terminou', async () => {
    expect(execucaoRodando(useExecucao.getState())).toBe(false);
    api.batch.attach.mockResolvedValue(anexo(10));
    await useExecucao.getState().anexar('exemplo');
    expect(execucaoRodando(useExecucao.getState())).toBe(true);
    useExecucao.getState().aoEvento({ type: 'batch.events', runId: 'exemplo', desde: 10, eventos: COMPLETO.slice(10) });
    expect(execucaoRodando(useExecucao.getState())).toBe(false);
  });
});

describe('execução: reconectar ao abrir o app', () => {
  it('passa a mostrar a execução viva mais recente', async () => {
    api.batch.active.mockResolvedValue([
      { ...resumo(true), runId: 'velha' },
      { ...resumo(false), runId: 'a' },
      { ...resumo(false), runId: 'b' },
    ]);
    api.batch.attach.mockResolvedValue(anexo(10));
    await useExecucao.getState().reconectar();
    expect(useExecucao.getState().runId).toBe('b');
  });

  it('só execuções terminadas: não mostra nada', async () => {
    api.batch.active.mockResolvedValue([{ ...resumo(true), runId: 'velha' }]);
    await useExecucao.getState().reconectar();
    expect(useExecucao.getState().runId).toBeNull();
    expect(api.batch.attach).not.toHaveBeenCalled();
  });

  it('falha ao consultar o main não derruba a tela', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    api.batch.active.mockRejectedValue(new Error('sem pasta'));
    await expect(useExecucao.getState().reconectar()).resolves.toBeUndefined();
    erro.mockRestore();
  });

  it('já está mostrando essa execução: não anexa de novo', async () => {
    api.batch.attach.mockResolvedValue(anexo(10));
    await useExecucao.getState().anexar('exemplo');
    api.batch.active.mockResolvedValue([resumo(false)]);
    await useExecucao.getState().reconectar();
    expect(api.batch.attach).toHaveBeenCalledTimes(1);
  });
});

const lista = (extra: Partial<ListaConteudo> = {}): ListaConteudo => ({
  nome: 'set.txt',
  tipo: 'txt',
  modificadaEm: 1000,
  bytes: 10,
  texto: 'A - B\n',
  somenteLeitura: false,
  ...extra,
});
const analiseOk = (toProcess = 1): ResultadoAnalise => ({
  ultimaExecucaoEm: null,
  analise: {
    v: 1,
    ok: true,
    list: 'set.txt',
    total: 1,
    unique: 1,
    duplicates: 0,
    alreadyDone: 0,
    libraryChecked: false,
    inLibrary: null,
    toProcess,
    lines: [],
  },
});

describe('rascunho: abrir, editar e salvar', () => {
  it('abrir lê a lista e zera a análise', async () => {
    api.lists.read.mockResolvedValue(lista());
    expect(await useRascunho.getState().abrir('set.txt')).toBe(true);
    expect(useRascunho.getState()).toMatchObject({
      texto: 'A - B\n',
      textoSalvo: 'A - B\n',
      salvoEm: 1000,
      erro: null,
    });
    expect(estaSujo(useRascunho.getState())).toBe(false);
  });

  it('falha ao abrir: mostra o motivo sem o prefixo do Electron', async () => {
    api.lists.read.mockRejectedValue(
      new Error("Error invoking remote method 'lists:read': Error: A lista nada.txt não existe."),
    );
    expect(await useRascunho.getState().abrir('nada.txt')).toBe(false);
    expect(useRascunho.getState().erro).toBe('Não consegui abrir a lista: A lista nada.txt não existe.');
    expect(semPrefixoIpc("Error invoking remote method 'x:y': TypeError: bum")).toBe('TypeError: bum');
  });

  it('editar deixa a lista suja; salvar grava o que foi editado e fica limpa', async () => {
    api.lists.read.mockResolvedValue(lista());
    api.lists.save.mockResolvedValue({ ...lista(), modificadaEm: 2000 });
    await useRascunho.getState().abrir('set.txt');
    useRascunho.getState().editar('A - B\nC - D\n');
    expect(estaSujo(useRascunho.getState())).toBe(true);
    expect(await useRascunho.getState().salvar()).toBe(true);
    expect(api.lists.save).toHaveBeenCalledWith('set.txt', 'A - B\nC - D\n');
    expect(estaSujo(useRascunho.getState())).toBe(false);
    expect(useRascunho.getState().salvoEm).toBe(2000);
  });

  it('sem alteração, salvar não chama o main', async () => {
    api.lists.read.mockResolvedValue(lista());
    await useRascunho.getState().abrir('set.txt');
    expect(await useRascunho.getState().salvar()).toBe(true);
    expect(api.lists.save).not.toHaveBeenCalled();
  });

  it('o que foi digitado enquanto salvava também é gravado antes de salvar() voltar (nada se perde)', async () => {
    api.lists.read.mockResolvedValue(lista());
    let terminar!: (v: unknown) => void;
    api.lists.save
      .mockReturnValueOnce(new Promise((r) => (terminar = r)))
      .mockResolvedValue({ ...lista(), modificadaEm: 4000 });
    await useRascunho.getState().abrir('set.txt');
    useRascunho.getState().editar('v1');
    const salvando = useRascunho.getState().salvar();
    useRascunho.getState().editar('v2');
    terminar({ ...lista(), modificadaEm: 3000 });
    expect(await salvando).toBe(true);
    expect(api.lists.save.mock.calls.map((c) => c[1])).toEqual(['v1', 'v2']);
    expect(useRascunho.getState().textoSalvo).toBe('v2');
    expect(estaSujo(useRascunho.getState())).toBe(false);
  });

  it('um salvamento em andamento não faz quem pede outro (o "Iniciar lote") desistir: espera e confere', async () => {
    api.lists.read.mockResolvedValue(lista());
    let terminar!: (v: unknown) => void;
    api.lists.save.mockReturnValueOnce(new Promise((r) => (terminar = r)));
    await useRascunho.getState().abrir('set.txt');
    useRascunho.getState().editar('novo texto');
    const daPausa = useRascunho.getState().salvar(); // a pausa na digitação
    const doBotao = useRascunho.getState().salvar(); // o clique em Iniciar, no meio do salvamento
    terminar({ ...lista(), modificadaEm: 3000 });
    expect(await Promise.all([daPausa, doBotao])).toEqual([true, true]);
    expect(api.lists.save).toHaveBeenCalledTimes(1); // o segundo viu que já estava gravado
    expect(estaSujo(useRascunho.getState())).toBe(false);
  });

  it('erro ao salvar: mostra o motivo e mantém o texto', async () => {
    api.lists.read.mockResolvedValue(lista());
    api.lists.save.mockRejectedValue(new Error('EPERM'));
    await useRascunho.getState().abrir('set.txt');
    useRascunho.getState().editar('novo');
    expect(await useRascunho.getState().salvar()).toBe(false);
    expect(useRascunho.getState().erro).toContain('Não consegui salvar a lista');
    expect(useRascunho.getState().texto).toBe('novo');
  });

  it('abrir outra lista salva antes a que está aberta; se não conseguir salvar, não troca', async () => {
    api.lists.read.mockResolvedValueOnce(lista()).mockResolvedValueOnce(lista({ nome: 'outra.txt', texto: 'X - Y' }));
    api.lists.save.mockResolvedValue(lista());
    await useRascunho.getState().abrir('set.txt');
    useRascunho.getState().editar('mudei');
    await useRascunho.getState().abrir('outra.txt');
    expect(api.lists.save).toHaveBeenCalledWith('set.txt', 'mudei');
    expect(useRascunho.getState().lista?.nome).toBe('outra.txt');

    api.lists.save.mockRejectedValue(new Error('EPERM'));
    useRascunho.getState().editar('outra mudança');
    expect(await useRascunho.getState().abrir('set.txt')).toBe(false);
    expect(useRascunho.getState().lista?.nome).toBe('outra.txt');
    expect(useRascunho.getState().texto).toBe('outra mudança');
  });

  it('lista em CSV não é editada', async () => {
    api.lists.read.mockResolvedValue(lista({ nome: 'a.csv', tipo: 'csv', somenteLeitura: true, texto: 'x' }));
    await useRascunho.getState().abrir('a.csv');
    useRascunho.getState().editar('y');
    expect(useRascunho.getState().texto).toBe('x');
    expect(await useRascunho.getState().salvar()).toBe(true);
    expect(api.lists.save).not.toHaveBeenCalled();
  });

  it('criar e importar abrem a lista nova; erros aparecem', async () => {
    api.lists.create.mockResolvedValue(lista({ nome: 'lista-2026-10-07.txt' }));
    api.lists.read.mockResolvedValue(lista({ nome: 'lista-2026-10-07.txt' }));
    api.lists.listRecent.mockResolvedValue([]);
    await useRascunho.getState().criar('exemplo');
    expect(useRascunho.getState().lista?.nome).toBe('lista-2026-10-07.txt');

    api.lists.importFile.mockResolvedValue(null); // o usuário cancelou
    api.lists.read.mockClear();
    await useRascunho.getState().importarArquivo();
    expect(api.lists.read).not.toHaveBeenCalled();

    api.lists.importBytes.mockRejectedValue(new Error('O arquivo é grande demais'));
    await useRascunho.getState().importarBytes('x.txt', new Uint8Array(1));
    expect(useRascunho.getState().erro).toContain('Não consegui importar o arquivo: O arquivo é grande demais');
  });
});

describe('rascunho: análise', () => {
  it('guarda a análise junto com o texto salvo que foi analisado', async () => {
    api.lists.read.mockResolvedValue(lista());
    api.lists.analyze.mockResolvedValue(analiseOk(3));
    await useRascunho.getState().abrir('set.txt');
    await useRascunho.getState().analisar({ biblioteca: false, retentar: true });
    expect(api.lists.analyze).toHaveBeenCalledWith('set.txt', { biblioteca: false, retentar: true });
    const a = useRascunho.getState().analise;
    expect(a?.texto).toBe('A - B\n');
    expect(a?.resultado.analise.ok && a.resultado.analise.toProcess).toBe(3);
  });

  it('a resposta de uma análise antiga não sobrescreve a mais nova', async () => {
    api.lists.read.mockResolvedValue(lista());
    await useRascunho.getState().abrir('set.txt');
    let velha!: (r: ResultadoAnalise) => void;
    api.lists.analyze
      .mockReturnValueOnce(new Promise<ResultadoAnalise>((r) => (velha = r)))
      .mockResolvedValueOnce(analiseOk(2));
    const p1 = useRascunho.getState().analisar({ biblioteca: false, retentar: false });
    await useRascunho.getState().analisar({ biblioteca: false, retentar: false });
    velha(analiseOk(99));
    await p1;
    const a = useRascunho.getState().analise?.resultado.analise;
    expect(a?.ok && a.toProcess).toBe(2);
  });

  it('análise cancelada pelo main não vira erro; outras falhas viram', async () => {
    api.lists.read.mockResolvedValue(lista());
    await useRascunho.getState().abrir('set.txt');
    api.lists.analyze.mockRejectedValueOnce(
      new Error("Error invoking remote method 'lists:analyze': Error: Análise cancelada: chegou uma mais nova."),
    );
    await useRascunho.getState().analisar({ biblioteca: false, retentar: false });
    expect(useRascunho.getState().erroAnalise).toBeNull();
    api.lists.analyze.mockRejectedValueOnce(new Error('O PowerShell não abriu'));
    await useRascunho.getState().analisar({ biblioteca: false, retentar: false });
    expect(useRascunho.getState().erroAnalise).toBe('O PowerShell não abriu');
    expect(useRascunho.getState().analisando).toBe(false);
  });

  it('abrir outra lista invalida a análise que estava a caminho', async () => {
    api.lists.read.mockResolvedValue(lista());
    await useRascunho.getState().abrir('set.txt');
    let velha!: (r: ResultadoAnalise) => void;
    api.lists.analyze.mockReturnValueOnce(new Promise<ResultadoAnalise>((r) => (velha = r)));
    const p = useRascunho.getState().analisar({ biblioteca: false, retentar: false });
    await useRascunho.getState().abrir('set.txt');
    velha(analiseOk(7));
    await p;
    expect(useRascunho.getState().analise).toBeNull();
  });
});
