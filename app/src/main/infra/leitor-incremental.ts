// Leitura incremental de um arquivo que outro processo está escrevendo (SP4): guarda o offset em bytes, corta por
// `\n` antes de decodificar (em UTF-8 o `\n` nunca aparece dentro de um caractere) e retém o pedaço final sem `\n`
// até a próxima leitura. Serve ao arquivo de eventos (JSONL) e ao log de saída do lote.
import { open, stat } from 'node:fs/promises';
import { semBom } from '@shared/texto';

/** Quanto ler por vez: uma execução longa pode ter dezenas de MB de log, e não vale carregar tudo de uma vez. */
const BLOCO_BYTES = 1_048_576;

export class LeitorIncremental {
  private offset = 0;
  private resto: Buffer = Buffer.alloc(0);

  constructor(readonly arquivo: string) {}

  /** Linhas completas novas desde a última chamada (sem o fim de linha). Arquivo que ainda não existe → `[]`. */
  async lerNovas(): Promise<string[]> {
    let tamanho: number;
    try {
      tamanho = (await stat(this.arquivo)).size;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    // o arquivo foi recriado (ficou menor que o que já li): recomeça do zero
    if (tamanho < this.offset) {
      this.offset = 0;
      this.resto = Buffer.alloc(0);
    }
    if (tamanho === this.offset) return [];

    const pedacos: Buffer[] = [this.resto];
    const fh = await open(this.arquivo, 'r');
    try {
      while (this.offset < tamanho) {
        const alvo = Buffer.alloc(Math.min(BLOCO_BYTES, tamanho - this.offset));
        const { bytesRead } = await fh.read(alvo, 0, alvo.length, this.offset);
        if (bytesRead === 0) break;
        pedacos.push(alvo.subarray(0, bytesRead));
        this.offset += bytesRead;
      }
    } finally {
      await fh.close();
    }

    const dados = Buffer.concat(pedacos);
    const ultimoFim = dados.lastIndexOf(0x0a);
    if (ultimoFim < 0) {
      this.resto = dados;
      return [];
    }
    this.resto = Buffer.from(dados.subarray(ultimoFim + 1));
    const texto = dados.subarray(0, ultimoFim).toString('utf8');
    return texto.split('\n').map((l) => semBom(l.replace(/\r$/, '')));
  }
}
