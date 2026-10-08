// Critério de aceite da Fase 2: "o subir.bat aceita os arquivos gerados pelo app sem reclamar". O subir.bat chama o
// validar-config.ps1; aqui o script de verdade confere o .env e o slskd.yml que o ConfigService gera.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entradaVazia } from '../../src/shared/configuracao';
import { ConfigService } from '../../src/main/services/config-service';

const REPO = join(import.meta.dirname, '..', '..', '..');
const SCRIPT = join(REPO, 'validar-config.ps1');

const temPowerShell =
  process.platform === 'win32' && spawnSync('powershell', ['-NoProfile', '-Command', '1']).status === 0;

interface SaidaValidador {
  codigo: number | null;
  ok: boolean;
  erros: number;
  avisos: number;
  achados: { id: string; nivel: string; variavel: string | null }[];
}

function validarComOScript(raiz: string): SaidaValidador {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Raiz', raiz, '-Json'],
    { encoding: 'utf8' },
  );
  const json = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))) as Omit<SaidaValidador, 'codigo'>;
  return { codigo: r.status, ...json };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sc-ps-'));
  mkdirSync(join(dir, 'slskd'), { recursive: true });
  copyFileSync(join(REPO, '.env.example'), join(dir, '.env.example'));
  copyFileSync(join(REPO, 'slskd', 'slskd.example.yml'), join(dir, 'slskd', 'slskd.example.yml'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const pastas = () => ({
  music: join(dir, 'musica com espaço').replace(/\\/g, '/'),
  downloads: join(dir, 'downloads').replace(/\\/g, '/'),
  incomplete: join(dir, 'incomplete').replace(/\\/g, '/'),
});

describe.skipIf(!temPowerShell)('validar-config.ps1 (o do subir.bat) aceita o que o app gera', () => {
  it('controle: o .env.example puro é recusado pelo script (o teste enxerga problemas)', () => {
    copyFileSync(join(dir, '.env.example'), join(dir, '.env'));
    copyFileSync(join(dir, 'slskd', 'slskd.example.yml'), join(dir, 'slskd', 'slskd.yml'));
    const r = validarComOScript(dir);
    expect(r.codigo).toBe(1);
    expect(r.erros).toBeGreaterThan(0);
  });

  it('configuração nova: código 0, sem erros e sem avisos', () => {
    const svc = new ConfigService({ tzDoSistema: () => 'America/Sao_Paulo' });
    const r = svc.gravar(dir, {
      ...entradaVazia({ tz: 'America/Sao_Paulo', pastas: pastas() }),
      slskUsuario: 'dj_teste',
      slskSenha: 'senha-slsk-123',
      webSenha: 'senha-web-456',
    });
    expect(r.ok).toBe(true);
    const v = validarComOScript(dir);
    expect(v).toMatchObject({ codigo: 0, ok: true, erros: 0, avisos: 0 });
  });

  it('senhas com caracteres especiais (#, $, aspas) não confundem o script', () => {
    const svc = new ConfigService({ tzDoSistema: () => 'America/Sao_Paulo' });
    svc.gravar(dir, {
      ...entradaVazia({ tz: 'America/Sao_Paulo', pastas: pastas() }),
      slskUsuario: 'dj_teste',
      slskSenha: `a#b $c "d" \\e`,
      webSenha: 'senha #$ com "aspas"',
    });
    expect(validarComOScript(dir)).toMatchObject({ codigo: 0, ok: true, erros: 0 });
  });

  it('regravar com chaves novas continua válido (as duas chaves seguem iguais)', () => {
    const svc = new ConfigService({ tzDoSistema: () => 'America/Sao_Paulo' });
    const base = {
      ...entradaVazia({ tz: 'America/Sao_Paulo', pastas: pastas() }),
      slskUsuario: 'dj_teste',
      slskSenha: 'senha-slsk-123',
      webSenha: 'senha-web-456',
    };
    svc.gravar(dir, base);
    svc.gravar(dir, { ...base, slskSenha: '', webSenha: '', regenerarChaves: true, abrirParaRede: true });
    expect(validarComOScript(dir)).toMatchObject({ codigo: 0, ok: true, erros: 0 });
  });

  it('um .env de exemplo "reparado" pelo assistente (só os campos que faltavam) passa', () => {
    copyFileSync(join(dir, '.env.example'), join(dir, '.env'));
    copyFileSync(join(dir, 'slskd', 'slskd.example.yml'), join(dir, 'slskd', 'slskd.yml'));
    const svc = new ConfigService({ tzDoSistema: () => 'America/Sao_Paulo' });
    const lido = svc.ler(dir);
    expect(lido.campos.SLSK_USERNAME).toBe('exemplo');
    const r = svc.gravar(dir, {
      ...entradaVazia({ tz: 'America/Sao_Paulo', pastas: pastas() }),
      slskUsuario: 'dj_teste',
      slskSenha: 'senha-slsk-123',
      webSenha: 'senha-web-456',
    });
    expect(r.backups).toHaveLength(2);
    expect(validarComOScript(dir)).toMatchObject({ codigo: 0, ok: true, erros: 0 });
  });
});
