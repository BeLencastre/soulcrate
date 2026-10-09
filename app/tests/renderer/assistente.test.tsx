// @vitest-environment jsdom
// O assistente e a tela Configurações renderizados de verdade (React + Testing Library), com o `window.soulcrate`
// simulado. O que mais importa aqui: Avançar nunca fica mudo, senhas não voltam para a tela e a gravação manda o que
// o usuário digitou uma vez só.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setupInicial,
  type AchadoEntrada,
  type ConfigEntrada,
  type ConfigPublica,
  type EstadoCampo,
  type InspecaoPasta,
  type ResultadoValidacao,
  type VariavelEnv,
} from '../../src/shared/configuracao';
import { statusInicial, type StackStatus } from '../../src/shared/stack';

const api = vi.hoisted(() => ({
  setup: {
    prepareFolder: vi.fn(),
    defaultFolder: vi.fn(),
    start: vi.fn(),
    status: vi.fn(),
    retry: vi.fn(),
    provideNavidromeLogin: vi.fn(),
    checkPort: vi.fn(),
  },
  config: { validate: vi.fn(), write: vi.fn(), read: vi.fn(), pickFolder: vi.fn(), check: vi.fn() },
  project: { pickFolder: vi.fn(), openFolder: vi.fn(), openFile: vi.fn() },
  app: {
    copyText: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    openExternal: vi.fn(),
    openLogsFolder: vi.fn(),
  },
  stack: { status: vi.fn() },
  env: { check: vi.fn(), startDockerDesktop: vi.fn() },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

const { Assistente } = await import('../../src/renderer/paginas/Assistente');
const { Configuracoes } = await import('../../src/renderer/paginas/Configuracoes');
const { chaveStatus, useUi } = await import('../../src/renderer/lib/estado');

// ---------------------------------------------------------------- fábricas

const CAMPOS: VariavelEnv[] = [
  'PUID',
  'PGID',
  'TZ',
  'DOWNLOADS_DIR',
  'INCOMPLETE_DIR',
  'MUSIC_DIR',
  'SLSK_USERNAME',
  'SLSK_PASSWORD',
  'SLSKD_WEB_USER',
  'SLSKD_WEB_PASSWORD',
  'SOULBEET_SECRET_KEY',
  'SLSKD_API_KEY_SOULBEET',
];

function configPublica(parcial: Partial<ConfigPublica> = {}, estadoDosCampos: EstadoCampo = 'vazio'): ConfigPublica {
  return {
    dir: 'C:\\Soulcrate',
    envExiste: false,
    ymlExiste: false,
    pastas: { music: '', downloads: '', incomplete: '' },
    slskUsuario: '',
    webUsuario: '',
    tz: '',
    puid: '',
    pgid: '',
    musicbrainzContato: '',
    abrirParaRede: false,
    campos: Object.fromEntries(CAMPOS.map((c) => [c, estadoDosCampos])) as Record<VariavelEnv, EstadoCampo>,
    chaveSlskd: 'ausente',
    sugestoes: {
      tz: 'America/Sao_Paulo',
      pastas: {
        music: 'C:/Soulcrate/music',
        downloads: 'C:/Soulcrate/downloads',
        incomplete: 'C:/Soulcrate/incomplete',
      },
    },
    ...parcial,
  };
}

/** Uma configuração completa e boa, como a de uma instalação que já funciona. */
function configBoa(): ConfigPublica {
  return configPublica(
    {
      envExiste: true,
      ymlExiste: true,
      pastas: { music: './music', downloads: './downloads', incomplete: './incomplete' },
      slskUsuario: 'dj_teste',
      webUsuario: 'admin',
      tz: 'America/Sao_Paulo',
      puid: '1000',
      pgid: '1000',
      chaveSlskd: 'ok',
    },
    'ok',
  );
}

const inspecao = (gravar: string, parcial: Partial<InspecaoPasta> = {}): InspecaoPasta => ({
  entrada: gravar,
  gravar,
  absoluto: gravar,
  estado: 'sera-criada',
  disco: 'C:',
  livreBytes: 400 * 1024 ** 3,
  onedrive: false,
  rede: false,
  sugestao: null,
  ...parcial,
});

/** O que o main responderia, em miniatura: só as regras que os testes exercitam. */
function validarFalso(config: ConfigPublica): (e: ConfigEntrada) => ResultadoValidacao {
  return (e) => {
    const achados: AchadoEntrada[] = [];
    if (!e.slskUsuario.trim())
      achados.push({
        id: 'SLSK_USUARIO_VAZIO',
        nivel: 'erro',
        campo: 'slskUsuario',
        mensagem: 'Informe o seu usuário do Soulseek.',
      });
    if (!e.slskSenha && config.campos.SLSK_PASSWORD !== 'ok')
      achados.push({ id: 'SLSK_SENHA_VAZIA', nivel: 'erro', campo: 'slskSenha', mensagem: 'Informe a senha.' });
    if (e.pastas.incomplete.includes('OneDrive'))
      achados.push({
        id: 'PASTA_ONEDRIVE',
        nivel: 'aviso',
        campo: 'pasta.incomplete',
        mensagem: 'Esta pasta está no OneDrive.',
      });
    return {
      achados,
      pastas: {
        music: inspecao(e.pastas.music),
        downloads: inspecao(e.pastas.downloads),
        incomplete: inspecao(
          e.pastas.incomplete,
          e.pastas.incomplete.includes('OneDrive') ? { onedrive: true, sugestao: 'C:/Soulcrate/incomplete' } : {},
        ),
      },
      mesmoDisco: true,
      ok: !achados.some((a) => a.nivel === 'erro'),
    };
  };
}

const statusComPasta = (dir: string | null): StackStatus => ({
  ...statusInicial(),
  atualizadoEm: 1,
  projeto: { dir, origem: dir ? 'configurada' : null },
});

function renderizar(ui: React.ReactElement, status = statusComPasta(null), rota = '/assistente') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, status);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/assistente" element={ui} />
          <Route path="/configuracoes" element={ui} />
          <Route path="/" element={<p>Início</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let config: ConfigPublica;
beforeEach(() => {
  for (const grupo of Object.values(api))
    for (const f of Object.values(grupo)) (f as ReturnType<typeof vi.fn>).mockReset();
  config = configPublica();
  api.setup.defaultFolder.mockResolvedValue('C:\\Users\\dj\\Soulcrate');
  api.setup.prepareFolder.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      erro: null,
      falha: null,
      dir: 'C:\\Soulcrate',
      copiados: 19,
      jaExistia: false,
      config,
    }),
  );
  api.config.validate.mockImplementation((e: ConfigEntrada) => Promise.resolve(validarFalso(config)(e)));
  api.config.write.mockResolvedValue({
    ok: true,
    backups: [],
    pastasCriadas: [],
    chavesGeradas: { soulbeet: true, slskd: true },
    conferencia: null,
    erro: null,
  });
  api.setup.start.mockResolvedValue({ ...setupInicial(), rodando: true });
  api.app.copyText.mockResolvedValue(undefined);
  api.app.getSettings.mockResolvedValue({
    minimizarParaBandeja: true,
    avisoBandejaDispensado: true,
    pastaDoProjeto: null,
  });
  api.setup.checkPort.mockResolvedValue({ porta: 2234, estado: 'escutando', stackNoAr: true });
  useUi.setState({ setup: null, operacao: null });
});
afterEach(cleanup);

const avancar = () => fireEvent.click(screen.getByTestId('avancar'));
const titulo = () => screen.getByRole('heading', { level: 1 }).textContent;
const digitar = (rotulo: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

async function irParaPasso(n: number, preencher = true) {
  // a pasta padrão chega de forma assíncrona
  await waitFor(() => expect((screen.getByTestId('campo-pasta') as HTMLInputElement).value).not.toBe(''));
  avancar();
  await waitFor(() => expect(titulo()).toBe('Pastas das músicas'));
  if (n === 2) return;
  avancar();
  await waitFor(() => expect(titulo()).toBe('Sua conta no Soulseek'));
  if (n === 3) return;
  if (preencher) {
    digitar('Usuário', 'dj_teste');
    digitar('Senha', 'senha-slsk-123');
  }
  avancar();
  await waitFor(() => expect(titulo()).toBe('Acesso à interface do slskd'));
  if (n === 4) return;
  if (preencher) digitar('Senha', 'senha-web-456');
  avancar();
  await waitFor(() => expect(titulo()).toBe('Chaves'));
  if (n === 5) return;
  avancar();
  await waitFor(() => expect(titulo()).toBe('Ajustes finos'));
  if (n === 6) return;
  avancar();
  await waitFor(() => expect(titulo()).toBe('Revisar e gravar'));
}

// ---------------------------------------------------------------- Assistente

describe('Assistente: passo 1 (pasta)', () => {
  it('sem pasta no app, propõe a pasta padrão como "nova" e prepara a pasta ao avançar', async () => {
    renderizar(<Assistente />);
    await waitFor(() => expect(screen.getByTestId('campo-pasta')).toHaveProperty('value', 'C:\\Users\\dj\\Soulcrate'));
    expect(screen.getByRole('radio', { name: /Criar uma pasta nova/ })).toHaveProperty('checked', true);

    avancar();
    await waitFor(() => expect(titulo()).toBe('Pastas das músicas'));
    expect(api.setup.prepareFolder).toHaveBeenCalledWith({ modo: 'nova', caminho: 'C:\\Users\\dj\\Soulcrate' });
    expect(api.setup.prepareFolder).toHaveBeenCalledTimes(1);
  });

  it('com uma pasta já em uso, começa em "usar uma pasta que já existe"', () => {
    renderizar(<Assistente />, statusComPasta('D:\\Meu Soulcrate'));
    expect(screen.getByRole('radio', { name: /Usar uma pasta do Soulcrate que já existe/ })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByTestId('campo-pasta')).toHaveProperty('value', 'D:\\Meu Soulcrate');
  });

  it('pasta recusada: mostra o motivo e não avança', async () => {
    api.setup.prepareFolder.mockResolvedValue({
      ok: false,
      erro: 'Essa pasta não tem o docker-compose.yml do Soulcrate. Escolha a pasta que tem.',
      falha: null,
      dir: null,
      copiados: 0,
      jaExistia: false,
      config: null,
    });
    renderizar(<Assistente />, statusComPasta('D:\\Vazia'));
    avancar();
    expect(await screen.findByText(/não tem o docker-compose.yml/)).toBeTruthy();
    expect(titulo()).toBe('Onde fica o Soulcrate?');
  });

  it('pasta de um clone do Git com alterações locais na stack: avisa e espera; o Avançar seguinte continua', async () => {
    api.setup.prepareFolder.mockResolvedValue({
      ok: true,
      erro: null,
      falha: null,
      dir: 'D:\\clone',
      copiados: 0,
      jaExistia: true,
      config: configBoa(),
      migracao: { clone: true, alteracoesLocais: ['docker-compose.yml'], diferentesDoApp: [], gitIndisponivel: false },
    });
    renderizar(<Assistente />, statusComPasta('D:\\clone'));
    avancar();
    const aviso = await screen.findByTestId('aviso-migracao');
    expect(aviso.textContent).toContain('alterações locais nos arquivos da stack');
    expect(aviso.textContent).toContain('docker-compose.yml');
    expect(aviso.textContent).toContain('O app não altera esta pasta');
    expect(titulo()).toBe('Onde fica o Soulcrate?');

    avancar();
    await waitFor(() => expect(titulo()).toBe('Pastas das músicas'));
    // o aviso não prepara a pasta de novo
    expect(api.setup.prepareFolder).toHaveBeenCalledTimes(1);
  });

  it('um clone sem alterações locais (ou uma pasta que não é clone) segue direto, sem aviso', async () => {
    api.setup.prepareFolder.mockResolvedValue({
      ok: true,
      erro: null,
      falha: null,
      dir: 'D:\\clone',
      copiados: 0,
      jaExistia: true,
      config: configBoa(),
      migracao: { clone: true, alteracoesLocais: [], diferentesDoApp: ['baixar-lista.ps1'], gitIndisponivel: false },
    });
    renderizar(<Assistente />, statusComPasta('D:\\clone'));
    avancar();
    await waitFor(() => expect(titulo()).toBe('Pastas das músicas'));
    expect(screen.queryByTestId('aviso-migracao')).toBeNull();
  });

  it('sem o git instalado, o aviso usa a comparação com os arquivos do app e diz que é aproximada', async () => {
    api.setup.prepareFolder.mockResolvedValue({
      ok: true,
      erro: null,
      falha: null,
      dir: 'D:\\clone',
      copiados: 0,
      jaExistia: true,
      config: configBoa(),
      migracao: { clone: true, alteracoesLocais: [], diferentesDoApp: ['subir.bat'], gitIndisponivel: true },
    });
    renderizar(<Assistente />, statusComPasta('D:\\clone'));
    avancar();
    const aviso = await screen.findByTestId('aviso-migracao');
    expect(aviso.textContent).toContain('subir.bat');
    expect(aviso.textContent).toContain('pode ser só uma versão diferente');
    expect(aviso.textContent).toContain('Não consegui consultar o git');
  });

  it('o passo 2 só abre depois do 1 (a navegação lateral não pula)', () => {
    renderizar(<Assistente />);
    const passos = within(screen.getByRole('navigation', { name: 'Passos' })).getAllByRole('button');
    expect(passos.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true, true, true, true, true, true]);
  });

  it('voltar ao passo 1 e avançar de novo com a mesma pasta não prepara outra vez nem perde o que foi digitado', async () => {
    renderizar(<Assistente />);
    await irParaPasso(3);
    digitar('Usuário', 'dj_guardado');
    fireEvent.click(screen.getByRole('button', { name: 'Pasta do Soulcrate' }));
    expect(titulo()).toBe('Onde fica o Soulcrate?');
    avancar();
    await waitFor(() => expect(titulo()).toBe('Pastas das músicas'));
    expect(api.setup.prepareFolder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Conta Soulseek' }));
    expect(screen.getByLabelText('Usuário')).toHaveProperty('value', 'dj_guardado');
  });
});

describe('Assistente: validação passo a passo', () => {
  it('Avançar sem preencher não fica mudo: mostra o que falta e continua no passo', async () => {
    renderizar(<Assistente />);
    await irParaPasso(3);
    expect(screen.queryByText('Informe o seu usuário do Soulseek.')).toBeNull(); // ainda não tentou
    avancar();
    expect(await screen.findByText('Informe o seu usuário do Soulseek.')).toBeTruthy();
    expect(screen.getByText('Informe a senha.')).toBeTruthy();
    expect(titulo()).toBe('Sua conta no Soulseek');
    expect(screen.getByLabelText('Usuário').getAttribute('aria-invalid')).toBe('true');
  });

  it('numa pasta com .env de exemplo, o que falta aparece de cara', async () => {
    config = configPublica({ envExiste: true }, 'exemplo');
    renderizar(<Assistente />);
    await irParaPasso(3);
    expect(await screen.findByText('Informe o seu usuário do Soulseek.')).toBeTruthy();
    expect(screen.getByText('Informe a senha.')).toBeTruthy();
  });

  it('com a senha já configurada, o campo vira um cartão e deixá-la em branco vale', async () => {
    config = configBoa();
    renderizar(<Assistente />);
    await irParaPasso(3, false);
    expect(screen.getByText('Configurada')).toBeTruthy();
    expect(screen.queryByLabelText('Senha')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Senha já configurada. Deixe em branco para manter.')).toBeTruthy();
    // o usuário já vem preenchido e dá para avançar sem digitar senha nova
    avancar();
    await waitFor(() => expect(titulo()).toBe('Acesso à interface do slskd'));
  });

  it('pasta no OneDrive: aviso com a sugestão de um clique, sem bloquear', async () => {
    renderizar(<Assistente />);
    await irParaPasso(2);
    const campo = screen.getByRole('textbox', { name: 'Incompletos' });
    fireEvent.change(campo, { target: { value: 'C:/Users/dj/OneDrive/incomplete' } });
    expect(await screen.findByText('Esta pasta está no OneDrive')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Usar C:\\Soulcrate\\incomplete/ }));
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('C:/Soulcrate/incomplete'));
    avancar();
    await waitFor(() => expect(titulo()).toBe('Sua conta no Soulseek'));
  });

  it('"Escolher…" da biblioteca leva junto as pastas que ficavam ao lado dela', async () => {
    api.config.pickFolder.mockResolvedValue('D:\\Musica\\Soulcrate\\music');
    renderizar(<Assistente />);
    await irParaPasso(2);
    fireEvent.click(screen.getByRole('button', { name: /Escolher… Biblioteca/ }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Biblioteca' })).toHaveProperty(
        'value',
        'D:\\Musica\\Soulcrate\\music',
      ),
    );
    expect(screen.getByRole('textbox', { name: 'Downloads' })).toHaveProperty('value', 'D:/Musica/Soulcrate/downloads');
    expect(screen.getByRole('textbox', { name: 'Incompletos' })).toHaveProperty(
      'value',
      'D:/Musica/Soulcrate/incomplete',
    );
    expect(api.config.pickFolder).toHaveBeenCalledWith('music', 'C:/Soulcrate/music');
  });
});

describe('Assistente: senhas, chaves e revisão', () => {
  it('gerar senha mostra a senha uma vez, com a dica para copiar, e copiar usa a área de transferência', async () => {
    renderizar(<Assistente />);
    await irParaPasso(4);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar senha' }));
    const senha = (screen.getByLabelText('Senha') as HTMLInputElement).value;
    expect(senha).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(screen.getByLabelText('Senha').getAttribute('type')).toBe('text');
    expect(screen.getByText(/Anote ou copie esta senha agora/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar senha' }));
    expect(api.app.copyText).toHaveBeenCalledWith(senha);
    expect(await screen.findByRole('button', { name: 'Copiada' })).toBeTruthy();
  });

  it('cada clique em "Gerar senha" dá uma senha diferente', async () => {
    renderizar(<Assistente />);
    await irParaPasso(4);
    const botao = screen.getByRole('button', { name: 'Gerar senha' });
    fireEvent.click(botao);
    const a = (screen.getByLabelText('Senha') as HTMLInputElement).value;
    fireEvent.click(botao);
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).not.toBe(a);
  });

  it('chaves: numa instalação nova "Será gerada"; já existentes "Mantida" com a opção de trocar', async () => {
    renderizar(<Assistente />);
    await irParaPasso(5);
    expect(screen.getAllByText('Será gerada')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Gerar novas chaves' })).toBeNull();
    cleanup();

    config = configBoa();
    renderizar(<Assistente />);
    await irParaPasso(5, false);
    expect(screen.getAllByText('Mantida')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar novas chaves' }));
    expect(screen.getAllByText('Será trocada')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Manter as chaves atuais' }));
    expect(screen.getAllByText('Mantida')).toHaveLength(2);
  });

  it('a revisão não mostra senha nem chave', async () => {
    renderizar(<Assistente />);
    await irParaPasso(7);
    const revisao = screen.getByTestId('revisao');
    expect(revisao.textContent).toContain('dj_teste · senha configurada');
    expect(revisao.textContent).toContain('admin · senha configurada');
    expect(document.body.textContent).not.toContain('senha-slsk-123');
    expect(document.body.textContent).not.toContain('senha-web-456');
  });

  it('numa pasta com arquivos, a revisão avisa do backup com a data', async () => {
    config = configBoa();
    renderizar(<Assistente />);
    await irParaPasso(7, false);
    expect(screen.getByTestId('backup').textContent).toMatch(
      /\.env\.bak-\d{4}-\d{2}-\d{2} · slskd\.yml\.bak-\d{4}-\d{2}-\d{2}/,
    );
    expect(screen.getByText('O .env e o slskd.yml já existem: o app faz um backup antes de gravar.')).toBeTruthy();
  });
});

describe('Assistente: gravar e ligar', () => {
  it('manda o que foi digitado uma vez, liga a stack e mostra a tela final', async () => {
    renderizar(<Assistente />);
    await irParaPasso(7);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar e ligar a stack' }));
    await waitFor(() => expect(screen.getByTestId('tela-fim')).toBeTruthy());

    expect(api.config.write).toHaveBeenCalledTimes(1);
    const enviado = api.config.write.mock.calls[0]?.[0] as ConfigEntrada;
    expect(enviado).toMatchObject({
      slskUsuario: 'dj_teste',
      slskSenha: 'senha-slsk-123',
      webUsuario: 'admin',
      webSenha: 'senha-web-456',
      regenerarChaves: false,
      tz: 'America/Sao_Paulo',
      puid: '1000',
      pgid: '1000',
    });
    expect(api.setup.start).toHaveBeenCalledWith({ modo: 'ligar', detalheGravacao: null });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Configuração gravada. Ligando a stack.');
  });

  it('o backup entra no detalhe da primeira tarefa', async () => {
    api.config.write.mockResolvedValue({
      ok: true,
      backups: ['.env.bak-2026-10-07', 'slskd.yml.bak-2026-10-07'],
      pastasCriadas: [],
      chavesGeradas: { soulbeet: false, slskd: false },
      conferencia: null,
      erro: null,
    });
    config = configBoa();
    renderizar(<Assistente />);
    await irParaPasso(7, false);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar e ligar a stack' }));
    await waitFor(() => expect(api.setup.start).toHaveBeenCalled());
    expect(api.setup.start).toHaveBeenCalledWith({
      modo: 'ligar',
      detalheGravacao: 'backup .env.bak-2026-10-07 · slskd.yml.bak-2026-10-07',
    });
  });

  it('falha ao gravar: mostra o erro com "Tentar de novo" e não liga a stack', async () => {
    api.config.write.mockResolvedValue({
      ok: false,
      backups: [],
      pastasCriadas: [],
      chavesGeradas: { soulbeet: false, slskd: false },
      conferencia: null,
      erro: {
        codigo: 'config.yml-invalido',
        titulo: 'O slskd.yml tem um erro de sintaxe',
        mensagem: 'Não mexi em nenhum arquivo.',
        acoes: [{ id: 'abrirYml', rotulo: 'Abrir o slskd.yml', primaria: true }],
        detalhes: null,
      },
    });
    renderizar(<Assistente />);
    await irParaPasso(7);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar e ligar a stack' }));
    expect(await screen.findByText('O slskd.yml tem um erro de sintaxe')).toBeTruthy();
    expect(api.setup.start).not.toHaveBeenCalled();
    expect(titulo()).toBe('Revisar e gravar');
  });

  it('a tela final acompanha as tarefas e oferece o login quando o Navidrome já tem administrador', async () => {
    renderizar(<Assistente />);
    await irParaPasso(7);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar e ligar a stack' }));
    await waitFor(() => expect(screen.getByTestId('tela-fim')).toBeTruthy());

    useUi.getState().aoEvento({
      type: 'setup.state',
      estado: {
        rodando: false,
        terminou: true,
        tarefas: [
          { id: 'gravar', estado: 'feito', detalhe: null, erro: null },
          { id: 'stack', estado: 'feito', detalhe: 'primeiro build: 7 min 12 s', erro: null },
          { id: 'navidrome', estado: 'precisa-login', detalhe: null, erro: null },
          { id: 'soulbeet', estado: 'depois', detalhe: null, erro: null },
          { id: 'porta', estado: 'depois', detalhe: null, erro: null },
        ],
      },
    });
    expect(await screen.findByText('Esse Navidrome já tem um administrador')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Configuração gravada. Falta terminar um passo.',
    );
    expect(screen.getByText('primeiro build: 7 min 12 s')).toBeTruthy();

    api.setup.provideNavidromeLogin.mockResolvedValue(setupInicial());
    const continuar = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);
    digitar('Usuário do Navidrome', 'antigo');
    digitar('Senha do Navidrome', 'senha-antiga');
    fireEvent.click(continuar);
    expect(api.setup.provideNavidromeLogin).toHaveBeenCalledWith({ usuario: 'antigo', senha: 'senha-antiga' });
  });

  it('erro na stack mostra o cartão de erro com "Tentar de novo", que refaz a partir da tarefa', async () => {
    renderizar(<Assistente />);
    await irParaPasso(7);
    fireEvent.click(screen.getByRole('button', { name: 'Gravar e ligar a stack' }));
    await waitFor(() => expect(screen.getByTestId('tela-fim')).toBeTruthy());
    useUi.getState().aoEvento({
      type: 'setup.state',
      estado: {
        rodando: false,
        terminou: true,
        tarefas: [
          { id: 'gravar', estado: 'feito', detalhe: null, erro: null },
          {
            id: 'stack',
            estado: 'erro',
            detalhe: null,
            erro: {
              codigo: 'docker.fechado',
              titulo: 'O Docker Desktop está fechado',
              mensagem: 'Sem o Docker Desktop a stack não sobe.',
              acoes: [{ id: 'abrirDockerDesktop', rotulo: 'Abrir Docker Desktop', primaria: true }],
              detalhes: null,
            },
          },
          { id: 'navidrome', estado: 'depois', detalhe: null, erro: null },
          { id: 'soulbeet', estado: 'depois', detalhe: null, erro: null },
          { id: 'porta', estado: 'depois', detalhe: null, erro: null },
        ],
      },
    });
    expect(await screen.findByText('O Docker Desktop está fechado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir Docker Desktop' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------- Configurações

describe('Configurações', () => {
  beforeEach(() => {
    config = configBoa();
    api.config.read.mockImplementation(() => Promise.resolve(config));
    api.config.check.mockResolvedValue(undefined);
  });

  const noArStatus = (): StackStatus => ({
    ...comProjeto(),
    servicos: comProjeto().servicos.map((s) => ({
      ...s,
      container: 'running',
      saude: 'healthy',
      http: true,
      statusTexto: 'Up',
    })),
  });

  const comProjeto = (): StackStatus => ({
    ...statusComPasta('C:\\Soulcrate'),
    configuracao: { estado: 'valida', erros: 0, avisos: 0, achados: [] },
  });

  it('sem pasta do Soulcrate, oferece o assistente', () => {
    renderizar(<Configuracoes />, statusComPasta(null), '/configuracoes');
    expect(screen.getByRole('heading', { name: 'Ainda não há uma pasta do Soulcrate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir o assistente de configuração' })).toBeTruthy();
  });

  it('mostra as pastas e só aparece o banner quando algo muda; Descartar volta ao que estava', async () => {
    renderizar(<Configuracoes />, comProjeto(), '/configuracoes');
    const campo = (await screen.findByRole('textbox', { name: 'Incompletos' })) as HTMLInputElement;
    expect(campo.value).toBe('./incomplete');
    expect(screen.queryByTestId('alteracoes-pendentes')).toBeNull();

    fireEvent.change(campo, { target: { value: 'E:/Soulcrate/incomplete' } });
    const banner = await screen.findByTestId('alteracoes-pendentes');
    expect(banner.textContent).toContain('Há alterações não gravadas');
    expect(banner.textContent).toContain('Valem na próxima vez que você ligar a stack.');

    fireEvent.click(within(banner).getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByTestId('alteracoes-pendentes')).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Incompletos' }) as HTMLInputElement).value).toBe('./incomplete');
  });

  it('com a stack desligada, o botão é "Salvar" e grava sem reiniciar nada', async () => {
    renderizar(<Configuracoes />, comProjeto(), '/configuracoes');
    const campo = await screen.findByRole('textbox', { name: 'Incompletos' });
    fireEvent.change(campo, { target: { value: 'E:/Soulcrate/incomplete' } });
    const banner = await screen.findByTestId('alteracoes-pendentes');
    await waitFor(() =>
      expect((within(banner).getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(banner).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.config.write).toHaveBeenCalledTimes(1));
    expect((api.config.write.mock.calls[0]?.[0] as ConfigEntrada).pastas.incomplete).toBe('E:/Soulcrate/incomplete');
    expect(api.setup.start).not.toHaveBeenCalled();
    expect(await screen.findByTestId('gravado')).toBeTruthy();
  });

  it('com a stack no ar, o botão é "Aplicar e reiniciar" e refaz a pós-configuração em modo recriar', async () => {
    const noAr = noArStatus();
    renderizar(<Configuracoes />, noAr, '/configuracoes');
    const campo = await screen.findByRole('textbox', { name: 'Incompletos' });
    fireEvent.change(campo, { target: { value: 'E:/Soulcrate/incomplete' } });
    const banner = await screen.findByTestId('alteracoes-pendentes');
    expect(banner.textContent).toContain('Valem depois de reiniciar a stack.');
    await waitFor(() =>
      expect((within(banner).getByRole('button', { name: 'Aplicar e reiniciar' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(within(banner).getByRole('button', { name: 'Aplicar e reiniciar' }));
    await waitFor(() => expect(api.setup.start).toHaveBeenCalledWith({ modo: 'recriar', detalheGravacao: null }));
    expect(await screen.findByTestId('painel-aplicar')).toBeTruthy();
  });

  it('com erro no formulário, o banner pede para corrigir e não deixa gravar', async () => {
    renderizar(<Configuracoes />, comProjeto(), '/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Conta Soulseek' }));
    const usuario = await screen.findByRole('textbox', { name: 'Usuário' });
    fireEvent.change(usuario, { target: { value: '' } });
    const banner = await screen.findByTestId('alteracoes-pendentes');
    await waitFor(() => expect(banner.textContent).toContain('Corrija os campos marcados antes de gravar.'));
    expect((within(banner).getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('senhas nunca aparecem: só o cartão "Configurada" e "Trocar senha"', async () => {
    renderizar(<Configuracoes />, comProjeto(), '/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Conta Soulseek' }));
    expect(await screen.findByText('Configurada')).toBeTruthy();
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect((document.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
  });

  it('a chave só pode ser trocada com a stack no ar (o Soulbeet precisa receber a nova)', async () => {
    renderizar(<Configuracoes />, comProjeto(), '/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Web UI do slskd' }));
    expect((await screen.findByRole('button', { name: 'Gerar nova chave' })) as HTMLButtonElement).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText(/Ligue a stack para trocar a chave/)).toBeTruthy();
  });

  it('a chave do slskd: "Iguais" e "Gerar nova chave" marca a troca e abre o banner', async () => {
    renderizar(<Configuracoes />, noArStatus(), '/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Web UI do slskd' }));
    expect(await screen.findByText('Iguais')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar nova chave' }));
    expect(screen.getByText('Será trocada')).toBeTruthy();
    expect(await screen.findByTestId('alteracoes-pendentes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar a troca' }));
    await waitFor(() => expect(screen.queryByTestId('alteracoes-pendentes')).toBeNull());
  });

  it('a porta 2234: testar mostra o estado', async () => {
    renderizar(<Configuracoes />, comProjeto(), '/configuracoes');
    fireEvent.click(await screen.findByRole('button', { name: 'Rede' }));
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));
    expect(await screen.findByText('Escutando neste PC')).toBeTruthy();
    expect(api.setup.checkPort).toHaveBeenCalledTimes(1);
  });
});
