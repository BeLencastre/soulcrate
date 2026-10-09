import { describe, expect, it } from 'vitest';
import {
  aplicarPreferencias,
  ARGUMENTO_ESCONDIDO,
  fonteDoTema,
  FUNDO_DA_JANELA,
  fundoDaJanela,
  iniciarEscondido,
  type FonteDoTema,
} from '../../src/main/preferencias';
import { SETTINGS_PADRAO } from '../../src/main/services/app-settings';

function espiao() {
  const chamadas: string[] = [];
  return {
    chamadas,
    deps: {
      definirTema: (f: FonteDoTema) => chamadas.push(`tema:${f}`),
      definirInicioComWindows: (l: boolean) => chamadas.push(`login:${l}`),
    },
  };
}

describe('preferências que mexem no sistema', () => {
  it('o tema do app vira a fonte do tema do Electron (é ela que decide o prefers-color-scheme)', () => {
    expect(fonteDoTema('escuro')).toBe('dark');
    expect(fonteDoTema('claro')).toBe('light');
    expect(fonteDoTema('sistema')).toBe('system');
  });

  it('a janela nasce da cor do tema, para o claro não piscar escuro', () => {
    expect(fundoDaJanela(true)).toBe(FUNDO_DA_JANELA.escuro);
    expect(fundoDaJanela(false)).toBe(FUNDO_DA_JANELA.claro);
    // as mesmas cores de fundo dos dois temas em estilos.css
    expect(FUNDO_DA_JANELA).toEqual({ escuro: '#0E0F11', claro: '#F6F4EF' });
  });

  it('abre escondido só quando o Windows iniciou o app com o PC', () => {
    expect(iniciarEscondido(['Soulcrate.exe'], false)).toBe(false);
    expect(iniciarEscondido(['Soulcrate.exe', ARGUMENTO_ESCONDIDO], false)).toBe(true);
    expect(iniciarEscondido(['Soulcrate.exe'], true)).toBe(true);
    expect(ARGUMENTO_ESCONDIDO).toBe('--hidden');
  });

  it('na abertura aplica tudo (o caminho do executável pode ter mudado numa atualização)', () => {
    const { chamadas, deps } = espiao();
    aplicarPreferencias({ ...SETTINGS_PADRAO, tema: 'claro', iniciarComWindows: true }, null, deps);
    expect(chamadas).toEqual(['tema:light', 'login:true']);
  });

  it('depois, só leva ao sistema o que mudou', () => {
    const { chamadas, deps } = espiao();
    aplicarPreferencias({ ...SETTINGS_PADRAO, tema: 'sistema' }, SETTINGS_PADRAO, deps);
    expect(chamadas).toEqual(['tema:system']);
    chamadas.length = 0;
    aplicarPreferencias({ ...SETTINGS_PADRAO, iniciarComWindows: true }, SETTINGS_PADRAO, deps);
    expect(chamadas).toEqual(['login:true']);
    chamadas.length = 0;
    // abrir as Web UIs, os avisos e a bandeja não mexem no sistema
    aplicarPreferencias(
      { ...SETTINGS_PADRAO, abrirWebUi: 'navegador', avisarFimDoLote: false, minimizarParaBandeja: false },
      SETTINGS_PADRAO,
      deps,
    );
    expect(chamadas).toEqual([]);
  });
});
