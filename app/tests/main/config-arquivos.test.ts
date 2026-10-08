import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  atualizarEnv,
  dataParaBackup,
  definirChaveSlskd,
  definirVariavelEnv,
  formatarValorEnv,
  gerarChave,
  nomeDoBackup,
  ValorInvalidoError,
  YmlInvalidoError,
} from '../../src/main/services/config-arquivos';
import { lerChaveSlskd, lerEnv } from '../../src/main/services/config-validacao';

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const modelo = (arquivo: string) => readFileSync(join(RAIZ, arquivo), 'utf8');

describe('gerarChave', () => {
  it('são 32 bytes em hexadecimal (64 caracteres), e cada chamada dá uma chave diferente', () => {
    const a = gerarChave();
    const b = gerarChave();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('usa a fonte de bytes aleatórios que recebe', () => {
    expect(gerarChave(() => Buffer.alloc(32, 0xab))).toBe('ab'.repeat(32));
  });
});

describe('formatarValorEnv', () => {
  it.each([
    ['D:/Música/Meus Sets', 'D:/Música/Meus Sets'],
    ['abc123XYZ', 'abc123XYZ'],
    ['seu@email.com', 'seu@email.com'],
    ['', ''],
  ])('%j vai puro', (valor, esperado) => {
    expect(formatarValorEnv(valor)).toBe(esperado);
  });

  it.each([
    ['senha#forte', "'senha#forte'"],
    ['pa$$word', "'pa$$word'"],
    ['a"b', `'a"b'`],
    ['tem\\barra', "'tem\\barra'"],
    [' espaço no começo', "' espaço no começo'"],
    ['no fim ', "'no fim '"],
  ])('%j vai entre aspas simples', (valor, esperado) => {
    expect(formatarValorEnv(valor)).toBe(esperado);
  });

  it('aspa simples no meio do valor vai pura; misturada com outros símbolos, é recusada (não há como escapar)', () => {
    expect(formatarValorEnv("it's ok")).toBe("it's ok");
    expect(() => formatarValorEnv(`it's $x`)).toThrow(ValorInvalidoError);
    expect(() => formatarValorEnv(`'começa com aspa`)).toThrow(ValorInvalidoError);
  });

  it('recusa quebra de linha', () => {
    expect(() => formatarValorEnv('a\nb')).toThrow(ValorInvalidoError);
    expect(() => formatarValorEnv('a\rb')).toThrow(ValorInvalidoError);
  });

  it('o que escreve é lido de volta igual', () => {
    for (const v of ['simples', 'com espaço', 'tem#hash', 'pa$$', 'D:/x y/z', 'a"b', "it's ok", 'tem\\barra']) {
      const lido = lerEnv(`K=${formatarValorEnv(v)}\n`).get('K');
      expect(lido).toBe(v);
    }
  });
});

describe('definirVariavelEnv', () => {
  it('troca o valor de uma variável ativa e preserva o resto', () => {
    const t = '# comentário\nPUID=1000\nTZ=America/Sao_Paulo\n';
    expect(definirVariavelEnv(t, 'TZ', 'Europe/Lisbon')).toBe('# comentário\nPUID=1000\nTZ=Europe/Lisbon\n');
  });

  it('ocupa o lugar da linha comentada do modelo', () => {
    const t = '# nota\n# BIND_ADDR=0.0.0.0\nX=1\n';
    expect(definirVariavelEnv(t, 'BIND_ADDR', '0.0.0.0')).toBe('# nota\nBIND_ADDR=0.0.0.0\nX=1\n');
  });

  it('acrescenta no fim quando não há a variável nem o comentário', () => {
    expect(definirVariavelEnv('A=1\n', 'B', '2')).toBe('A=1\nB=2\n');
    expect(definirVariavelEnv('A=1', 'B', '2')).toBe('A=1\nB=2');
  });

  it('um .env vazio ganha a linha com o fim de linha', () => {
    expect(definirVariavelEnv('', 'A', '1')).toBe('A=1\n');
  });

  it('com valor null, a linha ativa volta a ser comentário', () => {
    expect(definirVariavelEnv('A=1\nBIND_ADDR=0.0.0.0\n', 'BIND_ADDR', null, { exemploComentado: '0.0.0.0' })).toBe(
      'A=1\n# BIND_ADDR=0.0.0.0\n',
    );
  });

  it('com valor null e sem linha ativa, não muda nada', () => {
    const t = '# BIND_ADDR=0.0.0.0\nA=1\n';
    expect(definirVariavelEnv(t, 'BIND_ADDR', null)).toBe(t);
  });

  it('variável repetida: a última vale e as anteriores saem', () => {
    expect(definirVariavelEnv('A=1\nB=x\nA=2\n', 'A', '3')).toBe('B=x\nA=3\n');
  });

  it('mantém o fim de linha do arquivo (CRLF)', () => {
    expect(definirVariavelEnv('A=1\r\nB=2\r\n', 'A', '9')).toBe('A=9\r\nB=2\r\n');
    expect(definirVariavelEnv('A=1\r\n', 'C', '3')).toBe('A=1\r\nC=3\r\n');
  });

  it('não confunde variáveis com o mesmo prefixo', () => {
    expect(definirVariavelEnv('TZ_EXTRA=1\nTZ=2\n', 'TZ', '3')).toBe('TZ_EXTRA=1\nTZ=3\n');
    expect(definirVariavelEnv('SLSKD_WEB_USER=a\n', 'SLSKD_WEB', 'x')).toBe('SLSKD_WEB_USER=a\nSLSKD_WEB=x\n');
  });

  it('tira o BOM do começo', () => {
    expect(atualizarEnv('\uFEFFA=1\n', { A: '2' })).toBe('A=2\n');
  });
});

describe('atualizarEnv com o .env.example de verdade', () => {
  const exemplo = modelo('.env.example');

  it('preserva todos os comentários e só muda as linhas pedidas', () => {
    const t = atualizarEnv(exemplo, { SLSK_USERNAME: 'dj_x', SLSK_PASSWORD: 's3nha' });
    const linhas = (s: string) => s.split(/\r?\n/);
    const antes = linhas(exemplo);
    const depois = linhas(t);
    expect(depois).toHaveLength(antes.length);
    const diferentes = antes.flatMap((l, i) => (l === depois[i] ? [] : [`${l} -> ${depois[i]}`]));
    expect(diferentes).toEqual([
      'SLSK_USERNAME=seu_usuario_soulseek -> SLSK_USERNAME=dj_x',
      'SLSK_PASSWORD=sua_senha_soulseek -> SLSK_PASSWORD=s3nha',
    ]);
  });

  it('liga e desliga o BIND_ADDR e o contato do MusicBrainz sem perder o modelo', () => {
    const ligado = atualizarEnv(
      exemplo,
      { BIND_ADDR: '0.0.0.0', MUSICBRAINZ_CONTATO: 'dj@email.com' },
      { BIND_ADDR: '0.0.0.0' },
    );
    const env = lerEnv(ligado);
    expect(env.get('BIND_ADDR')).toBe('0.0.0.0');
    expect(env.get('MUSICBRAINZ_CONTATO')).toBe('dj@email.com');

    const desligado = atualizarEnv(ligado, { BIND_ADDR: null, MUSICBRAINZ_CONTATO: null }, { BIND_ADDR: '0.0.0.0' });
    expect(lerEnv(desligado).has('BIND_ADDR')).toBe(false);
    expect(desligado).toContain('# BIND_ADDR=0.0.0.0');
    expect(lerEnv(desligado).has('MUSICBRAINZ_CONTATO')).toBe(false);
  });
});

describe('definirChaveSlskd', () => {
  const exemplo = modelo('slskd/slskd.example.yml');

  it('troca só a chave e mantém os comentários e o resto do arquivo', () => {
    const chave = 'a'.repeat(64);
    const t = definirChaveSlskd(exemplo, chave);
    expect(lerChaveSlskd(t)).toBe(chave);
    expect(t).toContain('# slskd.example.yml');
    expect(t).toContain('# A mesma chave vai no .env -> SLSKD_API_KEY_SOULBEET');
    expect(t).toContain('role: ReadWrite');
    expect(t).toContain('cidr: 172.16.0.0/12,10.0.0.0/8,192.168.0.0/16');
    expect(t).not.toContain('TROQUE_POR_UMA_CHAVE_ALEATORIA\n        # Chaves');
  });

  it('uma chave só de dígitos continua texto (aspas duplas), não vira número', () => {
    const t = definirChaveSlskd(exemplo, '1234567890123456');
    expect(t).toContain('key: "1234567890123456"');
    expect(lerChaveSlskd(t)).toBe('1234567890123456');
  });

  it('preserva configurações que o usuário pôs no arquivo', () => {
    const t = definirChaveSlskd(`# meu\nsoulseek:\n  description: oi # nota\n${exemplo}`, 'k'.repeat(40));
    expect(t).toContain('soulseek:');
    expect(t).toContain('description: oi # nota');
    expect(t).toContain('# meu');
  });

  it('cria a entrada quando o arquivo não tem a do soulbeet (com a função e a rede privada)', () => {
    const t = definirChaveSlskd('web:\n  port: 5030\n', 'z'.repeat(40));
    expect(t).toContain('port: 5030');
    expect(lerChaveSlskd(t)).toBe('z'.repeat(40));
    expect(t).toContain('role: ReadWrite');
    expect(t).toContain('cidr:');
  });

  it('um arquivo vazio vira um arquivo com a chave', () => {
    expect(lerChaveSlskd(definirChaveSlskd('', 'y'.repeat(40)))).toBe('y'.repeat(40));
  });

  it('mantém CRLF quando o arquivo usa CRLF', () => {
    const t = definirChaveSlskd(exemplo.replace(/\r?\n/g, '\r\n'), 'a'.repeat(40));
    expect(t.split('\r\n').length).toBeGreaterThan(5);
    expect(t.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('recusa YAML com erro de sintaxe, sem inventar nada', () => {
    expect(() => definirChaveSlskd('web:\n  - a\n b: [\n', 'k'.repeat(40))).toThrow(YmlInvalidoError);
  });
});

describe('nome do backup', () => {
  const dia = new Date(2026, 9, 7, 14, 30);

  it('usa a data local no formato do protótipo', () => {
    expect(dataParaBackup(dia)).toBe('2026-10-07');
    expect(nomeDoBackup('.env', dia, () => false)).toBe('.env.bak-2026-10-07');
  });

  it('nunca sobrescreve: acrescenta -2, -3…', () => {
    const existentes = new Set(['.env.bak-2026-10-07', '.env.bak-2026-10-07-2']);
    expect(nomeDoBackup('.env', dia, (n) => existentes.has(n))).toBe('.env.bak-2026-10-07-3');
  });
});
