// O que sobrou em downloads/ (Fase 5): só áudio, só o que está quieto, agrupado pelo primeiro nível.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { escanearDownloads, QUIETO_HA_MS } from '../../src/main/services/downloads-parados';

let raiz: string;
beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sc-downloads-'));
});
afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

const AGORA = Date.now();
const DIA = 24 * 3_600_000;

/** cria o arquivo com a data de modificação de `haMs` atrás */
function criar(rel: string, haMs: number): void {
  const abs = join(raiz, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, '');
  const t = new Date(AGORA - haMs);
  utimesSync(abs, t, t);
}

describe('escanearDownloads', () => {
  it('pasta que não existe, ou vazia: nada parado', async () => {
    expect(await escanearDownloads(join(raiz, 'nao-existe'), AGORA)).toEqual([]);
    expect(await escanearDownloads(raiz, AGORA)).toEqual([]);
  });

  it('uma pasta com áudio parado é um item; mostra o nome, os arquivos e a data do mais recente', async () => {
    criar('f_hard/Vendex - Vengeance.mp3', DIA);
    criar('f_hard/Vendex - Plague.flac', 2 * DIA);
    const r = await escanearDownloads(raiz, AGORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: 'f_hard', total: 2 });
    expect(r[0]?.arquivos.sort()).toEqual(['Vendex - Plague.flac', 'Vendex - Vengeance.mp3']);
    // a data do item é a do arquivo mais recente (1 dia atrás), com folga para o relógio do disco
    expect(Math.abs(AGORA - DIA - (r[0]?.modificadoEm ?? 0))).toBeLessThan(5_000);
  });

  it('arquivo solto também é um item (o beets importa um caminho de arquivo)', async () => {
    criar('solto.flac', DIA);
    expect(await escanearDownloads(raiz, AGORA)).toMatchObject([
      { nome: 'solto.flac', arquivos: ['solto.flac'], total: 1 },
    ]);
  });

  it('o que chegou agora não conta: o lote e o Soulbeet ainda vão importar', async () => {
    criar('f_novo/a.mp3', 30_000);
    criar('b_quase/a.mp3', QUIETO_HA_MS - 5_000);
    criar('c_parado/a.mp3', QUIETO_HA_MS + 5_000);
    expect((await escanearDownloads(raiz, AGORA)).map((p) => p.nome)).toEqual(['c_parado']);
  });

  it('uma pasta com arquivo novo e antigo vale pelo mais recente (ainda está chegando coisa)', async () => {
    criar('f_misto/velho.mp3', DIA);
    criar('f_misto/novo.mp3', 20_000);
    expect(await escanearDownloads(raiz, AGORA)).toEqual([]);
  });

  it('ignora o que não é áudio e o que está em pasta oculta', async () => {
    criar('f_capa/capa.jpg', DIA);
    criar('f_capa/notas.txt', DIA);
    criar('.oculta/a.mp3', DIA);
    criar('f_ok/.tmp/a.mp3', DIA);
    expect(await escanearDownloads(raiz, AGORA)).toEqual([]);
  });

  it('desce nas subpastas e mostra o caminho relativo', async () => {
    criar('f_hard/Disco/01.flac', DIA);
    expect(await escanearDownloads(raiz, AGORA)).toMatchObject([
      { nome: 'f_hard', arquivos: ['Disco/01.flac'], total: 1 },
    ]);
  });

  it('lista só os primeiros nomes mas conta todos', async () => {
    for (let i = 0; i < 20; i++) criar(`f_grande/${String(i).padStart(2, '0')}.mp3`, DIA);
    const [item] = await escanearDownloads(raiz, AGORA);
    expect(item?.total).toBe(20);
    expect(item?.arquivos).toHaveLength(12);
  });

  it('ordem alfabética', async () => {
    criar('b/a.mp3', DIA);
    criar('a/a.mp3', DIA);
    criar('C/a.mp3', DIA);
    expect((await escanearDownloads(raiz, AGORA)).map((p) => p.nome)).toEqual(['a', 'b', 'C']);
  });
});
