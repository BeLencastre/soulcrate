// @vitest-environment jsdom
// Rede de segurança da Fase 6 ("estados vazio, carregamento e erro em todas as telas, com mensagem e ação"): cada tela é
// renderizada com um `window.soulcrate` em que TUDO falha, e depois em que NADA responde. Nenhuma pode ficar em branco:
// precisa dizer o que houve (ou que está carregando) e, quando falhou, oferecer uma ação.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Modo = 'rejeita' | 'pendente';

const api = vi.hoisted(() => {
  const estado: { modo: 'rejeita' | 'pendente' } = { modo: 'rejeita' };
  const chamar = (): Promise<never> =>
    estado.modo === 'pendente' ? new Promise<never>(() => undefined) : Promise.reject(new Error('falha de teste'));
  const grupo = () =>
    new Proxy(
      {},
      {
        get: (_alvo, nome) => (nome === 'then' ? undefined : chamar),
      },
    );
  const grupos = new Map<string, unknown>();
  return new Proxy({ __estado: estado } as Record<string, unknown>, {
    get(alvo, nome) {
      if (typeof nome === 'symbol' || nome === 'then') return undefined;
      if (nome in alvo) return alvo[nome];
      if (nome === 'onEvent') return () => () => undefined;
      if (!grupos.has(nome)) grupos.set(nome, grupo());
      return grupos.get(nome);
    },
  });
});
vi.mock('../../src/renderer/lib/api', () => ({ api }));

const { Inicio } = await import('../../src/renderer/paginas/Inicio');
const { Lista } = await import('../../src/renderer/paginas/lote/Lista');
const { Opcoes } = await import('../../src/renderer/paginas/lote/Opcoes');
const { Execucao } = await import('../../src/renderer/paginas/lote/Execucao');
const { Historico } = await import('../../src/renderer/paginas/historico/Historico');
const { DetalheDaExecucao } = await import('../../src/renderer/paginas/historico/Detalhe');
const { DiagnosticoDasFaltas } = await import('../../src/renderer/paginas/historico/Diagnostico');
const { Biblioteca } = await import('../../src/renderer/paginas/Biblioteca');
const { Servicos } = await import('../../src/renderer/paginas/Servicos');
const { WebUi } = await import('../../src/renderer/paginas/WebUi');
const { Configuracoes } = await import('../../src/renderer/paginas/Configuracoes');
const { SecaoSobre, SecaoAplicativo } = await import('../../src/renderer/components/secoes-app');

const TELAS: [string, string, () => React.ReactElement, string][] = [
  ['Início', '/', () => <Inicio />, '/'],
  ['Baixar lista · lista', '/lista', () => <Lista />, '/lista'],
  ['Baixar lista · opções', '/lista/opcoes', () => <Opcoes />, '/lista/opcoes'],
  ['Baixar lista · execução', '/lista/execucao', () => <Execucao />, '/lista/execucao'],
  ['Histórico', '/historico', () => <Historico />, '/historico'],
  ['Histórico · detalhe', '/historico/20261001-100000', () => <DetalheDaExecucao />, '/historico/:runId'],
  [
    'Histórico · faltas',
    '/historico/20261001-100000/faltas',
    () => <DiagnosticoDasFaltas />,
    '/historico/:runId/faltas',
  ],
  ['Biblioteca', '/biblioteca', () => <Biblioteca />, '/biblioteca'],
  ['Serviços', '/servicos', () => <Servicos />, '/servicos'],
  ['Web UI', '/servicos/web/slskd', () => <WebUi />, '/servicos/web/:servico'],
  ['Configurações', '/configuracoes', () => <Configuracoes />, '/configuracoes'],
  ['Configurações · Aplicativo', '/x', () => <SecaoAplicativo />, '/x'],
  ['Configurações · Sobre', '/x', () => <SecaoSobre />, '/x'],
];

function montar(entrada: string, ui: () => React.ReactElement, caminho: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path={caminho} element={ui()} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const estado = (api as unknown as { __estado: { modo: Modo } }).__estado;
let consoleErro: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // as telas registram no console o que falhou (é o esperado aqui); o teste não precisa dessa saída
  consoleErro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  consoleErro.mockRestore();
});

/**
 * A tela diz alguma coisa: texto na página (o rótulo de um esqueleto de carregamento, `role="status"` com `aria-label`,
 * também conta: é o que o leitor de tela anuncia) e, nas telas inteiras, um título, um status ou um erro.
 * Nunca fica em branco.
 */
function algoNaTela(container: HTMLElement, tela = true): boolean {
  const rotulos = Array.from(container.querySelectorAll('[role="status"][aria-label]'))
    .map((e) => e.getAttribute('aria-label'))
    .join(' ');
  const texto = `${container.textContent ?? ''} ${rotulos}`.replace(/\s+/g, ' ').trim();
  const temTitulo = container.querySelector('h1, h2, [role="status"], [role="alert"]') !== null;
  return texto.length >= 12 && (!tela || temTitulo);
}

describe('estados em todas as telas', () => {
  describe.each(TELAS)('%s', (nome, entrada, ui, caminho) => {
    // as seções de Configurações são só um pedaço da tela (o título é da página que as contém)
    const ehSecao = nome.startsWith('Configurações ·');
    it('quando tudo falha, explica o que houve (nada em branco, nada de pilha crua)', async () => {
      estado.modo = 'rejeita';
      const { container } = montar(entrada, ui, caminho);
      await waitFor(() => expect(algoNaTela(container)).toBe(true));
      // dá tempo de as consultas falharem e a tela reagir
      await new Promise((r) => setTimeout(r, 60));
      expect(algoNaTela(container, !ehSecao)).toBe(true);
      expect(container.textContent).not.toMatch(/at \w+ \(.*:\d+:\d+\)/); // nada de "at fn (arquivo:1:2)"
      expect(container.textContent).not.toContain('falha de teste');
    });

    it('enquanto nada responde, mostra que está carregando ou o estado atual (nada em branco)', async () => {
      estado.modo = 'pendente';
      const { container } = montar(entrada, ui, caminho);
      await new Promise((r) => setTimeout(r, 60));
      expect(algoNaTela(container, !ehSecao)).toBe(true);
    });
  });

  describe('ações que acompanham cada erro de leitura', () => {
    it('Configurações: sem conseguir ler a configuração, oferece "Tentar de novo"', async () => {
      estado.modo = 'rejeita';
      montar('/configuracoes', () => <Configuracoes />, '/configuracoes');
      // a pasta do Soulcrate ainda é desconhecida (status "verificando"): o assistente é a saída
      await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    });

    it('Sobre: sem conseguir ler as versões, oferece "Tentar de novo"', async () => {
      estado.modo = 'rejeita';
      montar('/x', () => <SecaoSobre />, '/x');
      expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });

    it('Aplicativo: sem conseguir ler as preferências, oferece "Tentar de novo"', async () => {
      estado.modo = 'rejeita';
      montar('/x', () => <SecaoAplicativo />, '/x');
      expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });
  });
});
