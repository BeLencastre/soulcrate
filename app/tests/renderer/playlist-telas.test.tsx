// @vitest-environment jsdom
// Importação de playlist na tela "Baixar lista" (protótipos "importacao-playlist"), com o `window.soulcrate` simulado.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListaConteudo, ListaRef } from '../../src/shared/lote';
import { novasOpcoes } from '../../src/shared/opcoes-lote';
import type { PlaylistImportada, ResultadoBuscaPlaylist } from '../../src/shared/playlists';
import { statusInicial } from '../../src/shared/stack';

const api = vi.hoisted(() => ({
  stack: { status: vi.fn() },
  lists: {
    read: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    importFile: vi.fn(),
    importBytes: vi.fn(),
    analyze: vi.fn(),
    listRecent: vi.fn(),
    createWithText: vi.fn(),
  },
  playlists: { fetch: vi.fn() },
  batch: { start: vi.fn(), stop: vi.fn(), active: vi.fn(), attach: vi.fn() },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

const { Lista } = await import('../../src/renderer/paginas/lote/Lista');
const { chaveStatus } = await import('../../src/renderer/lib/estado');
const { useRascunho } = await import('../../src/renderer/lib/lote-store');

const ID_SP = '37i9dQZF1DXcBWIGoYBM5M';
const LINK_SP = `https://open.spotify.com/playlist/${ID_SP}`;

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, { ...statusInicial(), atualizadoEm: 1 });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/lista']}>
        <Routes>
          <Route path="/lista" element={<Lista />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const playlist = (extra: Partial<PlaylistImportada> = {}): PlaylistImportada => ({
  servico: 'spotify',
  id: ID_SP,
  url: LINK_SP,
  nome: 'Hard Techno Sexta',
  autor: 'belen',
  capa: null,
  faixas: [
    { artista: 'Azyr', titulo: 'No Escape', duracaoMs: 60 * 60_000 },
    { artista: 'Azyr', titulo: 'No Escape', duracaoMs: 6 * 60_000 },
    { artista: 'Creeds', titulo: 'Push Up - Original Mix', duracaoMs: 0 },
  ],
  total: null,
  parcial: false,
  ...extra,
});
const ok = (p = playlist()): ResultadoBuscaPlaylist => ({ ok: true, playlist: p });

const refDe = (nome: string, extra: Partial<ListaRef> = {}): ListaRef => ({
  nome,
  tipo: 'txt',
  modificadaEm: Date.now(),
  bytes: 10,
  ...extra,
});
const conteudo = (nome: string, texto: string): ListaConteudo => ({
  ...refDe(nome),
  texto,
  somenteLeitura: false,
});

const dialogo = () => screen.getByTestId('dialogo-playlist');
const campoLink = () => screen.getByTestId('link-playlist');

async function abrirDialogoPelaGrade(streaming: RegExp) {
  montar();
  const grade = await screen.findByTestId('grade-streamings');
  fireEvent.click(within(grade).getByRole('button', { name: streaming }));
  return screen.findByTestId('dialogo-playlist');
}

beforeEach(() => {
  for (const g of Object.values(api)) for (const f of Object.values(g)) f.mockReset().mockResolvedValue(undefined);
  api.lists.listRecent.mockResolvedValue([]);
  api.lists.analyze.mockResolvedValue({ ultimaExecucaoEm: null, analise: { v: 1, ok: false, list: 'x', error: 'x' } });
  useRascunho.setState({
    lista: null,
    texto: '',
    textoSalvo: '',
    salvoEm: null,
    salvando: false,
    analise: null,
    analisando: false,
    erroAnalise: null,
    erro: null,
    recentes: [],
    opcoes: novasOpcoes(),
    avisoPlaylist: null,
    atualizandoPlaylist: false,
  });
  localStorage.clear();
});
afterEach(cleanup);

describe('entrada da importação', () => {
  it('sem lista aberta: "Ou importe uma playlist" com os quatro streamings gratuitos, sem a Amazon', async () => {
    montar();
    const grade = await screen.findByTestId('grade-streamings');
    const nomes = within(grade)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(nomes).toEqual([
      expect.stringContaining('Spotify'),
      expect.stringContaining('Apple Music'),
      expect.stringContaining('YouTube Music'),
      expect.stringContaining('Deezer'),
    ]);
    expect(grade).not.toHaveTextContent('Amazon');
    expect(screen.getByTestId('lista-vazia')).toHaveTextContent('traga uma playlist de um streaming');
  });

  it('o streaming escolhido na grade já vem marcado no diálogo, com o exemplo de link dele', async () => {
    await abrirDialogoPelaGrade(/Deezer/);
    expect(within(dialogo()).getByRole('radio', { name: /Deezer/ })).toBeChecked();
    expect(campoLink()).toHaveAttribute('placeholder', 'https://www.deezer.com/br/playlist/…');
    expect(dialogo()).toHaveTextContent('No Deezer: ⋯ › Compartilhar › Copiar link.');
    expect(dialogo()).toHaveTextContent('Só playlists públicas');
  });

  it('o botão do cabeçalho abre o diálogo no Spotify', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('abrir-importar-playlist'));
    expect(within(await screen.findByTestId('dialogo-playlist')).getByRole('radio', { name: /Spotify/ })).toBeChecked();
  });

  it('as recentes mostram de qual streaming a lista veio', async () => {
    api.lists.listRecent.mockResolvedValue([
      refDe('warmup-domingo.txt', {
        origem: { servico: 'deezer', nome: 'Warmup', url: 'https://www.deezer.com/playlist/9' },
      }),
      refDe('set-sexta.txt'),
    ]);
    montar();
    const recentes = await screen.findByTestId('lista-recentes');
    await waitFor(() => expect(recentes).toHaveTextContent('warmup-domingo.txt'));
    const itens = within(recentes).getAllByRole('button');
    expect(itens[0]).toHaveTextContent('Deezer');
    expect(itens[1]).not.toHaveTextContent('Deezer');
  });
});

describe('link da playlist', () => {
  it('colou um link de outro streaming: troca sozinho', async () => {
    await abrirDialogoPelaGrade(/Spotify/);
    fireEvent.change(campoLink(), {
      target: { value: 'https://music.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' },
    });
    expect(within(dialogo()).getByRole('radio', { name: /YouTube Music/ })).toBeChecked();
    expect(screen.getByTestId('buscar-playlist')).toBeEnabled();
  });

  it('link de faixa: avisa na hora, sem buscar, e o botão fica desligado', async () => {
    await abrirDialogoPelaGrade(/Spotify/);
    fireEvent.change(campoLink(), { target: { value: 'https://open.spotify.com/track/3zOYmiNOuyDL0ClxJcEJ0T' } });
    const alerta = within(dialogo()).getByRole('alert');
    expect(alerta).toHaveTextContent('Esse link é de uma faixa, não de uma playlist.');
    expect(alerta).toHaveTextContent('No Spotify, abra a playlist e use ⋯ › Compartilhar › Copiar link da playlist.');
    expect(campoLink()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('buscar-playlist')).toBeDisabled();
    expect(api.playlists.fetch).not.toHaveBeenCalled();
  });

  it('link da Amazon Music: não é aceito', async () => {
    await abrirDialogoPelaGrade(/Spotify/);
    fireEvent.change(campoLink(), { target: { value: 'https://music.amazon.com/playlists/B07H8NDFTJ' } });
    fireEvent.submit(campoLink().closest('form') as HTMLFormElement);
    expect(within(dialogo()).getByRole('alert')).toHaveTextContent('não é de um streaming aceito');
    expect(api.playlists.fetch).not.toHaveBeenCalled();
  });

  it('playlist privada: explica e permite tentar de novo ou colar outro link', async () => {
    api.playlists.fetch.mockResolvedValueOnce({ ok: false, erro: { motivo: 'indisponivel', servico: 'spotify' } });
    await abrirDialogoPelaGrade(/Spotify/);
    fireEvent.change(campoLink(), { target: { value: LINK_SP } });
    fireEvent.click(screen.getByTestId('buscar-playlist'));
    const erro = await screen.findByTestId('erro-playlist');
    expect(erro).toHaveTextContent('Não consegui abrir essa playlist.');
    expect(erro).toHaveTextContent('Deixe a playlist pública no Spotify');
    expect(screen.getByTestId('buscar-playlist')).toHaveTextContent('Tentar de novo');

    api.playlists.fetch.mockResolvedValueOnce(ok());
    fireEvent.click(screen.getByTestId('buscar-playlist'));
    expect(await screen.findByTestId('nome-da-playlist')).toHaveTextContent('Hard Techno Sexta');
  });

  it('"Outro link" limpa o campo e o erro', async () => {
    api.playlists.fetch.mockResolvedValueOnce({ ok: false, erro: { motivo: 'rede', servico: 'deezer' } });
    await abrirDialogoPelaGrade(/Deezer/);
    fireEvent.change(campoLink(), { target: { value: 'https://www.deezer.com/playlist/1' } });
    fireEvent.click(screen.getByTestId('buscar-playlist'));
    expect(await screen.findByTestId('erro-playlist')).toHaveTextContent('Não consegui falar com o streaming.');
    fireEvent.click(within(dialogo()).getByRole('button', { name: 'Outro link' }));
    expect(campoLink()).toHaveValue('');
    expect(screen.queryByTestId('erro-playlist')).toBeNull();
  });
});

describe('revisão e importação', () => {
  async function irParaRevisao(p = playlist()) {
    api.playlists.fetch.mockResolvedValue(ok(p));
    await abrirDialogoPelaGrade(/Spotify/);
    fireEvent.change(campoLink(), { target: { value: LINK_SP } });
    fireEvent.click(screen.getByTestId('buscar-playlist'));
    await screen.findByTestId('nome-da-playlist');
  }

  it('mostra a playlist, o resumo, as repetidas e propõe o nome do arquivo', async () => {
    await irParaRevisao();
    expect(api.playlists.fetch).toHaveBeenCalledWith(LINK_SP);
    const d = dialogo();
    expect(d).toHaveTextContent('Playlist do Spotify');
    expect(d).toHaveTextContent('por belen · 3 faixas · 1 h 6 min');
    expect(screen.getByTestId('resumo-revisao')).toHaveTextContent('2 para baixar');
    expect(screen.getByTestId('resumo-revisao')).toHaveTextContent('1 duplicada');
    expect(d).toHaveTextContent('Duplicada · 1');
    expect(d).toHaveTextContent('Push Up (Original Mix)');
    expect(screen.getByTestId('nome-lista-playlist')).toHaveValue('hard-techno-sexta');
    expect(screen.getByTestId('lembrar-playlist')).toBeChecked();
    expect(screen.getByTestId('importar-playlist')).toHaveTextContent('Importar 3 faixas');
  });

  it('Spotify com 100 faixas: avisa que o link pode ter cortado o resto', async () => {
    await irParaRevisao(playlist({ parcial: true }));
    expect(screen.getByTestId('aviso-parcial')).toHaveTextContent('no máximo 100 faixas');
  });

  it('importa: cria a lista com a origem na primeira linha, abre e mostra a faixa verde', async () => {
    const texto = `# Spotify · Hard Techno Sexta · ${LINK_SP}\nAzyr - No Escape\nAzyr - No Escape\nCreeds - Push Up (Original Mix)\n`;
    api.lists.createWithText.mockResolvedValue(refDe('hard-techno-sexta.txt'));
    api.lists.read.mockResolvedValue(conteudo('hard-techno-sexta.txt', texto));
    api.lists.analyze.mockResolvedValue({
      ultimaExecucaoEm: null,
      analise: { v: 1, ok: false, list: 'x', error: 'teste' },
    });
    await irParaRevisao();
    fireEvent.click(screen.getByTestId('importar-playlist'));

    await waitFor(() => expect(screen.queryByTestId('dialogo-playlist')).toBeNull());
    expect(api.lists.createWithText).toHaveBeenCalledWith('hard-techno-sexta.txt', texto);
    expect(await screen.findByTestId('nome-da-lista')).toHaveTextContent('hard-techno-sexta.txt');
    const aviso = screen.getByTestId('aviso-playlist');
    expect(aviso).toHaveTextContent('3 faixas importadas do Spotify.');
    expect(aviso).toHaveTextContent('1 duplicada será pulada.');
    const origem = screen.getByTestId('origem-lista');
    expect(origem).toHaveTextContent('Playlist do Spotify');
    expect(origem).toHaveTextContent('Hard Techno Sexta');
    expect(screen.getByTestId('editor')).toHaveTextContent('A primeira linha guarda de onde a lista veio');

    fireEvent.click(within(aviso).getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByTestId('aviso-playlist')).toBeNull();
  });

  it('sem "lembrar" e com outro nome: sem primeira linha de origem', async () => {
    api.lists.createWithText.mockResolvedValue(refDe('sexta.txt'));
    api.lists.read.mockResolvedValue(conteudo('sexta.txt', 'Azyr - No Escape\n'));
    await irParaRevisao();
    fireEvent.click(screen.getByTestId('lembrar-playlist'));
    fireEvent.change(screen.getByTestId('nome-lista-playlist'), { target: { value: 'sexta' } });
    fireEvent.click(screen.getByTestId('importar-playlist'));
    await waitFor(() => expect(api.lists.createWithText).toHaveBeenCalled());
    const [nome, texto] = api.lists.createWithText.mock.calls[0] as [string, string];
    expect(nome).toBe('sexta.txt');
    expect(texto.startsWith('#')).toBe(false);
  });

  it('nome vazio: não importa', async () => {
    await irParaRevisao();
    fireEvent.change(screen.getByTestId('nome-lista-playlist'), { target: { value: '  ' } });
    expect(screen.getByTestId('importar-playlist')).toBeDisabled();
    expect(within(dialogo()).getByRole('alert')).toHaveTextContent('Dê um nome à lista.');
  });

  it('falha ao gravar: o diálogo continua aberto, com o erro', async () => {
    api.lists.createWithText.mockRejectedValue(
      new Error("Error invoking remote method 'lists:createWithText': Error: Escolha a pasta do Soulcrate primeiro."),
    );
    await irParaRevisao();
    fireEvent.click(screen.getByTestId('importar-playlist'));
    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(
      'Não consegui importar a playlist: Escolha a pasta do Soulcrate primeiro.',
    );
  });

  it('"Outra playlist" volta ao link', async () => {
    await irParaRevisao();
    fireEvent.click(within(dialogo()).getByRole('button', { name: /Outra playlist/ }));
    expect(campoLink()).toBeInTheDocument();
  });
});

describe('Atualizar da playlist', () => {
  const CABECA = `# Spotify · Hard Techno Sexta · ${LINK_SP}`;

  async function abrirImportada(texto: string) {
    api.lists.read.mockResolvedValue(conteudo('hard-techno-sexta.txt', texto));
    api.lists.analyze.mockResolvedValue({
      ultimaExecucaoEm: null,
      analise: { v: 1, ok: false, list: 'x', error: 'x' },
    });
    await useRascunho.getState().abrir('hard-techno-sexta.txt');
    montar();
    return screen.findByTestId('atualizar-da-playlist');
  }

  it('busca pelo link da primeira linha e põe só as novas no fim', async () => {
    const botao = await abrirImportada(`${CABECA}\nAzyr - No Escape\n`);
    api.playlists.fetch.mockResolvedValue(
      ok(
        playlist({
          faixas: [
            { artista: 'Azyr', titulo: 'No Escape', duracaoMs: 1 },
            { artista: 'Vendex', titulo: 'Abaddon', duracaoMs: 1 },
          ],
        }),
      ),
    );
    fireEvent.click(botao);
    expect(await screen.findByTestId('aviso-playlist')).toHaveTextContent('1 faixa nova entrou no fim da lista.');
    expect(api.playlists.fetch).toHaveBeenCalledWith(LINK_SP);
    expect(useRascunho.getState().texto).toBe(`${CABECA}\nAzyr - No Escape\nVendex - Abaddon\n`);
  });

  it('nada novo: avisa e não mexe no texto', async () => {
    const texto = `${CABECA}\nAzyr - No Escape\n`;
    const botao = await abrirImportada(texto);
    api.playlists.fetch.mockResolvedValue(
      ok(playlist({ faixas: [{ artista: 'Azyr', titulo: 'No Escape', duracaoMs: 1 }] })),
    );
    fireEvent.click(botao);
    expect(await screen.findByTestId('aviso-playlist')).toHaveTextContent(
      'A lista já tem todas as faixas da playlist.',
    );
    expect(useRascunho.getState().texto).toBe(texto);
  });

  it('a playlist ficou privada: erro na tela, texto intacto', async () => {
    const texto = `${CABECA}\nAzyr - No Escape\n`;
    const botao = await abrirImportada(texto);
    api.playlists.fetch.mockResolvedValue({ ok: false, erro: { motivo: 'indisponivel', servico: 'spotify' } });
    fireEvent.click(botao);
    expect(await screen.findByTestId('erro-lista')).toHaveTextContent(
      'Não consegui atualizar da playlist: Não consegui abrir essa playlist.',
    );
    expect(useRascunho.getState().texto).toBe(texto);
  });

  it('lista comum (sem origem): não há botão de atualizar', async () => {
    api.lists.read.mockResolvedValue(conteudo('set.txt', '# Set de sábado\nAzyr - No Escape\n'));
    api.lists.analyze.mockResolvedValue({
      ultimaExecucaoEm: null,
      analise: { v: 1, ok: false, list: 'x', error: 'x' },
    });
    await useRascunho.getState().abrir('set.txt');
    montar();
    await screen.findByTestId('editor');
    expect(screen.queryByTestId('atualizar-da-playlist')).toBeNull();
    expect(screen.queryByTestId('origem-lista')).toBeNull();
  });
});
