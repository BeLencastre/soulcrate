// PastaService (passo 1 do assistente, §3.3): prepara a pasta do Soulcrate. Numa pasta nova, copia os recursos da
// stack (docker-compose.yml, scripts, modelos…) e guarda o hash do que instalou em `.soulcrate/manifesto.json`;
// numa pasta que já existe (clone do Git, por exemplo), só confere e passa a gerenciá-la, sem copiar nada.
// Arquivos do usuário nunca são sobrescritos: um arquivo que já existe e é diferente fica como está.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import type { EntradaPasta, ResultadoPasta } from '@shared/configuracao';
import { criarErro } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { ARQUIVO_MANIFESTO, ARQUIVOS_DA_STACK, PASTAS_DA_STACK, type Manifesto } from '@shared/stack-arquivos';
import { semBom } from '@shared/texto';
import type { ConfigService } from './config-service';
import { ARQUIVO_COMPOSE } from './project-service';

export interface FsPasta {
  existe(caminho: string): boolean;
  ehPasta(caminho: string): boolean;
  ler(caminho: string): Buffer;
  escrever(caminho: string, conteudo: Buffer | string): void;
  criarPasta(caminho: string): void;
}

export const fsPastaReal: FsPasta = {
  existe: (p) => existsSync(p),
  ehPasta: (p) => existsSync(p) && statSync(p).isDirectory(),
  ler: (p) => readFileSync(p),
  escrever(caminho, conteudo) {
    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, conteudo);
  },
  criarPasta: (p) => void mkdirSync(p, { recursive: true }),
};

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export interface ResultadoInstalacao {
  /** arquivos que não existiam e foram copiados */
  copiados: string[];
  /** já existiam e são idênticos ao da stack */
  iguais: string[];
  /** já existiam e são diferentes: ficam como estão (o usuário os editou ou são de outra versão) */
  mantidos: string[];
  /** a origem não tem o arquivo (não deveria acontecer) */
  ausentes: string[];
}

/** Copia os arquivos da stack de `origem` para `destino` sem sobrescrever nada e atualiza o manifesto. */
export function instalarStack(opcoes: {
  origem: string;
  destino: string;
  fs?: FsPasta;
  arquivos?: readonly string[];
  pastas?: readonly string[];
}): ResultadoInstalacao {
  const { origem, destino } = opcoes;
  const fs = opcoes.fs ?? fsPastaReal;
  const r: ResultadoInstalacao = { copiados: [], iguais: [], mantidos: [], ausentes: [] };

  fs.criarPasta(destino);
  const manifestoPath = join(destino, ...ARQUIVO_MANIFESTO.split('/'));
  let manifesto: Manifesto = { versaoDaStack: null, arquivos: {} };
  if (fs.existe(manifestoPath)) {
    try {
      const lido = JSON.parse(semBom(fs.ler(manifestoPath).toString('utf8'))) as Partial<Manifesto>;
      manifesto = { versaoDaStack: lido.versaoDaStack ?? null, arquivos: { ...lido.arquivos } };
    } catch {
      /* manifesto corrompido: recomeça; só se perde o histórico de hashes */
    }
  }

  for (const rel of opcoes.arquivos ?? ARQUIVOS_DA_STACK) {
    const de = join(origem, ...rel.split('/'));
    const para = join(destino, ...rel.split('/'));
    if (!fs.existe(de)) {
      r.ausentes.push(rel);
      continue;
    }
    const conteudo = fs.ler(de);
    if (fs.existe(para)) {
      if (sha256(fs.ler(para)) === sha256(conteudo)) {
        r.iguais.push(rel);
        manifesto.arquivos[rel] = sha256(conteudo);
      } else {
        r.mantidos.push(rel);
      }
      continue;
    }
    fs.escrever(para, conteudo);
    r.copiados.push(rel);
    manifesto.arquivos[rel] = sha256(conteudo);
  }
  for (const pasta of opcoes.pastas ?? PASTAS_DA_STACK) fs.criarPasta(join(destino, ...pasta.split('/')));

  const versaoPath = join(origem, 'VERSION');
  if (fs.existe(versaoPath)) {
    const v = fs.ler(versaoPath).toString('utf8').trim();
    if (/^\d+\.\d+\.\d+/.test(v)) manifesto.versaoDaStack = v;
  }
  fs.escrever(manifestoPath, `${JSON.stringify(manifesto, null, 2)}\n`);
  return r;
}

export interface DependenciasPasta {
  config: ConfigService;
  /** onde estão os arquivos da stack que acompanham o app; null se o app não os traz */
  origemStack: string | null;
  fs?: FsPasta;
}

export class PastaService {
  private readonly fs: FsPasta;

  constructor(private readonly dep: DependenciasPasta) {
    this.fs = dep.fs ?? fsPastaReal;
  }

  /** Padrão proposto para uma instalação nova: `Soulcrate` no perfil do usuário (D1). */
  static pastaPadrao(home: string): string {
    return join(home, 'Soulcrate');
  }

  preparar(entrada: EntradaPasta): ResultadoPasta {
    const falhou = (erro: string): ResultadoPasta => ({
      ok: false,
      erro,
      falha: null,
      dir: null,
      copiados: 0,
      jaExistia: false,
      config: null,
    });
    const bruto = entrada.caminho
      .trim()
      .replace(/^"+|"+$/g, '')
      .trim();
    if (!bruto) return falhou(msg.assistente.pasta.vazia);
    if (!isAbsolute(bruto)) return falhou(msg.assistente.pasta.naoAbsoluta);
    const dir = resolve(bruto);

    if (this.fs.existe(dir) && !this.fs.ehPasta(dir)) return falhou(msg.assistente.pasta.eArquivo);
    const temCompose = this.fs.existe(join(dir, ARQUIVO_COMPOSE));

    if (entrada.modo === 'existente') {
      if (!this.fs.ehPasta(dir)) return falhou(msg.assistente.pasta.naoExiste);
      if (!temCompose) return falhou(msg.configuracoes.pastaSemCompose);
      return this.pronta(dir, 0, true);
    }

    // pasta nova (ou uma que já é do Soulcrate: aí só passa a ser gerenciada)
    if (temCompose) return this.pronta(dir, 0, true);
    if (parse(dir).root === dir) return falhou(msg.assistente.pasta.raizDoDisco);
    if (!this.dep.origemStack || !this.fs.existe(join(this.dep.origemStack, ARQUIVO_COMPOSE))) {
      return {
        ...falhou(''),
        erro: null,
        falha: criarErro('pasta.nao-instalou', {
          detalhes: 'O app não traz os arquivos da stack (pasta de recursos ausente).',
        }),
      };
    }
    try {
      const r = instalarStack({ origem: this.dep.origemStack, destino: dir, fs: this.fs });
      return this.pronta(dir, r.copiados.length, false);
    } catch (e) {
      const detalhes =
        e instanceof Error ? `${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}`.trim() : String(e);
      return { ...falhou(''), erro: null, falha: criarErro('pasta.nao-instalou', { detalhes }) };
    }
  }

  private pronta(dir: string, copiados: number, jaExistia: boolean): ResultadoPasta {
    return { ok: true, erro: null, falha: null, dir, copiados, jaExistia, config: this.dep.config.ler(dir) };
  }
}
