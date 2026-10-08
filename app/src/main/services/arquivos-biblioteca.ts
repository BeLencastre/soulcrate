// Onde está o arquivo de uma faixa (Fase 4, "caminho do arquivo na biblioteca"). O lote só sabe onde o arquivo foi
// baixado (downloads/); depois o beets o move e o renomeia (`Gênero/Artista/Título`) e só ele sabe o destino. Para
// mostrar o caminho sem depender da stack no ar, o app procura em `music/` pelo nome do arquivo (o título) e usa o
// artista e a hora da execução para escolher entre títulos repetidos. É uma busca, não uma certeza: sem pista boa, nada.
import { readdir } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { normalizar } from '@shared/texto';

export const EXTENSOES_DE_AUDIO = new Set(['.flac', '.mp3', '.wav', '.aif', '.aiff', '.m4a', '.ogg', '.opus', '.wma']);
const PROFUNDIDADE_MAXIMA = 8;
export const LIMITE_DE_ARQUIVOS = 300_000;

export interface IndiceBiblioteca {
  raiz: string;
  /** título normalizado (nome do arquivo sem extensão) → caminhos relativos à raiz, com `/` */
  porNome: Map<string, string[]>;
  total: number;
  /** a pasta tinha mais arquivos que o limite: o índice é parcial */
  parcial: boolean;
}

/** Lista os arquivos de áudio da pasta (sem seguir pastas ocultas) e os indexa pelo nome sem extensão. */
export async function indexarBiblioteca(raiz: string): Promise<IndiceBiblioteca> {
  const indice: IndiceBiblioteca = { raiz, porNome: new Map(), total: 0, parcial: false };
  const pendentes: { pasta: string; nivel: number }[] = [{ pasta: raiz, nivel: 0 }];
  while (pendentes.length > 0) {
    const { pasta, nivel } = pendentes.pop() as { pasta: string; nivel: number };
    let itens;
    try {
      itens = await readdir(pasta, { withFileTypes: true });
    } catch {
      continue; // pasta que sumiu ou sem permissão: o resto continua
    }
    for (const it of itens) {
      if (it.name.startsWith('.')) continue;
      if (it.isDirectory()) {
        if (nivel < PROFUNDIDADE_MAXIMA) pendentes.push({ pasta: join(pasta, it.name), nivel: nivel + 1 });
        continue;
      }
      if (!it.isFile() || !EXTENSOES_DE_AUDIO.has(extname(it.name).toLowerCase())) continue;
      if (indice.total >= LIMITE_DE_ARQUIVOS) {
        indice.parcial = true;
        return indice;
      }
      const rel = relative(raiz, join(pasta, it.name)).split(sep).join('/');
      const chave = normalizar(basename(it.name, extname(it.name)));
      const lista = indice.porNome.get(chave);
      if (lista) lista.push(rel);
      else indice.porNome.set(chave, [rel]);
      indice.total++;
    }
  }
  return indice;
}

export interface FaixaParaLocalizar {
  artista: string;
  titulo: string;
  /** arquivo baixado (o nome costuma ser `Artista - Título.ext`), se o evento o registrou */
  local: string | null;
  /** FLAC, MP3 320...: dá uma pista da extensão */
  formato: string | null;
}

export interface JanelaDaExecucao {
  inicio: number;
  /** null enquanto a execução roda */
  fim: number | null;
}

/** Sem parênteses nem colchetes: "Push Up (Original Mix)" → "Push Up". */
const semMix = (s: string) => s.replace(/[([][^)\]]*[)\]]/g, ' ');

/** Os nomes de artista que valem como pista: o principal e cada colaborador ("A & B", "A feat. B", "A, B"). */
export function nomesDeArtista(artista: string): string[] {
  const partes = artista.split(/\s*(?:&|,|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|\bx\b|\band\b)\s*/i);
  const todos = [artista, ...partes].map(normalizar).filter((n) => n.length >= 3);
  return [...new Set(todos)];
}

function pastasContem(rel: string, nomes: readonly string[]): boolean {
  const pastas = ` ${normalizar(rel.split('/').slice(0, -1).join(' '))} `;
  return nomes.some((n) => pastas.includes(` ${n} `));
}

const EXTENSAO_DO_FORMATO: Record<string, string[]> = {
  FLAC: ['.flac'],
  'WAV/AIFF': ['.wav', '.aif', '.aiff'],
  'MP3 320': ['.mp3'],
  'MP3 256/VBR': ['.mp3'],
};

/**
 * O arquivo da faixa em `music/`, ou null. Um candidato precisa do nome certo e de mais uma pista: o artista numa das
 * pastas ou a data de modificação dentro da execução (o beets move sem mexer na data).
 */
export function localizarNaBiblioteca(
  indice: IndiceBiblioteca,
  faixa: FaixaParaLocalizar,
  janela: JanelaDaExecucao,
  dataDe: (relativo: string) => number | null,
): string | null {
  const tituloCompleto = normalizar(faixa.titulo);
  const tituloSemMix = normalizar(semMix(faixa.titulo));
  const doArquivo = faixa.local ? normalizar(basename(faixa.local, extname(faixa.local))) : '';
  const nomeBaixado = doArquivo.includes(' ') && faixa.artista ? tirarArtista(doArquivo, faixa.artista) : doArquivo;

  const chaves: { chave: string; pontos: number }[] = [
    { chave: tituloCompleto, pontos: 10 },
    { chave: nomeBaixado, pontos: 8 },
    { chave: tituloSemMix, pontos: 6 },
  ].filter((c) => c.chave.length > 0);
  const nomes = nomesDeArtista(faixa.artista);
  const extensoes = faixa.formato ? (EXTENSAO_DO_FORMATO[faixa.formato] ?? []) : [];

  let melhor: { rel: string; pontos: number; data: number } | null = null;
  const visto = new Set<string>();
  for (const { chave, pontos: base } of chaves) {
    for (const rel of indice.porNome.get(chave) ?? []) {
      if (visto.has(rel)) continue;
      visto.add(rel);
      const artistaNaPasta = pastasContem(rel, nomes);
      const data = dataDe(rel);
      const naJanela =
        data !== null && data >= janela.inicio - 60_000 && (janela.fim === null || data <= janela.fim + 6 * 3_600_000);
      if (!artistaNaPasta && !naJanela) continue;
      const pontos =
        base + (artistaNaPasta ? 4 : 0) + (naJanela ? 2 : 0) + (extensoes.includes(extname(rel).toLowerCase()) ? 1 : 0);
      if (!melhor || pontos > melhor.pontos || (pontos === melhor.pontos && (data ?? 0) > melhor.data)) {
        melhor = { rel, pontos, data: data ?? 0 };
      }
    }
  }
  return melhor?.rel ?? null;
}

/** "vendex abbadon" sem o "vendex " do começo. */
function tirarArtista(nome: string, artista: string): string {
  for (const a of nomesDeArtista(artista)) {
    if (nome.startsWith(`${a} `)) return nome.slice(a.length + 1).trim();
  }
  return nome;
}
