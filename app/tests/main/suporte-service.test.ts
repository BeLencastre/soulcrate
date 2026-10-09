import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodificarLog,
  envSemSegredos,
  nomeSugeridoDoPacote,
  redigirValores,
  SuporteService,
  valoresSecretos,
  type DependenciasSuporte,
} from '../../src/main/services/suporte-service';
import { SETTINGS_PADRAO } from '../../src/main/services/app-settings';
import { statusInicial } from '../../src/shared/stack';
import type { InfoSobre } from '../../src/shared/sobre';
import { lerZip } from './ajudantes-zip';

// os "segredos" desta máquina de mentira: nenhum deles pode aparecer em lugar nenhum do pacote
const SENHA_SLSK = 'senha-do-soulseek-9f3a';
const SENHA_WEB = 'outra-senha-web-77bd';
const CHAVE_SECRETA = '0123456789abcdef0123456789abcdef0123456789abcdef';
const CHAVE_API = 'abcdef0123456789abcdef0123456789';
const SEGREDOS = [SENHA_SLSK, SENHA_WEB, CHAVE_SECRETA, CHAVE_API];

const ENV = [
  'PUID=1000',
  'TZ=America/Sao_Paulo',
  'MUSIC_DIR=D:/Musica/music',
  'SLSK_USERNAME=dj_teste',
  `SLSK_PASSWORD=${SENHA_SLSK}`,
  'SLSKD_WEB_USER=admin',
  `SLSKD_WEB_PASSWORD=${SENHA_WEB}`,
  `SOULBEET_SECRET_KEY=${CHAVE_SECRETA}`,
  `SLSKD_API_KEY_SOULBEET=${CHAVE_API}`,
  '',
].join('\r\n');

const YML = `web:
  authentication:
    username: admin
    password: ${SENHA_WEB}
    api_keys:
      soulbeet:
        key: ${CHAVE_API}
        role: ReadWrite
soulseek:
  username: dj_teste
  password: ${SENHA_SLSK}
`;

let raiz: string;
let dir: string;
let logs: string;

function escrever(caminho: string, texto: string | Buffer, quando?: Date): void {
  mkdirSync(join(caminho, '..'), { recursive: true });
  writeFileSync(caminho, texto);
  if (quando) utimesSync(caminho, quando, quando);
}

const info: InfoSobre = {
  app: {
    versao: '1.2.3',
    electron: '44.7.0',
    chromium: '140.0',
    node: '24.15.0',
    plataforma: 'win32',
    arquitetura: 'x64',
    empacotado: true,
  },
  stack: { instalada: '1.0.0', doApp: '1.1.0' },
  componentes: [
    { id: 'slskd', nome: 'slskd', versao: '0.26.0', fonte: 'conteiner', motivo: null },
    { id: 'beets', nome: 'Soulbeet · beets', versao: null, fonte: null, motivo: 'stack-desligada' },
    { id: 'navidrome', nome: 'Navidrome', versao: '0.64.2', fonte: 'imagem', motivo: null },
  ],
};

function servico(sobrescrever: Partial<DependenciasSuporte> = {}): SuporteService {
  return new SuporteService({
    agora: () => new Date(2026, 9, 8, 14, 30, 0),
    pastaDeLogs: () => logs,
    projeto: () => ({ dir, origem: 'configurada' }),
    status: () => ({
      ...statusInicial(),
      docker: { ...statusInicial().docker, versaoServidor: '29.0.0', compose: '5.0.0' },
    }),
    config: () => ({
      estado: 'valida',
      erros: 0,
      avisos: 1,
      achados: [{ id: 'x', nivel: 'aviso', arquivo: '.env', variavel: 'SLSK_PASSWORD', mensagem: 'A senha é curta.' }],
    }),
    settings: () => ({ ...SETTINGS_PADRAO, pastaDoProjeto: dir }),
    lerArquivo: (p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    },
    composePsTexto: () => Promise.resolve('NAME      STATUS\nslskd     Up 2 minutes (healthy)\n'),
    sobre: () => Promise.resolve(info),
    sistema: { release: '10.0.26300', arquitetura: 'x64', tipo: 'Windows_NT' },
    aoErro: (e) => {
      throw e instanceof Error ? e : new Error(String(e));
    },
    ...sobrescrever,
  });
}

const texto = (e: { dados: Buffer }) => e.dados.toString('utf8');

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'sc-suporte-'));
  dir = join(raiz, 'Soulcrate com espaço');
  logs = join(raiz, 'dados', 'logs');
  mkdirSync(join(dir, 'lotes'), { recursive: true });
  mkdirSync(logs, { recursive: true });
  escrever(join(dir, '.env'), ENV);
  escrever(join(dir, 'slskd', 'slskd.yml'), YML);
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('redação de segredos', () => {
  it('envSemSegredos troca só as senhas e chaves, preserva o resto e a ordem', () => {
    const r = envSemSegredos(ENV);
    for (const s of SEGREDOS) expect(r).not.toContain(s);
    expect(r).toContain('SLSK_PASSWORD=***');
    expect(r).toContain('SLSKD_API_KEY_SOULBEET=***');
    expect(r).toContain('MUSIC_DIR=D:/Musica/music');
    expect(r).toContain('SLSK_USERNAME=dj_teste');
    expect(r.indexOf('PUID')).toBeLessThan(r.indexOf('SLSK_PASSWORD'));
  });

  it('valoresSecretos lê as senhas do .env e do slskd.yml (a chave, a senha web e a do Soulseek)', () => {
    const v = valoresSecretos(ENV, YML);
    for (const s of SEGREDOS) expect(v).toContain(s);
    expect(v).not.toContain('dj_teste');
    expect(valoresSecretos(null, null)).toEqual([]);
  });

  it('redigirValores ignora valores curtos demais e troca o maior primeiro', () => {
    expect(redigirValores('o PUID é 1000 e 123456 sumiu', ['1000', '123456'])).toBe('o PUID é 1000 e *** sumiu');
    expect(redigirValores('abc-segredo-longo-xyz', ['segredo-longo', 'abc-segredo-longo-xyz'])).toBe('***');
  });

  it('decodifica UTF-8 com BOM e UTF-16 com BOM', () => {
    expect(decodificarLog(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ação', 'utf8')]))).toBe('ação');
    expect(decodificarLog(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ação', 'utf16le')]))).toBe('ação');
  });
});

describe('o pacote', () => {
  it('traz logs, últimos lotes, compose ps, versões e a conferência da configuração', async () => {
    escrever(join(logs, 'main.log'), '[info] Soulcrate 1.2.3 iniciando\n');
    escrever(join(dir, 'lotes', 'execucao-20261007-160000.log'), 'lote ok\n');
    const e = await servico().montar();
    const nomes = e.map((x) => x.nome).sort();
    expect(nomes).toEqual(
      [
        'LEIA-ME.txt',
        'configuracao.txt',
        'docker-compose-ps.txt',
        'env-sem-segredos.txt',
        'logs-do-app/main.log',
        'lotes/execucao-20261007-160000.log',
        'versoes.txt',
      ].sort(),
    );
    const por = Object.fromEntries(e.map((x) => [x.nome, texto(x)]));
    expect(por['versoes.txt']).toContain('Soulcrate (app)  1.2.3');
    expect(por['versoes.txt']).toContain('slskd');
    expect(por['versoes.txt']).toContain('0.26.0');
    expect(por['versoes.txt']).toContain('não lida (stack-desligada)');
    expect(por['versoes.txt']).toContain('Docker           29.0.0');
    expect(por['docker-compose-ps.txt']).toContain('slskd     Up 2 minutes');
    expect(por['configuracao.txt']).toContain('1 aviso(s)');
    expect(por['configuracao.txt']).toContain('senha é curta.');
    expect(por['LEIA-ME.txt']).toContain('não foi enviado a lugar nenhum');
    expect(por['LEIA-ME.txt']).toContain('versoes.txt');
  });

  it('o .env e o slskd.yml em si NUNCA entram, e nenhum segredo aparece em arquivo nenhum (nem nos logs)', async () => {
    // segredos escondidos onde costumam vazar: log do app, saída do lote, erro do PowerShell, cabeçalho HTTP, JSON
    escrever(
      join(logs, 'main.log'),
      `[error] falhou com SLSK_PASSWORD=${SENHA_SLSK} e X-API-Key: ${CHAVE_API}\n{"password":"${SENHA_WEB}"}\n`,
    );
    escrever(join(logs, 'main.old.log'), `texto solto com a chave ${CHAVE_SECRETA} no meio\n`);
    escrever(
      join(dir, 'lotes', 'execucao-20261007-160000.log'),
      `Start-Transcript\nusando a chave ${CHAVE_API} para o slskd\n`,
    );
    escrever(join(dir, 'lotes', 'erro-20261007-160000.log'), `Invoke-RestMethod: 401 com ${SENHA_WEB}\n`);
    const e = await servico().montar();
    for (const entrada of e) {
      for (const s of SEGREDOS) expect(texto(entrada), `${entrada.nome} vazou ${s.slice(0, 6)}…`).not.toContain(s);
    }
    expect(e.map((x) => x.nome).filter((n) => /(^|\/)(\.env|slskd\.yml)$/.test(n))).toEqual([]);
    expect(texto(e.find((x) => x.nome === 'logs-do-app/main.log') as { dados: Buffer })).toContain('SLSK_PASSWORD=***');
  });

  it('o zip gravado também não carrega segredo, mesmo lido de volta', async () => {
    escrever(join(logs, 'main.log'), `chave ${CHAVE_API}\n`);
    let gravado: Buffer | null = null;
    const r = await servico().gerar(join(raiz, 'saida.zip'), async (_c, dados) => {
      gravado = dados;
    });
    expect(r.ok).toBe(true);
    const lido = lerZip(gravado as unknown as Buffer);
    for (const [nome, dados] of lido) for (const s of SEGREDOS) expect(dados.toString('utf8'), nome).not.toContain(s);
    if (r.ok) {
      expect(r.arquivos).toContain('versoes.txt');
      expect(r.bytes).toBe((gravado as unknown as Buffer).length);
    }
  });

  it('leva só as 3 últimas execuções (e o erro de cada uma só se não está vazio)', async () => {
    const base = new Date(2026, 9, 1).getTime();
    ['20261001-100000', '20261002-100000', '20261003-100000', '20261004-100000'].forEach((id, i) => {
      escrever(join(dir, 'lotes', `execucao-${id}.log`), `lote ${id}\n`, new Date(base + i * 86_400_000));
    });
    escrever(join(dir, 'lotes', 'erro-20261004-100000.log'), 'PowerShell reclamou\n');
    escrever(join(dir, 'lotes', 'erro-20261003-100000.log'), '   \n');
    const nomes = (await servico().montar()).map((x) => x.nome).filter((n) => n.startsWith('lotes/'));
    expect(nomes.sort()).toEqual([
      'lotes/erro-20261004-100000.log',
      'lotes/execucao-20261002-100000.log',
      'lotes/execucao-20261003-100000.log',
      'lotes/execucao-20261004-100000.log',
    ]);
  });

  it('um log enorme entra só pelo fim, com um aviso', async () => {
    escrever(join(logs, 'main.log'), `${'linha antiga\n'.repeat(400_000)}a última linha\n`);
    const e = (await servico().montar()).find((x) => x.nome === 'logs-do-app/main.log');
    const t = texto(e as { dados: Buffer });
    expect(t.length).toBeLessThan(2.2 * 1024 * 1024);
    expect(t).toContain('início cortado');
    expect(t.trimEnd().endsWith('a última linha')).toBe(true);
  });

  it('sem pasta do Soulcrate, ainda gera o que dá (versões e logs do app)', async () => {
    escrever(join(logs, 'main.log'), 'ok\n');
    const e = await servico({ projeto: () => ({ dir: null, origem: null }) }).montar();
    expect(e.map((x) => x.nome).sort()).toEqual(['LEIA-ME.txt', 'logs-do-app/main.log', 'versoes.txt']);
  });

  it('docker fora do ar: o compose ps vira uma explicação, não um erro', async () => {
    const e = await servico({ composePsTexto: () => Promise.resolve(null) }).montar();
    expect(texto(e.find((x) => x.nome === 'docker-compose-ps.txt') as { dados: Buffer })).toContain('não respondeu');
  });

  it('falha ao gravar vira o erro do catálogo (com o código do erro nos detalhes)', async () => {
    const r = await servico({ aoErro: () => undefined }).gerar(join(raiz, 'x.zip'), () =>
      Promise.reject(Object.assign(new Error(`EACCES: sem permissão em ${SENHA_SLSK}`), { code: 'EACCES' })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && !r.cancelado) {
      expect(r.erro.codigo).toBe('suporte.nao-gerou');
      expect(r.erro.detalhes).toContain('EACCES');
    }
  });

  it('o nome sugerido leva a data', () => {
    expect(nomeSugeridoDoPacote(new Date(2026, 9, 8))).toBe('soulcrate-suporte-2026-10-08.zip');
  });
});
