// Preferências do app que mexem no sistema (Fase 6): o tema, iniciar com o Windows e abrir minimizado na bandeja.
// A lógica fica em funções puras e as chamadas do Electron entram por `DepsPreferencias`, para testar sem Electron.
import type { AppSettings, TemaPreferido } from '@shared/ipc';

/** Argumento que o Windows passa ao app quando o inicia com o PC: abre direto na bandeja, sem janela. */
export const ARGUMENTO_ESCONDIDO = '--hidden';

/** O valor de `nativeTheme.themeSource`: é ele que decide o `prefers-color-scheme` que o CSS do renderer enxerga. */
export type FonteDoTema = 'dark' | 'light' | 'system';

export function fonteDoTema(tema: TemaPreferido): FonteDoTema {
  switch (tema) {
    case 'escuro':
      return 'dark';
    case 'claro':
      return 'light';
    case 'sistema':
      return 'system';
  }
}

/** Cor do fundo da janela antes de a página pintar (senão a janela claro piscaria escura ao abrir). */
export const FUNDO_DA_JANELA = { escuro: '#0E0F11', claro: '#F6F4EF' } as const;

export function fundoDaJanela(sistemaEscuro: boolean): string {
  return sistemaEscuro ? FUNDO_DA_JANELA.escuro : FUNDO_DA_JANELA.claro;
}

/** Abre sem janela: foi o Windows que iniciou o app com o PC (argumento ou marca do sistema). */
export function iniciarEscondido(argv: readonly string[], abertoNoLogin: boolean): boolean {
  return abertoNoLogin || argv.includes(ARGUMENTO_ESCONDIDO);
}

export interface DepsPreferencias {
  definirTema(fonte: FonteDoTema): void;
  /** registra (ou remove) o app para abrir com o Windows, com o argumento `--hidden` */
  definirInicioComWindows(ligado: boolean): void;
}

/**
 * Leva ao sistema o que mudou entre `antes` e `depois`. Com `antes` nulo (a abertura do app), aplica tudo: o caminho do
 * executável pode ter mudado (atualização, instalação em outra pasta) e a entrada do Windows precisa apontar para ele.
 */
export function aplicarPreferencias(depois: AppSettings, antes: AppSettings | null, d: DepsPreferencias): void {
  if (!antes || antes.tema !== depois.tema) d.definirTema(fonteDoTema(depois.tema));
  if (!antes || antes.iniciarComWindows !== depois.iniciarComWindows) {
    d.definirInicioComWindows(depois.iniciarComWindows);
  }
}
