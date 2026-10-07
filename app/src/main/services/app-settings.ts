// AppSettings (§3.2): preferências do app (não da stack), em um JSON na pasta userData.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppSettings } from '@shared/ipc';

export const SETTINGS_PADRAO: AppSettings = {
  minimizarParaBandeja: true,
  avisoBandejaDispensado: false,
  pastaDoProjeto: null,
};

/** Aceita só os campos conhecidos, com o tipo certo; o resto cai no padrão (arquivo editado à mão ou antigo). */
export function normalizarSettings(bruto: unknown): AppSettings {
  const o = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  return {
    minimizarParaBandeja:
      typeof o.minimizarParaBandeja === 'boolean' ? o.minimizarParaBandeja : SETTINGS_PADRAO.minimizarParaBandeja,
    avisoBandejaDispensado:
      typeof o.avisoBandejaDispensado === 'boolean' ? o.avisoBandejaDispensado : SETTINGS_PADRAO.avisoBandejaDispensado,
    pastaDoProjeto:
      typeof o.pastaDoProjeto === 'string' && o.pastaDoProjeto ? o.pastaDoProjeto : SETTINGS_PADRAO.pastaDoProjeto,
  };
}

export class AppSettingsService {
  private atual: AppSettings;

  constructor(private readonly arquivo: string) {
    this.atual = this.carregar();
  }

  private carregar(): AppSettings {
    try {
      return normalizarSettings(JSON.parse(readFileSync(this.arquivo, 'utf8')));
    } catch {
      return { ...SETTINGS_PADRAO };
    }
  }

  get(): AppSettings {
    return { ...this.atual };
  }

  set(parcial: Partial<AppSettings>): AppSettings {
    this.atual = normalizarSettings({ ...this.atual, ...parcial });
    this.gravar();
    return this.get();
  }

  /** grava num arquivo temporário e renomeia: um corte de energia não deixa o JSON pela metade */
  private gravar(): void {
    mkdirSync(dirname(this.arquivo), { recursive: true });
    const tmp = `${this.arquivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.atual, null, 2), 'utf8');
    renameSync(tmp, this.arquivo);
  }
}
