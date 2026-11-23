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
const PADRAO = lerVersoes(VERSOES_PADRAO);

describe('ler e escrever a ordem (o texto do -Versoes)', () => {
  it('vírgula separa posições e "+" junta versões na mesma posição', () => {
    expect(PADRAO).toEqual([['extended'], ['club'], ['original', 'semnome']]);
    expect(escreverVersoes(PADRAO)).toBe(VERSOES_PADRAO);
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
    for (const a of ATALHOS_VERSAO) expect(versoesValidas(a.versoes), a.id).toBe(true);
  });
});

describe('mexer na ordem', () => {
  it('subir: sozinha, troca com a posição de cima; empatada, sai e fica logo acima', () => {
    expect(escreverVersoes(subirVersao(PADRAO, 'club'))).toBe('club,extended,original+semnome');
    expect(escreverVersoes(subirVersao(PADRAO, 'semnome'))).toBe('extended,club,semnome,original');
    expect(escreverVersoes(subirVersao(PADRAO, 'extended'))).toBe(VERSOES_PADRAO);
  });

  it('descer: o espelho', () => {
    expect(escreverVersoes(descerVersao(PADRAO, 'extended'))).toBe('club,extended,original+semnome');
    expect(escreverVersoes(descerVersao(PADRAO, 'original'))).toBe('extended,club,semnome,original');
    expect(escreverVersoes(descerVersao(lerVersoes('extended,club'), 'club'))).toBe('extended,club');
  });

  it('mesma posição da de cima: junta, e de novo separa', () => {
    expect(empatadaComAcima(PADRAO, 'semnome')).toBe(true);
    expect(empatadaComAcima(PADRAO, 'original')).toBe(false);
    const junta = alternarEmpate(PADRAO, 'club');
    expect(escreverVersoes(junta)).toBe('extended+club,original+semnome');
    expect(escreverVersoes(alternarEmpate(junta, 'club'))).toBe(VERSOES_PADRAO);
    expect(escreverVersoes(alternarEmpate(PADRAO, 'extended'))).toBe(VERSOES_PADRAO);
  });

  it('recusar e aceitar: a aceita entra por último; a última aceita não sai', () => {
    const sem = recusarVersao(PADRAO, 'club');
    expect(escreverVersoes(sem)).toBe('extended,original+semnome');
    expect(versoesRecusadas(sem)).toEqual(['club', 'radioedit']);
    expect(escreverVersoes(aceitarVersao(sem, 'radioedit'))).toBe('extended,original+semnome,radioedit');
    expect(escreverVersoes(recusarVersao(lerVersoes('extended'), 'extended'))).toBe('extended');
  });

  it('arrastar: fica sozinha antes da posição de destino, ou no fim', () => {
    expect(escreverVersoes(moverVersao(PADRAO, 'semnome', 'extended'))).toBe('semnome,extended,club,original');
    expect(escreverVersoes(moverVersao(PADRAO, 'radioedit', 'club'))).toBe('extended,radioedit,club,original+semnome');
    expect(escreverVersoes(moverVersao(PADRAO, 'extended', null))).toBe('club,original+semnome,extended');
    expect(escreverVersoes(moverVersao(PADRAO, 'club', 'club'))).toBe(VERSOES_PADRAO);
  });

  it('a retentativa junta as versões recusadas ao fim, sem repetir', () => {
    expect(adicionarVersoes(VERSOES_PADRAO, ['radioedit', 'radioedit', 'club'])).toBe(`${VERSOES_PADRAO},radioedit`);
  });
});

describe('nomes e durações', () => {
  it('o nome do motivo do script volta para a versão', () => {
    expect(versaoPeloNomeNoScript('radio edit')).toBe('radioedit');
    expect(versaoPeloNomeNoScript('sem versao no nome')).toBe('semnome');
    expect(versaoPeloNomeNoScript('remix')).toBeNull();
  });

  it('formata segundos como m:ss', () => {
    expect(formatarDuracao(418)).toBe('6:58');
    expect(formatarDuracao(300)).toBe('5:00');
    expect(formatarDuracao(59)).toBe('0:59');
  });
});
