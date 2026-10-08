// Tabela com virtualização (§6.4: "tabela de faixas fluida com 1.000 linhas"): só as linhas visíveis (mais uma folga)
// vão para o DOM. Linhas de altura fixa, posicionadas pelo índice; o cabeçalho fica fixo no topo.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const FOLGA = 8;

interface Props<T> {
  /** nome da tabela para leitores de tela */
  rotulo: string;
  /** `grid-template-columns` das colunas (o mesmo no cabeçalho e nas linhas) */
  colunas: string;
  cabecalho: readonly string[];
  linhas: readonly T[];
  alturaLinha: number;
  /** altura máxima da área de rolagem (px) */
  alturaMax: number;
  /** largura mínima do conteúdo: abaixo disso aparece a rolagem horizontal */
  larguraMinima?: number;
  chave(item: T, indice: number): string;
  /** o conteúdo de cada célula, na ordem das colunas */
  celulas(item: T, indice: number): ReactNode[];
  vazio: ReactNode;
  /** marca de teste para os e2e */
  testId?: string;
}

/** Quais linhas ficam no DOM: as que aparecem em [rolagem, rolagem + altura], mais a folga dos dois lados. */
export function janelaVisivel(total: number, alturaLinha: number, rolagem: number, altura: number): [number, number] {
  // a lista pode ter encolhido (um filtro) antes de o navegador corrigir a rolagem: não passa do fim
  const r = Math.min(rolagem, Math.max(0, total * alturaLinha - altura));
  const primeira = Math.max(0, Math.floor(r / alturaLinha) - FOLGA);
  const ultima = Math.min(total, Math.ceil((r + altura) / alturaLinha) + FOLGA);
  return [primeira, Math.max(primeira, ultima)];
}

export function TabelaVirtual<T>({
  rotulo,
  colunas,
  cabecalho,
  linhas,
  alturaLinha,
  alturaMax,
  larguraMinima = 0,
  chave,
  celulas,
  vazio,
  testId,
}: Props<T>) {
  const area = useRef<HTMLDivElement>(null);
  const [rolagem, setRolagem] = useState(0);
  // sem layout (jsdom, ou antes da primeira medição) vale a altura máxima: renderiza o suficiente para a primeira tela
  const [altura, setAltura] = useState(alturaMax);

  const medir = useCallback(() => {
    const h = area.current?.clientHeight ?? 0;
    setAltura(h > 0 ? h : alturaMax);
  }, [alturaMax]);

  useLayoutEffect(medir, [medir, linhas.length]);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, [medir]);

  const total = linhas.length;
  const [de, ate] = janelaVisivel(total, alturaLinha, rolagem, altura);
  const grade = { gridTemplateColumns: colunas };

  return (
    <div
      ref={area}
      role="table"
      aria-label={rotulo}
      aria-rowcount={total + 1}
      tabIndex={0}
      data-testid={testId}
      className="overflow-auto"
      style={{ maxHeight: alturaMax }}
      onScroll={(e) => setRolagem(e.currentTarget.scrollTop)}
    >
      <div style={{ minWidth: larguraMinima || undefined }}>
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-10 grid items-center border-b border-borda-fraca bg-cartao"
          style={grade}
        >
          {cabecalho.map((c, i) => (
            <div key={c} role="columnheader" className={`lbl py-[10px] font-medium ${i === 0 ? 'pl-4' : 'px-2'}`}>
              {c}
            </div>
          ))}
        </div>
        {total === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-texto-suave">{vazio}</div>
        ) : (
          <div role="rowgroup" style={{ height: total * alturaLinha, position: 'relative' }}>
            {linhas.slice(de, ate).map((item, k) => {
              const i = de + k;
              return (
                <div
                  key={chave(item, i)}
                  role="row"
                  aria-rowindex={i + 2}
                  className="row absolute right-0 left-0 grid items-center border-t border-[#22252a]"
                  style={{ ...grade, top: i * alturaLinha, height: alturaLinha }}
                >
                  {celulas(item, i).map((c, j) => (
                    <div key={j} role="cell" className={`min-w-0 text-[13px] ${j === 0 ? 'pl-4' : 'px-2'}`}>
                      {c}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
