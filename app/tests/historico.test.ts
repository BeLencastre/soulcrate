import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerLinhaEvento, type EventoLote, type RunEnd, type RunStart } from '../src/shared/eventos-lote';
import {
  contagemDoResumo,
  contarFiltros,
  dataDoId,
  detalharExecucao,
  diagnosticarFaixa,
  explicarVia,
  faixaParaHistorico,
  filtrarFaixasHistorico,
  lerDiagnosticoTexto,
  lerExecucaoDeEventos,
  lerResultadoAntigo,
  linhasParaTentarDeNovo,
  opcoesDaExecucao,
  resumirExecucao,
  rotuloDoDia,
  rotuloDoMomento,
  contarStatus,
  type CorrecaoFaixa,
  type DadosDoResumo,
  type DiagBruto,
  type FaixaBase,
} from '../src/shared/historico';
import { msg } from '../src/shared/mensagens';

const fixture = (nome: string) => fileURLToPath(new URL(`./fixtures/lote/${nome}`, import.meta.url));
const texto = (nome: string) => readFileSync(fixture(nome), 'utf8');
const eventos = (nome: string): EventoLote[] =>
  texto(nome)
    .split('\n')
    .map(lerLinhaEvento)
    .filter((e): e is EventoLote => e !== null);

/** a faixa de posição `n` (sem `!`: se a fixture mudar, o teste diz qual faltou) */
function faixaEm(b: { faixas: FaixaBase[] }, n: number): FaixaBase {
  const f = b.faixas[n];
  if (!f) throw new Error(`a execução não tem a faixa ${n}`);
  return f;
}
function diagDoTexto(d: Record<string, DiagBruto>, key: string): DiagBruto {
  const x = d[key];
  if (!x) throw new Error(`o diagnóstico não tem ${key}`);
  return x;
}

const COMPLETO = eventos('eventos-completo.jsonl');
const PARADO = eventos('eventos-parado.jsonl');
const ERRO = eventos('eventos-erro-config.jsonl');
const T0 = Date.parse('2026-10-07T15:48:09.420-03:00');

function dados(extra: Partial<DadosDoResumo> & Pick<DadosDoResumo, 'id'>): DadosDoResumo {
  return {
    fonte: 'eventos',
    inicioEvento: null,
    fimEvento: null,
    progresso: null,
    summary: null,
    inicioMs: T0,
    fimMs: null,
    rodando: false,
    agora: T0 + 60_000,
    ...extra,
  };
}
const inicioDe = (evs: EventoLote[]) => evs.find((e) => e.type === 'run.start') as RunStart;
const fimDe = (evs: EventoLote[]) => evs.findLast((e) => e.type === 'run.end') as RunEnd;

describe('datas', () => {
  it('o id é a hora em que a execução começou (hora local)', () => {
    expect(dataDoId('20261007-161002')).toBe(new Date(2026, 9, 7, 16, 10, 2).getTime());
    expect(dataDoId('20261007-161002-2')).toBe(new Date(2026, 9, 7, 16, 10, 2).getTime());
    expect(dataDoId('2026-10-06_2102')).toBe(new Date(2026, 9, 6, 21, 2, 0).getTime());
  });

  it('id que não é uma data (ou é uma data impossível) não tem hora', () => {
    expect(dataDoId('exemplo')).toBeNull();
    expect(dataDoId('20261340-161002')).toBeNull();
    expect(dataDoId('20260231-161002')).toBeNull();
  });

  it('"Hoje", "Ontem" e "Sáb, 03/10" (com o ano quando não é o atual)', () => {
    const agora = new Date(2026, 9, 7, 12, 0).getTime();
    expect(rotuloDoDia(new Date(2026, 9, 7, 22, 14).getTime(), agora)).toBe('Hoje');
    expect(rotuloDoDia(new Date(2026, 9, 6, 21, 2).getTime(), agora)).toBe('Ontem');
    expect(rotuloDoDia(new Date(2026, 9, 3, 19, 40).getTime(), agora)).toBe('Sáb, 03/10');
    expect(rotuloDoDia(new Date(2025, 11, 25, 10, 0).getTime(), agora)).toBe('Qui, 25/12/2025');
    expect(rotuloDoMomento(new Date(2026, 9, 6, 21, 2).getTime(), agora)).toBe('ontem, 21:02');
  });
});

describe('resumo de uma execução (a linha do histórico)', () => {
  it('concluída: conta o summary do run.end e mede a duração do primeiro ao último evento', () => {
    const r = resumirExecucao(
      dados({
        id: 'exemplo',
        inicioEvento: inicioDe(COMPLETO),
        fimEvento: fimDe(COMPLETO),
        summary: fimDe(COMPLETO).summary,
      }),
    );
    expect(r.fim).toBe('completed');
    expect(r.lista).toBe('lista.txt');
    expect(r.contagem).toEqual({ total: 6, ok: 4, naoVieram: 2, puladas: 0, atencao: 0, naoTerminadas: 0 });
    expect(r.duracaoMs).toBe(25_342);
    expect(r.temFaltas).toBe(true);
    expect(r.progresso).toBeNull();
  });

  it('parada pelo usuário: o que estava no meio fica "não terminada"', () => {
    const r = resumirExecucao(
      dados({
        id: 'parada',
        inicioEvento: inicioDe(PARADO),
        fimEvento: fimDe(PARADO),
        summary: fimDe(PARADO).summary,
      }),
    );
    expect(r.fim).toBe('user');
    expect(r.contagem).toMatchObject({ total: 1, ok: 0, naoTerminadas: 1 });
    expect(r.temFaltas).toBe(false);
  });

  it('erro de configuração: o motivo vem junto, e a barra não finge ter faixas', () => {
    const r = resumirExecucao(
      dados({ id: 'erro', inicioEvento: inicioDe(ERRO), fimEvento: fimDe(ERRO), summary: fimDe(ERRO).summary }),
    );
    expect(r.fim).toBe('config');
    expect(r.mensagem).toMatch(/Nao consegui falar com o slskd/);
    expect(r.contagem.ok).toBe(0);
  });

  it('rodando: o andamento vem do último progress', () => {
    const progresso = COMPLETO.filter((e) => e.type === 'progress')[2];
    if (progresso?.type !== 'progress') throw new Error('a fixture mudou');
    const r = resumirExecucao(
      dados({ id: 'x', inicioEvento: inicioDe(COMPLETO), progresso, rodando: true, agora: T0 + 90_000 }),
    );
    expect(r.fim).toBe('rodando');
    expect(r.progresso).toEqual({ feitas: progresso.done, total: 6 });
    expect(r.contagem.ok).toBe(progresso.ok);
    expect(r.duracaoMs).toBe(90_000);
  });

  it('eventos sem run.end e sem processo vivo: interrompida (o PC desligou, o app foi encerrado à força...)', () => {
    const r = resumirExecucao(dados({ id: 'x', inicioEvento: inicioDe(COMPLETO) }));
    expect(r.fim).toBe('interrupted');
    expect(r.mensagem).toBe(msg.lote.fim.sumiu);
    expect(r.duracaoMs).toBeNull();
  });

  it('execução antiga (só o resultado-*.txt): concluída, e a duração é do início do id até a gravação do relatório', () => {
    const faixas = lerResultadoAntigo('20261007-154809', texto('resultado-exemplo.txt')).faixas;
    const r = resumirExecucao(
      dados({
        id: '20261007-154809',
        fonte: 'resultado',
        summary: contarStatus(faixas),
        inicioMs: dataDoId('20261007-154809') ?? 0,
        fimMs: (dataDoId('20261007-154809') ?? 0) + 26_000,
      }),
    );
    expect(r.fim).toBe('completed');
    expect(r.lista).toBeNull();
    expect(r.contagem).toMatchObject({ total: 6, ok: 4, naoVieram: 2 });
    expect(r.duracaoMs).toBe(26_000);
  });

  it('execução antiga com faixa no meio do caminho: interrompida', () => {
    const r = resumirExecucao(
      dados({ id: 'x', fonte: 'resultado', summary: { baixada: 3, baixando: 1 }, fimMs: T0 + 5000 }),
    );
    expect(r.fim).toBe('interrupted');
  });

  it('só o log da tela: sem relatório, e o app diz isso', () => {
    const r = resumirExecucao(dados({ id: 'x', fonte: 'log', fimMs: T0 + 1000 }));
    expect(r.fim).toBe('interrupted');
    expect(r.mensagem).toBe(msg.historico.semRelatorio);
    expect(r.contagem.total).toBe(0);
  });

  it('duração absurda (relógio mudou, arquivo copiado) vira "sem duração"', () => {
    const r = resumirExecucao(
      dados({ id: 'x', fonte: 'resultado', summary: { baixada: 1 }, fimMs: T0 + 30 * 86_400_000 }),
    );
    expect(r.duracaoMs).toBeNull();
  });

  it('contagemDoResumo: o que sobra do total são faixas não terminadas', () => {
    expect(contagemDoResumo({ importada: 2, 'ja feita': 1, falhou: 1, 'baixada (beets falhou)': 1 }, 9)).toEqual({
      total: 9,
      ok: 2,
      naoVieram: 1,
      puladas: 1,
      atencao: 1,
      naoTerminadas: 4,
    });
  });
});

describe('execução completa (fixture real do baixar-lista.ps1)', () => {
  const bruta = lerExecucaoDeEventos('20261007-154809', COMPLETO);

  it('lê as faixas na ordem da lista, com o arquivo baixado e como cada uma foi achada', () => {
    expect(bruta.faixas.map((f) => [f.key, f.status])).toEqual([
      ['azyr no escape', 'baixada'],
      ['creeds push up original mix', 'baixada'],
      ['vendex plague', 'nao encontrada'],
      ['vendex abaddon', 'baixada'],
      ['byorn 2 loud', 'baixada'],
      ['fulano inexistente nada aqui', 'nao encontrada'],
    ]);
    const abaddon = bruta.faixas[3];
    expect(abaddon?.via).toBe('busca pelo artista');
    expect(abaddon?.local).toBe('downloads/Vendex/Vendex - Abbadon.flac');
    expect(bruta.faixas[0]?.formato).toBe('WAV');
    expect(bruta.arquivos.diagnostic).toBe('lotes/diagnostico-exemplo.txt');
  });

  it('as faixas viram a tabela do detalhe, com o texto âmbar só para o que merece conferir', () => {
    const f = bruta.faixas.map(faixaParaHistorico);
    expect(f.map((x) => x.grupo)).toEqual(['bib', 'bib', 'nao', 'bib', 'bib', 'nao']);
    expect(f[3]).toMatchObject({
      paraConferir: true,
      nota: 'veio da busca pelo artista',
      artista: 'Vendex',
      titulo: 'Abaddon',
    });
    expect(f[0]).toMatchObject({ paraConferir: false, nota: '', rotuloStatus: 'Baixada (não organizada)' });
    expect(f[2]).toMatchObject({ temDiagnostico: true, rotuloStatus: 'Não encontrada', corStatus: 'vermelho' });
    expect(contarFiltros(f)).toEqual({ todas: 6, bib: 4, nao: 2, conf: 1, inc: 0 });
  });

  it('filtra por grupo e busca sem acento nem ø', () => {
    const f = bruta.faixas.map(faixaParaHistorico);
    expect(filtrarFaixasHistorico(f, 'nao', '').map((x) => x.titulo)).toEqual(['Plague', 'Nada Aqui']);
    expect(filtrarFaixasHistorico(f, 'conf', '').map((x) => x.titulo)).toEqual(['Abaddon']);
    expect(filtrarFaixasHistorico(f, 'todas', 'byorn').map((x) => x.titulo)).toEqual(['2 LOUD']);
    expect(filtrarFaixasHistorico(f, 'bib', 'plague')).toEqual([]);
  });

  it('diagnóstico do "Vendex - Plague": existe, mas só em AIFF; os motivos vêm do mais frequente ao menos', () => {
    const d = diagnosticarFaixa(faixaEm(bruta, 2), bruta, null);
    expect(d.status).toBe('nao encontrada');
    expect(d.motivos.map((m) => [m.tipo, m.n])).toEqual([
      ['aacAiff', 2],
      ['titulo', 1],
    ]);
    expect(d.resumo).toBe(msg.historico.resumoDaFalta.soFormato);
    expect(d.respostas).toBe(3);
    expect(d.sugestoes).toEqual(['Plague']);
    expect(d.buscas).toEqual([
      { tipo: 'artist', consulta: 'Vendex' },
      { tipo: 'q', consulta: 'Vendex Plague' },
      { tipo: 'q', consulta: 'Plague' },
    ]);
    expect(d.arquivos).toHaveLength(3);
    expect(d.arquivos[0]).toEqual({
      motivo: 'formato aiff (use -AceitarAacAiff)',
      usuario: 'u3',
      arquivo: '@@c\\Music\\Vendex\\Vendex - Plague.aiff',
    });
    expect(d.catalogo).toEqual([
      { titulo: 'Abbadon', usuarios: 1 },
      { titulo: 'Plague', usuarios: 1 },
    ]);
    expect(d.musicbrainz).toBeNull(); // o lote da fixture não conferiu o MusicBrainz
    expect(d.correcao).toBeNull();
  });

  it('diagnóstico da faixa que ninguém tem: "0 respostas" e o catálogo do artista vazio', () => {
    const d = diagnosticarFaixa(faixaEm(bruta, 5), bruta, null);
    expect(d.motivos.map((m) => m.tipo)).toEqual(['semRespostas']);
    expect(d.resumo).toBe(msg.historico.resumoDaFalta.ninguemTem);
    expect(d.respostas).toBe(0);
    expect(d.artistaBuscado).toBe(true);
    expect(d.catalogo).toEqual([]);
    expect(d.arquivos).toEqual([]);
  });

  it('"tentar de novo": só as que falharam, com a correção no lugar da linha; as opções sugeridas pelos motivos', () => {
    const correcao: CorrecaoFaixa = {
      titulo: 'Plague',
      linha: 'Vendex - Plague',
      lista: null,
      em: '2026-10-07T00:00:00Z',
    };
    expect(linhasParaTentarDeNovo(bruta.faixas, {})).toEqual(['Vendex - Plague', 'Fulano Inexistente - Nada Aqui']);
    expect(
      linhasParaTentarDeNovo(bruta.faixas, {
        'vendex plague': { ...correcao, linha: 'Vendex - Plague (Original Mix)' },
      }),
    ).toEqual(['Vendex - Plague (Original Mix)', 'Fulano Inexistente - Nada Aqui']);

    const parte = detalharExecucao(bruta, {
      correcoes: {},
      retentar: false,
      arquivoDaRetentativa: 'nao-baixadas-20261007-154809.txt',
    });
    expect(parte.retentativa).toMatchObject({
      arquivo: 'nao-baixadas-20261007-154809.txt',
      faixas: 2,
      retentar: false,
      sugeridas: ['AceitarAacAiff', 'AceitarMp3320', 'AceitarMp3Menor'],
    });
    // as opções da execução (a fixture rodou com SemBeets e SemCatalogo) continuam, e o sugerido se soma
    expect(parte.retentativa?.opcoes).toMatchObject({
      SemBeets: true,
      SemCatalogo: true,
      AceitarAacAiff: true,
      AceitarMp3320: true,
      AceitarMp3Menor: true,
      Retentar: false,
    });
    expect(parte.opcoes?.SemBeets).toBe(true);
  });

  it('lista que já rodou antes: a retentativa liga o -Retentar', () => {
    const parte = detalharExecucao(bruta, { correcoes: {}, retentar: true, arquivoDaRetentativa: 'x.txt' });
    expect(parte.retentativa?.opcoes.Retentar).toBe(true);
    expect(parte.retentativa?.retentar).toBe(true);
  });

  it('sem faixas que falharam, não há "tentar de novo"', () => {
    const so = { ...bruta, faixas: bruta.faixas.filter((f) => f.status === 'baixada') };
    expect(
      detalharExecucao(so, { correcoes: {}, retentar: false, arquivoDaRetentativa: 'x.txt' }).retentativa,
    ).toBeNull();
  });
});

describe('execução parada e execução com erro (fixtures reais)', () => {
  it('a faixa que estava no meio guarda o último status e fica no grupo "não terminadas"', () => {
    const bruta = lerExecucaoDeEventos('parada', PARADO);
    const f = bruta.faixas.map(faixaParaHistorico);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ status: 'baixando', grupo: 'inc', temDiagnostico: false });
    expect(f[0]?.usuario).toBe('lento');
    expect(contarFiltros(f)).toMatchObject({ inc: 1, bib: 0 });
  });

  it('erro de configuração: só o run.start e o run.end, nenhuma faixa', () => {
    const bruta = lerExecucaoDeEventos('erro', ERRO);
    expect(bruta.faixas).toEqual([]);
    expect(bruta.fimEvento?.reason).toBe('config');
  });
});

describe('falha de download (não há item.diagnostic: o motivo está nas tentativas)', () => {
  const T = '2026-10-07T16:10:02.994-03:00';
  const ev = (type: string, resto: object) => ({ v: 1, t: T, type, ...resto }) as unknown as EventoLote;
  const evs = [
    ev('item.status', { key: 'azyr trance', line: 'Azyr - When The Devil Meets Trance', status: 'pendente' }),
    ev('item.attemptFailed', { key: 'azyr trance', user: 'a', attempt: 1, reason: 'fila longa em a (>4 min)' }),
    ev('item.attemptFailed', { key: 'azyr trance', user: 'b', attempt: 2, reason: 'fila longa em b (>4 min)' }),
    ev('item.attemptFailed', { key: 'azyr trance', user: 'c', attempt: 3, reason: 'c: Completed, Errored' }),
    ev('item.final', {
      key: 'azyr trance',
      line: 'Azyr - When The Devil Meets Trance',
      status: 'falhou',
      note: 'c: Completed, Errored',
      via: '',
      local: null,
      user: null,
      format: null,
    }),
  ];
  const bruta = lerExecucaoDeEventos('x', evs);

  it('agrupa as tentativas e sugere dar mais tempo à fila', () => {
    const d = diagnosticarFaixa(faixaEm(bruta, 0), bruta, null);
    expect(d.status).toBe('falhou');
    expect(d.rotuloStatus).toBe('Falhou');
    expect(d.motivos.map((m) => [m.tipo, m.n])).toEqual([
      ['fila', 2],
      ['erroUsuario', 1],
    ]);
    expect(d.resumo).toBe(msg.historico.resumoDaFalta.usuarios);
    expect(d.tentativas).toHaveLength(3);
    const parte = detalharExecucao(bruta, { correcoes: {}, retentar: false, arquivoDaRetentativa: 'x.txt' });
    expect(parte.retentativa?.sugeridas).toEqual(['FilaMaxMin', 'DownloadMaxMin']);
    expect(parte.retentativa?.opcoes).toMatchObject({ FilaMaxMin: 10, DownloadMaxMin: 40 });
  });

  it('erro interno do script vira o motivo da faixa', () => {
    const b = lerExecucaoDeEventos('x', [
      ev('item.final', {
        key: 'k',
        line: 'A - B',
        status: 'falhou',
        note: 'erro interno ao analisar a busca: boom',
        via: '',
        local: null,
        user: null,
        format: null,
      }),
    ]);
    const d = diagnosticarFaixa(faixaEm(b, 0), b, null);
    expect(d.motivos.map((m) => m.tipo)).toEqual(['erroInterno']);
    expect(d.resumo).toBe(msg.historico.resumoDaFalta.erroInterno);
  });

  it('o resultado do MusicBrainz vira o chip da tela', () => {
    const b = lerExecucaoDeEventos('x', [
      ev('item.final', {
        key: 'k',
        line: 'Vendex - Abaddon',
        status: 'nao encontrada',
        note: '1 respostas, nenhuma compativel',
        via: '',
        local: null,
        user: null,
        format: null,
      }),
      ev('catalog.result', {
        key: 'k',
        line: 'Vendex - Abaddon',
        result: 'NAO EXISTE',
        searchLine: '',
        similar: ['Abbadon'],
        detail: '',
      }),
    ]);
    const d = diagnosticarFaixa(faixaEm(b, 0), b, null);
    expect(d.musicbrainz).toEqual({
      resultado: 'NAO EXISTE',
      rotulo: 'NÃO EXISTE',
      cor: 'laranja',
      similares: ['Abbadon'],
    });
    // o script só escreveu a quantidade de respostas na nota
    expect(d.respostas).toBe(1);
    expect(d.motivos.map((m) => m.tipo)).toEqual(['semCompativel']);
    expect(d.resumo).toBe(msg.historico.resumoDaFalta.semCompativel);
  });
});

describe('execução antiga: resultado-*.txt e diagnostico-*.txt do baixar-lista.bat', () => {
  const bruta = lerResultadoAntigo('20261007-154809', texto('resultado-exemplo.txt'));
  const diag = lerDiagnosticoTexto(texto('diagnostico-exemplo.txt'));

  it('lê o status em minúsculas, a linha e o caminho do arquivo baixado com o "via"', () => {
    expect(bruta.fonte).toBe('resultado');
    expect(bruta.faixas.map((f) => f.status)).toEqual([
      'baixada',
      'baixada',
      'nao encontrada',
      'baixada',
      'baixada',
      'nao encontrada',
    ]);
    const abaddon = bruta.faixas[3];
    expect(abaddon).toMatchObject({
      linha: 'Vendex - Abaddon',
      local: 'C:\\Soulcrate\\downloads\\Vendex\\Vendex - Abbadon.flac',
      via: 'busca pelo artista',
      key: 'vendex abaddon',
    });
    expect(bruta.faixas[2]?.nota).toMatch(/^existe, mas so em formato/);
    expect(bruta.faixas[2]?.local).toBeNull();
  });

  it('o diagnóstico em texto traz o mesmo que os eventos trouxeram', () => {
    const dosEventos = lerExecucaoDeEventos('x', COMPLETO).diagnosticos;
    for (const key of ['vendex plague', 'fulano inexistente nada aqui']) {
      const a = diag[key];
      const b = dosEventos[key];
      expect(a, key).toBeDefined();
      expect(a?.reasons).toEqual(b?.reasons);
      expect(a?.suggestions).toEqual(b?.suggestions);
      expect(a?.searches).toEqual(b?.searches);
      expect(a?.skipped).toBe(b?.skipped);
      expect(a?.artistCatalog).toEqual(b?.artistCatalog);
      expect(a?.artistSearched).toBe(b?.artistSearched);
      expect(a?.closest.map((c) => [c.reason, c.user, c.file])).toEqual(
        b?.closest.map((c) => [c.reason, c.user, c.file]),
      );
    }
  });

  it('as respostas, que o texto não traz, saem da nota do resultado', () => {
    bruta.diagnosticos['fulano inexistente nada aqui'] = diagDoTexto(diag, 'fulano inexistente nada aqui');
    bruta.diagnosticos['vendex plague'] = diagDoTexto(diag, 'vendex plague');
    const fulano = diagnosticarFaixa(faixaEm(bruta, 5), bruta, null);
    expect(fulano.respostas).toBe(0);
    expect(fulano.motivos.map((m) => m.tipo)).toEqual(['semRespostas']);
    const plague = diagnosticarFaixa(faixaEm(bruta, 2), bruta, null);
    expect(plague.respostas).toBeNull();
    expect(plague.motivos.map((m) => m.tipo)).toEqual(['aacAiff', 'titulo']);
  });

  it('diagnóstico com título do catálogo que traz a quantidade de usuários e o "..." do corte', () => {
    const d = lerDiagnosticoTexto(
      [
        '### A - B',
        '    buscas: A B',
        "    catalogo de 'A' no Soulseek (3 titulos, os mais compartilhados primeiro): Um (3) | Dois | Tres (Remix) | ...",
      ].join('\n'),
    );
    expect(d['a b']?.artistCatalog).toEqual([
      { title: 'Um', users: 3 },
      { title: 'Dois', users: 1 },
      { title: 'Tres (Remix)', users: 1 },
    ]);
    expect(d['a b']?.artistCatalogTotal).toBe(3);
  });
});

describe('explicarVia', () => {
  it('traduz o que o script escreve em `via`', () => {
    expect(explicarVia('busca pelo artista')).toBe('veio da busca pelo artista');
    expect(explicarVia("titulo aproximado: 'Power (Extended Mix)'")).toBe(
      'título aproximado: "Power (Extended Mix)" · confira',
    );
    expect(explicarVia("titulo aproximado: 'X'; busca pelo artista")).toBe(
      'título aproximado: "X" · confira · veio da busca pelo artista',
    );
    expect(explicarVia('titulo original da lista (a correcao do catalogo nao achou)')).toMatch(
      /usou o título original/,
    );
    expect(explicarVia('algo novo')).toBe('algo novo');
  });
});

describe('opcoesDaExecucao', () => {
  it('aceita as opções que o app conhece e ignora o resto (SlskdUrl, valores fora do intervalo)', () => {
    const o = opcoesDaExecucao({
      Paralelo: 8,
      AceitarAacAiff: true,
      SlskdUrl: 'http://x',
      Buscas: 999,
      SemBeets: 'sim',
    });
    expect(o).toMatchObject({ Paralelo: 8, AceitarAacAiff: true, Buscas: 2, SemBeets: false });
    expect(Object.keys(o ?? {})).not.toContain('SlskdUrl');
  });

  it('execução de uma versão antiga: AceitarWav (obsoleta, o WAV é sempre aceito) é ignorada', () => {
    const o = opcoesDaExecucao({ Paralelo: 8, AceitarWav: true });
    expect(o).toMatchObject({ Paralelo: 8, AceitarAacAiff: false });
    expect(Object.keys(o ?? {})).not.toContain('AceitarWav');
  });

  it('execução antiga não registrou opções', () => {
    expect(opcoesDaExecucao(undefined)).toBeNull();
  });
});
