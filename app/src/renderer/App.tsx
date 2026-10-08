// Estrutura da janela: barra lateral + a tela da rota atual. Liga os eventos do main ao estado do renderer.
import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router';
import { BarraLateral } from './components/BarraLateral';
import { DialogoBandeja } from './components/DialogoBandeja';
import { msg } from '@shared/mensagens';
import { useLigarEventos } from './lib/estado';
import { useRascunho } from './lib/lote-store';

/** Moldura das telas comuns; a Web UI integrada ocupa a área inteira e não usa esta. */
export function Pagina({ children }: { children: ReactNode }) {
  return <div className="px-10 pt-8 pb-12">{children}</div>;
}

/**
 * Arrastar um .txt ou .csv para a janela importa a lista (§5, Fase 3). O renderer não enxerga o caminho do arquivo
 * (sandbox): manda os bytes ao main, que grava na pasta do Soulcrate. Devolve se há um arquivo sendo arrastado.
 */
function useSoltarArquivos(navegar: (rota: string) => void): boolean {
  const [arrastando, setArrastando] = useState(false);
  useEffect(() => {
    let dentro = 0;
    const temArquivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const aoEntrar = (e: DragEvent) => {
      if (!temArquivos(e)) return;
      dentro++;
      setArrastando(true);
    };
    const aoSair = (e: DragEvent) => {
      if (!temArquivos(e)) return;
      dentro = Math.max(0, dentro - 1);
      if (dentro === 0) setArrastando(false);
    };
    const aoSobre = (e: DragEvent) => {
      if (!temArquivos(e)) return;
      e.preventDefault(); // sem isto o navegador não aceita o arquivo solto (e o Electron tentaria abri-lo)
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const aoSoltar = (e: DragEvent) => {
      if (!temArquivos(e)) return;
      e.preventDefault();
      dentro = 0;
      setArrastando(false);
      const arquivo = Array.from(e.dataTransfer?.files ?? []).find((f) => /\.(txt|csv)$/i.test(f.name));
      if (!arquivo) {
        useRascunho.setState({ erro: msg.lote.lista.soTxtCsv });
        navegar('/lista');
        return;
      }
      void arquivo.arrayBuffer().then(async (buf) => {
        await useRascunho.getState().importarBytes(arquivo.name, new Uint8Array(buf));
        navegar('/lista');
      });
    };
    window.addEventListener('dragenter', aoEntrar);
    window.addEventListener('dragleave', aoSair);
    window.addEventListener('dragover', aoSobre);
    window.addEventListener('drop', aoSoltar);
    return () => {
      window.removeEventListener('dragenter', aoEntrar);
      window.removeEventListener('dragleave', aoSair);
      window.removeEventListener('dragover', aoSobre);
      window.removeEventListener('drop', aoSoltar);
    };
  }, [navegar]);
  return arrastando;
}

export function App() {
  const navegar = useNavigate();
  useLigarEventos(navegar);
  const arrastando = useSoltarArquivos(navegar);
  // o assistente ocupa a janela inteira, como no protótipo: sem a barra lateral
  const noAssistente = useMatch('/assistente') !== null;

  return (
    <div className="flex h-full min-h-0 bg-fundo text-texto">
      {noAssistente ? null : <BarraLateral />}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <DialogoBandeja />
      {arrastando ? (
        <div
          aria-hidden="true"
          data-testid="area-de-soltar"
          className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-xl border-2 border-dashed border-ambar bg-black/70 text-xl font-extrabold text-ambar"
        >
          {msg.lote.lista.soltar}
        </div>
      ) : null}
    </div>
  );
}
