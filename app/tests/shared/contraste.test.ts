// Contraste AA (WCAG 2.1, 1.4.3) dos pares texto/fundo dos dois temas, lidos de `estilos.css`: o que a pessoa lê tem
// que ter pelo menos 4,5:1, no escuro e no claro. Se um token muda, este teste diz qual par deixou de passar.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'renderer', 'estilos.css'), 'utf8');

function tokensDe(bloco: string): Record<string, string> {
  const t: Record<string, string> = {};
  for (const m of bloco.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
    t[m[1] as string] = (m[2] as string).toLowerCase();
  return t;
}

function blocoEntreChaves(css: string, inicio: number): string {
  const abre = css.indexOf('{', inicio);
  let nivel = 0;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') nivel++;
    else if (css[i] === '}' && --nivel === 0) return css.slice(abre + 1, i);
  }
  throw new Error('bloco sem fechamento');
}

const ESCURO = tokensDe(blocoEntreChaves(CSS, CSS.indexOf('@theme static')));
const CLARO = { ...ESCURO, ...tokensDe(blocoEntreChaves(CSS, CSS.indexOf('@media (prefers-color-scheme: light) {'))) };

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}

const SUPERFICIES = [
  'fundo',
  'painel',
  'cartao',
  'cartao-2',
  'log',
  'terminal',
  'campo',
  'dialogo',
  'elevado',
  'hover',
  'selecionado',
];
const TEXTO_CORRIDO = [
  'texto',
  'texto-forte',
  'texto-suave',
  'texto-claro',
  'texto-medio',
  'texto-codigo',
  'texto-mudo',
];
const CHIPS = ['neutro', 'azul', 'verde', 'laranja', 'vermelho', 'roxo', 'verdec', 'cinza'];

/** [texto, fundo] */
const PARES: [string, string][] = [
  ...TEXTO_CORRIDO.flatMap((t) => SUPERFICIES.map((s): [string, string] => [t, s])),
  // placeholders e numeração das linhas do editor
  ['texto-apagado', 'fundo'],
  ['texto-apagado', 'campo'],
  ['texto-gutter', 'fundo'],
  // âmbar: links, texto de destaque, borda de seleção e o botão primário
  ...['fundo', 'painel', 'cartao', 'cartao-2', 'elevado', 'hover', 'selecionado'].map((s): [string, string] => [
    'ambar',
    s,
  ]),
  ['sobre-ambar', 'ambar'],
  ['sobre-ambar', 'ambar-claro'],
  ['ambar', 'ambar-fundo'],
  ['ambar', 'dif-fundo'],
  ['ambar', 'ambar-selecionado'],
  ['ambar-vivo', 'ambar-fundo'],
  ['ambar-vivo', 'ambar-fundo-2'],
  ['ambar-vivo', 'ambar-fundo-hover'],
  ['ambar-vivo', 'fundo'],
  ['ambar-texto-suave', 'ambar-fundo-2'],
  ['aviso-texto', 'aviso-fundo'],
  ['aviso-titulo', 'aviso-fundo'],
  ['aviso-titulo', 'cartao'],
  ['erro-texto', 'fundo'],
  ['erro-texto', 'cartao'],
  ['erro-texto', 'erro-fundo'],
  ['erro-corpo', 'erro-fundo'],
  ['erro-texto', 'campo'],
  ['perigo-hover', 'perigo-fundo'],
  ['chip-azul', 'azul-fundo'],
  ['chip-verde', 'verde-fundo'],
  // log bruto do lote, que pinta a linha com a cor do chip
  ...['azul', 'verde', 'laranja', 'vermelho', 'roxo'].map((c): [string, string] => [`chip-${c}`, 'terminal']),
  ...['azul', 'verde', 'laranja', 'vermelho'].map((c): [string, string] => [`chip-${c}`, 'cartao']),
  // chips de estado
  ...CHIPS.map((c): [string, string] => [`chip-${c}`, `chip-${c}-fundo`]),
];

describe.each([
  ['escuro', ESCURO],
  ['claro', CLARO],
] as const)('contraste AA, tema %s', (_nome, tokens) => {
  it.each(PARES)('%s sobre %s', (texto, fundo) => {
    const a = tokens[texto];
    const b = tokens[fundo];
    expect(a, `token ${texto} não existe`).toBeDefined();
    expect(b, `token ${fundo} não existe`).toBeDefined();
    const razao = contraste(a as string, b as string);
    expect(razao, `${texto} ${a} sobre ${fundo} ${b} = ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tema claro', () => {
  it('redefine todos os tokens de cor do tema escuro (nenhum fica com o valor escuro por esquecimento)', () => {
    // o logo é da marca e fica igual nos dois temas
    const iguaisDeProposito = new Set(['ambar-logo', 'sobre-ambar-logo']);
    const esquecidos = Object.keys(ESCURO).filter((k) => {
      if (iguaisDeProposito.has(k)) return false;
      const claro = tokensDe(blocoEntreChaves(CSS, CSS.indexOf('@media (prefers-color-scheme: light) {')));
      return !(k in claro);
    });
    expect(esquecidos).toEqual([]);
  });

  it('o tema claro é de fato claro: o fundo tem muito mais luz que o texto', () => {
    expect(luminancia(CLARO.fundo as string)).toBeGreaterThan(0.8);
    expect(luminancia(CLARO.texto as string)).toBeLessThan(0.05);
    expect(luminancia(ESCURO.fundo as string)).toBeLessThan(0.02);
  });
});
