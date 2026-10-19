// Modo DJ e Modo Dev (protótipos "modos-dev-dj"): qual modo vale agora, o que o assistente propõe e quais seções de
// Configurações existem em cada um. Regras puras: a preferência fica no main (AppSettings), a tela só lê.
import type { AppSettings, ModoInterface } from './ipc.js';

/** Sem escolha registrada, o app age como Modo Dev: quem já usava o app antes dos modos não vê nada mudar. */
export const MODO_SEM_ESCOLHA: ModoInterface = 'dev';

/** O que o assistente deixa marcado numa instalação nova. */
export const MODO_RECOMENDADO: ModoInterface = 'dj';

export function modoEfetivo(settings: Pick<AppSettings, 'modo'> | null | undefined): ModoInterface {
  return settings?.modo ?? MODO_SEM_ESCOLHA;
}

export function outroModo(modo: ModoInterface): ModoInterface {
  return modo === 'dj' ? 'dev' : 'dj';
}

/** A opção marcada na tela final do assistente: a escolha anterior, ou o recomendado se a pessoa nunca escolheu. */
export function modoProposto(settings: Pick<AppSettings, 'modo'> | null | undefined): ModoInterface {
  return settings?.modo ?? MODO_RECOMENDADO;
}

// ---------------------------------------------------------------- Seções de Configurações

export type SecaoConfig =
  'conferencia' | 'pastas' | 'soulseek' | 'compartilhamento' | 'webui' | 'rede' | 'avancado' | 'app' | 'sobre';

/** As seções de cada modo, nos dois grupos da navegação. O Modo DJ deixa de fora o que é da configuração da stack. */
export const SECOES_DO_MODO: Record<ModoInterface, { stack: readonly SecaoConfig[]; app: readonly SecaoConfig[] }> = {
  dev: { stack: ['conferencia', 'pastas', 'soulseek', 'webui', 'rede', 'avancado'], app: ['app', 'sobre'] },
  dj: { stack: ['pastas', 'soulseek', 'compartilhamento'], app: ['app', 'sobre'] },
};

/** A seção que faz o mesmo papel no outro modo (Compartilhamento e Rede tratam de quem baixa de você). */
const EQUIVALENTE: Partial<Record<SecaoConfig, SecaoConfig>> = { rede: 'compartilhamento', compartilhamento: 'rede' };

const TODAS_AS_SECOES: readonly string[] = [
  ...new Set([...SECOES_DO_MODO.dev.stack, ...SECOES_DO_MODO.dj.stack, ...SECOES_DO_MODO.dev.app]),
];

export function ehSecaoConfig(valor: unknown): valor is SecaoConfig {
  return typeof valor === 'string' && TODAS_AS_SECOES.includes(valor);
}

export function secaoExisteNoModo(secao: SecaoConfig, modo: ModoInterface): boolean {
  const g = SECOES_DO_MODO[modo];
  return g.stack.includes(secao) || g.app.includes(secao);
}

/**
 * A seção a abrir quando o endereço pede uma que o modo não tem (trocou de modo com ela aberta, ou um atalho antigo):
 * a equivalente, se houver; senão `null`, e a tela volta para a seção inicial (a "tela-mãe").
 */
export function secaoNoModo(secao: SecaoConfig, modo: ModoInterface): SecaoConfig | null {
  if (secaoExisteNoModo(secao, modo)) return secao;
  const eq = EQUIVALENTE[secao];
  return eq && secaoExisteNoModo(eq, modo) ? eq : null;
}
