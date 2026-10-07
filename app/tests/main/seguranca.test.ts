import { describe, expect, it } from 'vitest';
import {
  ehUrlDoApp,
  ehUrlHttps,
  ehUrlLocalConhecida,
  mesmaOrigemDoServico,
  particaoDo,
  podeAbrirNoNavegador,
  redigirSegredos,
} from '../../src/main/seguranca';

describe('endereços que o app pode abrir', () => {
  it('Web UIs locais: só http no próprio PC, nas três portas da stack', () => {
    for (const u of [
      'http://127.0.0.1:5030',
      'http://localhost:9765/',
      'http://127.0.0.1:4533/app/#/login',
      'http://[::1]:5030/',
    ]) {
      expect(ehUrlLocalConhecida(u), u).toBe(true);
    }
    for (const u of [
      'http://127.0.0.1:8080',
      'http://127.0.0.1',
      'https://127.0.0.1:5030',
      'http://192.168.0.10:5030',
      'http://localhost.evil.com:5030',
      'http://127.0.0.1.evil.com:5030',
      'http://user:senha@127.0.0.1:5030',
      'ftp://127.0.0.1:5030',
      'não é url',
      '',
    ]) {
      expect(ehUrlLocalConhecida(u), u).toBe(false);
    }
  });

  it('links externos: só https', () => {
    expect(ehUrlHttps('https://www.docker.com/products/docker-desktop/')).toBe(true);
    for (const u of [
      'http://www.docker.com',
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'data:text/html,x',
      'https://u:p@x.com',
      'ms-settings:',
    ]) {
      expect(ehUrlHttps(u), u).toBe(false);
    }
  });

  it('shell.openExternal aceita https ou Web UI local, e mais nada', () => {
    expect(podeAbrirNoNavegador('https://learn.microsoft.com/pt-br/windows/wsl/install')).toBe(true);
    expect(podeAbrirNoNavegador('http://127.0.0.1:4533')).toBe(true);
    expect(podeAbrirNoNavegador('http://example.com')).toBe(false);
    expect(podeAbrirNoNavegador('file:///C:/x.exe')).toBe(false);
    expect(podeAbrirNoNavegador('smb://servidor/pasta')).toBe(false);
  });

  it('a janela principal só navega no próprio app', () => {
    expect(ehUrlDoApp('file:///C:/app/out/renderer/index.html#/servicos', null)).toBe(true);
    expect(ehUrlDoApp('https://example.com', null)).toBe(false);
    expect(ehUrlDoApp('http://localhost:5173/#/', 'http://localhost:5173/')).toBe(true);
    expect(ehUrlDoApp('http://localhost:5174/', 'http://localhost:5173/')).toBe(false);
    // no modo dev o `file:` não vale
    expect(ehUrlDoApp('file:///C:/x.html', 'http://localhost:5173/')).toBe(false);
  });
});

describe('Web UIs integradas (SP7)', () => {
  it('cada serviço tem a própria partição persistente', () => {
    expect(particaoDo('slskd')).toBe('persist:soulcrate-webui-slskd');
    expect(new Set(['slskd', 'soulbeet', 'navidrome'].map((s) => particaoDo(s as 'slskd'))).size).toBe(3);
  });

  it('a view só navega na porta do próprio serviço', () => {
    expect(mesmaOrigemDoServico('slskd', 'http://127.0.0.1:5030/transfers')).toBe(true);
    expect(mesmaOrigemDoServico('slskd', 'http://127.0.0.1:9765/')).toBe(false);
    expect(mesmaOrigemDoServico('navidrome', 'http://localhost:4533/app')).toBe(true);
    expect(mesmaOrigemDoServico('navidrome', 'https://evil.com:4533/')).toBe(false);
  });
});

describe('filtro de segredos (§6.1)', () => {
  const SEGREDOS = [
    'hunter2-senha-soulseek',
    'webpass-9f8e7d',
    'a3f9c1e07b5d4c2e8a6f10d3b9e7c4a5',
    'chave-lote-0123456789abcdef',
  ];

  it('remove o valor das variáveis secretas do .env, com ou sem aspas e espaços', () => {
    const texto = [
      `SLSK_PASSWORD=${SEGREDOS[0]}`,
      `SLSKD_WEB_PASSWORD = "${SEGREDOS[1]}"`,
      `SOULBEET_SECRET_KEY='${SEGREDOS[2]}'`,
      `SLSKD_API_KEY_SOULBEET: ${SEGREDOS[3]}`,
      'SLSK_USERNAME=dj_teste',
    ].join('\n');
    const limpo = redigirSegredos(texto);
    for (const s of SEGREDOS) expect(limpo).not.toContain(s);
    expect(limpo).toContain('SLSK_USERNAME=dj_teste');
    expect(limpo).toContain('SLSK_PASSWORD=***');
    expect(limpo).toContain('SLSKD_WEB_PASSWORD = ***');
  });

  it('remove X-API-Key e Authorization de cabeçalhos', () => {
    const limpo = redigirSegredos(
      `GET /api/v0/transfers\nX-API-Key: ${SEGREDOS[3]}\nx-api-key=${SEGREDOS[3]}\nAuthorization: Bearer ${SEGREDOS[2]}`,
    );
    expect(limpo).not.toContain(SEGREDOS[3]);
    expect(limpo).not.toContain(SEGREDOS[2]);
    expect(limpo).toContain('GET /api/v0/transfers');
    expect(limpo).toContain('Authorization: Bearer ***');
  });

  it('remove campos JSON com cara de segredo', () => {
    const limpo = redigirSegredos(
      JSON.stringify({ username: 'admin', password: SEGREDOS[1], api_key: SEGREDOS[3], token: SEGREDOS[2], ok: true }),
    );
    for (const s of SEGREDOS.slice(1)) expect(limpo).not.toContain(s);
    expect(limpo).toContain('"username":"admin"');
    expect(limpo).toContain('"ok":true');
  });

  it('não mexe em texto sem segredos', () => {
    const texto = 'docker compose up -d --build\n[+] Building 212.4s (14/18)\nplugins ok - beets 2.11.0';
    expect(redigirSegredos(texto)).toBe(texto);
  });

  it('é idempotente', () => {
    const uma = redigirSegredos(`SLSK_PASSWORD=${SEGREDOS[0]}`);
    expect(redigirSegredos(uma)).toBe(uma);
  });
});
