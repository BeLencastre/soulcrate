// Modo DJ e Modo Dev, ponta a ponta (protótipos "modos-dev-dj"): o alternador da barra lateral, o atalho
// Ctrl+Shift+D, a escolha guardada entre aberturas do app, a volta das telas só do Modo Dev
// para a tela-mãe, e o axe (WCAG 2.1 AA) nas telas do Modo DJ, nos dois temas.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { abrirApp, criarAmbiente, fecharApp, TODOS_NO_AR, type Ambiente, type AppAberto } from './ajudantes';

const BASE = {
  SOULCRATE_DUBLE_INICIO_WINDOWS: '1',
  SOULCRATE_DUBLE_ATUALIZADOR: '1',
  SOULCRATE_SLSKD_URL: 'http://127.0.0.1:1',
};

let amb: Ambiente;
let aberto: AppAberto | null = null;

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  amb?.limpar();
});

const irPara = async (janela: Page, rota: string) => {
  await janela.evaluate((r) => {
    window.location.hash = `#${r}`;
  }, rota);
  await expect(janela.locator('#conteudo')).toBeVisible();
  await janela.waitForTimeout(700);
};

test('o alternador troca o modo na hora, sem aviso, e a escolha fica para a próxima abertura', async () => {
  test.setTimeout(120_000);
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  let { janela } = aberto;

  // quem já usava o app (sem escolha registrada) continua no Modo Dev
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('Stack no ar');
  const modo = janela.getByRole('group', { name: 'Modo da interface' });
  await expect(modo.getByRole('button', { name: /Dev/ })).toHaveAttribute('aria-pressed', 'true');

  await modo.getByRole('button', { name: /DJ/ }).click();
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('Tudo pronto');
  await expect(janela.getByTestId('resumo-stack')).toHaveText('Ligado');
  // a troca não abre aviso nenhum; voltar é pelo próprio alternador
  await expect(janela.getByText('Modo DJ ligado')).toHaveCount(0);
  await modo.getByRole('button', { name: /Dev/ }).click();
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('Stack no ar');
  await modo.getByRole('button', { name: /DJ/ }).click();
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('Tudo pronto');

  await fecharApp(aberto.app);
  aberto = await abrirApp(amb, BASE);
  janela = aberto.janela;
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('Tudo pronto');
  await expect(
    janela.getByRole('group', { name: 'Modo da interface' }).getByRole('button', { name: /DJ/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Ctrl+Shift+D alterna em qualquer tela, e a seção só do Modo Dev volta para a tela-mãe', async () => {
  test.setTimeout(120_000);
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');

  await irPara(janela, '/configuracoes?secao=avancado');
  await expect(janela.getByRole('heading', { level: 2, name: 'Avançado' })).toBeVisible();
  await janela.keyboard.press('Control+Shift+D');
  // Avançado não existe no Modo DJ: a tela fica em Configurações, na seção inicial
  await expect(janela.getByRole('heading', { level: 2, name: 'Pastas' })).toBeVisible();
  const secoes = janela.getByRole('navigation', { name: 'Seções' });
  await expect(secoes.getByRole('button', { name: 'Compartilhamento' })).toBeVisible();
  await expect(secoes.getByRole('button', { name: 'Avançado' })).toHaveCount(0);

  await irPara(janela, '/servicos');
  await expect(janela.getByTestId('servicos-dj')).toBeVisible();
  await janela.keyboard.press('Control+Shift+D');
  await expect(janela.getByRole('tablist', { name: 'Contêiner' })).toBeVisible();
});

// ---------------------------------------------------------------- acessibilidade do Modo DJ

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violacoes(janela: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page: janela }).setLegacyMode(true).withTags(TAGS).analyze();
  return r.violations.map(
    (v) =>
      `[${v.impact ?? '?'}] ${v.id}: ${v.help}\n` +
      v.nodes
        .slice(0, 4)
        .map((n) => `    ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n').slice(1, 3).join(' | ')}`)
        .join('\n'),
  );
}

const definirTema = (app: ElectronApplication, fonte: 'dark' | 'light') =>
  app.evaluate(({ nativeTheme }, f) => {
    nativeTheme.themeSource = f as 'dark' | 'light';
  }, fonte);

for (const tema of ['dark', 'light'] as const) {
  test(`axe (WCAG 2.1 AA) nas telas do Modo DJ, tema ${tema === 'dark' ? 'escuro' : 'claro'}`, async () => {
    test.setTimeout(240_000);
    amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
    // a pessoa já escolheu o Modo DJ (no assistente ou na barra lateral)
    writeFileSync(join(amb.dados, 'settings.json'), JSON.stringify({ modo: 'dj' }), 'utf8');
    aberto = await abrirApp(amb, BASE);
    const { app, janela } = aberto;
    await expect(janela.getByTestId('resumo-stack')).toHaveText('Ligado');
    await definirTema(app, tema);
    await expect
      .poll(() => janela.evaluate(() => window.matchMedia('(prefers-color-scheme: light)').matches))
      .toBe(tema === 'light');

    const achados: string[] = [];
    for (const rota of ['/', '/lista', '/lista/opcoes', '/lista/execucao', '/historico', '/biblioteca', '/servicos']) {
      await irPara(janela, rota);
      for (const v of await violacoes(janela)) achados.push(`${rota}\n  ${v}`);
    }
    await irPara(janela, '/configuracoes');
    const secoes = janela.getByRole('navigation', { name: 'Seções' });
    for (const nome of ['Pastas', 'Conta Soulseek', 'Compartilhamento', 'Aplicativo', 'Sobre']) {
      await secoes.getByRole('button', { name: nome }).click();
      await janela.waitForTimeout(500);
      for (const v of await violacoes(janela)) achados.push(`/configuracoes (${nome})\n  ${v}`);
    }

    expect(achados.join('\n'), 'violações de acessibilidade').toBe('');
  });
}
