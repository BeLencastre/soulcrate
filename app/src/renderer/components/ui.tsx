// Componentes de base da identidade (protótipo "Estados e componentes"): botão, rótulo, chip de estado, LED, cartão.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Variante = 'padrao' | 'primario' | 'fantasma' | 'perigo' | 'destrutivo';

const CLASSE_VARIANTE: Record<Variante, string> = {
  padrao: 'btn',
  primario: 'btn btn-p',
  fantasma: 'btn btn-g',
  perigo: 'btn btn-d',
  destrutivo: 'btn btn-x',
};

export function classeBotao(variante: Variante = 'padrao', pequeno = false): string {
  return `${CLASSE_VARIANTE[variante]}${pequeno ? ' btn-sm' : ''}`;
}

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  pequeno?: boolean;
}

export function Botao({ variante = 'padrao', pequeno = false, className, type = 'button', ...resto }: BotaoProps) {
  return <button type={type} className={`${classeBotao(variante, pequeno)} ${className ?? ''}`} {...resto} />;
}

/** Rótulo pequeno em caixa alta e fonte mono ("INÍCIO", "ETAPA 3"). */
export function Rotulo({ children, className = '', ...resto }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`lbl ${className}`} {...resto}>
      {children}
    </span>
  );
}

export type CorChip = 'neutro' | 'azul' | 'verde' | 'laranja' | 'vermelho' | 'roxo' | 'verdec' | 'cinza';

/** Estado em texto com quadradinho colorido; nunca depende só da cor. */
export function Chip({ cor, children }: { cor: CorChip; children: ReactNode }) {
  return <span className={`st st-${cor}`}>{children}</span>;
}

export type CorLed = 'verde' | 'cinza' | 'azul' | 'vermelho' | 'laranja' | 'ambar';

const COR_LED: Record<CorLed, string> = {
  verde: '#47C58A',
  cinza: '#3A3E45',
  azul: '#62A8FF',
  vermelho: '#FF6161',
  laranja: '#FF8B4A',
  ambar: '#F2B53A',
};

const BRILHO_LED: Partial<Record<CorLed, string>> = {
  verde: 'rgba(71,197,138,.6)',
  azul: 'rgba(98,168,255,.5)',
  vermelho: 'rgba(255,97,97,.5)',
};

export function Led({ cor, tamanho = 8, brilho = false }: { cor: CorLed; tamanho?: number; brilho?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-[2px]"
      style={{
        width: tamanho,
        height: tamanho,
        background: COR_LED[cor],
        boxShadow: brilho && BRILHO_LED[cor] ? `0 0 ${tamanho}px ${BRILHO_LED[cor]}` : undefined,
      }}
    />
  );
}

interface CartaoProps extends HTMLAttributes<HTMLElement> {
  /** borda: normal, erro (vermelha), aviso (laranja), azul (em andamento) ou tracejada (vazio) */
  borda?: 'normal' | 'erro' | 'aviso' | 'azul' | 'vazio';
  como?: 'div' | 'section';
}

const CLASSE_BORDA: Record<NonNullable<CartaoProps['borda']>, string> = {
  normal: 'border-borda',
  erro: 'border-erro-borda',
  aviso: 'border-aviso-borda',
  azul: 'border-azul-borda',
  vazio: 'border-dashed border-borda-forte bg-painel',
};

export function Cartao({ borda = 'normal', como: Tag = 'div', className = '', ...resto }: CartaoProps) {
  return <Tag className={`rounded-lg border bg-cartao ${CLASSE_BORDA[borda]} ${className}`} {...resto} />;
}

/** Cabeçalho de página: rótulo, título grande, subtítulo e ações à direita. */
export function CabecalhoPagina({
  rotulo,
  titulo,
  subtitulo,
  acoes,
}: {
  rotulo: string;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex flex-col gap-2">
        <Rotulo>{rotulo}</Rotulo>
        <h1 className="m-0 text-[34px] leading-tight font-extrabold tracking-[-0.01em]" style={{ fontStretch: '112%' }}>
          {titulo}
        </h1>
        {subtitulo ? (
          <p className="m-0 max-w-[640px] text-[15px] leading-normal text-texto-suave">{subtitulo}</p>
        ) : null}
      </div>
      {acoes ? <div className="flex flex-wrap gap-2">{acoes}</div> : null}
    </header>
  );
}
