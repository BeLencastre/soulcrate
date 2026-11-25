// Leitura do texto de um `.env`, sem Node: o main e o shared usam o mesmo parser (o do baixar-lista.ps1).

/** `.Trim().Trim('"').Trim("'")` do PowerShell: tira espaços e todas as aspas das pontas. */
export function semAspas(valor: string): string {
  return valor
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '');
}

/** NOME=valor por linha; ignora o resto (comentários, linhas em branco). Igual ao baixar-lista.ps1. */
export function lerEnv(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
    if (m?.[1] !== undefined) mapa.set(m[1], semAspas(m[2] ?? ''));
  }
  return mapa;
}
