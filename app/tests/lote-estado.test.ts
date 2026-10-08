import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerLinhaEvento, STATUS_EM_ANDAMENTO, STATUS_FINAIS, type EventoLote } from '../src/shared/eventos-lote';
import {
  aplicarEventos,
  contagemVazia,
  contarFaixas,
  contarPorGrupo,
  criarFimSintetico,
  estadoInicialLote,
  filtrarFaixas,
  infoDoStatus,
  observacaoDaFaixa,
  resumirFim,
  segmentosDaBarra,
  separarLinha,
  type EstadoLote,
  type FaixaLote,
} from '../src/shared/lote-estado';

const fixture = (nome: string) => fileURLToPath(new URL(`./fixtures/lote/${nome}`, import.meta.url));
const eventos = (nome: string): EventoLote[] =>
  readFileSync(fixture(nome), 'utf8')
    .split('\n')
    .map(lerLinhaEvento)
    .filter((e): e is EventoLote => e !== null);

const aplicar = (evs: EventoLote[], base: EstadoLote = estadoInicialLote()) => aplicarEventos(base, evs);

describe('execução completa (fixture real do baixar-lista.ps1)', () => {
  const evs = eventos('eventos-completo.jsonl');
  const fim = aplicar(evs);

  it('termina como concluída, com todas as faixas e o resumo do run.end', () => {
    expect(fim.fase).toBe('terminou');
    expect(fim.fim?.reason).toBe('completed');
    expect(fim.runId).toBe('exemplo');
    expect(fim.total).toBe(6);
    expect(fim.faixas).toHaveLength(6);
    expect(fim.eventosAplicados).toBe(evs.length);
  });

  it('numera as faixas na ordem da lista e guarda a linha original', () => {
    expect(fim.faixas.map((f) => f.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fim.faixas[0]?.linha).toBe('Azyr - No Escape');
    expect(fim.faixas[4]?.linha).toBe('Byørn - 2 LOUD');
  });

  it('as contagens batem com o resumo do script', () => {
    expect(fim.contagem.concluidas).toBe(6);
    expect(fim.contagem.baixadas).toBe(4);
    expect(fim.contagem.naoAchadas).toBe(2);
    expect(fim.contagem.falhas).toBe(0);
    expect(fim.contagem.aguardando + fim.contagem.buscando + fim.contagem.baixando + fim.contagem.beets).toBe(0);
    expect(fim.fim && resumirFim(fim.fim.summary)).toEqual({ ok: 4, naoAchadas: 2, falhas: 0, puladas: 0 });
  });

  it('guarda usuário, formato e arquivo da faixa que baixou, e a observação do que não achou', () => {
    const azyr = fim.faixas[0] as FaixaLote;
    expect(azyr).toMatchObject({ status: 'baixada', usuario: 'u1', formato: 'MP3 320', tentativa: 2 });
    expect(azyr.local).toBe('downloads/Azyr/Azyr - No Escape.mp3');
    const plague = fim.faixas[2] as FaixaLote;
    expect(plague.temDiagnostico).toBe(true);
    expect(observacaoDaFaixa(plague)).toMatch(/formato\/qualidade recusados/);
  });

  it('a cada evento `progress`, as contagens derivadas dos itens batem com as do script', () => {
    let estado = estadoInicialLote();
    let conferidos = 0;
    for (const ev of evs) {
      estado = aplicarEventos(estado, [ev]);
      if (ev.type !== 'progress') continue;
      conferidos++;
      expect(estado.contagem.concluidas, `done em ${ev.t}`).toBe(ev.done);
      expect(estado.contagem.baixadas, 'ok').toBe(ev.ok);
      expect(estado.contagem.naoAchadas, 'notFound').toBe(ev.notFound);
      expect(estado.contagem.falhas, 'failed').toBe(ev.failed);
      expect(estado.contagem.buscando, 'searching').toBe(ev.searching);
      expect(estado.contagem.aguardando, 'waiting').toBe(ev.waiting);
    }
    expect(conferidos).toBeGreaterThan(3);
  });

  it('aplicar em pedaços dá o mesmo estado que aplicar tudo de uma vez', () => {
    let pedacos = estadoInicialLote();
    for (let i = 0; i < evs.length; i += 5) pedacos = aplicarEventos(pedacos, evs.slice(i, i + 5));
    expect(pedacos).toEqual(fim);
  });

  it('não altera o estado anterior', () => {
    const antes = aplicar(evs.slice(0, 10));
    const copia = structuredClone(antes);
    aplicarEventos(antes, evs.slice(10));
    expect(antes).toEqual(copia);
  });
});

describe('execução parada pelo usuário', () => {
  it('passa por "parando" e termina como parada, com a faixa interrompida ainda em andamento', () => {
    const evs = eventos('eventos-parado.jsonl');
    const ateParar = aplicar(evs.slice(0, evs.findIndex((e) => e.type === 'run.stopping') + 1));
    expect(ateParar.fase).toBe('parando');
    expect(ateParar.fim).toBeNull();

    const fim = aplicar(evs);
    expect(fim.fase).toBe('terminou');
    expect(fim.fim?.reason).toBe('user');
    expect(fim.faixas[0]).toMatchObject({ status: 'baixando', usuario: 'lento', naFilaDoUsuario: true });
    expect(fim.contagem).toMatchObject({ naFila: 1, baixando: 0, concluidas: 0 });
  });
});

describe('execução que falhou logo no começo', () => {
  it('API key recusada: run.start e run.end, sem faixas, motivo de configuração', () => {
    const fim = aplicar(eventos('eventos-erro-config.jsonl'));
    expect(fim.fase).toBe('terminou');
    expect(fim.fim?.reason).toBe('config');
    expect(fim.faixas).toHaveLength(0);
  });

  it('só o run.end (lista inexistente, lista já rodando): termina sem nunca ter começado', () => {
    const fim = aplicar([eventos('eventos-erro-config.jsonl').at(-1) as EventoLote]);
    expect(fim.fase).toBe('terminou');
    expect(fim.inicio).toBeNull();
    expect(fim.faixas).toHaveLength(0);
  });
});

describe('detalhes do protocolo', () => {
  const t = '2026-10-07T16:10:02.994-03:00';
  const base = { v: 1, t } as const;
  const status = (key: string, st: string, extra: object = {}): EventoLote =>
    ({ ...base, type: 'item.status', key, line: `A - ${key}`, status: st, ...extra }) as EventoLote;

  it('antes do run.start a fase é "aguardando"; depois, "rodando"', () => {
    expect(estadoInicialLote().fase).toBe('aguardando');
    const e = aplicar([
      {
        ...base,
        type: 'run.start',
        id: 'x',
        pid: 1,
        list: 'a.txt',
        listName: 'a',
        total: 2,
        options: {},
        files: {},
        powershell: '5.1',
      },
    ]);
    expect(e.fase).toBe('rodando');
    expect(e.total).toBe(2);
  });

  it('faixa que volta a ser buscada esquece o usuário da tentativa que falhou', () => {
    const e = aplicar([
      status('k', 'baixando', { user: 'u1', format: 'FLAC', attempt: 1, remoteQueued: false }),
      { ...base, type: 'item.attemptFailed', key: 'k', user: 'u1', attempt: 1, reason: 'u1: Completed, Errored' },
      status('k', 'pronta', { candidates: 2 }),
    ]);
    expect(e.faixas[0]).toMatchObject({ status: 'pronta', usuario: null, formato: null, candidatos: 2 });
    expect(observacaoDaFaixa(e.faixas[0] as FaixaLote)).toBe(
      '2 candidatos · tentativa anterior falhou (u1: u1: Completed, Errored)',
    );
  });

  it('na fila do usuário é "baixando" com remoteQueued', () => {
    const e = aplicar([status('k', 'baixando', { user: 'u', format: 'FLAC', attempt: 1, remoteQueued: true })]);
    expect(e.contagem).toMatchObject({ naFila: 1, baixando: 0 });
    expect(infoDoStatus('baixando', true).rotulo).toBe('Na fila do usuário');
  });

  it('beets: importar e importando contam como "Organizando"; o usuário que baixou fica', () => {
    const e = aplicar([
      status('k', 'baixando', { user: 'u', format: 'FLAC', attempt: 1, remoteQueued: false }),
      status('k', 'importar'),
      status('j', 'importando'),
    ]);
    expect(e.contagem.beets).toBe(2);
    expect(e.faixas[0]).toMatchObject({ usuario: 'u', formato: 'FLAC' });
  });

  it('catálogo: mostra o andamento da conferência e some ao terminar; título corrigido vira observação', () => {
    let e = aplicar([status('k', 'pendente'), { ...base, type: 'catalog.progress', done: 1, total: 3 }]);
    expect(e.catalogo).toEqual({ feitas: 1, total: 3 });
    e = aplicar(
      [
        {
          ...base,
          type: 'catalog.result',
          key: 'k',
          line: 'A - k',
          result: 'CORRIGIDO',
          searchLine: 'A - Kk',
          similar: [],
          detail: '',
        },
        { ...base, type: 'catalog.progress', done: 3, total: 3 },
      ],
      e,
    );
    expect(e.catalogo).toBeNull();
    expect(observacaoDaFaixa(e.faixas[0] as FaixaLote)).toContain('título corrigido: A - Kk');
  });

  it('buscas pausadas e limite de buscas: valem até o `progress` ou o evento dizer o contrário', () => {
    let e = aplicar([{ ...base, type: 'search.paused', until: '2026-10-07T22:47:00-03:00', minutes: 15, reason: 'x' }]);
    expect(e.buscasPausadasAte).toBe('2026-10-07T22:47:00-03:00');
    e = aplicar([{ ...base, type: 'search.windowFull', full: true, limit: 30, windowSeconds: 220 }], e);
    expect(e.janelaCheia).toBe(true);
    e = aplicar(
      [
        {
          ...base,
          type: 'progress',
          done: 0,
          total: 1,
          searching: 0,
          downloading: 0,
          remoteQueued: 0,
          waiting: 1,
          beets: 0,
          ok: 0,
          notFound: 0,
          failed: 0,
          etaMin: null,
          searchesPausedUntil: null,
          searchWindowFull: false,
        },
      ],
      e,
    );
    expect(e.buscasPausadasAte).toBeNull();
    expect(e.janelaCheia).toBe(false);
  });

  it('aviso do mesmo tipo substitui o anterior', () => {
    const w = (n: number): EventoLote => ({
      ...base,
      type: 'warning',
      code: 'slskd_unreachable',
      message: `falha ${n}`,
      streak: n,
    });
    const e = aplicar([w(1), w(2)]);
    expect(e.avisos).toHaveLength(1);
    expect(e.avisos[0]?.mensagem).toBe('falha 2');
  });

  it('fim inventado pelo app: interrompido, sem resumo', () => {
    const e = aplicar([criarFimSintetico('o processo sumiu', t)]);
    expect(e.fase).toBe('terminou');
    expect(e.fim).toMatchObject({ reason: 'interrupted', exitCode: 130, message: 'o processo sumiu' });
  });
});

describe('mapa de status (Apêndice B)', () => {
  it('todo status do protocolo tem rótulo, grupo e cor', () => {
    for (const s of [...STATUS_EM_ANDAMENTO, ...STATUS_FINAIS]) {
      const i = infoDoStatus(s);
      expect(i.rotulo, s).not.toBe(s);
      expect(i.rotulo.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['pendente', 'Aguardando', 'neutro', 'andamento'],
    ['buscando', 'Buscando', 'azul', 'andamento'],
    ['verificar', 'Buscando', 'azul', 'andamento'],
    ['pronta', 'Aguardando vaga', 'neutro', 'andamento'],
    ['baixando', 'Baixando', 'azul', 'andamento'],
    ['importar', 'Organizando (beets)', 'roxo', 'andamento'],
    ['importando', 'Organizando (beets)', 'roxo', 'andamento'],
    ['importada', 'Na biblioteca', 'verde', 'concluida'],
    ['baixada', 'Baixada (não organizada)', 'verdec', 'concluida'],
    ['baixada (beets falhou)', 'Baixada, beets falhou', 'laranja', 'atencao'],
    ['ja na biblioteca', 'Já estava na biblioteca', 'cinza', 'pulada'],
    ['ja feita', 'Feita em execução anterior', 'cinza', 'pulada'],
    ['nao encontrada', 'Não encontrada', 'vermelho', 'atencao'],
    ['falhou', 'Falhou', 'vermelho', 'atencao'],
  ])('%s → %s (%s, %s)', (status, rotulo, cor, grupo) => {
    expect(infoDoStatus(status)).toEqual({ rotulo, cor, grupo });
  });
});

describe('filtros e busca da tabela', () => {
  const faixa = (n: number, linha: string, status: string): FaixaLote => ({
    n,
    key: linha,
    linha,
    status,
    naFilaDoUsuario: false,
    formato: null,
    usuario: null,
    tentativa: null,
    nota: '',
    linhaBusca: null,
    busca: null,
    candidatos: null,
    ultimaFalha: null,
    temDiagnostico: false,
    local: null,
  });
  const faixas = [
    faixa(1, 'Azyr - No Escape', 'importada'),
    faixa(2, 'Vendex - Abaddon', 'nao encontrada'),
    faixa(3, 'Byørn - 2 LOUD', 'baixando'),
    faixa(4, 'Novah - ACID', 'ja feita'),
  ];

  it('conta por grupo', () => {
    expect(contarPorGrupo(faixas)).toEqual({ todas: 4, andamento: 1, concluida: 1, atencao: 1, pulada: 1 });
  });

  it('filtra por grupo', () => {
    expect(filtrarFaixas(faixas, 'atencao', '').map((f) => f.n)).toEqual([2]);
    expect(filtrarFaixas(faixas, 'todas', '')).toHaveLength(4);
  });

  it('busca sem diferenciar maiúsculas nem acentos', () => {
    expect(filtrarFaixas(faixas, 'todas', 'BYORN').map((f) => f.n)).toEqual([3]);
    expect(filtrarFaixas(faixas, 'todas', 'vendex abad').map((f) => f.n)).toEqual([]);
    expect(filtrarFaixas(faixas, 'todas', 'abaddon').map((f) => f.n)).toEqual([2]);
    expect(filtrarFaixas(faixas, 'concluida', 'abaddon')).toEqual([]);
  });

  it('separa artista e título no primeiro " - "', () => {
    expect(separarLinha('Azyr - No Escape')).toEqual({ artista: 'Azyr', titulo: 'No Escape' });
    expect(separarLinha('A - B - C')).toEqual({ artista: 'A', titulo: 'B - C' });
    expect(separarLinha('Sem traço')).toEqual({ artista: '', titulo: 'Sem traço' });
  });
});

describe('barra de progresso por faixa', () => {
  const c = (parcial: Partial<ReturnType<typeof contagemVazia>>) => ({ ...contagemVazia(), ...parcial });
  const resumo = (s: ReturnType<typeof segmentosDaBarra>) =>
    s.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.cor]: (acc[x.cor] ?? 0) + 1 }), {});

  it('uma célula por faixa, na ordem baixadas, atenção, puladas, andamento, beets, aguardando', () => {
    const s = segmentosDaBarra(c({ baixadas: 10, naoAchadas: 2, puladas: 2, baixando: 5, beets: 2 }), 30);
    expect(s).toHaveLength(30);
    expect(resumo(s)).toEqual({ verde: 10, vermelho: 2, cinza: 2, azul: 5, roxo: 2, vazio: 9 });
    expect(s.map((x) => x.cor).join(',')).toMatch(/^(verde,){10}(vermelho,){2}(cinza,){2}(azul,){5}(roxo,){2}vazio/);
    expect(s.filter((x) => x.ativo)).toHaveLength(7);
  });

  it('com muitas faixas, fica proporcional e nunca passa do máximo de células', () => {
    const s = segmentosDaBarra(c({ baixadas: 500, naoAchadas: 100, baixando: 5 }), 1000, 60);
    expect(s).toHaveLength(60);
    expect(resumo(s).verde).toBe(30);
    expect(resumo(s).vermelho).toBe(6);
    expect(resumo(s).azul ?? 0).toBeLessThanOrEqual(1);
  });

  it('faixa que existe nunca some da barra por arredondamento só se couber uma célula', () => {
    const s = segmentosDaBarra(c({ naoAchadas: 1 }), 1000, 60);
    expect(s).toHaveLength(60);
    expect(s.every((x) => x.cor === 'vazio')).toBe(true); // 1/1000 de 60 células não chega a uma célula
    const s2 = segmentosDaBarra(c({ naoAchadas: 1 }), 30);
    expect(resumo(s2).vermelho).toBe(1);
  });

  it('sem faixas, sem barra', () => {
    expect(segmentosDaBarra(contagemVazia(), 0)).toEqual([]);
  });

  it('contarFaixas e a barra concordam num lote de 1.000 faixas', () => {
    const faixas = Array.from(
      { length: 1000 },
      (_, i) => ({ status: i < 400 ? 'importada' : i < 450 ? 'nao encontrada' : 'pendente' }) as FaixaLote,
    );
    const cont = contarFaixas(faixas);
    expect(cont).toMatchObject({ baixadas: 400, naoAchadas: 50, aguardando: 550, concluidas: 450 });
    const s = segmentosDaBarra(cont, 1000);
    expect(resumo(s)).toEqual({ verde: 24, vermelho: 3, vazio: 33 });
  });
});
