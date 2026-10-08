// Os arquivos da stack: o que o assistente copia para a pasta do Soulcrate de um usuário novo (§3.3).
// Fica sem imports de propósito: o script `scripts/preparar-stack.mjs` (build do instalador) lê este mesmo arquivo.
// Nunca entra aqui nada do usuário (.env, slskd.yml, listas, lotes/, music/, navidrome/, soulbeet/data/, slskd/data/).

export const ARQUIVOS_DA_STACK: readonly string[] = [
  'docker-compose.yml',
  'VERSION',
  '.env.example',
  'LICENSE',
  'README.md',
  'CHANGELOG.md',
  'lista.exemplo.txt',
  // scripts (os .bat continuam funcionando na pasta, §2.3)
  'subir.bat',
  'parar.bat',
  'status.bat',
  'baixar-lista.bat',
  'baixar-lista.ps1',
  'baixar-lista.lib.ps1',
  'validar-config.ps1',
  // slskd: só o modelo; o slskd.yml é gerado pelo assistente
  'slskd/slskd.example.yml',
  // Soulbeet: imagem estendida, configuração do beets e plugin
  'soulbeet/Dockerfile',
  'soulbeet/fix-metadata.py',
  'soulbeet/config/config.yaml',
  'soulbeet/beets-plugins/keepmix.py',
];

/** Pastas vazias que o compose espera encontrar (o Docker cria só as de sintaxe curta, mas ficam à vista). */
export const PASTAS_DA_STACK: readonly string[] = ['slskd', 'navidrome', 'soulbeet/data'];

/** Onde o app guarda o hash dos arquivos que instalou (para a atualização da §3.3, Fase 7). */
export const ARQUIVO_MANIFESTO = '.soulcrate/manifesto.json';

export interface Manifesto {
  versaoDaStack: string | null;
  /** caminho relativo (barras normais) → SHA-256 do que o app instalou */
  arquivos: Record<string, string>;
}
