// O que sobrou em `downloads/` (Fase 5, "arquivos parados"): depois de um lote a pasta deve ficar vazia, porque o beets
// move o que importa para `music/`. O que continua lá não foi importado. Olha o disco do PC (não precisa da stack no
// ar), no primeiro nível: cada pasta (ou arquivo solto) é um item que `import -q -s /downloads/<nome>` entende.
import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ParadoEmDownloads } from '@shared/biblioteca';
import { EXTENSOES_DE_AUDIO } from './arquivos-biblioteca';

/**
 * Um arquivo que acabou de chegar ainda vai ser importado pelo beets (o lote e o Soulbeet fazem isso sozinhos, em
 * segundos): só vale como "parado" o que está quieto há mais que isto. Sem a espera, "Importar agora" disputaria o
 * arquivo com a importação que já está acontecendo.
 */
export const QUIETO_HA_MS = 10 * 60_000;
const PROFUNDIDADE_MAXIMA = 6;
const LIMITE_DE_ARQUIVOS_POR_ITEM = 5000;
const NOMES_LISTADOS = 12;

interface Achado {
  nomes: string[];
  total: number;
  modificadoEm: number;
}

async function arquivosDeAudio(pasta: string, prefixo: string, nivel: number, achado: Achado): Promise<void> {
  let itens;
  try {
    itens = await readdir(pasta, { withFileTypes: true });
  } catch {
    return; // pasta que sumiu ou sem permissão: o resto continua
  }
  for (const it of itens) {
    if (achado.total >= LIMITE_DE_ARQUIVOS_POR_ITEM) return;
    if (it.name.startsWith('.')) continue;
    const caminho = join(pasta, it.name);
    if (it.isDirectory()) {
      if (nivel < PROFUNDIDADE_MAXIMA) await arquivosDeAudio(caminho, `${prefixo}${it.name}/`, nivel + 1, achado);
      continue;
    }
    if (!it.isFile() || !EXTENSOES_DE_AUDIO.has(extname(it.name).toLowerCase())) continue;
    const info = await stat(caminho).catch(() => null);
    if (!info) continue;
    achado.total++;
    achado.modificadoEm = Math.max(achado.modificadoEm, info.mtimeMs);
    if (achado.nomes.length < NOMES_LISTADOS) achado.nomes.push(`${prefixo}${it.name}`);
  }
}

/** Os itens de `downloads/` com áudio que estão parados há `quietoHaMs` ou mais, em ordem alfabética. */
export async function escanearDownloads(
  raiz: string,
  agora: number,
  quietoHaMs: number = QUIETO_HA_MS,
): Promise<ParadoEmDownloads[]> {
  let itens;
  try {
    itens = await readdir(raiz, { withFileTypes: true });
  } catch {
    return []; // a pasta ainda não existe: nada parado
  }
  const parados: ParadoEmDownloads[] = [];
  for (const it of itens) {
    if (it.name.startsWith('.')) continue;
    const achado: Achado = { nomes: [], total: 0, modificadoEm: 0 };
    if (it.isDirectory()) await arquivosDeAudio(join(raiz, it.name), '', 1, achado);
    else if (it.isFile() && EXTENSOES_DE_AUDIO.has(extname(it.name).toLowerCase())) {
      const info = await stat(join(raiz, it.name)).catch(() => null);
      if (info) Object.assign(achado, { nomes: [it.name], total: 1, modificadoEm: info.mtimeMs });
    }
    if (achado.total === 0 || agora - achado.modificadoEm < quietoHaMs) continue;
    parados.push({ nome: it.name, arquivos: achado.nomes, total: achado.total, modificadoEm: achado.modificadoEm });
  }
  return parados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
