// @vitest-environment jsdom
// A tela Início e a barra lateral renderizadas de verdade (React + Testing Library), com o `window.soulcrate` simulado.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarErro } from '../../src/shared/erros';
import { statusInicial, type ContainerEstado, type Saude, type StackStatus } from '../../src/shared/stack';

const api = vi.hoisted(() => ({
  stack: { up: vi.fn(), down: vi.fn(), openService: vi.fn(), status: vi.fn() },
  env: { startDockerDesktop: vi.fn(), check: vi.fn() },
  app: { openExternal: vi.fn(), copyText: vi.fn(), openLogsFolder: vi.fn() },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

// importados depois do mock
const { BarraLateral } = await import('../../src/renderer/components/BarraLateral');
const { Inicio } = await import('../../src/renderer/paginas/Inicio');
const { chaveStatus, useUi } = await import('../../src/renderer/lib/estado');

function status(parcial: Partial<StackStatus> = {}): StackStatus {
  const base = statusInicial();
  return {
    ...base,
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

const noAr = (container: ContainerEstado = 'running', saude: Saude = 'healthy'): StackStatus => ({
  ...status(),
  servicos: status().servicos.map((s) => ({
    ...s,
    container,
    saude,
    http: container === 'running' ? true : null,
    statusTexto: 'Up 2 hours',
  })),
});

function renderizar(s: StackStatus, ui: ReactElement = <Inicio />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, s);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BarraLateral />
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((grupo) =>
    Object.values(grupo).forEach((f) => f.mockReset().mockResolvedValue(undefined)),
  );
  useUi.setState({ operacao: null, logAberto: false, dialogoBandeja: false, webui: {} });
});
afterEach(cleanup);

const etapa = (id: string) => document.querySelector(`[data-etapa="${id}"]`) as HTMLElement;

describe('Início', () => {
  it('stack no ar: cinco etapas OK, os três serviços saudáveis e Desligar habilitado', () => {
    renderizar(noAr());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stack no ar');
    expect(['docker', 'desktop', 'configuracao', 'stack', 'servicos'].map((e) => etapa(e).dataset.estado)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
    expect(within(etapa('servicos')).getAllByText('saudável')).toHaveLength(3);
    expect((screen.getByRole('button', { name: 'Ligar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Desligar' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Reconstruir' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('resumo-stack').textContent).toBe('No ar · 3/3 saudáveis');
  });

  it('stack desligada: Ligar e "Ligar a stack" chamam stack.up; Desligar fica desabilitado', () => {
    renderizar(status());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A stack está desligada');
    expect((screen.getByRole('button', { name: 'Desligar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ligar a stack' }));
    expect(api.stack.up).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: /Reconstruir/ }));
    expect(api.stack.up).toHaveBeenLastCalledWith({ rebuild: true });
  });

  it('Docker Desktop fechado: explica e o botão abre o Docker (aceite da Fase 1)', () => {
    renderizar(
      status({
        docker: {
          instalacao: 'ok',
          desktop: 'fechado',
          engine: false,
          versaoServidor: null,
          compose: null,
          abrindo: null,
        },
      }),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('O Docker Desktop está fechado');
    expect(etapa('desktop').dataset.estado).toBe('erro');
    expect(etapa('stack').dataset.estado).toBe('aguardando');
    for (const nome of ['Ligar', 'Desligar', 'Reconstruir']) {
      expect((screen.getByRole('button', { name: new RegExp(nome) }) as HTMLButtonElement).disabled, nome).toBe(true);
    }
    fireEvent.click(within(etapa('desktop')).getByRole('button', { name: 'Abrir Docker Desktop' }));
    expect(api.env.startDockerDesktop).toHaveBeenCalledOnce();
  });

  it('abrindo o Docker Desktop: mostra os segundos de espera e some o botão', () => {
    renderizar(
      status({
        docker: {
          instalacao: 'ok',
          desktop: 'fechado',
          engine: false,
          versaoServidor: null,
          compose: null,
          abrindo: { desdeMs: Date.now() - 18_000 },
        },
      }),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Abrindo o Docker Desktop');
    expect(etapa('desktop').textContent).toMatch(/Esperando a engine ficar pronta… 1[78] s/);
    expect(within(etapa('desktop')).queryByRole('button')).toBeNull();
  });

  it('Docker ausente: leva ao download (link https) e a configuração aguarda', () => {
    renderizar(
      status({
        docker: {
          instalacao: 'ausente',
          desktop: 'desconhecido',
          engine: false,
          versaoServidor: null,
          compose: null,
          abrindo: null,
        },
      }),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('O Docker Desktop não foi encontrado');
    fireEvent.click(within(etapa('docker')).getByRole('button', { name: 'Baixar o Docker Desktop' }));
    expect(api.app.openExternal).toHaveBeenCalledWith('https://www.docker.com/products/docker-desktop/');
  });

  it('configuração inválida: o cartão diz quantos problemas e leva às Configurações', () => {
    renderizar(status({ configuracao: { estado: 'invalida', erros: 3, avisos: 0, achados: [] } }));
    expect(etapa('configuracao').dataset.estado).toBe('erro');
    expect(etapa('configuracao').textContent).toContain('3 problemas no .env ou no slskd.yml');
  });

  it('contêiner parado por fora: título, resumo da barra lateral e etapa 5 em erro', () => {
    const s = noAr();
    s.servicos = s.servicos.map((x) =>
      x.id === 'slskd' ? { ...x, container: 'exited' as const, saude: 'nenhuma' as const, http: null } : x,
    );
    renderizar(s);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Há serviços parados');
    expect(screen.getByTestId('resumo-stack').textContent).toBe('slskd parou');
    expect(etapa('stack').dataset.estado).toBe('erro');
    expect(etapa('servicos').dataset.estado).toBe('erro');
    expect(within(etapa('servicos')).getByText('parado')).toBeTruthy();
  });

  it('erro de uma operação aparece como cartão do catálogo e pode ser dispensado', () => {
    useUi.setState({
      operacao: {
        id: 'x',
        tipo: 'ligar',
        linhas: [],
        marcadores: [],
        terminou: true,
        erro: criarErro('porta.em-uso', { porta: '5030', detalhes: 'linhas...' }),
      },
    });
    renderizar(status());
    const alerta = screen.getByRole('alert');
    expect(within(alerta).getByRole('heading').textContent).toBe('A porta 5030 já está em uso');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Copiar detalhes' }));
    expect(api.app.copyText).toHaveBeenCalledWith(expect.stringContaining('A porta 5030 já está em uso') as string);
    fireEvent.click(within(alerta).getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ligando: o log mostra a saída ao vivo e os marcadores do build viram chips', () => {
    useUi.setState({
      logAberto: true,
      operacao: {
        id: 'x',
        tipo: 'ligar',
        terminou: false,
        erro: null,
        marcadores: ['plugins ok'],
        linhas: [
          { texto: '=> [soulbeet 7/9] RUN python3 /opt/fix-metadata.py', marcador: null },
          { texto: '#12 4.5 plugins ok - beets 2.11.0', marcador: 'plugins ok' },
        ],
      },
    });
    renderizar(status({ operacao: 'ligando' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ligando a stack');
    expect(screen.getByText(/primeiro build leva de 5 a 10 minutos/)).toBeTruthy();
    expect(screen.getByTestId('log-da-stack').textContent).toContain('plugins ok - beets 2.11.0');
    const chips = [...document.querySelectorAll('.st-verde')].map((c) => c.textContent);
    expect(chips).toContain('plugins ok');
  });

  it('interfaces web: abrir no navegador chama o IPC do serviço certo', () => {
    renderizar(noAr());
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no navegador: slskd' }));
    expect(api.stack.openService).toHaveBeenCalledWith('slskd', 'browser');
  });
});

describe('barra lateral', () => {
  it('seis telas, com a atual marcada, e os serviços com a porta', () => {
    renderizar(noAr(), <div />);
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Início', 'Baixar lista', 'Histórico', 'Biblioteca', 'Serviços', 'Configurações']);
    expect(within(nav).getByRole('link', { name: 'Início' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText(':5030')).toBeTruthy();
    expect(screen.getByText(':9765')).toBeTruthy();
    expect(screen.getByText(':4533')).toBeTruthy();
  });
});
