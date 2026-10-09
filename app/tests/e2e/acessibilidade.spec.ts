// Fase 6, acessibilidade, ponta a ponta (§5 e Apêndice D: "navegável por teclado", contraste AA, rótulos em todos os
// controles). O axe-core (WCAG 2.1 A e AA, inclusive contraste de cor) roda em TODAS as telas, nos dois temas, e o teclado
// é exercitado de verdade: o primeiro Tab leva ao "Pular para o conteúdo", e trocar de tela leva o foco ao conteúdo.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { abrirApp, criarAmbiente, fecharApp, TODOS_NO_AR, type Ambiente, type AppAberto } from './ajudantes';

const CAPTURAS = join(import.meta.dirname, '..', '..', 'test-results', 'capturas');
mkdirSync(CAPTURAS, { recursive: true });

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

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Roda o axe na página e devolve só o que importa para quem lê a falha: regra, impacto e os elementos. */
async function violacoes(janela: Page): Promise<string[]> {
  // modo legado: o axe não abre uma página nova (o Electron não sabe criar uma: `Target.createTarget`)
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

const irPara = async (janela: Page, rota: string) => {
  await janela.evaluate((r) => {
    window.location.hash = `#${r}`;
  }, rota);
  await expect(janela.locator('#conteudo')).toBeVisible();
  // dá tempo de a tela ler o que precisa (esqueletos de carregamento viram conteúdo)
  await janela.waitForTimeout(700);
};

const definirTema = (app: ElectronApplication, fonte: 'dark' | 'light') =>
  app.evaluate(({ nativeTheme }, f) => {
    nativeTheme.themeSource = f as 'dark' | 'light';
  }, fonte);

const ROTAS = [
  '/',
  '/lista',
  '/lista/opcoes',
  '/lista/execucao',
  '/historico',
  '/biblioteca',
  '/servicos',
  '/configuracoes',
  '/assistente',
];
const SECOES_DE_CONFIGURACOES = [
  'Conferência',
  'Pastas',
  'Conta Soulseek',
  'Web UI do slskd',
  'Rede',
  'Avançado',
  'Aplicativo',
  'Sobre',
];

for (const tema of ['dark', 'light'] as const) {
  test(`axe (WCAG 2.1 AA): nenhuma violação em nenhuma tela, tema ${tema === 'dark' ? 'escuro' : 'claro'}`, async () => {
    test.setTimeout(240_000);
    amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
    aberto = await abrirApp(amb, BASE);
    const { app, janela } = aberto;
    await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');
    await definirTema(app, tema);
    await expect
      .poll(() => janela.evaluate(() => window.matchMedia('(prefers-color-scheme: light)').matches))
      .toBe(tema === 'light');

    const achados: string[] = [];
    for (const rota of ROTAS) {
      await irPara(janela, rota);
      const arquivo = rota === '/' ? 'inicio' : rota.slice(1).replace(/\//g, '-');
      await janela.screenshot({ path: join(CAPTURAS, `f6-${tema}-${arquivo}.png`) });
      for (const v of await violacoes(janela)) achados.push(`${rota}\n  ${v}`);
    }

    // cada seção de Configurações é uma "tela" à parte
    await irPara(janela, '/configuracoes');
    const secoes = janela.getByRole('navigation', { name: 'Seções' });
    for (const nome of SECOES_DE_CONFIGURACOES) {
      await secoes.getByRole('button', { name: nome }).click();
      await janela.waitForTimeout(500);
      await janela.screenshot({ path: join(CAPTURAS, `f6-${tema}-config-${nome.replace(/\s+/g, '-')}.png`) });
      for (const v of await violacoes(janela)) achados.push(`/configuracoes (${nome})\n  ${v}`);
    }

    // o diálogo de créditos (Radix): foco preso, nome e descrição
    await secoes.getByRole('button', { name: 'Sobre' }).click();
    await janela.getByRole('button', { name: 'Créditos e licença' }).click();
    await expect(janela.getByRole('dialog')).toBeVisible();
    await janela.waitForTimeout(400);
    for (const v of await violacoes(janela)) achados.push(`diálogo de créditos\n  ${v}`);
    await janela.screenshot({ path: join(CAPTURAS, `f6-axe-creditos-${tema}.png`) });

    expect(achados.join('\n'), 'violações de acessibilidade').toBe('');
  });
}

test('axe: as telas com a stack desligada, sem pasta e com o erro de configuração também passam', async () => {
  test.setTimeout(180_000);
  // sem pasta do Soulcrate: os estados vazios e os cartões de erro de cada tela
  amb = criarAmbiente({ semProjeto: true });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await expect(janela.getByRole('heading', { level: 1 })).toBeVisible();
  const achados: string[] = [];
  for (const rota of ['/', '/lista', '/historico', '/biblioteca', '/servicos', '/configuracoes']) {
    await irPara(janela, rota);
    for (const v of await violacoes(janela)) achados.push(`${rota} (sem pasta)\n  ${v}`);
  }
  expect(achados.join('\n'), 'violações de acessibilidade').toBe('');
});

test('teclado: o primeiro Tab é o "Pular para o conteúdo", e trocar de tela leva o foco ao conteúdo', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await expect(janela.getByRole('heading', { level: 1 })).toBeVisible();
  const foco = () =>
    janela.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return { id: a?.id ?? '', texto: (a?.textContent ?? '').trim().slice(0, 40), tag: a?.tagName ?? '' };
    });

  await janela.keyboard.press('Tab');
  expect(await foco()).toMatchObject({ texto: 'Pular para o conteúdo', tag: 'A' });
  // o link só aparece quando recebe o foco
  await expect(janela.getByRole('link', { name: 'Pular para o conteúdo' })).toBeVisible();
  await janela.screenshot({ path: join(CAPTURAS, 'f6-teclado-pular.png') });
  await janela.keyboard.press('Enter');
  expect(await foco()).toMatchObject({ id: 'conteudo' });
  // o `#` do endereço continua sendo o da rota (o link não navegou)
  expect(janela.url()).not.toContain('#conteudo');

  // depois do pulo, o próximo Tab já está no conteúdo da tela, não de volta na barra lateral
  await janela.keyboard.press('Tab');
  const dentro = await janela.evaluate(() => document.querySelector('main')?.contains(document.activeElement) ?? false);
  expect(dentro).toBe(true);

  // trocar de tela pelo teclado: foco no conteúdo, título da janela e nome da região principal
  await janela.getByRole('link', { name: 'Histórico' }).focus();
  await janela.keyboard.press('Enter');
  await expect.poll(async () => (await foco()).id).toBe('conteudo');
  await expect(janela).toHaveTitle('Histórico · Soulcrate');
  await expect(janela.getByRole('main')).toHaveAccessibleName('Histórico');
});

test('teclado: o Tab percorre o "Pular para o conteúdo" e os seis itens da navegação lateral, nessa ordem', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await expect(janela.getByRole('heading', { level: 1 })).toBeVisible();
  const nomes: string[] = [];
  for (let i = 0; i < 7; i++) {
    await janela.keyboard.press('Tab');
    nomes.push(await janela.evaluate(() => document.activeElement?.textContent ?? ''));
  }
  expect(nomes.map((n) => n.replace(/\s+/g, ' ').trim())).toEqual([
    'Pular para o conteúdo',
    'Início',
    'Baixar lista',
    'Histórico',
    'Biblioteca',
    'Serviços',
    'Configurações',
  ]);
});

test('teclado: todo controle da tela Início tem nome acessível e o foco é visível', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');
  const semNome = await janela.evaluate(() => {
    const ruins: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [role="button"], [role="switch"]',
      ),
    )) {
      const por = el.getAttribute('aria-labelledby');
      const nome =
        el.getAttribute('aria-label') ||
        (por ? document.getElementById(por)?.textContent : '') ||
        (el as HTMLInputElement).labels?.[0]?.textContent ||
        el.textContent;
      if (!nome || !nome.trim()) ruins.push(el.outerHTML.slice(0, 140));
    }
    return ruins;
  });
  expect(semNome).toEqual([]);

  // o foco aparece: um botão focado pelo teclado tem contorno
  await janela.getByRole('link', { name: 'Serviços' }).focus();
  await janela.keyboard.press('Shift+Tab');
  await janela.keyboard.press('Tab');
  const contorno = await janela.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const c = getComputedStyle(el);
    return { estilo: c.outlineStyle, largura: Number.parseFloat(c.outlineWidth) };
  });
  expect(contorno.estilo).not.toBe('none');
  expect(contorno.largura).toBeGreaterThanOrEqual(1.5);
});
