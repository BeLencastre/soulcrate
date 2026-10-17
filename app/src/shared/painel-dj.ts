// Regras do Modo DJ para o Início e para Serviços (protótipos "DJ · Início", "DJ · Início, outros estados" e
// "DJ · Serviços"): no lugar das cinco etapas, uma situação com o único botão que resolve; no lugar das verificações,
// um cartão por coisa que a pessoa usa. Funções puras, como `derivarEtapas` em stack.ts.
import type { HealthCheckResult } from './ipc.js';
import type { ServicoId } from './servicos.js';
import { resumirStack, servicoDe, type StackStatus } from './stack.js';

// ---------------------------------------------------------------- Início: a situação do cabeçalho

/** Os quatro passos de "Ligando…", na ordem em que acontecem. */
export type PassoDeLigar = 'docker' | 'preparando' | 'subindo' | 'respondendo';
export const PASSOS_DE_LIGAR: readonly PassoDeLigar[] = ['docker', 'preparando', 'subindo', 'respondendo'];

export type SituacaoDj =
  | { tipo: 'verificando' }
  | { tipo: 'ligado' }
  | { tipo: 'desligado' }
  | { tipo: 'ligando'; passo: PassoDeLigar }
  | { tipo: 'desligando' }
  | { tipo: 'docker-fechado' }
  | { tipo: 'docker-ausente' }
  | { tipo: 'sem-projeto' }
  | { tipo: 'config-incompleta'; faltaSenha: boolean }
  | { tipo: 'com-problema'; servicos: ServicoId[] };

/** `docker compose up` já está criando ou iniciando os contêineres (depois do build da imagem). */
const SUBINDO = /\bContainer\b.*\b(Creat|Start|Running|Recreat)/i;

/**
 * O que o cabeçalho do Início diz no Modo DJ. `linhasDaOperacao`: a saída do `compose up` em andamento, que separa
 * "preparando" (build da imagem) de "subindo" (contêineres sendo criados).
 */
export function situacaoDj(status: StackStatus, linhasDaOperacao: readonly string[] = []): SituacaoDj {
  const r = resumirStack(status);
  switch (r.motivo) {
    case 'verificando':
      return { tipo: 'verificando' };
    case 'operacao':
      if (r.operacao === 'desligando') return { tipo: 'desligando' };
      return { tipo: 'ligando', passo: linhasDaOperacao.some((l) => SUBINDO.test(l)) ? 'subindo' : 'preparando' };
    case 'docker-abrindo':
      return { tipo: 'ligando', passo: 'docker' };
    case 'iniciando':
      return { tipo: 'ligando', passo: 'respondendo' };
    case 'docker-ausente':
      return { tipo: 'docker-ausente' };
    case 'docker-fechado':
      return { tipo: 'docker-fechado' };
    case 'sem-projeto':
      return { tipo: 'sem-projeto' };
    case 'desligada': {
      // com a configuração inválida o Soulcrate nem liga: o botão certo é completar, não "Ligar"
      const c = status.configuracao;
      if (c.estado !== 'invalida') return { tipo: 'desligado' };
      const faltaSenha = c.achados.some((a) => a.nivel === 'erro' && a.variavel === 'SLSK_PASSWORD');
      return { tipo: 'config-incompleta', faltaSenha };
    }
    case 'no-ar':
      return { tipo: 'ligado' };
    case 'servico-parou':
    case 'servico-nao-responde':
      return { tipo: 'com-problema', servicos: r.servicos };
  }
}

/** "Passo 3 de 4": a posição do passo (1 a 4). */
export function numeroDoPasso(passo: PassoDeLigar): number {
  return PASSOS_DE_LIGAR.indexOf(passo) + 1;
}

// ---------------------------------------------------------------- Serviços: um cartão por coisa que a pessoa usa

export type CartaoServicoId = ServicoId | 'compartilhamento' | 'pastas';

/** Na ordem dos protótipos: o que costuma dar problema primeiro, o que é consequência por último. */
export const CARTOES_DE_SERVICO: readonly CartaoServicoId[] = [
  'soulbeet',
  'slskd',
  'navidrome',
  'compartilhamento',
  'pastas',
];

/**
 * `ok`: funcionando. `lento`: de pé, mas a interface não respondeu agora. `ligando`: ainda subindo. `parado`: o
 * contêiner não está rodando. `problema`: o healthcheck falhou, ou as pastas não batem. `incompleto`: a organização
 * subiu sem tom/BPM (imagem incompleta). `zero`: nada compartilhado. `desconhecido`: não deu para saber agora.
 */
export type EstadoCartaoDj =
  'ok' | 'lento' | 'ligando' | 'parado' | 'problema' | 'incompleto' | 'zero' | 'desconhecido';

export interface CartaoServicoDj {
  id: CartaoServicoId;
  estado: EstadoCartaoDj;
}

const PRECISA_ATENCAO: ReadonlySet<EstadoCartaoDj> = new Set(['lento', 'parado', 'problema', 'incompleto', 'zero']);

export const precisaAtencao = (c: CartaoServicoDj): boolean => PRECISA_ATENCAO.has(c.estado);

function estadoDoServico(status: StackStatus, id: ServicoId, checks: readonly HealthCheckResult[]): EstadoCartaoDj {
  const s = servicoDe(status, id);
  if (s.container !== 'running') return 'parado';
  if (s.saude === 'starting') return 'ligando';
  if (s.saude === 'unhealthy') return 'problema';
  if (s.http === false) return 'lento';
  // o organizador sem keyfinder, beets ou plugins não calcula tom e BPM: está de pé, mas incompleto
  if (id === 'soulbeet' && checks.find((c) => c.id === 'plugins')?.estado === 'erro') return 'incompleto';
  return 'ok';
}

/**
 * Os cinco cartões. `checks`: as verificações da tela Serviços (vazio enquanto não chegaram); `compartilhados`: o
 * número de arquivos que o slskd anuncia (null quando não deu para ler, undefined enquanto não chegou).
 */
export function cartoesDeServicoDj(
  status: StackStatus,
  checks: readonly HealthCheckResult[],
  compartilhados: number | null | undefined,
): CartaoServicoDj[] {
  return CARTOES_DE_SERVICO.map((id): CartaoServicoDj => {
    switch (id) {
      case 'slskd':
      case 'soulbeet':
      case 'navidrome':
        return { id, estado: estadoDoServico(status, id, checks) };
      case 'compartilhamento': {
        if (estadoDoServico(status, 'slskd', checks) !== 'ok') return { id, estado: 'desconhecido' };
        if (compartilhados === 0) return { id, estado: 'zero' };
        return { id, estado: typeof compartilhados === 'number' ? 'ok' : 'desconhecido' };
      }
      case 'pastas': {
        const pastas = checks.find((c) => c.id === 'pastas');
        if (!pastas) return { id, estado: 'desconhecido' };
        return { id, estado: pastas.estado === 'ok' ? 'ok' : 'problema' };
      }
    }
  });
}
