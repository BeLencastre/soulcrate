// Ícones de traço (24x24), os mesmos do protótipo. Decorativos: o texto ao lado diz o que são.
import type { ReactNode, SVGProps } from 'react';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  tamanho?: number;
}

function Base({ tamanho = 16, children, ...resto }: Props & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  );
}

export const IconeInicio = (p: Props) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Base>
);
export const IconeBaixar = (p: Props) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 20h16" />
  </Base>
);
export const IconeHistorico = (p: Props) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Base>
);
export const IconeBiblioteca = (p: Props) => (
  <Base strokeWidth={1.8} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.8" />
  </Base>
);
export const IconeServicos = (p: Props) => (
  <Base strokeWidth={1.8} {...p}>
    <rect x="3" y="4" width="18" height="7" rx="1.5" />
    <rect x="3" y="13" width="18" height="7" rx="1.5" />
    <path d="M7 7.5h.01" />
    <path d="M7 16.5h.01" />
  </Base>
);
export const IconeConfiguracoes = (p: Props) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M6 3v18" />
    <path d="M12 3v18" />
    <path d="M18 3v18" />
    <rect x="4" y="13" width="4" height="3" rx="1" />
    <rect x="10" y="6" width="4" height="3" rx="1" />
    <rect x="16" y="15" width="4" height="3" rx="1" />
  </Base>
);
export const IconeLigar = (p: Props) => (
  <Base {...p}>
    <path d="M12 3v8" />
    <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
  </Base>
);
export const IconeReconstruir = (p: Props) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L3 9" />
    <path d="M3 4v5h5" />
    <path d="M4 13a8 8 0 0 0 14.6 4.5L21 15" />
    <path d="M21 20v-5h-5" />
  </Base>
);
export const IconeRecarregar = (p: Props) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Base>
);
export const IconeLinkExterno = (p: Props) => (
  <Base {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Base>
);
export const IconeSeta = (p: Props) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);
export const IconeVoltarPagina = (p: Props) => (
  <Base {...p}>
    <path d="m15 6-6 6 6 6" />
  </Base>
);
export const IconeVoltar = (p: Props) => (
  <Base {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Base>
);
export const IconeCadeado = (p: Props) => (
  <Base tamanho={14} {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Base>
);

/** O logo do Soulcrate: um caixote âmbar com discos em pé (o mesmo do ícone do app). */
export function Logo({ tamanho = 30 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2" y="9" width="28" height="20" rx="3" fill="var(--color-ambar-logo)" />
      <rect x="6" y="3" width="3" height="16" rx="1" fill="var(--color-texto)" />
      <rect x="11" y="5" width="3" height="14" rx="1" fill="var(--color-texto)" />
      <rect x="16" y="2" width="3" height="17" rx="1" fill="var(--color-texto)" />
      <rect x="21" y="6" width="3" height="13" rx="1" fill="var(--color-texto)" />
      <rect x="2" y="15" width="28" height="14" rx="3" fill="var(--color-ambar-logo)" />
      <rect x="11" y="20" width="10" height="3" rx="1.5" fill="var(--color-sobre-ambar-logo)" />
    </svg>
  );
}

export const IconeEnviar = (p: Props) => (
  <Base {...p}>
    <path d="M12 15V3" />
    <path d="m7 8 5-5 5 5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Base>
);
export const IconePlay = (p: Props) => (
  <Base fill="currentColor" stroke="none" {...p}>
    <path d="M7 4v16l13-8z" />
  </Base>
);
export const IconeParar = (p: Props) => (
  <Base fill="currentColor" stroke="none" {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </Base>
);

export const IconePasta = (p: Props) => (
  <Base {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Base>
);
export const IconeArquivo = (p: Props) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Base>
);

export const IconeLixeira = (p: Props) => (
  <Base {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </Base>
);
/** Lista com uma nota musical: "Importar playlist". */
export const IconePlaylist = (p: Props) => (
  <Base {...p}>
    <path d="M3 6h11" />
    <path d="M3 12h11" />
    <path d="M3 18h6" />
    <circle cx="16" cy="18" r="3" />
    <path d="M19 18V6l3 1.5" />
  </Base>
);
export const IconeFechar = (p: Props) => (
  <Base tamanho={18} {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Base>
);
export const IconeAlerta = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </Base>
);

// ---------------------------------------------------------------- Modo DJ e Modo Dev

/** Fones: o Modo DJ e "Ouvir a biblioteca". */
export const IconeFones = (p: Props) => (
  <Base {...p}>
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
  </Base>
);
/** `< >`: o Modo Dev. */
export const IconeCodigo = (p: Props) => (
  <Base {...p}>
    <path d="m8 8-5 4 5 4" />
    <path d="m16 8 5 4-5 4" />
  </Base>
);
export const IconeBusca = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);
/** Setas para cima e para baixo: as transferências do Soulseek. */
export const IconeTransferencias = (p: Props) => (
  <Base {...p}>
    <path d="M7 4v16" />
    <path d="m3 8 4-4 4 4" />
    <path d="M17 20V4" />
    <path d="m21 16-4 4-4-4" />
  </Base>
);
