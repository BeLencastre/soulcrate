import { describe, expect, it } from 'vitest';
import { tituloDaJanela, tituloDaRota } from '../../src/renderer/lib/titulos';

describe('título de cada tela (acessibilidade)', () => {
  it.each([
    ['/', 'Início'],
    ['/lista', 'Baixar lista'],
    ['/lista/opcoes', 'Baixar lista'],
    ['/lista/execucao', 'Baixar lista'],
    ['/historico', 'Histórico'],
    ['/historico/20261001-100000', 'Histórico'],
    ['/historico/20261001-100000/faltas', 'Histórico'],
    ['/biblioteca', 'Biblioteca'],
    ['/servicos', 'Serviços'],
    ['/servicos/web/slskd', 'slskd'],
    ['/servicos/web/soulbeet', 'Soulbeet'],
    ['/servicos/web/navidrome', 'Navidrome'],
    ['/configuracoes', 'Configurações'],
    ['/assistente', 'Configuração inicial'],
  ])('%s → %s', (rota, titulo) => {
    expect(tituloDaRota(rota)).toBe(titulo);
    expect(tituloDaJanela(rota)).toBe(`${titulo} · Soulcrate`);
  });

  it('barra no fim não muda nada, e o que não existe volta ao nome do app', () => {
    expect(tituloDaRota('/historico/')).toBe('Histórico');
    expect(tituloDaRota('/servicos/web/inventado')).toBe('Serviços');
    expect(tituloDaRota('/nao-existe')).toBe('Soulcrate');
    expect(tituloDaJanela('/nao-existe')).toBe('Soulcrate');
  });
});
