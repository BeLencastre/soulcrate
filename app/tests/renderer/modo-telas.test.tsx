// @vitest-environment jsdom
// Modo DJ e Modo Dev renderizados de verdade (React + Testing Library), com o `window.soulcrate` simulado: o
// alternador da barra lateral, o aviso com "Desfazer", o atalho Ctrl+Shift+D, e o Início, Serviços e Histórico no DJ.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const { AvisoDeModo } = await import('../../src/renderer/components/modo');
const { Inicio } = await import('../../src/renderer/paginas/Inicio');
const { Servicos } = await import('../../src/renderer/paginas/Servicos');
const { Historico } = await import('../../src/renderer/paginas/historico/Historico');
const { chaveStatus } = await import('../../src/renderer/lib/estado');
const { chaveSettings } = await import('../../src/renderer/lib/preferencias');
const { DURACAO_DO_AVISO_MS, useAtalhoDoModo, useAvisoDeModo } = await import('../../src/renderer/lib/modo');

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
      <MemoryRouter>
        {ui}
        <AvisoDeModo />
      </MemoryRouter>
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
  useAvisoDeModo.setState({ aviso: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  it('trocar para DJ grava a preferência, esconde as portas e mostra o aviso com Desfazer', async () => {
    montar(<BarraLateral />, noAr(), 'dev');
    fireEvent.click(screen.getByRole('button', { name: /DJ/ }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ modo: 'dj' }));
    expect(screen.getByRole('button', { name: /DJ/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(':5030')).toBeNull();
    expect(screen.getByTestId('resumo-stack')).toHaveTextContent('Ligado');
    expect(screen.getByText('Pronto para baixar e ouvir')).toBeInTheDocument();

    const aviso = screen.getByTestId('aviso-de-modo');
    expect(aviso).toHaveAttribute('role', 'status');
    expect(aviso).toHaveTextContent('Modo DJ ligado');
    expect(aviso).toHaveTextContent('Nada foi apagado.');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenLastCalledWith({ modo: 'dev' }));
    expect(screen.queryByTestId('aviso-de-modo')).toBeNull();
    expect(screen.getByText(':5030')).toBeInTheDocument();
  });

  it('o aviso some sozinho depois de 6 s', () => {
    vi.useFakeTimers();
    montar(<p>tela</p>, noAr(), 'dj');
    act(() => useAvisoDeModo.getState().mostrar('dj'));
    expect(screen.getByTestId('aviso-de-modo')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(DURACAO_DO_AVISO_MS - 1));
    expect(screen.getByTestId('aviso-de-modo')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('aviso-de-modo')).toBeNull();
  });
});

function ComAtalho({ ativo }: { ativo: boolean }) {
  useAtalhoDoModo(ativo);
  return <p>tela</p>;
}

describe('atalho Ctrl+Shift+D', () => {
  it('alterna o modo e mostra o aviso', async () => {
    montar(<ComAtalho ativo />, noAr(), 'dev');
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, code: 'KeyD', key: 'D' });
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ modo: 'dj' }));
    expect(screen.getByTestId('aviso-de-modo')).toHaveTextContent('Modo DJ ligado');
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
    fireEvent.click(screen.getByRole('button', { name: 'Desligar' }));
    expect(api.stack.down).toHaveBeenCalled();
  });

  it('desligado: uma frase e o botão Ligar; os atalhos das interfaces esperam o Soulcrate ligar', () => {
    montar(<Inicio />, status(), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('O Soulcrate está desligado');
    expect(screen.getByRole('button', { name: /Buscar uma faixa/ })).toBeDisabled();
    expect(screen.getAllByText('Ligue o Soulcrate para usar')).toHaveLength(3);
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
    expect(screen.getByTestId('aviso-de-modo')).toHaveTextContent('Modo Dev ligado');
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

describe('Histórico no Modo DJ', () => {
  it('"Seus downloads": a nova tentativa aparece com o nome da lista original, sem a coluna de fonte', async () => {
    const original = execucao();
    const tentativa = execucao({
      id: '20261007-155900',
      lista: 'nao-baixadas-20261007-154809.txt',
      contagem: { total: 1, ok: 1, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 0 },
      temFaltas: false,
    });
    api.reports.listRuns.mockResolvedValue([tentativa, original]);
    montar(<Historico />, noAr(), 'dj');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seus downloads');
    const linhas = await screen.findAllByTestId('linha-execucao');
    expect(linhas[0]).toHaveTextContent('set-sexta');
    expect(linhas[0]).not.toHaveTextContent('nao-baixadas');
    expect(linhas[0]).toHaveTextContent('Nova tentativa');
    expect(linhas[0]).toHaveTextContent('Só a faixa que tinha faltado');
    expect(linhas[0]).toHaveTextContent('1 chegou');
    expect(linhas[1]).toHaveTextContent('10 chegaram · 1 faltou');
    expect(screen.queryByText('eventos')).toBeNull();
    expect(screen.queryByRole('button', { name: /Abrir pasta lotes/ })).toBeNull();
    expect(within(linhas[1] as HTMLElement).getByRole('link', { name: 'Ver o que faltou' })).toBeInTheDocument();
  });
});
