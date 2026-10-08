// Edição do .env e do slskd/slskd.yml (Fase 2): funções puras de texto, sem tocar no disco.
// O .env é editado linha a linha, para preservar comentários, ordem, fim de linha e o que o usuário acrescentou.
// O slskd.yml passa pelo `Document` do pacote `yaml`, que preserva comentários e o resto do arquivo.
import { randomBytes } from 'node:crypto';
import { isMap, parseDocument, Scalar, type Document } from 'yaml';
import { semBom } from '@shared/texto';

// ---------------------------------------------------------------- Chaves

/** 32 bytes aleatórios do sistema, em hexadecimal (64 caracteres): o `openssl rand -hex 32` do README. */
export function gerarChave(bytes: (n: number) => Buffer = randomBytes): string {
  return bytes(32).toString('hex');
}

// ---------------------------------------------------------------- .env

export class ValorInvalidoError extends Error {}

/** Seguro sem aspas: sem `"`, `#`, `$`, crase nem barra invertida, e sem espaço ou aspa simples nas pontas. */
const SEM_ASPAS = /^[^\s'"#$`\\](?:[^"#$`\\]*[^\s'"#$`\\])?$|^$/;

/**
 * Escreve um valor no formato do .env: puro quando é seguro (letras, números, `/`, `:`, `.`, `-`, espaços e aspa
 * simples no meio…); entre aspas simples (literal, sem expandir `$`) quando tem `#`, `$`, aspas duplas, crase, barra
 * invertida ou espaço nas pontas. Quebra de linha não cabe num .env, e aspa simples junto com esses símbolos não tem
 * como ser escrita sem escape (que o `baixar-lista.ps1` e o validador não desfazem): os dois casos são recusados.
 */
export function formatarValorEnv(valor: string): string {
  if (/[\r\n\0]/.test(valor)) throw new ValorInvalidoError('O valor não pode ter quebra de linha.');
  if (SEM_ASPAS.test(valor)) return valor;
  if (valor.includes("'")) {
    throw new ValorInvalidoError(
      "O valor mistura aspa simples (') com outros símbolos que o .env não consegue guardar.",
    );
  }
  return `'${valor}'`;
}

const fimDeLinha = (texto: string): string => (texto.includes('\r\n') ? '\r\n' : '\n');
const reAtiva = (chave: string) => new RegExp(`^\\s*${chave}\\s*=`);
const reComentada = (chave: string) => new RegExp(`^\\s*#\\s*${chave}\\s*=`);

export interface OpcoesVariavel {
  /** valor de exemplo na linha comentada quando `valor` é null (`# BIND_ADDR=0.0.0.0`) */
  exemploComentado?: string;
}

/**
 * Define `CHAVE=valor`. Se a variável já está ativa, troca a linha (e tira as repetições anteriores, porque a última
 * vale); senão, ocupa o lugar da linha comentada `# CHAVE=…` do modelo; senão, vai para o fim. Com `valor` null a
 * linha ativa volta a ser um comentário.
 */
export function definirVariavelEnv(
  texto: string,
  chave: string,
  valor: string | null,
  opcoes: OpcoesVariavel = {},
): string {
  const eol = fimDeLinha(texto);
  const linhas = texto.split(/\r?\n/);
  const temFinal = linhas.length > 0 && linhas[linhas.length - 1] === '';
  if (temFinal) linhas.pop();

  const ativas = linhas.flatMap((l, i) => (reAtiva(chave).test(l) ? [i] : []));
  const nova = valor === null ? `# ${chave}=${opcoes.exemploComentado ?? ''}` : `${chave}=${formatarValorEnv(valor)}`;

  if (ativas.length > 0) {
    const ultima = ativas[ativas.length - 1] as number;
    linhas[ultima] = nova;
    for (const i of ativas.slice(0, -1).reverse()) linhas.splice(i, 1);
  } else if (valor !== null) {
    const comentada = linhas.findIndex((l) => reComentada(chave).test(l));
    if (comentada >= 0) linhas[comentada] = nova;
    else linhas.push(nova);
  }
  return linhas.join(eol) + (temFinal || texto.length === 0 ? eol : '');
}

export type ValoresEnv = Record<string, string | null>;

/** Aplica vários valores de uma vez; `null` comenta a variável. */
export function atualizarEnv(
  texto: string,
  valores: ValoresEnv,
  exemplosComentados: Record<string, string> = {},
): string {
  let t = semBom(texto);
  for (const [chave, valor] of Object.entries(valores)) {
    const exemploComentado = exemplosComentados[chave];
    t = definirVariavelEnv(t, chave, valor, exemploComentado === undefined ? {} : { exemploComentado });
  }
  return t;
}

// ---------------------------------------------------------------- slskd.yml

export class YmlInvalidoError extends Error {}

const CAMINHO_CHAVE = ['web', 'authentication', 'api_keys', 'soulbeet', 'key'] as const;
const CAMINHO_ENTRADA = ['web', 'authentication', 'api_keys', 'soulbeet'] as const;

function lerDocumento(texto: string): Document {
  const doc = parseDocument(semBom(texto));
  const erro = doc.errors[0];
  if (erro) throw new YmlInvalidoError(erro.message);
  return doc;
}

/**
 * Grava a API key em `web.authentication.api_keys.soulbeet.key`, sem mexer no resto do arquivo. A chave vai entre
 * aspas duplas: uma chave só de dígitos (ou do tipo `1e5…`) viraria número no YAML.
 */
export function definirChaveSlskd(texto: string, chave: string): string {
  const eol = fimDeLinha(texto);
  const doc = lerDocumento(texto);
  // arquivo vazio (ou só comentários): parte do modelo, que já tem a estrutura toda
  if (doc.contents === null || doc.contents === undefined) {
    return definirChaveSlskd(`${semBom(texto)}${fimDeLinha(texto)}${YML_MODELO_RESERVA}`, chave);
  }
  if (!isMap(doc.contents)) throw new YmlInvalidoError('A raiz do slskd.yml precisa ser um mapa.');

  const valor = new Scalar(chave);
  valor.type = 'QUOTE_DOUBLE';
  if (!doc.hasIn(CAMINHO_ENTRADA)) {
    // entrada nova: o Soulbeet precisa enfileirar downloads (ReadWrite) e só fala com redes privadas
    doc.setIn(CAMINHO_ENTRADA, doc.createNode({}));
    doc.setIn([...CAMINHO_ENTRADA, 'role'], 'ReadWrite');
    doc.setIn([...CAMINHO_ENTRADA, 'cidr'], '172.16.0.0/12,10.0.0.0/8,192.168.0.0/16');
  }
  try {
    doc.setIn(CAMINHO_CHAVE, valor);
  } catch (e) {
    throw new YmlInvalidoError(e instanceof Error ? e.message : String(e));
  }

  const saida = doc.toString({ lineWidth: 0 });
  return eol === '\r\n' ? saida.replace(/\r?\n/g, '\r\n') : saida;
}

// ---------------------------------------------------------------- Modelos de reserva

/** Usado só quando a pasta não traz o `.env.example` (não deveria acontecer numa instalação normal). */
export const ENV_MODELO_RESERVA = [
  'PUID=1000',
  'PGID=1000',
  'TZ=America/Sao_Paulo',
  'DOWNLOADS_DIR=./downloads',
  'INCOMPLETE_DIR=./incomplete',
  'MUSIC_DIR=./music',
  'SLSK_USERNAME=',
  'SLSK_PASSWORD=',
  'SLSKD_WEB_USER=admin',
  'SLSKD_WEB_PASSWORD=',
  'SOULBEET_SECRET_KEY=',
  'SLSKD_API_KEY_SOULBEET=',
  '# BIND_ADDR=0.0.0.0',
  '# MUSICBRAINZ_CONTATO=seu@email',
  '',
].join('\n');

export const YML_MODELO_RESERVA = [
  'web:',
  '  authentication:',
  '    api_keys:',
  '      soulbeet:',
  '        key: TROQUE_POR_UMA_CHAVE_ALEATORIA',
  '        role: ReadWrite',
  '        cidr: 172.16.0.0/12,10.0.0.0/8,192.168.0.0/16',
  '',
].join('\n');

// ---------------------------------------------------------------- Backup

const dois = (n: number) => String(n).padStart(2, '0');

/** `2026-10-07`, no horário local. */
export function dataParaBackup(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** `.env.bak-2026-10-07`, `.env.bak-2026-10-07-2`… o primeiro nome que ainda não existe: um backup nunca é sobrescrito. */
export function nomeDoBackup(base: string, data: Date, existe: (nome: string) => boolean): string {
  const prefixo = `${base}.bak-${dataParaBackup(data)}`;
  if (!existe(prefixo)) return prefixo;
  for (let n = 2; ; n++) {
    const nome = `${prefixo}-${n}`;
    if (!existe(nome)) return nome;
  }
}
