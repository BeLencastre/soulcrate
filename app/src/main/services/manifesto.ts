// Hash e manifesto dos arquivos da stack (`.soulcrate/manifesto.json`), num lugar só: o assistente (que o cria), a
// atualização (que o lê e o mantém) e a migração (que compara com o que o app traz) falam do mesmo formato.
import { createHash } from 'node:crypto';
import type { Manifesto } from '@shared/stack-arquivos';
import { semBom } from '@shared/texto';

export const sha256 = (dados: Buffer): string => createHash('sha256').update(dados).digest('hex');

/** O manifesto lido do texto do arquivo, com os padrões em dia; null se o JSON não presta. */
export function lerManifesto(texto: string): Manifesto | null {
  try {
    const lido = JSON.parse(semBom(texto)) as Partial<Manifesto>;
    return {
      versaoDaStack: typeof lido.versaoDaStack === 'string' ? lido.versaoDaStack : null,
      arquivos: { ...lido.arquivos },
      novos: { ...lido.novos },
    };
  } catch {
    return null;
  }
}
