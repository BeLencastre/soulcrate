// Fases 6 e 7, ponta a ponta: o app de verdade (Electron) contra o dublê do docker e o dublê do atualizador. Nada aqui toca
// em Docker, na rede, no registro do Windows nem nos dados do usuário. O que cada teste prova:
//   Fase 6: tema (escuro, claro, do sistema), preferências que valem na hora e na próxima abertura, abrir com o PC direto
//           na bandeja, abrir as Web UIs onde a preferência manda, a tela Sobre (versões lidas dos contêineres) e o
//           pacote de suporte SEM segredo nenhum;
//   Fase 7: a atualização do app (procurar, baixar, pronta, reiniciar) que nunca aplica durante um lote, e a atualização
//           dos arquivos da stack (troca o que ninguém editou, mantém o que o usuário editou, nunca toca no .env).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import {
  abertosFora,
  abrirApp,
  criarAmbiente,
  ENV_VALIDO,
  fecharApp,
  TODOS_NO_AR,
  type Ambiente,
  type AppAberto,
  capturar,
} from './ajudantes';

const APP_DIR = join(import.meta.dirname, '..', '..');
const REPO = join(APP_DIR, '..');
const VERSAO_DO_APP = (JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as { version: string }).version;

/** Dublês desta fase: o registro do Windows e o electron-updater viram variáveis que o teste lê; nenhum slskd real é chamado. */
const BASE = {
  SOULCRATE_DUBLE_INICIO_WINDOWS: '1',
  SOULCRATE_DUBLE_ATUALIZADOR: '1',
  SOULCRATE_SLSKD_URL: 'http://127.0.0.1:1',
};

let amb: Ambiente;
let aberto: AppAberto | null = null;
const filhos: ChildProcess[] = [];

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  for (const f of filhos.splice(0)) f.kill();
  amb?.limpar();
});

const irParaConfiguracoes = async (janela: Page, secao: string) => {
  await janela.getByRole('link', { name: 'Configurações' }).click();
  await janela.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: secao }).click();
  await expect(janela.getByRole('heading', { level: 2, name: secao })).toBeVisible();
};
/**
 * Marca (ou desmarca) um interruptor ou opção: clica e ESPERA o estado mudar. O `check()` do Playwright confere o estado
 * logo depois do clique, e estes controles seguem o estado guardado pelo app, que muda um instante depois do clique.
 */
const marcar = async (campo: Locator, marcado = true) => {
  await campo.click();
  if (marcado) await expect(campo).toBeChecked();
  else await expect(campo).not.toBeChecked();
};
const irParaInicio = (janela: Page) => janela.getByRole('link', { name: 'Início' }).click();
const settings = (a: Ambiente) =>
  JSON.parse(readFileSync(join(a.dados, 'settings.json'), 'utf8')) as Record<string, unknown>;
const fundo = (janela: Page) => janela.evaluate(() => getComputedStyle(document.body).backgroundColor);
const global = <T>(app: ElectronApplication, nome: string) =>
  app.evaluate((_, n) => (globalThis as unknown as Record<string, unknown>)[n] as T, nome);

// ---------------------------------------------------------------- Fase 6: tema e preferências

test('tema: escuro por padrão; Claro vale na hora e na próxima abertura; "Igual ao Windows" segue o sistema', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb, BASE);
  const { app, janela } = aberto;
  await expect(janela.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await fundo(janela)).toBe('rgb(14, 15, 17)');
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');

  await irParaConfiguracoes(janela, 'Aplicativo');
  await marcar(janela.getByRole('radio', { name: 'Claro' }));
  await expect.poll(() => fundo(janela)).toBe('rgb(246, 244, 239)');
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light');
  expect(settings(amb).tema).toBe('claro');
  await capturar(janela, 'f6-01-tema-claro');

  await marcar(janela.getByRole('radio', { name: 'Igual ao Windows' }));
  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');
  await marcar(janela.getByRole('radio', { name: 'Claro' }));

  // fecha e reabre: a janela já nasce clara (cor de fundo certa antes de a página pintar, sem piscar escuro)
  await fecharApp(app);
  aberto = await abrirApp(amb, BASE);
  await expect(aberto.janela.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await fundo(aberto.janela)).toBe('rgb(246, 244, 239)');
  expect(await aberto.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBackgroundColor())).toBe(
    '#F6F4EF',
  );
  await capturar(aberto.janela, 'f6-02-inicio-claro');
});

test('preferências: iniciar com o Windows, avisos e onde abrir valem na hora e na próxima abertura', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb, BASE);
  let { app, janela } = aberto;
  await irParaConfiguracoes(janela, 'Aplicativo');
  const iniciar = janela.getByRole('switch', { name: /Iniciar com o Windows/ });
  await expect(iniciar).toBeEnabled();
  await expect(iniciar).not.toBeChecked();

  await marcar(iniciar);
  await expect.poll(() => global<boolean>(app, '__inicioComWindows')).toBe(true);
  expect(settings(amb).iniciarComWindows).toBe(true);
  await marcar(janela.getByRole('switch', { name: /Avisar quando um lote terminar/ }), false);
  await marcar(janela.getByRole('switch', { name: /Avisar quando as buscas forem pausadas/ }), false);
  await marcar(janela.getByRole('radio', { name: 'No navegador' }));
  await expect.poll(() => settings(amb).abrirWebUi).toBe('navegador');
  expect(settings(amb)).toMatchObject({
    avisarFimDoLote: false,
    avisarBuscasPausadas: false,
    minimizarParaBandeja: true,
  });
  await capturar(janela, 'f6-03-aplicativo');

  // reabre: nada se perde, e o registro do Windows é refeito na abertura (o caminho do programa pode ter mudado)
  await fecharApp(app);
  aberto = await abrirApp(amb, BASE);
  ({ app, janela } = aberto);
  await expect.poll(() => global<boolean>(app, '__inicioComWindows')).toBe(true);
  await irParaConfiguracoes(janela, 'Aplicativo');
  await expect(janela.getByRole('switch', { name: /Iniciar com o Windows/ })).toBeChecked();
  await expect(janela.getByRole('switch', { name: /Avisar quando um lote terminar/ })).not.toBeChecked();
  await expect(janela.getByRole('radio', { name: 'No navegador' })).toBeChecked();

  await marcar(janela.getByRole('switch', { name: /Iniciar com o Windows/ }), false);
  await expect.poll(() => global<boolean>(app, '__inicioComWindows')).toBe(false);
});

test('aberto com o PC (--hidden): a janela não aparece, e chamar o app de novo a mostra', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb, BASE, ['--hidden']);
  const { app } = aberto;
  const visivel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? null);
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.isLoading() === false),
    )
    .toBe(true);
  // dá tempo de o "ready-to-show" disparar, se fosse mostrar
  await new Promise((r) => setTimeout(r, 1500));
  expect(await visivel()).toBe(false);

  // o ícone da bandeja (e abrir o app de novo) trazem a janela
  await app.evaluate(({ app: a }) => a.emit('second-instance', {}, ['Soulcrate.exe'], process.cwd()));
  await expect.poll(visivel).toBe(true);
});

test('abrir as Web UIs segue a preferência: dentro do app ou no navegador (e o outro destino sempre à mão)', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  const { app, janela } = aberto;
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');

  // padrão: o botão principal abre dentro do app
  await janela.getByRole('button', { name: 'Abrir no app: slskd' }).click();
  await expect(janela).toHaveTitle('slskd · Soulcrate');
  expect(await abertosFora(app)).toEqual([]);

  // o ícone ao lado sempre oferece o outro destino
  await irParaInicio(janela);
  await janela.getByRole('button', { name: 'Abrir no navegador: Navidrome' }).click();
  await expect.poll(() => abertosFora(app)).toEqual([expect.stringContaining('127.0.0.1:4533')]);

  // "No navegador" nas preferências: o principal passa a abrir no navegador
  await irParaConfiguracoes(janela, 'Aplicativo');
  await marcar(janela.getByRole('radio', { name: 'No navegador' }));
  await expect.poll(() => settings(amb).abrirWebUi).toBe('navegador');
  await irParaInicio(janela);
  await janela.getByRole('button', { name: 'Abrir no navegador: Soulbeet' }).click();
  await expect.poll(async () => (await abertosFora(app)).at(-1)).toContain('127.0.0.1:9765');
  await expect(janela).toHaveTitle('Início · Soulcrate');
});

// ---------------------------------------------------------------- Fase 6: Sobre e suporte

test('Sobre: versões do app, da stack e dos componentes lidas dos contêineres; sem a stack, diz por quê', async () => {
  amb = criarAmbiente({ mundo: { containers: {} } });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await irParaConfiguracoes(janela, 'Sobre');

  await expect(janela.getByTestId('versao-do-app')).toHaveText(VERSAO_DO_APP);
  await expect(janela.getByTestId('versao-da-stack')).toHaveText('1.0.0');
  for (const c of ['slskd', 'beets', 'navidrome']) {
    await expect(janela.getByTestId(`versao-${c}`)).toHaveText('Ligue a stack para ler');
  }

  // a stack sobe por fora: a tela relê e passa a mostrar as versões (o beets é perguntado ao próprio contêiner)
  amb.mudarMundo({ containers: TODOS_NO_AR });
  await expect(janela.getByTestId('versao-slskd')).toHaveText('0.26.0', { timeout: 20_000 });
  await expect(janela.getByTestId('versao-beets')).toHaveText('2.11.0');
  await expect(janela.getByTestId('versao-navidrome')).toHaveText('0.64.2');
  await expect(janela.getByTestId('sobre-versoes')).toContainText('lida do contêiner');
  await expect(janela.getByTestId('sobre-versoes')).toContainText('rótulo da imagem do contêiner');
  await capturar(janela, 'f6-04-sobre');

  // créditos e licença: os projetos com link e o texto da licença do Soulcrate
  await janela.getByRole('button', { name: 'Créditos e licença' }).click();
  const dialogo = janela.getByRole('dialog');
  await expect(dialogo.getByRole('link', { name: 'slskd' })).toBeVisible();
  await expect(dialogo).toContainText('MIT License');
  await capturar(janela, 'f6-05-creditos');
  await janela.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
});

test('pacote de suporte: gera o zip com o que o suporte precisa e SEM nenhum segredo (nem o .env)', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  // logs de lotes antigos com segredos escondidos onde costumam vazar
  mkdirSync(join(amb.projeto, 'lotes'), { recursive: true });
  writeFileSync(
    join(amb.projeto, 'lotes', 'execucao-20261001-100000.log'),
    `usando a chave ${ENV_VALIDO.SLSKD_API_KEY_SOULBEET} e a senha ${ENV_VALIDO.SLSK_PASSWORD} no slskd\r\n`,
  );
  writeFileSync(
    join(amb.projeto, 'lotes', 'erro-20261001-100000.log'),
    `Invoke-RestMethod: 401 (X-API-Key: ${ENV_VALIDO.SLSKD_API_KEY_SOULBEET}) senha web ${ENV_VALIDO.SLSKD_WEB_PASSWORD}\r\n`,
  );
  const destino = join(amb.raiz, 'saida', 'pacote.zip');
  aberto = await abrirApp(amb, { ...BASE, SOULCRATE_DUBLE_DESTINO_SUPORTE: destino });
  const { app, janela } = aberto;
  // o Explorer de verdade não abre durante o teste
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __reveladas: string[] };
    g.__reveladas = [];
    shell.showItemInFolder = (c: string) => void g.__reveladas.push(c);
  });
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');
  await irParaConfiguracoes(janela, 'Sobre');

  mkdirSync(join(amb.raiz, 'saida'), { recursive: true });
  await janela.getByRole('button', { name: 'Gerar pacote de suporte' }).click();
  await expect(janela.getByTestId('pacote-pronto')).toContainText('Senhas e chaves foram removidas');
  await capturar(janela, 'f6-06-pacote-pronto');
  expect(existsSync(destino)).toBe(true);
  expect(await global<string[]>(app, '__reveladas')).toEqual([destino]);

  // abre o zip com o Expand-Archive do Windows (o que o suporte usaria)
  const extraido = join(amb.raiz, 'extraido');
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${destino}' -DestinationPath '${extraido}'`,
    ],
    { encoding: 'utf8' },
  );
  expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
  const arquivos = (pasta: string, prefixo = ''): string[] =>
    readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? arquivos(join(pasta, e.name), `${prefixo}${e.name}/`) : [`${prefixo}${e.name}`],
    );
  const nomes = arquivos(extraido).sort();
  expect(nomes).toEqual(
    expect.arrayContaining([
      'LEIA-ME.txt',
      'configuracao.txt',
      'docker-compose-ps.txt',
      'env-sem-segredos.txt',
      'logs-do-app/main.log',
      'lotes/erro-20261001-100000.log',
      'lotes/execucao-20261001-100000.log',
      'versoes.txt',
    ]),
  );
  // o .env e o slskd.yml em si nunca entram
  expect(nomes.filter((n) => /(^|\/)(\.env|slskd\.yml)$/.test(n))).toEqual([]);
  // e nenhum segredo, em arquivo nenhum
  const segredos = [
    ENV_VALIDO.SLSK_PASSWORD,
    ENV_VALIDO.SLSKD_WEB_PASSWORD,
    ENV_VALIDO.SOULBEET_SECRET_KEY,
    ENV_VALIDO.SLSKD_API_KEY_SOULBEET,
  ];
  for (const n of nomes) {
    const texto = readFileSync(join(extraido, n), 'utf8');
    for (const s of segredos) expect(texto, `${n} vazou um segredo`).not.toContain(s as string);
  }
  expect(readFileSync(join(extraido, 'env-sem-segredos.txt'), 'utf8')).toContain('SLSK_PASSWORD=***');
  expect(readFileSync(join(extraido, 'versoes.txt'), 'utf8')).toContain(VERSAO_DO_APP);
  expect(readFileSync(join(extraido, 'lotes', 'execucao-20261001-100000.log'), 'utf8')).toContain('usando a chave ***');
});

// ---------------------------------------------------------------- Fase 7: atualização do app

/** Um lote "vivo" que o app encontra ao abrir: trava com o PID de um processo de verdade e o arquivo de eventos. */
function criarLoteVivo(a: Ambiente): { id: string; terminar(): void } {
  const id = '20261008-120000';
  const lotes = join(a.projeto, 'lotes');
  mkdirSync(lotes, { recursive: true });
  const filho = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'ignore', windowsHide: true });
  filhos.push(filho);
  const fixture = readFileSync(join(APP_DIR, 'tests', 'fixtures', 'lote', 'eventos-completo.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  const inicio = JSON.parse(fixture[0] as string) as Record<string, unknown>;
  const fim = fixture.at(-1) as string;
  expect((JSON.parse(fim) as { type: string }).type).toBe('run.end');
  writeFileSync(join(lotes, 'estado-set.lock'), `${filho.pid}\t2026-10-08T12:00:00\t${id}\r\n`);
  writeFileSync(
    join(lotes, `eventos-${id}.jsonl`),
    `${JSON.stringify({ ...inicio, id, pid: filho.pid, list: 'set.txt' })}\n`,
  );
  return {
    id,
    terminar: () => {
      appendFileSync(join(lotes, `eventos-${id}.jsonl`), `${fim}\n`);
      rmSync(join(lotes, 'estado-set.lock'), { force: true });
      filho.kill();
    },
  };
}

test('atualização do app: procura, baixa e fica pronta; só reinicia com nenhum lote rodando', async () => {
  amb = criarAmbiente();
  const lote = criarLoteVivo(amb);
  aberto = await abrirApp(amb, BASE);
  const { app, janela } = aberto;
  // o lote que já estava rodando foi reencontrado: o app sabe que há um lote
  await expect(janela.getByTestId('cartao-lote')).toBeVisible();

  await irParaConfiguracoes(janela, 'Sobre');
  await expect(janela.getByTestId('estado-atualizacao')).toContainText(
    'procura atualização ao abrir e a cada 24 horas',
  );
  await janela.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(janela.getByTestId('estado-atualizacao')).toContainText('Você está na versão mais nova');
  expect(await global<number>(app, '__updaterChecagens')).toBe(1); // a agenda automática fica desligada no dublê

  // "chega" uma versão nova
  await app.evaluate(() => {
    const g = globalThis as unknown as Record<string, string>;
    g.__updaterResposta = 'nova';
    g.__updaterVersao = '9.9.9';
  });
  await janela.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(janela.getByTestId('estado-atualizacao')).toContainText(
    'A versão 9.9.9 está pronta. Ela entra quando o app reiniciar',
  );
  await capturar(janela, 'f7-01-atualizacao-pronta');

  // no Início o aviso diz que há um lote rodando e o botão espera
  await irParaInicio(janela);
  const aviso = janela.getByTestId('aviso-atualizacao');
  await expect(aviso).toContainText('A versão 9.9.9 está pronta');
  await expect(aviso).toContainText('Há um lote rodando');
  const reiniciar = aviso.getByRole('button', { name: 'Reiniciar e atualizar' });
  await expect(reiniciar).toBeDisabled();
  await capturar(janela, 'f7-02-aviso-com-lote');
  expect(await global<unknown>(app, '__updaterInstalou')).toBeNull();

  // mesmo se o botão do renderer fosse forçado, o main recusa: nunca aplica durante um lote
  const recusa = await janela.evaluate(() => window.soulcrate.update.restartAndInstall());
  expect(recusa).toMatchObject({ ok: false, erro: { codigo: 'atualizacao.lote-rodando' } });
  expect(await global<unknown>(app, '__updaterInstalou')).toBeNull();

  // o lote termina: agora reinicia (em silêncio, reabrindo o app)
  lote.terminar();
  await expect(reiniciar).toBeEnabled({ timeout: 20_000 });
  await reiniciar.click();
  await expect.poll(() => global<unknown>(app, '__updaterInstalou')).toEqual({ silencioso: true, reabrir: true });
});

test('atualização do app: sem internet vira um erro claro, com "Tentar de novo"', async () => {
  amb = criarAmbiente();
  aberto = await abrirApp(amb, BASE);
  const { app, janela } = aberto;
  await app.evaluate(() => {
    (globalThis as unknown as Record<string, string>).__updaterResposta = 'erro';
  });
  await irParaConfiguracoes(janela, 'Sobre');
  await janela.getByRole('button', { name: 'Procurar atualização' }).click();
  const erro = janela.getByTestId('cartao-atualizacao').getByRole('alert');
  await expect(erro).toContainText('Não consegui procurar atualização');
  await capturar(janela, 'f7-03-atualizacao-erro');
  await app.evaluate(() => {
    (globalThis as unknown as Record<string, string>).__updaterResposta = 'nenhuma';
  });
  await erro.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(janela.getByTestId('estado-atualizacao')).toContainText('Você está na versão mais nova');
});

// ---------------------------------------------------------------- Fase 7: arquivos da stack

const sha256 = (t: string | Buffer) => createHash('sha256').update(t).digest('hex');
const doRepositorio = (rel: string) => readFileSync(join(REPO, ...rel.split('/')));

test('arquivos da stack: troca o que ninguém editou, mantém o que o usuário editou (.novo), avisa e nunca toca no .env', async () => {
  amb = criarAmbiente();
  // uma pasta que o app instalou numa versão antiga: o compose é o que o manifesto registrou (ninguém o editou)...
  const composeAntigo = readFileSync(join(amb.projeto, 'docker-compose.yml'), 'utf8');
  mkdirSync(join(amb.projeto, '.soulcrate'), { recursive: true });
  writeFileSync(
    join(amb.projeto, '.soulcrate', 'manifesto.json'),
    JSON.stringify({ versaoDaStack: '0.9.0', arquivos: { 'docker-compose.yml': sha256(composeAntigo) } }),
  );
  // ...e a configuração do beets foi personalizada pelo usuário (o manifesto não conhece essa versão dela)
  mkdirSync(join(amb.projeto, 'soulbeet', 'config'), { recursive: true });
  writeFileSync(join(amb.projeto, 'soulbeet', 'config', 'config.yaml'), 'meu beets personalizado\n');
  const envAntes = readFileSync(join(amb.projeto, '.env'), 'utf8');
  const ymlAntes = readFileSync(join(amb.projeto, 'slskd', 'slskd.yml'), 'utf8');
  writeFileSync(join(amb.projeto, 'lista-sabado.txt'), 'Azyr - No Escape\r\n');

  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  const versaoDoApp = readFileSync(join(REPO, 'VERSION'), 'utf8').trim();

  // o app novo atualizou a pasta ao abrir
  await expect
    .poll(() => readFileSync(join(amb.projeto, 'docker-compose.yml')).equals(doRepositorio('docker-compose.yml')))
    .toBe(true);
  expect(readFileSync(join(amb.projeto, 'baixar-lista.ps1')).equals(doRepositorio('baixar-lista.ps1'))).toBe(true);
  expect(readFileSync(join(amb.projeto, 'VERSION'), 'utf8').trim()).toBe(versaoDoApp);
  // o que o usuário editou ficou como estava, com a versão nova ao lado
  expect(readFileSync(join(amb.projeto, 'soulbeet', 'config', 'config.yaml'), 'utf8')).toBe(
    'meu beets personalizado\n',
  );
  expect(
    readFileSync(join(amb.projeto, 'soulbeet', 'config', 'config.yaml.novo')).equals(
      doRepositorio('soulbeet/config/config.yaml'),
    ),
  ).toBe(true);
  // e nada do que é do usuário foi tocado
  expect(readFileSync(join(amb.projeto, '.env'), 'utf8')).toBe(envAntes);
  expect(readFileSync(join(amb.projeto, 'slskd', 'slskd.yml'), 'utf8')).toBe(ymlAntes);
  expect(readFileSync(join(amb.projeto, 'lista-sabado.txt'), 'utf8')).toBe('Azyr - No Escape\r\n');
  const manifesto = JSON.parse(readFileSync(join(amb.projeto, '.soulcrate', 'manifesto.json'), 'utf8')) as {
    versaoDaStack: string;
  };
  expect(manifesto.versaoDaStack).toBe(versaoDoApp);

  // o Início conta o que houve, com os .novo e a reconstrução que a mudança pede
  const aviso = janela.getByTestId('aviso-arquivos-da-stack');
  await expect(aviso).toContainText(`passou da stack 0.9.0 para a ${versaoDoApp}`);
  await expect(aviso).toContainText('soulbeet/config/config.yaml.novo');
  await expect(aviso).toContainText('reconstrua a stack');
  await capturar(janela, 'f7-04-aviso-arquivos-da-stack');

  // Configurações → Sobre: o app cuida da pasta
  await irParaConfiguracoes(janela, 'Sobre');
  await expect(janela.getByTestId('arquivos-da-stack')).toContainText('O app cuida dos arquivos da stack desta pasta');
  await irParaInicio(janela);
  await janela.getByTestId('aviso-arquivos-da-stack').getByRole('button', { name: 'Dispensar' }).click();
  await expect(janela.getByTestId('aviso-arquivos-da-stack')).toBeHidden();

  // abrir de novo não atualiza nem avisa outra vez
  await fecharApp(aberto.app);
  aberto = await abrirApp(amb, BASE);
  await expect(aberto.janela.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(aberto.janela.getByTestId('aviso-arquivos-da-stack')).toBeHidden();
  expect(readFileSync(join(amb.projeto, 'soulbeet', 'config', 'config.yaml'), 'utf8')).toBe(
    'meu beets personalizado\n',
  );
});

test('arquivos da stack: uma pasta que o app só adotou (sem manifesto, como um clone do Git) nunca é atualizada', async () => {
  amb = criarAmbiente();
  const antes = readFileSync(join(amb.projeto, 'docker-compose.yml'), 'utf8');
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await irParaConfiguracoes(janela, 'Sobre');
  await expect(janela.getByTestId('arquivos-da-stack')).toContainText('quem a atualiza é quem a criou');
  expect(readFileSync(join(amb.projeto, 'docker-compose.yml'), 'utf8')).toBe(antes);
  expect(existsSync(join(amb.projeto, 'baixar-lista.ps1'))).toBe(false);
  expect(existsSync(join(amb.projeto, '.soulcrate'))).toBe(false);
});

test('arquivos da stack esperam um lote terminar para entrar', async () => {
  amb = criarAmbiente();
  const composeAntigo = readFileSync(join(amb.projeto, 'docker-compose.yml'), 'utf8');
  mkdirSync(join(amb.projeto, '.soulcrate'), { recursive: true });
  writeFileSync(
    join(amb.projeto, '.soulcrate', 'manifesto.json'),
    JSON.stringify({ versaoDaStack: '0.9.0', arquivos: { 'docker-compose.yml': sha256(composeAntigo) } }),
  );
  const lote = criarLoteVivo(amb);
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await expect(janela.getByTestId('cartao-lote')).toBeVisible();
  // com o lote rodando, nada muda na pasta e o Início diz que está esperando
  await expect(janela.getByTestId('arquivos-da-stack-esperando')).toBeVisible();
  expect(readFileSync(join(amb.projeto, 'docker-compose.yml'), 'utf8')).toBe(composeAntigo);
  expect(existsSync(join(amb.projeto, 'baixar-lista.ps1'))).toBe(false);
  await capturar(janela, 'f7-05-arquivos-esperando-lote');

  // o lote termina: a atualização entra sozinha, sem reabrir o app
  lote.terminar();
  await expect.poll(() => existsSync(join(amb.projeto, 'baixar-lista.ps1')), { timeout: 30_000 }).toBe(true);
  expect(readFileSync(join(amb.projeto, 'docker-compose.yml')).equals(doRepositorio('docker-compose.yml'))).toBe(true);
  await expect(janela.getByTestId('aviso-arquivos-da-stack')).toBeVisible();
});
