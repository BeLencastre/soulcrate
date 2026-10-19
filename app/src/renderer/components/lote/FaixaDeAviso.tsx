// A faixa colorida acima do progresso do lote (limite de buscas, pausa, parando, concluído), nos dois modos.
import type { TomFaixa } from '../../lib/lote-painel';

const TOM_DA_FAIXA: Record<TomFaixa, { fundo: string; borda: string; cor: string }> = {
  azul: { fundo: 'var(--color-azul-fundo)', borda: 'var(--color-azul-borda)', cor: 'var(--color-led-azul)' },
  laranja: { fundo: 'var(--color-aviso-fundo)', borda: 'var(--color-aviso-borda)', cor: 'var(--color-led-laranja)' },
  ambar: { fundo: 'var(--color-ambar-fundo)', borda: 'var(--color-ambar-borda)', cor: 'var(--color-ambar)' },
  verde: { fundo: 'var(--color-verde-fundo)', borda: 'var(--color-verde-borda)', cor: 'var(--color-led-verde)' },
};

export function FaixaDeAviso({
  id,
  tom,
  titulo,
  texto,
  pulsa,
}: {
  id: string;
  tom: TomFaixa;
  titulo: string;
  texto: string;
  pulsa: boolean;
}) {
  const c = TOM_DA_FAIXA[tom];
  return (
    <div
      role="status"
      data-faixa={id}
      className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
      style={{ background: c.fundo, borderColor: c.borda }}
    >
      <span
        aria-hidden="true"
        className={`size-[9px] rounded-[2px] ${pulsa ? 'pulsa' : ''}`}
        style={{ background: c.cor }}
      />
      <span className="text-sm font-bold">{titulo}</span>
      <span className="text-[13px] text-texto-medio">{texto}</span>
    </div>
  );
}
