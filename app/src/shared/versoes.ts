// O card Versão da faixa (docs/adr/0006): quais versões o lote aceita nas linhas sem mix e em que ordem de
// preferência. A ordem é uma lista de posições; cada posição tem uma ou mais versões ("Original Mix" e "sem versão no
// nome" podem dividir uma posição). O que não está na ordem fica em "Não baixar". O texto que vai para o script
// (`-Versoes extended,original+semnome,club`) é a mesma ordem escrita: vírgula separa posições, `+` junta versões.
// Tudo puro: o card, o resumo e o main usam as mesmas regras.

export const VERSOES = ['extended', 'original', 'club', 'vip', 'semnome', 'radioedit'] as const;
export type VersaoId = (typeof VERSOES)[number];

/** Posições em ordem de preferência; cada uma com as versões que empatam. */
export type OrdemVersoes = readonly (readonly VersaoId[])[];

export const VERSOES_PADRAO = 'extended,original,club,vip,semnome';

export const ehVersao = (v: string): v is VersaoId => (VERSOES as readonly string[]).includes(v);

/** `extended,club,original+semnome` → `[['extended'], ['club'], ['original', 'semnome']]`. Inválido: erro. */
export function lerVersoes(texto: string): VersaoId[][] {
  const vistas = new Set<string>();
  const ordem: VersaoId[][] = [];
  for (const grupo of texto.split(',')) {
    const nomes = grupo
      .split('+')
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean);
    if (nomes.length === 0) continue;
    const posicao: VersaoId[] = [];
    for (const n of nomes) {
      if (!ehVersao(n)) throw new Error(`Versão desconhecida: ${n}.`);
      if (vistas.has(n)) throw new Error(`Versão repetida: ${n}.`);
      vistas.add(n);
      posicao.push(n);
    }
    ordem.push(posicao);
  }
  if (ordem.length === 0) throw new Error('Aceite pelo menos uma versão.');
  return ordem;
}

export function versoesValidas(texto: string): boolean {
  try {
    lerVersoes(texto);
    return true;
  } catch {
    return false;
  }
}

export function escreverVersoes(ordem: OrdemVersoes): string {
  return ordem
    .filter((p) => p.length > 0)
    .map((p) => p.join('+'))
    .join(',');
}

/** As versões em "Não baixar", na ordem do card. */
export function versoesRecusadas(ordem: OrdemVersoes): VersaoId[] {
  const aceitas = new Set(ordem.flat());
  return VERSOES.filter((v) => !aceitas.has(v));
}

const copiar = (ordem: OrdemVersoes): VersaoId[][] => ordem.map((p) => [...p]);
const semVazias = (ordem: VersaoId[][]): VersaoId[][] => ordem.filter((p) => p.length > 0);
const posicaoDe = (ordem: OrdemVersoes, v: VersaoId): number => ordem.findIndex((p) => p.includes(v));

/**
 * Sobe uma posição. Se divide a posição com outras, sai dela e fica sozinha logo acima; se está sozinha, troca de
 * lugar com a posição de cima.
 */
export function subirVersao(ordem: OrdemVersoes, v: VersaoId): VersaoId[][] {
  const o = copiar(ordem);
  const i = posicaoDe(o, v);
  if (i < 0) return o;
  const p = o[i] ?? [];
  if (p.length > 1) {
    o[i] = p.filter((x) => x !== v);
    o.splice(i, 0, [v]);
    return o;
  }
  if (i === 0) return o;
  [o[i - 1], o[i]] = [p, o[i - 1] ?? []];
  return o;
}

/** Desce uma posição: o espelho de `subirVersao`. */
export function descerVersao(ordem: OrdemVersoes, v: VersaoId): VersaoId[][] {
  const o = copiar(ordem);
  const i = posicaoDe(o, v);
  if (i < 0) return o;
  const p = o[i] ?? [];
  if (p.length > 1) {
    o[i] = p.filter((x) => x !== v);
    o.splice(i + 1, 0, [v]);
    return o;
  }
  if (i === o.length - 1) return o;
  [o[i], o[i + 1]] = [o[i + 1] ?? [], p];
  return o;
}

/** A versão divide a posição com a de cima na lista? (não é a primeira da sua posição) */
export function empatadaComAcima(ordem: OrdemVersoes, v: VersaoId): boolean {
  const p = ordem[posicaoDe(ordem, v)];
  return p !== undefined && p.indexOf(v) > 0;
}

/**
 * "Mesma posição da de cima": junta com a posição de cima, ou, se já divide a posição com a de cima, separa e fica
 * logo abaixo dela.
 */
export function alternarEmpate(ordem: OrdemVersoes, v: VersaoId): VersaoId[][] {
  const o = copiar(ordem);
  const i = posicaoDe(o, v);
  if (i < 0) return o;
  const p = o[i] ?? [];
  if (p.indexOf(v) > 0) {
    o[i] = p.filter((x) => x !== v);
    o.splice(i + 1, 0, [v]);
    return o;
  }
  if (i === 0) return o;
  o[i - 1] = [...(o[i - 1] ?? []), v];
  o[i] = p.filter((x) => x !== v);
  return semVazias(o);
}

/** Leva para "Não baixar". A última versão aceita não sai: o lote precisa aceitar alguma. */
export function recusarVersao(ordem: OrdemVersoes, v: VersaoId): VersaoId[][] {
  if (ordem.flat().length <= 1) return copiar(ordem);
  return semVazias(copiar(ordem).map((p) => p.filter((x) => x !== v)));
}

/** Traz de "Não baixar" para o fim da ordem. */
export function aceitarVersao(ordem: OrdemVersoes, v: VersaoId): VersaoId[][] {
  if (posicaoDe(ordem, v) >= 0) return copiar(ordem);
  return [...copiar(ordem), [v]];
}

/** Arrastar e soltar: sozinha, logo antes da posição de `antesDe` (ou no fim, sem ela). */
export function moverVersao(ordem: OrdemVersoes, v: VersaoId, antesDe: VersaoId | null): VersaoId[][] {
  if (v === antesDe) return copiar(ordem);
  const sem = semVazias(copiar(ordem).map((p) => p.filter((x) => x !== v)));
  const i = antesDe ? posicaoDe(sem, antesDe) : -1;
  if (i < 0) return [...sem, [v]];
  sem.splice(i, 0, [v]);
  return sem;
}

/** Junta versões ao fim da ordem (as que a retentativa sugere aceitar), sem repetir. */
export function adicionarVersoes(texto: string, novas: readonly VersaoId[]): string {
  let ordem: VersaoId[][] = lerVersoes(texto);
  for (const v of novas) ordem = aceitarVersao(ordem, v);
  return escreverVersoes(ordem);
}

// ---------------------------------------------------------------- Atalhos e duração mínima

/** Atalhos de um clique do card (os nomes estão em `msg.lote.versoes.atalhos`). */
export const ATALHOS_VERSAO = [
  { id: 'pista', versoes: VERSOES_PADRAO },
  { id: 'tantoFaz', versoes: 'extended,original,club,vip,semnome,radioedit' },
  { id: 'soExtended', versoes: 'extended' },
] as const;
export type AtalhoVersaoId = (typeof ATALHOS_VERSAO)[number]['id'];

/** As opções do seletor de duração mínima, em segundos (0 desliga). O script aceita de 0 a 3600. */
export const DURACOES_MINIMAS = [0, 180, 240, 300, 360] as const;
export const DURACAO_MINIMA_MAX = 3600;

/** A versão pelo nome que o script escreve no motivo (`versao nao aceita ('radio edit')`). */
export const NOME_NO_SCRIPT: Record<VersaoId, string> = {
  extended: 'extended mix',
  original: 'original mix',
  club: 'club mix',
  vip: 'vip mix',
  semnome: 'sem versao no nome',
  radioedit: 'radio edit',
};

export function versaoPeloNomeNoScript(nome: string): VersaoId | null {
  const achou = VERSOES.find((v) => NOME_NO_SCRIPT[v] === nome.trim().toLowerCase());
  return achou ?? null;
}

/** `418` → `6:58` */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
