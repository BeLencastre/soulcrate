// Estrutura da janela: barra lateral + a tela da rota atual. Liga os eventos do main ao estado do renderer.
import type { ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { BarraLateral } from './components/BarraLateral';
import { DialogoBandeja } from './components/DialogoBandeja';
import { useLigarEventos } from './lib/estado';

/** Moldura das telas comuns; a Web UI integrada ocupa a área inteira e não usa esta. */
export function Pagina({ children }: { children: ReactNode }) {
  return <div className="px-10 pt-8 pb-12">{children}</div>;
}

export function App() {
  const navegar = useNavigate();
  useLigarEventos(navegar);

  return (
    <div className="flex h-full min-h-0 bg-fundo text-texto">
      <BarraLateral />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <DialogoBandeja />
    </div>
  );
}
