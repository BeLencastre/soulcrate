import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aceitarVersao,
  adicionarVersoes,
  alternarEmpate,
  ATALHOS_VERSAO,
  descerVersao,
  empatadaComAcima,
  escreverVersoes,
  formatarDuracao,
  lerVersoes,
  moverVersao,
  NOME_NO_SCRIPT,
  recusarVersao,
  subirVersao,
  VERSOES,
  VERSOES_PADRAO,
  versaoPeloNomeNoScript,
  versoesRecusadas,
  versoesValidas,
} from '../../src/shared/versoes';

const REPO = join(import.meta.dirname, '..', '..', '..');
// As operações são conferidas numa ordem com empate (Original e sem nome na mesma posição), que o padrão não tem.
const COM_EMPATE = 'extended,club,original+semnome';
const ORDEM = lerVersoes(COM_EMPATE);

describe('ler e escrever a ordem (o texto do -Versoes)', () => {
  it('vírgula separa posições e "+" junta versões na mesma posição', () => {
    expect(ORDEM).toEqual([['extended'], ['club'], ['original', 'semnome']]);
    expect(escreverVersoes(ORDEM)).toBe(COM_EMPATE);
  });

  it('tolera espaços e maiúsculas, como o script', () => {
    expect(lerVersoes(' Extended , club+ ORIGINAL ')).toEqual([['extended'], ['club', 'original']]);
  });

  it.each([
    ['vazio', ''],
    ['desconhecida', 'extended,remix'],
    ['repetida', 'extended,club+extended'],
    ['só separadores', ', + ,'],
  ])('recusa %s', (_n, texto) => {
    expect(() => lerVersoes(texto)).toThrow();
    expect(versoesValidas(texto)).toBe(false);
  });

  it('os nomes são os mesmos do script (ConvertTo-VersionRanks em baixar-lista.lib.ps1)', () => {
    const lib = readFileSync(join(REPO, 'baixar-lista.lib.ps1'), 'utf8');
    for (const v of VERSOES) expect(lib).toContain(`${v} = '${NOME_NO_SCRIPT[v]}'`);
  });

  it('o padrão do card é o padrão do app', () => {
    expect(ATALHOS_VERSAO.find((a) => a.id === 'pista')?.versoes).toBe(VERSOES_PADRAO);
    expect(lerVersoes(VERSOES_PADRAO)).toEqual([['extended'], ['original'], ['club'], ['vip'], ['semnome']]);
    for (const a of ATALHOS_VERSAO) expect(versoesValidas(a.versoes), a.id).toBe(true);
  });
});

describe('mexer na ordem', () => {
  it('subir: sozinha, troca com a posição de cima; empatada, sai e fica logo acima', () => {
    expect(escreverVersoes(subirVersao(ORDEM, 'club'))).toBe('club,extended,original+semnome');
    expect(escreverVersoes(subirVersao(ORDEM, 'semnome'))).toBe('extended,club,semnome,original');
    expect(escreverVersoes(subirVersao(ORDEM, 'extended'))).toBe(COM_EMPATE);
  });

  it('descer: o espelho', () => {
    expect(escreverVersoes(descerVersao(ORDEM, 'extended'))).toBe('club,extended,original+semnome');
    expect(escreverVersoes(descerVersao(ORDEM, 'original'))).toBe('extended,club,semnome,original');
    expect(escreverVersoes(descerVersao(lerVersoes('extended,club'), 'club'))).toBe('extended,club');
  });

  it('mesma posição da de cima: junta, e de novo separa', () => {
    expect(empatadaComAcima(ORDEM, 'semnome')).toBe(true);
    expect(empatadaComAcima(ORDEM, 'original')).toBe(false);
    const junta = alternarEmpate(ORDEM, 'club');
    expect(escreverVersoes(junta)).toBe('extended+club,original+semnome');
    expect(escreverVersoes(alternarEmpate(junta, 'club'))).toBe(COM_EMPATE);
    expect(escreverVersoes(alternarEmpate(ORDEM, 'extended'))).toBe(COM_EMPATE);
  });

  it('recusar e aceitar: a aceita entra por último; a última aceita não sai', () => {
    const sem = recusarVersao(ORDEM, 'club');
    expect(escreverVersoes(sem)).toBe('extended,original+semnome');
    expect(versoesRecusadas(sem)).toEqual(['club', 'vip', 'radioedit']);
    expect(escreverVersoes(aceitarVersao(sem, 'radioedit'))).toBe('extended,original+semnome,radioedit');
    expect(escreverVersoes(recusarVersao(lerVersoes('extended'), 'extended'))).toBe('extended');
  });

  it('arrastar: fica sozinha antes da posição de destino, ou no fim', () => {
    expect(escreverVersoes(moverVersao(ORDEM, 'semnome', 'extended'))).toBe('semnome,extended,club,original');
    expect(escreverVersoes(moverVersao(ORDEM, 'radioedit', 'club'))).toBe('extended,radioedit,club,original+semnome');
    expect(escreverVersoes(moverVersao(ORDEM, 'extended', null))).toBe('club,original+semnome,extended');
    expect(escreverVersoes(moverVersao(ORDEM, 'club', 'club'))).toBe(COM_EMPATE);
  });

  it('a retentativa junta as versões recusadas ao fim, sem repetir', () => {
    expect(adicionarVersoes(VERSOES_PADRAO, ['radioedit', 'radioedit', 'club'])).toBe(`${VERSOES_PADRAO},radioedit`);
  });
});

describe('nomes e durações', () => {
  it('o nome do motivo do script volta para a versão', () => {
    expect(versaoPeloNomeNoScript('radio edit')).toBe('radioedit');
    expect(versaoPeloNomeNoScript('sem versao no nome')).toBe('semnome');
    expect(versaoPeloNomeNoScript('vip mix')).toBe('vip');
    expect(versaoPeloNomeNoScript('remix')).toBeNull();
  });

  it('formata segundos como m:ss', () => {
    expect(formatarDuracao(418)).toBe('6:58');
    expect(formatarDuracao(300)).toBe('5:00');
    expect(formatarDuracao(59)).toBe('0:59');
  });
});
