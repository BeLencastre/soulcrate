// Fase 5, ponta a ponta: a Biblioteca no app de verdade (Electron), contra o dublê do `docker` com um "beets" que mexe
// em arquivos reais da pasta de teste, e o slskd falso da suíte do script para o compartilhamento. Nada aqui toca em
// Docker, na rede ou na sua biblioteca. Critérios de aceite (§5, Fase 5):
//   - toda operação destrutiva tem pré-visualização e confirmação;
//   - nenhuma roda sem a stack no ar.
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  abrirApp,
  criarAmbiente,
  fecharApp,
  iniciarSlskdFalso,
  registrarAberturas,
  abertos,
  TODOS_NO_AR,
  type Ambiente,
  type AppAberto,
  type SlskdFalso,
  capturar,
} from './ajudantes';

let amb: Ambiente;
let aberto: AppAberto | null = null;
let slskd: SlskdFalso | null = null;

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  await slskd?.fechar().catch(() => undefined);
  slskd = null;
  amb?.limpar();
});

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
  destino?: string;
}

const faixa = (id: number, artista: string, titulo: string, extra: Partial<FaixaFalsa> = {}): FaixaFalsa => ({
  id,
  artista,
  titulo,
  bpm: 150,
  tom: 'Am',
  generos: 'Hard Techno',
  formato: 'FLAC',
  bitrate: '1000kbps',
  arquivo: `Hard Techno/${artista}/${titulo}.flac`,
  ...extra,
});

const FAIXAS: FaixaFalsa[] = [
  faixa(1, 'Azyr', 'No Escape'),
  faixa(2, 'Azyr', 'Power'),
  faixa(3, 'Charlie Sparks', 'Tatakai', { bpm: null, calcular: { bpm: 140 } }),
  faixa(4, 'Vendex', 'Plague', { tom: null, calcular: { tom: 'Gm' } }),
  faixa(5, 'Luciid', 'Bye Bye', { generos: '', arquivo: '_Sem Genero/Luciid/Bye Bye.flac' }),
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

/** A pasta de teste com a biblioteca no disco e o "beets" do dublê apontando para ela. */
function montarBiblioteca(
  a: Ambiente,
  opcoes: { faixas?: FaixaFalsa[]; parados?: boolean; atrasoMs?: number; mundo?: Record<string, unknown> } = {},
): void {
  const faixas = opcoes.faixas ?? FAIXAS;
  const music = join(a.projeto, 'music');
  const downloads = join(a.projeto, 'downloads');
  for (const f of faixas) criarArquivo(music, f.arquivo);
  const importaveis: Record<string, FaixaFalsa[]> = {};
  if (opcoes.parados) {
    criarArquivo(downloads, 'f_hard/Vengeance Of The Masked.mp3', 26 * 3_600_000);
    importaveis.f_hard = [
      faixa(6, 'Vendex', 'Vengeance Of The Masked', {
        formato: 'MP3 320',
        bitrate: '320kbps',
        arquivo: 'Hard Techno/Vendex/Vengeance Of The Masked.mp3',
      }),
    ];
  }
  a.mudarMundo({
    containers: TODOS_NO_AR,
    biblioteca: { musicaDir: music, downloadsDir: downloads, faixas, importaveis, atrasoMs: opcoes.atrasoMs ?? 150 },
    ...opcoes.mundo,
  } as never);
}

const menu = (janela: Page, nome: string) =>
  janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: nome });
const tabela = (janela: Page) => janela.getByTestId('tabela-biblioteca');
const linhas = (janela: Page) =>
  tabela(janela)
    .getByRole('row')
    .filter({ hasNot: janela.getByRole('columnheader') });
const valor = (janela: Page, id: string) => janela.locator(`[data-valor="${id}"]`);
/** Os argumentos de cada comando do beets que o app mandou (o que vem depois do `-l /music/.beets_library.db`). */
const comandosDoBeets = (a: Ambiente, sub: string): string[] =>
  a
    .chamadas()
    .filter((c) => c.includes('beets.ui'))
    .map((c) => c.split('/music/.beets_library.db ')[1] ?? '')
    .filter((c) => c === sub || c.startsWith(`${sub} `));

async function abrirBiblioteca(): Promise<Page> {
  // sem slskd falso, o app aponta para uma porta onde ninguém escuta: o teste nunca fala com o slskd de quem testa
  aberto = await abrirApp(amb, { SOULCRATE_SLSKD_URL: slskd?.url ?? 'http://127.0.0.1:1' });
  const { janela } = aberto;
  await menu(janela, 'Biblioteca').click();
  await expect(tabela(janela)).toBeVisible();
  return janela;
}

test('lê a biblioteca do beets: faixas, pasta, indicadores e o caminho para o Rekordbox', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb, { parados: true });
  const janela = await abrirBiblioteca();

  await expect(janela.getByRole('heading', { name: 'O caixote' })).toBeVisible();
  await expect(janela.getByText(`${join(amb.projeto, 'music')} · 5 faixas`)).toBeVisible();
  await expect(linhas(janela)).toHaveCount(5);
  // ordenado como um caixote: artista, depois título
  await expect(linhas(janela).first()).toContainText('Azyr');
  await expect(linhas(janela).first()).toContainText('No Escape');
  await expect(valor(janela, 'bpm')).toHaveText('1');
  await expect(valor(janela, 'tom')).toHaveText('1');
  await expect(valor(janela, 'gen')).toHaveText('1');
  await expect(valor(janela, 'dl')).toHaveText('1');
  await expect(janela.getByTestId('pasta-rekordbox')).toHaveText(join(amb.projeto, 'music'));
  await capturar(janela, '05-biblioteca');

  // o indicador filtra, a busca também
  await janela.locator('[data-indicador="bpm"]').click();
  await expect(linhas(janela)).toHaveCount(1);
  await expect(linhas(janela).first()).toContainText('Tatakai');
  await janela.locator('[data-indicador="bpm"]').click();
  await janela.getByTestId('busca').fill('azyr power');
  await expect(linhas(janela)).toHaveCount(1);
  await expect(janela.getByTestId('contagem')).toHaveText('1 de 5');

  // a leitura foi um `ls` (nada além de leitura rodou)
  expect(comandosDoBeets(amb, 'ls').length).toBeGreaterThan(0);
  expect(comandosDoBeets(amb, 'remove')).toHaveLength(0);
});

test('aceite: sem a stack no ar a biblioteca explica e nenhum comando do beets roda', async () => {
  amb = criarAmbiente({ mundo: { containers: {} } });
  montarBiblioteca(amb, { mundo: { containers: {} } });
  aberto = await abrirApp(amb);
  const { janela } = aberto;
  await menu(janela, 'Biblioteca').click();
  await expect(janela.getByRole('heading', { name: 'A biblioteca só abre com a stack no ar' })).toBeVisible();
  await expect(janela.getByRole('button', { name: 'Ligar a stack' })).toBeVisible();
  await expect(tabela(janela)).toHaveCount(0);
  await capturar(janela, '05-biblioteca-stack-fora');
  expect(amb.chamadas().filter((c) => c.includes('beets.ui'))).toEqual([]);

  // ligar a stack pelo próprio cartão faz a biblioteca aparecer sozinha
  await janela.getByRole('button', { name: 'Ligar a stack' }).click();
  await expect(tabela(janela)).toBeVisible({ timeout: 30_000 });
  await expect(linhas(janela)).toHaveCount(5);
});

test('aceite: remover só apaga depois da prévia e da confirmação, e apaga o arquivo do disco', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb);
  const janela = await abrirBiblioteca();
  const arquivo = join(amb.projeto, 'music', 'Hard Techno', 'Azyr', 'No Escape.flac');
  expect(existsSync(arquivo)).toBe(true);

  await janela.getByLabel('Remover No Escape').click();
  const dialogo = janela.getByTestId('dialogo-remover');
  await expect(dialogo.getByTestId('filtro-remover')).toHaveValue('id:1');
  // a prévia lista o que o filtro pega, com o caminho do arquivo
  await expect(dialogo.getByTestId('previa-resumo')).toHaveText('1 faixa · 1 arquivo');
  await expect(dialogo.getByTestId('previa-faixa')).toContainText('music/Hard Techno/Azyr/No Escape.flac');
  await expect(dialogo.getByText(/sem passar pela Lixeira/)).toBeVisible();
  await capturar(janela, '05-remover-previa');

  // sem o "conferi" o botão não funciona: nada foi apagado, nem do disco, nem do beets
  await expect(dialogo.getByTestId('apagar')).toBeDisabled();
  expect(existsSync(arquivo)).toBe(true);
  expect(comandosDoBeets(amb, 'remove')).toHaveLength(0);

  await dialogo.getByTestId('conferi').check();
  await dialogo.getByTestId('apagar').click();
  await expect(dialogo.getByTestId('remocao-feita')).toContainText('Azyr – No Escape saiu da biblioteca');
  await capturar(janela, '05-remover-feito');

  // o `remove -d -f` rodou uma vez, com o filtro que a prévia mostrou, e o arquivo sumiu do disco
  const remocoes = comandosDoBeets(amb, 'remove');
  expect(remocoes).toHaveLength(1);
  expect(remocoes[0]).toBe('remove -d -f id:1');
  expect(existsSync(arquivo)).toBe(false);
  // as outras faixas do mesmo artista continuam
  expect(existsSync(join(amb.projeto, 'music', 'Hard Techno', 'Azyr', 'Power.flac'))).toBe(true);

  await dialogo.getByRole('button', { name: 'Voltar à biblioteca' }).click();
  await expect(linhas(janela)).toHaveCount(4);
  await expect(tabela(janela)).not.toContainText('No Escape');
  await expect(tabela(janela)).toContainText('Power');
});

test('remover: um filtro largo mostra tudo o que pega e só libera digitando o número', async () => {
  const muitas = Array.from({ length: 30 }, (_, i) => faixa(100 + i, 'Vendex', `Faixa ${String(i).padStart(2, '0')}`));
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb, { faixas: [...FAIXAS, ...muitas] });
  const janela = await abrirBiblioteca();

  await janela.getByLabel('Remover No Escape').click();
  const dialogo = janela.getByTestId('dialogo-remover');
  await dialogo.getByTestId('filtro-remover').fill('artist:Vendex');
  await expect(dialogo.getByTestId('previa-resumo')).toHaveText('31 faixas · 31 arquivos');
  await expect(dialogo.getByTestId('remocao-em-massa')).toContainText('Atenção: este filtro pega 31 faixas');
  await dialogo.getByTestId('conferi').check();
  await expect(dialogo.getByTestId('apagar')).toBeDisabled();
  await dialogo.getByTestId('digitar-numero').fill('31');
  await expect(dialogo.getByTestId('apagar')).toBeEnabled();
  // desistir: nada foi apagado
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  expect(comandosDoBeets(amb, 'remove')).toHaveLength(0);
  await expect(janela.getByTestId('contagem')).toHaveText('35 de 35');
});

test('remover: um filtro perigoso é recusado antes de chegar ao beets', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb);
  const janela = await abrirBiblioteca();

  await janela.getByLabel('Remover No Escape').click();
  const dialogo = janela.getByTestId('dialogo-remover');
  await expect(dialogo.getByTestId('previa-resumo')).toBeVisible();
  for (const [filtro, mensagem] of [
    ['', /biblioteca inteira/],
    ['-f', /opções do beets/],
    ['title:"abc', /aspas/],
  ] as const) {
    await dialogo.getByTestId('filtro-remover').fill(filtro);
    await expect(dialogo.getByRole('alert')).toContainText(mensagem);
    await expect(dialogo.getByTestId('apagar')).toBeDisabled();
  }
  expect(comandosDoBeets(amb, 'remove')).toHaveLength(0);
});

test('sincronizar com o disco: mostra o que o beets esqueceria e só então esquece', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb);
  const janela = await abrirBiblioteca();

  // o usuário apagou um arquivo no Explorer: o beets ainda lembra dele
  const { rmSync } = await import('node:fs');
  rmSync(join(amb.projeto, 'music', 'Hard Techno', 'Azyr', 'Power.flac'));

  await janela.locator('[data-tarefa="update"]').click();
  const dialogo = janela.getByTestId('dialogo-manutencao');
  await expect(dialogo.getByText(/1 faixa será esquecida \(o arquivo não existe mais\)/)).toBeVisible();
  await expect(dialogo.getByTestId('previa-manutencao')).toContainText('Power');
  await capturar(janela, '05-sincronizar-previa');
  // a prévia foi um `update -p`: o beets ainda não esqueceu nada
  expect(comandosDoBeets(amb, 'update').filter((c) => c === 'update -p')).toHaveLength(1);
  expect(comandosDoBeets(amb, 'update').filter((c) => c === 'update')).toHaveLength(0);

  await dialogo.getByTestId('comecar-manutencao').click();
  await expect(dialogo.getByTestId('manutencao-andamento')).toHaveAttribute('data-fim', 'sim');
  await expect(dialogo.getByText('Concluído')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Fechar' }).click();
  await expect(linhas(janela)).toHaveCount(4);
  await expect(tabela(janela)).not.toContainText('Power');
});

test('importar o que sobrou em downloads/: lista, importa e a faixa entra na biblioteca', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb, { parados: true });
  const janela = await abrirBiblioteca();
  const parado = join(amb.projeto, 'downloads', 'f_hard', 'Vengeance Of The Masked.mp3');
  expect(existsSync(parado)).toBe(true);

  // o indicador e a tabela explicam o que está parado
  await janela.locator('[data-indicador="dl"]').click();
  await expect(janela.getByTestId('parados-vazio')).toContainText(
    'downloads/f_hard/ tem 1 arquivo que o beets não importou: Vengeance Of The Masked.mp3',
  );
  await janela.getByTestId('parados-vazio').getByRole('button', { name: 'Importar agora' }).click();

  const dialogo = janela.getByTestId('dialogo-manutencao');
  await expect(dialogo.getByTestId('parados-lista')).toContainText('downloads/f_hard');
  await capturar(janela, '05-importar-previa');
  await dialogo.getByTestId('comecar-manutencao').click();
  await expect(dialogo.getByTestId('manutencao-andamento')).toHaveAttribute('data-fim', 'sim');
  // o comando foi o `import -q -s` da pasta, e o beets moveu o que importou
  expect(comandosDoBeets(amb, 'import')).toEqual(['import -q -s /downloads/f_hard']);
  expect(existsSync(parado)).toBe(false);
  await dialogo.getByRole('button', { name: 'Fechar' }).click();

  await janela.locator('[data-indicador="dl"]').click(); // volta ao filtro "todas"
  await expect(valor(janela, 'dl')).toHaveText('0');
  await expect(janela.getByText(`${join(amb.projeto, 'music')} · 6 faixas`)).toBeVisible();
  await expect(tabela(janela)).toContainText('Vengeance Of The Masked');
});

test('recalcular tom e BPM: só das faixas sem, com a saída ao vivo', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb);
  const janela = await abrirBiblioteca();
  await expect(valor(janela, 'bpm')).toHaveText('1');
  await expect(valor(janela, 'tom')).toHaveText('1');

  await janela.locator('[data-tarefa="tomEBpm"]').click();
  const dialogo = janela.getByTestId('dialogo-manutencao');
  await expect(dialogo.getByText(/Hoje há 1 faixa sem BPM e 1 sem tom/)).toBeVisible();
  await dialogo.getByTestId('comecar-manutencao').click();
  await expect(dialogo.getByTestId('manutencao-andamento')).toHaveAttribute('data-fim', 'sim');
  const saida = dialogo.getByTestId('saida-manutencao');
  await expect(saida).toContainText('$ beet keyfinder');
  await expect(saida).toContainText('$ beet autobpm');
  await expect(saida).toContainText('found key Gm');
  await expect(saida).toContainText('computed BPM 140');
  await capturar(janela, '05-tom-e-bpm-concluido');
  await dialogo.getByRole('button', { name: 'Fechar' }).click();

  await expect(valor(janela, 'bpm')).toHaveText('0');
  await expect(valor(janela, 'tom')).toHaveText('0');
});

test('uma tarefa longa continua ao fechar a janela e o cartão Manutenção a reencontra', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  // 1,5 s por faixa a calcular (são duas): dá tempo de fechar a janela no meio
  montarBiblioteca(amb, { atrasoMs: 1500 });
  const janela = await abrirBiblioteca();

  await janela.locator('[data-tarefa="tomEBpm"]').click();
  const dialogo = janela.getByTestId('dialogo-manutencao');
  await dialogo.getByTestId('comecar-manutencao').click();
  await expect(dialogo.getByTestId('manutencao-andamento')).toHaveAttribute('data-fim', 'nao');
  await dialogo.getByRole('button', { name: 'Fechar' }).click();
  await expect(janela.getByTestId('dialogo-manutencao')).toHaveCount(0);

  // com uma tarefa rodando, as outras ficam desligadas
  await expect(janela.locator('[data-tarefa="update"]')).toBeDisabled();
  await expect(janela.locator('[data-tarefa="move"]')).toBeDisabled();
  await janela.getByTestId('ver-andamento').click();
  await expect(janela.getByTestId('manutencao-andamento')).toBeVisible();
  await expect(janela.getByTestId('manutencao-andamento')).toHaveAttribute('data-fim', 'sim', { timeout: 30_000 });
});

test('compartilhamento: mostra o que o slskd anuncia e pede a varredura', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  slskd = await iniciarSlskdFalso(amb, []);
  montarBiblioteca(amb);
  const janela = await abrirBiblioteca();

  await expect(janela.getByTestId('compartilhamento-n')).toContainText('10 arquivos anunciados no Soulseek');
  await janela.getByTestId('reescanear').click();
  await expect(janela.getByText('Pedi a varredura ao slskd.')).toBeVisible();
  await capturar(janela, '05-compartilhamento');
});

test('compartilhamento: com o slskd fora do ar o cartão explica e a tabela segue funcionando', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb);
  // aponta para uma porta onde ninguém escuta
  aberto = await abrirApp(amb, { SOULCRATE_SLSKD_URL: 'http://127.0.0.1:1' });
  const janela = aberto.janela;
  await menu(janela, 'Biblioteca').click();
  await expect(tabela(janela)).toBeVisible();
  await expect(janela.getByTestId('compartilhamento-erro')).toContainText('slskd');
  await expect(linhas(janela)).toHaveCount(5);
});

test('"Mostrar no Explorer" abre o arquivo certo e "Abrir music" abre a pasta', async () => {
  amb = criarAmbiente({ mundo: { containers: TODOS_NO_AR } });
  montarBiblioteca(amb);
  const janela = await abrirBiblioteca();
  const { app } = aberto as AppAberto;
  await registrarAberturas(app);
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __reveladas: string[] };
    g.__reveladas = [];
    shell.showItemInFolder = (caminho: string) => {
      g.__reveladas.push(caminho);
    };
  });

  await janela.getByLabel('Mostrar Tatakai no Explorer').click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { __reveladas: string[] }).__reveladas))
    .toEqual([join(amb.projeto, 'music', 'Hard Techno', 'Charlie Sparks', 'Tatakai.flac')]);

  await janela.getByRole('button', { name: /Abrir music no Explorer/ }).click();
  await expect.poll(() => abertos(app)).toEqual([join(amb.projeto, 'music')]);
});
