// Estrutura da janela: barra lateral + a tela da rota atual. Liga os eventos do main ao estado do renderer.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import { BarraLateral } from './components/BarraLateral';
import { DialogoBandeja } from './components/DialogoBandeja';
import { msg } from '@shared/mensagens';
import { useLigarEventos } from './lib/estado';
import { useRascunho } from './lib/lote-store';
import { tituloDaJanela, tituloDaRota } from './lib/titulos';

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

/**
 * Acessibilidade da troca de tela (Fase 6): o título da janela acompanha a tela e, ao navegar, o foco vai para o
 * conteúdo (sem isso, quem usa teclado ou leitor de tela fica parado no link da barra lateral, sem saber que a tela mudou).
 * Mudar só a seção de Configurações (`?secao=`) não conta: o `pathname` é o mesmo.
 */
function useFocoNaTrocaDeTela(principal: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const primeira = useRef(true);
  useEffect(() => {
    document.title = tituloDaJanela(pathname);
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    // uma tela que já pôs o foco num campo (autoFocus) fica com ele
    const el = principal.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [pathname, principal]);
}

export function App() {
  const navegar = useNavigate();
  useLigarEventos(navegar);
  const arrastando = useSoltarArquivos(navegar);
  // o assistente ocupa a janela inteira, como no protótipo: sem a barra lateral
  const noAssistente = useMatch('/assistente') !== null;
  const principal = useRef<HTMLElement>(null);
  useFocoNaTrocaDeTela(principal);
  const { pathname } = useLocation();

  return (
    <div className="flex h-full min-h-0 bg-fundo text-texto">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-ambar focus:px-4 focus:py-2 focus:font-bold focus:text-sobre-ambar focus:no-underline"
        onClick={(e) => {
          // o roteador usa o `#` do endereço: nada de navegar, só levar o foco ao conteúdo
          e.preventDefault();
          principal.current?.focus();
        }}
      >
        {msg.acessibilidade.pularParaConteudo}
      </a>
      {noAssistente ? null : <BarraLateral />}
      <main
        id="conteudo"
        ref={principal}
        tabIndex={-1}
        aria-label={tituloDaRota(pathname)}
        className="min-w-0 flex-1 overflow-y-auto focus:outline-none"
      >
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
