// Junta os arquivos da stack em resources/stack/, de onde o electron-builder os leva para dentro do instalador
// (extraResources → resources/stack no app instalado). É de lá que o assistente os copia para a pasta do Soulcrate
// de um usuário novo (§3.3). A lista é a mesma do app: src/shared/stack-arquivos.ts.
// Rodado por `npm run pack:dir` e `npm run dist`; a pasta de saída não é versionada.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ARQUIVOS_DA_STACK } from '../src/shared/stack-arquivos.ts';

const repositorio = resolve(import.meta.dirname, '..', '..');
const saida = resolve(import.meta.dirname, '..', 'resources', 'stack');

rmSync(saida, { recursive: true, force: true });
const faltando = ARQUIVOS_DA_STACK.filter((a) => !existsSync(join(repositorio, a)));
if (faltando.length > 0) {
  console.error(`Faltam arquivos da stack no repositório: ${faltando.join(', ')}`);
  process.exit(1);
}
for (const arquivo of ARQUIVOS_DA_STACK) {
  const destino = join(saida, arquivo);
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(join(repositorio, arquivo), destino);
}
console.log(`resources/stack: ${ARQUIVOS_DA_STACK.length} arquivos da stack.`);
