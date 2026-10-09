// AppSettings (§3.2): preferências do app (não da stack), em um JSON na pasta userData.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppSettings, OndeAbrirWebUi, TemaPreferido } from '@shared/ipc';

export const SETTINGS_PADRAO: AppSettings = {
  minimizarParaBandeja: true,
  avisoBandejaDispensado: false,
  pastaDoProjeto: null,
  iniciarComWindows: false,
  tema: 'escuro',
  abrirWebUi: 'app',
  avisarFimDoLote: true,
  avisarBuscasPausadas: true,
};

const TEMAS: readonly TemaPreferido[] = ['escuro', 'claro', 'sistema'];
const ONDE_ABRIR: readonly OndeAbrirWebUi[] = ['app', 'navegador'];

function booleano(valor: unknown, padrao: boolean): boolean {
  return typeof valor === 'boolean' ? valor : padrao;
}

function umDe<T extends string>(valor: unknown, validos: readonly T[], padrao: T): T {
  return validos.find((v) => v === valor) ?? padrao;
}

/** Aceita só os campos conhecidos, com o tipo certo; o resto cai no padrão (arquivo editado à mão ou antigo). */
export function normalizarSettings(bruto: unknown): AppSettings {
  const o = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const p = SETTINGS_PADRAO;
  return {
    minimizarParaBandeja: booleano(o.minimizarParaBandeja, p.minimizarParaBandeja),
    avisoBandejaDispensado: booleano(o.avisoBandejaDispensado, p.avisoBandejaDispensado),
    pastaDoProjeto: typeof o.pastaDoProjeto === 'string' && o.pastaDoProjeto ? o.pastaDoProjeto : p.pastaDoProjeto,
    iniciarComWindows: booleano(o.iniciarComWindows, p.iniciarComWindows),
    tema: umDe(o.tema, TEMAS, p.tema),
    abrirWebUi: umDe(o.abrirWebUi, ONDE_ABRIR, p.abrirWebUi),
    avisarFimDoLote: booleano(o.avisarFimDoLote, p.avisarFimDoLote),
    avisarBuscasPausadas: booleano(o.avisarBuscasPausadas, p.avisarBuscasPausadas),
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
