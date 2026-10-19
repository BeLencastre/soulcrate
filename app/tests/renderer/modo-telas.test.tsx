// @vitest-environment jsdom
// Modo DJ e Modo Dev renderizados de verdade (React + Testing Library), com o `window.soulcrate` simulado: o
// alternador da barra lateral, o atalho Ctrl+Shift+D, e o Início, Serviços e Histórico no DJ.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecucaoResumo } from '../../src/shared/historico';
import type { AppSettings, ModoInterface } from '../../src/shared/ipc';
import { statusInicial, type ContainerEstado, type Saude, type StackStatus } from '../../src/shared/stack';

const api = vi.hoisted(() => ({
  app: { getSettings: vi.fn(), setSettings: vi.fn(), openExternal: vi.fn(), copyText: vi.fn() },
  stack: {
    up: vi.fn(),
    down: vi.fn(),
    status: vi.fn(),
    openService: vi.fn(),
    restartService: vi.fn(),
    runChecks: vi.fn(),
  },
  env: { startDockerDesktop: vi.fn(), check: vi.fn() },
  reports: { listRuns: vi.fn() },
  library: { list: vi.fn(), sharing: vi.fn() },
  config: { read: vi.fn() },
  batch: { openFolder: vi.fn() },
  update: { state: vi.fn() },
  stackFiles: { status: vi.fn() },
  // a tela Serviços no Modo Dev (depois de "Mostrar detalhes técnicos") assina os logs
  logs: { subscribe: vi.fn(), unsubscribe: vi.fn() },
  onEvent: vi.fn(),
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

// importados depois do mock
const { BarraLateral } = await import('../../src/renderer/components/BarraLateral');
const { Inicio } = await import('../../src/renderer/paginas/Inicio');
const { Servicos } = await import('../../src/renderer/paginas/Servicos');
const { Historico } = await import('../../src/renderer/paginas/historico/Historico');
const { chaveStatus } = await import('../../src/renderer/lib/estado');
const { chaveSettings } = await import('../../src/renderer/lib/preferencias');
const { useAtalhoDoModo } = await import('../../src/renderer/lib/modo');

const SETTINGS: AppSettings = {
  minimizarParaBandeja: true,
  avisoBandejaDispensado: true,
  pastaDoProjeto: null,
  iniciarComWindows: false,
  tema: 'escuro',
  abrirWebUi: 'app',
  avisarFimDoLote: true,
  avisarBuscasPausadas: true,
  modo: null,
};

function status(parcial: Partial<StackStatus> = {}): StackStatus {
  return {
    ...statusInicial(),
    atualizadoEm: 1,
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: {
      instalacao: 'ok',
      desktop: 'aberto',
      engine: true,
      versaoServidor: '29.0.0',
      compose: '5.0.0',
      abrindo: null,
    },
    configuracao: { estado: 'valida', erros: 0, avisos: 0, achados: [] },
    ...parcial,
  };
}

type Excecoes = Partial<Record<'slskd' | 'soulbeet' | 'navidrome', { c?: ContainerEstado; s?: Saude; http?: boolean }>>;
function noAr(excecoes: Excecoes = {}): StackStatus {
  const base = status();
  return {
    ...base,
    servicos: base.servicos.map((s) => {
      const e = excecoes[s.id] ?? {};
      const container = e.c ?? 'running';
      return {
        ...s,
        container,
        saude: e.s ?? 'healthy',
        http: e.http ?? (container === 'running' ? true : null),
        statusTexto: 'Up',
      };
    }),
  };
}

const execucao = (extra: Partial<ExecucaoResumo> = {}): ExecucaoResumo => ({
  id: '20261007-154809',
  inicio: Date.now() - 60_000,
  duracaoMs: 27_000,
  lista: 'set-sexta.txt',
  fonte: 'eventos',
  fim: 'completed',
  mensagem: '',
  contagem: { total: 11, ok: 10, naoVieram: 1, puladas: 0, atencao: 0, naoTerminadas: 0 },
  progresso: null,
  temFaltas: true,
  ...extra,
});

function montar(ui: ReactElement, s: StackStatus, modo: ModoInterface | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, s);
  const preferencias = { ...SETTINGS, modo };
  qc.setQueryData(chaveSettings, preferencias);
  // a releitura ao montar nunca responde: a preferência é a semeada acima, e não volta por cima de uma troca
  api.app.getSettings.mockReturnValue(new Promise(() => undefined));
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const grupo of Object.values(api)) {
    if (typeof grupo === 'function') continue; // api.onEvent, abaixo
    for (const f of Object.values(grupo)) (f as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  }
  api.app.setSettings.mockImplementation((p: Partial<AppSettings>) => Promise.resolve({ ...SETTINGS, ...p }));
  api.reports.listRuns.mockResolvedValue([]);
  api.library.list.mockReturnValue(new Promise(() => undefined));
  api.update.state.mockResolvedValue({ estado: 'ocioso', ultimaChecagemEm: null });
  api.onEvent.mockReset().mockReturnValue(() => undefined);
});
afterEach(cleanup);

// ---------------------------------------------------------------- Alternador, aviso e atalho

describe('alternador de modo na barra lateral', () => {
  it('dois botões pressionáveis num grupo rotulado; o atalho está anunciado no título', () => {
    montar(<BarraLateral />, noAr(), null);
    const grupo = screen.getByRole('group', { name: 'Modo da interface' });
    const dj = within(grupo).getByRole('button', { name: /DJ/ });
    const dev = within(grupo).getByRole('button', { name: /Dev/ });
    expect(dj).toHaveAttribute('aria-pressed', 'false');
    expect(dev).toHaveAttribute('aria-pressed', 'true');
    expect(dj).toHaveAttribute('title', 'Mudar para o Modo DJ (Ctrl+Shift+D)');
    expect(dj).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+D');
    // sem escolha, a barra lateral é a de sempre: os serviços com porta
    expect(screen.getByText(':5030')).toBeInTheDocument();
  });

  it('trocar para DJ grava a preferência e esconde as portas na hora, sem aviso', async () => {
    montar(<BarraLateral />, noAr(), 'dev');
    fireEvent.click(screen.getByRole('button', { name: /DJ/ }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ modo: 'dj' }));
    expect(screen.getByRole('button', { name: /DJ/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(':5030')).toBeNull();
    expect(screen.getByTestId('resumo-stack')).toHaveTextContent('Ligado');
    expect(screen.getByText('Pronto para baixar e ouvir')).toBeInTheDocument();
    expect(screen.queryByText('Modo DJ ligado')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Dev/ }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenLastCalledWith({ modo: 'dev' }));
    expect(screen.getByText(':5030')).toBeInTheDocument();
  });
});

function ComAtalho({ ativo }: { ativo: boolean }) {
  useAtalhoDoModo(ativo);
  return <p>tela</p>;
}

describe('atalho Ctrl+Shift+D', () => {
  it('alterna o modo', async () => {
    montar(<ComAtalho ativo />, noAr(), 'dev');
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, code: 'KeyD', key: 'D' });
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ modo: 'dj' }));
  });

  it('desligado (no assistente) e outras teclas não fazem nada', () => {
    montar(<ComAtalho ativo={false} />, noAr(), 'dev');
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, code: 'KeyD', key: 'D' });
    fireEvent.keyDown(window, { ctrlKey: true, code: 'KeyD', key: 'd' });
    expect(api.app.setSettings).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Início

describe('Início no Modo DJ', () => {
  it('tudo no ar: "Tudo pronto", os atalhos e o último download, sem as cinco etapas nem o log', async () => {
    api.reports.listRuns.mockResolvedValue([execucao()]);
    montar(<Inicio />, noAr(), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tudo pronto');
    expect(document.querySelector('[data-etapa]')).toBeNull();
    expect(screen.queryByText('Log da stack')).toBeNull();
    const atalhos = screen.getByRole('region', { name: 'O que fazer' });
    expect(within(atalhos).getByRole('link', { name: /Baixar uma lista/ })).toHaveAttribute('href', '/lista');
    fireEvent.click(within(atalhos).getByRole('button', { name: /Ouvir a biblioteca/ }));
    expect(api.stack.openService).toHaveBeenCalledWith('navidrome', 'preferencia');
    const ultimo = await screen.findByTestId('ultimo-download');
    expect(ultimo).toHaveTextContent('set-sexta');
    expect(ultimo).not.toHaveTextContent('set-sexta.txt');
    expect(ultimo).toHaveTextContent('10 de 11 faixas chegaram. 1 não veio.');
    expect(within(ultimo).getByRole('link', { name: 'Ver o que faltou' })).toHaveAttribute(
      'href',
      '/historico/20261007-154809/faltas',
    );
    // o mesmo par de botões do Modo Dev: um só Ligar/Desligar e Reiniciar
    expect(screen.queryByRole('button', { name: 'Ligar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Desligar' }));
    expect(api.stack.down).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect(api.stack.up).toHaveBeenCalledWith({ rebuild: true });
  });

  it('desligado: uma frase e o botão Ligar; os atalhos das interfaces esperam o Soulcrate ligar', () => {
    montar(<Inicio />, status(), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('O Soulcrate está desligado');
    expect(screen.getByRole('button', { name: /Buscar uma faixa/ })).toBeDisabled();
    expect(screen.getAllByText('Ligue o Soulcrate para usar')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    expect(api.stack.up).toHaveBeenCalled();
  });

  it('Docker Desktop fechado: abrir o Docker, ou ver os detalhes técnicos no Modo Dev', async () => {
    montar(<Inicio />, status({ docker: { ...status().docker, engine: false } }), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('O Docker Desktop está fechado');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o Docker Desktop' }));
    expect(api.env.startDockerDesktop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes técnicos' }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ modo: 'dev' }));
    // a mesma tela, agora no Modo Dev: as cinco etapas voltaram
    await waitFor(() => expect(document.querySelectorAll('[data-etapa]')).toHaveLength(5));
  });

  it('o player não responde: reiniciar só ele, e a saída discreta para o Modo Dev', () => {
    montar(<Inicio />, noAr({ navidrome: { s: 'unhealthy' } }), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('O player não está respondendo');
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar o player' }));
    expect(api.stack.restartService).toHaveBeenCalledWith('navidrome');
    expect(screen.getByTestId('saida-para-dev')).toHaveTextContent('Mostrar detalhes técnicos');
  });

  it('ligando: o passo de agora, de quatro', () => {
    montar(<Inicio />, noAr({ slskd: { s: 'starting' } }), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ligando…');
    expect(screen.getByTestId('passos-de-ligar')).toHaveTextContent('Passo 4 de 4 · esperando tudo responder');
  });

  describe('aviso "Os arquivos da stack foram atualizados"', () => {
    const comAviso = () =>
      api.stackFiles.status.mockResolvedValue({
        gerenciada: true,
        motivoSemGestao: null,
        versaoDaPasta: '1.1.0',
        versaoDoApp: '1.1.0',
        pendente: false,
        esperando: false,
        arquivosPendentes: 0,
        aviso: {
          aplicadoEm: 1,
          versaoAnterior: '1.0.0',
          versaoNova: '1.1.0',
          atualizados: ['baixar-lista.ps1'],
          copiados: [],
          mantidos: [],
          precisaReconstruir: false,
          dispensado: false,
        },
      });

    it('aparece no Modo Dev', async () => {
      comAviso();
      montar(<Inicio />, noAr(), 'dev');
      expect(await screen.findByTestId('aviso-arquivos-da-stack')).toBeInTheDocument();
    });

    it('não aparece no Modo DJ', async () => {
      comAviso();
      montar(<Inicio />, noAr(), 'dj');
      await screen.findByTestId('inicio-dj');
      // espera as consultas da tela assentarem (o aviso, se fosse desenhado, já teria chegado)
      await waitFor(() => expect(api.reports.listRuns).toHaveBeenCalled());
      expect(screen.queryByTestId('aviso-arquivos-da-stack')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------- Serviços

describe('Serviços no Modo DJ', () => {
  it('um cartão por coisa que a pessoa usa, o que precisa de atenção com o botão que resolve', async () => {
    const check = (id: string, estado = 'ok') => ({ id, estado, itens: [], nota: null });
    api.stack.runChecks.mockResolvedValue({
      verificadoEm: Date.now(),
      executado: true,
      checks: [
        check('containers'),
        check('endpoints', 'erro'),
        check('plugins'),
        check('pastas'),
        check('importacoes'),
      ],
    });
    api.library.sharing.mockResolvedValue({ ok: true, compartilhamento: { arquivos: 10, escaneando: false } });
    api.config.read.mockResolvedValue({ slskUsuario: 'crate_digger' });
    montar(<Servicos />, noAr({ soulbeet: { http: false } }), 'dj');

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Uma coisa precisa de atenção'),
    );
    expect(screen.queryByRole('tab')).toBeNull(); // sem as abas dos logs
    const cartao = (id: string) => document.querySelector(`[data-cartao="${id}"]`) as HTMLElement;
    expect(cartao('soulbeet')).toHaveTextContent('Lento para responder');
    fireEvent.click(within(cartao('soulbeet')).getByRole('button', { name: 'Reiniciar o organizador' }));
    expect(api.stack.restartService).toHaveBeenCalledWith('soulbeet');
    await waitFor(() => expect(cartao('slskd')).toHaveTextContent('Conectado ao Soulseek como crate_digger.'));
    await waitFor(() => expect(cartao('compartilhamento')).toHaveTextContent('10 arquivos compartilhados'));
    expect(cartao('pastas')).toHaveTextContent('Tudo certo');
    expect(within(cartao('compartilhamento')).getByRole('link', { name: 'Ajustar' })).toHaveAttribute(
      'href',
      '/configuracoes?secao=compartilhamento',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar detalhes técnicos' }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ modo: 'dev' }));
  });

  it('desligado: diz como conferir, sem cartões', () => {
    montar(<Servicos />, status(), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('O Soulcrate está desligado');
    expect(document.querySelector('[data-cartao]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir para o Início' })).toHaveAttribute('href', '/');
  });
});

// ---------------------------------------------------------------- Histórico

describe('Histórico nos dois modos', () => {
  it.each(['dj', 'dev'] as const)(
    'Modo %s: "Seus downloads", com as mesmas colunas e a coluna Lista dizendo quantas faixas',
    async (modo) => {
      const original = execucao();
      const tentativa = execucao({
        id: '20261007-155900',
        lista: 'nao-baixadas-20261007-154809.txt',
        contagem: { total: 1, ok: 1, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 0 },
        temFaltas: false,
      });
      api.reports.listRuns.mockResolvedValue([tentativa, original]);
      montar(<Historico />, noAr(), modo);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seus downloads');
      const linhas = await screen.findAllByTestId('linha-execucao');
      expect(linhas[0]).toHaveTextContent('nao-baixadas-20261007-154809.txt');
      expect(linhas[0]).toHaveTextContent('1 faixa');
      expect(linhas[1]).toHaveTextContent('11 faixas');
      expect(linhas[1]).toHaveTextContent('Concluído');
      expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
        'Quando',
        'Lista',
        'Duração',
        'Resultado',
        'Fim',
        'Ações',
      ]);
      expect(screen.getByRole('button', { name: /Abrir pasta lotes/ })).toBeInTheDocument();
      expect(within(linhas[1] as HTMLElement).getByRole('link', { name: 'Ver o que faltou' })).toBeInTheDocument();
    },
  );
});
