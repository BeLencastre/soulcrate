// Confere os tipos do protocolo contra eventos gravados de execuções reais do baixar-lista.ps1
// (tests/fixtures/lote/, gerados por tests/Gerar-Fixtures.ps1 na raiz do repositório).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerAnaliseLista } from '../src/shared/analise-lista.js';
import { BOM } from '../src/shared/texto.js';
import {
  CODIGOS_SAIDA,
  ehTipoConhecido,
  EventoInvalidoError,
  type EventoLote,
  type ItemFinal,
  lerLinhaEvento,
  STATUS_EM_ANDAMENTO,
  STATUS_FINAIS,
} from '../src/shared/eventos-lote.js';

const fixture = (nome: string) => fileURLToPath(new URL(`./fixtures/lote/${nome}`, import.meta.url));

function lerEventos(nome: string): EventoLote[] {
  return readFileSync(fixture(nome), 'utf8')
    .split('\n')
    .map(lerLinhaEvento)
    .filter((e): e is EventoLote => e !== null);
}

const ARQUIVOS = ['eventos-completo.jsonl', 'eventos-parado.jsonl', 'eventos-erro-config.jsonl'];

describe.each(ARQUIVOS)('%s', (nome) => {
  const eventos = lerEventos(nome);

  it('só tem tipos conhecidos, todos na versão 1', () => {
    expect(eventos.length).toBeGreaterThan(0);
    for (const e of eventos) {
      expect(ehTipoConhecido(e), e.type).toBe(true);
      expect(e.v).toBe(1);
    }
  });

  it('termina com um único run.end, coerente com o código de saída', () => {
    const fim = eventos.at(-1);
    expect(fim?.type).toBe('run.end');
    expect(eventos.filter((e) => e.type === 'run.end')).toHaveLength(1);
    if (fim?.type === 'run.end') expect(CODIGOS_SAIDA[fim.exitCode]).toBe(fim.reason);
  });

  it('usa só os status documentados', () => {
    for (const e of eventos) {
      if (e.type === 'item.status') expect(STATUS_EM_ANDAMENTO).toContain(e.status);
      if (e.type === 'item.final') expect(STATUS_FINAIS).toContain(e.status);
    }
  });
});

describe('execução completa', () => {
  const eventos = lerEventos('eventos-completo.jsonl');
  const inicio = eventos[0];

  it('começa com run.start', () => {
    expect(inicio?.type).toBe('run.start');
  });

  it('tem um item.final por faixa', () => {
    if (inicio?.type !== 'run.start') throw new Error('sem run.start');
    const finais = eventos.filter((e) => e.type === 'item.final');
    expect(finais).toHaveLength(inicio.total);
    expect(new Set(finais.map((e) => e.key)).size).toBe(inicio.total);
  });

  it('o resumo do run.end bate com os item.final', () => {
    const fim = eventos.at(-1);
    if (fim?.type !== 'run.end') throw new Error('sem run.end');
    const contagem: Record<string, number> = {};
    for (const e of eventos) if (e.type === 'item.final') contagem[e.status] = (contagem[e.status] ?? 0) + 1;
    expect(fim.summary).toEqual(contagem);
    expect(fim.reason).toBe('completed');
  });

  it('mantém acentos', () => {
    expect(eventos.some((e) => e.type === 'item.final' && e.line === 'Byørn - 2 LOUD')).toBe(true);
  });

  it('traz o diagnóstico estruturado das não encontradas', () => {
    const diag = eventos.filter((e) => e.type === 'item.diagnostic');
    const naoEncontradas = eventos.filter(
      (e): e is ItemFinal => e.type === 'item.final' && e.status === 'nao encontrada',
    );
    expect(diag.map((d) => d.key).sort()).toEqual(naoEncontradas.map((e) => e.key).sort());
  });
});

describe('execução parada', () => {
  it('avisa run.stopping antes de terminar com código 2', () => {
    const eventos = lerEventos('eventos-parado.jsonl');
    const tipos = eventos.map((e) => e.type);
    expect(tipos.indexOf('run.stopping')).toBeGreaterThan(-1);
    expect(tipos.indexOf('run.stopping')).toBeLessThan(tipos.indexOf('run.end'));
    const fim = eventos.at(-1);
    expect(fim?.type === 'run.end' && fim.exitCode).toBe(2);
  });
});

describe('lerLinhaEvento', () => {
  it('ignora linha vazia e BOM', () => {
    expect(lerLinhaEvento('')).toBeNull();
    expect(lerLinhaEvento(BOM + '{"v":1,"t":"x","type":"run.stopping","reason":"user"}')?.type).toBe('run.stopping');
  });
  it('recusa JSON quebrado e versão desconhecida', () => {
    expect(() => lerLinhaEvento('{"v":1,')).toThrow(EventoInvalidoError);
    expect(() => lerLinhaEvento('{"v":2,"t":"x","type":"progress"}')).toThrow(/versão/);
  });
  it('aceita tipo novo (o protocolo pode crescer sem mudar a versão)', () => {
    const e = lerLinhaEvento('{"v":1,"t":"x","type":"algo.novo"}');
    expect(e).not.toBeNull();
    expect(ehTipoConhecido(e as { type: string })).toBe(false);
  });
});

describe('análise da lista (-SoAnalisar)', () => {
  it('lê a saída gravada', () => {
    const a = lerAnaliseLista(readFileSync(fixture('analise-lista.json'), 'utf8'));
    if (!a.ok) throw new Error(a.error);
    expect(a.lines).toHaveLength(a.total);
    expect(a.lines[0]).toMatchObject({ sourceLine: 2, artist: 'Azyr', title: 'No Escape', status: 'ja feita' });
  });
});
