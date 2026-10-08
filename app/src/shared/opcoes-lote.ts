// Opções do baixar-lista.ps1 que o app expõe (README, "Opções"): padrões iguais aos do script, receitas, e a
// montagem dos argumentos. Só aceita as opções conhecidas: nada do renderer vira argumento sem passar por aqui.

export const OPCOES_BOOLEANAS = [
  'AceitarWav',
  'AceitarMp3Menor',
  'TituloAproximado',
  'NaoTolerarGrafia',
  'SemCatalogo',
  'PularForaDoCatalogo',
  'Retentar',
  'NaoPularExistentes',
  'SemBeets',
  'SemBuscaArtista',
] as const;

export const OPCOES_NUMERICAS = [
  'Paralelo',
  'Buscas',
  'BuscasPorJanela',
  'PausaBloqueioMin',
  'Tentativas',
  'FilaMaxMin',
  'FilaUltimoMin',
  'DownloadMaxMin',
  'LoteBeets',
] as const;

export type OpcaoBooleanaId = (typeof OPCOES_BOOLEANAS)[number];
export type OpcaoNumericaId = (typeof OPCOES_NUMERICAS)[number];
export type OpcaoId = OpcaoBooleanaId | OpcaoNumericaId;

export type OpcoesLote = Record<OpcaoBooleanaId, boolean> & Record<OpcaoNumericaId, number>;

/** Faixa de valores aceitos e passo dos botões − e +. O mínimo é 1 em todas (o script não aceita 0). */
export interface LimiteNumerico {
  padrao: number;
  min: number;
  max: number;
  passo: number;
  unidade: '' | 'min';
}

export const LIMITES: Record<OpcaoNumericaId, LimiteNumerico> = {
  Paralelo: { padrao: 5, min: 1, max: 50, passo: 1, unidade: '' },
  Buscas: { padrao: 2, min: 1, max: 10, passo: 1, unidade: '' },
  BuscasPorJanela: { padrao: 30, min: 1, max: 100, passo: 5, unidade: '' },
  PausaBloqueioMin: { padrao: 15, min: 1, max: 240, passo: 5, unidade: 'min' },
  Tentativas: { padrao: 5, min: 1, max: 50, passo: 1, unidade: '' },
  FilaMaxMin: { padrao: 4, min: 1, max: 240, passo: 1, unidade: 'min' },
  FilaUltimoMin: { padrao: 30, min: 1, max: 480, passo: 5, unidade: 'min' },
  DownloadMaxMin: { padrao: 20, min: 1, max: 480, passo: 5, unidade: 'min' },
  LoteBeets: { padrao: 10, min: 1, max: 200, passo: 1, unidade: '' },
};

/** Grupos da tela de Opções, na ordem em que aparecem (os textos estão em `msg.lote.opcoes`). */
export const GRUPOS_BOOLEANOS: readonly { id: 'qualidade' | 'titulos' | 'comportamento'; itens: OpcaoBooleanaId[] }[] =
  [
    { id: 'qualidade', itens: ['AceitarWav', 'AceitarMp3Menor'] },
    { id: 'titulos', itens: ['TituloAproximado', 'NaoTolerarGrafia', 'SemCatalogo', 'PularForaDoCatalogo'] },
    { id: 'comportamento', itens: ['Retentar', 'NaoPularExistentes', 'SemBeets', 'SemBuscaArtista'] },
  ];

/** Avançadas (recolhidas por padrão). */
export const GRUPOS_NUMERICOS: readonly { id: 'ritmo' | 'filas'; itens: OpcaoNumericaId[] }[] = [
  { id: 'ritmo', itens: ['Paralelo', 'Buscas', 'BuscasPorJanela', 'PausaBloqueioMin'] },
  { id: 'filas', itens: ['Tentativas', 'FilaMaxMin', 'FilaUltimoMin', 'DownloadMaxMin', 'LoteBeets'] },
];

export const OPCOES_PADRAO: Readonly<OpcoesLote> = Object.freeze({
  AceitarWav: false,
  AceitarMp3Menor: false,
  TituloAproximado: false,
  NaoTolerarGrafia: false,
  SemCatalogo: false,
  PularForaDoCatalogo: false,
  Retentar: false,
  NaoPularExistentes: false,
  SemBeets: false,
  SemBuscaArtista: false,
  Paralelo: LIMITES.Paralelo.padrao,
  Buscas: LIMITES.Buscas.padrao,
  BuscasPorJanela: LIMITES.BuscasPorJanela.padrao,
  PausaBloqueioMin: LIMITES.PausaBloqueioMin.padrao,
  Tentativas: LIMITES.Tentativas.padrao,
  FilaMaxMin: LIMITES.FilaMaxMin.padrao,
  FilaUltimoMin: LIMITES.FilaUltimoMin.padrao,
  DownloadMaxMin: LIMITES.DownloadMaxMin.padrao,
  LoteBeets: LIMITES.LoteBeets.padrao,
});

export function novasOpcoes(): OpcoesLote {
  return { ...OPCOES_PADRAO };
}

export const ehOpcaoBooleana = (id: string): id is OpcaoBooleanaId =>
  (OPCOES_BOOLEANAS as readonly string[]).includes(id);
export const ehOpcaoNumerica = (id: string): id is OpcaoNumericaId =>
  (OPCOES_NUMERICAS as readonly string[]).includes(id);

export function limitar(id: OpcaoNumericaId, valor: number): number {
  const { min, max } = LIMITES[id];
  return Math.min(max, Math.max(min, Math.round(valor)));
}

/**
 * Valida opções vindas de fora (o renderer não é confiável): só ids conhecidos, com o tipo certo e dentro dos
 * limites. O que faltar usa o padrão; qualquer outra coisa é erro.
 */
export function validarOpcoes(bruto: unknown): OpcoesLote {
  if (bruto === undefined || bruto === null) return novasOpcoes();
  if (typeof bruto !== 'object' || Array.isArray(bruto)) throw new Error('Opções do lote inválidas.');
  const o = bruto as Record<string, unknown>;
  const r = novasOpcoes();
  for (const [id, valor] of Object.entries(o)) {
    if (ehOpcaoBooleana(id)) {
      if (typeof valor !== 'boolean') throw new Error(`Opção ${id} inválida.`);
      r[id] = valor;
    } else if (ehOpcaoNumerica(id)) {
      if (typeof valor !== 'number' || !Number.isInteger(valor)) throw new Error(`Opção ${id} inválida.`);
      const { min, max } = LIMITES[id];
      if (valor < min || valor > max) throw new Error(`Opção ${id} fora do intervalo (${min} a ${max}).`);
      r[id] = valor;
    } else {
      throw new Error(`Opção desconhecida: ${id}.`);
    }
  }
  return r;
}

/** Opções que diferem do padrão do script, na ordem do README. */
export function opcoesAlteradas(opcoes: OpcoesLote): OpcaoId[] {
  const ordem: OpcaoId[] = [...OPCOES_NUMERICAS, ...OPCOES_BOOLEANAS];
  return ordem.filter((id) => opcoes[id] !== OPCOES_PADRAO[id]);
}

export function alterouAlgo(opcoes: OpcoesLote): boolean {
  return opcoesAlteradas(opcoes).length > 0;
}

/** `-Paralelo 8 -AceitarWav`: só o que difere do padrão (o script já assume os padrões). */
export function argumentosDasOpcoes(opcoes: OpcoesLote): string[] {
  const args: string[] = [];
  for (const id of opcoesAlteradas(opcoes)) {
    args.push(`-${id}`);
    if (ehOpcaoNumerica(id)) args.push(String(opcoes[id]));
  }
  return args;
}

/** O comando equivalente no terminal, como no resumo da tela de Opções. */
export function comandoEquivalente(lista: string, opcoes: OpcoesLote): string {
  const nome = /\s/.test(lista) ? `"${lista}"` : lista;
  return ['baixar-lista.bat', nome, ...argumentosDasOpcoes(opcoes)].join(' ');
}

// ---------------------------------------------------------------- Receitas

export interface Receita {
  id: string;
  /** o que muda em relação ao padrão (e só isso) */
  ajuste: Partial<OpcoesLote>;
}

/** As receitas do README como predefinições de um clique (os nomes estão em `msg.lote.receitas`). */
export const RECEITAS: readonly Receita[] = [
  { id: 'listaGrande', ajuste: { Paralelo: 8 } },
  { id: 'usuariosLentos', ajuste: { FilaMaxMin: 10, DownloadMaxMin: 40 } },
  { id: 'querTudo', ajuste: { AceitarWav: true, AceitarMp3Menor: true } },
  { id: 'tentarDeNovo', ajuste: { Retentar: true } },
  { id: 'soBaixar', ajuste: { SemBeets: true } },
  { id: 'buscasSemResposta', ajuste: { BuscasPorJanela: 20, PausaBloqueioMin: 30 } },
  { id: 'titulosDuvidosos', ajuste: { PularForaDoCatalogo: true } },
  { id: 'titulosIncompletos', ajuste: { TituloAproximado: true } },
  { id: 'listaEnormeComPressa', ajuste: { SemBuscaArtista: true } },
];

/** Os flags da receita, na forma do README (`-Paralelo 8`). */
export function flagsDaReceita(r: Receita): string {
  return Object.entries(r.ajuste)
    .map(([id, v]) => `-${id}${typeof v === 'number' ? ` ${v}` : ''}`)
    .join(' ');
}

export function receitaAtiva(r: Receita, opcoes: OpcoesLote): boolean {
  return (Object.entries(r.ajuste) as [OpcaoId, boolean | number][]).every(([id, v]) => opcoes[id] === v);
}

export function aplicarReceita(opcoes: OpcoesLote, r: Receita): OpcoesLote {
  return { ...opcoes, ...r.ajuste };
}
