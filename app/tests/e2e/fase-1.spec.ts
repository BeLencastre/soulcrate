// Fase 0 e 1, ponta a ponta: o app de verdade (Electron) contra o dublê do docker.
// Cobre os critérios de aceite: Docker fechado → abrir com um clique; ligar, desligar e reconstruir refletindo o estado
// real; contêiner derrubado por fora aparecendo como erro; e a segurança de base do renderer (§6.1).
import { expect, test, type Page } from '@playwright/test';
import {
  abertosFora,
  abrirApp,
  criarAmbiente,
  TODOS_NO_AR,
  type Ambiente,
  type AppAberto,
  capturar,
} from './ajudantes';

let amb: Ambiente;
let aberto: AppAberto | null = null;

test.afterEach(async () => {
  await aberto?.app.close().catch(() => undefined);
  aberto = null;
  amb?.limpar();
});

const resumo = (janela: Page) => janela.getByTestId('resumo-stack');
const titulo = (janela: Page) => janela.getByRole('heading', { level: 1 });

test('abre com a navegação lateral e o Início', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb);
  const { janela } = aberto;

  // o título da janela acompanha a tela (Fase 6, acessibilidade)
  await expect(janela).toHaveTitle('Início · Soulcrate');
  const nav = janela.getByRole('navigation', { name: 'Principal' });
  await expect(nav.getByRole('link')).toHaveText([
    'Início',
    'Baixar lista',
    'Histórico',
    'Biblioteca',
    'Serviços',
    'Configurações',
  ]);
  await expect(titulo(janela)).toHaveText('A stack está desligada');
  await expect(resumo(janela)).toHaveText('Desligada');
  // as cinco etapas: Docker, Docker Desktop e configuração ok; stack desligada; serviços aguardando
  await expect(janela.locator('[data-etapa]')).toHaveCount(5);
  await expect(janela.locator('[data-etapa="docker"]')).toHaveAttribute('data-estado', 'ok');
  await expect(janela.locator('[data-etapa="configuracao"]')).toHaveAttribute('data-estado', 'ok');
  await expect(janela.locator('[data-etapa="stack"]')).toHaveAttribute('data-estado', 'desligada');
  await capturar(janela, '01-inicio-desligada');

  // a Biblioteca (Fase 5) lê o beets, que mora no contêiner: com a stack desligada ela explica e oferece ligar
  await nav.getByRole('link', { name: 'Biblioteca' }).click();
  await expect(janela.getByRole('heading', { name: 'A biblioteca só abre com a stack no ar' })).toBeVisible();
  await expect(janela).toHaveTitle('Biblioteca · Soulcrate');
  await capturar(janela, '02-biblioteca-stack-desligada');
});

test('Docker lento: mostra "Verificando" em vez de um alarme falso de Docker fechado (§6.4)', async () => {
  // o docker leva 6 s para responder cada comando: dá tempo de ver a tela antes da primeira sondagem, mesmo numa máquina lenta
  amb = criarAmbiente({ mundo: { atrasoMs: 6000 } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;

  // a tela já é utilizável sem esperar o Docker, e não afirma nada que ainda não mediu
  await expect(titulo(janela)).toHaveText('Verificando o ambiente');
  await expect(resumo(janela)).toHaveText('Verificando…');
  await expect(janela.locator('[data-etapa="docker"]')).toHaveAttribute('data-estado', 'aguardando');
  await expect(janela.getByRole('button', { name: 'Ligar', exact: true })).toBeDisabled();
  await capturar(janela, '00-verificando');

  await expect(titulo(janela)).toHaveText('A stack está desligada', { timeout: 40_000 });
  await expect(janela.locator('[data-etapa="docker"]')).toHaveAttribute('data-estado', 'ok');
});

test('Docker fechado: explica e abre o Docker Desktop com um clique', async () => {
  amb = criarAmbiente({ mundo: { engineProntaEm: null, desktopStatus: 'stopped', tempoEngineMs: 3000 } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;

  await expect(titulo(janela)).toHaveText('O Docker Desktop está fechado');
  await expect(resumo(janela)).toHaveText('Docker fechado');
  await capturar(janela, '03-docker-fechado');

  await janela.getByRole('button', { name: 'Abrir Docker Desktop' }).click();
  await expect(titulo(janela)).toHaveText('Abrindo o Docker Desktop');
  await expect(janela.locator('[data-etapa="desktop"]')).toContainText('Esperando a engine ficar pronta');
  await capturar(janela, '04-docker-abrindo');

  await expect(titulo(janela)).toHaveText('A stack está desligada', { timeout: 30_000 });
  expect(amb.chamadas()).toContain('desktop start --detach');
});

test('ligar, desligar e reconstruir refletem o estado real', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await expect(resumo(janela)).toHaveText('Desligada');

  await janela.getByRole('button', { name: 'Ligar', exact: true }).click();
  await expect(titulo(janela)).toHaveText('Ligando a stack');
  await expect(janela.getByText('O primeiro build leva de 5 a 10 minutos.')).toBeVisible();
  // o log ao vivo detecta os marcadores do build
  await expect(janela.locator('.st', { hasText: 'plugins ok' })).toBeVisible();
  await expect(janela.locator('.st', { hasText: 'lastgenre ok' })).toBeVisible();
  await expect(janela.getByTestId('log-da-stack')).toContainText('plugins ok');
  await capturar(janela, '05-ligando');

  await expect(resumo(janela)).toHaveText('No ar · 3/3 saudáveis', { timeout: 30_000 });
  await expect(titulo(janela)).toHaveText('Stack no ar');
  await expect(janela.locator('[data-etapa="servicos"]')).toHaveAttribute('data-estado', 'ok');
  await capturar(janela, '06-no-ar');
  expect(amb.chamadas().some((c) => c.includes('up -d --build') && !c.includes('--force-recreate'))).toBe(true);

  await janela.getByRole('button', { name: 'Desligar', exact: true }).click();
  await expect(resumo(janela)).toHaveText('Desligada', { timeout: 30_000 });
  expect(amb.chamadas().some((c) => c.endsWith('down'))).toBe(true);

  await janela.getByRole('button', { name: 'Reconstruir' }).click();
  await expect(resumo(janela)).toHaveText('No ar · 3/3 saudáveis', { timeout: 30_000 });
  expect(amb.chamadas().some((c) => c.includes('--force-recreate'))).toBe(true);
});

test('contêiner derrubado por fora aparece como erro na tela', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await expect(resumo(janela)).toHaveText('No ar · 3/3 saudáveis');

  // docker stop slskd
  amb.mudarMundo((m) => ({ containers: { ...m.containers, slskd: { estado: 'exited' } } }));
  // §5 Fase 1: "refletem o estado real em até 5 s" (um ciclo de sondagem + o tempo do compose ps)
  await expect(resumo(janela)).toHaveText('slskd parou', { timeout: 10_000 });
  await expect(titulo(janela)).toHaveText('Há serviços parados');
  await capturar(janela, '07-slskd-parou');

  // e volta ao normal quando ele sobe de novo
  amb.mudarMundo((m) => ({ containers: { ...m.containers, slskd: { estado: 'running', saude: 'healthy' } } }));
  await expect(resumo(janela)).toHaveText('No ar · 3/3 saudáveis', { timeout: 10_000 });
});

test('porta em uso: erro claro, sem pilha crua', async () => {
  amb = criarAmbiente({ mundo: { upFalha: 'porta' } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;

  await janela.getByRole('button', { name: 'Ligar', exact: true }).click();
  const erro = janela.getByRole('alert');
  await expect(erro.getByRole('heading', { name: 'A porta 5030 já está em uso' })).toBeVisible({ timeout: 20_000 });
  await expect(erro.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await expect(erro.getByRole('button', { name: 'Copiar detalhes' })).toBeVisible();
  await capturar(janela, '08-erro-porta');
});

test('configuração inválida: não liga e mostra o que falta', async () => {
  amb = criarAmbiente({ env: { SLSK_PASSWORD: 'sua_senha_soulseek', SLSKD_WEB_USER: '' } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;

  await expect(janela.locator('[data-etapa="configuracao"]')).toHaveAttribute('data-estado', 'erro');
  await janela.getByRole('button', { name: 'Ligar', exact: true }).click();
  await expect(janela.getByRole('alert').getByRole('heading', { name: 'A configuração tem problemas' })).toBeVisible();
  // nada foi iniciado
  expect(amb.chamadas().some((c) => c.includes(' up '))).toBe(false);

  await janela.getByRole('alert').getByRole('button', { name: 'Ver configurações' }).click();
  await expect(janela.locator('[data-achado="ENV_EXEMPLO"]')).toBeVisible();
  await expect(janela.locator('[data-achado="ENV_VAZIA"]')).toBeVisible();
  await janela.getByRole('button', { name: 'Pastas', exact: true }).click();
  await expect(janela.getByTestId('pasta-do-projeto')).toHaveValue(amb.projeto);
  await capturar(janela, '09-configuracoes-invalida');
});

test('sem pasta do Soulcrate: pede a pasta', async () => {
  amb = criarAmbiente({ semProjeto: true });
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await expect(titulo(janela)).toHaveText('Vamos configurar o Soulcrate');
  await expect(resumo(janela)).toHaveText('Sem pasta do Soulcrate');
  await janela.getByRole('button', { name: 'Abrir o assistente' }).first().click();
  await expect(janela.getByRole('heading', { level: 1, name: 'Onde fica o Soulcrate?' })).toBeVisible();
});

test('Serviços: verificações e logs dos contêineres', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await expect(resumo(janela)).toHaveText('No ar · 3/3 saudáveis');

  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Serviços' }).click();
  await expect(titulo(janela)).toHaveText('Tudo respondendo', { timeout: 20_000 });
  for (const id of ['containers', 'endpoints', 'plugins', 'pastas', 'importacoes']) {
    await expect(janela.locator(`[data-check="${id}"]`)).toBeVisible();
  }
  await expect(janela.locator('[data-check="plugins"]')).toContainText('beets 2.11.0');
  await expect(janela.locator('[data-check="pastas"]')).toContainText('igual no slskd e no Soulbeet');

  // logs ao vivo: o slskd é a aba inicial
  const log = janela.getByTestId('log-do-conteiner');
  await expect(log).toContainText('[INF] Iniciado');
  await expect(log).toContainText('Transfer from dare204');
  await janela.getByRole('tab', { name: 'todos' }).click();
  await expect(log).toContainText('soulbeet');
  await capturar(janela, '10-servicos');

  await janela.getByRole('tab', { name: 'navidrome' }).click();
  await janela.getByRole('button', { name: 'Reiniciar Navidrome' }).click();
  await expect.poll(() => amb.chamadas().some((c) => c.includes('restart navidrome'))).toBe(true);
});

test('Serviços com a stack desligada explica e não verifica nada', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Serviços' }).click();
  await expect(titulo(janela)).toHaveText('A stack está desligada');
  await expect(janela.locator('[data-check]')).toHaveCount(0);
});

test('Web UI integrada: serviço fora do ar mostra o erro, não uma página em branco', async () => {
  amb = criarAmbiente({ mundo: { containers: { ...TODOS_NO_AR, slskd: { estado: 'exited' } } } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Serviços' }).click();
  await janela.getByRole('link', { name: 'Abrir Web UIs' }).click();
  await janela.getByRole('tab', { name: 'slskd' }).click();
  await expect(janela.getByRole('alert').getByRole('heading', { name: 'O slskd não respondeu' })).toBeVisible();
  await expect(janela.getByTestId('url-da-web-ui')).toHaveText('http://127.0.0.1:5030');
  await capturar(janela, '11-webui-fora-do-ar');
});

test('fechar a janela vai para a bandeja, com aviso na primeira vez', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb);
  const { app, janela } = aberto;
  await expect(titulo(janela)).toBeVisible();

  const visivel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  const dialogo = janela.getByRole('dialog', { name: 'O Soulcrate continua na bandeja' });
  await expect(dialogo).toBeVisible();
  expect(await visivel()).toBe(true);
  await capturar(janela, '12-dialogo-bandeja');

  await dialogo.getByLabel('Não mostrar de novo').check();
  await dialogo.getByRole('button', { name: 'Entendi' }).click();
  await expect.poll(visivel).toBe(false);

  // da próxima vez não pergunta: só esconde
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
  await expect.poll(visivel).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await expect.poll(visivel).toBe(false);
});

test.describe('segurança do renderer (§6.1)', () => {
  test('sem Node, sem ipcRenderer cru, com CSP e navegação bloqueada', async () => {
    amb = criarAmbiente();
    aberto = await abrirApp(amb);
    const { app, janela } = aberto;
    await expect(titulo(janela)).toBeVisible();

    const mundo = await janela.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      ipcRenderer: typeof (window as unknown as { ipcRenderer?: unknown }).ipcRenderer,
      api: Object.keys(window.soulcrate).sort(),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '',
    }));
    expect(mundo.require).toBe('undefined');
    expect(mundo.process).toBe('undefined');
    expect(mundo.ipcRenderer).toBe('undefined');
    expect(mundo.api).toEqual([
      'app',
      'batch',
      'config',
      'env',
      'library',
      'lists',
      'logs',
      'onEvent',
      'project',
      'reports',
      'setup',
      'stack',
      'stackFiles',
      'update',
      'webui',
    ]);
    expect(mundo.csp).toContain("default-src 'self'");
    expect(mundo.csp).not.toContain('unsafe-eval');

    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0]?.webContents as unknown as
        { getLastWebPreferences(): Record<string, boolean> } | undefined;
      const w = wc?.getLastWebPreferences() ?? {};
      return { ctx: w.contextIsolation, sandbox: w.sandbox, node: w.nodeIntegration, web: w.webSecurity };
    });
    expect(prefs).toEqual({ ctx: true, sandbox: true, node: false, web: true });

    // navegar para fora do app e abrir janelas são bloqueados
    const antes = janela.url();
    await janela.evaluate(() => {
      window.location.href = 'https://example.com/';
    });
    await janela.waitForTimeout(500);
    expect(janela.url()).toBe(antes);
    // o endereço seguro vai para o navegador do sistema, em vez de abrir dentro do app
    expect(await abertosFora(app)).toEqual(['https://example.com/']);
    const aberta = await janela.evaluate(() => window.open('https://example.com/') === null);
    expect(aberta).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    // o IPC recusa endereços que não sejam https nem as Web UIs locais
    const recusa = await janela.evaluate(() =>
      window.soulcrate.app.openExternal('file:///C:/Windows/System32/calc.exe').then(
        () => 'abriu',
        () => 'recusou',
      ),
    );
    expect(recusa).toBe('recusou');
  });

  test('o status e a configuração nunca carregam segredos', async () => {
    amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
    aberto = await abrirApp(amb);
    const { janela } = aberto;
    await expect(resumo(janela)).toHaveText('No ar · 3/3 saudáveis');
    const tudo = await janela.evaluate(async () => {
      const [status, config, info, env] = await Promise.all([
        window.soulcrate.stack.status(),
        window.soulcrate.config.check(),
        window.soulcrate.app.getInfo(),
        window.soulcrate.env.check(),
      ]);
      return JSON.stringify({ status, config, info, env });
    });
    for (const segredo of [
      'senha-teste-123',
      'outra-senha-456',
      'abcdef0123456789abcdef0123456789',
      '0123456789abcdef0123456789abcdef',
    ]) {
      expect(tudo).not.toContain(segredo);
    }
  });
});
