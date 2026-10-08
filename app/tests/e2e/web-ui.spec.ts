// Web UIs integradas (SP7): a página de cada serviço abre numa WebContentsView, o login persiste entre aberturas
// do app, um serviço não enxerga o cookie do outro e a view não sai da própria porta. Usa servidores HTTP locais
// nas portas reais (5030, 9765): se alguma estiver ocupada (a stack de verdade no ar), os testes são pulados.
import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { abertosFora, abrirApp, criarAmbiente, TODOS_NO_AR, type Ambiente, type AppAberto } from './ajudantes';

let amb: Ambiente;
let aberto: AppAberto | null = null;
const servidores: Server[] = [];

async function subir(porta: number, nome: string, cookie: string): Promise<boolean> {
  const s = createServer((req, res) => {
    res.setHeader('Set-Cookie', `auth_token=${cookie}; Max-Age=86400; Path=/; HttpOnly`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><title>${nome}</title><h1>${nome}</h1><a id="fora" href="https://example.com/">fora</a>`);
  });
  const ok = await new Promise<boolean>((resolve) => {
    s.once('error', () => resolve(false));
    s.listen(porta, '127.0.0.1', () => resolve(true));
  });
  if (ok) servidores.push(s);
  return ok;
}

test.afterEach(async () => {
  await aberto?.app.close().catch(() => undefined);
  aberto = null;
  await Promise.all(servidores.splice(0).map((s) => new Promise((r) => s.close(r))));
  amb?.limpar();
});

/** Troca a rota do app (HashRouter) sem passar pela navegação da janela. */
const irPara = (janela: AppAberto['janela'], rota: string) =>
  janela.evaluate((r) => void (window.location.hash = '#' + r), rota);

/** O que a WebContentsView (a única filha da janela) está mostrando. */
async function olharView(app: AppAberto['app']) {
  return app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const view = win?.contentView.children[0] as unknown as
      | { getBounds(): { x: number; y: number; width: number; height: number }; webContents: Electron.WebContents }
      | undefined;
    if (!view) return null;
    return {
      url: view.webContents.getURL(),
      titulo: view.webContents.getTitle(),
      bounds: view.getBounds(),
      filhas: win?.contentView.children.length ?? 0,
    };
  });
}

test('abre o serviço dentro do app, sobre a área reservada na tela', async () => {
  test.skip(!(await subir(5030, 'slskd falso', 'valor-slskd')), 'porta 5030 ocupada');
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb);
  const { app, janela } = aberto;

  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Serviços' }).click();
  await janela.getByRole('link', { name: 'Abrir Web UIs' }).click();
  await janela.getByRole('tab', { name: 'slskd' }).click();

  await expect.poll(async () => (await olharView(app))?.titulo).toBe('slskd falso');
  const v = await olharView(app);
  expect(v?.url).toBe('http://127.0.0.1:5030/');
  expect(v?.filhas).toBe(1);

  // a view cobre exatamente a área tracejada da página
  const area = await janela.getByTestId('area-da-web-ui').boundingBox();
  expect(area).not.toBeNull();
  expect(Math.abs((v?.bounds.x ?? 0) - Math.round(area?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((v?.bounds.y ?? 0) - Math.round(area?.y ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((v?.bounds.width ?? 0) - Math.round(area?.width ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((v?.bounds.height ?? 0) - Math.round(area?.height ?? 0))).toBeLessThanOrEqual(2);
  await expect(janela.getByTestId('url-da-web-ui')).toHaveText('http://127.0.0.1:5030/');

  // sair da tela tira a view; voltar põe de novo
  await janela.getByRole('link', { name: 'Serviços' }).first().click();
  await expect.poll(async () => (await olharView(app)) === null).toBe(true);
});

test('o login persiste ao fechar e abrir o app, e cada serviço tem a própria sessão', async () => {
  test.skip(!(await subir(5030, 'slskd falso', 'valor-slskd')), 'porta 5030 ocupada');
  test.skip(!(await subir(9765, 'soulbeet falso', 'valor-soulbeet')), 'porta 9765 ocupada');
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });

  const visitar = async (app: AppAberto['app'], janela: AppAberto['janela'], nome: string, titulo: string) => {
    await janela.getByRole('tab', { name: nome }).click();
    await expect.poll(async () => (await olharView(app))?.titulo).toBe(titulo);
  };
  const cookies = (app: AppAberto['app'], particao: string) =>
    app.evaluate(async ({ session }, p) => {
      await session.fromPartition(p).cookies.flushStore();
      return (await session.fromPartition(p).cookies.get({ name: 'auth_token' })).map((c) => c.value);
    }, particao);

  aberto = await abrirApp(amb);
  await irPara(aberto.janela, '/servicos/web/slskd');
  await visitar(aberto.app, aberto.janela, 'slskd', 'slskd falso');
  await visitar(aberto.app, aberto.janela, 'Soulbeet', 'soulbeet falso');

  // mesmo nome de cookie (auth_token) nos dois: cada partição guarda só o seu
  expect(await cookies(aberto.app, 'persist:soulcrate-webui-slskd')).toEqual(['valor-slskd']);
  expect(await cookies(aberto.app, 'persist:soulcrate-webui-soulbeet')).toEqual(['valor-soulbeet']);
  // e a sessão do próprio app não recebe nada
  expect(await aberto.app.evaluate(async ({ session }) => (await session.defaultSession.cookies.get({})).length)).toBe(
    0,
  );

  await aberto.app.close();
  aberto = null;
  // o servidor "esquece": se o cookie vier de volta, veio do disco e não da rede
  await Promise.all(servidores.splice(0).map((s) => new Promise((r) => s.close(r))));

  aberto = await abrirApp(amb);
  expect(await cookies(aberto.app, 'persist:soulcrate-webui-slskd')).toEqual(['valor-slskd']);
  expect(await cookies(aberto.app, 'persist:soulcrate-webui-soulbeet')).toEqual(['valor-soulbeet']);
});

test('a view não sai da própria porta nem abre janelas', async () => {
  test.skip(!(await subir(5030, 'slskd falso', 'x')), 'porta 5030 ocupada');
  test.skip(!(await subir(9765, 'soulbeet falso', 'y')), 'porta 9765 ocupada');
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb);
  const { app, janela } = aberto;
  await irPara(janela, '/servicos/web/slskd');
  await expect.poll(async () => (await olharView(app))?.titulo).toBe('slskd falso');

  const executar = (codigo: string) =>
    app.evaluate(async ({ BrowserWindow }, js) => {
      const view = BrowserWindow.getAllWindows()[0]?.contentView.children[0] as unknown as {
        webContents: Electron.WebContents;
      };
      void view.webContents.executeJavaScript(js).catch(() => undefined); // não espera: navegar pode demorar a "terminar"
      await new Promise((r) => setTimeout(r, 400));
      return view.webContents.getURL();
    }, codigo);

  // outro serviço da stack (outra porta) e um site externo: a view fica onde está
  expect(await executar("location.href = 'http://127.0.0.1:9765/'")).toBe('http://127.0.0.1:5030/');
  expect(await executar("location.href = 'https://example.com/'")).toBe('http://127.0.0.1:5030/');
  expect(await executar("window.open('http://127.0.0.1:9765/'); 0")).toBe('http://127.0.0.1:5030/');
  // o Playwright conta a própria view como página; o que importa é não haver outra janela do app
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  // o que a view tentou abrir foi para o navegador do sistema (só https e Web UIs locais), não para dentro do app
  expect(await abertosFora(app)).toEqual(['http://127.0.0.1:9765/', 'https://example.com/', 'http://127.0.0.1:9765/']);

  // a própria origem navega normalmente
  expect(await executar("location.href = 'http://127.0.0.1:5030/outra'")).toBe('http://127.0.0.1:5030/outra');
});

test('sem acesso ao IPC do app: a view não tem window.soulcrate nem require', async () => {
  test.skip(!(await subir(5030, 'slskd falso', 'x')), 'porta 5030 ocupada');
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb);
  const { app, janela } = aberto;
  await irPara(janela, '/servicos/web/slskd');
  await expect.poll(async () => (await olharView(app))?.titulo).toBe('slskd falso');
  const tipos = await app.evaluate(async ({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0]?.contentView.children[0] as unknown as {
      webContents: Electron.WebContents;
    };
    return view.webContents.executeJavaScript(
      'JSON.stringify([typeof window.soulcrate, typeof require, typeof process, typeof window.ipcRenderer])',
    ) as Promise<string>;
  });
  expect(JSON.parse(tipos)).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
});
