/** Marca de ordem de bytes (U+FEFF): o Windows PowerShell 5.1 a grava no início dos arquivos UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

export function semBom(s: string): string {
  return s.startsWith(BOM) ? s.slice(1) : s;
}
