import { describe, expect, it } from 'vitest';
import { alturaAteOFim, janelaVisivel } from '../../src/renderer/components/TabelaVirtual';

describe('janelaVisivel (virtualização da tabela)', () => {
  it('no topo: da primeira linha até o que cabe na altura, mais a folga', () => {
    const [de, ate] = janelaVisivel(1000, 44, 0, 520);
    expect(de).toBe(0);
    expect(ate).toBe(Math.ceil(520 / 44) + 8);
  });

  it('rolando: acompanha a posição, com folga dos dois lados', () => {
    const [de, ate] = janelaVisivel(1000, 44, 4400, 520);
    expect(de).toBe(100 - 8);
    expect(ate).toBe(Math.ceil((4400 + 520) / 44) + 8);
  });

  it('nunca passa do total nem fica com intervalo invertido', () => {
    expect(janelaVisivel(10, 44, 0, 520)).toEqual([0, 10]);
    const [de, ate] = janelaVisivel(10, 44, 99_999, 520);
    expect(de).toBeLessThanOrEqual(ate);
    expect(ate).toBeLessThanOrEqual(10);
    expect(janelaVisivel(0, 44, 0, 520)).toEqual([0, 0]);
  });

  it('com 1.000 linhas, só algumas dezenas ficam no DOM em qualquer posição', () => {
    for (const rolagem of [0, 1234, 22_000, 43_000]) {
      const [de, ate] = janelaVisivel(1000, 44, rolagem, 520);
      expect(ate - de).toBeLessThan(40);
    }
  });
});

describe('alturaAteOFim (a tabela da Biblioteca vai até o fim da janela)', () => {
  const medida = { topo: 360, topoDaRolagem: 0, rolado: 0, visivel: 1032 };

  it('janela alta: a tabela cresce até o fim da área visível, menos a folga', () => {
    expect(alturaAteOFim(medida, 560, 40)).toBe(1032 - 360 - 40);
  });

  it('janela baixa: não passa do mínimo (a página rola)', () => {
    expect(alturaAteOFim({ ...medida, visivel: 801 }, 560, 40)).toBe(560);
  });

  it('com a página já rolada, mede como se estivesse no topo', () => {
    expect(alturaAteOFim({ ...medida, topo: 160, rolado: 200 }, 560, 40)).toBe(1032 - 360 - 40);
    expect(alturaAteOFim({ ...medida, topo: 400, topoDaRolagem: 40 }, 560, 40)).toBe(1032 - 360 - 40);
  });

  it('sem layout (jsdom): o mínimo', () => {
    expect(alturaAteOFim({ topo: 0, topoDaRolagem: 0, rolado: 0, visivel: 0 }, 560, 40)).toBe(560);
  });
});
