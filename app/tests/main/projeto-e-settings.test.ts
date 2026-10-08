import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppSettingsService, normalizarSettings, SETTINGS_PADRAO } from '../../src/main/services/app-settings';
import { ehPastaDoSoulcrate, lerVersaoDaStack, resolverProjeto } from '../../src/main/services/project-service';

const compose = (dir: string) => join(dir, 'docker-compose.yml');

describe('resolverProjeto', () => {
  const candidatos = {
    configurada: 'C:\\Escolhida',
    ambiente: 'C:\\Ambiente',
    desenvolvimento: 'C:\\Repo',
    padrao: 'C:\\Users\\dj\\Soulcrate',
  };

  it('ordem: escolhida, SOULCRATE_DIR, desenvolvimento, padrão', () => {
    const todas = new Set(Object.values(candidatos).map(compose));
    const existe = (p: string) => todas.has(p);
    expect(resolverProjeto(candidatos, existe)).toEqual({ dir: 'C:\\Escolhida', origem: 'configurada' });
    expect(resolverProjeto({ ...candidatos, configurada: null }, existe)).toEqual({
      dir: 'C:\\Ambiente',
      origem: 'ambiente',
    });
    expect(resolverProjeto({ ...candidatos, configurada: null, ambiente: null }, existe)).toEqual({
      dir: 'C:\\Repo',
      origem: 'desenvolvimento',
    });
    expect(
      resolverProjeto({ ...candidatos, configurada: null, ambiente: null, desenvolvimento: null }, existe),
    ).toEqual({
      dir: 'C:\\Users\\dj\\Soulcrate',
      origem: 'padrao',
    });
  });

  it('pula quem não tem o docker-compose.yml (pasta apagada, escolha antiga)', () => {
    const existe = (p: string) => p === compose('C:\\Repo');
    expect(resolverProjeto(candidatos, existe)).toEqual({ dir: 'C:\\Repo', origem: 'desenvolvimento' });
  });

  it('nenhuma serve: sem projeto', () => {
    expect(resolverProjeto(candidatos, () => false)).toEqual({ dir: null, origem: null });
    expect(ehPastaDoSoulcrate('C:\\x', () => false)).toBe(false);
  });
});

describe('lerVersaoDaStack (S3)', () => {
  it('lê só o número SemVer do VERSION', () => {
    expect(lerVersaoDaStack('C:\\x', () => '1.0.0\n')).toBe('1.0.0');
    expect(lerVersaoDaStack('C:\\x', () => '  2.3.1-beta  ')).toBe('2.3.1-beta');
  });
  it('arquivo ausente, vazio ou com outra coisa: null', () => {
    expect(lerVersaoDaStack('C:\\x', () => null)).toBeNull();
    expect(lerVersaoDaStack('C:\\x', () => '')).toBeNull();
    expect(lerVersaoDaStack('C:\\x', () => 'stack 1.0.0')).toBeNull();
    expect(lerVersaoDaStack(null, () => '1.0.0')).toBeNull();
  });
});

describe('AppSettingsService', () => {
  const pastas: string[] = [];
  afterEach(() => {
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
  });
  const novo = () => {
    const d = mkdtempSync(join(tmpdir(), 'sc-settings-'));
    pastas.push(d);
    return join(d, 'dados', 'settings.json');
  };

  it('sem arquivo: o padrão (minimizar para a bandeja, D7)', () => {
    const s = new AppSettingsService(novo());
    expect(s.get()).toEqual(SETTINGS_PADRAO);
    expect(s.get().minimizarParaBandeja).toBe(true);
  });

  it('grava, cria a pasta e recarrega o que foi gravado', () => {
    const arq = novo();
    const s = new AppSettingsService(arq);
    expect(s.set({ avisoBandejaDispensado: true, pastaDoProjeto: 'D:\\Soulcrate' }).avisoBandejaDispensado).toBe(true);
    const outra = new AppSettingsService(arq);
    expect(outra.get()).toEqual({
      minimizarParaBandeja: true,
      avisoBandejaDispensado: true,
      pastaDoProjeto: 'D:\\Soulcrate',
    });
    expect(JSON.parse(readFileSync(arq, 'utf8'))).toMatchObject({ pastaDoProjeto: 'D:\\Soulcrate' });
  });

  it('arquivo corrompido ou com campos errados cai no padrão, sem quebrar o app', () => {
    const arq = novo();
    mkdirSync(join(arq, '..'), { recursive: true });
    writeFileSync(arq, '{ isto não é json');
    expect(new AppSettingsService(arq).get()).toEqual(SETTINGS_PADRAO);
    expect(
      normalizarSettings({ minimizarParaBandeja: 'sim', pastaDoProjeto: 42, avisoBandejaDispensado: null }),
    ).toEqual(SETTINGS_PADRAO);
    expect(normalizarSettings(null)).toEqual(SETTINGS_PADRAO);
    expect(normalizarSettings({ minimizarParaBandeja: false, extra: 1 })).toEqual({
      ...SETTINGS_PADRAO,
      minimizarParaBandeja: false,
    });
  });

  it('get devolve cópia: mexer nela não muda as preferências', () => {
    const s = new AppSettingsService(novo());
    s.get().minimizarParaBandeja = false;
    expect(s.get().minimizarParaBandeja).toBe(true);
  });
});
