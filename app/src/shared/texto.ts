/** Marca de ordem de bytes (U+FEFF): o Windows PowerShell 5.1 a grava no início dos arquivos UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

export function semBom(s: string): string {
  return s.startsWith(BOM) ? s.slice(1) : s;
}

/** Letras que o NFD não decompõe: "Byørn" tem de casar com "byorn". */
const LETRAS_SEM_DECOMPOSICAO: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ð: 'd',
  đ: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
};

/**
 * Minúsculas, sem acento, só letras e números, um espaço entre as palavras: a mesma ideia do `Normalize` do
 * baixar-lista.ps1 (a chave de uma faixa é a linha normalizada). Serve para comparar nomes de arquivo e títulos.
 */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[øæœßðđłþı]/g, (c) => LETRAS_SEM_DECOMPOSICAO[c] ?? c)
    .replace(/[’'`]/g, '') // "Don't" vira "dont", como no script
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim();
}
