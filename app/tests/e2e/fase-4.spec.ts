// Fase 4, ponta a ponta: o histórico e o diagnóstico no app de verdade (Electron), com o baixar-lista.ps1 de verdade e o
// PowerShell de verdade, contra um slskd falso (o mesmo da suíte Pester) e o dublê do docker. Nada aqui toca em Docker,
// na rede, na Lixeira ou nos dados do usuário. Critérios de aceite (§5, Fase 4):
//   - para cada motivo da tabela do README, o app mostra a ação correspondente (conferido por tabela em
//     tests/motivos.test.ts; aqui, o motivo real de um lote real);
//   - corrigir um título pela sugestão e tentar de novo baixa a faixa sem editar arquivo à mão.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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
  type SlskdFalso,
} from './ajudantes';

const CAPTURAS = join(import.meta.dirname, '..', '..', 'test-results', 'capturas');
mkdirSync(CAPTURAS, { recursive: true });
const capturar = (janela: Page, nome: string) => janela.screenshot({ path: join(CAPTURAS, `${nome}.png`) });

let amb: Ambiente;
let aberto: AppAberto | null = null;
let slskds: SlskdFalso[] = [];

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  await pararLotesRodando(amb);
  await Promise.all(slskds.map((s) => s.fechar().catch(() => undefined)));
  slskds = [];
  amb?.limpar();
});

/** Sem Lixeira de verdade (apagar é rm) e sem lote de beets: o app que o teste abre. */
const extrasDoHistorico = (a: Ambiente, s: SlskdFalso): Record<string, string> => ({
  ...ambienteDoLote(a, s),
  SOULCRATE_DUBLE_LIXEIRA: '1',
});

const contador = (janela: Page, k: string) => janela.locator(`[data-contador="${k}"] [data-valor]`);
const lotes = (a: Ambiente) => join(a.projeto, 'lotes');
const arquivosEm = (a: Ambiente, prefixo: string): string[] =>
  existsSync(lotes(a)) ? readdirSync(lotes(a)).filter((f) => f.startsWith(prefixo)) : [];

/** Roda o baixar-lista.ps1 direto, como o .bat faz (sem eventos), e espera terminar. */
function rodarScript(a: Ambiente, args: string[], path: string): Promise<number | null> {
  return new Promise((resolve) => {
    const filho = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(a.projeto, 'baixar-lista.ps1'),
        ...args,
      ],
      { cwd: a.projeto, env: { ...process.env, PATH: path }, windowsHide: true, stdio: 'ignore' },
    );
    filho.once('exit', (status) => resolve(status));
  });
}

/** Registra os caminhos que o app mandou mostrar no Explorer (nenhuma janela do Explorer abre durante o teste). */
async function registrarReveladas(app: AppAberto['app']): Promise<void> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __reveladas: string[] };
    g.__reveladas = [];
    shell.showItemInFolder = (caminho: string) => {
      g.__reveladas.push(caminho);
    };
  });
}
const reveladas = (app: AppAberto['app']) =>
  app.evaluate(() => (globalThis as unknown as { __reveladas?: string[] }).__reveladas ?? []);

/** O item do menu lateral (a tela de detalhe também tem um link "Histórico", para voltar). */
const menu = (janela: Page, nome: string) =>
  janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: nome });

const linhaDe = (janela: Page, lista: string) =>
  janela.getByTestId('linha-execucao').filter({ has: janela.getByRole('link', { name: lista, exact: true }) });

// ---------------------------------------------------------------- Aceite 2: corrigir pela sugestão e tentar de novo

test('corrigir o título pela sugestão e tentar de novo baixa a faixa, sem editar arquivo à mão', async () => {
  test.setTimeout(420_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  // "Dark Power" não existe; o artista tem "Dark Tower" (uma letra errada na primeira palavra que o script não perdoa)
  const slskd = await iniciarSlskdFalso(amb, [
    { usuario: 'u1', arquivo: '@@u1\\Music\\Alfa\\Alfa - Ouro.flac' },
    { usuario: 'u1', arquivo: '@@u1\\Music\\Vendex\\Vendex - Dark Tower.flac' },
  ]);
  slskds.push(slskd);
  writeFileSync(join(amb.projeto, 'set.txt'), ['# set de teste', 'Alfa - Ouro', 'Vendex - Dark Power'].join('\r\n'));

  const { app, janela } = (aberto = await abrirApp(amb, extrasDoHistorico(amb, slskd)));
  await registrarReveladas(app);

  // sem nenhuma execução, o histórico é um convite para baixar uma lista
  await menu(janela, 'Histórico').click();
  await expect(janela.getByTestId('historico-vazio')).toContainText('Nenhuma execução ainda');
  await capturar(janela, 'f4-01-historico-vazio');

  // 1. o lote de verdade: uma faixa vem, a outra não (o título da lista está errado)
  await abrirListaDosRecentes(janela, 'set.txt');
  await expect(janela.getByRole('region', { name: 'Pré-visualização' })).toContainText('2 para baixar', {
    timeout: 60_000,
  });
  await opcoesDeTeste(janela);
  await janela.getByTestId('iniciar-lote').click();
  await expect(janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'completed', { timeout: 180_000 });
  await expect(contador(janela, 'baixadas')).toHaveText('1');
  await expect(contador(janela, 'naoAchadas')).toHaveText('1');

  // 2. o histórico mostra a execução, que o app acabou de gravar
  await menu(janela, 'Histórico').click();
  const linha = linhaDe(janela, 'set.txt');
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText('Concluído');
  await expect(linha).toContainText('1 na biblioteca · 1 não veio · 0 puladas');
  await expect(linha).toContainText('Hoje');
  await expect(janela.locator('[data-filtro="faltas"]')).toContainText('1');
  await capturar(janela, 'f4-02-historico');

  // 3. o detalhe: as duas faixas, com o arquivo baixado (o lote rodou "só baixar") e o "Por quê?" da que não veio
  await linha.getByRole('link', { name: 'Abrir' }).click();
  await expect(janela.getByTestId('nome-da-lista')).toHaveText('set.txt');
  await expect(janela.getByTestId('fim-da-execucao')).toContainText('Concluído');
  const tabela = janela.getByTestId('tabela-faixas');
  await expect(tabela).toContainText('Alfa');
  await expect(tabela).toContainText('downloads/Alfa/Alfa - Ouro.flac');
  await expect(tabela).toContainText('ainda em downloads/ (não organizada)');
  await expect(janela.locator('[data-valor="bib"]')).toHaveText('1');
  await expect(janela.locator('[data-valor="nao-encontradas"]')).toHaveText('1');
  await expect(janela.getByTestId('relatorios')).toContainText('A linha que faltou');
  await expect(janela.getByTestId('opcoes-usadas')).toHaveText('-SemCatalogo -SemBeets');
  await capturar(janela, 'f4-03-detalhe');

  // "Mostrar no Explorer" pede ao sistema o arquivo certo
  await tabela.getByRole('button', { name: /Mostrar no Explorer: Alfa - Ouro/ }).click();
  await expect.poll(() => reveladas(app)).toEqual([join(amb.projeto, 'downloads', 'Alfa', 'Alfa - Ouro.flac')]);

  // 4. o diagnóstico da faixa que não veio
  await janela.getByTestId('tentar-de-novo').click();
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('1 faixa não veio');
  await expect(janela.getByTestId('titulo-da-faixa')).toContainText('Vendex – Dark Power');
  await expect(janela.getByTestId('motivos')).toContainText('Título diferente');
  await expect(janela.getByTestId('motivos')).toContainText('Escolha um dos títulos sugeridos acima');
  await expect(janela.getByTestId('talvez-seja')).toContainText('Dark Tower');
  await expect(janela.getByTestId('arquivos-parecidos')).toContainText('Vendex - Dark Tower.flac');
  await expect(janela.getByTestId('catalogo')).toContainText('Catálogo de Vendex no Soulseek');
  await expect(janela.getByTestId('linha-na-lista')).toHaveText('linha 3 de set.txt', { timeout: 60_000 });
  await capturar(janela, 'f4-04-diagnostico');

  // 5. clicar na sugestão corrige a linha: na lista e no "tentar de novo"
  await janela.getByRole('button', { name: 'Dark Tower', exact: true }).click();
  await expect(janela.getByTestId('corrigida')).toContainText('Corrigida');
  await expect(janela.getByTestId('nova-linha')).toHaveText('Vendex - Dark Tower');
  await expect(janela.getByTestId('situacao-da-lista')).toContainText('set.txt também foi atualizada (linha 3)');
  expect(readFileSync(join(amb.projeto, 'set.txt'), 'utf8')).toBe(
    ['# set de teste', 'Alfa - Ouro', 'Vendex - Dark Tower'].join('\r\n'),
  );
  await capturar(janela, 'f4-05-corrigida');

  // 6. "tentar de novo": gera a lista das que faltaram e abre as opções com o que o lote usou
  await expect(janela.getByTestId('rodape-tentar-de-novo')).toContainText('Tentar de novo a faixa');
  await janela.getByTestId('revisar-e-tentar').click();
  const nomeDaRetentativa = arquivosEm(amb, 'eventos-')
    .map((f) => /^eventos-(.+)\.jsonl$/.exec(f)?.[1])
    .map((id) => `nao-baixadas-${id}.txt`)[0] as string;
  await expect(janela.getByTestId('comando-equivalente')).toHaveText(
    `baixar-lista.bat ${nomeDaRetentativa} -SemCatalogo -SemBeets`,
  );
  expect(readFileSync(join(amb.projeto, nomeDaRetentativa), 'utf8')).toBe('Vendex - Dark Tower');
  await capturar(janela, 'f4-06-tentar-de-novo-opcoes');

  // 7. a segunda execução baixa a faixa (sem ninguém ter editado nenhum arquivo)
  await janela.getByTestId('iniciar-lote').click();
  await expect(janela.getByTestId('nome-da-lista')).toHaveText(nomeDaRetentativa);
  await expect(janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'completed', { timeout: 180_000 });
  await expect(contador(janela, 'baixadas')).toHaveText('1');
  await expect(contador(janela, 'naoAchadas')).toHaveText('0');
  expect(existsSync(join(amb.projeto, 'downloads', 'Vendex', 'Vendex - Dark Tower.flac'))).toBe(true);

  // 8. o histórico agora tem as duas execuções, a nova sem faltas
  await menu(janela, 'Histórico').click();
  await expect(janela.getByTestId('linha-execucao')).toHaveCount(2);
  const nova = linhaDe(janela, nomeDaRetentativa);
  await expect(nova).toContainText('1 na biblioteca · 0 não vieram · 0 puladas');
  await expect(nova.getByRole('link', { name: 'Ver faltas' })).toHaveCount(0);
  await janela.locator('[data-filtro="faltas"]').click();
  await expect(janela.getByTestId('linha-execucao')).toHaveCount(1);
  await capturar(janela, 'f4-07-historico-duas');

  // 9. reprocessar a lista do zero: pede confirmação e manda a memória para a Lixeira
  await janela.locator('[data-filtro="todas"]').click();
  await linhaDe(janela, 'set.txt').getByRole('link', { name: 'Abrir' }).click();
  expect(existsSync(join(lotes(amb), 'estado-set.tsv'))).toBe(true);
  await janela.getByTestId('reprocessar').click();
  await expect(janela.getByTestId('dialogo-reprocessar')).toContainText('apagar a memória de set.txt');
  await capturar(janela, 'f4-08-reprocessar');
  expect(existsSync(join(lotes(amb), 'estado-set.tsv'))).toBe(true); // ainda não: falta confirmar
  await janela.getByTestId('confirmar-reprocessar').click();
  await expect(janela.getByTestId('aviso-detalhe')).toContainText('A memória de set.txt foi para a Lixeira');
  expect(existsSync(join(lotes(amb), 'estado-set.tsv'))).toBe(false);
  await expect(janela.getByTestId('reprocessar')).toBeDisabled(); // já não há memória
});

// ---------------------------------------------------------------- Execuções do .bat e limpeza

test('as execuções do .bat aparecem (lidas do resultado-*.txt), e apagar as antigas pede prévia e confirmação', async () => {
  test.setTimeout(300_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  const slskd = await iniciarSlskdFalso(amb, [{ usuario: 'u1', arquivo: '@@u1\\Music\\Alfa\\Alfa - Ouro.flac' }]);
  slskds.push(slskd);
  const extras = extrasDoHistorico(amb, slskd);
  writeFileSync(join(amb.projeto, 'antiga.txt'), ['Alfa - Ouro', 'Fulano - Inexistente'].join('\r\n'));

  // uma execução do .bat de verdade (sem eventos) e duas bem antigas (de 2024)
  const codigo = await rodarScript(
    amb,
    ['-Lista', 'antiga.txt', '-SlskdUrl', slskd.url, '-SemCatalogo', '-SemBeets'],
    extras.PATH as string,
  );
  expect(codigo).toBe(0);
  expect(arquivosEm(amb, 'eventos-')).toHaveLength(0);
  for (const id of ['20240101-100000', '20240215-180000']) {
    writeFileSync(join(lotes(amb), `resultado-${id}.txt`), 'BAIXADA\tOutro - Faixa\tC:\\x\\Outro - Faixa.flac\r\n');
    writeFileSync(join(lotes(amb), `execucao-${id}.log`), 'tela');
  }

  const { janela } = (aberto = await abrirApp(amb, extras));
  await menu(janela, 'Histórico').click();
  await expect(janela.getByTestId('linha-execucao')).toHaveCount(3);
  const doBat = janela.getByTestId('linha-execucao').first(); // a mais recente: a que acabou de rodar
  await expect(doBat).toContainText('antiga · lida do resultado-*.txt');
  await expect(doBat).toContainText('Concluído');
  await expect(doBat).toContainText('1 na biblioteca · 1 não veio · 0 puladas');
  await expect(doBat).toContainText('lista não registrada');
  await capturar(janela, 'f4-09-historico-bat');

  // o detalhe e o diagnóstico vêm do resultado e do diagnostico-*.txt
  await doBat.getByRole('link', { name: 'Ver faltas' }).click();
  await expect(janela.getByRole('heading', { level: 1 })).toHaveText('1 faixa não veio');
  await expect(janela.getByTestId('titulo-da-faixa')).toContainText('Fulano – Inexistente');
  await expect(janela.getByTestId('motivos')).toContainText('0 respostas');
  await expect(janela.getByTestId('motivos')).toContainText('Confira a grafia do artista, tente outro dia ou compre');
  // a "tentar de novo" também funciona para elas
  await expect(janela.getByTestId('rodape-tentar-de-novo')).toContainText('Tentar de novo a faixa');
  await janela.getByRole('link', { name: /· hoje, \d\d:\d\d/ }).click();
  await expect(janela.getByTestId('opcoes-usadas')).toContainText('não registradas');
  await expect(janela.getByTestId('reprocessar')).toBeDisabled(); // não se sabe qual era a lista

  // apagar as antigas: a prévia diz o que vai sair e nada sai antes de confirmar
  await menu(janela, 'Histórico').click();
  await janela.getByRole('button', { name: 'Apagar execuções antigas…' }).click();
  await janela.getByLabel('Mais antigas que 30 dias').check();
  await expect(janela.getByTestId('previa-limpeza')).toHaveText(/^2 execuções · 4 arquivos · \d+ B$/);
  await capturar(janela, 'f4-10-apagar-antigas');
  expect(arquivosEm(amb, 'resultado-20240101-100000')).toHaveLength(1); // nada saiu antes de confirmar
  await janela.getByTestId('confirmar-limpeza').click();
  await expect(janela.getByTestId('aviso-historico')).toContainText('2 execuções foram para a Lixeira');
  await expect(janela.getByTestId('linha-execucao')).toHaveCount(1);
  expect(arquivosEm(amb, 'resultado-2024')).toHaveLength(0);
  expect(arquivosEm(amb, 'execucao-2024')).toHaveLength(0);
  // a execução recente e os relatórios dela ficam
  expect(arquivosEm(amb, 'resultado-')).toHaveLength(1);
});
