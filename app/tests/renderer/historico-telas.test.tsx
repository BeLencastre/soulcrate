// @vitest-environment jsdom
// As três telas do histórico (Histórico, Detalhe da execução e Diagnóstico) renderizadas de verdade (React + Testing
// Library), com o `window.soulcrate` simulado e os dados montados com as mesmas funções que o main usa.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import completoRaw from '../fixtures/lote/eventos-completo.jsonl?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lerLinhaEvento, type EventoLote } from '../../src/shared/eventos-lote';
import {
  detalharExecucao,
  lerExecucaoDeEventos,
  resumirExecucao,
  type CorrecaoFaixa,
  type ExecucaoDetalhe,
  type ExecucaoResumo,
} from '../../src/shared/historico';
import type { ListaConteudo } from '../../src/shared/lote';
import { novasOpcoes } from '../../src/shared/opcoes-lote';
import { statusInicial, type StackStatus } from '../../src/shared/stack';

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
  reports: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    listLines: vi.fn(),
    applySuggestion: vi.fn(),
    undoSuggestion: vi.fn(),
    buildRetryList: vi.fn(),
    openFile: vi.fn(),
    revealTrack: vi.fn(),
    previewCleanup: vi.fn(),
    cleanup: vi.fn(),
    listState: vi.fn(),
    resetList: vi.fn(),
  },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

// importados depois do mock
const { Historico } = await import('../../src/renderer/paginas/historico/Historico');
const { DetalheDaExecucao } = await import('../../src/renderer/paginas/historico/Detalhe');
const { DiagnosticoDasFaltas } = await import('../../src/renderer/paginas/historico/Diagnostico');
const { chaveStatus } = await import('../../src/renderer/lib/estado');
const { useExecucao, useRascunho } = await import('../../src/renderer/lib/lote-store');

// ---------------------------------------------------------------- Montagem

const ID = '20261007-154809';
const COMPLETO: EventoLote[] = completoRaw
  .split('\n')
  .map(lerLinhaEvento)
  .filter((e): e is EventoLote => e !== null);

function stack(semProjeto = false): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    projeto: semProjeto ? { dir: null, origem: null } : { dir: 'C:\\Soulcrate', origem: 'configurada' },
  };
}

function Local() {
  const l = useLocation();
  return <div data-testid="local">{l.pathname + l.search}</div>;
}

function montar(inicial: string, s: StackStatus = stack()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, s);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[inicial]}>
        <Routes>
          <Route path="/historico" element={<Historico />} />
          <Route path="/historico/:runId" element={<DetalheDaExecucao />} />
          <Route path="/historico/:runId/faltas" element={<DiagnosticoDasFaltas />} />
          <Route path="/lista/opcoes" element={<Local />} />
          <Route path="/lista/execucao" element={<Local />} />
          <Route path="/lista" element={<Local />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const agora = Date.now();
function resumo(id: string, extra: Partial<ExecucaoResumo> = {}): ExecucaoResumo {
  return {
    id,
    inicio: agora - 3_600_000,
    duracaoMs: 68 * 60_000,
    lista: 'lista.txt',
    fonte: 'eventos',
    fim: 'completed',
    mensagem: '',
    contagem: { total: 30, ok: 27, naoVieram: 3, puladas: 0, atencao: 0, naoTerminadas: 0 },
    progresso: null,
    temFaltas: true,
    ...extra,
  };
}

/** O detalhe como o main o monta para a fixture real do script. */
function detalhe(
  extra: Partial<ExecucaoDetalhe> = {},
  correcoes: Record<string, CorrecaoFaixa> = {},
  retentar = false,
): ExecucaoDetalhe {
  const bruta = lerExecucaoDeEventos(ID, COMPLETO);
  const parte = detalharExecucao(bruta, { correcoes, retentar, arquivoDaRetentativa: `nao-baixadas-${ID}.txt` });
  return {
    resumo: resumirExecucao({
      id: ID,
      fonte: 'eventos',
      inicioEvento: bruta.inicioEvento,
      fimEvento: bruta.fimEvento,
      progresso: null,
      summary: bruta.fimEvento?.summary ?? null,
      inicioMs: 0,
      fimMs: null,
      rodando: false,
      agora,
    }),
    listaExiste: true,
    opcoes: parte.opcoes,
    faixas: parte.faixas.map((f) =>
      f.key === 'azyr no escape'
        ? { ...f, arquivo: { caminho: 'music/Hard Techno/Azyr/No Escape.mp3', onde: 'biblioteca' } }
        : f,
    ),
    filtros: parte.filtros,
    arquivos: [
      { tipo: 'resultado', nome: `resultado-${ID}.txt`, bytes: 100 },
      { tipo: 'nao-baixadas', nome: `nao-baixadas-${ID}.txt`, bytes: 40 },
      { tipo: 'diagnostico', nome: `diagnostico-${ID}.txt`, bytes: 400 },
      { tipo: 'log', nome: `execucao-${ID}.log`, bytes: 4000 },
    ],
    diagnosticos: parte.diagnosticos,
    retentativa: parte.retentativa,
    podeReprocessar: true,
    ...extra,
  };
}

const ref = (nome: string) => ({ nome, tipo: 'txt' as const, modificadaEm: agora, bytes: 10 });
const conteudo = (nome: string, texto = 'Vendex - Plague'): ListaConteudo => ({
  ...ref(nome),
  texto,
  somenteLeitura: false,
});

beforeEach(() => {
  for (const g of Object.values(api)) for (const f of Object.values(g)) f.mockReset().mockResolvedValue(undefined);
  api.reports.listRuns.mockResolvedValue([]);
  api.reports.listLines.mockResolvedValue(null);
  api.lists.listRecent.mockResolvedValue([]);
  api.lists.analyze.mockResolvedValue(undefined);
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

// ---------------------------------------------------------------- Histórico

describe('tela Histórico', () => {
  const RUNS: ExecucaoResumo[] = [
    resumo('20261008-221400', {
      fim: 'rodando',
      duracaoMs: 18 * 60_000,
      lista: 'set-sabado.txt',
      contagem: { total: 30, ok: 10, naoVieram: 2, puladas: 2, atencao: 0, naoTerminadas: 16 },
      progresso: { feitas: 14, total: 30 },
    }),
    resumo('20261007-210200'),
    resumo('20261004-194000', {
      fim: 'user',
      lista: 'set-sabado.txt',
      duracaoMs: 22 * 60_000,
      temFaltas: false,
      contagem: { total: 18, ok: 1, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 17 },
    }),
    resumo('20260922-200300', {
      fim: 'config',
      duracaoMs: 2000,
      temFaltas: false,
      mensagem: 'API key do slskd diferente nos dois arquivos',
      contagem: { total: 0, ok: 0, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 0 },
    }),
    resumo('20260915-184700', {
      fonte: 'resultado',
      lista: null,
      duracaoMs: null,
      contagem: { total: 29, ok: 22, naoVieram: 4, puladas: 3, atencao: 0, naoTerminadas: 0 },
    }),
  ];

  it('lista as execuções com quando, lista, duração, resultado e como terminaram', async () => {
    api.reports.listRuns.mockResolvedValue(RUNS);
    montar('/historico');
    const linhas = await screen.findAllByTestId('linha-execucao');
    expect(linhas).toHaveLength(5);

    const [rodando, concluida, parada, config, antiga] = linhas as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(rodando).toHaveTextContent('set-sabado.txt');
    expect(rodando).toHaveTextContent('Rodando');
    expect(rodando).toHaveTextContent('14/30 concluídas');
    expect(rodando).toHaveTextContent('eventos ao vivo');
    expect(rodando).toHaveTextContent('18 min');

    expect(concluida).toHaveTextContent('Concluído');
    expect(concluida).toHaveTextContent('27 na biblioteca · 3 não vieram · 0 puladas');
    expect(concluida).toHaveTextContent('1 h 08 min');

    expect(parada).toHaveTextContent('Parado pelo usuário');
    expect(parada).toHaveTextContent('1 na biblioteca · 17 não iniciadas');

    expect(config).toHaveTextContent('Configuração inválida');
    expect(config).toHaveTextContent('API key do slskd diferente nos dois arquivos');

    expect(antiga).toHaveTextContent('lista não registrada');
    expect(antiga).toHaveTextContent('antiga · lida do resultado-*.txt');
    expect(antiga).toHaveTextContent('—');
  });

  it('"Ver faltas" só aparece nas que têm faixa que não veio e já terminaram; "Abrir" leva ao detalhe', async () => {
    api.reports.listRuns.mockResolvedValue(RUNS);
    montar('/historico');
    const linhas = await screen.findAllByTestId('linha-execucao');
    const faltas = (l: HTMLElement) => within(l).queryByRole('link', { name: 'Ver faltas' });
    expect(faltas(linhas[0] as HTMLElement)).toBeNull(); // rodando
    expect(faltas(linhas[1] as HTMLElement)).toHaveAttribute('href', '/historico/20261007-210200/faltas');
    expect(faltas(linhas[2] as HTMLElement)).toBeNull();
    expect(faltas(linhas[3] as HTMLElement)).toBeNull();
    expect(faltas(linhas[4] as HTMLElement)).not.toBeNull();
    const abrir = within(linhas[1] as HTMLElement).getByRole('link', { name: 'Abrir' });
    expect(abrir).toHaveAttribute('href', '/historico/20261007-210200');
  });

  it('o lote que o painel acompanha abre o painel ao vivo; o que roda por fora, o detalhe', async () => {
    api.reports.listRuns.mockResolvedValue(RUNS);
    useExecucao.setState({ runId: '20261008-221400' });
    montar('/historico');
    const linhas = await screen.findAllByTestId('linha-execucao');
    fireEvent.click(within(linhas[0] as HTMLElement).getByRole('link', { name: 'Ver ao vivo' }));
    expect(await screen.findByTestId('local')).toHaveTextContent('/lista/execucao');
  });

  it('filtra "Com faixas que não vieram" e mostra as contagens', async () => {
    api.reports.listRuns.mockResolvedValue(RUNS);
    montar('/historico');
    await screen.findAllByTestId('linha-execucao');
    const todas = document.querySelector('[data-filtro="todas"]') as HTMLElement;
    const faltas = document.querySelector('[data-filtro="faltas"]') as HTMLElement;
    expect(todas).toHaveTextContent('Todas 5');
    expect(faltas).toHaveTextContent('Com faixas que não vieram 3'); // a que está rodando já tem 2 que não vieram
    fireEvent.click(faltas);
    expect(screen.getAllByTestId('linha-execucao')).toHaveLength(3);
    expect(faltas).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(todas);
    expect(screen.getAllByTestId('linha-execucao')).toHaveLength(5);
  });

  it('a barra de resultado diz em texto o que mostra em cor', async () => {
    api.reports.listRuns.mockResolvedValue([RUNS[1] as ExecucaoResumo]);
    montar('/historico');
    const barra = await screen.findByRole('img', { name: '27 na biblioteca · 3 não vieram · 0 puladas' });
    expect(barra).toBeInTheDocument();
  });

  it('sem execuções: estado vazio com o caminho para baixar uma lista', async () => {
    montar('/historico');
    expect(await screen.findByTestId('historico-vazio')).toHaveTextContent('Nenhuma execução ainda');
    expect(screen.getByRole('link', { name: 'Baixar uma lista' })).toHaveAttribute('href', '/lista');
  });

  it('enquanto lê a pasta, mostra o carregamento', () => {
    api.reports.listRuns.mockReturnValue(new Promise(() => undefined));
    montar('/historico');
    expect(screen.getByTestId('carregando')).toBeInTheDocument();
  });

  it('se a leitura falha, mostra o erro e deixa tentar de novo', async () => {
    api.reports.listRuns.mockRejectedValueOnce(new Error('EPERM: sem permissão para ler lotes'));
    montar('/historico');
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveAttribute('data-codigo-erro', 'inesperado');
    // o motivo técnico vai para o "Copiar detalhes", como em todo erro inesperado
    fireEvent.click(within(alerta).getByRole('button', { name: 'Copiar detalhes' }));
    expect(api.app.copyText).toHaveBeenCalledWith(expect.stringContaining('EPERM'));
    api.reports.listRuns.mockResolvedValue(RUNS);
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findAllByTestId('linha-execucao')).toHaveLength(5);
  });

  it('sem a pasta do Soulcrate, leva ao assistente', async () => {
    montar('/historico', stack(true));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveAttribute('data-codigo-erro', 'projeto.ausente');
  });

  it('"Abrir pasta lotes" abre a pasta no Explorer', async () => {
    montar('/historico');
    fireEvent.click(await screen.findByRole('button', { name: /Abrir pasta lotes/ }));
    expect(api.batch.openFolder).toHaveBeenCalled();
  });

  describe('Apagar execuções antigas…', () => {
    it('mostra o que vai sair antes de mandar para a Lixeira, e só apaga depois da confirmação', async () => {
      api.reports.listRuns.mockResolvedValue(RUNS);
      api.reports.previewCleanup.mockResolvedValue({ execucoes: 3, arquivos: 14, bytes: 2_500_000 });
      api.reports.cleanup.mockResolvedValue({ execucoes: 3, arquivos: 14, bytes: 2_500_000, falhas: 0 });
      montar('/historico');
      await screen.findAllByTestId('linha-execucao');

      fireEvent.click(screen.getByRole('button', { name: 'Apagar execuções antigas…' }));
      const dialogo = await screen.findByTestId('dialogo-limpeza');
      await waitFor(() =>
        expect(screen.getByTestId('previa-limpeza')).toHaveTextContent('3 execuções · 14 arquivos · 2,4 MB'),
      );
      expect(api.reports.previewCleanup).toHaveBeenCalledWith({ tipo: 'idade', dias: 90 });
      expect(api.reports.cleanup).not.toHaveBeenCalled();

      // muda o critério: a prévia é refeita
      fireEvent.click(within(dialogo).getByLabelText('Tudo, menos as 10 mais recentes'));
      await waitFor(() => expect(api.reports.previewCleanup).toHaveBeenCalledWith({ tipo: 'manter', quantas: 10 }));
      fireEvent.click(within(dialogo).getByLabelText('Mais antigas que 90 dias'));
      await waitFor(() => expect(screen.getByTestId('previa-limpeza')).toHaveTextContent('3 execuções'));

      fireEvent.click(screen.getByTestId('confirmar-limpeza'));
      await waitFor(() => expect(api.reports.cleanup).toHaveBeenCalledWith({ tipo: 'idade', dias: 90 }));
      expect(await screen.findByTestId('aviso-historico')).toHaveTextContent('3 execuções foram para a Lixeira');
      expect(screen.queryByTestId('dialogo-limpeza')).toBeNull();
    });

    it('sem nada que se encaixe, o botão de apagar fica desabilitado', async () => {
      api.reports.listRuns.mockResolvedValue(RUNS);
      api.reports.previewCleanup.mockResolvedValue({ execucoes: 0, arquivos: 0, bytes: 0 });
      montar('/historico');
      await screen.findAllByTestId('linha-execucao');
      fireEvent.click(screen.getByRole('button', { name: 'Apagar execuções antigas…' }));
      await waitFor(() =>
        expect(screen.getByTestId('previa-limpeza')).toHaveTextContent('Nenhuma execução se encaixa'),
      );
      expect(screen.getByTestId('confirmar-limpeza')).toBeDisabled();
    });

    it('avisa quando algum arquivo não pôde ser apagado', async () => {
      api.reports.listRuns.mockResolvedValue(RUNS);
      api.reports.previewCleanup.mockResolvedValue({ execucoes: 2, arquivos: 5, bytes: 100 });
      api.reports.cleanup.mockResolvedValue({ execucoes: 1, arquivos: 4, bytes: 90, falhas: 1 });
      montar('/historico');
      await screen.findAllByTestId('linha-execucao');
      fireEvent.click(screen.getByRole('button', { name: 'Apagar execuções antigas…' }));
      await waitFor(() => expect(screen.getByTestId('confirmar-limpeza')).toBeEnabled());
      fireEvent.click(screen.getByTestId('confirmar-limpeza'));
      expect(await screen.findByTestId('aviso-historico')).toHaveTextContent('1 arquivo não pôde ser apagado');
    });
  });
});

// ---------------------------------------------------------------- Detalhe da execução

describe('tela Detalhe da execução', () => {
  it('cabeçalho, os quatro números e a tabela de faixas com o arquivo na biblioteca', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}`);
    expect(await screen.findByTestId('nome-da-lista')).toHaveTextContent('lista.txt');
    expect(screen.getByTestId('fim-da-execucao')).toHaveTextContent('Concluído');
    expect(screen.getByTestId('rotulo-execucao')).toHaveTextContent(`Execução ${ID}`);

    const valor = (id: string) => document.querySelector(`[data-valor="${id}"]`)?.textContent;
    expect(valor('bib')).toBe('4');
    expect(valor('nao-encontradas')).toBe('2');
    expect(valor('falharam')).toBe('0');
    expect(valor('conferir')).toBe('1');
    expect(document.querySelector('[data-valor="incompletas"]')).toBeNull();

    const tabela = screen.getByTestId('tabela-faixas');
    expect(tabela).toHaveTextContent('music/Hard Techno/Azyr/No Escape.mp3');
    expect(tabela).toHaveTextContent('veio da busca pelo artista'); // o texto âmbar do "para conferir"
    expect(within(tabela).getAllByRole('row')).toHaveLength(7); // cabeçalho e as 6 faixas
  });

  it('filtros por chip, com a contagem, e a busca por artista ou título', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}`);
    const tabela = await screen.findByTestId('tabela-faixas');
    const chip = (f: string) => document.querySelector(`[data-filtro="${f}"]`) as HTMLElement;
    expect(chip('todas')).toHaveTextContent('Todas 6');
    expect(chip('bib')).toHaveTextContent('Na biblioteca 4');
    expect(chip('nao')).toHaveTextContent('Não vieram 2');
    expect(chip('conf')).toHaveTextContent('Para conferir 1');
    expect(chip('inc')).toBeNull();

    fireEvent.click(chip('nao'));
    expect(within(tabela).getAllByRole('row')).toHaveLength(3);
    expect(tabela).toHaveTextContent('Plague');
    fireEvent.click(chip('conf'));
    expect(within(tabela).getAllByRole('row')).toHaveLength(2);
    expect(tabela).toHaveTextContent('Abaddon');
    fireEvent.click(chip('todas'));
    fireEvent.change(screen.getByTestId('busca-faixas'), { target: { value: 'byorn' } });
    expect(within(tabela).getAllByRole('row')).toHaveLength(2);
    expect(tabela).toHaveTextContent('2 LOUD');
  });

  it('cada faixa que não veio tem "Por quê?", que abre o diagnóstico dela; "mostrar no Explorer" pede o arquivo', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    api.reports.revealTrack.mockResolvedValue(true);
    montar(`/historico/${ID}`);
    const tabela = await screen.findByTestId('tabela-faixas');
    const porque = within(tabela).getAllByRole('link', { name: /Por que não veio/ });
    expect(porque).toHaveLength(2);
    expect(porque[0]).toHaveAttribute('href', `/historico/${ID}/faltas?faixa=vendex%20plague`);

    fireEvent.click(within(tabela).getByRole('button', { name: /Mostrar no Explorer: Azyr - No Escape/ }));
    expect(api.reports.revealTrack).toHaveBeenCalledWith(ID, 'azyr no escape');
  });

  it('se o arquivo sumiu do disco, avisa em vez de falhar calado', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    api.reports.revealTrack.mockResolvedValue(false);
    montar(`/historico/${ID}`);
    const tabela = await screen.findByTestId('tabela-faixas');
    fireEvent.click(within(tabela).getByRole('button', { name: /Mostrar no Explorer/ }));
    expect(await screen.findByTestId('aviso-detalhe')).toHaveTextContent('Não achei o arquivo no disco');
  });

  it('o arquivo que o beets moveu e o app não achou diz isso; o que ficou em downloads/ também', async () => {
    const d = detalhe();
    d.faixas = d.faixas.map((f) =>
      f.key === 'vendex abaddon'
        ? { ...f, arquivo: { caminho: 'downloads/Vendex/Vendex - Abbadon.flac', onde: 'downloads' } }
        : f,
    );
    api.reports.getRun.mockResolvedValue(d);
    montar(`/historico/${ID}`);
    const tabela = await screen.findByTestId('tabela-faixas');
    expect(tabela).toHaveTextContent('não achei em music/');
    expect(tabela).toHaveTextContent('downloads/Vendex/Vendex - Abbadon.flac');
    expect(tabela).toHaveTextContent('ainda em downloads/ (não organizada)');
  });

  it('lista os relatórios que existem e abre cada um; "Opções usadas" mostra o que difere do padrão', async () => {
    const d = detalhe();
    d.opcoes = { ...novasOpcoes(), Paralelo: 8, AceitarWav: true };
    api.reports.getRun.mockResolvedValue(d);
    api.reports.openFile.mockResolvedValue(true);
    montar(`/historico/${ID}`);
    const relatorios = await screen.findByTestId('relatorios');
    expect(relatorios).toHaveTextContent(`resultado-${ID}.txt`);
    expect(relatorios).toHaveTextContent('As 2 linhas que faltaram');
    expect(relatorios).not.toHaveTextContent('catalogo-');
    fireEvent.click(within(relatorios).getByRole('button', { name: `Abrir diagnostico-${ID}.txt` }));
    expect(api.reports.openFile).toHaveBeenCalledWith(ID, 'diagnostico');
    expect(screen.getByTestId('opcoes-usadas')).toHaveTextContent('-Paralelo 8 -AceitarWav');
  });

  it('execução do .bat não registrou as opções, e o app diz isso', async () => {
    api.reports.getRun.mockResolvedValue(detalhe({ opcoes: null }));
    montar(`/historico/${ID}`);
    expect(await screen.findByText(/não registradas \(execução antiga/)).toBeInTheDocument();
  });

  it('"Tentar de novo as 2" leva ao diagnóstico', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}`);
    const botao = await screen.findByTestId('tentar-de-novo');
    expect(botao).toHaveTextContent('Tentar de novo as 2');
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByTestId('diagnostico-nav')).toBeInTheDocument());
  });

  it('terminou com erro: o cartão de erro do catálogo, com a mensagem do script', async () => {
    const d = detalhe();
    d.resumo = { ...d.resumo, fim: 'config', mensagem: 'Nao consegui falar com o slskd (401)' };
    d.retentativa = null;
    api.reports.getRun.mockResolvedValue(d);
    montar(`/historico/${ID}`);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveAttribute('data-codigo-erro', 'lote.config');
    expect(screen.getByTestId('fim-da-execucao')).toHaveTextContent('Configuração inválida');
    expect(screen.queryByTestId('tentar-de-novo')).toBeNull();
  });

  it('execução em andamento: avisa e não oferece "tentar de novo" nem reprocessar', async () => {
    const d = detalhe();
    d.resumo = { ...d.resumo, fim: 'rodando', progresso: { feitas: 2, total: 6 } };
    api.reports.getRun.mockResolvedValue(d);
    montar(`/historico/${ID}`);
    expect(await screen.findByTestId('aviso-rodando')).toHaveTextContent('ainda está rodando');
    expect(screen.queryByTestId('tentar-de-novo')).toBeNull();
    expect(screen.getByTestId('reprocessar')).toBeDisabled();
  });

  it('execução parada: as faixas no meio aparecem como "não terminadas"', async () => {
    const d = detalhe();
    d.filtros = { ...d.filtros, inc: 1 };
    d.faixas = d.faixas.map((f, i) =>
      i === 0 ? { ...f, status: 'baixando', rotuloStatus: 'Baixando', grupo: 'inc' } : f,
    );
    api.reports.getRun.mockResolvedValue(d);
    montar(`/historico/${ID}`);
    await screen.findByTestId('tabela-faixas');
    expect(document.querySelector('[data-valor="incompletas"]')?.textContent).toBe('1');
    expect(document.querySelector('[data-filtro="inc"]')).toHaveTextContent('Não terminadas 1');
  });

  it('execução que não existe mais em lotes/', async () => {
    api.reports.getRun.mockResolvedValue(null);
    montar(`/historico/${ID}`);
    expect(await screen.findByTestId('execucao-inexistente')).toHaveTextContent('Execução não encontrada');
  });

  it('enquanto lê: carregando; se falhar: erro com "tentar de novo"', async () => {
    api.reports.getRun.mockReturnValueOnce(new Promise(() => undefined));
    const a = montar(`/historico/${ID}`);
    expect(screen.getByTestId('carregando')).toBeInTheDocument();
    a.unmount();
    api.reports.getRun.mockRejectedValueOnce(new Error('EBUSY'));
    montar(`/historico/${ID}`);
    expect(await screen.findByRole('alert')).toHaveAttribute('data-codigo-erro', 'inesperado');
  });

  describe('Reprocessar a lista do zero…', () => {
    it('explica o que será apagado, pede confirmação e manda a memória da lista para a Lixeira', async () => {
      api.reports.getRun.mockResolvedValue(detalhe());
      api.reports.listState.mockResolvedValue({ lista: 'lista.txt', faixas: 6, rodando: false });
      api.reports.resetList.mockResolvedValue(true);
      montar(`/historico/${ID}`);
      fireEvent.click(await screen.findByTestId('reprocessar'));
      const dialogo = await screen.findByTestId('dialogo-reprocessar');
      await waitFor(() => expect(dialogo).toHaveTextContent('apagar a memória de lista.txt (6 faixas registradas)'));
      expect(dialogo).toHaveTextContent('Lixeira');
      expect(api.reports.resetList).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirmar-reprocessar'));
      await waitFor(() => expect(api.reports.resetList).toHaveBeenCalledWith(ID));
      expect(await screen.findByTestId('aviso-detalhe')).toHaveTextContent('A memória de lista.txt foi para a Lixeira');
    });

    it('lista rodando agora: não deixa confirmar', async () => {
      api.reports.getRun.mockResolvedValue(detalhe());
      api.reports.listState.mockResolvedValue({ lista: 'lista.txt', faixas: 6, rodando: true });
      montar(`/historico/${ID}`);
      fireEvent.click(await screen.findByTestId('reprocessar'));
      await screen.findByTestId('dialogo-reprocessar');
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('está rodando agora'));
      expect(screen.getByTestId('confirmar-reprocessar')).toBeDisabled();
    });

    it('sem memória (nunca rodou ou já reprocessada): diz isso e não deixa confirmar', async () => {
      api.reports.getRun.mockResolvedValue(detalhe());
      api.reports.listState.mockResolvedValue(null);
      montar(`/historico/${ID}`);
      fireEvent.click(await screen.findByTestId('reprocessar'));
      const dialogo = await screen.findByTestId('dialogo-reprocessar');
      await waitFor(() => expect(dialogo).toHaveTextContent('não tem memória a apagar'));
      expect(screen.getByTestId('confirmar-reprocessar')).toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------- Diagnóstico

describe('tela Diagnóstico das faixas que não vieram', () => {
  it('lista as faixas que não vieram à esquerda e abre o diagnóstico da primeira', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}/faltas`);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('2 faixas não vieram');
    const nav = screen.getByTestId('diagnostico-nav');
    expect(within(nav).getAllByRole('button')).toHaveLength(2);
    expect(nav).toHaveTextContent('Vendex – Plague');
    expect(nav).toHaveTextContent('Só existe em formato não aceito');
    expect(nav).toHaveTextContent('Ninguém compartilha');
    expect(screen.getByTestId('titulo-da-faixa')).toHaveTextContent('Vendex – Plague');
  });

  it('para cada motivo, o que fazer; os arquivos mais parecidos e o catálogo do artista', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}/faltas`);
    const motivos = await screen.findByTestId('motivos');
    expect(
      within(motivos)
        .getAllByText(/×/)
        .map((e) => e.textContent),
    ).toEqual(['×2', '×1']);
    expect(motivos).toHaveTextContent('Formato WAV');
    expect(motivos).toHaveTextContent('Rode de novo com essa opção');
    expect(motivos).toHaveTextContent('Título diferente');
    expect(motivos).toHaveTextContent('Escolha um dos títulos sugeridos acima');

    const parecidos = screen.getByTestId('arquivos-parecidos');
    expect(parecidos).toHaveTextContent('formato wav (use -AceitarWav)');
    expect(parecidos).toHaveTextContent('@@c\\Music\\Vendex\\Vendex - Plague.wav');
    const catalogo = screen.getByTestId('catalogo');
    expect(catalogo).toHaveTextContent('Catálogo de Vendex no Soulseek');
    expect(catalogo).toHaveTextContent('Abbadon');
    expect(catalogo).toHaveTextContent('1 usuário');
    expect(screen.getByTestId('talvez-seja')).toHaveTextContent('Plague');
  });

  it('o chip do MusicBrainz e a linha dentro da lista (que o script informa depois)', async () => {
    const d = detalhe();
    d.diagnosticos = d.diagnosticos.map((x, i) =>
      i === 0
        ? { ...x, musicbrainz: { resultado: 'NAO EXISTE', rotulo: 'NÃO EXISTE', cor: 'laranja', similares: [] } }
        : x,
    );
    api.reports.getRun.mockResolvedValue(d);
    api.reports.listLines.mockResolvedValue({ 'vendex plague': 4 });
    montar(`/historico/${ID}/faltas`);
    expect(await screen.findByText('MusicBrainz: NÃO EXISTE')).toBeInTheDocument();
    expect(await screen.findByTestId('linha-na-lista')).toHaveTextContent('linha 4 de lista.txt');
    expect(api.reports.listLines).toHaveBeenCalledWith(ID);
  });

  it('escolher outra faixa troca o painel (e a escolha vai para o endereço)', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}/faltas`);
    await screen.findByTestId('diagnostico-faixa');
    fireEvent.click(screen.getByRole('button', { name: /Ver o diagnóstico de Fulano Inexistente - Nada Aqui/ }));
    expect(screen.getByTestId('titulo-da-faixa')).toHaveTextContent('Fulano Inexistente – Nada Aqui');
    expect(screen.getByTestId('motivos')).toHaveTextContent('0 respostas');
    expect(screen.getByTestId('motivos')).toHaveTextContent('Confira a grafia do artista');
    expect(screen.getByTestId('catalogo')).toHaveTextContent('não achou nenhuma faixa dele');
    expect(screen.queryByTestId('talvez-seja')).toBeNull();
  });

  it('abre direto na faixa pedida pelo "Por quê?" do detalhe', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}/faltas?faixa=fulano%20inexistente%20nada%20aqui`);
    expect(await screen.findByTestId('titulo-da-faixa')).toHaveTextContent('Nada Aqui');
  });

  it('formato que o lote não aceita: botão para abrir o Soulbeet', async () => {
    const d = detalhe();
    d.diagnosticos = d.diagnosticos.map((x, i) =>
      i === 0
        ? {
            ...x,
            motivos: [
              {
                tipo: 'formato',
                bruto: 'formato m4a',
                n: 1,
                rotulo: 'Formato m4a',
                acao: 'Só existe nesse formato, que o lote não aceita.',
                sugere: {},
                botao: 'soulbeet',
              },
            ],
          }
        : x,
    );
    api.reports.getRun.mockResolvedValue(d);
    montar(`/historico/${ID}/faltas`);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Soulbeet' }));
    expect(api.stack.openService).toHaveBeenCalledWith('soulbeet', 'preferencia');
  });

  describe('clicar numa sugestão corrige a linha', () => {
    function prepararCorrecao() {
      let corrigido = false;
      const correcao: CorrecaoFaixa = {
        titulo: 'Plague',
        linha: 'Vendex - Plague',
        lista: { nome: 'lista.txt', numero: 4, original: 'Vendex - Plage', escrita: 'Vendex - Plague' },
        em: '2026-10-07T00:00:00Z',
      };
      api.reports.getRun.mockImplementation(() =>
        Promise.resolve(detalhe({}, corrigido ? { 'vendex plague': correcao } : {})),
      );
      api.reports.applySuggestion.mockImplementation(() => {
        corrigido = true;
        return Promise.resolve({ correcao, listaAtualizada: true, motivoNaoAtualizada: null });
      });
      api.reports.undoSuggestion.mockImplementation(() => {
        corrigido = false;
        return Promise.resolve(true);
      });
      return correcao;
    }

    it('guarda a correção, mostra "Corrigida" com a linha nova e diz que a lista também foi atualizada', async () => {
      prepararCorrecao();
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Plague' }));
      expect(api.reports.applySuggestion).toHaveBeenCalledWith(ID, 'vendex plague', 'Plague', { atualizarLista: true });
      const ok = await screen.findByTestId('corrigida');
      expect(ok).toHaveTextContent('Corrigida');
      expect(screen.getByTestId('nova-linha')).toHaveTextContent('Vendex - Plague');
      expect(ok).toHaveTextContent('entra no próximo "tentar de novo"');
      expect(screen.getByTestId('situacao-da-lista')).toHaveTextContent('lista.txt também foi atualizada (linha 4)');
      // a lista da esquerda também marca a faixa
      expect(screen.getByTestId('diagnostico-nav')).toHaveTextContent('Corrigida');
    });

    it('"Desfazer" volta ao que era', async () => {
      prepararCorrecao();
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Plague' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
      expect(api.reports.undoSuggestion).toHaveBeenCalledWith(ID, 'vendex plague', { atualizarLista: true });
      await waitFor(() => expect(screen.queryByTestId('corrigida')).toBeNull());
    });

    it('se o editor está com texto não salvo da mesma lista, o app não mexe no arquivo por baixo dele', async () => {
      prepararCorrecao();
      api.reports.applySuggestion.mockResolvedValue({
        correcao: { titulo: 'Plague', linha: 'Vendex - Plague', lista: null, em: 'x' },
        listaAtualizada: false,
        motivoNaoAtualizada: 'editando',
      });
      useRascunho.setState({ lista: conteudo('lista.txt'), texto: 'mudei', textoSalvo: 'Vendex - Plague' });
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Plague' }));
      await waitFor(() =>
        expect(api.reports.applySuggestion).toHaveBeenCalledWith(ID, 'vendex plague', 'Plague', {
          atualizarLista: false,
        }),
      );
    });

    it('lista aberta no editor e atualizada pelo app: o editor é relido para não guardar o texto antigo', async () => {
      prepararCorrecao();
      api.lists.read.mockResolvedValue(conteudo('lista.txt', 'Vendex - Plague'));
      useRascunho.setState({
        lista: conteudo('lista.txt', 'Vendex - Plage'),
        texto: 'Vendex - Plage',
        textoSalvo: 'Vendex - Plage',
      });
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Plague' }));
      await waitFor(() => expect(useRascunho.getState().texto).toBe('Vendex - Plague'));
    });

    it('o catálogo do artista também corrige', async () => {
      prepararCorrecao();
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Usar o título Abbadon' }));
      expect(api.reports.applySuggestion).toHaveBeenCalledWith(ID, 'vendex plague', 'Abbadon', {
        atualizarLista: true,
      });
    });

    it('erro ao corrigir aparece na tela', async () => {
      prepararCorrecao();
      api.reports.applySuggestion.mockRejectedValue(
        new Error("Error invoking remote method 'reports:applySuggestion': Error: Execução não encontrada."),
      );
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Plague' }));
      expect(await screen.findByText(/Não consegui corrigir a linha: Execução não encontrada\./)).toBeInTheDocument();
    });
  });

  describe('Tentar de novo', () => {
    it('mostra o arquivo que será gerado e as opções que os motivos sugerem', async () => {
      api.reports.getRun.mockResolvedValue(detalhe());
      montar(`/historico/${ID}/faltas`);
      const rodape = await screen.findByTestId('rodape-tentar-de-novo');
      expect(rodape).toHaveTextContent('Tentar de novo as 2');
      expect(rodape).toHaveTextContent(`nao-baixadas-${ID}.txt`);
      // a fixture rodou com SemBeets e SemCatalogo; o formato recusado pede -AceitarWav e -AceitarMp3Menor
      expect(screen.getByTestId('opcoes-sugeridas').textContent).toBe(
        '-AceitarWav -AceitarMp3Menor -SemCatalogo -SemBeets',
      );
    });

    it('lista que já rodou: avisa que o -Retentar tenta de novo o que falhou', async () => {
      api.reports.getRun.mockResolvedValue(detalhe({}, {}, true));
      montar(`/historico/${ID}/faltas`);
      expect(await screen.findByTestId('rodape-tentar-de-novo')).toHaveTextContent(
        '-Retentar tenta de novo o que falhou',
      );
      expect(screen.getByTestId('opcoes-sugeridas')).toHaveTextContent('-Retentar');
    });

    it('gera a lista, abre no editor com as opções sugeridas e vai para a tela de Opções', async () => {
      const d = detalhe();
      api.reports.getRun.mockResolvedValue(d);
      api.reports.buildRetryList.mockResolvedValue({
        lista: ref(`nao-baixadas-${ID}.txt`),
        retentativa: d.retentativa,
      });
      api.lists.read.mockResolvedValue(
        conteudo(`nao-baixadas-${ID}.txt`, 'Vendex - Plague\nFulano Inexistente - Nada Aqui'),
      );
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByTestId('revisar-e-tentar'));
      expect(await screen.findByTestId('local')).toHaveTextContent('/lista/opcoes');
      expect(api.reports.buildRetryList).toHaveBeenCalledWith(ID);
      expect(api.lists.read).toHaveBeenCalledWith(`nao-baixadas-${ID}.txt`);
      const s = useRascunho.getState();
      expect(s.lista?.nome).toBe(`nao-baixadas-${ID}.txt`);
      expect(s.opcoes).toMatchObject({ AceitarWav: true, AceitarMp3Menor: true, SemBeets: true, Retentar: false });
    });

    it('a receita "usuários lentos" de um motivo faz o mesmo caminho', async () => {
      const d = detalhe();
      d.diagnosticos = d.diagnosticos.map((x, i) =>
        i === 0
          ? {
              ...x,
              status: 'falhou',
              motivos: [
                {
                  tipo: 'fila',
                  bruto: 'fila longa em a (>4 min)',
                  n: 3,
                  rotulo: 'Fila longa demais',
                  acao: 'Tente de novo dando mais tempo à fila.',
                  sugere: { FilaMaxMin: 10, DownloadMaxMin: 40 },
                  botao: 'receita-usuarios-lentos',
                },
              ],
            }
          : x,
      );
      api.reports.getRun.mockResolvedValue(d);
      api.reports.buildRetryList.mockResolvedValue({
        lista: ref(`nao-baixadas-${ID}.txt`),
        retentativa: d.retentativa,
      });
      api.lists.read.mockResolvedValue(conteudo(`nao-baixadas-${ID}.txt`));
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByRole('button', { name: 'Receita: usuários lentos' }));
      expect(await screen.findByTestId('local')).toHaveTextContent('/lista/opcoes');
    });

    it('se não conseguiu gerar a lista, fica na tela e diz por quê', async () => {
      api.reports.getRun.mockResolvedValue(detalhe());
      api.reports.buildRetryList.mockRejectedValue(new Error('EPERM: sem permissão'));
      montar(`/historico/${ID}/faltas`);
      fireEvent.click(await screen.findByTestId('revisar-e-tentar'));
      expect(await screen.findByText(/Não consegui gerar a lista: EPERM/)).toBeInTheDocument();
      expect(screen.queryByTestId('local')).toBeNull();
    });
  });

  it('execução sem faixas que não vieram: nada para diagnosticar', async () => {
    api.reports.getRun.mockResolvedValue(detalhe({ diagnosticos: [], retentativa: null }));
    montar(`/historico/${ID}/faltas`);
    expect(await screen.findByTestId('sem-faltas')).toHaveTextContent('Nada para diagnosticar');
  });

  it('o link de volta leva ao detalhe da execução', async () => {
    api.reports.getRun.mockResolvedValue(detalhe());
    montar(`/historico/${ID}/faltas`);
    const voltar = await screen.findByRole('link', { name: /lista\.txt · / });
    expect(voltar).toHaveAttribute('href', `/historico/${ID}`);
  });
});
