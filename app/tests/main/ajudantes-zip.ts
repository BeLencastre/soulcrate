import { inflateRawSync } from 'node:zlib';
import { expect } from 'vitest';

/** Leitor de zip só para os testes: lê o diretório central e devolve nome → conteúdo. */
export function lerZip(zip: Buffer): Map<string, Buffer> {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error('não é um zip (sem registro de fim)');
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  const saida = new Map<string, Buffer>();
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central corrompido');
    const metodo = zip.readUInt16LE(p + 10);
    const tamanhoComprimido = zip.readUInt32LE(p + 20);
    const tamanho = zip.readUInt32LE(p + 24);
    const tamNome = zip.readUInt16LE(p + 28);
    const tamExtra = zip.readUInt16LE(p + 30);
    const tamComentario = zip.readUInt16LE(p + 32);
    const deslocamento = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + tamNome).toString('utf8');
    // o cabeçalho local repete o nome, e pode ter um "extra" de tamanho próprio
    const dadosEm = deslocamento + 30 + zip.readUInt16LE(deslocamento + 26) + zip.readUInt16LE(deslocamento + 28);
    const bruto = zip.subarray(dadosEm, dadosEm + tamanhoComprimido);
    const dados = metodo === 8 ? inflateRawSync(bruto) : Buffer.from(bruto);
    expect(dados.length).toBe(tamanho);
    saida.set(nome, dados);
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return saida;
}
