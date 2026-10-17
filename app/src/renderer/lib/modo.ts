// Modo DJ e Modo Dev no renderer: qual vale agora, a troca (que grava na preferência do main) e o aviso com "Desfazer"
// que aparece por 6 s quando a troca vem do alternador da barra lateral, do atalho ou de "Mostrar detalhes técnicos".
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import type { ModoInterface } from '@shared/ipc';
import { modoEfetivo, outroModo } from '@shared/modo';
import { seguro } from './acoes';
import { useMudarSettings, useSettings } from './preferencias';

/** Por quanto tempo o aviso "Modo DJ ligado" fica na tela. */
export const DURACAO_DO_AVISO_MS = 6000;

/** O modo que vale agora. Enquanto as preferências não chegam (ou se falharem), vale o Modo Dev, como sem escolha. */
export function useModo(): ModoInterface {
  const { data } = useSettings();
  return modoEfetivo(data);
}

export const useModoDj = (): boolean => useModo() === 'dj';

interface EstadoDoAviso {
  /** o modo que acabou de ser ligado (o aviso some sozinho); null sem aviso */
  aviso: { modo: ModoInterface; id: number } | null;
  mostrar(modo: ModoInterface): void;
  fechar(): void;
}

export const useAvisoDeModo = create<EstadoDoAviso>((set) => ({
  aviso: null,
  mostrar: (modo) => set((s) => ({ aviso: { modo, id: (s.aviso?.id ?? 0) + 1 } })),
  fechar: () => set({ aviso: null }),
}));

/**
 * Troca o modo. `avisar`: mostra o aviso com "Desfazer" (troca pelo alternador, pelo atalho ou pela saída para o
 * Modo Dev); em Configurações a escolha está à vista e não precisa de aviso. A tela atual continua onde está.
 */
export function useTrocarModo(): (modo: ModoInterface, opcoes?: { avisar?: boolean }) => void {
  const mudar = useMudarSettings();
  const mostrar = useAvisoDeModo((s) => s.mostrar);
  const fechar = useAvisoDeModo((s) => s.fechar);
  return useCallback(
    (modo, opcoes = {}) => {
      seguro(mudar({ modo }));
      if (opcoes.avisar) mostrar(modo);
      else fechar();
    },
    [mudar, mostrar, fechar],
  );
}

/** Ctrl+Shift+D (sem Alt nem Win), em qualquer layout de teclado: compara a tecla física. */
export function ehAtalhoDoModo(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'code'>,
): boolean {
  return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyD';
}

/** Liga o atalho Ctrl+Shift+D na janela inteira. Fica no App: vale em todas as telas, menos no assistente. */
export function useAtalhoDoModo(ativo: boolean): void {
  const modo = useModo();
  const trocar = useTrocarModo();
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (!ehAtalhoDoModo(e) || e.repeat) return;
      e.preventDefault();
      trocar(outroModo(modo), { avisar: true });
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo, modo, trocar]);
}
