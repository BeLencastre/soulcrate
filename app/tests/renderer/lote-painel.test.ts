import { describe, expect, it } from 'vitest';
import type { EventoLote, RunEnd } from '../../src/shared/eventos-lote';
import { aplicarEventos, criarFimSintetico, estadoInicialLote } from '../../src/shared/lote-estado';
import { avisoDaLinha, marcadoresDoEditor } from '../../src/renderer/lib/lote-lista';
import {
  chaveDoEstado,
  corDoEstado,
  dataCurta,
  duracaoDoLote,
  erroDoFim,
  faixaDoPainel,
  formatarDuracao,
  haQuanto,
  horaCurta,
  pausadoAte,
} from '../../src/renderer/lib/lote-painel';
import type { LinhaAnalise } from '../../src/shared/analise-lista';

const T0 = Date.parse('2026-10-07T22:30:00-03:00');
const iso = (ms: number) => new Date(ms).toISOString();
const base = (ms: number) => ({ v: 1, t: iso(ms) }) as const;

const start = (ms = T0): EventoLote => ({
  ...base(ms),
  type: 'run.start',
  id: 'x',
  pid: 1,
  list: 'set.txt',
  listName: 'set',
  total: 30,
  options: { BuscasPorJanela: 30 },
  files: {},
  powershell: '5.1',
});
const fim = (reason: RunEnd['reason'], exitCode: RunEnd['exitCode'], message = '', ms = T0 + 60_000): EventoLote => ({
  ...base(ms),
  type: 'run.end',
  reason,
  exitCode,
  message,
  summary: {},
  files: {},
});
const estado = (...evs: EventoLote[]) => aplicarEventos(estadoInicialLote(), evs);

describe('estado do chip', () => {
  it('antes do run.start: "Iniciando"; depois: "Rodando"', () => {
    expect(chaveDoEstado(estado(), T0)).toBe('preparando');
    expect(chaveDoEstado(estado(start()), T0)).toBe('rodando');
  });

  it('buscas pausadas só enquanto o horário ainda não passou', () => {
    const pausado = estado(start(), {
      ...base(T0),
      type: 'search.paused',
      until: iso(T0 + 15 * 60_000),
      minutes: 15,
      reason: 'x',
    });
    expect(chaveDoEstado(pausado, T0 + 60_000)).toBe('pausado');
    expect(pausadoAte(pausado, T0 + 60_000)).not.toBeNull();
    expect(chaveDoEstado(pausado, T0 + 16 * 60_000)).toBe('rodando');
    expect(pausadoAte(pausado, T0 + 16 * 60_000)).toBeNull();
  });

  it('parando e os fins', () => {
    expect(chaveDoEstado(estado(start(), { ...base(T0), type: 'run.stopping', reason: 'user' }), T0)).toBe('parando');
    expect(chaveDoEstado(estado(start(), fim('completed', 0)), T0)).toBe('completed');
    expect(chaveDoEstado(estado(start(), fim('user', 2)), T0)).toBe('user');
    expect(chaveDoEstado(estado(start(), fim('slskd_down', 3)), T0)).toBe('slskd_down');
  });

  it('cores: concluído verde, parado neutro, erros vermelhos, interrompido laranja', () => {
    expect(corDoEstado('completed')).toBe('verde');
    expect(corDoEstado('user')).toBe('neutro');
    expect(corDoEstado('config')).toBe('vermelho');
    expect(corDoEstado('interrupted')).toBe('laranja');
    expect(corDoEstado('rodando')).toBe('azul');
  });
});

describe('faixa de aviso do painel', () => {
  it('sem nada de especial: nenhuma faixa', () => {
    expect(faixaDoPainel(estado(start()), T0)).toBeNull();
  });

  it('iniciando: aguarda o primeiro sinal do script', () => {
    expect(faixaDoPainel(estado(), T0)).toMatchObject({ id: 'iniciando', tom: 'azul' });
  });

  it('limite de buscas atingido, com os números do próprio lote', () => {
    const e = estado(start(), { ...base(T0), type: 'search.windowFull', full: true, limit: 30, windowSeconds: 220 });
    const f = faixaDoPainel(e, T0);
    expect(f).toMatchObject({ id: 'janela', tom: 'azul', titulo: 'Limite de buscas atingido', pulsa: true });
    expect(f?.texto).toContain('30 buscas a cada 220 s');
  });

  it('buscas pausadas até HH:mm (laranja); a pausa vence a janela cheia', () => {
    const e = estado(
      start(),
      { ...base(T0), type: 'search.windowFull', full: true, limit: 30, windowSeconds: 220 },
      { ...base(T0), type: 'search.paused', until: iso(T0 + 900_000), minutes: 15, reason: 'x' },
    );
    const f = faixaDoPainel(e, T0 + 1000);
    expect(f?.id).toBe('pausado');
    expect(f?.tom).toBe('laranja');
    expect(f?.titulo).toMatch(/^Buscas pausadas até \d{2}:\d{2}$/);
    expect(f?.titulo).toContain(horaCurta(iso(T0 + 900_000)));
  });

  it('parando: "Finalizando e gravando relatórios…" (âmbar)', () => {
    const f = faixaDoPainel(estado(start(), { ...base(T0), type: 'run.stopping', reason: 'user' }), T0);
    expect(f).toMatchObject({ id: 'parando', tom: 'ambar', titulo: 'Finalizando e gravando relatórios…' });
  });

  it('conferindo o catálogo mostra o andamento', () => {
    const f = faixaDoPainel(estado(start(), { ...base(T0), type: 'catalog.progress', done: 3, total: 12 }), T0);
    expect(f?.texto).toContain('3/12');
  });

  it('parado pelo usuário: relatórios gravados (verde); concluído: lote concluído (verde)', () => {
    expect(faixaDoPainel(estado(start(), fim('user', 2)), T0)).toMatchObject({ id: 'gravados', tom: 'verde' });
    expect(faixaDoPainel(estado(start(), fim('completed', 0)), T0)).toMatchObject({ id: 'concluido', tom: 'verde' });
  });

  it('fim com erro não tem faixa verde (tem o cartão de erro)', () => {
    expect(faixaDoPainel(estado(start(), fim('config', 4, 'x')), T0)).toBeNull();
    expect(faixaDoPainel(estado(start(), criarFimSintetico('sumiu', iso(T0))), T0)).toBeNull();
  });

  it('aviso do script (slskd fora) vale só por um tempo', () => {
    const e = estado(start(), {
      ...base(T0),
      type: 'warning',
      code: 'slskd_unreachable',
      message: 'slskd não respondeu (2 de 5)',
    });
    expect(faixaDoPainel(e, T0 + 10_000)).toMatchObject({ tom: 'laranja', titulo: 'O slskd não respondeu' });
    expect(faixaDoPainel(e, T0 + 10_000)?.texto).toBe('slskd não respondeu (2 de 5)');
    expect(faixaDoPainel(e, T0 + 5 * 60_000)).toBeNull();
  });
});

describe('erro do fim', () => {
  const e = (reason: RunEnd['reason'], exitCode: RunEnd['exitCode'], message = '') =>
    estado(start(), fim(reason, exitCode, message)).fim as RunEnd;

  it('concluído e parado pelo usuário não são erro', () => {
    expect(erroDoFim(e('completed', 0), 'set.txt')).toBeNull();
    expect(erroDoFim(e('user', 2), 'set.txt')).toBeNull();
    expect(erroDoFim(null, null)).toBeNull();
  });

  it.each([
    ['slskd_down', 3, 'lote.slskd-fora'],
    ['config', 4, 'lote.config'],
    ['locked', 5, 'lote.lista-rodando'],
    ['interrupted', 130, 'lote.interrompido'],
    ['error', 1, 'lote.erro'],
  ] as const)('%s → %s, com a mensagem do script nos detalhes', (reason, code, esperado) => {
    const erro = erroDoFim(e(reason, code, 'mensagem do script'), 'set.txt');
    expect(erro?.codigo).toBe(esperado);
    expect(erro?.detalhes).toBe('mensagem do script');
  });

  it('lista já rodando cita a lista no título', () => {
    expect(erroDoFim(e('locked', 5), 'set.txt')?.titulo).toBe('set.txt já está rodando');
  });
});

describe('tempos', () => {
  it('formatarDuracao', () => {
    expect(formatarDuracao(5_000)).toBe('5 s');
    expect(formatarDuracao(18 * 60_000)).toBe('18 min');
    expect(formatarDuracao(65 * 60_000)).toBe('1 h 05 min');
    expect(formatarDuracao(-1)).toBe('0 s');
  });

  it('haQuanto', () => {
    expect(haQuanto(12_000)).toBe('12 s');
    expect(haQuanto(3 * 60_000)).toBe('3 min');
    expect(haQuanto(5 * 3_600_000)).toBe('5 h');
    expect(haQuanto(4 * 86_400_000)).toBe('4 d');
  });

  it('duração: até agora enquanto roda, até o run.end depois', () => {
    expect(duracaoDoLote(estado(), T0)).toBeNull();
    expect(duracaoDoLote(estado(start()), T0 + 18 * 60_000)).toBe(18 * 60_000);
    expect(duracaoDoLote(estado(start(), fim('completed', 0, '', T0 + 5 * 60_000)), T0 + 99 * 60_000)).toBe(5 * 60_000);
  });

  it('dataCurta é dd/MM', () => {
    expect(dataCurta(new Date(2026, 9, 4, 12).getTime())).toBe('04/10');
  });
});

describe('pré-visualização da lista', () => {
  const linha = (extra: Partial<LinhaAnalise>): LinhaAnalise => ({
    sourceLine: 1,
    line: 'A - B',
    key: 'a b',
    artist: 'A',
    title: 'B',
    mix: '',
    original: true,
    remixer: false,
    queries: [],
    status: 'nova',
    duplicateOf: null,
    previous: null,
    warnings: [],
    ...extra,
  });

  it('o estado vale mais que o alerta de leitura', () => {
    expect(avisoDaLinha(linha({}))).toBeNull();
    expect(avisoDaLinha(linha({ status: 'repetida', duplicateOf: 2 }))).toEqual({
      texto: 'Duplicada · linha 2',
      cor: 'laranja',
    });
    expect(avisoDaLinha(linha({ status: 'ja na biblioteca' }))).toEqual({ texto: 'Já na biblioteca', cor: 'cinza' });
    expect(avisoDaLinha(linha({ status: 'ja feita' }))).toEqual({ texto: 'Feita em execução anterior', cor: 'cinza' });
  });

  it('alertas de leitura do script viram os textos do protótipo', () => {
    expect(
      avisoDaLinha(linha({ warnings: ["sem ' - ' entre artista e titulo: a linha inteira vira o titulo"] })),
    ).toEqual({
      texto: 'Falta o " - "',
      cor: 'laranja',
    });
    expect(avisoDaLinha(linha({ warnings: ['titulo vazio'] }))?.texto).toBe('Título vazio');
    expect(avisoDaLinha(linha({ warnings: ['o artista da linha e o remixer: aceito livremente'] }))).toEqual({
      texto: 'Artista é o remixer: aceita qualquer original',
      cor: 'azul',
    });
    expect(avisoDaLinha(linha({ warnings: ['outra coisa'] }))?.texto).toBe('outra coisa');
  });

  it('marcadores do editor: verde para o que baixa, laranja para problema, cinza para o que pula, azul para informação', () => {
    const m = marcadoresDoEditor([
      linha({ sourceLine: 2 }),
      linha({ sourceLine: 3, status: 'repetida', duplicateOf: 2 }),
      linha({ sourceLine: 4, status: 'ja feita' }),
      linha({ sourceLine: 5, warnings: ['o artista da linha e o remixer'] }),
      linha({ sourceLine: 6, warnings: ['titulo vazio'] }),
    ]);
    expect([...m.entries()]).toEqual([
      [2, 'verde'],
      [3, 'laranja'],
      [4, 'cinza'],
      [5, 'azul'],
      [6, 'laranja'],
    ]);
  });
});
