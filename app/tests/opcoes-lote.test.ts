import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alterouAlgo,
  aplicarReceita,
  argumentosDasOpcoes,
  comandoEquivalente,
  flagsDaReceita,
  GRUPOS_BOOLEANOS,
  GRUPOS_NUMERICOS,
  LIMITES,
  limitar,
  novasOpcoes,
  OPCOES_BOOLEANAS,
  OPCOES_NUMERICAS,
  opcoesAlteradas,
  receitaAtiva,
  RECEITAS,
  validarOpcoes,
} from '../src/shared/opcoes-lote';
import { msg } from '../src/shared/mensagens';

const REPO = join(import.meta.dirname, '..', '..');

describe('padrões', () => {
  it('são os padrões do param() do baixar-lista.ps1', () => {
    const script = readFileSync(join(REPO, 'baixar-lista.ps1'), 'utf8');
    for (const id of OPCOES_NUMERICAS) {
      const m = new RegExp(`\\[int\\]\\$${id}\\s*=\\s*(\\d+)`).exec(script);
      expect(m, `-${id} não está no script`).not.toBeNull();
      expect(LIMITES[id].padrao, id).toBe(Number(m?.[1]));
    }
    for (const id of OPCOES_BOOLEANAS) {
      expect(script, `-${id} não está no script`).toMatch(new RegExp(`\\[switch\\]\\$${id}\\b`));
    }
  });

  it('as 20 opções do README estão nos grupos da tela, cada uma uma vez', () => {
    const ids = [...GRUPOS_BOOLEANOS.flatMap((g) => g.itens), ...GRUPOS_NUMERICOS.flatMap((g) => g.itens)];
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    expect([...ids].sort()).toEqual([...OPCOES_BOOLEANAS, ...OPCOES_NUMERICAS].sort());
  });

  it('toda opção tem título (e as de liga/desliga, explicação) na interface', () => {
    for (const id of OPCOES_BOOLEANAS) {
      expect(msg.lote.opcoes.itens[id].titulo, id).not.toBe('');
      expect(msg.lote.opcoes.itens[id].desc, id).not.toBe('');
    }
    for (const id of OPCOES_NUMERICAS) expect(msg.lote.opcoes.itens[id].titulo, id).not.toBe('');
  });

  it('o padrão de cada opção está dentro do próprio limite', () => {
    for (const id of OPCOES_NUMERICAS) {
      const l = LIMITES[id];
      expect(l.padrao).toBeGreaterThanOrEqual(l.min);
      expect(l.padrao).toBeLessThanOrEqual(l.max);
    }
  });
});

describe('argumentos', () => {
  it('sem alterações não manda nada: o script já assume os padrões', () => {
    expect(argumentosDasOpcoes(novasOpcoes())).toEqual([]);
    expect(alterouAlgo(novasOpcoes())).toBe(false);
  });

  it('manda só o que difere: números com o valor, liga/desliga sem valor', () => {
    const o = { ...novasOpcoes(), Paralelo: 8, AceitarAacAiff: true, FilaMaxMin: 10 };
    expect(opcoesAlteradas(o)).toEqual(['Paralelo', 'FilaMaxMin', 'AceitarAacAiff']);
    expect(argumentosDasOpcoes(o)).toEqual(['-Paralelo', '8', '-FilaMaxMin', '10', '-AceitarAacAiff']);
  });

  it('voltar ao padrão tira o argumento', () => {
    expect(argumentosDasOpcoes({ ...novasOpcoes(), Paralelo: 5 })).toEqual([]);
  });

  it('o comando equivalente usa o baixar-lista.bat e põe aspas em nome com espaço', () => {
    expect(comandoEquivalente('set-sabado.txt', { ...novasOpcoes(), Paralelo: 8 })).toBe(
      'baixar-lista.bat set-sabado.txt -Paralelo 8',
    );
    expect(comandoEquivalente('set de sábado.txt', novasOpcoes())).toBe('baixar-lista.bat "set de sábado.txt"');
  });
});

describe('validarOpcoes (o renderer não é confiável)', () => {
  it('aceita nada e usa os padrões', () => {
    expect(validarOpcoes(undefined)).toEqual(novasOpcoes());
    expect(validarOpcoes({})).toEqual(novasOpcoes());
  });

  it('AceitarWav (obsoleta: o WAV é sempre aceito) é aceita sem erro e não vira opção nem argumento', () => {
    const o = validarOpcoes({ AceitarWav: true, Paralelo: 8 });
    expect(o).toEqual({ ...novasOpcoes(), Paralelo: 8 });
    expect(Object.keys(o)).not.toContain('AceitarWav');
    expect(argumentosDasOpcoes(o)).toEqual(['-Paralelo', '8']);
  });

  it('o padrão aceita só FLAC e WAV: AAC/AIFF, MP3 320 e MP3 menor começam desligados', () => {
    const o = novasOpcoes();
    expect([o.AceitarAacAiff, o.AceitarMp3320, o.AceitarMp3Menor]).toEqual([false, false, false]);
  });

  it('aceita parte das opções e completa com o padrão', () => {
    expect(validarOpcoes({ Paralelo: 8, SemBeets: true })).toEqual({ ...novasOpcoes(), Paralelo: 8, SemBeets: true });
  });

  it.each([
    ['opção que não existe', { Rm: true }],
    ['tipo trocado (texto no lugar de número)', { Paralelo: '8; calc' }],
    ['tipo trocado (número no lugar de liga/desliga)', { SemBeets: 1 }],
    ['número quebrado', { Paralelo: 2.5 }],
    ['zero (o script não aceita)', { Paralelo: 0 }],
    ['acima do limite', { Paralelo: 51 }],
    ['negativo', { FilaMaxMin: -1 }],
    ['lista no lugar de objeto', [1, 2]],
    ['texto no lugar de objeto', 'AceitarAacAiff'],
  ])('recusa %s', (_nome, entrada) => {
    expect(() => validarOpcoes(entrada)).toThrow();
  });

  it('limitar prende o valor ao intervalo e arredonda', () => {
    expect(limitar('Paralelo', 0)).toBe(1);
    expect(limitar('Paralelo', 999)).toBe(50);
    expect(limitar('Paralelo', 7.6)).toBe(8);
  });
});

describe('receitas do README', () => {
  it('são as nove da tabela, com os mesmos flags', () => {
    expect(RECEITAS).toHaveLength(9);
    const flags = Object.fromEntries(RECEITAS.map((r) => [r.id, flagsDaReceita(r)]));
    expect(flags.listaGrande).toBe('-Paralelo 8');
    expect(flags.usuariosLentos).toBe('-FilaMaxMin 10 -DownloadMaxMin 40');
    expect(flags.querTudo).toBe('-AceitarAacAiff -AceitarMp3320 -AceitarMp3Menor');
    expect(flags.buscasSemResposta).toBe('-BuscasPorJanela 20 -PausaBloqueioMin 30');
    expect(flags.soBaixar).toBe('-SemBeets');
    const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
    for (const f of Object.values(flags)) expect(readme, f).toContain(f);
  });

  it('todas têm nome na interface', () => {
    for (const r of RECEITAS) expect(msg.lote.opcoes.receitasNomes[r.id], r.id).toBeTruthy();
  });

  it('aplicar liga a receita; ela fica ativa até uma das opções mudar', () => {
    const querTudo = RECEITAS.find((r) => r.id === 'querTudo');
    if (!querTudo) throw new Error('receita ausente');
    const base = novasOpcoes();
    expect(receitaAtiva(querTudo, base)).toBe(false);
    const aplicada = aplicarReceita(base, querTudo);
    expect(receitaAtiva(querTudo, aplicada)).toBe(true);
    expect(receitaAtiva(querTudo, { ...aplicada, AceitarAacAiff: false })).toBe(false);
  });

  it('cada receita passa na validação', () => {
    for (const r of RECEITAS) expect(() => validarOpcoes(aplicarReceita(novasOpcoes(), r))).not.toThrow();
  });
});
