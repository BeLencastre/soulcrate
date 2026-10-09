// Fase 3, ponta a ponta: o download em lote no app de verdade (Electron), com o baixar-lista.ps1 de verdade e o PowerShell
// de verdade, contra um slskd falso (o mesmo da suíte Pester) e o dublê do docker. Nada aqui toca em Docker, na rede
// ou nos dados do usuário. Critérios de aceite (§5, Fase 3):
//   - uma lista de 30 faixas roda do começo ao fim pelo app com o mesmo resultado que pelo script (.bat);
//   - fechar o app no meio não interrompe o lote; reabrir mostra o progresso correto;
//   - parar pelo botão sempre gera resultado-*.txt e nao-baixadas-*.txt;
//   - tentar iniciar a mesma lista duas vezes (app + .bat) é recusado com mensagem clara.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { semBom } from '../../src/shared/texto';
import {
  abertos,
  abrirApp,
  abrirListaDosRecentes,
  ambienteDoLote,
  criarAmbiente,
  fecharApp,
  iniciarSlskdFalso,
  notificacoes,
  opcoesDeTeste,
  pararLotesRodando,
  registrarAberturas,
  TODOS_NO_AR,
  type Ambiente,
  type AppAberto,
  type ArquivoRemoto,
  type SlskdFalso,
  capturar,
} from './ajudantes';

let amb: Ambiente;
let aberto: AppAberto | null = null;
let slskds: SlskdFalso[] = [];
const ambientesExtras: Ambiente[] = [];

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  // um lote que o teste deixou rodando seguraria a pasta: para primeiro (com o slskd ainda de pé), depois fecha o resto
  for (const a of [amb, ...ambientesExtras]) await pararLotesRodando(a);
  await Promise.all(slskds.map((s) => s.fechar().catch(() => undefined)));
  slskds = [];
  amb?.limpar();
  for (const a of ambientesExtras.splice(0)) a.limpar();
});

const ARTISTAS = [
  'Alfa',
  'Bravo',
  'Charlie',
  'Delta',
  'Eco',
  'Foxtrot',
  'Golfe',
  'Hotel',
  'India',
  'Julieta',
  'Kilo',
  'Lima',
  'Mike',
  'Novembro',
  'Oscar',
  'Papa',
  'Quebec',
  'Romeu',
  'Sierra',
  'Tango',
  'Uniforme',
  'Victor',
  'Whisky',
  'Xadrez',
  'Yankee',
  'Zulu',
  'Aurora',
  'Boreal',
  'Cometa',
  'Dragao',
];
const TITULOS = [
  'Ouro',
  'Prata',
  'Bronze',
  'Ferro',
  'Cobre',
  'Zinco',
  'Chumbo',
  'Niquel',
  'Titanio',
  'Cromo',
  'Neon',
  'Argonio',
  'Helio',
  'Xenonio',
  'Radonio',
  'Litio',
  'Sodio',
  'Potassio',
  'Calcio',
  'Magnesio',
  'Silicio',
  'Carbono',
  'Oxigenio',
  'Nitrogenio',
  'Fosforo',
  'Enxofre',
  'Cloro',
  'Iodo',
  'Bromo',
  'Fluor',
];
const faixa = (i: number) => `${ARTISTAS[i]} - ${TITULOS[i]}`;
const remoto = (i: number, usuario = i % 2 ? 'u2' : 'u1'): ArquivoRemoto => ({
  usuario,
  arquivo: `@@${usuario}\\Music\\${ARTISTAS[i]}\\${faixa(i)}.flac`,
});

const resultadoDe = (projeto: string): string[] => {
  const lotes = join(projeto, 'lotes');
  const arq = readdirSync(lotes).find((f) => /^resultado-.+\.txt$/.test(f));
  if (!arq) throw new Error(`sem resultado em ${lotes}`);
  // o caminho da pasta de teste (que muda a cada execução) e o BOM do PowerShell 5.1 não fazem parte do resultado
  return semBom(readFileSync(join(lotes, arq), 'utf8'))
    .replaceAll(realpathSync.native(projeto), '<projeto>')
    .replaceAll(projeto, '<projeto>')
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
};

const arquivosEm = (projeto: string, prefixo: string): string[] =>
  readdirSync(join(projeto, 'lotes')).filter((f) => f.startsWith(prefixo));

/** Roda o baixar-lista.ps1 direto, como o .bat faz, e espera terminar. */
function rodarScript(a: Ambiente, args: string[], path: string): Promise<{ status: number | null; saida: string }> {
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
      { cwd: a.projeto, env: { ...process.env, PATH: path }, windowsHide: true },
    );
    let saida = '';
    filho.stdout.on('data', (d: Buffer) => (saida += d.toString('utf8')));
    filho.stderr.on('data', (d: Buffer) => (saida += d.toString('utf8')));
    filho.once('exit', (status) => resolve({ status, saida }));
  });
}

const contador = (janela: Page, k: string) => janela.locator(`[data-contador="${k}"] [data-valor]`);

// ---------------------------------------------------------------- Aceite 1

test('uma lista de 30 faixas roda do começo ao fim pelo app com o mesmo resultado que pelo script', async () => {
  test.setTimeout(420_000);
  // pasta com espaço e acento no nome: o pior caso para aspas e caminhos
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR }, nomeDaPasta: 'Meu Soulcrate é teste' });
  const catalogo = Array.from({ length: 27 }, (_, i) => remoto(i)); // as 3 últimas não existem no Soulseek
  const slskd = await iniciarSlskdFalso(amb, catalogo);
  slskds.push(slskd);
  const lista = ['# set de teste', ...Array.from({ length: 30 }, (_, i) => faixa(i))].join('\r\n');
  writeFileSync(join(amb.projeto, 'set.txt'), lista);

  // o mesmo lote pelo script, sem o app (o que o .bat faz), começa junto com o do app: o tempo é quase todo espera do
  // ritmo das buscas do próprio script, e as duas execuções são independentes
  const amb2 = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  ambientesExtras.push(amb2);
  const slskd2 = await iniciarSlskdFalso(amb2, catalogo);
  slskds.push(slskd2);
  writeFileSync(join(amb2.projeto, 'set.txt'), lista);
  const peloScript = rodarScript(
    amb2,
    ['-Lista', 'set.txt', '-SlskdUrl', slskd2.url, '-BuscasPorJanela', '60', '-SemCatalogo', '-SemBeets'],
    ambienteDoLote(amb2, slskd2).PATH as string,
  );

  const { app, janela } = (aberto = await abrirApp(amb, ambienteDoLote(amb, slskd)));
  await registrarAberturas(app);

  // 1. lista: a pré-visualização vem do próprio script
  await abrirListaDosRecentes(janela, 'set.txt');
  await expect(janela.getByTestId('editor-lista')).toHaveValue(lista.replace(/\r\n/g, '\n'));
  const previa = janela.getByRole('region', { name: 'Pré-visualização' });
  await expect(previa).toContainText('30 para baixar', { timeout: 60_000 });
  await expect(janela.getByTestId('rodape-contagem')).toContainText('30 faixas para baixar');
  await expect(janela.getByTestId('previa-lista')).toContainText('Alfa');
  await capturar(janela, 'f3-01-lista');

  // 2. opções: receita + interruptor + o limite de buscas (são 27 + 3×3 buscas, mais que as 30 por janela)
  await opcoesDeTeste(janela);
  await janela.getByRole('button', { name: /Avançadas/ }).click();
  for (let i = 0; i < 6; i++) await janela.getByRole('button', { name: 'Aumentar: Buscas a cada 220 s' }).click();
  await expect(janela.getByTestId('comando-equivalente')).toHaveText(
    'baixar-lista.bat set.txt -BuscasPorJanela 60 -SemCatalogo -SemBeets',
  );
  await expect(janela.getByTestId('resumo-opcoes')).toContainText('3 opções diferentes do padrão do script');
  await capturar(janela, 'f3-02-opcoes');

  // 3. execução: do começo ao fim, com o painel ao vivo
  await janela.getByTestId('iniciar-lote').click();
  await expect(janela.getByTestId('nome-da-lista')).toHaveText('set.txt');
  await expect(janela.getByTestId('cartao-lote')).toBeVisible();
  await capturar(janela, 'f3-03-execucao-comecando');
  await expect(janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'completed', { timeout: 180_000 });
  await capturar(janela, 'f3-04-execucao-concluida');

  await expect(janela.getByTestId('progresso-numero')).toHaveText('30/30');
  await expect(contador(janela, 'baixadas')).toHaveText('27');
  await expect(contador(janela, 'naoAchadas')).toHaveText('3');
  await expect(contador(janela, 'falhas')).toHaveText('0');
  await expect(janela.getByTestId('cartao-lote')).toHaveCount(0); // terminou: sai da barra lateral
  await expect(janela.getByText('Lote concluído', { exact: true })).toBeVisible();

  // a tabela mostra cada faixa com seu status, e o filtro "Atenção" só as que não vieram
  await janela.locator('[data-filtro="atencao"]').click();
  const tabela = janela.getByTestId('tabela-faixas');
  await expect(tabela).toContainText('Dragao');
  await expect(tabela.getByText('Não encontrada')).toHaveCount(3);
  await janela.locator('[data-filtro="todas"]').click();
  await janela.getByTestId('busca-faixas').fill('bravo');
  await expect(tabela).toContainText('Prata');
  await expect(tabela).toContainText('Baixada (não organizada)');
  await janela.getByTestId('busca-faixas').fill('');

  // o log bruto traz a saída do script
  await janela.getByRole('tab', { name: 'Log bruto' }).click();
  await expect(janela.getByTestId('log-bruto')).toContainText('Resumo');

  // a notificação do Windows ao terminar, com a contagem
  expect(await notificacoes(app)).toEqual([
    { tipo: 'fim', titulo: 'Lote concluído', corpo: 'set.txt: 27 baixadas · 3 não encontradas · 0 falhas' },
  ]);

  // os relatórios e os downloads estão onde sempre estiveram
  expect(arquivosEm(amb.projeto, 'resultado-')).toHaveLength(1);
  expect(arquivosEm(amb.projeto, 'nao-baixadas-')).toHaveLength(1);
  expect(arquivosEm(amb.projeto, 'diagnostico-')).toHaveLength(1);
  expect(arquivosEm(amb.projeto, 'eventos-')).toHaveLength(1);
  expect(
    readdirSync(join(amb.projeto, 'downloads'), { recursive: true }).filter((f) => String(f).endsWith('.flac')),
  ).toHaveLength(27);

  // "Abrir resultado" abre o arquivo certo
  await janela.getByRole('button', { name: 'Abrir resultado' }).click();
  await expect
    .poll(() => abertos(app))
    .toEqual([join(amb.projeto, 'lotes', arquivosEm(amb.projeto, 'resultado-')[0] as string)]);

  // 4. o mesmo lote pelo script, sem o app (o que o .bat faz), já terminou: resultado idêntico
  const r = await peloScript;
  expect(r.status).toBe(0);
  expect(resultadoDe(amb.projeto)).toEqual(resultadoDe(amb2.projeto));
  expect(resultadoDe(amb.projeto).filter((l) => l.startsWith('BAIXADA'))).toHaveLength(27);
  expect(readFileSync(join(amb.projeto, 'lotes', arquivosEm(amb.projeto, 'nao-baixadas-')[0] as string), 'utf8')).toBe(
    readFileSync(join(amb2.projeto, 'lotes', arquivosEm(amb2.projeto, 'nao-baixadas-')[0] as string), 'utf8'),
  );
});

// ---------------------------------------------------------------- Aceite 2, 3 e 4

test('fechar o app no meio não interrompe o lote; reabrir mostra o progresso; parar grava os relatórios; a mesma lista não roda duas vezes', async () => {
  test.setTimeout(420_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  // duas faixas saem na hora; duas ficam na fila de um usuário lento (nunca terminam); uma não existe
  const catalogo: ArquivoRemoto[] = [remoto(0, 'u1'), remoto(1, 'u1'), remoto(2, 'lento'), remoto(3, 'lento')];
  const slskd = await iniciarSlskdFalso(amb, catalogo, { usuariosLentos: ['lento'] });
  slskds.push(slskd);
  const lista = [0, 1, 2, 3].map(faixa).concat(['Fulano - Inexistente']).join('\r\n');
  writeFileSync(join(amb.projeto, 'set.txt'), lista);
  const extras = ambienteDoLote(amb, slskd);

  // inicia pelo app
  let sessao = (aberto = await abrirApp(amb, extras));
  await abrirListaDosRecentes(sessao.janela, 'set.txt');
  await expect(sessao.janela.getByRole('region', { name: 'Pré-visualização' })).toContainText('5 para baixar', {
    timeout: 60_000,
  });
  await opcoesDeTeste(sessao.janela);
  await sessao.janela.getByTestId('iniciar-lote').click();
  await expect(sessao.janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'rodando', {
    timeout: 30_000,
  });

  // espera o lote chegar ao ponto estável: 2 baixadas, 1 não encontrada, 2 na fila do usuário lento
  await expect(contador(sessao.janela, 'baixadas')).toHaveText('2', { timeout: 120_000 });
  await expect(contador(sessao.janela, 'naoAchadas')).toHaveText('1', { timeout: 120_000 });
  await expect(contador(sessao.janela, 'naFila')).toHaveText('2', { timeout: 120_000 });
  await capturar(sessao.janela, 'f3-05-execucao-na-fila');
  const runId = (
    await sessao.janela
      .locator('.lbl', { hasText: /execução \d{8}-\d{6}/ })
      .first()
      .innerText()
  ).match(/\d{8}-\d{6}(-\d+)?/)?.[0] as string;
  expect(runId).toBeTruthy();

  // tentar iniciar a mesma lista de novo (o que um segundo clique, ou o .bat, faria) é recusado com mensagem clara
  const recusa = await sessao.janela.evaluate(() =>
    (window as unknown as { soulcrate: { batch: { start(e: unknown): Promise<unknown> } } }).soulcrate.batch.start({
      lista: 'set.txt',
      opcoes: {},
    }),
  );
  expect(recusa).toMatchObject({
    ok: false,
    erro: { codigo: 'lote.lista-rodando', titulo: 'set.txt já está rodando' },
  });
  const pelaLinhaDeComando = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(amb.projeto, 'baixar-lista.ps1'),
      '-Lista',
      'set.txt',
      '-SlskdUrl',
      slskd.url,
      '-SemBeets',
      '-SemCatalogo',
    ],
    { cwd: amb.projeto, env: { ...process.env, PATH: extras.PATH as string }, encoding: 'utf8' },
  );
  expect(pelaLinhaDeComando.status).toBe(5); // "esta lista já está sendo baixada por outro processo"
  expect(pelaLinhaDeComando.stdout + pelaLinhaDeComando.stderr).toMatch(/ja esta sendo baixada/);
  // e a tela da lista avisa e não deixa iniciar
  await sessao.janela.getByRole('navigation', { name: 'Etapas do lote' }).getByRole('link', { name: /Lista/ }).click();
  await expect(sessao.janela.getByText('Esta lista está rodando agora.')).toBeVisible();
  await expect(sessao.janela.getByTestId('iniciar-lote')).toBeDisabled();

  // fecha o app no meio: o lote continua (a trava segue de pé e o processo, vivo)
  await fecharApp(sessao.app);
  aberto = null;
  const trava = readdirSync(join(amb.projeto, 'lotes')).find((f) => f.endsWith('.lock'));
  expect(trava).toBeTruthy();
  await new Promise((r) => setTimeout(r, 3000));
  expect(readdirSync(join(amb.projeto, 'lotes')).some((f) => f.endsWith('.lock'))).toBe(true);
  expect(arquivosEm(amb.projeto, 'resultado-')).toHaveLength(0); // ainda rodando: sem relatórios

  // reabre: reconecta sozinho e mostra o progresso correto, sem o usuário fazer nada
  sessao = aberto = await abrirApp(amb, extras);
  await registrarAberturas(sessao.app);
  await expect(sessao.janela.getByTestId('cartao-lote')).toBeVisible({ timeout: 30_000 });
  await expect(sessao.janela.getByTestId('cartao-lote')).toContainText('set.txt');
  await expect(sessao.janela.getByTestId('cartao-lote-inicio')).toContainText('Lote rodando');
  await sessao.janela.getByTestId('cartao-lote').click();
  await expect(sessao.janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'rodando');
  await expect(sessao.janela.getByTestId('nome-da-lista')).toHaveText('set.txt');
  await expect(contador(sessao.janela, 'baixadas')).toHaveText('2');
  await expect(contador(sessao.janela, 'naoAchadas')).toHaveText('1');
  await expect(contador(sessao.janela, 'naFila')).toHaveText('2');
  await expect(sessao.janela.getByTestId('progresso-numero')).toHaveText('3/5');
  await expect(sessao.janela.getByTestId('tabela-faixas')).toContainText('Na fila do usuário');
  await capturar(sessao.janela, 'f3-06-reconectado');

  // parar pelo botão: finaliza e grava os relatórios
  await sessao.janela.getByTestId('parar-lote').click();
  await expect(sessao.janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'user', { timeout: 90_000 });
  await expect(sessao.janela.getByText('Relatórios gravados em lotes/')).toBeVisible();
  await capturar(sessao.janela, 'f3-07-parado');
  expect(arquivosEm(amb.projeto, 'resultado-')).toHaveLength(1);
  expect(arquivosEm(amb.projeto, 'nao-baixadas-')).toHaveLength(1);
  expect(readdirSync(join(amb.projeto, 'lotes')).some((f) => f.endsWith('.lock'))).toBe(false); // a trava foi solta
  expect(existsSync(join(amb.projeto, 'lotes', `parar-${runId}.flag`))).toBe(false); // e o arquivo-sinal apagado
  const naoBaixadas = readFileSync(
    join(amb.projeto, 'lotes', arquivosEm(amb.projeto, 'nao-baixadas-')[0] as string),
    'utf8',
  );
  expect(naoBaixadas).toContain('Fulano - Inexistente');

  // a notificação de "parado" saiu pelo app que reconectou (o que iniciou o lote já estava fechado)
  expect((await notificacoes(sessao.app)).map((n) => n.titulo)).toEqual(['Lote parado']);
  // sem lote rodando, a mesma lista pode ser iniciada de novo
  await sessao.janela.getByRole('navigation', { name: 'Etapas do lote' }).getByRole('link', { name: /Lista/ }).click();
  await expect(sessao.janela.getByText('Esta lista está rodando agora.')).toHaveCount(0);
});

// ---------------------------------------------------------------- Editor, importação e arrastar e soltar

test('editor: digitar salva e atualiza a pré-visualização; criar do exemplo; importar CSV arrastando para a janela', async () => {
  test.setTimeout(180_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  const slskd = await iniciarSlskdFalso(amb, [remoto(0), remoto(1)]);
  slskds.push(slskd);
  const { janela } = (aberto = await abrirApp(amb, ambienteDoLote(amb, slskd)));

  // sem nenhuma lista: o convite para escolher uma
  await janela.getByRole('link', { name: 'Baixar lista' }).click();
  await expect(janela.getByTestId('lista-vazia')).toBeVisible();
  await capturar(janela, 'f3-08-sem-lista');

  // criar a partir do exemplo (copia o lista.exemplo.txt da pasta)
  await janela.getByRole('button', { name: 'Nova a partir do exemplo' }).first().click();
  const editor = janela.getByTestId('editor-lista');
  await expect(editor).toHaveValue(/Uma faixa por linha/);
  const nome = (await janela.getByTestId('nome-da-lista').innerText()).trim();
  expect(nome).toMatch(/^lista-\d{4}-\d{2}-\d{2}\.txt$/);
  expect(existsSync(join(amb.projeto, nome))).toBe(true);

  // digitar: salva sozinho (CRLF, UTF-8) e a pré-visualização acompanha, marcando a duplicada
  await editor.fill([faixa(0), faixa(1), faixa(0), 'Sem traço aqui', '01. Charlie – Bronze 3:45'].join('\n'));
  await expect(janela.getByTestId('estado-salvamento')).toContainText('alterações não salvas');
  const previa = janela.getByRole('region', { name: 'Pré-visualização' });
  await expect(previa).toContainText('4 para baixar', { timeout: 60_000 });
  await expect(previa).toContainText('1 duplicada');
  await expect(janela.getByTestId('previa-lista')).toContainText('Duplicada · linha 1');
  await expect(janela.getByTestId('previa-lista')).toContainText('Falta o " - "');
  await expect(janela.getByTestId('estado-salvamento')).not.toContainText('não salvas');
  const noDisco = readFileSync(join(amb.projeto, nome), 'utf8');
  expect(noDisco).toBe([faixa(0), faixa(1), faixa(0), 'Sem traço aqui', '01. Charlie – Bronze 3:45'].join('\r\n'));
  // as linhas ganham o quadradinho da cor do que o lote vai fazer
  await expect(janela.locator('[data-testid="editor-gutter"] [data-marcador="laranja"]')).toHaveCount(2);
  await capturar(janela, 'f3-09-editor');

  // arrastar um CSV do Spotify para a janela: importa, abre e analisa pelas colunas
  await janela.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(
      new File(['Track Name,Artist Name(s),Album\nOuro,Alfa,X\nPrata,Bravo,Y\n'], 'spotify do dj.csv', {
        type: 'text/csv',
      }),
    );
    for (const tipo of ['dragenter', 'dragover'])
      window.dispatchEvent(new DragEvent(tipo, { dataTransfer: dt, bubbles: true, cancelable: true }));
    (window as unknown as { __dt: DataTransfer }).__dt = dt;
  });
  await expect(janela.getByTestId('area-de-soltar')).toBeVisible();
  await capturar(janela, 'f3-10-soltar');
  await janela.evaluate(() => {
    const dt = (window as unknown as { __dt: DataTransfer }).__dt;
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(janela.getByTestId('area-de-soltar')).toHaveCount(0);
  await expect(janela.getByTestId('nome-da-lista')).toHaveText('spotify do dj.csv');
  expect(existsSync(join(amb.projeto, 'spotify do dj.csv'))).toBe(true);
  await expect(janela.getByTestId('previa-lista')).toContainText('Bravo', { timeout: 60_000 });
  await expect(janela.getByTestId('editor-lista')).toHaveAttribute('readonly', '');
  await expect(janela.getByText(/Lista em CSV: o app só lê/)).toBeVisible();

  // arrastar o que não é lista: avisa, sem importar nada
  await janela.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'foto.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(janela.getByTestId('erro-lista')).toContainText('Só arquivos .txt e .csv podem ser importados.');
  expect(existsSync(join(amb.projeto, 'foto.png'))).toBe(false);

  // as listas recentes mostram as três
  await janela.getByRole('button', { name: 'Listas recentes' }).click();
  const recentes = janela.getByTestId('dialogo-recentes');
  await expect(recentes).toContainText('spotify do dj.csv');
  await expect(recentes).toContainText(nome);
});

// ---------------------------------------------------------------- Stack desligada

test('stack desligada: pergunta, liga a stack, espera ficar saudável e começa sozinho', async () => {
  test.setTimeout(180_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: {} } }); // nada no ar
  const slskd = await iniciarSlskdFalso(amb, [remoto(0), remoto(1)]);
  slskds.push(slskd);
  writeFileSync(join(amb.projeto, 'pequena.txt'), [faixa(0), faixa(1)].join('\r\n'));
  const { janela } = (aberto = await abrirApp(amb, ambienteDoLote(amb, slskd)));

  await abrirListaDosRecentes(janela, 'pequena.txt');
  await expect(janela.getByRole('region', { name: 'Pré-visualização' })).toContainText('2 para baixar', {
    timeout: 60_000,
  });
  await opcoesDeTeste(janela);
  await janela.getByTestId('iniciar-lote').click();

  const dialogo = janela.getByTestId('dialogo-iniciar');
  await expect(dialogo).toContainText('A stack não está no ar');
  await capturar(janela, 'f3-11-ligar-stack');
  expect(amb.chamadas().some((c) => c.includes(' up '))).toBe(false); // nada foi ligado sem perguntar
  await dialogo.getByRole('button', { name: 'Ligar e começar' }).click();
  await expect(dialogo).toContainText('Ligando a stack…');

  await expect(janela.getByTestId('estado-do-lote')).toHaveAttribute('data-estado', 'completed', { timeout: 150_000 });
  expect(amb.chamadas().some((c) => c.includes(' up '))).toBe(true);
  await expect(contador(janela, 'baixadas')).toHaveText('2');
});

// ---------------------------------------------------------------- Segurança

test('o renderer não consegue iniciar um lote com opção desconhecida nem ler uma lista fora da pasta do Soulcrate', async () => {
  test.setTimeout(90_000);
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  writeFileSync(join(amb.raiz, 'segredo.txt'), 'não me leia');
  const { janela } = (aberto = await abrirApp(amb));

  const tentar = (corpo: string) =>
    janela.evaluate(async (c) => {
      const api = (
        window as unknown as { soulcrate: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> }
      ).soulcrate;
      try {
        return { ok: true, valor: await new Function('api', `return ${c}`)(api) };
      } catch (e) {
        return { ok: false, erro: String(e) };
      }
    }, corpo);

  expect(await tentar("api.lists.read('..\\\\segredo.txt')")).toMatchObject({
    ok: false,
    erro: expect.stringContaining('inválido'),
  });
  expect(await tentar("api.lists.read('../segredo.txt')")).toMatchObject({ ok: false });
  expect(await tentar("api.lists.save('..\\\\x.txt', 'x')")).toMatchObject({ ok: false });
  expect(await tentar("api.batch.start({ lista: 'a.txt', opcoes: { Rm: true } })")).toMatchObject({ ok: false });
  expect(await tentar("api.batch.start({ lista: 'a.txt', opcoes: { Paralelo: '8; calc' } })")).toMatchObject({
    ok: false,
  });
  expect(await tentar("api.batch.stop('..\\\\..\\\\x')")).toMatchObject({ ok: false });
  expect(await tentar("api.batch.openFile('20260101-000000', 'segredo')")).toMatchObject({ ok: false });
  expect(existsSync(join(amb.raiz, 'x.txt'))).toBe(false);
});
