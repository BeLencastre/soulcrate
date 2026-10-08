import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../src/main/services/config-service';
import { instalarStack, PastaService } from '../../src/main/services/pasta-service';
import { ARQUIVO_MANIFESTO, ARQUIVOS_DA_STACK, PASTAS_DA_STACK, type Manifesto } from '../../src/shared/stack-arquivos';

const REPO = join(import.meta.dirname, '..', '..', '..');
const ARQUIVOS_DO_USUARIO = [
  '.env',
  'slskd/slskd.yml',
  'lista.txt',
  'lotes',
  'music',
  'downloads',
  'incomplete',
  'navidrome',
];

let raiz: string;
beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sc-pasta-'));
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

const manifesto = (dir: string) =>
  JSON.parse(readFileSync(join(dir, ...ARQUIVO_MANIFESTO.split('/')), 'utf8')) as Manifesto;

describe('lista dos arquivos da stack', () => {
  it('todos existem no repositório (a lista não anda atrás do que o projeto tem)', () => {
    const faltando = ARQUIVOS_DA_STACK.filter((a) => !existsSync(join(REPO, a)));
    expect(faltando).toEqual([]);
  });

  it('nunca inclui arquivos do usuário', () => {
    for (const a of ARQUIVOS_DA_STACK) {
      for (const proibido of ARQUIVOS_DO_USUARIO) {
        expect(a === proibido || a.startsWith(`${proibido}/`)).toBe(false);
      }
    }
    expect(ARQUIVOS_DA_STACK).not.toContain('slskd/slskd.yml');
  });

  it('o compose referencia o que a lista traz (Dockerfile, config do beets, plugin)', () => {
    for (const a of [
      'docker-compose.yml',
      'soulbeet/Dockerfile',
      'soulbeet/config/config.yaml',
      'soulbeet/beets-plugins/keepmix.py',
    ]) {
      expect(ARQUIVOS_DA_STACK).toContain(a);
    }
    expect(PASTAS_DA_STACK).toContain('soulbeet/data');
  });
});

describe('instalarStack', () => {
  it('copia tudo para uma pasta nova, byte a byte, e guarda os hashes no manifesto', () => {
    const destino = join(raiz, 'Soulcrate');
    const r = instalarStack({ origem: REPO, destino });
    expect(r.ausentes).toEqual([]);
    expect(r.copiados.sort()).toEqual([...ARQUIVOS_DA_STACK].sort());
    for (const a of ARQUIVOS_DA_STACK) {
      expect(readFileSync(join(destino, a)).equals(readFileSync(join(REPO, a)))).toBe(true);
    }
    for (const p of PASTAS_DA_STACK) expect(existsSync(join(destino, p))).toBe(true);
    const m = manifesto(destino);
    expect(Object.keys(m.arquivos).sort()).toEqual([...ARQUIVOS_DA_STACK].sort());
    expect(m.versaoDaStack).toBe(readFileSync(join(REPO, 'VERSION'), 'utf8').trim());
    expect(m.arquivos['docker-compose.yml']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('não copia o .env, o slskd.yml nem nada do usuário, mesmo que existam na origem', () => {
    const origem = mkdtempSync(join(raiz, 'origem-'));
    for (const a of ARQUIVOS_DA_STACK) {
      mkdirSync(join(origem, a, '..'), { recursive: true });
      writeFileSync(join(origem, a), `conteudo de ${a}`);
    }
    writeFileSync(join(origem, '.env'), 'SLSK_PASSWORD=segredo');
    writeFileSync(join(origem, 'lista.txt'), 'minha lista');
    mkdirSync(join(origem, 'music'));
    writeFileSync(join(origem, 'slskd', 'slskd.yml'), 'key: segredo');
    const destino = join(raiz, 'destino');
    instalarStack({ origem, destino });
    expect(existsSync(join(destino, '.env'))).toBe(false);
    expect(existsSync(join(destino, 'lista.txt'))).toBe(false);
    expect(existsSync(join(destino, 'music'))).toBe(false);
    expect(existsSync(join(destino, 'slskd', 'slskd.yml'))).toBe(false);
  });

  it('rodar de novo não mexe em nada; um arquivo editado pelo usuário é mantido (e fora do manifesto)', () => {
    const destino = join(raiz, 'Soulcrate');
    instalarStack({ origem: REPO, destino });
    writeFileSync(join(destino, 'soulbeet', 'config', 'config.yaml'), '# meu beets\n');
    rmSync(join(destino, ...ARQUIVO_MANIFESTO.split('/')));

    const r = instalarStack({ origem: REPO, destino });
    expect(r.copiados).toEqual([]);
    expect(r.mantidos).toEqual(['soulbeet/config/config.yaml']);
    expect(readFileSync(join(destino, 'soulbeet', 'config', 'config.yaml'), 'utf8')).toBe('# meu beets\n');
    expect(manifesto(destino).arquivos['soulbeet/config/config.yaml']).toBeUndefined();
    expect(manifesto(destino).arquivos['docker-compose.yml']).toBeDefined();
  });

  it('aproveita um arquivo ausente: copia só o que falta', () => {
    const destino = join(raiz, 'Soulcrate');
    instalarStack({ origem: REPO, destino });
    rmSync(join(destino, 'validar-config.ps1'));
    const r = instalarStack({ origem: REPO, destino });
    expect(r.copiados).toEqual(['validar-config.ps1']);
  });

  it('um manifesto corrompido não impede a instalação', () => {
    const destino = join(raiz, 'Soulcrate');
    mkdirSync(join(destino, '.soulcrate'), { recursive: true });
    writeFileSync(join(destino, ...ARQUIVO_MANIFESTO.split('/')), '{ isso não é json');
    expect(() => instalarStack({ origem: REPO, destino })).not.toThrow();
    expect(Object.keys(manifesto(destino).arquivos)).toHaveLength(ARQUIVOS_DA_STACK.length);
  });
});

describe('PastaService.preparar', () => {
  const servico = (origemStack: string | null = REPO) =>
    new PastaService({ config: new ConfigService({ tzDoSistema: () => 'America/Sao_Paulo' }), origemStack });

  it('pasta nova: copia a stack e devolve a configuração vazia da pasta', () => {
    const destino = join(raiz, 'Soulcrate');
    const r = servico().preparar({ modo: 'nova', caminho: destino });
    expect(r.ok).toBe(true);
    expect(r.dir).toBe(destino);
    expect(r.jaExistia).toBe(false);
    expect(r.copiados).toBe(ARQUIVOS_DA_STACK.length);
    expect(r.config?.envExiste).toBe(false);
    expect(r.config?.sugestoes.pastas.music.endsWith('/Soulcrate/music')).toBe(true);
    expect(existsSync(join(destino, 'docker-compose.yml'))).toBe(true);
  });

  it('é idempotente: repetir o passo 1 não copia de novo', () => {
    const destino = join(raiz, 'Soulcrate');
    servico().preparar({ modo: 'nova', caminho: destino });
    const r = servico().preparar({ modo: 'nova', caminho: destino });
    expect(r.ok).toBe(true);
    expect(r.copiados).toBe(0);
    expect(r.jaExistia).toBe(true);
  });

  it('pasta existente: confere o docker-compose.yml e não copia nada', () => {
    const existente = join(raiz, 'clone');
    mkdirSync(existente);
    writeFileSync(join(existente, 'docker-compose.yml'), 'name: soulcrate\n');
    const r = servico().preparar({ modo: 'existente', caminho: existente });
    expect(r.ok).toBe(true);
    expect(r.copiados).toBe(0);
    expect(r.jaExistia).toBe(true);
    expect(existsSync(join(existente, 'VERSION'))).toBe(false);
  });

  it('pasta existente sem o docker-compose.yml é recusada', () => {
    const vazia = join(raiz, 'vazia');
    mkdirSync(vazia);
    const r = servico().preparar({ modo: 'existente', caminho: vazia });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('docker-compose.yml');
  });

  it('pasta existente que não existe é recusada', () => {
    expect(servico().preparar({ modo: 'existente', caminho: join(raiz, 'nao-existe') }).erro).toBe(
      'Essa pasta não existe.',
    );
  });

  it.each([
    ['', 'Escolha uma pasta.'],
    ['Soulcrate', 'Informe o caminho completo'],
  ])('caminho %j é recusado', (caminho, trecho) => {
    const r = servico().preparar({ modo: 'nova', caminho });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain(trecho);
  });

  it('um arquivo no lugar da pasta é recusado', () => {
    const arq = join(raiz, 'arquivo.txt');
    writeFileSync(arq, 'x');
    expect(servico().preparar({ modo: 'nova', caminho: arq }).erro).toContain('arquivo');
  });

  it('a raiz do disco é recusada', () => {
    const disco = raiz.slice(0, 3);
    expect(servico().preparar({ modo: 'nova', caminho: disco }).erro).toContain('disco inteiro');
  });

  it('sem os recursos da stack no app, devolve uma falha explicada (sem criar pasta pela metade)', () => {
    const r = servico(null).preparar({ modo: 'nova', caminho: join(raiz, 'Soulcrate') });
    expect(r.ok).toBe(false);
    expect(r.falha?.codigo).toBe('pasta.nao-instalou');
    expect(existsSync(join(raiz, 'Soulcrate'))).toBe(false);
  });

  it('pasta com espaço e acento no caminho', () => {
    const destino = join(raiz, 'Música do DJ', 'Soul crate');
    const r = servico().preparar({ modo: 'nova', caminho: destino });
    expect(r.ok).toBe(true);
    expect(existsSync(join(destino, 'docker-compose.yml'))).toBe(true);
  });
});
