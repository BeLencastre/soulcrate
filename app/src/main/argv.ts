// "Abrir com" e a linha de comando (§6.2): um .txt ou .csv passado ao app vira uma lista na pasta do Soulcrate.

/** O primeiro argumento que é um .txt/.csv que existe (`argv[0]` é o executável, não conta); null se não há. */
export function listaDoArgv(argv: readonly string[], existeArquivo: (caminho: string) => boolean): string | null {
  return argv.slice(1).find((a) => !a.startsWith('--') && /\.(txt|csv)$/i.test(a) && existeArquivo(a)) ?? null;
}
