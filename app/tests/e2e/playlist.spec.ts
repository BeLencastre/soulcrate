// Importação de playlist, ponta a ponta (protótipos "importacao-playlist"): no app de verdade, com as respostas do
// Deezer vindas de um duble (SOULCRATE_DUBLE_PLAYLISTS), nada sai para a internet. Confere o arquivo gravado na pasta
// do Soulcrate, a primeira linha com a origem, "Atualizar da playlist" e a acessibilidade (axe) de cada estado.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { abrirApp, capturar, criarAmbiente, fecharApp, TODOS_NO_AR, type Ambiente, type AppAberto } from './ajudantes';

let amb: Ambiente;
let aberto: AppAberto | null = null;

test.afterEach(async () => {
  if (aberto) await fecharApp(aberto.app);
  aberto = null;
  amb.limpar();
});

const API = 'https://api.deezer.com/playlist/908622995';
const faixa = (artista: string, titulo: string) => ({ title: titulo, artist: { name: artista }, duration: 300 });

function respostas(faixas: object[]) {
  return {
    [API]: {
      corpo: JSON.stringify({ title: 'Hard Techno Sexta', nb_tracks: faixas.length, creator: { name: 'belen' } }),
    },
    [`${API}/tracks`]: { corpo: JSON.stringify({ data: faixas, total: faixas.length }) },
  };
}

test('importar uma playlist do Deezer pelo link, revisar e atualizar depois', async () => {
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  const duble = join(amb.raiz, 'playlists.json');
  writeFileSync(
    duble,
    JSON.stringify(
      respostas([faixa('Azyr', 'No Escape'), faixa('Azyr', 'No Escape'), faixa('Creeds', 'Push Up (Original Mix)')]),
    ),
  );
  const { janela } = (aberto = await abrirApp(amb, { SOULCRATE_DUBLE_PLAYLISTS: duble }));
  await janela.getByRole('link', { name: 'Baixar lista' }).click();

  // 1 · nenhuma lista aberta: a grade de streamings
  const grade = janela.getByTestId('grade-streamings');
  await expect(grade).toBeVisible();
  await expect(grade.getByRole('button')).toHaveText([/Spotify/, /Apple Music/, /YouTube Music/, /Deezer/]);
  await capturar(janela, 'playlist-1-nenhuma-lista');

  // 2 · o diálogo, já no Deezer; um link de faixa é recusado na hora
  await grade.getByRole('button', { name: /Deezer/ }).click();
  const dialogo = janela.getByTestId('dialogo-playlist');
  await expect(dialogo.getByRole('radio', { name: /Deezer/ })).toBeChecked();
  await capturar(janela, 'playlist-2-dialogo');
  await janela.getByTestId('link-playlist').fill('https://www.deezer.com/br/track/3135556');
  await expect(dialogo.getByRole('alert')).toContainText('Esse link é de uma faixa');
  await expect(janela.getByTestId('buscar-playlist')).toBeDisabled();
  await capturar(janela, 'playlist-5c-link-de-faixa');

  // 3 · a revisão
  await janela.getByTestId('link-playlist').fill('https://www.deezer.com/br/playlist/908622995?utm_source=x');
  await janela.getByTestId('buscar-playlist').click();
  await expect(janela.getByTestId('nome-da-playlist')).toHaveText('Hard Techno Sexta');
  await expect(janela.getByTestId('resumo-revisao')).toContainText('2 para baixar');
  await expect(janela.getByTestId('resumo-revisao')).toContainText('1 duplicada');
  await capturar(janela, 'playlist-3-revisao');

  // 4 · importada: a lista abre no editor, com a origem e a faixa verde
  await janela.getByTestId('importar-playlist').click();
  await expect(janela.getByTestId('nome-da-lista')).toHaveText('hard-techno-sexta.txt');
  await expect(janela.getByTestId('aviso-playlist')).toContainText('3 faixas importadas do Deezer.');
  await expect(janela.getByTestId('origem-lista')).toContainText('Playlist do Deezer');
  const arquivo = join(amb.projeto, 'hard-techno-sexta.txt');
  expect(readFileSync(arquivo, 'utf8')).toBe(
    '# Deezer · Hard Techno Sexta · https://www.deezer.com/playlist/908622995\r\n' +
      'Azyr - No Escape\r\nAzyr - No Escape\r\nCreeds - Push Up (Original Mix)\r\n',
  );
  // a análise do script ignora a primeira linha e marca a repetida (o PowerShell, com a biblioteca, pode demorar no CI)
  await expect(janela.getByTestId('previa-lista')).toContainText('Duplicada · linha 2', { timeout: 60_000 });
  await capturar(janela, 'playlist-4-importada');

  // a playlist ganhou uma faixa: "Atualizar da playlist" põe só ela no fim
  writeFileSync(
    duble,
    JSON.stringify(
      respostas([faixa('Azyr', 'No Escape'), faixa('Creeds', 'Push Up (Original Mix)'), faixa('Vendex', 'Abaddon')]),
    ),
  );
  await janela.getByTestId('atualizar-da-playlist').click();
  await expect(janela.getByTestId('aviso-playlist')).toContainText('1 faixa nova entrou no fim da lista.');
  await expect
    .poll(() => readFileSync(arquivo, 'utf8'))
    .toContain('Creeds - Push Up (Original Mix)\r\nVendex - Abaddon\r\n');
});

test('playlist privada: explica o que fazer, sem fechar o diálogo', async () => {
  amb = criarAmbiente({ comScript: true, mundo: { containers: TODOS_NO_AR } });
  const duble = join(amb.raiz, 'playlists.json');
  writeFileSync(
    duble,
    JSON.stringify({ [API]: { corpo: JSON.stringify({ error: { type: 'DataException', code: 800 } }) } }),
  );
  const { janela } = (aberto = await abrirApp(amb, { SOULCRATE_DUBLE_PLAYLISTS: duble }));
  await janela.getByRole('link', { name: 'Baixar lista' }).click();
  await janela.getByTestId('abrir-importar-playlist').click();
  await janela.getByTestId('link-playlist').fill('https://www.deezer.com/playlist/908622995');
  await expect(janela.getByTestId('dialogo-playlist').getByRole('radio', { name: /Deezer/ })).toBeChecked();
  await janela.getByTestId('buscar-playlist').click();
  await expect(janela.getByTestId('erro-playlist')).toContainText('Não consegui abrir essa playlist.');
  await expect(janela.getByTestId('erro-playlist')).toContainText('Deixe a playlist pública no Deezer');
  await capturar(janela, 'playlist-5d-privada');
});
