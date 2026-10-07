// A validação em TypeScript precisa dar o MESMO resultado do validar-config.ps1 para os mesmos casos
// (tests/fixtures/config/casos.json, compartilhados com tests/validar-config.Tests.ps1).
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { codigoDeSaida, lerChaveSlskd, lerEnv, validarConfiguracao } from '../../src/main/services/config-validacao';

interface Caso {
  nome: string;
  env?: null | { trocar?: Record<string, string>; remover?: string[] };
  envDoRepositorio?: string;
  yml?: string | null;
  esperado: { codigo: number; erros: string[]; avisos: string[] };
}
interface Dados {
  base: { env: Record<string, string>; chave: string; yml: string; pastas: string[] };
  casos: Caso[];
}

const REPO = join(import.meta.dirname, '..', '..', '..');
const dados = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'config', 'casos.json'), 'utf8'),
) as Dados;

const criadas: string[] = [];
afterEach(() => {
  for (const d of criadas.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** O mesmo que `New-RaizCaso` do teste Pester. */
function criarRaiz(caso: Pick<Caso, 'env' | 'envDoRepositorio' | 'yml'>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'sc-config-'));
  criadas.push(raiz);
  mkdirSync(join(raiz, 'slskd'), { recursive: true });
  for (const p of dados.base.pastas) mkdirSync(join(raiz, p), { recursive: true });

  if (caso.envDoRepositorio) {
    copyFileSync(join(REPO, caso.envDoRepositorio), join(raiz, '.env'));
  } else if (caso.env !== null) {
    const env = new Map(Object.entries(dados.base.env));
    for (const [k, v] of Object.entries(caso.env?.trocar ?? {})) env.set(k, v);
    for (const k of caso.env?.remover ?? []) env.delete(k);
    writeFileSync(join(raiz, '.env'), [...env].map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  }
  if (caso.yml !== null) {
    writeFileSync(
      join(raiz, 'slskd', 'slskd.yml'),
      (caso.yml ?? dados.base.yml).replaceAll('{{CHAVE}}', dados.base.chave),
    );
  }
  return raiz;
}

const unicos = (ids: string[]) => [...new Set(ids)].sort();

describe('validarConfiguracao: casos compartilhados com o validar-config.ps1', () => {
  it.each(dados.casos.map((c) => [c.nome, c] as const))('%s', (_nome, caso) => {
    const r = validarConfiguracao(criarRaiz(caso));
    expect(unicos(r.achados.filter((a) => a.nivel === 'erro').map((a) => a.id))).toEqual(unicos(caso.esperado.erros));
    expect(unicos(r.achados.filter((a) => a.nivel === 'aviso').map((a) => a.id))).toEqual(unicos(caso.esperado.avisos));
    expect(codigoDeSaida(r)).toBe(caso.esperado.codigo);
    expect(r.estado).toBe(caso.esperado.codigo === 0 ? 'valida' : 'invalida');
    // nunca mostra segredos
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(dados.base.env.SLSK_PASSWORD);
    expect(texto).not.toContain(dados.base.chave);
    expect(texto).not.toContain(dados.base.env.SOULBEET_SECRET_KEY);
  });

  it('o ponto de partida (sem achados) é uma configuração válida', () => {
    const r = validarConfiguracao(criarRaiz({}));
    expect(r).toEqual({ estado: 'valida', erros: 0, avisos: 0, achados: [] });
  });
});

describe('validarConfiguracao: regras que dependem da máquina (fora dos casos compartilhados)', () => {
  it('pasta dentro do OneDrive avisa', () => {
    const raiz = criarRaiz({});
    const onedrive = join(raiz, 'OneDrive', 'Music');
    mkdirSync(onedrive, { recursive: true });
    const env = readFileSync(join(raiz, '.env'), 'utf8').replace(
      'MUSIC_DIR=./music',
      `MUSIC_DIR=${onedrive.replaceAll('\\', '/')}`,
    );
    writeFileSync(join(raiz, '.env'), env);
    const ids = validarConfiguracao(raiz).achados.map((a) => a.id);
    expect(ids).toContain('PASTA_ONEDRIVE');
  });

  it('discos diferentes avisam, comparando a raiz de cada pasta', () => {
    const fs = {
      existeArquivo: () => true,
      existePasta: () => true,
      ler: (p: string) =>
        p.endsWith('.env')
          ? 'PUID=1000\nPGID=1000\nTZ=UTC\nDOWNLOADS_DIR=C:/DJ/Downloads\nINCOMPLETE_DIR=C:/DJ/Inc\nMUSIC_DIR=D:/DJ/Music\nSLSK_USERNAME=u\nSLSK_PASSWORD=p\nSLSKD_WEB_USER=a\nSLSKD_WEB_PASSWORD=b\nSOULBEET_SECRET_KEY=' +
            'x'.repeat(40) +
            '\nSLSKD_API_KEY_SOULBEET=' +
            'k'.repeat(32)
          : `web:\n  authentication:\n    api_keys:\n      soulbeet:\n        key: ${'k'.repeat(32)}\n`,
    };
    const r = validarConfiguracao('C:\\Soulcrate', fs);
    expect(r.achados.map((a) => a.id)).toEqual(['PASTAS_DISCOS_DIFERENTES']);
    expect(r.estado).toBe('valida');
  });

  it('caminho com caracteres que o Windows recusa é erro', () => {
    const fs = {
      existeArquivo: () => true,
      existePasta: () => true,
      ler: (p: string) => (p.endsWith('.env') ? 'MUSIC_DIR=D:/a<b|c\nDOWNLOADS_DIR=D:/ok\n' : 'key: abc'),
    };
    expect(
      validarConfiguracao('C:\\x', fs).achados.some((a) => a.id === 'PASTA_INVALIDA' && a.variavel === 'MUSIC_DIR'),
    ).toBe(true);
  });

  it('espaço e acento no caminho funcionam (SP8)', () => {
    const raiz = criarRaiz({});
    const pasta = join(raiz, 'Música DJ', 'Faixas novas');
    mkdirSync(pasta, { recursive: true });
    const env = readFileSync(join(raiz, '.env'), 'utf8').replace(
      'MUSIC_DIR=./music',
      `MUSIC_DIR=${pasta.replaceAll('\\', '/')}`,
    );
    writeFileSync(join(raiz, '.env'), env);
    expect(validarConfiguracao(raiz).achados.filter((a) => a.nivel === 'erro')).toEqual([]);
  });

  it('o .env com BOM (Windows PowerShell 5.1) é lido normalmente', () => {
    const raiz = criarRaiz({});
    const env = readFileSync(join(raiz, '.env'), 'utf8');
    writeFileSync(join(raiz, '.env'), '\ufeff' + env);
    writeFileSync(join(raiz, 'slskd', 'slskd.yml'), '\ufeff' + readFileSync(join(raiz, 'slskd', 'slskd.yml'), 'utf8'));
    expect(validarConfiguracao(raiz).estado).toBe('valida');
  });
});

describe('leitura dos arquivos', () => {
  it('lerEnv: ignora comentários, tira espaços e aspas', () => {
    const m = lerEnv('# comentário\n\nA=1\n  B = "dois"  \nC=\'três\'\nruim sem igual\nD==x\n');
    expect([...m]).toEqual([
      ['A', '1'],
      ['B', 'dois'],
      ['C', 'três'],
      ['D', '=x'],
    ]);
  });

  it('lerChaveSlskd: a do bloco soulbeet, senão a primeira key:', () => {
    expect(lerChaveSlskd('api_keys:\n  outra:\n    key: AAA\n  soulbeet:\n    key: "BBB"\n')).toBe('BBB');
    expect(lerChaveSlskd('api_keys:\n  minha:\n    key: CCC\n')).toBe('CCC');
    expect(lerChaveSlskd('web:\n  disabled: false\n')).toBeNull();
    // sem key dentro do bloco soulbeet, vale a primeira key: do arquivo (como o baixar-lista.ps1)
    expect(lerChaveSlskd('  soulbeet:\n    role: X\n  outra:\n    key: ZZZ\n')).toBe('ZZZ');
  });
});
