// @vitest-environment jsdom
// A tela Biblioteca (Fase 5) renderizada de verdade (React + Testing Library), com o `window.soulcrate` simulado. O foco
// é o que protege o usuário: nada é apagado sem a prévia e a confirmação, e as tarefas que mexem nos arquivos só
// começam com o token da prévia.
import './matchers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FaixaDaBiblioteca,
  LeituraBiblioteca,
  ParadoEmDownloads,
  ResultadoCompartilhamento,
  ResultadoLeitura,
  ResultadoPreviaManutencao,
  ResultadoPreviaRemocao,
} from '../../src/shared/biblioteca';
import { criarErro } from '../../src/shared/erros';
import { lerLinhaEvento } from '../../src/shared/eventos-lote';
import type { MainEvent } from '../../src/shared/ipc';
import { statusInicial, type StackStatus } from '../../src/shared/stack';

const api = vi.hoisted(() => ({
  onEvent: vi.fn(),
  stack: { up: vi.fn(), status: vi.fn() },
  env: { startDockerDesktop: vi.fn(), check: vi.fn() },
  app: { copyText: vi.fn(), openLogsFolder: vi.fn(), openExternal: vi.fn() },
  project: { openFolder: vi.fn() },
  lists: { create: vi.fn(), read: vi.fn(), save: vi.fn(), listRecent: vi.fn() },
  library: {
    list: vi.fn(),
    previewRemove: vi.fn(),
    remove: vi.fn(),
    previewMaintenance: vi.fn(),
    maintenance: vi.fn(),
    running: vi.fn(),
    revealTrack: vi.fn(),
    openMusicFolder: vi.fn(),
    sharing: vi.fn(),
    rescanSharing: vi.fn(),
  },
}));
vi.mock('../../src/renderer/lib/api', () => ({ api }));

const { Biblioteca } = await import('../../src/renderer/paginas/Biblioteca');
const { chaveStatus, ligarEventos } = await import('../../src/renderer/lib/estado');
const { useManutencao } = await import('../../src/renderer/lib/biblioteca');
const { useRascunho } = await import('../../src/renderer/lib/lote-store');

// ---------------------------------------------------------------- Montagem

function faixa(id: number, extra: Partial<FaixaDaBiblioteca> = {}): FaixaDaBiblioteca {
  return {
    id,
    artista: 'Azyr',
    titulo: 'No Escape',
    bpm: 150,
    tom: 'F#m',
    genero: 'Hard Techno',
    formato: 'FLAC',
    arquivo: 'Hard Techno/Azyr/No Escape.flac',
    semGenero: false,
    ...extra,
  };
}

const FAIXAS: FaixaDaBiblioteca[] = [
  faixa(1),
  faixa(2, {
    artista: 'Azyr',
    titulo: 'Power (Extended Mix)',
    bpm: 152,
    tom: 'Gm',
    arquivo: 'Hard Techno/Azyr/Power.flac',
  }),
  faixa(3, {
    artista: 'Charlie Sparks',
    titulo: 'Tatakai',
    bpm: null,
    tom: 'Fm',
    formato: 'MP3 320',
    arquivo: 'Hard Techno/Charlie Sparks/Tatakai.mp3',
  }),
  faixa(4, {
    artista: 'Luciid',
    titulo: 'Bye Bye (NOVAH Remix)',
    bpm: null,
    tom: null,
    genero: null,
    semGenero: true,
    formato: 'MP3 320',
    arquivo: '_Sem Genero/Luciid/Bye Bye.mp3',
  }),
  faixa(5, { artista: 'Vendex', titulo: 'Plague', tom: null, arquivo: 'Hard Techno/Vendex/Plague.flac' }),
];

/** sempre "ontem, 12:00" no horário local, a qualquer hora em que o teste rode (o CI roda de madrugada em UTC) */
const ONTEM_AO_MEIO_DIA = new Date(new Date().setDate(new Date().getDate() - 1)).setHours(12, 0, 0, 0);

const PARADOS: ParadoEmDownloads[] = [
  { nome: 'f_hard', arquivos: ['Vengeance Of The Masked.mp3'], total: 1, modificadoEm: ONTEM_AO_MEIO_DIA },
];

function leitura(extra: Partial<LeituraBiblioteca> = {}): LeituraBiblioteca {
  return {
    pastaMusica: 'D:\\Musica\\Soulcrate\\music',
    pastaDownloads: 'D:\\Musica\\Soulcrate\\downloads',
    lidaEm: Date.now(),
    faixas: FAIXAS,
    ignoradas: 0,
    parados: PARADOS,
    ...extra,
  };
}

function stack(soulbeet: 'running' | 'exited' = 'running'): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: { ...base.docker, engine: true },
    servicos: [
      { id: 'slskd', container: 'running', saude: 'healthy', http: true, statusTexto: null },
      { id: 'soulbeet', container: soulbeet, saude: 'healthy', http: true, statusTexto: null },
      { id: 'navidrome', container: 'running', saude: 'healthy', http: true, statusTexto: null },
    ],
  };
}

function Local() {
  const l = useLocation();
  return <div data-testid="local">{l.pathname}</div>;
}

function montar(s: StackStatus = stack()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaveStatus, s);
  const r = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/biblioteca']}>
        <Routes>
          <Route path="/biblioteca" element={<Biblioteca />} />
          <Route path="/lista" element={<Local />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...r, qc };
}

const lerOk = (l: LeituraBiblioteca = leitura()): ResultadoLeitura => ({ ok: true, leitura: l });
const compartilhando = (arquivos: number | null, escaneando = false): ResultadoCompartilhamento => ({
  ok: true,
  compartilhamento: { arquivos, escaneando },
});

beforeEach(() => {
  api.onEvent.mockReset();
  for (const [nome, grupo] of Object.entries(api)) {
    if (nome === 'onEvent') continue;
    for (const fn of Object.values(grupo as Record<string, unknown>)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  api.library.list.mockResolvedValue(lerOk());
  api.library.sharing.mockResolvedValue(compartilhando(1204));
  api.library.running.mockResolvedValue(null);
  api.library.revealTrack.mockResolvedValue(true);
  api.library.previewMaintenance.mockResolvedValue({
    ok: true,
    previa: { tarefa: 'tomEBpm', token: null, afetadas: 0, linhas: [], totalDeLinhas: 0, esquecidas: 0 },
  });
  api.stack.up.mockResolvedValue({ id: 'op', tipo: 'ligar' });
  api.app.copyText.mockResolvedValue(undefined);
  useManutencao.setState({ operacao: null });
  useRascunho.setState({ lista: null, texto: '', textoSalvo: '', erro: null });
});
afterEach(() => {
  cleanup();
});

const linhas = () => screen.queryAllByRole('row').filter((r) => r.getAttribute('aria-rowindex') !== '1');
const celulas = (linha: HTMLElement) => within(linha).getAllByRole('cell');
const carregada = () => screen.findByTestId('tabela-biblioteca');

// ---------------------------------------------------------------- Tabela e indicadores

describe('tabela, busca e indicadores', () => {
  it('mostra a pasta e o total, as colunas do protótipo e uma linha por faixa', async () => {
    montar();
    await carregada();
    expect(await screen.findByText('D:\\Musica\\Soulcrate\\music · 5 faixas')).toBeInTheDocument();
    const cab = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cab).toEqual(['Artista', 'Título', 'BPM', 'Tom', 'Gênero', 'Formato', 'Ações']);
    expect(linhas()).toHaveLength(5);
    expect(screen.getByTestId('contagem')).toHaveTextContent('5 de 5');
    const primeira = celulas(linhas()[0] as HTMLElement).map((c) => c.textContent);
    expect(primeira.slice(0, 6)).toEqual(['Azyr', 'No Escape', '150', 'F#m', 'Hard Techno', 'FLAC']);
  });

  it('BPM e tom ausentes aparecem como "sem" e o gênero vazio como _Sem Genero', async () => {
    montar();
    await carregada();
    const luciid = linhas().find((l) => l.textContent?.includes('Luciid')) as HTMLElement;
    expect(
      celulas(luciid)
        .map((c) => c.textContent)
        .slice(2, 5),
    ).toEqual(['sem', 'sem', '_Sem Genero']);
  });

  it('os quatro indicadores contam o que falta', async () => {
    montar();
    await carregada();
    const valor = (id: string) => document.querySelector(`[data-valor="${id}"]`)?.textContent;
    expect(valor('bpm')).toBe('2');
    expect(valor('tom')).toBe('2');
    expect(valor('gen')).toBe('1');
    expect(valor('dl')).toBe('1');
  });

  it('clicar num indicador filtra a tabela; clicar de novo limpa', async () => {
    montar();
    await carregada();
    const bpm = document.querySelector('[data-indicador="bpm"]') as HTMLElement;
    fireEvent.click(bpm);
    expect(bpm).toHaveAttribute('aria-pressed', 'true');
    expect(linhas().map((l) => celulas(l)[1]?.textContent)).toEqual(['Tatakai', 'Bye Bye (NOVAH Remix)']);
    expect(screen.getByTestId('contagem')).toHaveTextContent('2 de 5');
    fireEvent.click(bpm);
    expect(linhas()).toHaveLength(5);
  });

  it('a busca acha por artista ou título, sem acento nem maiúsculas', async () => {
    montar();
    await carregada();
    fireEvent.change(screen.getByTestId('busca'), { target: { value: 'POWER azyr' } });
    expect(linhas().map((l) => celulas(l)[1]?.textContent)).toEqual(['Power (Extended Mix)']);
    fireEvent.change(screen.getByTestId('busca'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhuma faixa com esse filtro.')).toBeInTheDocument();
  });

  it('"Parados em downloads/": lista o que o beets não importou e oferece importar', async () => {
    montar();
    await carregada();
    fireEvent.click(document.querySelector('[data-indicador="dl"]') as HTMLElement);
    const vazio = await screen.findByTestId('parados-vazio');
    expect(vazio).toHaveTextContent(
      'downloads/f_hard/ tem 1 arquivo que o beets não importou: Vengeance Of The Masked.mp3',
    );
    fireEvent.click(within(vazio).getByRole('button', { name: 'Importar agora' }));
    expect(await screen.findByRole('dialog', { name: 'Importar o que sobrou em downloads/' })).toBeInTheDocument();
  });

  it('biblioteca vazia: explica e leva a baixar uma lista', async () => {
    api.library.list.mockResolvedValue(lerOk(leitura({ faixas: [], parados: [] })));
    montar();
    expect(await screen.findByTestId('biblioteca-vazia')).toHaveTextContent('A biblioteca está vazia');
    fireEvent.click(screen.getByRole('link', { name: 'Baixar uma lista' }));
    expect(await screen.findByTestId('local')).toHaveTextContent('/lista');
  });

  it('"Mostrar no Explorer" pede o arquivo pelo id; se não achar, avisa', async () => {
    montar();
    await carregada();
    fireEvent.click(screen.getAllByLabelText('Mostrar No Escape no Explorer')[0] as HTMLElement);
    await waitFor(() => expect(api.library.revealTrack).toHaveBeenCalledWith(1));
    api.library.revealTrack.mockResolvedValue(false);
    fireEvent.click(screen.getByLabelText('Mostrar Tatakai no Explorer'));
    expect(await screen.findByRole('status')).toHaveTextContent('não está mais em music/');
  });

  it('"Abrir music no Explorer" e "Atualizar"', async () => {
    montar();
    await carregada();
    api.library.openMusicFolder.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: /Abrir music no Explorer/ }));
    expect(api.library.openMusicFolder).toHaveBeenCalled();
    const antes = api.library.list.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    await waitFor(() => expect(api.library.list.mock.calls.length).toBeGreaterThan(antes));
  });
});

// ---------------------------------------------------------------- Estados

describe('estados', () => {
  it('lendo: mostra o esqueleto e a explicação', async () => {
    api.library.list.mockReturnValue(new Promise(() => undefined));
    montar();
    expect(await screen.findByTestId('carregando')).toBeInTheDocument();
    expect(screen.getByText(/Com milhares de faixas, leva alguns segundos/)).toBeInTheDocument();
  });

  it('stack fora: erro do catálogo, sem tabela, com "Ligar a stack"', async () => {
    api.library.list.mockResolvedValue({ ok: false, erro: criarErro('biblioteca.stack-fora') });
    montar(stack('exited'));
    const cartao = await screen.findByRole('alert');
    expect(cartao).toHaveTextContent('A biblioteca só abre com a stack no ar');
    expect(screen.queryByTestId('tabela-biblioteca')).toBeNull();
    fireEvent.click(within(cartao).getByRole('button', { name: 'Ligar a stack' }));
    expect(api.stack.up).toHaveBeenCalled();
  });

  it('o beets falhou: mostra a saída dele e oferece tentar de novo', async () => {
    api.library.list.mockResolvedValueOnce({
      ok: false,
      erro: criarErro('biblioteca.falhou', { tarefa: 'ler a biblioteca', detalhes: 'error: database is locked' }),
    });
    montar();
    const cartao = await screen.findByRole('alert');
    expect(cartao).toHaveTextContent('Não consegui ler a biblioteca');
    expect(cartao).toHaveTextContent('database is locked');
    fireEvent.click(within(cartao).getByRole('button', { name: 'Tentar de novo' }));
    await carregada();
  });

  it('linhas que o beets disse e o app não entendeu são avisadas', async () => {
    api.library.list.mockResolvedValue(lerOk(leitura({ ignoradas: 3 })));
    montar();
    expect(await screen.findByText(/3 linhas da saída do beets não foram entendidas/)).toBeInTheDocument();
  });

  it('sem pasta do Soulcrate: leva ao assistente', async () => {
    const s = stack();
    montar({ ...s, projeto: { dir: null, origem: null } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Pasta do Soulcrate');
    expect(api.library.list).not.toHaveBeenCalledWith(expect.anything());
  });
});

// ---------------------------------------------------------------- Compartilhamento e Rekordbox

describe('compartilhamento e Rekordbox', () => {
  it('mostra quantos arquivos o slskd anuncia', async () => {
    montar();
    expect(await screen.findByTestId('compartilhamento-n')).toHaveTextContent('1.204 arquivos anunciados no Soulseek');
  });

  it('0 arquivos: avisa que quem não compartilha é despriorizado', async () => {
    api.library.sharing.mockResolvedValue(compartilhando(0));
    montar();
    expect(await screen.findByText(/anuncia 0 arquivos/)).toBeInTheDocument();
  });

  it('Reescanear pede a varredura e mostra o resultado', async () => {
    api.library.rescanSharing.mockResolvedValue(compartilhando(1204, true));
    montar();
    await screen.findByTestId('compartilhamento-n');
    fireEvent.click(screen.getByTestId('reescanear'));
    await waitFor(() => expect(api.library.rescanSharing).toHaveBeenCalled());
    expect(await screen.findByText('O slskd está varrendo a biblioteca…')).toBeInTheDocument();
    expect(screen.getByTestId('reescanear')).toBeDisabled();
  });

  it('slskd fora: não consulta e explica', async () => {
    const s = stack();
    montar({
      ...s,
      servicos: s.servicos.map((x) => (x.id === 'slskd' ? { ...x, container: 'exited' as const } : x)),
    });
    await carregada();
    expect(screen.getByText('Ligue a stack para ver o compartilhamento.')).toBeInTheDocument();
    expect(api.library.sharing).not.toHaveBeenCalled();
    expect(screen.getByTestId('reescanear')).toBeDisabled();
  });

  it('erro do slskd aparece no cartão, sem derrubar a tela', async () => {
    api.library.sharing.mockResolvedValue({ ok: false, erro: criarErro('servico.inacessivel', { servico: 'slskd' }) });
    montar();
    expect(await screen.findByTestId('compartilhamento-erro')).toHaveTextContent('slskd');
    expect(screen.getByTestId('tabela-biblioteca')).toBeInTheDocument();
  });

  it('Rekordbox: mostra a pasta certa e copia', async () => {
    montar();
    await carregada();
    expect(screen.getByTestId('pasta-rekordbox')).toHaveTextContent('D:\\Musica\\Soulcrate\\music');
    fireEvent.click(screen.getByTestId('copiar-pasta'));
    await waitFor(() => expect(api.app.copyText).toHaveBeenCalledWith('D:\\Musica\\Soulcrate\\music'));
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- Remover

function previaDe(faixas: FaixaDaBiblioteca[], token = 'tok-1', filtro = 'x'): ResultadoPreviaRemocao {
  return { ok: true, previa: { filtro, token, faixas } };
}

async function abrirRemover(titulo = 'No Escape') {
  fireEvent.click(screen.getAllByLabelText(`Remover ${titulo}`)[0] as HTMLElement);
  return screen.findByRole('dialog');
}

describe('remover', () => {
  it('abre com o filtro da faixa e lista o que ele pega ANTES de qualquer botão de apagar funcionar', async () => {
    api.library.previewRemove.mockResolvedValue(previaDe([FAIXAS[0] as FaixaDaBiblioteca]));
    montar();
    await carregada();
    const d = await abrirRemover();
    expect(within(d).getByTestId('filtro-remover')).toHaveValue('id:1');
    expect(await within(d).findByTestId('previa-resumo')).toHaveTextContent('1 faixa · 1 arquivo');
    expect(api.library.previewRemove).toHaveBeenCalledWith('id:1');
    expect(within(d).getByTestId('previa-faixa')).toHaveTextContent('Azyr – No Escape');
    expect(within(d).getByTestId('previa-faixa')).toHaveTextContent('music/Hard Techno/Azyr/No Escape.flac');
    expect(within(d).getByText(/sem passar pela Lixeira/)).toBeInTheDocument();
    // o botão só liga depois do "conferi"
    const apagar = within(d).getByTestId('apagar');
    expect(apagar).toBeDisabled();
    expect(api.library.remove).not.toHaveBeenCalled();
  });

  it('com a prévia ainda carregando, o "conferi" e o botão ficam desligados', async () => {
    api.library.previewRemove.mockReturnValue(new Promise(() => undefined));
    montar();
    await carregada();
    const d = await abrirRemover();
    expect(await within(d).findByText('Conferindo o filtro…')).toBeInTheDocument();
    expect(within(d).getByTestId('conferi')).toBeDisabled();
    expect(within(d).getByTestId('apagar')).toBeDisabled();
  });

  it('confere e apaga: chama remove com o filtro e o token da prévia, mostra "saiu da biblioteca" e relê a tabela', async () => {
    api.library.previewRemove.mockResolvedValue(previaDe([FAIXAS[0] as FaixaDaBiblioteca], 'tok-abc'));
    api.library.remove.mockResolvedValue({
      ok: true,
      remocao: { removidas: [{ artista: 'Azyr', titulo: 'No Escape' }] },
    });
    montar();
    await carregada();
    const d = await abrirRemover();
    await within(d).findByTestId('previa-resumo');
    fireEvent.click(within(d).getByTestId('conferi'));
    const apagar = within(d).getByTestId('apagar');
    expect(apagar).toBeEnabled();
    expect(apagar).toHaveTextContent('Apagar 1 faixa');
    const leiturasAntes = api.library.list.mock.calls.length;
    fireEvent.click(apagar);
    expect(await within(d).findByTestId('remocao-feita')).toHaveTextContent('Azyr – No Escape saiu da biblioteca');
    expect(api.library.remove).toHaveBeenCalledWith('id:1', 'tok-abc');
    await waitFor(() => expect(api.library.list.mock.calls.length).toBeGreaterThan(leiturasAntes));
  });

  it('mudar o filtro invalida a prévia e a confirmação: é preciso conferir de novo', async () => {
    api.library.previewRemove
      .mockResolvedValueOnce(previaDe([FAIXAS[0] as FaixaDaBiblioteca], 'tok-1'))
      .mockResolvedValueOnce(previaDe(FAIXAS.slice(0, 2), 'tok-2'));
    montar();
    await carregada();
    const d = await abrirRemover();
    await within(d).findByTestId('previa-resumo');
    fireEvent.click(within(d).getByTestId('conferi'));
    expect(within(d).getByTestId('apagar')).toBeEnabled();
    fireEvent.change(within(d).getByTestId('filtro-remover'), { target: { value: 'artist:Azyr' } });
    // enquanto a nova prévia não chega, nada de apagar
    expect(within(d).getByTestId('apagar')).toBeDisabled();
    await waitFor(() => expect(within(d).getByTestId('previa-resumo')).toHaveTextContent('2 faixas'));
    expect((within(d).getByTestId('conferi') as HTMLInputElement).checked).toBe(false);
    expect(within(d).getByTestId('apagar')).toBeDisabled();
  });

  it('filtro que não pega nada: avisa e não deixa apagar', async () => {
    api.library.previewRemove.mockResolvedValue(previaDe([]));
    montar();
    await carregada();
    const d = await abrirRemover();
    expect(await within(d).findByTestId('previa-nenhuma')).toHaveTextContent('Nada será apagado');
    expect(within(d).getByTestId('conferi')).toBeDisabled();
    expect(within(d).getByTestId('apagar')).toBeDisabled();
  });

  it('filtro recusado mostra o motivo na própria janela', async () => {
    api.library.previewRemove.mockResolvedValue({
      ok: false,
      erro: criarErro('biblioteca.filtro-invalido', { motivo: 'opcao' }),
    });
    montar();
    await carregada();
    const d = await abrirRemover();
    expect(await within(d).findByRole('alert')).toHaveTextContent('começam com "-" são opções do beets');
    expect(within(d).getByTestId('apagar')).toBeDisabled();
  });

  it('muitas faixas: pede para digitar o número, e só então libera', async () => {
    const muitas = Array.from({ length: 30 }, (_, i) => faixa(100 + i, { titulo: `Faixa ${i}` }));
    api.library.previewRemove.mockResolvedValue(previaDe(muitas, 'tok-muitas'));
    montar();
    await carregada();
    const d = await abrirRemover();
    expect(await within(d).findByTestId('remocao-em-massa')).toHaveTextContent('Atenção: este filtro pega 30 faixas');
    // só 50 aparecem na lista; aqui são 30, todas
    expect(within(d).getAllByTestId('previa-faixa')).toHaveLength(30);
    fireEvent.click(within(d).getByTestId('conferi'));
    expect(within(d).getByTestId('apagar')).toBeDisabled();
    fireEvent.change(within(d).getByTestId('digitar-numero'), { target: { value: '29' } });
    expect(within(d).getByTestId('apagar')).toBeDisabled();
    fireEvent.change(within(d).getByTestId('digitar-numero'), { target: { value: '30' } });
    expect(within(d).getByTestId('apagar')).toBeEnabled();
    expect(within(d).getByTestId('apagar')).toHaveTextContent('Apagar 30 faixas');
  });

  it('a lista da prévia corta em 50 e diz quantas faltam', async () => {
    const muitas = Array.from({ length: 60 }, (_, i) => faixa(200 + i, { titulo: `F ${i}` }));
    api.library.previewRemove.mockResolvedValue(previaDe(muitas));
    montar();
    await carregada();
    const d = await abrirRemover();
    await within(d).findByTestId('previa-resumo');
    expect(within(d).getAllByTestId('previa-faixa')).toHaveLength(50);
    expect(within(d).getByText('e mais 10 faixas')).toBeInTheDocument();
  });

  it('a biblioteca mudou entre a prévia e a remoção: mostra o aviso, nada some e confere de novo', async () => {
    api.library.previewRemove
      .mockResolvedValueOnce(previaDe([FAIXAS[0] as FaixaDaBiblioteca], 'tok-1'))
      .mockResolvedValueOnce(previaDe([], 'tok-2'));
    api.library.remove.mockResolvedValue({ ok: false, erro: criarErro('biblioteca.mudou') });
    montar();
    await carregada();
    const d = await abrirRemover();
    await within(d).findByTestId('previa-resumo');
    fireEvent.click(within(d).getByTestId('conferi'));
    fireEvent.click(within(d).getByTestId('apagar'));
    expect(await within(d).findByText('A biblioteca mudou desde a pré-visualização')).toBeInTheDocument();
    // a prévia foi refeita sozinha e o botão voltou a exigir a confirmação
    await waitFor(() => expect(api.library.previewRemove).toHaveBeenCalledTimes(2));
    expect(within(d).getByTestId('apagar')).toBeDisabled();
    expect(within(d).queryByTestId('remocao-feita')).toBeNull();
  });

  it('lote rodando: a prévia já avisa', async () => {
    api.library.previewRemove.mockResolvedValue({ ok: false, erro: criarErro('biblioteca.ocupada') });
    montar();
    await carregada();
    const d = await abrirRemover();
    expect(await within(d).findByRole('alert')).toHaveTextContent('Há um lote rodando');
  });

  it('depois de remover uma faixa, "Nova lista com esta faixa" cria a lista com a linha e abre o editor', async () => {
    api.library.previewRemove.mockResolvedValue(previaDe([FAIXAS[0] as FaixaDaBiblioteca]));
    api.library.remove.mockResolvedValue({
      ok: true,
      remocao: { removidas: [{ artista: 'Azyr', titulo: 'No Escape' }] },
    });
    api.lists.create.mockResolvedValue({ nome: 'lista-2026-10-08.txt', tipo: 'txt', modificadaEm: 1, bytes: 0 });
    api.lists.read.mockResolvedValue({
      nome: 'lista-2026-10-08.txt',
      tipo: 'txt',
      modificadaEm: 1,
      bytes: 0,
      texto: '',
      somenteLeitura: false,
    });
    api.lists.save.mockResolvedValue({ nome: 'lista-2026-10-08.txt', tipo: 'txt', modificadaEm: 2, bytes: 22 });
    api.lists.listRecent.mockResolvedValue([]);
    montar();
    await carregada();
    const d = await abrirRemover();
    await within(d).findByTestId('previa-resumo');
    fireEvent.click(within(d).getByTestId('conferi'));
    fireEvent.click(within(d).getByTestId('apagar'));
    await within(d).findByTestId('remocao-feita');
    fireEvent.click(within(d).getByTestId('nova-lista'));
    expect(await screen.findByTestId('local')).toHaveTextContent('/lista');
    expect(api.lists.create).toHaveBeenCalledWith('vazia');
    expect(api.lists.save).toHaveBeenCalledWith('lista-2026-10-08.txt', 'Azyr - No Escape');
  });

  it('cancelar fecha sem apagar nada', async () => {
    api.library.previewRemove.mockResolvedValue(previaDe([FAIXAS[0] as FaixaDaBiblioteca]));
    montar();
    await carregada();
    const d = await abrirRemover();
    await within(d).findByTestId('previa-resumo');
    fireEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.library.remove).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Manutenção

function previaManutencao(
  extra: Partial<Extract<ResultadoPreviaManutencao, { ok: true }>['previa']>,
): ResultadoPreviaManutencao {
  return {
    ok: true,
    previa: { tarefa: 'update', token: 'tok-m', afetadas: 0, linhas: [], totalDeLinhas: 0, esquecidas: 0, ...extra },
  };
}

const tarefa = (id: string) => document.querySelector(`[data-tarefa="${id}"]`) as HTMLElement;

describe('manutenção', () => {
  it('os quatro botões do protótipo, com o texto de cada um', async () => {
    montar();
    await carregada();
    const card = screen.getByTestId('cartao-manutencao');
    for (const t of [
      'Recalcular tom e BPM',
      'Importar o que sobrou em downloads/',
      'Sincronizar com o disco',
      'Reorganizar pastas',
    ]) {
      expect(within(card).getByText(t)).toBeInTheDocument();
    }
    expect(within(card).getByText('1 pasta parada desde ontem, 12:00')).toBeInTheDocument();
  });

  it('update: mostra o que o beets faria; confirma só com o token da prévia', async () => {
    api.library.previewMaintenance.mockResolvedValue(
      previaManutencao({ afetadas: 2, esquecidas: 1, linhas: ['Azyr -  - No Escape', '  deleted'], totalDeLinhas: 2 }),
    );
    api.library.maintenance.mockResolvedValue({ ok: true, id: 'op-1', tarefa: 'update' });
    montar();
    await carregada();
    fireEvent.click(tarefa('update'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(
      await within(d).findByText(/1 faixa será esquecida \(o arquivo não existe mais\) · 1 faixa terá as tags relidas/),
    ).toBeInTheDocument();
    expect(within(d).getByTestId('previa-manutencao')).toHaveTextContent('Azyr - - No Escape');
    expect(api.library.previewMaintenance).toHaveBeenCalledWith('update');
    expect(api.library.maintenance).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByTestId('comecar-manutencao'));
    await waitFor(() => expect(api.library.maintenance).toHaveBeenCalledWith('update', 'tok-m'));
  });

  it('update e move sem nada a fazer: o botão de confirmar não liga', async () => {
    api.library.previewMaintenance.mockResolvedValue(previaManutencao({ afetadas: 0 }));
    montar();
    await carregada();
    fireEvent.click(tarefa('update'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(await within(d).findByText('O banco e o disco estão iguais: não há o que sincronizar.')).toBeInTheDocument();
    expect(within(d).getByTestId('comecar-manutencao')).toBeDisabled();
    fireEvent.click(within(d).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByTestId('dialogo-manutencao')).toBeNull());
    fireEvent.click(tarefa('move'));
    const d2 = await screen.findByTestId('dialogo-manutencao');
    expect(
      await within(d2).findByText('Todos os arquivos já estão onde o padrão de pastas manda.'),
    ).toBeInTheDocument();
    expect(within(d2).getByTestId('comecar-manutencao')).toBeDisabled();
  });

  it('enquanto a prévia não chega, não dá para confirmar update/move', async () => {
    api.library.previewMaintenance.mockReturnValue(new Promise(() => undefined));
    montar();
    await carregada();
    fireEvent.click(tarefa('move'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(await within(d).findByTestId('conferindo')).toBeInTheDocument();
    expect(within(d).getByTestId('comecar-manutencao')).toBeDisabled();
  });

  it('move: mostra quantos arquivos serão movidos', async () => {
    api.library.previewMaintenance.mockResolvedValue(
      previaManutencao({
        tarefa: 'move',
        afetadas: 3,
        linhas: ['Moving 3 items (2 already in place).'],
        totalDeLinhas: 1,
      }),
    );
    montar();
    await carregada();
    fireEvent.click(tarefa('move'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(await within(d).findByText('3 arquivos serão movidos')).toBeInTheDocument();
    expect(within(d).getByTestId('comecar-manutencao')).toBeEnabled();
  });

  it('acompanha a saída ao vivo e mostra "Concluído"; fechar depois do fim limpa o andamento', async () => {
    api.library.previewMaintenance.mockResolvedValue(previaManutencao({ tarefa: 'tomEBpm', token: null }));
    api.library.maintenance.mockResolvedValue({ ok: true, id: 'op-9', tarefa: 'tomEBpm' });
    montar();
    await carregada();
    fireEvent.click(tarefa('tomEBpm'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(within(d).getByText(/Hoje há 2 faixas sem BPM e 2 sem tom/)).toBeInTheDocument();
    fireEvent.click(within(d).getByTestId('comecar-manutencao'));
    await waitFor(() => expect(api.library.maintenance).toHaveBeenCalledWith('tomEBpm', null));
    act(() => {
      useManutencao.getState().aoEvento({ type: 'library.start', id: 'op-9', tarefa: 'tomEBpm' });
      useManutencao.getState().aoEvento({ type: 'library.log', id: 'op-9', linha: '$ beet keyfinder' });
      useManutencao.getState().aoEvento({ type: 'library.log', id: 'op-9', linha: 'keyfinder: found key Am' });
    });
    const andamento = await screen.findByTestId('manutencao-andamento');
    expect(andamento).toHaveAttribute('data-fim', 'nao');
    expect(within(andamento).getByTestId('saida-manutencao')).toHaveTextContent('keyfinder: found key Am');
    expect(within(andamento).getByText('Rodando')).toBeInTheDocument();
    act(() => useManutencao.getState().aoEvento({ type: 'library.end', id: 'op-9', tarefa: 'tomEBpm', ok: true }));
    await waitFor(() => expect(screen.getByTestId('manutencao-andamento')).toHaveAttribute('data-fim', 'sim'));
    expect(screen.getByText('Concluído')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('dialogo-manutencao')).toBeNull());
    expect(useManutencao.getState().operacao).toBeNull();
  });

  it('terminou com erro: mostra o cartão do erro com a saída do beets', async () => {
    api.library.previewMaintenance.mockResolvedValue(previaManutencao({ tarefa: 'tomEBpm', token: null }));
    api.library.maintenance.mockResolvedValue({ ok: true, id: 'op-2', tarefa: 'tomEBpm' });
    montar();
    await carregada();
    fireEvent.click(tarefa('tomEBpm'));
    const d = await screen.findByTestId('dialogo-manutencao');
    fireEvent.click(within(d).getByTestId('comecar-manutencao'));
    await screen.findByTestId('manutencao-andamento');
    act(() => {
      useManutencao.getState().aoEvento({ type: 'library.start', id: 'op-2', tarefa: 'tomEBpm' });
      useManutencao.getState().aoEvento({
        type: 'library.end',
        id: 'op-2',
        tarefa: 'tomEBpm',
        ok: false,
        error: criarErro('biblioteca.falhou', { tarefa: 'recalcular o tom e o BPM', detalhes: 'keyfinder: erro' }),
      });
    });
    const cartao = await within(screen.getByTestId('dialogo-manutencao')).findByRole('alert');
    expect(cartao).toHaveTextContent('Não consegui recalcular o tom e o BPM');
    expect(cartao).toHaveTextContent('keyfinder: erro');
  });

  it('com um lote rodando, o erro aparece na própria conferência', async () => {
    api.library.previewMaintenance.mockResolvedValue({ ok: false, erro: criarErro('biblioteca.ocupada') });
    montar();
    await carregada();
    fireEvent.click(tarefa('update'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(await within(d).findByRole('alert')).toHaveTextContent('Há um lote rodando');
    expect(within(d).getByTestId('comecar-manutencao')).toBeDisabled();
  });

  it('importar o que sobrou: lista o que está parado e começa sem token', async () => {
    api.library.previewMaintenance.mockResolvedValue(previaManutencao({ tarefa: 'importLeftovers', token: null }));
    api.library.maintenance.mockResolvedValue({ ok: true, id: 'op-3', tarefa: 'importLeftovers' });
    montar();
    await carregada();
    fireEvent.click(tarefa('importLeftovers'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(within(d).getByTestId('parados-lista')).toHaveTextContent('downloads/f_hard');
    expect(within(d).getByTestId('parados-lista')).toHaveTextContent('1 arquivo: Vengeance Of The Masked.mp3');
    fireEvent.click(within(d).getByTestId('comecar-manutencao'));
    await waitFor(() => expect(api.library.maintenance).toHaveBeenCalledWith('importLeftovers', null));
  });

  it('sem nada parado, importar não liga', async () => {
    api.library.list.mockResolvedValue(lerOk(leitura({ parados: [] })));
    api.library.previewMaintenance.mockResolvedValue(previaManutencao({ tarefa: 'importLeftovers', token: null }));
    montar();
    await carregada();
    fireEvent.click(tarefa('importLeftovers'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(within(d).getByText('Nada parado em downloads/: o beets importou tudo.')).toBeInTheDocument();
    expect(within(d).getByTestId('comecar-manutencao')).toBeDisabled();
  });

  it('com uma tarefa rodando, as outras ficam desligadas e "Ver andamento" reabre a que roda', async () => {
    useManutencao.setState({
      operacao: { id: 'op-5', tarefa: 'tomEBpm', linhas: ['$ beet keyfinder'], terminou: false, erro: null },
    });
    montar();
    await carregada();
    expect(tarefa('update')).toBeDisabled();
    expect(tarefa('move')).toBeDisabled();
    expect(tarefa('importLeftovers')).toBeDisabled();
    expect(tarefa('tomEBpm')).toBeEnabled();
    fireEvent.click(screen.getByTestId('ver-andamento'));
    const andamento = await screen.findByTestId('manutencao-andamento');
    expect(andamento).toHaveAttribute('data-fim', 'nao');
    expect(within(andamento).getByTestId('saida-manutencao')).toHaveTextContent('$ beet keyfinder');
    // reabrir não pede conferência nenhuma: a tarefa já está rodando
    expect(api.library.previewMaintenance).not.toHaveBeenCalled();
  });

  it('tomEBpm quando tudo já tem tom e BPM: não há o que calcular', async () => {
    api.library.list.mockResolvedValue(lerOk(leitura({ faixas: [faixa(1)], parados: [] })));
    montar();
    await carregada();
    fireEvent.click(tarefa('tomEBpm'));
    const d = await screen.findByTestId('dialogo-manutencao');
    expect(within(d).getByText('Todas as faixas já têm tom e BPM: não há o que calcular.')).toBeInTheDocument();
    expect(within(d).getByTestId('comecar-manutencao')).toBeDisabled();
  });
});

// ---------------------------------------------------------------- Eventos do main

describe('eventos do main', () => {
  function ligar() {
    let ouvinte: (e: MainEvent) => void = () => undefined;
    api.onEvent.mockImplementation((fn: (e: MainEvent) => void) => {
      ouvinte = fn;
      return () => undefined;
    });
    const qc = new QueryClient();
    const invalida = vi.spyOn(qc, 'invalidateQueries');
    const parar = ligarEventos(qc, vi.fn());
    return { enviar: (e: MainEvent) => act(() => ouvinte(e)), invalida, parar };
  }

  it('library.start, log e end alimentam o andamento; o fim manda reler a biblioteca', () => {
    const { enviar, invalida, parar } = ligar();
    enviar({ type: 'library.start', id: 'a', tarefa: 'update' });
    enviar({ type: 'library.log', id: 'a', linha: 'primeira' });
    enviar({ type: 'library.log', id: 'outra', linha: 'de outra operação' });
    expect(useManutencao.getState().operacao).toMatchObject({
      id: 'a',
      tarefa: 'update',
      linhas: ['primeira'],
      terminou: false,
    });
    expect(invalida).not.toHaveBeenCalled();
    enviar({ type: 'library.end', id: 'a', tarefa: 'update', ok: false, error: criarErro('biblioteca.falhou') });
    expect(useManutencao.getState().operacao).toMatchObject({ terminou: true, erro: { codigo: 'biblioteca.falhou' } });
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['biblioteca'] });
    parar();
  });

  it('um lote que termina manda reler a biblioteca (ele importou faixas)', () => {
    const { enviar, invalida, parar } = ligar();
    const fim = lerLinhaEvento(
      '{"v":1,"t":"2026-10-07T15:48:35.767-03:00","type":"run.end","reason":"completed","exitCode":0,"message":"","summary":{},"files":{}}',
    );
    if (!fim) throw new Error('evento de teste inválido');
    enviar({ type: 'batch.events', runId: '20261007-154809', desde: 0, eventos: [fim] });
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['biblioteca'] });
    parar();
  });

  it('reconectar: a tarefa que já roda no main volta ao cartão Manutenção', async () => {
    api.library.running.mockResolvedValue({ id: 'op-7', tarefa: 'move' });
    await useManutencao.getState().reconectar();
    expect(useManutencao.getState().operacao).toMatchObject({ id: 'op-7', tarefa: 'move', terminou: false });
    // e não atropela uma operação que a tela já conhece
    api.library.running.mockResolvedValue({ id: 'op-8', tarefa: 'update' });
    await useManutencao.getState().reconectar();
    expect(useManutencao.getState().operacao?.id).toBe('op-7');
  });
});
