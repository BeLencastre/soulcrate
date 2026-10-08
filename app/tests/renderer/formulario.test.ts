// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/renderer/lib/api', () => ({ api: { config: { validate: vi.fn() } } }));
const { achadosVisiveis, dataDeHoje, gerarSenha, paiDoCaminho } = await import('../../src/renderer/lib/formulario');

describe('paiDoCaminho', () => {
  it.each([
    ['D:/Musica/Soulcrate/music', 'D:/Musica/Soulcrate'],
    ['D:\\Musica\\Soulcrate\\music\\', 'D:/Musica/Soulcrate'],
    ['D:/music', 'D:/'],
    ['music', ''],
    ['', ''],
    ['//servidor/share/musica', '//servidor/share'],
  ])('%j → %j', (de, para) => {
    expect(paiDoCaminho(de)).toBe(para);
  });
});

describe('gerarSenha', () => {
  it('20 letras e números, sem os que se confundem (0, O, 1, l, I)', () => {
    for (let i = 0; i < 50; i++) expect(gerarSenha()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
  });

  it('é aleatória e respeita o tamanho pedido', () => {
    const senhas = new Set(Array.from({ length: 200 }, () => gerarSenha()));
    expect(senhas.size).toBe(200);
    expect(gerarSenha(32)).toHaveLength(32);
  });

  it('usa todo o alfabeto (sem viés grosseiro)', () => {
    const vistos = new Set(Array.from({ length: 2000 }, () => gerarSenha()).join(''));
    expect(vistos.size).toBeGreaterThan(50);
  });
});

describe('dataDeHoje', () => {
  it('AAAA-MM-DD no horário local', () => {
    expect(dataDeHoje(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(dataDeHoje(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('achadosVisiveis', () => {
  const v = {
    achados: [
      { id: 'A', nivel: 'erro', campo: 'tz', mensagem: 'erro' },
      { id: 'B', nivel: 'aviso', campo: 'tz', mensagem: 'aviso' },
      { id: 'C', nivel: 'erro', campo: 'puid', mensagem: 'outro campo' },
    ],
    pastas: {},
    mesmoDisco: null,
    ok: false,
  } as never;

  it('mostra erros e avisos do campo; sem mostrarErros, só os avisos', () => {
    expect(achadosVisiveis(v, ['tz']).map((a) => a.id)).toEqual(['A', 'B']);
    expect(achadosVisiveis(v, ['tz'], false).map((a) => a.id)).toEqual(['B']);
    expect(achadosVisiveis(null, ['tz'])).toEqual([]);
  });
});
