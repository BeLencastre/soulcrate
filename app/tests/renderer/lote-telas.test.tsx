// @vitest-environment jsdom
// As três telas do lote renderizadas de verdade (React + Testing Library), com o `window.soulcrate` simulado.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import completoRaw from '../fixtures/lote/eventos-completo.jsonl?raw';
import erroConfigRaw from '../fixtures/lote/eventos-erro-config.jsonl?raw';
import paradoRaw from '../fixtures/lote/eventos-parado.jsonl?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarErro } from '../../src/shared/erros';
import { lerLinhaEvento, type EventoLote } from '../../src/shared/eventos-lote';
import type { ListaConteudo, ListaRef, ResultadoAnalise } from '../../src/shared/lote';
import { novasOpcoes } from '../../src/shared/opcoes-lote';
import { statusInicial, type ContainerEstado, type StackStatus } from '../../src/shared/stack';

const api = vi.hoisted(() => ({
  stack: { up: vi.fn(), down: vi.fn(), openService: vi.fn(), status: vi.fn() },
  env: { startDockerDesktop: vi.fn(), check: vi.fn() },
  app: { openExternal: vi.fn(), copyText: vi.fn(), openLogsFolder: vi.fn() },
  lists: {
    read: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    importFile: vi.fn(),
    importBytes: vi.fn(),
    analyze: vi.fn(),
    listRecent: vi.fn(),
  },
  batch: { start: vi.fn(), stop: vi.fn(), active: vi.fn(), attach: vi.fn(), openFile: vi.fn(), openFolder: vi.fn() },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

// importados depois do mock
const { BarraLateral } = await import('../../src/renderer/components/BarraLateral');
const { Inicio } = await import('../../src/renderer/paginas/Inicio');
const { Lista } = await import('../../src/renderer/paginas/lote/Lista');
const { Opcoes } = await import('../../src/renderer/paginas/lote/Opcoes');
const { Execucao } = await import('../../src/renderer/paginas/lote/Execucao');
const { chaveStatus, useUi } = await import('../../src/renderer/lib/estado');
const { useExecucao, useRascunho } = await import('../../src/renderer/lib/lote-store');
const { aplicarEventos, estadoInicialLote } = await import('../../src/shared/lote-estado');

// ---------------------------------------------------------------- Montagem

const eventosDe = (texto: string): EventoLote[] =>
  texto
    .split('\n')
    .map(lerLinhaEvento)
    .filter((e): e is EventoLote => e !== null);
const COMPLETO = eventosDe(completoRaw);
const PARADO = eventosDe(paradoRaw);
const ERRO_CONFIG = eventosDe(erroConfigRaw);

function stack(container: ContainerEstado = 'running'): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: { instalacao: 'ok', desktop: 'aberto', engine: true, versaoServidor: '29', compose: '5', abrindo: null },
    configuracao: { estado: 'valida', erros: 0, avisos: 0, achados: [] },
    servicos: base.servicos.map((s) => ({
      ...s,
      container,
      saude: container === 'running' ? 'healthy' : 'nenhuma',
      http: container === 'running' ? true : null,
      statusTexto: null,
    })),
  };
}

function montar(inicial: string, s: StackStatus = stack()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, s);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[inicial]}>
        <BarraLateral />
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/lista" element={<Lista />} />
          <Route path="/lista/opcoes" element={<Opcoes />} />
          <Route path="/lista/execucao" element={<Execucao />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ref = (nome = 'set.txt', modificadaEm = Date.now() - 12_000): ListaRef => ({
  nome,
  tipo: nome.endsWith('.csv') ? 'csv' : 'txt',
  modificadaEm,
  bytes: 10,
});
const conteudo = (texto: string, extra: Partial<ListaConteudo> = {}): ListaConteudo => ({
  ...ref(),
  texto,
  somenteLeitura: false,
  ...extra,
});

const TEXTO_PADRAO = [
  '# Set de sábado',
  'Azyr - No Escape',
  'Creeds - Push Up (Original Mix)',
  'Vendex - Abaddon',
  'Sem traço',
].join('\n');

function analise(
  parcial: Partial<Extract<ResultadoAnalise['analise'], { ok: true }>> = {},
  ultimaExecucaoEm: number | null = null,
): ResultadoAnalise {
  const linha = (n: number, artist: string, title: string, extra: object = {}) => ({
    sourceLine: n,
    line: `${artist} - ${title}`,
    key: `${artist}-${title}`.toLowerCase(),
    artist,
    title,
    mix: '',
    original: true,
    remixer: false,
    queries: [],
    status: 'nova' as const,
    duplicateOf: null,
    previous: null,
    warnings: [],
    ...extra,
  });
  return {
    ultimaExecucaoEm,
    analise: {
      v: 1,
      ok: true,
      list: 'set.txt',
      total: 4,
      unique: 4,
      duplicates: 0,
      alreadyDone: 1,
      libraryChecked: false,
      inLibrary: null,
      toProcess: 3,
      lines: [
        linha(2, 'Azyr', 'No Escape'),
        linha(3, 'Creeds', 'Push Up', { mix: 'Original Mix' }),
        linha(4, 'Vendex', 'Abaddon', { status: 'ja feita' }),
        linha(5, '', 'Sem traço', { warnings: ["sem ' - ' entre artista e titulo"] }),
      ],
      ...parcial,
    },
  };
}

async function abrirLista(
  texto = TEXTO_PADRAO,
  resultado: ResultadoAnalise = analise(),
  extra: Partial<ListaConteudo> = {},
) {
  api.lists.read.mockResolvedValue(conteudo(texto, extra));
  api.lists.analyze.mockResolvedValue(resultado);
  await useRascunho.getState().abrir('set.txt');
}

beforeEach(() => {
  for (const g of Object.values(api)) for (const f of Object.values(g)) f.mockReset().mockResolvedValue(undefined);
  api.lists.listRecent.mockResolvedValue([]);
  api.stack.status.mockResolvedValue(stack());
  useUi.setState({ operacao: null, logAberto: false, dialogoBandeja: false, webui: {} });
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
    opcoes: novasOpcoes(),
  });
  localStorage.clear();
});
afterEach(cleanup);

// ---------------------------------------------------------------- Lista

describe('tela Lista', () => {
  it('sem lista aberta: convida a escolher uma, com as ações e as listas recentes', async () => {
    api.lists.listRecent.mockResolvedValue([ref('antiga.txt', Date.now() - 3 * 3_600_000), ref('nova.csv')]);
    montar('/lista');
    expect(await screen.findByTestId('lista-vazia')).toHaveTextContent('Escolha uma lista');
    expect(screen.getAllByRole('button', { name: /Nova a partir do exemplo/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Importar .txt ou .csv/ }).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId('lista-recentes')).toHaveTextContent('antiga.txt'));
    expect(screen.getByTestId('lista-recentes')).toHaveTextContent('3 h');
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('"Nova a partir do exemplo" cria a lista e abre o editor', async () => {
    api.lists.create.mockResolvedValue(ref('lista-2026-10-07.txt'));
    api.lists.read.mockResolvedValue(conteudo('# exemplo\nA - B', { nome: 'lista-2026-10-07.txt' }));
    api.lists.analyze.mockResolvedValue(analise());
    montar('/lista');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Nova a partir do exemplo' }))[0] as HTMLElement);
    expect(await screen.findByTestId('editor-lista')).toHaveValue('# exemplo\nA - B');
    expect(api.lists.create).toHaveBeenCalledWith('exemplo');
    expect(screen.getByTestId('nome-da-lista')).toHaveTextContent('lista-2026-10-07.txt');
  });

  it('reabre a última lista usada ao entrar na tela', async () => {
    localStorage.setItem('soulcrate.ultimaLista', 'set.txt');
    api.lists.read.mockResolvedValue(conteudo(TEXTO_PADRAO));
    api.lists.analyze.mockResolvedValue(analise());
    montar('/lista');
    expect(await screen.findByTestId('editor-lista')).toHaveValue(TEXTO_PADRAO);
  });

  it('editor, contagem de linhas e a pré-visualização feita pelo script (artista, título, mix, aviso)', async () => {
    await abrirLista();
    montar('/lista');
    expect(screen.getByTestId('nome-da-lista')).toHaveTextContent('set.txt');
    expect(screen.getByTestId('editor-lista')).toHaveValue(TEXTO_PADRAO);
    expect(screen.getByText('5 linhas')).toBeInTheDocument();

    const previa = await screen.findByTestId('previa-lista');
    expect(within(previa).getByText('Azyr')).toBeInTheDocument();
    expect(within(previa).getByText('Original Mix')).toBeInTheDocument();
    expect(within(previa).getByText('Feita em execução anterior')).toBeInTheDocument();
    expect(within(previa).getByText('Falta o " - "')).toBeInTheDocument();

    // os totais da análise
    const area = screen.getByRole('region', { name: 'Pré-visualização' });
    expect(within(area).getByText('3 para baixar')).toBeInTheDocument();
    expect(within(area).getByText('0 duplicadas')).toBeInTheDocument();
    expect(within(area).getByText('1 já feita')).toBeInTheDocument();
    expect(screen.getByTestId('rodape-contagem')).toHaveTextContent('3 faixas para baixar');
  });

  it('marca cada linha do editor com a cor do que o lote vai fazer', async () => {
    await abrirLista();
    montar('/lista');
    await screen.findByTestId('previa-lista');
    const marcas = within(screen.getByTestId('editor-gutter'))
      .getAllByText(/^\d+$/)
      .map((n) => n.querySelector('[data-marcador]')?.getAttribute('data-marcador') ?? null);
    // linha 1 é comentário (sem marcador); 2 e 3 baixam; 4 já foi feita; 5 não tem " - "
    expect(marcas).toEqual([null, 'verde', 'verde', 'cinza', 'laranja']);
  });

  it('editar salva depois de uma pausa na digitação e analisa de novo', async () => {
    await abrirLista();
    api.lists.save.mockResolvedValue(ref());
    montar('/lista');
    await screen.findByTestId('previa-lista');
    api.lists.analyze.mockClear();

    fireEvent.change(screen.getByTestId('editor-lista'), { target: { value: `${TEXTO_PADRAO}\nNovah - ACID` } });
    expect(screen.getByTestId('estado-salvamento')).toHaveTextContent('alterações não salvas');
    expect(api.lists.save).not.toHaveBeenCalled(); // ainda está digitando
    await waitFor(() => expect(api.lists.save).toHaveBeenCalledWith('set.txt', `${TEXTO_PADRAO}\nNovah - ACID`), {
      timeout: 3000,
    });
    await waitFor(() => expect(api.lists.analyze).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('estado-salvamento')).not.toHaveTextContent('não salvas'));
  });

  it('CSV é só leitura, com o aviso', async () => {
    await abrirLista('Track Name,Artist Name(s)\nX,Y', analise(), {
      nome: 'spotify.csv',
      tipo: 'csv',
      somenteLeitura: true,
    });
    montar('/lista');
    expect(screen.getByTestId('editor-lista')).toHaveAttribute('readonly');
    expect(screen.getByText(/Lista em CSV: o app só lê/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('lista que já rodou: avisa, diz quantas pula e deixa tentar de novo as que falharam', async () => {
    await abrirLista(TEXTO_PADRAO, analise({ alreadyDone: 2 }, new Date(2026, 9, 4, 12).getTime()));
    montar('/lista');
    const faixa = await screen.findByTestId('faixa-retomada');
    expect(faixa).toHaveTextContent('Esta lista já rodou em 04/10.');
    expect(faixa).toHaveTextContent('pula as 2 faixas já feitas');

    api.lists.analyze.mockClear();
    fireEvent.click(within(faixa).getByRole('checkbox', { name: 'Tentar de novo as que falharam' }));
    expect(useRascunho.getState().opcoes.Retentar).toBe(true);
    // a análise é refeita contando o que falhou antes como "para baixar"
    await waitFor(() =>
      expect(api.lists.analyze).toHaveBeenCalledWith('set.txt', { biblioteca: true, retentar: true }),
    );
  });

  it('lista que nunca rodou: sem a faixa de retomada', async () => {
    await abrirLista();
    montar('/lista');
    await screen.findByTestId('previa-lista');
    expect(screen.queryByTestId('faixa-retomada')).toBeNull();
  });

  it('com a stack no ar a análise também confere a biblioteca; desligada, não', async () => {
    await abrirLista();
    montar('/lista');
    await waitFor(() =>
      expect(api.lists.analyze).toHaveBeenCalledWith('set.txt', { biblioteca: true, retentar: false }),
    );
    cleanup();
    api.lists.analyze.mockClear();
    useRascunho.setState({ analise: null });
    montar('/lista', stack('exited'));
    await waitFor(() =>
      expect(api.lists.analyze).toHaveBeenCalledWith('set.txt', { biblioteca: false, retentar: false }),
    );
  });

  it('análise com erro do script: mostra o motivo no lugar da tabela', async () => {
    await abrirLista(TEXTO_PADRAO, {
      ultimaExecucaoEm: null,
      analise: { v: 1, ok: false, list: 'set.txt', error: 'CSV sem colunas reconhecidas.' },
    });
    montar('/lista');
    expect(await screen.findByTestId('analise-erro')).toHaveTextContent(
      'Não consegui ler a lista: CSV sem colunas reconhecidas.',
    );
    expect(screen.getByTestId('iniciar-lote')).toBeDisabled();
  });

  it('o botão Iniciar fica desabilitado se não há o que baixar', async () => {
    await abrirLista(TEXTO_PADRAO, analise({ toProcess: 0 }));
    montar('/lista');
    await screen.findByTestId('previa-lista');
    expect(screen.getByTestId('iniciar-lote')).toBeDisabled();
  });

  it('o rodapé diz o que difere do padrão e leva às opções', async () => {
    await abrirLista();
    useRascunho.getState().definirOpcoes({ ...novasOpcoes(), Paralelo: 8, AceitarAacAiff: true });
    montar('/lista');
    expect(screen.getByText('Opções: padrão, com 2 alterações')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar opções' })).toHaveAttribute('href', '/lista/opcoes');
  });

  it('listas recentes: abre o diálogo e troca de lista', async () => {
    await abrirLista();
    api.lists.listRecent.mockResolvedValue([ref('outra.txt')]);
    montar('/lista');
    fireEvent.click(screen.getByRole('button', { name: 'Listas recentes' }));
    const dialogo = await screen.findByTestId('dialogo-recentes');
    api.lists.read.mockResolvedValue(conteudo('X - Y', { nome: 'outra.txt' }));
    fireEvent.click(await within(dialogo).findByRole('button', { name: /outra\.txt/ }));
    await waitFor(() => expect(api.lists.read).toHaveBeenCalledWith('outra.txt'));
  });

  it('erro ao abrir uma lista aparece e pode ser dispensado', async () => {
    useRascunho.setState({ erro: 'Não consegui abrir a lista: A lista nada.txt não existe.' });
    montar('/lista');
    const alerta = screen.getByTestId('erro-lista');
    expect(alerta).toHaveTextContent('A lista nada.txt não existe.');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByTestId('erro-lista')).toBeNull();
  });

  it('virtualização: uma lista de 1.000 faixas não vai inteira para o DOM', async () => {
    const lines = Array.from({ length: 1000 }, (_, i) => ({
      sourceLine: i + 1,
      line: `Artista ${i} - Título ${i}`,
      key: `k${i}`,
      artist: `Artista ${i}`,
      title: `Título ${i}`,
      mix: '',
      original: true,
      remixer: false,
      queries: [],
      status: 'nova' as const,
      duplicateOf: null,
      previous: null,
      warnings: [],
    }));
    await abrirLista('x', analise({ total: 1000, unique: 1000, toProcess: 1000, alreadyDone: 0, lines }));
    montar('/lista');
    const previa = await screen.findByTestId('previa-lista');
    const linhas = within(previa).getAllByRole('row');
    expect(linhas.length).toBeGreaterThan(5);
    expect(linhas.length).toBeLessThan(60);
    expect(previa).toHaveAttribute('aria-rowcount', '1001');
  });
});

// ---------------------------------------------------------------- Iniciar o lote

describe('iniciar o lote', () => {
  function comRota(s: StackStatus) {
    const r = montar('/lista', s);
    return r;
  }

  it('com a stack no ar: salva, inicia o script com a lista e as opções, e vai para a execução', async () => {
    await abrirLista();
    useRascunho.getState().definirOpcoes({ ...novasOpcoes(), Paralelo: 8 });
    api.batch.start.mockResolvedValue({ ok: true, runId: 'exemplo' });
    api.batch.attach.mockResolvedValue({
      eventos: COMPLETO.slice(0, 3),
      log: [],
      logTotal: 0,
      resumo: { runId: 'exemplo', lista: 'set.txt', pid: 1, iniciouEm: 't', terminou: false },
    });
    comRota(stack());
    await screen.findByTestId('previa-lista');
    await waitFor(() => expect(screen.getByTestId('iniciar-lote')).toBeEnabled());
    fireEvent.click(screen.getByTestId('iniciar-lote'));

    await waitFor(() => expect(api.batch.start).toHaveBeenCalledTimes(1));
    expect(api.batch.start).toHaveBeenCalledWith({ lista: 'set.txt', opcoes: { ...novasOpcoes(), Paralelo: 8 } });
    expect(await screen.findByTestId('estado-do-lote')).toBeInTheDocument(); // a tela Execução
    expect(useExecucao.getState().runId).toBe('exemplo');
  });

  it('salva o que foi digitado antes de iniciar', async () => {
    await abrirLista();
    api.lists.save.mockResolvedValue(ref());
    api.batch.start.mockResolvedValue({ ok: true, runId: 'exemplo' });
    api.batch.attach.mockResolvedValue(null);
    comRota(stack());
    await screen.findByTestId('previa-lista');
    fireEvent.change(screen.getByTestId('editor-lista'), { target: { value: 'A - B' } });
    await waitFor(() => expect(screen.getByTestId('iniciar-lote')).toBeEnabled());
    fireEvent.click(screen.getByTestId('iniciar-lote'));
    await waitFor(() => expect(api.batch.start).toHaveBeenCalled());
    expect(api.lists.save).toHaveBeenCalledWith('set.txt', 'A - B');
    expect(api.lists.save.mock.invocationCallOrder[0]).toBeLessThan(
      api.batch.start.mock.invocationCallOrder[0] as number,
    );
  });

  it('lista já rodando (por outro lote): mostra o erro com a ação de ver a execução, e não vai embora', async () => {
    await abrirLista();
    api.batch.start.mockResolvedValue({
      ok: false,
      erro: criarErro('lote.lista-rodando', { lista: 'set.txt', desde: '2026-10-07T16:00:00' }),
    });
    comRota(stack());
    await screen.findByTestId('previa-lista');
    await waitFor(() => expect(screen.getByTestId('iniciar-lote')).toBeEnabled());
    fireEvent.click(screen.getByTestId('iniciar-lote'));
    const erro = await screen.findByRole('alert');
    expect(erro).toHaveTextContent('set.txt já está rodando');
    expect(erro).toHaveAttribute('data-codigo-erro', 'lote.lista-rodando');
    expect(within(erro).getByRole('button', { name: 'Ver execução' })).toBeInTheDocument();
    expect(screen.queryByTestId('estado-do-lote')).toBeNull();
  });

  it('stack desligada: pergunta, liga, espera o slskd responder e só então inicia', async () => {
    await abrirLista();
    api.stack.up.mockResolvedValue({ id: 'op1', tipo: 'ligar' });
    api.stack.status.mockResolvedValueOnce(stack('exited')).mockResolvedValue(stack());
    api.batch.start.mockResolvedValue({ ok: true, runId: 'exemplo' });
    api.batch.attach.mockResolvedValue(null);
    comRota(stack('exited'));
    await screen.findByTestId('previa-lista');
    await waitFor(() => expect(screen.getByTestId('iniciar-lote')).toBeEnabled());
    fireEvent.click(screen.getByTestId('iniciar-lote'));

    const dialogo = await screen.findByTestId('dialogo-iniciar');
    expect(dialogo).toHaveTextContent('A stack não está no ar');
    expect(api.batch.start).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ligar e começar' }));

    expect(await screen.findByText('Ligando a stack…')).toBeInTheDocument();
    expect(api.stack.up).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.batch.start).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(api.stack.status.mock.invocationCallOrder[0]).toBeLessThan(
      api.batch.start.mock.invocationCallOrder[0] as number,
    );
  });

  it('cancelar a pergunta não liga nada nem inicia', async () => {
    await abrirLista();
    comRota(stack('exited'));
    await screen.findByTestId('previa-lista');
    await waitFor(() => expect(screen.getByTestId('iniciar-lote')).toBeEnabled());
    fireEvent.click(screen.getByTestId('iniciar-lote'));
    const dialogo = await screen.findByTestId('dialogo-iniciar');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByTestId('dialogo-iniciar')).toBeNull());
    expect(api.stack.up).not.toHaveBeenCalled();
    expect(api.batch.start).not.toHaveBeenCalled();
  });

  it('Docker fechado: explica que não dá para ligar agora e leva ao Início', async () => {
    await abrirLista();
    const s = stack('ausente');
    s.docker = { ...s.docker, engine: false, desktop: 'fechado' };
    comRota(s);
    await screen.findByTestId('previa-lista');
    await waitFor(() => expect(screen.getByTestId('iniciar-lote')).toBeEnabled());
    fireEvent.click(screen.getByTestId('iniciar-lote'));
    const dialogo = await screen.findByTestId('dialogo-iniciar');
    expect(dialogo).toHaveTextContent('Não dá para ligar a stack agora');
    expect(dialogo).toHaveTextContent('Docker fechado');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ir para o Início' }));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(api.stack.up).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Opções

describe('tela Opções', () => {
  beforeEach(() => {
    useRascunho.setState({ lista: conteudo('x'), texto: 'x', textoSalvo: 'x' });
  });

  it('tem as nove receitas, os três grupos e as avançadas recolhidas', () => {
    montar('/lista/opcoes');
    expect(
      screen.getAllByRole('button', { pressed: false }).filter((b) => b.hasAttribute('data-receita')),
    ).toHaveLength(9);
    for (const g of ['Qualidade', 'Títulos', 'Comportamento']) {
      expect(screen.getByRole('region', { name: g })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('switch')).toHaveLength(11);
    // Qualidade: FLAC e WAV são sempre aceitos; o resto é opção (padrão: desligado)
    const qualidade = screen.getByRole('region', { name: 'Qualidade' });
    expect(qualidade).toHaveTextContent('FLAC e WAV são sempre aceitos');
    const chaves = within(qualidade).getAllByRole('switch');
    expect(chaves).toHaveLength(3);
    for (const c of chaves) expect(c).not.toBeChecked();
    for (const nome of [/Aceitar AAC e AIFF/, /Aceitar MP3 320/, /Aceitar MP3 256 e VBR/]) {
      expect(within(qualidade).getByRole('switch', { name: nome })).toBeInTheDocument();
    }
    // avançadas: fechadas até abrir
    expect(screen.queryByText('Downloads simultâneos')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Avançadas/ }));
    expect(screen.getByText('Downloads simultâneos')).toBeInTheDocument();
    expect(screen.getByText('Faixas por chamada do beets')).toBeInTheDocument();
  });

  it('o resumo começa em "nenhuma opção diferente" e o comando é o do padrão', () => {
    montar('/lista/opcoes');
    expect(screen.getByTestId('resumo-opcoes')).toHaveTextContent('Nenhuma opção diferente do padrão do script');
    expect(screen.getByTestId('comando-equivalente')).toHaveTextContent('baixar-lista.bat set.txt');
    expect(screen.queryByText('≠ PADRÃO')).toBeNull();
  });

  it('ligar uma opção mostra "≠ PADRÃO", conta no resumo e entra no comando', () => {
    montar('/lista/opcoes');
    fireEvent.click(screen.getByRole('switch', { name: /Aceitar AAC e AIFF/ }));
    expect(useRascunho.getState().opcoes.AceitarAacAiff).toBe(true);
    expect(
      within(document.querySelector('[data-opcao="AceitarAacAiff"]') as HTMLElement).getByText('≠ PADRÃO'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('resumo-opcoes')).toHaveTextContent('1 opção diferente do padrão do script');
    expect(screen.getByTestId('comando-equivalente')).toHaveTextContent('baixar-lista.bat set.txt -AceitarAacAiff');
  });

  it('receita de um clique ajusta as opções e fica marcada; clicar em outra opção a desmarca', () => {
    montar('/lista/opcoes');
    const receita = document.querySelector('[data-receita="querTudo"]') as HTMLElement;
    expect(receita).toHaveTextContent('-AceitarAacAiff -AceitarMp3320 -AceitarMp3Menor');
    fireEvent.click(receita);
    expect(useRascunho.getState().opcoes).toMatchObject({
      AceitarAacAiff: true,
      AceitarMp3320: true,
      AceitarMp3Menor: true,
    });
    expect(receita).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('switch', { name: /Aceitar AAC e AIFF/ }));
    expect(receita).toHaveAttribute('aria-pressed', 'false');
  });

  it('avançadas: − e + mudam o valor dentro dos limites, mostram o padrão e contam como alteradas', () => {
    montar('/lista/opcoes');
    fireEvent.click(screen.getByRole('button', { name: /Avançadas/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar: Downloads simultâneos' }));
    expect(useRascunho.getState().opcoes.Paralelo).toBe(6);
    expect(screen.getByText('PADRÃO 5')).toBeInTheDocument();
    expect(screen.getByText('1 ALTERADA')).toBeInTheDocument();
    expect(screen.getByTestId('comando-equivalente')).toHaveTextContent('-Paralelo 6');
    for (let i = 0; i < 20; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Diminuir: Downloads simultâneos' }));
    expect(useRascunho.getState().opcoes.Paralelo).toBe(1);
    expect(screen.getByRole('button', { name: 'Diminuir: Downloads simultâneos' })).toBeDisabled();
  });

  it('"Restaurar padrões" volta tudo ao padrão do script', () => {
    montar('/lista/opcoes');
    useRascunho.getState().definirOpcoes({ ...novasOpcoes(), Paralelo: 9, SemBeets: true });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(useRascunho.getState().opcoes).toEqual(novasOpcoes());
  });

  it('o botão de iniciar mostra quantas faixas, e a stack é conferida antes', async () => {
    useRascunho.setState({ analise: { resultado: analise({ toProcess: 11 }), texto: 'x' } });
    api.batch.start.mockResolvedValue({ ok: true, runId: 'exemplo' });
    api.batch.attach.mockResolvedValue(null);
    montar('/lista/opcoes');
    expect(screen.getByText('Iniciar lote · 11 faixas')).toBeInTheDocument();
    expect(screen.getByText(/o app confere se a stack está no ar e oferece ligá-la/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('iniciar-lote'));
    await waitFor(() => expect(api.batch.start).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------- Execução

async function carregarExecucao(eventos: EventoLote[], log: string[] = [], resumoExtra: object = {}) {
  api.batch.attach.mockResolvedValue({
    eventos,
    log,
    logTotal: log.length,
    resumo: { runId: 'exemplo', lista: 'lista.txt', pid: 1, iniciouEm: 't', terminou: false, ...resumoExtra },
  });
  await useExecucao.getState().anexar('exemplo');
}

describe('tela Execução', () => {
  it('sem execução: convida a iniciar um lote', () => {
    montar('/lista/execucao');
    expect(screen.getByTestId('execucao-vazia')).toHaveTextContent('Nenhum lote em execução');
    expect(screen.getByRole('link', { name: 'Ir para a lista' })).toHaveAttribute('href', '/lista');
  });

  it('lote rodando: nome da lista, chip, progresso, contadores e tabela por faixa', async () => {
    // o fixture até a metade: 2 baixadas, 1 buscando...
    await carregarExecucao(COMPLETO.slice(0, 22));
    montar('/lista/execucao');
    expect(screen.getByTestId('nome-da-lista')).toHaveTextContent('lista.txt');
    expect(screen.getByTestId('estado-do-lote')).toHaveTextContent('Rodando');
    const c = useExecucao.getState().estado.contagem;
    expect(screen.getByTestId('progresso-numero')).toHaveTextContent(`${c.concluidas}/6`);
    expect(document.querySelector('[data-valor="baixadas"]')).toHaveTextContent(String(c.baixadas));
    expect(screen.getByRole('button', { name: /Parar/ })).toBeEnabled();

    const tabela = screen.getByTestId('tabela-faixas');
    expect(within(tabela).getByText('Azyr')).toBeInTheDocument();
    expect(within(tabela).getAllByText('Baixada (não organizada)').length).toBeGreaterThan(0);
    expect(within(tabela).getByText('u1')).toBeInTheDocument();
    expect(within(tabela).getByText('WAV')).toBeInTheDocument();
  });

  it('as barras e os textos não dependem só da cor: a barra tem descrição para leitores de tela', async () => {
    await carregarExecucao(COMPLETO);
    montar('/lista/execucao');
    expect(screen.getByTestId('barra-progresso')).toHaveAttribute(
      'aria-label',
      'Progresso por faixa: 4 baixadas, 2 com atenção, 0 puladas, 0 em andamento, 0 aguardando',
    );
  });

  it('filtros por grupo com a contagem, e busca sem diferenciar acento', async () => {
    await carregarExecucao(COMPLETO);
    montar('/lista/execucao');
    const filtro = (f: string) => document.querySelector(`[data-filtro="${f}"]`) as HTMLElement;
    expect(filtro('todas')).toHaveTextContent('Todas 6');
    expect(filtro('concluida')).toHaveTextContent('Concluídas 4');
    expect(filtro('atencao')).toHaveTextContent('Atenção 2');
    expect(filtro('andamento')).toHaveTextContent('Em andamento 0');

    fireEvent.click(filtro('atencao'));
    const tabela = screen.getByTestId('tabela-faixas');
    expect(within(tabela).getAllByText('Não encontrada')).toHaveLength(2);
    expect(within(tabela).queryByText('Azyr')).toBeNull();

    fireEvent.click(filtro('todas'));
    fireEvent.change(screen.getByTestId('busca-faixas'), { target: { value: 'BYORN' } });
    expect(within(screen.getByTestId('tabela-faixas')).getAllByRole('row')).toHaveLength(2); // cabeçalho + 1
    expect(within(screen.getByTestId('tabela-faixas')).getByText('Byørn')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('busca-faixas'), { target: { value: 'nada disso' } });
    expect(screen.getByText('Nenhuma faixa neste filtro.')).toBeInTheDocument();
  });

  it('Parar pede ao main o arquivo-sinal; o botão fica desabilitado até o script confirmar', async () => {
    await carregarExecucao(COMPLETO.slice(0, 10));
    api.batch.stop.mockResolvedValue(undefined);
    montar('/lista/execucao');
    fireEvent.click(screen.getByTestId('parar-lote'));
    await waitFor(() => expect(api.batch.stop).toHaveBeenCalledWith('exemplo'));
    await waitFor(() => expect(screen.getByTestId('parar-lote')).toBeDisabled());
  });

  it('parando: "Finalizando e gravando relatórios…" até o run.end; depois, relatórios gravados e botões de abrir', async () => {
    await carregarExecucao(PARADO.slice(0, 7)); // até o run.stopping
    montar('/lista/execucao');
    expect(screen.getByTestId('estado-do-lote')).toHaveTextContent('Parando');
    expect(screen.getByText('Finalizando e gravando relatórios…')).toBeInTheDocument();
    expect(screen.queryByTestId('parar-lote')).toBeNull();

    useExecucao.getState().aoEvento({ type: 'batch.events', runId: 'exemplo', desde: 7, eventos: PARADO.slice(7) });
    await waitFor(() => expect(screen.getByTestId('estado-do-lote')).toHaveTextContent('Parado pelo usuário'));
    expect(screen.getByText('Relatórios gravados em lotes/')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir resultado' }));
    expect(api.batch.openFile).toHaveBeenCalledWith('exemplo', 'resultado');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pasta lotes' }));
    expect(api.batch.openFolder).toHaveBeenCalled();
  });

  it('concluído: chip verde e abrir os relatórios', async () => {
    await carregarExecucao(COMPLETO);
    montar('/lista/execucao');
    expect(screen.getByTestId('estado-do-lote')).toHaveTextContent('Concluído');
    expect(screen.getByText('Lote concluído')).toBeInTheDocument();
    expect(screen.queryByTestId('parar-lote')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir não baixadas' }));
    expect(api.batch.openFile).toHaveBeenCalledWith('exemplo', 'nao-baixadas');
  });

  it('configuração inválida: cartão de erro com a mensagem do script e a ação de abrir as configurações', async () => {
    await carregarExecucao(ERRO_CONFIG);
    montar('/lista/execucao');
    expect(screen.getByTestId('estado-do-lote')).toHaveTextContent('Configuração inválida');
    const erro = screen.getByRole('alert');
    expect(erro).toHaveAttribute('data-codigo-erro', 'lote.config');
    expect(within(erro).getByRole('button', { name: 'Ver configurações' })).toBeInTheDocument();
  });

  it('buscas pausadas e limite de buscas aparecem na faixa de aviso', async () => {
    const t = new Date().toISOString();
    const ate = new Date(Date.now() + 15 * 60_000).toISOString();
    await carregarExecucao([
      COMPLETO[0] as EventoLote,
      { v: 1, t, type: 'search.paused', until: ate, minutes: 15, reason: 'x' },
    ]);
    montar('/lista/execucao');
    expect(screen.getByTestId('estado-do-lote')).toHaveTextContent('Buscas pausadas');
    expect(screen.getByText(/^Buscas pausadas até \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('log bruto: as linhas do script, na aba própria', async () => {
    await carregarExecucao(COMPLETO.slice(0, 5), ['  ?  buscando: Azyr - No Escape', '  OK BAIXADA: Azyr - No Escape']);
    montar('/lista/execucao');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Log bruto' }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('tab', { name: 'Log bruto' }));
    const log = await screen.findByTestId('log-bruto');
    expect(log).toHaveTextContent('buscando: Azyr - No Escape');
    expect(log).toHaveTextContent('OK BAIXADA: Azyr - No Escape');
  });

  it('tabela fluida com 1.000 faixas: só as visíveis vão para o DOM', async () => {
    const t = '2026-10-07T16:10:02.000-03:00';
    const eventos: EventoLote[] = [
      {
        v: 1,
        t,
        type: 'run.start',
        id: 'x',
        pid: 1,
        list: 'grande.txt',
        listName: 'grande',
        total: 1000,
        options: {},
        files: {},
        powershell: '5.1',
      },
      ...Array.from({ length: 1000 }, (_, i): EventoLote => ({
        v: 1,
        t,
        type: 'item.final',
        key: `k${i}`,
        line: `Artista ${i} - Título ${i}`,
        status: i % 10 === 0 ? 'nao encontrada' : 'baixada',
        note: '',
        via: '',
        local: null,
        user: 'u',
        format: 'FLAC',
      })),
    ];
    const antes = performance.now();
    await carregarExecucao(eventos);
    montar('/lista/execucao');
    const tabela = screen.getByTestId('tabela-faixas');
    expect(tabela).toHaveAttribute('aria-rowcount', '1001');
    expect(within(tabela).getAllByRole('row').length).toBeLessThan(40);
    expect(screen.getByTestId('progresso-numero')).toHaveTextContent('1000/1000');
    expect(performance.now() - antes).toBeLessThan(5000);

    // filtrar mantém a tabela virtual: 100 não encontradas, mas só as visíveis no DOM
    fireEvent.click(document.querySelector('[data-filtro="atencao"]') as HTMLElement);
    expect(screen.getByTestId('tabela-faixas')).toHaveAttribute('aria-rowcount', '101');
  });
});

// ---------------------------------------------------------------- Barra lateral e Início

describe('lote na barra lateral e no Início', () => {
  it('sem lote: a barra não mostra o cartão e o Início convida a baixar uma lista', () => {
    montar('/');
    expect(screen.queryByTestId('cartao-lote')).toBeNull();
    const cartao = screen.getByTestId('cartao-sem-lote');
    expect(cartao).toHaveTextContent('Nenhum lote rodando');
    fireEvent.click(within(cartao).getByRole('button', { name: 'Baixar uma lista' }));
  });

  it('lote rodando: cartão na barra lateral e no Início, com o progresso', async () => {
    await carregarExecucao(COMPLETO.slice(0, 22));
    montar('/');
    const lateral = screen.getByTestId('cartao-lote');
    expect(lateral).toHaveAttribute('href', '/lista/execucao');
    expect(lateral).toHaveTextContent('Lote rodando');
    expect(lateral).toHaveTextContent('lista.txt');
    expect(lateral).toHaveTextContent(`${useExecucao.getState().estado.contagem.concluidas}/6`);
    const inicio = screen.getByTestId('cartao-lote-inicio');
    expect(inicio).toHaveTextContent('Lote rodando');
    expect(within(inicio).getByRole('button', { name: 'Ver execução' })).toBeInTheDocument();
  });

  it('lote terminado: sai da barra lateral; o Início mostra o resultado', async () => {
    await carregarExecucao(COMPLETO);
    montar('/');
    expect(screen.queryByTestId('cartao-lote')).toBeNull();
    const inicio = screen.getByTestId('cartao-lote-inicio');
    expect(inicio).toHaveTextContent('Último lote');
    expect(inicio).toHaveTextContent('6/6 concluídas');
    expect(inicio).toHaveTextContent('4 baixadas · 2 não encontradas · 0 falhas');
  });
});

// o estado de uma execução pode ser calculado direto dos eventos, sem passar pela tela
describe('estado a partir dos eventos', () => {
  it('é o mesmo que a tela mostra', () => {
    expect(aplicarEventos(estadoInicialLote(), COMPLETO).contagem.concluidas).toBe(6);
  });
});
