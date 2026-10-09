// Gera as capturas de tela do README (docs/img/*.png). Não é um teste do app: é o mesmo app de verdade (Electron), com o
// baixar-lista.ps1 e o PowerShell de verdade, contra o dublê do docker e o slskd falso, com DADOS DE DEMONSTRAÇÃO
// (nenhuma conta, pasta ou biblioteca sua aparece). Rode com `npm run capturas` e confira o resultado antes de commitar.
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  abrirApp,
  abrirListaDosRecentes,
  ambienteDoLote,
  criarAmbiente,
  fecharApp,
  iniciarSlskdFalso,
  opcoesDeTeste,
  pararLotesRodando,
  TODOS_NO_AR,
  type Ambiente,
  type AppAberto,
  type ArquivoRemoto,
  type SlskdFalso,
} from '../e2e/ajudantes';

const DESTINO = join(import.meta.dirname, '..', '..', '..', 'docs', 'img');
mkdirSync(DESTINO, { recursive: true });

let amb: Ambiente;
let aberto: AppAberto | null = null;
let slskd: SlskdFalso | null = null;

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  await pararLotesRodando(amb);
  await slskd?.fechar().catch(() => undefined);
  slskd = null;
  amb?.limpar();
});

/**
 * Deixa a tela assentar (esqueletos de carregamento viram conteúdo, animações terminam), volta todas as rolagens ao topo
 * e grava o PNG. A pasta de teste fica num caminho temporário (com o seu usuário do Windows): nas capturas, ela aparece
 * como C:\DJ\Soulcrate, que é o que um usuário veria.
 */
async function foto(janela: Page, nome: string): Promise<void> {
  await janela.mouse.move(0, 0);
  await janela.waitForTimeout(900);
  await janela.evaluate(() => {
    const troca = (s: string) => s.replace(/[A-Za-z]:\\[^\s"']*?sc-e2e-[A-Za-z0-9]+\\projeto/g, 'C:\\DJ\\Soulcrate');
    const andador = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = andador.nextNode(); n; n = andador.nextNode()) n.nodeValue = troca(n.nodeValue ?? '');
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
      el.value = troca(el.value);
    }
    for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollTop > 0) el.scrollTop = 0;
  });
  await janela.waitForTimeout(300);
  await janela.screenshot({ path: join(DESTINO, `${nome}.png`) });
}

const menu = (janela: Page, nome: string) =>
  janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: nome });
const contador = (janela: Page, k: string) => janela.locator(`[data-contador="${k}"] [data-valor]`);
const linhaDe = (janela: Page, lista: string) =>
  janela.getByTestId('linha-execucao').filter({ has: janela.getByRole('link', { name: lista, exact: true }) });

const irPara = async (janela: Page, rota: string) => {
  await janela.evaluate((r) => {
    window.location.hash = `#${r}`;
  }, rota);
  await expect(janela.locator('#conteudo')).toBeVisible();
};

const definirTema = (app: ElectronApplication, fonte: 'dark' | 'light') =>
  app.evaluate(({ nativeTheme }, f) => {
    nativeTheme.themeSource = f as 'dark' | 'light';
  }, fonte);

const BASE = {
  SOULCRATE_DUBLE_INICIO_WINDOWS: '1',
  SOULCRATE_DUBLE_ATUALIZADOR: '1',
  SOULCRATE_SLSKD_URL: 'http://127.0.0.1:1',
};

// ---------------------------------------------------------------- Início, assistente, serviços e configurações

test('capturas: início, assistente, serviços e configurações', async () => {
  test.setTimeout(120_000);
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  aberto = await abrirApp(amb, BASE);
  const { app, janela } = aberto;
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis');

  await foto(janela, '01-inicio');

  await definirTema(app, 'light');
  await janela.waitForTimeout(600);
  await foto(janela, '01-inicio-claro');
  await definirTema(app, 'dark');
  await janela.waitForTimeout(600);

  await irPara(janela, '/servicos');
  await janela.waitForTimeout(1500);
  await foto(janela, '07-servicos');

  await irPara(janela, '/configuracoes');
  const secoes = janela.getByRole('navigation', { name: 'Seções' });
  await secoes.getByRole('button', { name: 'Pastas' }).click();
  await foto(janela, '08-configuracoes');
  await secoes.getByRole('button', { name: 'Aplicativo' }).click();
  await foto(janela, '08-configuracoes-aplicativo');
});

test('capturas: assistente', async () => {
  test.setTimeout(60_000);
  amb = criarAmbiente({ semProjeto: true });
  aberto = await abrirApp(amb, BASE);
  const { janela } = aberto;
  await irPara(janela, '/assistente');
  await expect(janela.getByTestId('assistente')).toBeVisible();
  await janela.getByText('Criar uma pasta nova').click();
  await janela.getByTestId('campo-pasta').fill('C:\\Users\\dj\\Soulcrate');
  await foto(janela, '02-assistente');
});

// ---------------------------------------------------------------- Baixar lista, histórico e diagnóstico

const ARQUIVOS: [string, string][] = [
  ['Azyr', 'No Escape'],
  ['Azyr', 'Power'],
  ['Creeds', 'Push Up'],
  ['RIOT CODE', 'Direct It To The Roof (Azyr Remix)'],
  ['Charlie Sparks', 'Tatakai'],
  ['Vendex', 'Abaddon'],
  ['Vendex', 'Plague'],
  ['Vendex', 'Vengeance Of The Masked'],
  ['Novah', 'ACID'],
  ['Luciid', 'Bye Bye'],
  // o título "Dark Power" da lista está errado: o artista tem "Dark Tower"
  ['Vendex', 'Dark Tower'],
];
const remotos: ArquivoRemoto[] = ARQUIVOS.map(([artista, titulo], i) => {
  const usuario = i % 2 ? 'dj_vinil' : 'crate_digger';
  return { usuario, arquivo: `@@${usuario}\\Music\\${artista}\\${artista} - ${titulo}.flac` };
});
const LISTA = [
  '# Set de sexta: hard techno',
  'Azyr - No Escape',
  'Azyr - Power',
  'Creeds - Push Up (Original Mix)',
  'RIOT CODE - Direct It To The Roof (Azyr Remix)',
  'Charlie Sparks - Tatakai',
  'Vendex - Abaddon',
  'Vendex - Plague',
  'Vendex - Vengeance Of The Masked',
  'Novah - ACID',
  'Luciid - Bye Bye',
  'Vendex - Dark Power',
].join('\r\n');

test('capturas: lista, opções, execução, histórico e diagnóstico', async () => {
  test.setTimeout(480_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  slskd = await iniciarSlskdFalso(amb, remotos);
  writeFileSync(join(amb.projeto, 'set-sexta.txt'), LISTA);

  const extras = { ...ambienteDoLote(amb, slskd), SOULCRATE_DUBLE_LIXEIRA: '1', SOULCRATE_DUBLE_ATUALIZADOR: '1' };
  aberto = await abrirApp(amb, extras);
  const { janela } = aberto;

  // 1. a lista, com a pré-visualização feita pelo próprio script
  await abrirListaDosRecentes(janela, 'set-sexta.txt');
  await expect(janela.getByRole('region', { name: 'Pré-visualização' })).toContainText('11 para baixar', {
    timeout: 60_000,
  });
  await foto(janela, '03-lista');

  // 2. as opções
  await opcoesDeTeste(janela);
  await foto(janela, '04-opcoes');

  // 3. o lote
  await janela.getByTestId('iniciar-lote').click();
  await expect(janela.getByTestId('nome-da-lista')).toHaveText('set-sexta.txt');
  await expect(janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'completed', { timeout: 240_000 });
  await expect(contador(janela, 'baixadas')).toHaveText('10');
  await expect(contador(janela, 'naoAchadas')).toHaveText('1');
  await foto(janela, '05-execucao');

  // 4. o detalhe da execução e o diagnóstico da faixa que não veio
  await menu(janela, 'Histórico').click();
  const linha = linhaDe(janela, 'set-sexta.txt');
  await expect(linha).toHaveCount(1);
  await linha.getByRole('link', { name: 'Abrir' }).click();
  await expect(janela.getByTestId('fim-da-execucao')).toContainText('Concluído');
  await foto(janela, '06-historico-detalhe');

  await janela.getByTestId('tentar-de-novo').click();
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('1 faixa não veio');
  await expect(janela.getByTestId('talvez-seja')).toContainText('Dark Tower');
  await expect(janela.getByTestId('linha-na-lista')).toHaveText('linha 12 de set-sexta.txt', { timeout: 60_000 });
  await foto(janela, '06-diagnostico');

  // 5. um clique corrige a linha, e "tentar de novo" baixa a faixa: o histórico fica com as duas execuções
  await janela.getByRole('button', { name: 'Dark Tower', exact: true }).click();
  await expect(janela.getByTestId('corrigida')).toContainText('Corrigida');
  await janela.getByTestId('revisar-e-tentar').click();
  await janela.getByTestId('iniciar-lote').click();
  await expect(janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'completed', { timeout: 240_000 });
  await menu(janela, 'Histórico').click();
  await expect(janela.getByTestId('linha-execucao')).toHaveCount(2);
  await foto(janela, '06-historico');
});

// ---------------------------------------------------------------- Biblioteca

interface FaixaFalsa {
  id: number;
  artista: string;
  titulo: string;
  bpm: number | null;
  tom: string | null;
  generos: string;
  formato: string;
  bitrate: string;
  arquivo: string;
  calcular?: { bpm?: number; tom?: string };
}

const faixa = (
  id: number,
  artista: string,
  titulo: string,
  bpm: number | null,
  tom: string | null,
  extra: Partial<FaixaFalsa> = {},
): FaixaFalsa => ({
  id,
  artista,
  titulo,
  bpm,
  tom,
  generos: 'Hard Techno',
  formato: 'FLAC',
  bitrate: '1000kbps',
  arquivo: `Hard Techno/${artista}/${titulo}.flac`,
  ...extra,
});

const BIBLIOTECA: FaixaFalsa[] = [
  faixa(1, 'Azyr', 'No Escape', 150, 'Am'),
  faixa(2, 'Azyr', 'Power', 152, 'Gm'),
  faixa(3, 'Charlie Sparks', 'Tatakai', null, 'Fm', { calcular: { bpm: 140 } }),
  faixa(4, 'Creeds', 'Push Up (Original Mix)', 148, 'Cm'),
  faixa(5, 'Luciid', 'Bye Bye', 145, 'Dm', { generos: '', arquivo: '_Sem Genero/Luciid/Bye Bye.flac' }),
  faixa(6, 'Novah', 'ACID', 155, 'Em', { generos: 'Acid Techno', arquivo: 'Acid Techno/Novah/ACID.flac' }),
  faixa(7, 'RIOT CODE', 'Direct It To The Roof (Azyr Remix)', 150, 'Bm'),
  faixa(8, 'Vendex', 'Abaddon', 154, 'Am'),
  faixa(9, 'Vendex', 'Plague', 150, null, { calcular: { tom: 'Gm' } }),
  faixa(10, 'Vendex', 'Vengeance Of The Masked', 147, 'Dm', {
    formato: 'MP3 320',
    bitrate: '320kbps',
    arquivo: 'Hard Techno/Vendex/Vengeance Of The Masked.mp3',
  }),
];

function criarArquivo(base: string, rel: string, haMs = 0): void {
  const abs = join(base, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, 'audio');
  if (haMs > 0) {
    const t = new Date(Date.now() - haMs);
    utimesSync(abs, t, t);
  }
}

test('capturas: biblioteca', async () => {
  test.setTimeout(120_000);
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  slskd = await iniciarSlskdFalso(amb, []);
  const music = join(amb.projeto, 'music');
  const downloads = join(amb.projeto, 'downloads');
  for (const f of BIBLIOTECA) criarArquivo(music, f.arquivo);
  criarArquivo(downloads, 'f_hard/Kaotik - Sem Tag.mp3', 26 * 3_600_000);
  amb.mudarMundo({
    containers: TODOS_NO_AR,
    biblioteca: {
      musicaDir: music,
      downloadsDir: downloads,
      faixas: BIBLIOTECA,
      importaveis: {
        f_hard: [
          faixa(11, 'Kaotik', 'Sem Tag', 150, 'Am', { formato: 'MP3 320', arquivo: 'Hard Techno/Kaotik/Sem Tag.mp3' }),
        ],
      },
      atrasoMs: 100,
    },
  } as never);
  aberto = await abrirApp(amb, { ...BASE, SOULCRATE_SLSKD_URL: slskd.url });
  const { janela } = aberto;
  await menu(janela, 'Biblioteca').click();
  await expect(janela.getByTestId('tabela-biblioteca')).toBeVisible();
  await expect(janela.getByTestId('pasta-rekordbox')).toBeVisible();
  await foto(janela, '09-biblioteca');
});
