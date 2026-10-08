import { describe, expect, it, vi } from 'vitest';
import type { ExecucaoResumo } from '../../src/shared/historico';
// o módulo também tem os hooks de consulta, que importam o `window.soulcrate`; aqui só as regras puras importam
vi.mock('../../src/renderer/lib/api', () => ({ api: {} }));
const {
  destinoDaExecucao,
  filtrarExecucoes,
  fonteDaLinha,
  formatarBytes,
  resumoDaLinha,
  rotuloDoFim,
  segmentosDaLinha,
} = await import('../../src/renderer/lib/historico');

const r = (extra: Partial<ExecucaoResumo> = {}): ExecucaoResumo => ({
  id: '20261007-210200',
  inicio: 0,
  duracaoMs: 1000,
  lista: 'lista.txt',
  fonte: 'eventos',
  fim: 'completed',
  mensagem: '',
  contagem: { total: 30, ok: 27, naoVieram: 3, puladas: 0, atencao: 0, naoTerminadas: 0 },
  progresso: null,
  temFaltas: true,
  ...extra,
});

describe('resumoDaLinha (a frase sob a barra)', () => {
  it('concluída', () => {
    expect(resumoDaLinha(r())).toBe('27 na biblioteca · 3 não vieram · 0 puladas');
    expect(
      resumoDaLinha(r({ contagem: { total: 3, ok: 1, naoVieram: 1, puladas: 1, atencao: 0, naoTerminadas: 0 } })),
    ).toBe('1 na biblioteca · 1 não veio · 1 pulada');
  });

  it('lembra do beets quando ele falhou', () => {
    expect(
      resumoDaLinha(r({ contagem: { total: 10, ok: 6, naoVieram: 1, puladas: 1, atencao: 2, naoTerminadas: 0 } })),
    ).toBe('6 na biblioteca · 1 não veio · 1 pulada · 2 com o beets falhando');
  });

  it('parada pelo usuário: o que sobrou não foi iniciado', () => {
    expect(
      resumoDaLinha(
        r({ fim: 'user', contagem: { total: 18, ok: 1, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 17 } }),
      ),
    ).toBe('1 na biblioteca · 17 não iniciadas');
    expect(
      resumoDaLinha(
        r({ fim: 'user', contagem: { total: 1, ok: 0, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 1 } }),
      ),
    ).toBe('0 na biblioteca · 1 não iniciada');
  });

  it('rodando: quantas já terminaram', () => {
    expect(resumoDaLinha(r({ fim: 'rodando', progresso: { feitas: 14, total: 30 } }))).toBe('14/30 concluídas');
  });

  it('sem nenhuma faixa (erro antes de ler a lista): o motivo do erro, na primeira linha', () => {
    const vazio = { total: 0, ok: 0, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 0 };
    expect(resumoDaLinha(r({ fim: 'config', contagem: vazio, mensagem: 'API key diferente\noutra linha' }))).toBe(
      'API key diferente',
    );
    expect(resumoDaLinha(r({ fim: 'config', contagem: vazio }))).toBe('nenhuma faixa registrada');
  });
});

describe('segmentosDaLinha', () => {
  it('proporções do total, e o resto vira a parte vazia da barra', () => {
    expect(segmentosDaLinha(r())).toEqual({ ok: 27, atencao: 0, naoVieram: 3, puladas: 0, resto: 0 });
    expect(
      segmentosDaLinha(r({ contagem: { total: 18, ok: 1, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 17 } })),
    ).toMatchObject({ ok: 1, resto: 17 });
  });

  it('total zero: a barra toda vazia, não sumida', () => {
    expect(
      segmentosDaLinha(r({ contagem: { total: 0, ok: 0, naoVieram: 0, puladas: 0, atencao: 0, naoTerminadas: 0 } }))
        .resto,
    ).toBe(1);
  });
});

describe('destinoDaExecucao', () => {
  it('o painel ao vivo só para o lote que o app acompanha', () => {
    expect(destinoDaExecucao(r({ fim: 'rodando' }), '20261007-210200')).toBe('/lista/execucao');
    expect(destinoDaExecucao(r({ fim: 'rodando' }), null)).toBe('/historico/20261007-210200');
    expect(destinoDaExecucao(r({ fim: 'completed' }), '20261007-210200')).toBe('/historico/20261007-210200');
  });
});

describe('filtrarExecucoes', () => {
  it('"com faixas que não vieram" tira as que não têm', () => {
    const lista = [r({ id: 'a' }), r({ id: 'b', temFaltas: false })];
    expect(filtrarExecucoes(lista, 'faltas').map((x) => x.id)).toEqual(['a']);
    expect(filtrarExecucoes(lista, 'todas')).toHaveLength(2);
  });
});

describe('textos', () => {
  it('rótulo do fim é o mesmo do painel ao vivo', () => {
    expect(rotuloDoFim('completed')).toBe('Concluído');
    expect(rotuloDoFim('user')).toBe('Parado pelo usuário');
    expect(rotuloDoFim('rodando')).toBe('Rodando');
  });

  it('de onde veio a leitura', () => {
    expect(fonteDaLinha({ fonte: 'eventos', fim: 'completed' })).toBe('eventos');
    expect(fonteDaLinha({ fonte: 'eventos', fim: 'rodando' })).toBe('eventos ao vivo');
    expect(fonteDaLinha({ fonte: 'resultado', fim: 'completed' })).toBe('antiga · lida do resultado-*.txt');
  });

  it('tamanhos', () => {
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(2048)).toBe('2,0 KB');
    expect(formatarBytes(50 * 1024)).toBe('50 KB');
    expect(formatarBytes(2_500_000)).toBe('2,4 MB');
  });
});
