// Regras de segurança do app (§6.1), em funções puras: quais endereços o app pode abrir e como o log esconde segredos.
import { servicoPorId, SERVICOS, type ServicoId } from '@shared/servicos';

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const PORTAS_LOCAIS = new Set(SERVICOS.map((s) => s.porta));

function tentarUrl(valor: string): URL | null {
  try {
    return new URL(valor);
  } catch {
    return null;
  }
}

/** Uma das Web UIs da stack: http no próprio PC, em uma das portas conhecidas (4533, 5030, 9765). */
export function ehUrlLocalConhecida(valor: string): boolean {
  const u = tentarUrl(valor);
  if (!u || u.protocol !== 'http:' || u.username || u.password) return false;
  return HOSTS_LOCAIS.has(u.hostname) && PORTAS_LOCAIS.has(Number(u.port));
}

/** Links externos: só `https:` (a documentação do Docker, por exemplo). */
export function ehUrlHttps(valor: string): boolean {
  const u = tentarUrl(valor);
  return !!u && u.protocol === 'https:' && !u.username && !u.password;
}

/** O que `shell.openExternal` aceita: https ou uma Web UI local. Todo o resto é recusado. */
export function podeAbrirNoNavegador(valor: string): boolean {
  return ehUrlHttps(valor) || ehUrlLocalConhecida(valor);
}

/**
 * A janela principal só pode estar em páginas do próprio app: o arquivo do build (`file:`) ou, em
 * desenvolvimento, o servidor do Vite. Qualquer outra navegação é bloqueada.
 */
export function ehUrlDoApp(valor: string, urlDev: string | null): boolean {
  const u = tentarUrl(valor);
  if (!u) return false;
  if (urlDev) {
    const d = tentarUrl(urlDev);
    return !!d && u.origin === d.origin;
  }
  return u.protocol === 'file:';
}

/** Partição de sessão de cada Web UI: persistente (o login sobrevive ao app) e separada por serviço (SP7). */
export function particaoDo(servico: ServicoId): string {
  return `persist:soulcrate-webui-${servico}`;
}

/** Só a origem do próprio serviço pode ser navegada dentro da view da Web UI. */
export function mesmaOrigemDoServico(servico: ServicoId, url: string): boolean {
  return ehUrlLocalConhecida(url) && new URL(url).port === String(servicoPorId(servico).porta);
}

// ---------------------------------------------------------------- segredos nos logs

const VARIAVEIS_SECRETAS = ['SLSK_PASSWORD', 'SLSKD_WEB_PASSWORD', 'SOULBEET_SECRET_KEY', 'SLSKD_API_KEY_SOULBEET'];
const MASCARA = '***';

const RE_VARIAVEL = new RegExp(`\\b(${VARIAVEIS_SECRETAS.join('|')})(\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s,;]+)`, 'gi');
const RE_CABECALHO_API = /(x-api-key["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const RE_AUTORIZACAO = /(authorization["']?\s*[:=]\s*)(bearer\s+)?("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const RE_JSON_SEGREDO = /("(?:[\w.-]*(?:password|passwd|secret|api[_-]?key|token)[\w.-]*)"\s*:\s*)"[^"]*"/gi;

/**
 * Remove de um texto os valores de `SLSK_PASSWORD`, `SLSKD_WEB_PASSWORD`, `SOULBEET_SECRET_KEY`,
 * `SLSKD_API_KEY_SOULBEET`, de cabeçalhos `X-API-Key` e `Authorization`, e de campos JSON com cara de segredo.
 * Passa por todo log do app e por tudo que vai para o pacote de suporte.
 */
export function redigirSegredos(texto: string): string {
  return texto
    .replace(RE_VARIAVEL, `$1$2${MASCARA}`)
    .replace(RE_CABECALHO_API, `$1${MASCARA}`)
    .replace(RE_AUTORIZACAO, (_m, pre: string, esquema: string | undefined) => `${pre}${esquema ?? ''}${MASCARA}`)
    .replace(RE_JSON_SEGREDO, `$1"${MASCARA}"`);
}
