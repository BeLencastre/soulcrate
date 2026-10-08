// ProjectService (§3.2 e §3.3): acha a pasta do Soulcrate, a que tem o docker-compose.yml.
// Na Fase 1 o app só localiza e valida a pasta; copiar os recursos para uma pasta nova é do assistente (Fase 2).
import { join } from 'node:path';
import type { OrigemProjeto, ProjetoStatus } from '@shared/stack';

export interface CandidatosProjeto {
  /** escolhida pelo usuário (AppSettings) */
  configurada: string | null;
  /** variável de ambiente SOULCRATE_DIR */
  ambiente: string | null;
  /** em desenvolvimento, a pasta-mãe de app/ (o repositório) */
  desenvolvimento: string | null;
  /** %USERPROFILE%\Soulcrate */
  padrao: string;
}

export const ARQUIVO_COMPOSE = 'docker-compose.yml';

/** A pasta serve se tiver o docker-compose.yml da stack. */
export function ehPastaDoSoulcrate(dir: string, existeArquivo: (p: string) => boolean): boolean {
  return existeArquivo(join(dir, ARQUIVO_COMPOSE));
}

/** Primeiro candidato que serve, na ordem: escolhida, ambiente, desenvolvimento, padrão. */
export function resolverProjeto(c: CandidatosProjeto, existeArquivo: (p: string) => boolean): ProjetoStatus {
  const ordem: [OrigemProjeto, string | null][] = [
    ['configurada', c.configurada],
    ['ambiente', c.ambiente],
    ['desenvolvimento', c.desenvolvimento],
    ['padrao', c.padrao],
  ];
  for (const [origem, dir] of ordem) {
    if (dir && ehPastaDoSoulcrate(dir, existeArquivo)) return { dir, origem };
  }
  return { dir: null, origem: null };
}

/** Só o número SemVer do arquivo VERSION (S3), ou null. */
export function lerVersaoDaStack(dir: string | null, ler: (p: string) => string | null): string | null {
  if (!dir) return null;
  const texto = ler(join(dir, 'VERSION'));
  const v = texto?.trim();
  return v && /^\d+\.\d+\.\d+/.test(v) ? v : null;
}
