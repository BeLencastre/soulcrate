// MigracaoService (§5, Fase 7, "Migração de instalações via Git"): quem já usa o Soulcrate por um clone do Git escolhe
// "usar uma pasta que já existe" no assistente. O app não copia nada para ela (quem a atualiza é o `git pull`), mas
// avisa se os arquivos da stack têm alterações locais, que um `git pull` ou uma atualização futura podem atropelar.
// Duas fontes: o próprio git (`git diff --relative --name-only HEAD`, exato, quando há `.git` e o git está instalado) e a
// comparação com o que este app traz (serve quando não há git, mas uma versão diferente também aparece como diferença).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ARQUIVOS_DA_STACK } from '@shared/stack-arquivos';
import type { MigracaoInfo } from '@shared/stack-atualizacao';
import type { Executor } from '../processos';
import { sha256 } from './manifesto';

/** Documentação e modelos: diferir deles não muda o funcionamento da stack, então não entram no aviso. */
const SO_DOCUMENTACAO = new Set([
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'VERSION',
  'lista.exemplo.txt',
  '.env.example',
]);
const TIMEOUT_GIT_MS = 10_000;

const ehArquivo = (p: string): boolean => {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
};
const hashDoArquivo = (p: string): string => sha256(readFileSync(p));
const caminho = (raiz: string, rel: string): string => join(raiz, ...rel.split('/'));

export interface DependenciasMigracao {
  executor: Executor;
  /** onde estão os arquivos da stack que acompanham o app; null se o app não os traz */
  origemStack: string | null;
}

export class MigracaoService {
  constructor(private readonly d: DependenciasMigracao) {}

  async analisar(dir: string): Promise<MigracaoInfo> {
    const funcionais = ARQUIVOS_DA_STACK.filter((a) => !SO_DOCUMENTACAO.has(a));
    const clone = existsSync(join(dir, '.git'));

    const diferentesDoApp: string[] = [];
    const origem = this.d.origemStack;
    if (origem) {
      for (const a of funcionais) {
        const daPasta = caminho(dir, a);
        const doApp = caminho(origem, a);
        if (ehArquivo(daPasta) && ehArquivo(doApp) && hashDoArquivo(daPasta) !== hashDoArquivo(doApp))
          diferentesDoApp.push(a);
      }
    }

    let alteracoesLocais: string[] = [];
    let gitIndisponivel = false;
    if (clone) {
      // a pasta é de quem a escolheu, e um repositório baixado pode trazer, no .git/config ou no .gitattributes, programas
      // para o git rodar (core.fsmonitor, diff externo, textconv): nada disso pode rodar só porque a pasta foi escolhida
      const r = await this.d.executor.executar(
        'git',
        [
          '-c',
          'core.fsmonitor=false',
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--relative',
          '--name-only',
          'HEAD',
          '--',
          ...funcionais,
        ],
        { cwd: dir, timeoutMs: TIMEOUT_GIT_MS, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
      );
      if (r.erroSpawn || r.codigo !== 0) gitIndisponivel = true;
      else
        alteracoesLocais = r.stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
    }
    return { clone, alteracoesLocais, diferentesDoApp, gitIndisponivel };
  }
}
