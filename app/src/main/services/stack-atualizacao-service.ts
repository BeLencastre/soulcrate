// StackAtualizacaoService (§3.3, Fase 7): mantém em dia os arquivos da stack que o app instalou na pasta do Soulcrate
// (docker-compose.yml, scripts, Dockerfile, config do beets…) quando o app novo traz versões novas deles.
//
// A regra é a da §3.3 e o app nunca sobrescreve o que não sabe de onde veio:
//   - o arquivo da pasta é igual ao que o app instalou antes (ninguém o editou) → substitui;
//   - o usuário o editou (ou o manifesto não o conhece) → mantém o dele, grava o novo ao lado como `<arquivo>.novo` e avisa;
//   - nunca toca em `.env`, `slskd.yml`, listas, `lotes/`, `music/`… (a lista fechada é `ARQUIVOS_DA_STACK`).
// Uma pasta que o app só adotou (clone do Git, "usar uma pasta que já existe") não tem manifesto: o app não a atualiza.
// Nada disto roda com um lote em andamento nem no meio de ligar/desligar a stack.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { criarErro } from '@shared/erros';
import type { ResultadoAplicarStack } from '@shared/ipc';
import type { ProjetoStatus } from '@shared/stack';
import {
  ARQUIVO_MANIFESTO,
  ARQUIVO_ULTIMA_ATUALIZACAO,
  ARQUIVOS_DA_STACK,
  EXTENSAO_NOVO,
  type Manifesto,
} from '@shared/stack-arquivos';
import {
  decidirAcao,
  exigeReconstruir,
  type AcaoDoArquivo,
  type EstadoDaStack,
  type ResultadoAtualizacaoStack,
} from '@shared/stack-atualizacao';
import { semBom } from '@shared/texto';
import { lerManifesto, sha256 } from './manifesto';

export interface FsAtualizacao {
  existe(caminho: string): boolean;
  ler(caminho: string): Buffer;
  /** grava por arquivo temporário e renomeia: um corte de energia não deixa um arquivo pela metade */
  escreverAtomico(caminho: string, conteudo: Buffer | string): void;
  remover(caminho: string): void;
}

export const fsAtualizacaoReal: FsAtualizacao = {
  existe: (p) => existsSync(p) && statSync(p).isFile(),
  ler: (p) => readFileSync(p),
  escreverAtomico(caminho, conteudo) {
    mkdirSync(dirname(caminho), { recursive: true });
    const tmp = `${caminho}.soulcrate-tmp`;
    writeFileSync(tmp, conteudo);
    renameSync(tmp, caminho);
  },
  remover: (p) => rmSync(p, { force: true }),
};

export interface DependenciasStackAtualizacao {
  /** onde estão os arquivos da stack que acompanham o app; null se o app não os traz */
  origemStack: string | null;
  projeto(): ProjetoStatus;
  /** há um lote do app rodando? (a atualização espera) */
  loteRodando(): Promise<boolean>;
  /** ligar, desligar ou reconstruir está em curso? (a atualização espera) */
  operacaoEmCurso(): boolean;
  agora(): number;
  aoErro(e: unknown): void;
  fs?: FsAtualizacao;
}

export type ResultadoAplicar = ResultadoAplicarStack;

const caminho = (raiz: string, rel: string): string => join(raiz, ...rel.split('/'));
const RE_SEMVER = /^\d+\.\d+\.\d+/;
/** as ações que mudam alguma coisa no disco */
const PENDENTES: ReadonlySet<AcaoDoArquivo> = new Set(['copiar', 'atualizar', 'manter-e-oferecer']);

interface ItemDoPlano {
  arquivo: string;
  acao: AcaoDoArquivo;
  /** conteúdo e hash do arquivo que o app traz (null em `sem-origem`) */
  doApp: { dados: Buffer; hash: string } | null;
}

interface Plano {
  dir: string;
  origem: string;
  manifesto: Manifesto;
  itens: ItemDoPlano[];
  versaoDoApp: string | null;
}

export class StackAtualizacaoService {
  private readonly fs: FsAtualizacao;
  private aplicando = false;

  constructor(private readonly d: DependenciasStackAtualizacao) {
    this.fs = d.fs ?? fsAtualizacaoReal;
  }

  // ------------------------------------------------------------ leitura

  private lerVersao(raiz: string): string | null {
    const p = caminho(raiz, 'VERSION');
    if (!this.fs.existe(p)) return null;
    const v = semBom(this.fs.ler(p).toString('utf8')).trim();
    return RE_SEMVER.test(v) ? v : null;
  }

  private lerManifesto(dir: string): Manifesto | null {
    const p = caminho(dir, ARQUIVO_MANIFESTO);
    if (!this.fs.existe(p)) return null;
    // manifesto corrompido: sem ele não dá para distinguir o que o usuário editou, então o app não mexe em nada
    return lerManifesto(this.fs.ler(p).toString('utf8'));
  }

  private lerAviso(dir: string): ResultadoAtualizacaoStack | null {
    const p = caminho(dir, ARQUIVO_ULTIMA_ATUALIZACAO);
    if (!this.fs.existe(p)) return null;
    try {
      const r = JSON.parse(semBom(this.fs.ler(p).toString('utf8'))) as ResultadoAtualizacaoStack;
      return r.dispensado ? null : r;
    } catch {
      return null;
    }
  }

  private planejar(): Plano | { semGestao: 'sem-pasta' | 'sem-origem' | 'pasta-existente'; dir: string | null } {
    const dir = this.d.projeto().dir;
    if (!dir) return { semGestao: 'sem-pasta', dir: null };
    const origem = this.d.origemStack;
    if (!origem || !this.fs.existe(caminho(origem, 'docker-compose.yml'))) return { semGestao: 'sem-origem', dir };
    const manifesto = this.lerManifesto(dir);
    if (!manifesto) return { semGestao: 'pasta-existente', dir };

    const itens: ItemDoPlano[] = ARQUIVOS_DA_STACK.map((arquivo) => {
      const deApp = this.fs.existe(caminho(origem, arquivo)) ? this.fs.ler(caminho(origem, arquivo)) : null;
      const naPasta = this.fs.existe(caminho(dir, arquivo)) ? this.fs.ler(caminho(dir, arquivo)) : null;
      const acao = decidirAcao({
        atual: naPasta ? sha256(naPasta) : null,
        instalado: manifesto.arquivos[arquivo] ?? null,
        doApp: deApp ? sha256(deApp) : null,
        jaOferecido: manifesto.novos?.[arquivo] ?? null,
        novoExiste: this.fs.existe(caminho(dir, `${arquivo}${EXTENSAO_NOVO}`)),
      });
      return { arquivo, acao, doApp: deApp ? { dados: deApp, hash: sha256(deApp) } : null };
    });
    return { dir, origem, manifesto, itens, versaoDoApp: this.lerVersao(origem) };
  }

  /** O que a tela mostra: se o app cuida desta pasta, se há o que atualizar e o aviso da última atualização. */
  async estado(): Promise<EstadoDaStack> {
    const plano = this.planejar();
    if ('semGestao' in plano) {
      return {
        gerenciada: false,
        motivoSemGestao: plano.semGestao,
        versaoDaPasta: plano.dir ? this.lerVersao(plano.dir) : null,
        versaoDoApp: this.d.origemStack ? this.lerVersao(this.d.origemStack) : null,
        pendente: false,
        esperando: false,
        arquivosPendentes: 0,
        aviso: null,
      };
    }
    const pendentes = plano.itens.filter((i) => PENDENTES.has(i.acao)).length;
    return {
      gerenciada: true,
      motivoSemGestao: null,
      versaoDaPasta: this.lerVersao(plano.dir),
      versaoDoApp: plano.versaoDoApp,
      pendente: pendentes > 0,
      esperando: pendentes > 0 && (await this.ocupado()),
      arquivosPendentes: pendentes,
      aviso: this.lerAviso(plano.dir),
    };
  }

  private async ocupado(): Promise<boolean> {
    return this.d.operacaoEmCurso() || (await this.d.loteRodando());
  }

  // ------------------------------------------------------------ escrita

  /** Aplica a atualização se houver o que atualizar e nada estiver rodando; senão devolve `esperando`. */
  async aplicar(): Promise<ResultadoAplicar> {
    if (this.aplicando) return { ok: true, resultado: null, esperando: true };
    this.aplicando = true;
    try {
      const plano = this.planejar();
      if ('semGestao' in plano) return { ok: true, resultado: null, esperando: false };
      if (!plano.itens.some((i) => PENDENTES.has(i.acao))) {
        this.sincronizarManifesto(plano);
        return { ok: true, resultado: null, esperando: false };
      }
      if (await this.ocupado()) return { ok: true, resultado: null, esperando: true };
      return { ok: true, resultado: this.escrever(plano), esperando: false };
    } catch (e) {
      this.d.aoErro(e);
      const detalhes =
        e instanceof Error ? `${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}`.trim() : String(e);
      return { ok: false, erro: criarErro('stack.atualizacao-falhou', { detalhes }) };
    } finally {
      this.aplicando = false;
    }
  }

  /** Só alinha o manifesto com a pasta (arquivos que já estão iguais ao do app, versão nova da stack). Sem aviso. */
  private sincronizarManifesto(plano: Plano): void {
    let mudou = false;
    for (const i of plano.itens) {
      if (i.acao === 'igual' && i.doApp && plano.manifesto.arquivos[i.arquivo] !== i.doApp.hash) {
        plano.manifesto.arquivos[i.arquivo] = i.doApp.hash;
        mudou = true;
      }
    }
    if (plano.versaoDoApp && plano.manifesto.versaoDaStack !== plano.versaoDoApp) {
      plano.manifesto.versaoDaStack = plano.versaoDoApp;
      mudou = true;
    }
    if (mudou) this.gravarManifesto(plano.dir, plano.manifesto);
  }

  private escrever(plano: Plano): ResultadoAtualizacaoStack {
    const { dir, manifesto } = plano;
    manifesto.novos ??= {};
    const r: ResultadoAtualizacaoStack = {
      aplicadoEm: this.d.agora(),
      versaoAnterior: manifesto.versaoDaStack ?? this.lerVersao(dir),
      versaoNova: plano.versaoDoApp,
      atualizados: [],
      copiados: [],
      mantidos: [],
      precisaReconstruir: false,
      dispensado: false,
    };

    for (const { arquivo, acao, doApp } of plano.itens) {
      if (!doApp) continue;
      const destino = caminho(dir, arquivo);
      switch (acao) {
        case 'copiar':
        case 'atualizar':
          this.fs.escreverAtomico(destino, doApp.dados);
          manifesto.arquivos[arquivo] = doApp.hash;
          // um `.novo` que o app deixou antes ficou obsoleto: o original agora é o novo
          if (manifesto.novos[arquivo]) this.fs.remover(`${destino}${EXTENSAO_NOVO}`);
          Reflect.deleteProperty(manifesto.novos, arquivo);
          (acao === 'copiar' ? r.copiados : r.atualizados).push(arquivo);
          if (exigeReconstruir(arquivo)) r.precisaReconstruir = true;
          break;
        case 'igual':
          manifesto.arquivos[arquivo] = doApp.hash;
          Reflect.deleteProperty(manifesto.novos, arquivo);
          break;
        case 'manter-e-oferecer':
          this.fs.escreverAtomico(`${destino}${EXTENSAO_NOVO}`, doApp.dados);
          manifesto.novos[arquivo] = doApp.hash;
          r.mantidos.push(arquivo);
          if (exigeReconstruir(arquivo)) r.precisaReconstruir = true;
          break;
        default:
          break;
      }
    }
    if (plano.versaoDoApp) manifesto.versaoDaStack = plano.versaoDoApp;
    if (Object.keys(manifesto.novos).length === 0) delete manifesto.novos;
    this.gravarManifesto(dir, manifesto);
    this.fs.escreverAtomico(caminho(dir, ARQUIVO_ULTIMA_ATUALIZACAO), `${JSON.stringify(r, null, 2)}\n`);
    return r;
  }

  private gravarManifesto(dir: string, m: Manifesto): void {
    this.fs.escreverAtomico(caminho(dir, ARQUIVO_MANIFESTO), `${JSON.stringify(m, null, 2)}\n`);
  }

  /** "Dispensar" o aviso do Início. */
  dispensarAviso(): void {
    const dir = this.d.projeto().dir;
    if (!dir) return;
    const aviso = this.lerAviso(dir);
    if (!aviso) return;
    this.fs.escreverAtomico(
      caminho(dir, ARQUIVO_ULTIMA_ATUALIZACAO),
      `${JSON.stringify({ ...aviso, dispensado: true }, null, 2)}\n`,
    );
  }
}
