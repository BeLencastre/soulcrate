import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entradaDaConfig, entradaVazia, type ConfigEntrada } from '../../src/shared/configuracao';
import {
  ConfigService,
  fsReal,
  normalizarCaminho,
  tzValido,
  type FsConfig,
} from '../../src/main/services/config-service';
import { lerChaveSlskd, lerEnv } from '../../src/main/services/config-validacao';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const DATA = new Date(2026, 9, 7, 14, 30);

let dir: string;
let pastas: { music: string; downloads: string; incomplete: string };

/** Uma pasta do Soulcrate de mentira, com os modelos de verdade (.env.example e slskd.example.yml). */
function montarProjeto(opcoes: { modelos?: boolean } = {}): string {
  const d = mkdtempSync(join(tmpdir(), 'sc-cfg-'));
  mkdirSync(join(d, 'slskd'), { recursive: true });
  writeFileSync(join(d, 'docker-compose.yml'), 'name: soulcrate\n');
  if (opcoes.modelos !== false) {
    copyFileSync(join(RAIZ, '.env.example'), join(d, '.env.example'));
    copyFileSync(join(RAIZ, 'slskd', 'slskd.example.yml'), join(d, 'slskd', 'slskd.example.yml'));
  }
  return d;
}

function servico(contadorChave = { n: 0 }, fs?: FsConfig): ConfigService {
  return new ConfigService({
    ...(fs ? { fs } : {}),
    agora: () => DATA,
    chave: () => `${String(++contadorChave.n).padStart(2, '0')}`.repeat(32),
    tzDoSistema: () => 'America/Sao_Paulo',
  });
}

function entrada(parcial: Partial<ConfigEntrada> = {}): ConfigEntrada {
  return {
    ...entradaVazia({ tz: 'America/Sao_Paulo', pastas }),
    slskUsuario: 'dj_teste',
    slskSenha: 'senha-slsk-123',
    webUsuario: 'admin',
    webSenha: 'senha-web-456',
    ...parcial,
  };
}

beforeEach(() => {
  dir = montarProjeto();
  pastas = {
    music: join(dir, 'music').replace(/\\/g, '/'),
    downloads: join(dir, 'downloads').replace(/\\/g, '/'),
    incomplete: join(dir, 'incomplete').replace(/\\/g, '/'),
  };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const lerArq = (rel: string) => readFileSync(join(dir, rel), 'utf8');

describe('normalizarCaminho', () => {
  it.each([
    ['D:\\Musica\\Soulcrate\\music', 'D:/Musica/Soulcrate/music'],
    ['  "D:\\Música\\"  ', 'D:/Música'],
    ['D:\\', 'D:/'],
    ['./music', './music'],
    ['D://a//b/', 'D:/a/b'],
    ['\\\\servidor\\share\\musica', '//servidor/share/musica'],
    ['', ''],
  ])('%j → %j', (de, para) => {
    expect(normalizarCaminho(de)).toBe(para);
  });
});

describe('tzValido', () => {
  it('aceita fusos IANA e recusa o resto', () => {
    expect(tzValido('America/Sao_Paulo')).toBe(true);
    expect(tzValido('UTC')).toBe(true);
    expect(tzValido('Marte/Olympus')).toBe(false);
    expect(tzValido('')).toBe(false);
    expect(tzValido('America/Sao Paulo')).toBe(false);
  });
});

describe('ler', () => {
  it('pasta sem .env: tudo vazio e as sugestões usam a própria pasta', () => {
    const c = servico().ler(dir);
    expect(c.envExiste).toBe(false);
    expect(c.ymlExiste).toBe(false);
    expect(c.campos.SLSK_PASSWORD).toBe('vazio');
    expect(c.chaveSlskd).toBe('ausente');
    expect(c.sugestoes.pastas.music).toBe(pastas.music);
    expect(c.sugestoes.tz).toBe('America/Sao_Paulo');
  });

  it('com os valores de exemplo do .env.example: mostra exatamente o que falta', () => {
    copyFileSync(join(dir, '.env.example'), join(dir, '.env'));
    copyFileSync(join(dir, 'slskd', 'slskd.example.yml'), join(dir, 'slskd', 'slskd.yml'));
    const c = servico().ler(dir);
    expect(c.envExiste).toBe(true);
    expect(c.campos).toMatchObject({
      SLSK_USERNAME: 'exemplo',
      SLSK_PASSWORD: 'exemplo',
      SLSKD_WEB_PASSWORD: 'exemplo',
      SOULBEET_SECRET_KEY: 'exemplo',
      SLSKD_API_KEY_SOULBEET: 'exemplo',
      PUID: 'ok',
      TZ: 'ok',
      MUSIC_DIR: 'ok',
    });
    expect(c.chaveSlskd).toBe('exemplo');
    // o que é exemplo volta em branco; o que já é de verdade volta como está
    expect(c.slskUsuario).toBe('');
    expect(c.webUsuario).toBe('admin');
    expect(c.pastas.music).toBe('./music');
    expect(c.tz).toBe('America/Sao_Paulo');
    expect(c.abrirParaRede).toBe(false);
  });

  it('nunca devolve senha nem chave', () => {
    writeFileSync(
      join(dir, '.env'),
      'SLSK_USERNAME=dj\nSLSK_PASSWORD=segredo-slsk-xyz\nSLSKD_WEB_PASSWORD=segredo-web-xyz\nSOULBEET_SECRET_KEY=segredo-soulbeet-xyz-0123456789abcdef\nSLSKD_API_KEY_SOULBEET=segredo-api-xyz-0123456789abcdef\n',
    );
    const json = JSON.stringify(servico().ler(dir));
    expect(json).not.toContain('segredo');
  });

  it('as chaves dos dois arquivos: iguais, diferentes ou ausentes', () => {
    const chave = 'k'.repeat(40);
    writeFileSync(join(dir, '.env'), `SLSKD_API_KEY_SOULBEET=${chave}\n`);
    writeFileSync(
      join(dir, 'slskd', 'slskd.yml'),
      `web:\n  authentication:\n    api_keys:\n      soulbeet:\n        key: ${chave}\n`,
    );
    expect(servico().ler(dir).chaveSlskd).toBe('ok');
    writeFileSync(join(dir, '.env'), `SLSKD_API_KEY_SOULBEET=${'x'.repeat(40)}\n`);
    expect(servico().ler(dir).chaveSlskd).toBe('diferentes');
    writeFileSync(join(dir, '.env'), 'SLSKD_API_KEY_SOULBEET=\n');
    expect(servico().ler(dir).chaveSlskd).toBe('ausente');
  });

  it('BIND_ADDR aberto liga a opção de rede; 127.0.0.1 não', () => {
    writeFileSync(join(dir, '.env'), 'BIND_ADDR=0.0.0.0\n');
    expect(servico().ler(dir).abrirParaRede).toBe(true);
    writeFileSync(join(dir, '.env'), 'BIND_ADDR=127.0.0.1\n');
    expect(servico().ler(dir).abrirParaRede).toBe(false);
  });
});

describe('gravar numa pasta nova', () => {
  it('gera os dois arquivos a partir dos modelos e eles passam na conferência S4 (a do subir.bat)', () => {
    const r = servico().gravar(dir, entrada());
    expect(r.erro).toBeNull();
    expect(r.ok).toBe(true);
    expect(r.backups).toEqual([]);
    expect(r.chavesGeradas).toEqual({ soulbeet: true, slskd: true });
    expect(r.pastasCriadas).toHaveLength(3);
    for (const p of [pastas.music, pastas.downloads, pastas.incomplete]) expect(existsSync(p)).toBe(true);
    expect(r.conferencia?.estado).toBe('valida');
    expect(r.conferencia?.erros).toBe(0);

    const env = lerEnv(lerArq('.env'));
    expect(env.get('SLSK_USERNAME')).toBe('dj_teste');
    expect(env.get('SLSK_PASSWORD')).toBe('senha-slsk-123');
    expect(env.get('SLSKD_WEB_USER')).toBe('admin');
    expect(env.get('MUSIC_DIR')).toBe(pastas.music);
    expect(env.get('PUID')).toBe('1000');
  });

  it('a MESMA chave vai no .env e no slskd.yml, e a do Soulbeet é outra', () => {
    servico().gravar(dir, entrada());
    const env = lerEnv(lerArq('.env'));
    const chave = env.get('SLSKD_API_KEY_SOULBEET');
    expect(chave).toBeTruthy();
    expect(lerChaveSlskd(lerArq('slskd/slskd.yml'))).toBe(chave);
    expect(env.get('SOULBEET_SECRET_KEY')).not.toBe(chave);
    expect(env.get('SOULBEET_SECRET_KEY')?.length).toBeGreaterThanOrEqual(32);
  });

  it('preserva os comentários do modelo', () => {
    servico().gravar(dir, entrada());
    expect(lerArq('.env')).toContain('# --- Soulseek (conta da rede Soulseek)');
    expect(lerArq('slskd/slskd.yml')).toContain('# Restringe o uso às redes privadas');
  });

  it('sem os modelos na pasta, usa os de reserva', () => {
    rmSync(join(dir, '.env.example'));
    rmSync(join(dir, 'slskd', 'slskd.example.yml'));
    const r = servico().gravar(dir, entrada());
    expect(r.ok).toBe(true);
    expect(r.conferencia?.estado).toBe('valida');
  });

  it('não deixa arquivos temporários para trás', () => {
    servico().gravar(dir, entrada());
    expect(readdirSync(dir).filter((n) => n.includes('tmp'))).toEqual([]);
    expect(readdirSync(join(dir, 'slskd')).filter((n) => n.includes('tmp'))).toEqual([]);
  });

  it('abrir para a rede liga o BIND_ADDR; o contato do MusicBrainz entra', () => {
    servico().gravar(dir, entrada({ abrirParaRede: true, musicbrainzContato: 'dj@email.com' }));
    const env = lerEnv(lerArq('.env'));
    expect(env.get('BIND_ADDR')).toBe('0.0.0.0');
    expect(env.get('MUSICBRAINZ_CONTATO')).toBe('dj@email.com');
  });
});

describe('gravar sobre arquivos que já existem', () => {
  beforeEach(() => {
    servico().gravar(dir, entrada());
  });

  it('faz backup dos dois com a data e nunca sobrescreve um backup', () => {
    const antes = lerArq('.env');
    const c = servico();
    const r1 = c.gravar(dir, entrada({ slskUsuario: 'outro' }));
    expect(r1.backups).toEqual(['.env.bak-2026-10-07', 'slskd.yml.bak-2026-10-07']);
    expect(readFileSync(join(dir, '.env.bak-2026-10-07'), 'utf8')).toBe(antes);
    const r2 = c.gravar(dir, entrada({ slskUsuario: 'terceiro' }));
    expect(r2.backups).toEqual(['.env.bak-2026-10-07-2', 'slskd.yml.bak-2026-10-07-2']);
    expect(lerEnv(readFileSync(join(dir, '.env.bak-2026-10-07'), 'utf8')).get('SLSK_USERNAME')).toBe('dj_teste');
  });

  it('senha em branco mantém a que está no .env', () => {
    servico().gravar(dir, entrada({ slskSenha: '', webSenha: '', slskUsuario: 'novo_nome' }));
    const env = lerEnv(lerArq('.env'));
    expect(env.get('SLSK_PASSWORD')).toBe('senha-slsk-123');
    expect(env.get('SLSKD_WEB_PASSWORD')).toBe('senha-web-456');
    expect(env.get('SLSK_USERNAME')).toBe('novo_nome');
  });

  it('chaves boas ficam como estão', () => {
    const antes = lerEnv(lerArq('.env'));
    const r = servico().gravar(dir, entrada({ slskSenha: '', webSenha: '' }));
    expect(r.chavesGeradas).toEqual({ soulbeet: false, slskd: false });
    const depois = lerEnv(lerArq('.env'));
    expect(depois.get('SLSKD_API_KEY_SOULBEET')).toBe(antes.get('SLSKD_API_KEY_SOULBEET'));
    expect(depois.get('SOULBEET_SECRET_KEY')).toBe(antes.get('SOULBEET_SECRET_KEY'));
  });

  it('"gerar novas chaves" troca as duas e mantém os arquivos iguais entre si', () => {
    const antes = lerEnv(lerArq('.env'));
    const r = servico({ n: 50 }).gravar(dir, entrada({ slskSenha: '', webSenha: '', regenerarChaves: true }));
    expect(r.chavesGeradas).toEqual({ soulbeet: true, slskd: true });
    const depois = lerEnv(lerArq('.env'));
    expect(depois.get('SLSKD_API_KEY_SOULBEET')).not.toBe(antes.get('SLSKD_API_KEY_SOULBEET'));
    expect(lerChaveSlskd(lerArq('slskd/slskd.yml'))).toBe(depois.get('SLSKD_API_KEY_SOULBEET'));
    expect(r.conferencia?.estado).toBe('valida');
  });

  it('chaves diferentes entre os arquivos: gera uma nova e iguala (o erro CHAVES_DIFERENTES some)', () => {
    writeFileSync(
      join(dir, 'slskd', 'slskd.yml'),
      'web:\n  authentication:\n    api_keys:\n      soulbeet:\n        key: "outra-chave-qualquer-0123456789abcdef"\n',
    );
    expect(servico().ler(dir).chaveSlskd).toBe('diferentes');
    const r = servico({ n: 70 }).gravar(dir, entrada({ slskSenha: '', webSenha: '' }));
    expect(r.chavesGeradas.slskd).toBe(true);
    expect(lerChaveSlskd(lerArq('slskd/slskd.yml'))).toBe(lerEnv(lerArq('.env')).get('SLSKD_API_KEY_SOULBEET'));
  });

  it('só o .env tem uma chave boa: copia para o slskd.yml, sem trocar a chave', () => {
    const chave = lerEnv(lerArq('.env')).get('SLSKD_API_KEY_SOULBEET');
    copyFileSync(join(dir, 'slskd', 'slskd.example.yml'), join(dir, 'slskd', 'slskd.yml'));
    const r = servico().gravar(dir, entrada({ slskSenha: '', webSenha: '' }));
    expect(r.chavesGeradas.slskd).toBe(false);
    expect(lerChaveSlskd(lerArq('slskd/slskd.yml'))).toBe(chave);
  });

  it('preserva o que o usuário acrescentou aos arquivos', () => {
    writeFileSync(join(dir, '.env'), `${lerArq('.env')}MINHA_VARIAVEL=oi\n# anotação minha\n`);
    writeFileSync(
      join(dir, 'slskd', 'slskd.yml'),
      `soulseek:\n  description: meu cantinho # nota\n${lerArq('slskd/slskd.yml')}`,
    );
    servico().gravar(dir, entrada({ slskSenha: '', webSenha: '' }));
    expect(lerArq('.env')).toContain('MINHA_VARIAVEL=oi');
    expect(lerArq('.env')).toContain('# anotação minha');
    expect(lerArq('slskd/slskd.yml')).toContain('description: meu cantinho # nota');
  });

  it('slskd.yml com erro de sintaxe: não grava nada, nem o .env, nem backup', () => {
    writeFileSync(join(dir, 'slskd', 'slskd.yml'), 'web:\n  - a\n b: [\n');
    const envAntes = lerArq('.env');
    const backupsAntes = readdirSync(dir).filter((n) => n.includes('.bak'));
    const r = servico().gravar(dir, entrada({ slskUsuario: 'muda' }));
    expect(r.ok).toBe(false);
    expect(r.erro?.codigo).toBe('config.yml-invalido');
    expect(lerArq('.env')).toBe(envAntes);
    expect(readdirSync(dir).filter((n) => n.includes('.bak'))).toEqual(backupsAntes);
  });

  it('se gravar o segundo arquivo falhar, o primeiro volta ao que era', () => {
    const envAntes = lerArq('.env');
    let escritas = 0;
    const fsQueFalha: FsConfig = {
      ...fsReal,
      escrever(caminho, texto) {
        if (caminho.endsWith('slskd.yml')) throw Object.assign(new Error('disco cheio'), { code: 'ENOSPC' });
        escritas++;
        fsReal.escrever(caminho, texto);
      },
    };
    const r = servico({ n: 0 }, fsQueFalha).gravar(dir, entrada({ slskUsuario: 'vai_voltar' }));
    expect(r.ok).toBe(false);
    expect(r.erro?.codigo).toBe('config.nao-gravou');
    expect(escritas).toBe(2); // o .env novo e a volta ao anterior
    expect(lerArq('.env')).toBe(envAntes);
  });

  it('a senha com caracteres especiais é gravada de um jeito que o Docker e o app leem igual', () => {
    const senha = 'a#b $c "d" \\e';
    servico().gravar(dir, entrada({ slskSenha: senha }));
    expect(lerEnv(lerArq('.env')).get('SLSK_PASSWORD')).toBe(senha);
  });

  it('senha em branco não reescreve a linha: ela fica byte a byte como estava, até com formato estranho', () => {
    const linha = `SLSK_PASSWORD='a#b $c "d"'`;
    writeFileSync(join(dir, '.env'), lerArq('.env').replace(/^SLSK_PASSWORD=.*$/m, linha));
    servico().gravar(dir, entrada({ slskSenha: '', webSenha: '', slskUsuario: 'outro_nome' }));
    expect(lerArq('.env').split(/\r?\n/)).toContain(linha);
    expect(lerEnv(lerArq('.env')).get('SLSK_USERNAME')).toBe('outro_nome');
  });

  it('senha com aspa simples junto de outros símbolos é recusada na validação, sem gravar nada', () => {
    const antes = lerArq('.env');
    const r = servico().gravar(dir, entrada({ slskSenha: `it's #1` }));
    expect(r.ok).toBe(false);
    expect(r.erro?.codigo).toBe('config.invalida');
    expect(r.erro?.detalhes).toContain('SENHA_NAO_SUPORTADA');
    expect(lerArq('.env')).toBe(antes);
  });

  it('senha só com aspa simples no meio é aceita', () => {
    servico().gravar(dir, entrada({ slskSenha: "it's fine" }));
    expect(lerEnv(lerArq('.env')).get('SLSK_PASSWORD')).toBe("it's fine");
  });
});

describe('validar', () => {
  it('uma entrada boa não tem erros', () => {
    const v = servico().validar(dir, entrada());
    expect(v.ok).toBe(true);
    expect(v.achados.filter((a) => a.nivel === 'erro')).toEqual([]);
    expect(v.mesmoDisco).toBe(true);
    expect(v.pastas.music.estado).toBe('sera-criada');
  });

  it('o assistente de uma pasta com .env de exemplo exige o que falta', () => {
    copyFileSync(join(dir, '.env.example'), join(dir, '.env'));
    const base = entradaDaConfig(servico().ler(dir));
    const v = servico().validar(dir, base);
    const ids = v.achados.filter((a) => a.nivel === 'erro').map((a) => `${a.id}:${a.campo}`);
    expect(ids).toEqual(
      expect.arrayContaining([
        'SLSK_USUARIO_VAZIO:slskUsuario',
        'SLSK_SENHA_VAZIA:slskSenha',
        'WEB_SENHA_VAZIA:webSenha',
      ]),
    );
    expect(v.ok).toBe(false);
  });

  it('com a senha já configurada, deixá-la em branco vale', () => {
    servico().gravar(dir, entrada());
    const v = servico().validar(dir, entrada({ slskSenha: '', webSenha: '' }));
    expect(v.ok).toBe(true);
  });

  it.each([
    [{ slskUsuario: '' }, 'SLSK_USUARIO_VAZIO'],
    [{ slskUsuario: 'seu_usuario_soulseek' }, 'ENV_EXEMPLO'],
    [{ slskSenha: 'sua_senha_soulseek' }, 'ENV_EXEMPLO'],
    [{ webUsuario: '  ' }, 'WEB_USUARIO_VAZIO'],
    [{ slskSenha: 'a\nb' }, 'SENHA_COM_QUEBRA'],
    [{ tz: 'Marte/Olympus' }, 'TZ_INVALIDO'],
    [{ puid: 'abc' }, 'ID_INVALIDO'],
    [{ pgid: '' }, 'ID_INVALIDO'],
  ] as [Partial<ConfigEntrada>, string][])('%j → erro %s', (parcial, id) => {
    const v = servico().validar(dir, entrada(parcial));
    expect(v.achados.some((a) => a.nivel === 'erro' && a.id === id)).toBe(true);
    expect(v.ok).toBe(false);
  });

  it('senha da Web UI curta e contato estranho são só avisos', () => {
    const v = servico().validar(dir, entrada({ webSenha: 'curta', musicbrainzContato: 'isto não é contato' }));
    expect(v.ok).toBe(true);
    expect(v.achados.map((a) => a.id)).toEqual(expect.arrayContaining(['WEB_SENHA_CURTA', 'CONTATO_ESTRANHO']));
  });

  it('pasta vazia, inválida ou que é um arquivo', () => {
    writeFileSync(join(dir, 'arquivo.txt'), 'x');
    const v = servico().validar(
      dir,
      entrada({ pastas: { music: '', downloads: 'D:/a?b', incomplete: join(dir, 'arquivo.txt') } }),
    );
    expect(v.achados.filter((a) => a.nivel === 'erro').map((a) => a.id)).toEqual(
      expect.arrayContaining(['PASTA_VAZIA', 'PASTA_INVALIDA', 'PASTA_E_ARQUIVO']),
    );
  });

  it('pastas repetidas são erro', () => {
    const v = servico().validar(
      dir,
      entrada({
        pastas: { music: pastas.music, downloads: pastas.music.toUpperCase(), incomplete: pastas.incomplete },
      }),
    );
    expect(v.achados.some((a) => a.id === 'PASTAS_IGUAIS')).toBe(true);
  });

  it('caminho com barra invertida é aceito e gravado com barras normais', () => {
    const musica = pastas.music.replace(/\//g, '\\');
    const v = servico().validar(dir, entrada({ pastas: { ...pastas, music: musica } }));
    expect(v.ok).toBe(true);
    expect(v.pastas.music.gravar).toBe(pastas.music);
  });

  it('caminho relativo vale a partir da pasta do Soulcrate', () => {
    const v = servico().validar(
      dir,
      entrada({ pastas: { music: './music', downloads: './downloads', incomplete: './incomplete' } }),
    );
    expect(v.ok).toBe(true);
    expect(v.pastas.music.absoluto.toLowerCase()).toBe(join(dir, 'music').toLowerCase());
    expect(v.pastas.music.gravar).toBe('./music');
  });

  it('pasta existente aparece como "existe", com o espaço livre', () => {
    mkdirSync(pastas.music, { recursive: true });
    const v = servico().validar(dir, entrada());
    expect(v.pastas.music.estado).toBe('existe');
    expect(v.pastas.music.livreBytes).toBeGreaterThan(0);
  });
});

/** Um sistema de arquivos de mentira: só os caminhos listados existem, e cada disco tem o seu espaço. */
function fsFalso(existentes: string[], livre = 400 * 1024 ** 3): FsConfig {
  const norm = (p: string) => p.replace(/\//g, '\\').toLowerCase().replace(/\\$/, '');
  const conj = new Set(existentes.map(norm));
  return {
    ...fsReal,
    existe: (p) => conj.has(norm(p)),
    ehPasta: (p) => conj.has(norm(p)),
    ehArquivo: () => false,
    espaco: () => ({ livre, total: livre * 2 }),
  };
}

describe('validar: discos, OneDrive e rede (SP8)', () => {
  const base = 'C:\\Projeto';
  const discos = [
    'C:',
    'D:',
    'C:\\Projeto',
    'C:\\Users',
    'C:\\Users\\dj',
    'C:\\Users\\dj\\OneDrive',
    'D:\\Musica',
    'D:\\Musica\\Soulcrate',
  ];

  it('downloads em outro disco: aviso e mesmoDisco = false', () => {
    const v = servico({ n: 0 }, fsFalso(discos)).validar(
      base,
      entrada({
        pastas: {
          music: 'D:/Musica/Soulcrate/music',
          downloads: 'C:/Downloads',
          incomplete: 'D:/Musica/Soulcrate/incomplete',
        },
      }),
    );
    expect(v.mesmoDisco).toBe(false);
    expect(v.achados.some((a) => a.id === 'PASTAS_DISCOS_DIFERENTES' && a.nivel === 'aviso')).toBe(true);
  });

  it('mesmo disco, em maiúsculas ou minúsculas', () => {
    const v = servico({ n: 0 }, fsFalso(discos)).validar(
      base,
      entrada({
        pastas: {
          music: 'D:/Musica/Soulcrate/music',
          downloads: 'd:/musica/soulcrate/downloads',
          incomplete: 'D:/Musica/Soulcrate/incomplete',
        },
      }),
    );
    expect(v.mesmoDisco).toBe(true);
    expect(v.pastas.music.disco).toBe('D:');
  });

  it('pasta no OneDrive: aviso e sugestão ao lado da biblioteca', () => {
    const v = servico({ n: 0 }, fsFalso(discos)).validar(
      base,
      entrada({
        pastas: {
          music: 'D:/Musica/Soulcrate/music',
          downloads: 'D:/Musica/Soulcrate/downloads',
          incomplete: 'C:/Users/dj/OneDrive/Soulcrate/incomplete',
        },
      }),
    );
    const onedrive = v.achados.find((a) => a.id === 'PASTA_ONEDRIVE');
    expect(onedrive?.campo).toBe('pasta.incomplete');
    expect(onedrive?.nivel).toBe('aviso');
    expect(v.pastas.incomplete.onedrive).toBe(true);
    expect(v.pastas.incomplete.sugestao?.toLowerCase()).toBe('d:/musica/soulcrate/incomplete');
    expect(v.ok).toBe(true);
  });

  it('o OneDrive com o nome da conta ("OneDrive - Empresa") também é detectado', () => {
    const v = servico({ n: 0 }, fsFalso([...discos, 'C:\\Users\\dj\\OneDrive - Empresa'])).validar(
      base,
      entrada({ pastas: { music: 'C:/Users/dj/OneDrive - Empresa/Musica', downloads: 'D:/d', incomplete: 'D:/i' } }),
    );
    expect(v.pastas.music.onedrive).toBe(true);
    expect(v.pastas.music.sugestao).toBeNull(); // a biblioteca não tem alternativa óbvia
  });

  it('disco que não existe: erro', () => {
    const v = servico({ n: 0 }, fsFalso(discos)).validar(
      base,
      entrada({
        pastas: {
          music: 'Z:/Musica',
          downloads: 'D:/Musica/Soulcrate/downloads',
          incomplete: 'D:/Musica/Soulcrate/incomplete',
        },
      }),
    );
    expect(v.achados.some((a) => a.id === 'PASTA_DISCO_AUSENTE' && a.campo === 'pasta.music')).toBe(true);
    expect(v.ok).toBe(false);
  });

  it('pasta de rede (UNC): aviso', () => {
    const v = servico({ n: 0 }, fsFalso([...discos, '\\\\servidor\\share'])).validar(
      base,
      entrada({
        pastas: {
          music: '//servidor/share/musica',
          downloads: 'D:/Musica/Soulcrate/downloads',
          incomplete: 'D:/Musica/Soulcrate/incomplete',
        },
      }),
    );
    expect(v.pastas.music.rede).toBe(true);
    expect(v.achados.some((a) => a.id === 'PASTA_REDE')).toBe(true);
  });

  it('pouco espaço livre na biblioteca: aviso', () => {
    const v = servico({ n: 0 }, fsFalso(discos, 3 * 1024 ** 3)).validar(
      base,
      entrada({
        pastas: {
          music: 'D:/Musica/Soulcrate/music',
          downloads: 'D:/Musica/Soulcrate/downloads',
          incomplete: 'D:/Musica/Soulcrate/incomplete',
        },
      }),
    );
    expect(v.achados.some((a) => a.id === 'POUCO_ESPACO')).toBe(true);
    expect(v.ok).toBe(true);
  });
});
