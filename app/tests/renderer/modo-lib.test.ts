// As regras do Modo DJ no renderer, sem React: o atalho, os ajustes em palavras (com os interruptores invertidos) e o
// histórico (nova tentativa, frase da linha, arquivos parecidos).
import { describe, expect, it, vi } from 'vitest';
import type { ExecucaoResumo } from '../../src/shared/historico';
import { novasOpcoes, OPCOES_PADRAO } from '../../src/shared/opcoes-lote';
// os módulos também têm hooks de consulta, que importam o `window.soulcrate`; aqui só as regras puras importam
vi.mock('../../src/renderer/lib/api', () => ({ api: {} }));
const { ehAtalhoDoModo } = await import('../../src/renderer/lib/modo');
const { linhasDoResumoDj, marcadoNoDj, numericosAlterados, opcaoDoDj } =
  await import('../../src/renderer/lib/ajustes-dj');
const { arquivoParecido, origemDaTentativa, semExtensao } = await import('../../src/renderer/lib/historico');

describe('atalho Ctrl+Shift+D', () => {
  const tecla = (p: Partial<KeyboardEvent>) => ({
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    code: 'KeyD',
    ...p,
  });
  it('só Ctrl+Shift+D, pela tecla física (vale em qualquer layout de teclado)', () => {
    expect(ehAtalhoDoModo(tecla({ ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(ehAtalhoDoModo(tecla({ ctrlKey: true }))).toBe(false);
    expect(ehAtalhoDoModo(tecla({ ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
    expect(ehAtalhoDoModo(tecla({ ctrlKey: true, shiftKey: true, code: 'KeyF' }))).toBe(false);
  });
});

describe('ajustes no Modo DJ', () => {
  it('interruptores sem "não" nem "sem": "Organizar depois de baixar" ligado é -SemBeets desligado', () => {
    const o = novasOpcoes();
    expect(marcadoNoDj('SemBeets', o)).toBe(true);
    expect(marcadoNoDj('SemCatalogo', o)).toBe(true);
    expect(marcadoNoDj('SemBuscaArtista', o)).toBe(true);
    expect(marcadoNoDj('Retentar', o)).toBe(false);
    expect(opcaoDoDj('SemBeets', false)).toEqual({ SemBeets: true });
    expect(opcaoDoDj('Retentar', true)).toEqual({ Retentar: true });
  });

  it('o resumo diz a qualidade sempre e cada ajuste que mudou, em palavras (como no protótipo)', () => {
    expect(linhasDoResumoDj(novasOpcoes())).toEqual([{ rotulo: 'Qualidade', valor: 'só FLAC e WAV', mudou: false }]);
    const o = { ...novasOpcoes(), SemBeets: true, SemCatalogo: true };
    expect(linhasDoResumoDj(o)).toEqual([
      { rotulo: 'Qualidade', valor: 'só FLAC e WAV', mudou: false },
      { rotulo: 'Títulos no catálogo', valor: 'sem conferir', mudou: true },
      { rotulo: 'Organizar', valor: 'depois, por você', mudou: true },
    ]);
    const tudo = { ...novasOpcoes(), AceitarAacAiff: true, AceitarMp3320: true, Paralelo: 8, Retentar: true };
    expect(linhasDoResumoDj(tudo)).toEqual([
      { rotulo: 'Qualidade', valor: 'FLAC e WAV, depois AIFF/AAC e MP3 320', mudou: true },
      { rotulo: 'Downloads ao mesmo tempo', valor: '8', mudou: true },
      { rotulo: 'Tentar de novo o que falhou antes', valor: 'sim', mudou: true },
    ]);
    expect(numericosAlterados(tudo)).toBe(1);
    expect(numericosAlterados(OPCOES_PADRAO)).toBe(0);
  });
});

describe('histórico no Modo DJ', () => {
  const r = (extra: Partial<ExecucaoResumo> = {}): ExecucaoResumo => ({
    id: '20261007-154809',
    inicio: 0,
    duracaoMs: 27_000,
    lista: 'set-sexta.txt',
    fonte: 'eventos',
    fim: 'completed',
    mensagem: '',
    contagem: { total: 11, ok: 10, naoVieram: 1, puladas: 0, atencao: 0, naoTerminadas: 0 },
    progresso: null,
    temFaltas: true,
    ...extra,
  });

  it('a nova tentativa aponta para a lista de origem', () => {
    const original = r();
    const tentativa = r({ id: '20261007-155900', lista: 'nao-baixadas-20261007-154809.txt' });
    expect(origemDaTentativa(tentativa, [tentativa, original])).toBe(original);
    expect(origemDaTentativa(original, [tentativa, original])).toBeNull();
    // a de origem já foi apagada: é tentativa, mas sem nome para mostrar
    expect(origemDaTentativa(tentativa, [tentativa])).toBeUndefined();
  });

  it('a lista pelo nome, sem a extensão do arquivo', () => {
    expect(semExtensao('set-sexta.txt')).toBe('set-sexta');
    expect(semExtensao('playlist.CSV')).toBe('playlist');
    expect(semExtensao('sem extensao')).toBe('sem extensao');
  });

  it('arquivos parecidos: o nome sem a pasta e o formato pela extensão', () => {
    expect(arquivoParecido('@@user\\Music\\Vendex - Dark Tower.flac')).toEqual({
      nome: 'Vendex - Dark Tower',
      formato: 'FLAC',
    });
    expect(arquivoParecido('pasta/sem extensao')).toEqual({ nome: 'sem extensao', formato: null });
  });
});
