// @vitest-environment jsdom
// Configurações → Aplicativo e Sobre, os avisos de atualização no Início e a rede de segurança das telas (Fases 6 e 7),
// renderizados de verdade (React + Testing Library) com o `window.soulcrate` simulado.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoAtualizacao } from '../../src/shared/atualizacao';
import { criarErro } from '../../src/shared/erros';
import type { AppSettings } from '../../src/shared/ipc';
import type { InfoSobre } from '../../src/shared/sobre';
import { statusInicial, type StackStatus } from '../../src/shared/stack';
import type { EstadoDaStack } from '../../src/shared/stack-atualizacao';

const api = vi.hoisted(() => ({
  app: {
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    getAbout: vi.fn(),
    getCredits: vi.fn(),
    openLicenseFile: vi.fn(),
    createSupportBundle: vi.fn(),
    revealSupportBundle: vi.fn(),
    openExternal: vi.fn(),
    openLogsFolder: vi.fn(),
    copyText: vi.fn(),
  },
  update: { state: vi.fn(), check: vi.fn(), restartAndInstall: vi.fn() },
  stackFiles: { status: vi.fn(), apply: vi.fn(), dismissNotice: vi.fn() },
  stack: { up: vi.fn(), down: vi.fn(), openService: vi.fn(), status: vi.fn() },
  env: { startDockerDesktop: vi.fn(), check: vi.fn() },
  project: { openFolder: vi.fn() },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

const { SecaoAplicativo, SecaoSobre } = await import('../../src/renderer/components/secoes-app');
const { AvisoDeAtualizacaoDoApp, AvisoDosArquivosDaStack } = await import('../../src/renderer/components/AvisosDoApp');
const { TelaQuebrou } = await import('../../src/renderer/components/TelaQuebrou');
const { Inicio } = await import('../../src/renderer/paginas/Inicio');
const { chaveStatus } = await import('../../src/renderer/lib/estado');
const { chaveAtualizacao, chaveArquivosDaStack } = await import('../../src/renderer/lib/atualizacao');
const { chaveSettings } = await import('../../src/renderer/lib/preferencias');
const { useExecucao } = await import('../../src/renderer/lib/lote-store');
const { estadoInicialLote } = await import('../../src/shared/lote-estado');

// ---------------------------------------------------------------- montagem

const SETTINGS: AppSettings = {
  minimizarParaBandeja: true,
  avisoBandejaDispensado: false,
  pastaDoProjeto: null,
  iniciarComWindows: false,
  tema: 'escuro',
  abrirWebUi: 'app',
  avisarFimDoLote: true,
  avisarBuscasPausadas: true,
};

const INFO: InfoSobre = {
  app: {
    versao: '1.2.3',
    electron: '44.7.0',
    chromium: '140.0',
    node: '24.15.0',
    plataforma: 'win32',
    arquitetura: 'x64',
    empacotado: true,
  },
  stack: { instalada: '1.0.0', doApp: '1.1.0' },
  componentes: [
    { id: 'slskd', nome: 'slskd', versao: '0.26.0', fonte: 'conteiner', motivo: null },
    { id: 'beets', nome: 'Soulbeet · beets', versao: null, fonte: null, motivo: 'stack-desligada' },
    { id: 'navidrome', nome: 'Navidrome', versao: '0.64.2', fonte: 'imagem', motivo: null },
  ],
};

const ARQUIVOS_EM_DIA: EstadoDaStack = {
  gerenciada: true,
  motivoSemGestao: null,
  versaoDaPasta: '1.0.0',
  versaoDoApp: '1.0.0',
  pendente: false,
  esperando: false,
  arquivosPendentes: 0,
  aviso: null,
};

function status(): StackStatus {
  return { ...statusInicial(), atualizadoEm: 1, projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' } };
}

function montar(ui: React.ReactElement, dados: { atualizacao?: EstadoAtualizacao; arquivos?: EstadoDaStack } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, status());
  if (dados.atualizacao) qc.setQueryData(chaveAtualizacao, dados.atualizacao);
  if (dados.arquivos) qc.setQueryData(chaveArquivosDaStack, dados.arquivos);
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  for (const grupo of Object.values(api))
    for (const f of Object.values(grupo)) f.mockReset().mockResolvedValue(undefined);
  api.app.getSettings.mockResolvedValue(SETTINGS);
  api.app.setSettings.mockImplementation((parcial: Partial<AppSettings>) =>
    Promise.resolve({ ...SETTINGS, ...parcial }),
  );
  api.app.getAbout.mockResolvedValue(INFO);
  api.update.state.mockResolvedValue({ estado: 'ocioso', ultimaChecagemEm: null });
  api.stackFiles.status.mockResolvedValue(ARQUIVOS_EM_DIA);
  useExecucao.setState({ runId: null, estado: estadoInicialLote() });
});
afterEach(cleanup);

// ---------------------------------------------------------------- Aplicativo

describe('Configurações → Aplicativo', () => {
  it('mostra as preferências de agora e grava cada mudança na hora', async () => {
    montar(<SecaoAplicativo />);
    const iniciar = await screen.findByRole('switch', { name: /Iniciar com o Windows/ });
    await waitFor(() => expect(iniciar).toBeEnabled());
    expect(iniciar).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Fechar a janela minimiza/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Avisar quando um lote terminar/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dentro do app' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked();

    fireEvent.click(iniciar);
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ iniciarComWindows: true }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Iniciar com o Windows/ })).toBeChecked());

    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ tema: 'claro' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked());

    fireEvent.click(screen.getByRole('radio', { name: 'No navegador' }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ abrirWebUi: 'navegador' }));

    fireEvent.click(screen.getByRole('switch', { name: /Avisar quando as buscas forem pausadas/ }));
    await waitFor(() => expect(api.app.setSettings).toHaveBeenCalledWith({ avisarBuscasPausadas: false }));
  });

  it('o tema tem as três opções do protótipo, com rótulo', async () => {
    montar(<SecaoAplicativo />);
    const grupo = await screen.findByRole('group', { name: 'Tema' });
    expect(
      within(grupo)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(['escuro', 'claro', 'sistema']);
    expect(within(grupo).getByText('Igual ao Windows')).toBeInTheDocument();
  });

  it('enquanto lê, os controles ficam desligados (sem gravar por cima do que ainda não leu)', () => {
    api.app.getSettings.mockReturnValue(new Promise(() => undefined));
    montar(<SecaoAplicativo />);
    expect(screen.getByRole('switch', { name: /Iniciar com o Windows/ })).toBeDisabled();
    expect(screen.getByTestId('secao-aplicativo')).toHaveAttribute('aria-busy', 'true');
  });

  it('se não conseguir ler, mostra o erro com "Tentar de novo"', async () => {
    api.app.getSettings.mockRejectedValue(new Error('disco travou'));
    montar(<SecaoAplicativo />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- Sobre

describe('Configurações → Sobre', () => {
  it('versões do app, da stack e dos componentes, com a fonte de cada uma', async () => {
    montar(<SecaoSobre />);
    expect(screen.getByTestId('sobre-carregando')).toBeInTheDocument();
    expect(await screen.findByTestId('versao-do-app')).toHaveTextContent('1.2.3');
    expect(screen.getByTestId('versao-da-stack')).toHaveTextContent('1.0.0');
    expect(screen.getByTestId('sobre-versoes')).toHaveTextContent('o app traz a 1.1.0');
    expect(screen.getByTestId('versao-slskd')).toHaveTextContent('0.26.0');
    expect(screen.getByTestId('sobre-versoes')).toHaveTextContent('lida do contêiner');
    expect(screen.getByTestId('versao-navidrome')).toHaveTextContent('0.64.2');
    expect(screen.getByTestId('sobre-versoes')).toHaveTextContent('rótulo da imagem do contêiner');
    // o que não deu para ler diz por quê, em vez de ficar em branco
    expect(screen.getByTestId('versao-beets')).toHaveTextContent('Ligue a stack para ler');
  });

  it('em desenvolvimento diz que é desenvolvimento', async () => {
    api.app.getAbout.mockResolvedValue({ ...INFO, app: { ...INFO.app, empacotado: false } });
    montar(<SecaoSobre />);
    await screen.findByTestId('versao-do-app');
    expect(screen.getByTestId('sobre-versoes')).toHaveTextContent('desenvolvimento');
  });

  it('não conseguir ler as informações vira um erro com "Tentar de novo"', async () => {
    api.app.getAbout.mockRejectedValue(new Error('x'));
    montar(<SecaoSobre />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it.each<[EstadoAtualizacao, RegExp]>([
    [{ estado: 'ocioso', ultimaChecagemEm: null }, /procura atualização ao abrir e a cada 24 horas/],
    [{ estado: 'verificando' }, /Procurando atualização/],
    [{ estado: 'baixando', versao: '1.3.0', percentual: 42 }, /Baixando a versão 1\.3\.0… 42%/],
    [{ estado: 'pronta', versao: '1.3.0' }, /A versão 1\.3\.0 está pronta\. Ela entra quando o app reiniciar/],
    [{ estado: 'indisponivel', motivo: 'desenvolvimento' }, /só existe no app instalado/],
    [{ estado: 'indisponivel', motivo: 'sem-instalador' }, /não foi aberto pelo instalador/],
    [
      { estado: 'atualizado', ultimaChecagemEm: Date.now() },
      /Você está na versão mais nova\. Última checagem: hoje às/,
    ],
  ])('a linha da atualização diz o estado (%j)', async (estado, texto) => {
    montar(<SecaoSobre />, { atualizacao: estado });
    expect(await screen.findByTestId('estado-atualizacao')).toHaveTextContent(texto);
  });

  it('"Procurar atualização" pede ao main; fica desligado onde não há atualização (desenvolvimento) ou enquanto procura', async () => {
    montar(<SecaoSobre />, { atualizacao: { estado: 'ocioso', ultimaChecagemEm: null } });
    fireEvent.click(await screen.findByRole('button', { name: 'Procurar atualização' }));
    expect(api.update.check).toHaveBeenCalledTimes(1);
    cleanup();

    montar(<SecaoSobre />, { atualizacao: { estado: 'indisponivel', motivo: 'desenvolvimento' } });
    expect(await screen.findByRole('button', { name: 'Procurar atualização' })).toBeDisabled();
    cleanup();

    montar(<SecaoSobre />, { atualizacao: { estado: 'verificando' } });
    expect(await screen.findByRole('button', { name: 'Procurando…' })).toBeDisabled();
  });

  it('com a atualização pronta, o botão passa a ser "Reiniciar e atualizar"; recusado por um lote, mostra por quê', async () => {
    api.update.restartAndInstall.mockResolvedValue({ ok: false, erro: criarErro('atualizacao.lote-rodando') });
    montar(<SecaoSobre />, { atualizacao: { estado: 'pronta', versao: '1.3.0' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar e atualizar' }));
    expect(await screen.findByText('Há um lote rodando')).toBeInTheDocument();
    expect(api.update.restartAndInstall).toHaveBeenCalledTimes(1);
  });

  it('erro de rede ao procurar: mostra o erro do catálogo com "Tentar de novo"', async () => {
    montar(<SecaoSobre />, {
      atualizacao: {
        estado: 'erro',
        erro: criarErro('atualizacao.falhou', { detalhes: 'ENOTFOUND' }),
        ultimaChecagemEm: null,
      },
    });
    expect(await screen.findByText('Não consegui procurar atualização', { selector: 'h2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(api.update.check).toHaveBeenCalled();
  });

  it('pacote de suporte: gera, conta os arquivos e oferece "Mostrar na pasta"', async () => {
    api.app.createSupportBundle.mockResolvedValue({
      ok: true,
      caminho: 'C:\\Users\\x\\Desktop\\soulcrate-suporte.zip',
      arquivos: ['versoes.txt', 'LEIA-ME.txt', 'logs-do-app/main.log'],
      bytes: 2048,
    });
    montar(<SecaoSobre />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar pacote de suporte' }));
    const pronto = await screen.findByTestId('pacote-pronto');
    expect(pronto).toHaveTextContent('3 arquivos · 2,0 KB. Senhas e chaves foram removidas.');
    fireEvent.click(within(pronto).getByRole('button', { name: 'Mostrar na pasta' }));
    expect(api.app.revealSupportBundle).toHaveBeenCalled();
    expect(screen.getByTestId('cartao-suporte')).toHaveTextContent(
      'Senhas e chaves são removidas antes de gerar o arquivo',
    );
  });

  it('cancelar o "Salvar como" não mostra erro nem sucesso', async () => {
    api.app.createSupportBundle.mockResolvedValue({ ok: false, cancelado: true });
    montar(<SecaoSobre />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar pacote de suporte' }));
    await waitFor(() => expect(api.app.createSupportBundle).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gerar pacote de suporte' })).toBeEnabled());
    expect(screen.queryByTestId('pacote-pronto')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha ao gerar vira o erro do catálogo, e "Tentar de novo" gera de novo', async () => {
    api.app.createSupportBundle.mockResolvedValue({
      ok: false,
      cancelado: false,
      erro: criarErro('suporte.nao-gerou', { detalhes: 'EACCES' }),
    });
    montar(<SecaoSobre />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar pacote de suporte' }));
    expect(await screen.findByText('Não consegui gerar o pacote de suporte', { selector: 'h2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(api.app.createSupportBundle).toHaveBeenCalledTimes(2));
  });

  it('créditos e licença: os projetos com link, as licenças que o instalador traz e o texto da licença', async () => {
    api.app.getCredits.mockResolvedValue({
      licenca: 'MIT License\n\nCopyright (c) 2026 BeLencastre',
      creditos: [{ nome: 'slskd', url: 'https://github.com/slskd/slskd', papel: 'Cliente Soulseek' }],
      arquivosDeLicencas: [{ id: 'chromium', nome: 'Licenças do Chromium e de bibliotecas embutidas' }],
    });
    montar(<SecaoSobre />);
    fireEvent.click(await screen.findByRole('button', { name: 'Créditos e licença' }));
    const dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByText('Cliente Soulseek')).toBeInTheDocument();
    expect(within(dialogo).getByText(/MIT License/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('link', { name: 'slskd' }));
    expect(api.app.openExternal).toHaveBeenCalledWith('https://github.com/slskd/slskd');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Licenças do Chromium e de bibliotecas embutidas' }));
    expect(api.app.openLicenseFile).toHaveBeenCalledWith('chromium');
  });

  it('arquivos da stack: o app cuida da pasta, ou diz que não cuida (pasta de um clone do Git)', async () => {
    montar(<SecaoSobre />, { arquivos: ARQUIVOS_EM_DIA });
    expect(await screen.findByTestId('arquivos-da-stack')).toHaveTextContent(
      'O app cuida dos arquivos da stack desta pasta (stack 1.0.0)',
    );
    cleanup();
    montar(<SecaoSobre />, { arquivos: { ...ARQUIVOS_EM_DIA, gerenciada: false, motivoSemGestao: 'pasta-existente' } });
    expect(await screen.findByTestId('arquivos-da-stack')).toHaveTextContent('quem a atualiza é quem a criou');
  });

  it('arquivos da stack pendentes: "Atualizar agora"; com um lote rodando espera, sem botão', async () => {
    api.stackFiles.apply.mockResolvedValue({ ok: true, resultado: null, esperando: false });
    montar(<SecaoSobre />, { arquivos: { ...ARQUIVOS_EM_DIA, pendente: true, arquivosPendentes: 3 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar agora' }));
    expect(api.stackFiles.apply).toHaveBeenCalled();
    cleanup();
    montar(<SecaoSobre />, { arquivos: { ...ARQUIVOS_EM_DIA, pendente: true, esperando: true, arquivosPendentes: 3 } });
    expect(await screen.findByRole('button', { name: 'Atualizar agora' })).toBeDisabled();
    expect(screen.getByTestId('arquivos-da-stack')).toHaveTextContent('lote em andamento terminar');
  });
});

// ---------------------------------------------------------------- avisos do Início

describe('avisos de atualização no Início', () => {
  it('atualização baixando: só uma linha de progresso; pronta: o cartão com "Reiniciar e atualizar"', () => {
    montar(<AvisoDeAtualizacaoDoApp />, { atualizacao: { estado: 'baixando', versao: '1.3.0', percentual: 10 } });
    expect(screen.getByTestId('atualizacao-baixando')).toHaveTextContent('Baixando a versão 1.3.0… 10%');
    cleanup();
    montar(<AvisoDeAtualizacaoDoApp />, { atualizacao: { estado: 'pronta', versao: '1.3.0' } });
    expect(screen.getByRole('heading', { name: 'A versão 1.3.0 está pronta' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e atualizar' }));
    expect(api.update.restartAndInstall).toHaveBeenCalled();
  });

  it('nada a mostrar sem atualização, e "Mais tarde" esconde o aviso', () => {
    montar(<AvisoDeAtualizacaoDoApp />, { atualizacao: { estado: 'atualizado', ultimaChecagemEm: 1 } });
    expect(screen.queryByTestId('aviso-atualizacao')).toBeNull();
    cleanup();
    montar(<AvisoDeAtualizacaoDoApp />, { atualizacao: { estado: 'pronta', versao: '1.3.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mais tarde' }));
    expect(screen.queryByTestId('aviso-atualizacao')).toBeNull();
  });

  it('com um lote rodando o botão fica desligado e o texto explica que a atualização espera', () => {
    useExecucao.setState({ runId: '20261008-120000', estado: { ...estadoInicialLote(), fase: 'rodando' } });
    montar(<AvisoDeAtualizacaoDoApp />, { atualizacao: { estado: 'pronta', versao: '1.3.0' } });
    expect(screen.getByRole('button', { name: 'Reiniciar e atualizar' })).toBeDisabled();
    expect(screen.getByTestId('aviso-atualizacao')).toHaveTextContent('espera ele terminar');
  });

  it('arquivos da stack atualizados: o que mudou, os .novo e "Reconstruir a stack" (que também dispensa o aviso)', async () => {
    const parado = status();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(chaveStatus, {
      ...parado,
      docker: { ...parado.docker, engine: true, instalacao: 'ok', desktop: 'aberto' },
      configuracao: { estado: 'valida', erros: 0, avisos: 0, achados: [] },
    });
    qc.setQueryData(chaveArquivosDaStack, {
      ...ARQUIVOS_EM_DIA,
      aviso: {
        aplicadoEm: 1,
        versaoAnterior: '1.0.0',
        versaoNova: '1.1.0',
        atualizados: ['baixar-lista.ps1', 'soulbeet/Dockerfile'],
        copiados: [],
        mantidos: ['soulbeet/config/config.yaml'],
        precisaReconstruir: true,
        dispensado: false,
      },
    });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AvisoDosArquivosDaStack />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const aviso = await screen.findByTestId('aviso-arquivos-da-stack');
    expect(aviso).toHaveTextContent('passou da stack 1.0.0 para a 1.1.0');
    expect(aviso).toHaveTextContent('1 arquivo que você editou foi mantido');
    expect(aviso).toHaveTextContent('soulbeet/config/config.yaml.novo');
    expect(aviso).toHaveTextContent('reconstrua a stack');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Reconstruir a stack' }));
    expect(api.stack.up).toHaveBeenCalledWith({ rebuild: true });
    expect(api.stackFiles.dismissNotice).toHaveBeenCalled();
  });

  it('um aviso sem nada a reconstruir só pede para dispensar', async () => {
    montar(<AvisoDosArquivosDaStack />, {
      arquivos: {
        ...ARQUIVOS_EM_DIA,
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
      },
    });
    const aviso = await screen.findByTestId('aviso-arquivos-da-stack');
    expect(within(aviso).queryByRole('button', { name: 'Reconstruir a stack' })).toBeNull();
    fireEvent.click(within(aviso).getByRole('button', { name: 'Dispensar' }));
    expect(api.stackFiles.dismissNotice).toHaveBeenCalled();
  });

  it('atualização dos arquivos esperando um lote terminar aparece como uma linha de status', async () => {
    montar(<AvisoDosArquivosDaStack />, {
      arquivos: { ...ARQUIVOS_EM_DIA, pendente: true, esperando: true, arquivosPendentes: 2 },
    });
    expect(await screen.findByTestId('arquivos-da-stack-esperando')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- abrir as Web UIs

describe('Início: abrir as Web UIs segue a preferência', () => {
  function inicioNoAr() {
    const base = status();
    const noAr: StackStatus = {
      ...base,
      docker: { ...base.docker, engine: true, desktop: 'aberto', versaoServidor: '29', compose: '5' },
      configuracao: { estado: 'valida', erros: 0, avisos: 0, achados: [] },
      servicos: base.servicos.map((s) => ({
        ...s,
        container: 'running',
        saude: 'healthy',
        http: true,
        statusTexto: 'Up',
      })),
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(chaveStatus, noAr);
    qc.setQueryData(chaveSettings, SETTINGS);
    return qc;
  }

  it('por padrão: "Abrir no app" no botão principal e o ícone abre no navegador', () => {
    const qc = inicioNoAr();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Inicio />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no app: Soulbeet' }));
    expect(api.stack.openService).toHaveBeenLastCalledWith('soulbeet', 'preferencia');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no navegador: Soulbeet' }));
    expect(api.stack.openService).toHaveBeenLastCalledWith('soulbeet', 'browser');
  });

  it('com "No navegador" nas preferências, o principal abre no navegador e o ícone oferece o app', () => {
    const qc = inicioNoAr();
    qc.setQueryData(chaveSettings, { ...SETTINGS, abrirWebUi: 'navegador' });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Inicio />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no navegador: slskd' }));
    expect(api.stack.openService).toHaveBeenLastCalledWith('slskd', 'preferencia');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir no app: slskd' }));
    expect(api.stack.openService).toHaveBeenLastCalledWith('slskd', 'app');
  });
});

// ---------------------------------------------------------------- rede de segurança

describe('uma tela que quebra', () => {
  it('cai sozinha: mostra "Copiar detalhes" e "Abrir log", e o resto da janela continua', async () => {
    const consoleErro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Quebrada(): never {
      throw new Error('boom de teste');
    }
    const roteador = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <div>
              <nav aria-label="barra">continua de pé</nav>
            </div>
          ),
        },
        { path: '/quebra', element: <Quebrada />, errorElement: <TelaQuebrou /> },
      ],
      { initialEntries: ['/quebra'] },
    );
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Esta tela travou')).toBeInTheDocument();
    expect(screen.getByText(/nada foi perdido/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar detalhes' }));
    expect(api.app.copyText).toHaveBeenCalledWith(expect.stringContaining('boom de teste'));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir log' }));
    expect(api.app.openLogsFolder).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Início' }));
    expect(await screen.findByLabelText('barra')).toBeInTheDocument();
    consoleErro.mockRestore();
  });
});
