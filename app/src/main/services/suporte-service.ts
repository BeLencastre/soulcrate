// SuporteService (Fase 6): o "pacote de suporte", um .zip com o que o suporte precisa para entender um problema, SEM
// segredos (§6.1): os logs do app, os últimos `execucao-*.log` dos lotes, o `docker compose ps`, as versões e o resultado
// da conferência da configuração. Todo texto passa por dois filtros antes de entrar no zip: o de padrões (`redigirSegredos`:
// variáveis conhecidas, `X-API-Key`, campos JSON) e o de VALORES (as senhas e chaves que estão de fato no `.env` e no
// `slskd.yml` desta máquina, onde quer que apareçam). O pacote nunca inclui o `.env` nem o `slskd.yml` em si.
import { readdirSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { criarErro } from '@shared/erros';
import type { AppSettings } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import type { InfoSobre, ResultadoPacoteSuporte } from '@shared/sobre';
import type { ConfigStatus, ProjetoStatus, StackStatus } from '@shared/stack';
import { semBom } from '@shared/texto';
import { redigirSegredos } from '../seguranca';
import { criarZip, type EntradaZip } from '../zip';
import { lerChaveSlskd, lerEnv } from './config-validacao';

/** Variáveis do `.env` cujo valor nunca sai, pelo nome (cobre as quatro conhecidas e qualquer outra com cara de segredo). */
const RE_NOME_SECRETO = /(PASSWORD|PASSWD|SECRET|API_?KEY|TOKEN|^KEY$|_KEY$)/i;
const MASCARA = '***';
/** Valores curtos demais (um PUID de 4 dígitos) estragariam o texto ao serem trocados em todo lugar. */
const MIN_CARACTERES_DE_VALOR = 6;
const ULTIMAS_EXECUCOES = 3;
/** Cada arquivo de log entra com no máximo isto, do FIM (o que aconteceu por último é o que importa). */
const MAX_BYTES_POR_ARQUIVO = 2 * 1024 * 1024;

export interface DependenciasSuporte {
  agora(): Date;
  pastaDeLogs(): string;
  projeto(): ProjetoStatus;
  status(): StackStatus;
  /** o resultado da conferência da configuração (só nomes e mensagens, nunca valores) */
  config(dir: string): ConfigStatus;
  settings(): AppSettings;
  lerArquivo(caminho: string): string | null;
  composePsTexto(dir: string): Promise<string | null>;
  sobre(): Promise<InfoSobre>;
  sistema: { release: string; arquitetura: string; tipo: string };
  aoErro(e: unknown): void;
}

/** Decodifica um log: UTF-16 com BOM (alguns arquivos do PowerShell 5.1) ou UTF-8, com ou sem BOM. */
export function decodificarLog(dados: Buffer): string {
  if (dados.length >= 2 && dados[0] === 0xff && dados[1] === 0xfe) return dados.subarray(2).toString('utf16le');
  return semBom(dados.toString('utf8'));
}

/** Troca por `***` cada ocorrência dos valores secretos (os que estão de fato nesta máquina). Valores curtos são ignorados. */
export function redigirValores(texto: string, valores: readonly string[]): string {
  let saida = texto;
  // do maior para o menor: um valor que contém outro some inteiro
  for (const v of [...new Set(valores)]
    .filter((x) => x.length >= MIN_CARACTERES_DE_VALOR)
    .sort((a, b) => b.length - a.length)) {
    saida = saida.split(v).join(MASCARA);
  }
  return saida;
}

/** O `.env` com os valores secretos trocados por `***`; o resto (pastas, fuso, PUID) fica, que é o que o suporte quer ver. */
export function envSemSegredos(texto: string): string {
  return texto
    .split(/\r?\n/)
    .map((linha) => {
      const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/.exec(linha);
      if (!m || !RE_NOME_SECRETO.test(m[2] as string)) return linha;
      return `${m[1]}${m[2]}${m[3]}${(m[4] ?? '').trim() === '' ? '' : MASCARA}`;
    })
    .join('\r\n');
}

/** Os valores secretos que existem nesta máquina: do `.env` (por nome) e do `slskd.yml` (chaves, senhas e segredos). */
export function valoresSecretos(env: string | null, yml: string | null): string[] {
  const valores: string[] = [];
  if (env !== null) {
    for (const [nome, valor] of lerEnv(env)) if (RE_NOME_SECRETO.test(nome) && valor) valores.push(valor);
  }
  if (yml !== null) {
    const chave = lerChaveSlskd(yml);
    if (chave) valores.push(chave);
    for (const m of yml.matchAll(/^\s*(?:password|passwd|secret|key|jwt|token|api_key)\s*:\s*(.+?)\s*(?:#.*)?$/gim)) {
      const v = (m[1] ?? '').trim().replace(/^["']|["']$/g, '');
      if (v) valores.push(v);
    }
  }
  return valores;
}

/**
 * Lê no máximo `max` bytes do FIM do arquivo (e avisa se cortou). A codificação é decidida pelo COMEÇO do arquivo (o BOM
 * só existe lá): um log em UTF-16 lido só pelo fim, sem isso, viraria lixo com NULs e o filtro de segredos não o reconheceria.
 */
async function lerFim(caminho: string, max: number): Promise<{ texto: string; cortado: boolean } | null> {
  let fh;
  try {
    fh = await open(caminho, 'r');
    const { size } = await fh.stat();
    const cabeca = Buffer.alloc(Math.min(2, size));
    await fh.read(cabeca, 0, cabeca.length, 0);
    const utf16 = cabeca.length === 2 && cabeca[0] === 0xff && cabeca[1] === 0xfe;
    let inicio = Math.max(0, size - max);
    if (utf16) inicio -= inicio % 2; // nunca no meio de uma unidade de 2 bytes
    const buf = Buffer.alloc(size - inicio);
    await fh.read(buf, 0, buf.length, inicio);
    const texto = utf16 ? semBom(buf.toString('utf16le')) : decodificarLog(buf);
    return { texto, cortado: inicio > 0 };
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

function listar(pasta: string, filtro: RegExp): { nome: string; quando: number }[] {
  try {
    return readdirSync(pasta)
      .filter((n) => filtro.test(n))
      .map((nome) => ({ nome, quando: statSync(join(pasta, nome)).mtimeMs }))
      .sort((a, b) => b.quando - a.quando);
  } catch {
    return [];
  }
}

const quebra = (linhas: string[]) => `${linhas.join('\r\n')}\r\n`;
const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** `soulcrate-suporte-2026-10-08.zip` */
export function nomeSugeridoDoPacote(d: Date): string {
  return `soulcrate-suporte-${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}.zip`;
}

export class SuporteService {
  constructor(private readonly d: DependenciasSuporte) {}

  /** Junta o conteúdo do pacote (já sem segredos), sem gravar nada. */
  async montar(): Promise<EntradaZip[]> {
    const agora = this.d.agora();
    const dir = this.d.projeto().dir;
    const env = dir ? this.d.lerArquivo(join(dir, '.env')) : null;
    const yml = dir ? this.d.lerArquivo(join(dir, 'slskd', 'slskd.yml')) : null;
    const segredos = valoresSecretos(env, yml);
    const limpar = (t: string) => redigirSegredos(redigirValores(t, segredos));
    const entradas: EntradaZip[] = [];
    const incluir = (nome: string, texto: string) =>
      entradas.push({ nome, dados: Buffer.from(limpar(texto), 'utf8'), data: agora });

    const avisos: string[] = [];

    // ----- versões
    try {
      const info = await this.d.sobre();
      const st = this.d.status();
      incluir(
        'versoes.txt',
        quebra([
          `Soulcrate (app)  ${info.app.versao}${info.app.empacotado ? '' : '  [desenvolvimento]'}`,
          `Electron         ${info.app.electron}`,
          `Chromium         ${info.app.chromium}`,
          `Node.js          ${info.app.node}`,
          `Sistema          ${this.d.sistema.tipo} ${this.d.sistema.release} (${this.d.sistema.arquitetura})`,
          '',
          `Stack (pasta)    ${info.stack.instalada ?? 'não encontrada'}`,
          `Stack (do app)   ${info.stack.doApp ?? 'não encontrada'}`,
          ...info.componentes.map(
            (c) =>
              `${c.nome.padEnd(16)} ${c.versao ?? `não lida (${c.motivo ?? 'desconhecido'})`}${c.fonte ? `  [${c.fonte}]` : ''}`,
          ),
          '',
          `Docker           ${st.docker.versaoServidor ?? 'não responde'}${st.docker.compose ? `  (compose ${st.docker.compose})` : ''}`,
        ]),
      );
    } catch (e) {
      this.d.aoErro(e);
      avisos.push('versoes.txt: não consegui montar.');
    }

    // ----- configuração (só o que a conferência achou, sem valores) e preferências do app
    if (dir) {
      const conf = this.d.config(dir);
      incluir(
        'configuracao.txt',
        quebra([
          `Pasta do Soulcrate: ${dir}`,
          `Conferência: ${conf.estado} · ${conf.erros} erro(s) · ${conf.avisos} aviso(s)`,
          ...conf.achados.map(
            (a) => `  [${a.nivel}] ${a.arquivo}${a.variavel ? ` · ${a.variavel}` : ''}: ${a.mensagem}`,
          ),
          '',
          'Preferências do app:',
          ...JSON.stringify(this.d.settings(), null, 2).split('\n'),
        ]),
      );
    }
    if (env !== null) {
      incluir(
        'env-sem-segredos.txt',
        `# O .env desta máquina, com senhas e chaves trocadas por ${MASCARA}.\r\n${envSemSegredos(env)}\r\n`,
      );
    }

    // ----- docker compose ps
    if (dir) {
      let ps: string | null = null;
      try {
        ps = await this.d.composePsTexto(dir);
      } catch (e) {
        this.d.aoErro(e);
      }
      incluir(
        'docker-compose-ps.txt',
        ps ?? 'O `docker compose ps` não respondeu (Docker fechado ou stack ausente).\r\n',
      );
    }

    // ----- logs do app
    const pastaLogs = this.d.pastaDeLogs();
    for (const f of listar(pastaLogs, /\.log$/i).slice(0, 4)) {
      const lido = await lerFim(join(pastaLogs, f.nome), MAX_BYTES_POR_ARQUIVO);
      if (!lido) continue;
      incluir(
        `logs-do-app/${f.nome}`,
        lido.cortado ? `[…início cortado: só o fim do arquivo]\r\n${lido.texto}` : lido.texto,
      );
    }

    // ----- os últimos lotes
    if (dir) {
      const lotes = join(dir, 'lotes');
      for (const f of listar(lotes, /^execucao-[A-Za-z0-9_-]+\.log$/).slice(0, ULTIMAS_EXECUCOES)) {
        const lido = await lerFim(join(lotes, f.nome), MAX_BYTES_POR_ARQUIVO);
        if (!lido) continue;
        incluir(
          `lotes/${f.nome}`,
          lido.cortado ? `[…início cortado: só o fim do arquivo]\r\n${lido.texto}` : lido.texto,
        );
        // o erro do PowerShell daquela execução, quando houve (costuma explicar um lote que nem começou)
        const id = f.nome.replace(/^execucao-/, '').replace(/\.log$/i, '');
        const erro = await lerFim(join(lotes, `erro-${id}.log`), MAX_BYTES_POR_ARQUIVO);
        if (erro && erro.texto.trim()) incluir(`lotes/erro-${id}.log`, erro.texto);
      }
    }

    incluir(
      'LEIA-ME.txt',
      quebra([
        msg.suporte.leiaMeTitulo,
        '',
        `Gerado em ${agora.toLocaleString('pt-BR')} pelo Soulcrate.`,
        '',
        ...msg.suporte.leiaMeCorpo,
        ...(avisos.length ? ['', 'Não entrou:', ...avisos.map((a) => `  - ${a}`)] : []),
        '',
        'Arquivos:',
        ...entradas.map((e) => `  ${e.nome}`).sort(),
      ]),
    );
    return entradas;
  }

  /** Monta o pacote e grava o .zip em `destino`. */
  async gerar(
    destino: string,
    gravar: (caminho: string, dados: Buffer) => Promise<void>,
  ): Promise<ResultadoPacoteSuporte> {
    try {
      const entradas = await this.montar();
      const zip = criarZip(entradas, this.d.agora());
      await gravar(destino, zip);
      return { ok: true, caminho: destino, arquivos: entradas.map((e) => e.nome).sort(), bytes: zip.length };
    } catch (e) {
      this.d.aoErro(e);
      const detalhes =
        e instanceof Error ? `${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}`.trim() : String(e);
      return {
        ok: false,
        cancelado: false,
        erro: criarErro('suporte.nao-gerou', { detalhes: redigirSegredos(detalhes) }),
      };
    }
  }
}
