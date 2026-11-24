// O contrato do "Testar login" da Conta Beatport: a linha `soulcrate-beatport: <código>` do `beet beatport-testar`.
import { describe, expect, it } from 'vitest';
import { CODIGOS_TESTE_BEATPORT, lerResultadoDoTesteBeatport } from '../../src/shared/beatport';
import { contaBeatportConectada } from '../../src/shared/configuracao';
import { msg } from '../../src/shared/mensagens';

describe('lerResultadoDoTesteBeatport', () => {
  it.each(CODIGOS_TESTE_BEATPORT)('lê o código %s', (codigo) => {
    expect(lerResultadoDoTesteBeatport(`soulcrate-beatport: ${codigo}\n`)).toBe(codigo);
  });

  it('tolera outras linhas, espaços, CRLF e cores ANSI do beets', () => {
    const saida = [
      'userconfig file not found',
      '\u001b[1;32msoulcrate-beatport:   login-recusado  \u001b[39;49;00m',
      '',
    ].join('\r\n');
    expect(lerResultadoDoTesteBeatport(saida)).toBe('login-recusado');
  });

  it('vale a última linha do contrato quando há mais de uma', () => {
    expect(lerResultadoDoTesteBeatport('soulcrate-beatport: limite\nsoulcrate-beatport: ok')).toBe('ok');
  });

  it('sem a linha, ou com um código desconhecido, o fluxo mudou', () => {
    expect(lerResultadoDoTesteBeatport('')).toBe('fluxo-mudou');
    expect(lerResultadoDoTesteBeatport('Traceback (most recent call last):\n  File "x.py"')).toBe('fluxo-mudou');
    expect(lerResultadoDoTesteBeatport('soulcrate-beatport: inventado')).toBe('fluxo-mudou');
    expect(lerResultadoDoTesteBeatport('texto soulcrate-beatport: ok no meio da linha')).toBe('fluxo-mudou');
  });

  it('todo código tem uma mensagem acionável no catálogo', () => {
    for (const c of CODIGOS_TESTE_BEATPORT) expect(msg.configuracoes.beatport.teste[c].length).toBeGreaterThan(20);
  });
});

describe('contaBeatportConectada', () => {
  it('só com usuário e senha preenchidos', () => {
    expect(contaBeatportConectada('BEATPORT_USERNAME=dj\nBEATPORT_PASSWORD=s3nha\n')).toBe(true);
    expect(contaBeatportConectada("BEATPORT_USERNAME=dj\r\nBEATPORT_PASSWORD='a#b'\r\n")).toBe(true);
  });

  it('um só, vazios, comentados ou sem .env: não está conectada', () => {
    expect(contaBeatportConectada('BEATPORT_USERNAME=dj\n')).toBe(false);
    expect(contaBeatportConectada('BEATPORT_PASSWORD=s3nha\n')).toBe(false);
    expect(contaBeatportConectada('BEATPORT_USERNAME=\nBEATPORT_PASSWORD=\n')).toBe(false);
    expect(contaBeatportConectada('# BEATPORT_USERNAME=dj\n# BEATPORT_PASSWORD=s3nha\n')).toBe(false);
    expect(contaBeatportConectada('PUID=1000\n')).toBe(false);
    expect(contaBeatportConectada('')).toBe(false);
    expect(contaBeatportConectada(null)).toBe(false);
  });
});
