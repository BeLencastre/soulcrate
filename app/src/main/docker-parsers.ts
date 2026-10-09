// Interpretação das saídas do Docker (funções puras, testadas com saídas gravadas): `docker compose ps`,
// `docker desktop status`, linhas de log e mensagens de erro do `compose up`.
import type { ErroCodigo } from '@shared/erros';
import type { LinhaLog, MarcadorBuild, NivelLog } from '@shared/ipc';
import { ehServicoId, SERVICOS, type ServicoId } from '@shared/servicos';
import {
  servicoAusente,
  type ContainerEstado,
  type DockerDesktopEstado,
  type Saude,
  type ServicoStatus,
} from '@shared/stack';

export interface ContainerPs {
  servico: string;
  nome: string;
  estado: string;
  saude: string;
  status: string;
  /** a imagem do contêiner (`slskd/slskd:0.26.0`), quando o Compose a informa */
  imagem?: string;
}

/**
 * `docker compose ps --format json`: um objeto por linha (Compose 2.21+) ou um array (versões antigas).
 * Linhas que não são JSON (avisos do Compose) são ignoradas.
 */
export function parseComposePs(texto: string): ContainerPs[] {
  const itens: unknown[] = [];
  const limpo = texto.trim();
  if (!limpo) return [];
  if (limpo.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(limpo);
      if (Array.isArray(arr)) itens.push(...arr);
    } catch {
      return [];
    }
  } else {
    for (const linha of limpo.split(/\r?\n/)) {
      const l = linha.trim();
      if (!l.startsWith('{')) continue;
      try {
        itens.push(JSON.parse(l));
      } catch {
        // linha quebrada: ignora
      }
    }
  }
  const saida: ContainerPs[] = [];
  for (const i of itens) {
    if (typeof i !== 'object' || i === null) continue;
    const o = i as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
    const imagem = s('Image');
    saida.push({
      servico: s('Service'),
      nome: s('Name'),
      estado: s('State'),
      saude: s('Health'),
      status: s('Status'),
      ...(imagem ? { imagem } : {}),
    });
  }
  return saida;
}

const ESTADOS: readonly ContainerEstado[] = [
  'running',
  'exited',
  'restarting',
  'paused',
  'created',
  'dead',
  'removing',
];

export function estadoDoContainer(estado: string): ContainerEstado {
  const e = estado.toLowerCase();
  return (ESTADOS as readonly string[]).includes(e) ? (e as ContainerEstado) : 'ausente';
}

export function saudeDoContainer(saude: string): Saude {
  const s = saude.toLowerCase();
  if (s === 'healthy' || s === 'unhealthy' || s === 'starting') return s;
  return 'nenhuma';
}

/** Um `ServicoStatus` por serviço da stack, na ordem de SERVICOS; o que não aparece no `ps` é "ausente". */
export function servicosDoPs(ps: readonly ContainerPs[]): ServicoStatus[] {
  return SERVICOS.map((info) => {
    const c = ps.find((p) => p.servico === info.id);
    if (!c) return servicoAusente(info.id);
    return {
      id: info.id,
      container: estadoDoContainer(c.estado),
      saude: saudeDoContainer(c.saude),
      http: null,
      statusTexto: c.status || null,
    };
  });
}

/**
 * Saída de `docker desktop status --format json` ({"Status":"running"}). Texto que não é JSON (o subcomando não
 * existe, ou a CLI reclamou) é "desconhecido": quem decide é a engine ([SP1](docs/spikes/sp1-deteccao-docker.md)).
 */
export function parseDesktopStatus(texto: string): DockerDesktopEstado {
  try {
    const o: unknown = JSON.parse(texto.trim());
    if (typeof o === 'object' && o !== null && 'Status' in o) {
      const s = String((o as { Status: unknown }).Status).toLowerCase();
      return s === 'running' ? 'aberto' : 'fechado';
    }
  } catch {
    // não é JSON
  }
  return 'desconhecido';
}

// ---------------------------------------------------------------- logs

const RE_PREFIXO = /^([A-Za-z0-9_.-]+)\s*\|\s?(.*)$/;
const RE_CARIMBO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/;

export function nivelDaLinha(texto: string): NivelLog {
  if (/\[(?:ERR|ERROR|FTL|FATAL|CRT|CRIT)\]|\b(?:error|fatal|exception|traceback)\b/i.test(texto)) return 'erro';
  if (/\[(?:WRN|WARN|WARNING)\]|\bwarn(?:ing)?\b/i.test(texto)) return 'aviso';
  return 'info';
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** HH:mm:ss no horário local. */
export function horaLocal(d: Date): string {
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`;
}

/** Uma linha de `docker compose logs --timestamps --no-color`: `slskd  | 2026-10-07T22:31:15.12Z [INF] ...`. */
export function parseLinhaLog(linha: string): LinhaLog {
  let servico: ServicoId | null = null;
  let resto = linha;
  const p = RE_PREFIXO.exec(linha);
  if (p) {
    const nome = p[1] ?? '';
    if (ehServicoId(nome)) servico = nome;
    resto = p[2] ?? '';
  }
  let hora: string | null = null;
  const c = RE_CARIMBO.exec(resto);
  if (c) {
    const d = new Date(c[1] ?? '');
    if (!Number.isNaN(d.getTime())) hora = horaLocal(d);
    resto = c[2] ?? '';
  }
  return { servico, hora, texto: resto, nivel: nivelDaLinha(resto) };
}

/** As linhas do build do Soulbeet que o app destaca (`plugins ok`, `lastgenre ok`). */
export function detectarMarcador(linha: string): MarcadorBuild | null {
  if (linha.includes('plugins ok')) return 'plugins ok';
  if (linha.includes('lastgenre ok')) return 'lastgenre ok';
  return null;
}

// ---------------------------------------------------------------- erros do compose

export interface FalhaClassificada {
  codigo: ErroCodigo;
  porta?: string;
}

/** Dá nome ao erro do `docker compose` a partir do texto que ele escreveu. */
export function classificarFalhaCompose(texto: string): FalhaClassificada {
  if (
    /cannot connect to the docker daemon|error during connect|dockerDesktopLinuxEngine|is the docker daemon running|failed to connect to the docker api/i.test(
      texto,
    )
  ) {
    return { codigo: 'docker.fechado' };
  }
  if (
    /already allocated|only one usage of each socket address|address already in use|ports are not available/i.test(
      texto,
    )
  ) {
    const m = /(?:bind for|exposing port tcp)\s+(?:\[[^\]]*\]|[\d.*]+)?:(\d{2,5})\b/i.exec(texto);
    if (m?.[1]) return { codigo: 'porta.em-uso', porta: m[1] };
  }
  return { codigo: 'operacao.falhou' };
}
