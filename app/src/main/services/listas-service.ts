// ListasService (Fase 3, "Editor de lista"): as listas `.txt` e `.csv` que ficam na pasta do Soulcrate. Abrir, salvar,
// criar a partir do exemplo, importar de fora e analisar com o próprio script (`-SoAnalisar`, P5): o parsing da
// lista é do baixar-lista.ps1, não é duplicado em TypeScript. O renderer só fala em nomes de arquivo; todo caminho
// é montado aqui dentro da pasta do Soulcrate.
import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { lerAnaliseLista } from '@shared/analise-lista';
import {
  ARQUIVO_EXEMPLO,
  LIMITE_LISTA_BYTES,
  nomeDeListaValido,
  nomeDoEstado,
  tipoDaLista,
  type ListaConteudo,
  type ListaRef,
  type ModeloLista,
  type OpcoesAnalise,
  type ResultadoAnalise,
} from '@shared/lote';
import type { Executor } from '../processos';
import { POWERSHELL } from './lote-comando';

const MAX_RECENTES = 30;
const TIMEOUT_ANALISE_MS = 30_000;
const TIMEOUT_ANALISE_BIBLIOTECA_MS = 120_000;

/** Usado só se o `lista.exemplo.txt` não estiver na pasta (stack antiga). */
const EXEMPLO_PADRAO = [
  '# Uma faixa por linha:  Artista - Titulo (Mix)',
  '# Linhas com # sao ignoradas. Se não escrever o mix, o script prefere Original/Extended e evita Remix/Edit.',
  '# Para um remix especifico, escreva o nome do remix entre parênteses.',
  '',
].join('\r\n');

const dois = (n: number) => String(n).padStart(2, '0');

export class AnaliseCanceladaError extends Error {
  constructor() {
    super('Análise cancelada: chegou uma mais nova.');
    this.name = 'AnaliseCanceladaError';
  }
}

export interface DepsListas {
  executor: Executor;
  agora(): number;
  /** pasta dos arquivos temporários (padrão: a do sistema) */
  pastaTemporaria?: string;
}

export class ListasService {
  private readonly analises = new Map<string, AbortController>();

  constructor(private readonly d: DepsListas) {}

  /** Listas da pasta do Soulcrate, as mais recentes primeiro (o `lista.exemplo.txt` é modelo, não lista). */
  recentes(dir: string): ListaRef[] {
    let nomes: string[];
    try {
      nomes = readdirSync(dir);
    } catch {
      return [];
    }
    const listas: ListaRef[] = [];
    for (const nome of nomes) {
      if (!nomeDeListaValido(nome) || nome.toLowerCase() === ARQUIVO_EXEMPLO) continue;
      const ref = this.referencia(dir, nome);
      if (ref) listas.push(ref);
    }
    return listas.sort((a, b) => b.modificadaEm - a.modificadaEm).slice(0, MAX_RECENTES);
  }

  ler(dir: string, nome: string): ListaConteudo {
    const ref = this.referencia(dir, exigirNome(nome));
    if (!ref) throw new Error(`A lista ${nome} não existe.`);
    if (ref.bytes > LIMITE_LISTA_BYTES) throw new Error('A lista é grande demais para o editor (mais de 5 MB).');
    return {
      ...ref,
      texto: decodificar(readFileSync(join(dir, nome))),
      somenteLeitura: ref.tipo === 'csv',
    };
  }

  /** Grava a lista (UTF-8 sem BOM, fim de linha do Windows) por um arquivo temporário: nunca fica pela metade. */
  salvar(dir: string, nome: string, texto: string): ListaRef {
    exigirNome(nome);
    if (tipoDaLista(nome) === 'csv') throw new Error('Listas em CSV não são editadas no app.');
    if (typeof texto !== 'string' || Buffer.byteLength(texto) > LIMITE_LISTA_BYTES) {
      throw new Error('Texto da lista inválido ou grande demais.');
    }
    gravarAtomico(join(dir, nome), Buffer.from(texto.replace(/\r?\n/g, '\r\n'), 'utf8'));
    return this.referenciaOuErro(dir, nome);
  }

  /** `lista-AAAA-MM-DD.txt` (com `-2`, `-3`… se já existe), vazia ou com o conteúdo do `lista.exemplo.txt`. */
  criar(dir: string, modelo: ModeloLista): ListaRef {
    const d = new Date(this.d.agora());
    const base = `lista-${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
    const nome = nomeLivre(dir, `${base}.txt`);
    let conteudo = '';
    if (modelo === 'exemplo') {
      const exemplo = join(dir, ARQUIVO_EXEMPLO);
      conteudo = existsSync(exemplo) ? decodificar(readFileSync(exemplo)) : EXEMPLO_PADRAO;
    }
    gravarAtomico(join(dir, nome), Buffer.from(conteudo.replace(/\r?\n/g, '\r\n'), 'utf8'));
    return this.referenciaOuErro(dir, nome);
  }

  /** Copia um arquivo escolhido pelo usuário para a pasta do Soulcrate (bytes iguais: o script lê a codificação). */
  importarArquivo(dir: string, origem: string): ListaRef {
    const nomeOrigem = basename(origem);
    const stat = statSync(origem);
    if (!stat.isFile()) throw new Error('Escolha um arquivo.');
    if (!/\.(txt|csv)$/i.test(nomeOrigem)) throw new Error('Só arquivos .txt e .csv podem ser importados.');
    if (stat.size > LIMITE_LISTA_BYTES) throw new Error('O arquivo é grande demais (mais de 5 MB).');
    // já está na pasta do Soulcrate: é só abrir
    if (resolve(dirname(origem)).toLowerCase() === resolve(dir).toLowerCase() && nomeDeListaValido(nomeOrigem)) {
      return this.referenciaOuErro(dir, nomeOrigem);
    }
    const nome = nomeLivre(dir, nomeSeguro(nomeOrigem));
    copyFileSync(origem, join(dir, nome));
    return this.referenciaOuErro(dir, nome);
  }

  /** Arquivo solto na janela: o renderer manda os bytes (sem caminho) e o app grava na pasta do Soulcrate. */
  importarBytes(dir: string, nomeOrigem: string, bytes: Uint8Array): ListaRef {
    if (typeof nomeOrigem !== 'string' || !/\.(txt|csv)$/i.test(nomeOrigem)) {
      throw new Error('Só arquivos .txt e .csv podem ser importados.');
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > LIMITE_LISTA_BYTES) {
      throw new Error('O arquivo é grande demais (mais de 5 MB).');
    }
    const nome = nomeLivre(dir, nomeSeguro(nomeOrigem));
    gravarAtomico(join(dir, nome), Buffer.from(bytes));
    return this.referenciaOuErro(dir, nome);
  }

  /**
   * Roda `baixar-lista.ps1 -SoAnalisar` na lista já salva e devolve a análise (P5). Uma análise nova da mesma lista
   * cancela a anterior: o editor pede uma a cada pausa na digitação.
   */
  async analisar(dir: string, nome: string, opcoes: OpcoesAnalise): Promise<ResultadoAnalise> {
    exigirNome(nome);
    if (!existsSync(join(dir, nome))) throw new Error(`A lista ${nome} não existe.`);
    const script = join(dir, 'baixar-lista.ps1');
    if (!existsSync(script)) throw new Error('O baixar-lista.ps1 não está na pasta do Soulcrate.');

    this.analises.get(nome)?.abort();
    const cancelador = new AbortController();
    this.analises.set(nome, cancelador);

    const saida = join(this.d.pastaTemporaria ?? tmpdir(), `soulcrate-analise-${randomBytes(6).toString('hex')}.json`);
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-Lista',
      nome,
      '-SoAnalisar',
      '-SaidaAnalise',
      saida,
      ...(opcoes.biblioteca ? ['-AnalisarBiblioteca'] : []),
      ...(opcoes.retentar ? ['-Retentar'] : []),
    ];
    try {
      const r = await this.d.executor.executar(POWERSHELL, args, {
        cwd: dir,
        timeoutMs: opcoes.biblioteca ? TIMEOUT_ANALISE_BIBLIOTECA_MS : TIMEOUT_ANALISE_MS,
        signal: cancelador.signal,
      });
      if (cancelador.signal.aborted) throw new AnaliseCanceladaError();
      if (r.erroSpawn) throw new Error(`Não consegui abrir o PowerShell: ${r.erroSpawn.message}`);
      if (r.tempoEsgotado) throw new Error('A análise da lista demorou demais.');
      let texto: string;
      try {
        texto = readFileSync(saida, 'utf8');
      } catch {
        throw new Error(
          `A análise não gerou resultado (código ${String(r.codigo)}). ${r.stderr.trim().slice(-300)}`.trim(),
        );
      }
      return { analise: lerAnaliseLista(texto), ultimaExecucaoEm: this.ultimaExecucao(dir, nome) };
    } finally {
      if (this.analises.get(nome) === cancelador) this.analises.delete(nome);
      rmSync(saida, { force: true });
    }
  }

  // ------------------------------------------------------------ internos

  private ultimaExecucao(dir: string, nome: string): number | null {
    try {
      return statSync(join(dir, 'lotes', `estado-${nomeDoEstado(nome)}.tsv`)).mtimeMs;
    } catch {
      return null;
    }
  }

  private referencia(dir: string, nome: string): ListaRef | null {
    try {
      const st = statSync(join(dir, nome));
      if (!st.isFile()) return null;
      return { nome, tipo: tipoDaLista(nome), modificadaEm: st.mtimeMs, bytes: st.size };
    } catch {
      return null;
    }
  }

  private referenciaOuErro(dir: string, nome: string): ListaRef {
    const ref = this.referencia(dir, nome);
    if (!ref) throw new Error(`Não consegui ler a lista ${nome} depois de gravar.`);
    return ref;
  }
}

function exigirNome(nome: unknown): string {
  if (!nomeDeListaValido(nome)) throw new Error('Nome de lista inválido.');
  return nome;
}

/** Texto do arquivo: UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252 (listas antigas do Bloco de Notas). */
export function decodificar(bytes: Buffer): string {
  const semBom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(semBom);
  } catch {
    texto = new TextDecoder('windows-1252').decode(semBom);
  }
  return texto.replace(/\r\n?/g, '\n');
}

/** Troca o que o Windows não aceita num nome de arquivo por `_` e garante um nome de lista válido. */
export function nomeSeguro(nome: string): string {
  let limpo = basename(nome)
    // eslint-disable-next-line no-control-regex -- caracteres de controle também são proibidos em nomes de arquivo
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');
  const ext = /\.csv$/i.test(limpo) ? '.csv' : '.txt';
  if (!/\.(txt|csv)$/i.test(limpo)) limpo = `${limpo}${ext}`;
  if (limpo.length > 120) limpo = `${limpo.slice(0, 120 - ext.length)}${ext}`;
  if (!nomeDeListaValido(limpo)) limpo = `lista-importada${ext}`;
  return limpo;
}

/** `nome.ext`, ou `nome-2.ext`, `nome-3.ext`… se já existe. */
export function nomeLivre(dir: string, nome: string): string {
  if (!existsSync(join(dir, nome))) return nome;
  const m = /^(.*?)(\.[^.]+)$/.exec(nome);
  const base = m?.[1] ?? nome;
  const ext = m?.[2] ?? '';
  for (let n = 2; ; n++) {
    const candidato = `${base}-${n}${ext}`;
    if (!existsSync(join(dir, candidato))) return candidato;
  }
}

function gravarAtomico(destino: string, dados: Buffer): void {
  mkdirSync(dirname(destino), { recursive: true });
  const tmp = `${destino}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, dados);
  renameSync(tmp, destino);
}
