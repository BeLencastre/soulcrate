// Modo DJ e Modo Dev no renderer: qual vale agora, a troca (que grava na preferência do main) e o atalho Ctrl+Shift+D.
import { useCallback, useEffect } from 'react';
import type { ModoInterface } from '@shared/ipc';
import { modoEfetivo, outroModo } from '@shared/modo';
import { seguro } from './acoes';
import { useMudarSettings, useSettings } from './preferencias';

/** O modo que vale agora. Enquanto as preferências não chegam (ou se falharem), vale o Modo Dev, como sem escolha. */
export function useModo(): ModoInterface {
  const { data } = useSettings();
  return modoEfetivo(data);
}

export const useModoDj = (): boolean => useModo() === 'dj';

/** Troca o modo: grava na preferência do main, e a tela atual continua onde está (só muda o que aparece). */
export function useTrocarModo(): (modo: ModoInterface) => void {
  const mudar = useMudarSettings();
  return useCallback((modo) => seguro(mudar({ modo })), [mudar]);
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
      trocar(outroModo(modo));
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo, modo, trocar]);
}
