import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Lancador, OpcoesLancamento, ResultadoLancamento } from '../../src/main/processos';
import {
  horaLocal,
  LoteService,
  lerTrava,
  notificacaoDoFim,
  type NotificacaoLote,
} from '../../src/main/services/lote-service';
import type { MainEvent } from '../../src/shared/ipc';
import { novasOpcoes } from '../../src/shared/opcoes-lote';
import { ate, removerPasta } from './ajudantes';

const T = '2026-10-07T16:10:02.994-03:00';
const ev = (type: string, resto: object = {}) => JSON.stringify({ v: 1, t: T, type, ...resto });
const runStart = (id: string, pid = 4242, lista = 'set.txt') =>
  ev('run.start', {
    id,
    pid,
    list: lista,
    listName: 'set',
    total: 2,
    options: {},
    files: { runLog: `lotes/execucao-${id}.log` },
    powershell: '5.1',
  });
const runEnd = (extra: object = {}) =>
  ev('run.end', {
    reason: 'completed',
    exitCode: 0,
    message: '',
    summary: { baixada: 2 },
    files: { result: 'lotes/resultado-x.txt', notDownloaded: 'lotes/nao-baixadas-x.txt' },
    ...extra,
  });

class LancadorFalso implements Lancador {
  readonly chamadas: { comando: string; args: string[]; opcoes: OpcoesLancamento }[] = [];
  resultado: ResultadoLancamento = { codigo: 0, tempoEsgotado: false, erroSpawn: null };
  /** o que "o script" faz quando o lançador roda (ex.: gravar o run.start) */
  aoLancar: (args: string[]) => void = () => undefined;
  lancar(comando: string, args: readonly string[], opcoes: OpcoesLancamento): Promise<ResultadoLancamento> {
    this.chamadas.push({ comando, args: [...args], opcoes });
    this.aoLancar([...args]);
    return Promise.resolve(this.resultado);
  }
}

let dir: string;
let lancador: LancadorFalso;
let emitidos: MainEvent[];
let notificacoes: NotificacaoLote[];
let vivos: Set<number>;
let erros: unknown[];
let slskdNoAr: boolean;
let svc: LoteService;
let projetoDir: string | null;

const lotes = () => join(dir, 'lotes');
const eventosDe = (id: string) => join(lotes(), `eventos-${id}.jsonl`);
const saidaDe = (id: string) => join(lotes(), `saida-${id}.log`);
const emitidosDo = <T extends MainEvent['type']>(tipo: T) =>
  emitidos.filter((e): e is Extract<MainEvent, { type: T }> => e.type === tipo);

function criarServico(extra: { intervaloMs?: number; semSinalMs?: number } = {}): LoteService {
  return new LoteService({
    lancador,
    projeto: () => ({ dir: projetoDir, origem: projetoDir ? 'configurada' : null }),
    slskdNoAr: () => slskdNoAr,
    emitir: (e) => emitidos.push(e),
    notificar: (n) => notificacoes.push(n),
    agora: () => Date.now(),
    processoVivo: (pid) => vivos.has(pid),
    aoErro: (e) => erros.push(e),
    intervaloMs: extra.intervaloMs ?? 15,
    semSinalMs: extra.semSinalMs ?? 60_000,
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sc-lote-'));
  projetoDir = dir;
  writeFileSync(join(dir, 'baixar-lista.ps1'), '# script');
  writeFileSync(join(dir, 'set.txt'), 'A - B\nC - D\n');
  lancador = new LancadorFalso();
  emitidos = [];
  notificacoes = [];
  vivos = new Set();
  erros = [];
  slskdNoAr = true;
  svc = criarServico();
});
afterEach(async () => {
  svc.encerrar();
  await removerPasta(dir);
});

const iniciar = (lista = 'set.txt', opcoes = novasOpcoes()) => svc.iniciar({ lista, opcoes });

describe('iniciar', () => {
  it('sem pasta do Soulcrate: erro do catálogo, sem rodar nada', async () => {
    projetoDir = null;
    const r = await iniciar();
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'projeto.ausente' } });
    expect(lancador.chamadas).toEqual([]);
  });

  it('lista inexistente ou script ausente: "não consegui iniciar", com o motivo nos detalhes', async () => {
    const r1 = await iniciar('nada.txt');
    expect(r1).toMatchObject({ ok: false, erro: { codigo: 'lote.nao-iniciou' } });
    expect(r1.ok ? '' : r1.erro.detalhes).toContain('nada.txt');
    rmSync(join(dir, 'baixar-lista.ps1'));
    const r2 = await iniciar();
    expect(r2.ok ? '' : r2.erro.detalhes).toContain('baixar-lista.ps1');
    expect(lancador.chamadas).toEqual([]);
  });

  it('nome de lista inválido é recusado (o renderer não é confiável)', async () => {
    await expect(iniciar('..\\..\\Windows\\win.ini')).rejects.toThrow(/inválido/);
    expect(lancador.chamadas).toEqual([]);
  });

  it('stack fora do ar: erro "lote.stack-fora", sem rodar nada', async () => {
    slskdNoAr = false;
    expect(await iniciar()).toMatchObject({ ok: false, erro: { codigo: 'lote.stack-fora' } });
    expect(lancador.chamadas).toEqual([]);
  });

  it('a mesma lista já rodando (trava com processo vivo): recusa com mensagem clara', async () => {
    mkdirSync(lotes(), { recursive: true });
    writeFileSync(join(lotes(), 'estado-set.lock'), '777\t2026-10-07T16:00:00\t20261007-160000\n');
    vivos.add(777);
    const r = await iniciar();
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'lote.lista-rodando' } });
    expect(r.ok ? '' : r.erro.titulo).toBe('set.txt já está rodando');
    expect(r.ok ? '' : r.erro.mensagem).toContain('2026-10-07T16:00:00');
    expect(lancador.chamadas).toEqual([]);
  });

  it('trava de um processo que já morreu não impede (o script a ignora também)', async () => {
    mkdirSync(lotes(), { recursive: true });
    writeFileSync(join(lotes(), 'estado-set.lock'), '777\t2026-10-07T16:00:00\told\n');
    expect(await iniciar()).toMatchObject({ ok: true });
  });

  it('a trava usa o nome da lista como o script (acentos e espaços viram _)', async () => {
    writeFileSync(join(dir, 'set de sábado.txt'), 'A - B');
    mkdirSync(lotes(), { recursive: true });
    writeFileSync(join(lotes(), 'estado-set_de_sábado.lock'), '777\tagora\tid\n');
    vivos.add(777);
    expect(await iniciar('set de sábado.txt')).toMatchObject({ ok: false, erro: { codigo: 'lote.lista-rodando' } });
  });

  it('inicia o lançador com powershell.exe, -EncodedCommand e a pasta do Soulcrate como diretório', async () => {
    const r = await iniciar('set.txt', { ...novasOpcoes(), Paralelo: 8, AceitarWav: true });
    expect(r.ok).toBe(true);
    const c = lancador.chamadas[0];
    expect(c?.comando).toBe('powershell.exe');
    expect(c?.opcoes.cwd).toBe(dir);
    expect(c?.args.slice(0, 5)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
    ]);
    const cmd = Buffer.from(c?.args[5] ?? '', 'base64').toString('utf16le');
    const id = r.ok ? r.runId : '';
    expect(id).toMatch(/^\d{8}-\d{6}(-\d+)?$/);
    expect(cmd).toContain(`'-IdExecucao', '${id}'`);
    expect(cmd).toContain(`'-Eventos', 'lotes/eventos-${id}.jsonl'`);
    expect(cmd).toContain(`'-ArquivoParada', 'lotes/parar-${id}.flag'`);
    expect(cmd).toContain("'-Paralelo', '8', '-AceitarWav'");
    expect(cmd).toContain(join(dir, 'lotes', `saida-${id}.log`));
    expect(existsSync(lotes())).toBe(true); // o redirecionamento precisa da pasta antes de o script criá-la
  });

  it.each([
    [
      'PowerShell não abre',
      { codigo: null, tempoEsgotado: false, erroSpawn: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      /abrir o PowerShell/,
    ],
    ['lançador demora', { codigo: null, tempoEsgotado: true, erroSpawn: null }, /30 segundos/],
    ['lançador sai com erro', { codigo: 1, tempoEsgotado: false, erroSpawn: null }, /código 1/],
  ])('%s: "não consegui iniciar"', async (_nome, resultado, texto) => {
    lancador.resultado = resultado as ResultadoLancamento;
    const r = await iniciar();
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'lote.nao-iniciou' } });
    expect(r.ok ? '' : r.erro.detalhes).toMatch(texto);
    expect(await svc.ativas()).toEqual([]); // nada passa a ser acompanhado
  });

  it('duas execuções no mesmo segundo ganham ids diferentes', async () => {
    writeFileSync(join(dir, 'outra.txt'), 'A - B');
    const a = await iniciar('set.txt');
    const b = await iniciar('outra.txt');
    expect(a.ok && b.ok && a.runId !== b.runId).toBe(true);
  });
});

describe('acompanhamento', () => {
  it('lê os eventos do arquivo enquanto o script escreve e os empurra numerados para o renderer', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(
      eventosDe(id),
      `${runStart(id)}\n${ev('run.skip', { alreadyDone: 0, inLibrary: 0, toProcess: 2, libraryChecked: false })}\n`,
    );
    await ate(() => emitidosDo('batch.events').length >= 1);
    appendFileSync(eventosDe(id), `${ev('item.status', { key: 'a b', line: 'A - B', status: 'buscando' })}\n`);
    await ate(() => emitidosDo('batch.events').length >= 2);

    const lotes1 = emitidosDo('batch.events');
    expect(lotes1[0]).toMatchObject({ runId: id, desde: 0 });
    expect(lotes1[0]?.eventos.map((e) => e.type)).toEqual(['run.start', 'run.skip']);
    expect(lotes1[1]).toMatchObject({ desde: 2 });
    expect(lotes1[1]?.eventos.map((e) => e.type)).toEqual(['item.status']);

    const anexo = svc.anexar(id);
    expect(anexo?.eventos).toHaveLength(3);
    expect(anexo?.resumo).toMatchObject({ runId: id, lista: 'set.txt', pid: 4242, terminou: false });
  });

  it('o log bruto (saída do script) também chega, numerado', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    writeFileSync(saidaDe(id), 'linha 1\r\nlinha 2\r\n');
    await ate(() => emitidosDo('batch.log').length >= 1);
    appendFileSync(saidaDe(id), 'linha 3\n');
    await ate(() => emitidosDo('batch.log').length >= 2);
    expect(emitidosDo('batch.log').map((l) => [l.desde, l.linhas])).toEqual([
      [0, ['linha 1', 'linha 2']],
      [2, ['linha 3']],
    ]);
    expect(svc.anexar(id)).toMatchObject({ log: ['linha 1', 'linha 2', 'linha 3'], logTotal: 3 });
  });

  it('linha de evento inválida vai para o log de erros e não derruba a leitura', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(eventosDe(id), `isto não é json\n${runStart(id)}\n`);
    await ate(() => emitidosDo('batch.events').length >= 1);
    expect(erros).toHaveLength(1);
    expect(svc.anexar(id)?.eventos.map((e) => e.type)).toEqual(['run.start']);
  });

  it('run.end: marca como terminada, guarda os arquivos, para de ler e notifica uma vez', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(eventosDe(id), `${runStart(id)}\n${runEnd()}\n`);
    await ate(() => svc.anexar(id)?.resumo.terminou === true);
    expect(notificacoes).toEqual([
      { titulo: 'Lote concluído', corpo: 'set.txt: 2 baixadas · 0 não encontradas · 0 falhas' },
    ]);
    // leituras seguintes não repetem nem notificam de novo
    await new Promise((res) => setTimeout(res, 120));
    expect(notificacoes).toHaveLength(1);
    expect(emitidosDo('batch.events')).toHaveLength(1);
  });

  it('abre os relatórios da execução (só dentro de lotes/, só se existirem)', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(eventosDe(id), `${runStart(id)}\n${runEnd()}\n`);
    await ate(() => svc.anexar(id)?.resumo.terminou === true);
    expect(svc.caminhoDoArquivo(id, 'resultado')).toBeNull(); // o arquivo ainda não existe
    writeFileSync(join(lotes(), 'resultado-x.txt'), 'ok');
    expect(svc.caminhoDoArquivo(id, 'resultado')).toBe(join(lotes(), 'resultado-x.txt'));
    expect(svc.caminhoDoArquivo(id, 'diagnostico')).toBeNull();
    expect(svc.caminhoDoArquivo('nao-existe', 'resultado')).toBeNull();
  });

  it('um evento que aponta para fora de lotes/ nunca é aberto', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(eventosDe(id), `${runStart(id)}\n${runEnd({ files: { result: '../baixar-lista.ps1' } })}\n`);
    await ate(() => svc.anexar(id)?.resumo.terminou === true);
    expect(svc.caminhoDoArquivo(id, 'resultado')).toBeNull();
  });

  it('buscas pausadas: notifica na hora, com a hora local', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(
      eventosDe(id),
      `${runStart(id)}\n${ev('search.paused', { until: '2026-10-07T22:47:00-03:00', minutes: 15, reason: 'x' })}\n`,
    );
    await ate(() => notificacoes.length === 1);
    expect(notificacoes[0]?.titulo).toBe('Buscas pausadas');
    expect(notificacoes[0]?.corpo).toMatch(
      /^set\.txt: o servidor do Soulseek bloqueou as buscas até \d{2}:\d{2}\. Os downloads continuam\.$/,
    );
  });

  it('anexar uma execução desconhecida devolve null', () => {
    expect(svc.anexar('20260101-000000')).toBeNull();
  });
});

describe('parar', () => {
  it('cria o arquivo-sinal que o script confere a cada volta (não mata o processo)', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(eventosDe(id), `${runStart(id)}\n`);
    await ate(() => svc.anexar(id)?.resumo.lista === 'set.txt');
    svc.parar(id);
    expect(existsSync(join(lotes(), `parar-${id}.flag`))).toBe(true);
  });

  it('depois do fim, ou para uma execução que não existe, não faz nada', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    appendFileSync(eventosDe(id), `${runStart(id)}\n${runEnd()}\n`);
    await ate(() => svc.anexar(id)?.resumo.terminou === true);
    svc.parar(id);
    svc.parar('20260101-000000');
    expect(existsSync(join(lotes(), `parar-${id}.flag`))).toBe(false);
  });
});

describe('processo que some', () => {
  it('com o PID conhecido e sem run.end: depois de duas leituras sem novidade, o fim vira "interrompido"', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    vivos.add(4242);
    appendFileSync(eventosDe(id), `${runStart(id, 4242)}\n`);
    await ate(() => svc.anexar(id)?.resumo.pid === 4242);
    vivos.delete(4242); // encerrado à força
    await ate(() => svc.anexar(id)?.resumo.terminou === true);
    const fim = svc.anexar(id)?.eventos.at(-1);
    expect(fim).toMatchObject({ type: 'run.end', reason: 'interrupted', exitCode: 130 });
    expect(notificacoes[0]?.titulo).toBe('Lote interrompido');
  });

  it('processo vivo não é dado por morto, por mais que fique quieto', async () => {
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    vivos.add(4242);
    appendFileSync(eventosDe(id), `${runStart(id, 4242)}\n`);
    await new Promise((res) => setTimeout(res, 200));
    expect(svc.anexar(id)?.resumo.terminou).toBe(false);
  });

  it('o lote que nunca escreveu nada: depois do tempo de espera, explica com o erro do PowerShell', async () => {
    svc.encerrar();
    svc = criarServico({ semSinalMs: 60 });
    const r = await iniciar();
    const id = r.ok ? r.runId : '';
    writeFileSync(join(lotes(), `erro-${id}.log`), 'O arquivo baixar-lista.ps1 não pode ser carregado.');
    await ate(() => svc.anexar(id)?.resumo.terminou === true);
    const fim = svc.anexar(id)?.eventos.at(-1);
    expect(fim).toMatchObject({ type: 'run.end', reason: 'interrupted' });
    expect((fim as { message: string }).message).toContain('não chegou a começar');
    expect((fim as { message: string }).message).toContain('não pode ser carregado');
  });
});

describe('reconectar (a execução continuou rodando com o app fechado)', () => {
  function simularLoteVivo(id: string, pid: number, lista = 'set.txt'): void {
    mkdirSync(lotes(), { recursive: true });
    writeFileSync(join(lotes(), 'estado-set.lock'), `${pid}\t2026-10-07T16:10:02\t${id}\n`);
    writeFileSync(
      eventosDe(id),
      `${runStart(id, pid, lista)}\n${ev('item.status', { key: 'a b', line: 'A - B', status: 'baixando', user: 'u', format: 'FLAC', attempt: 1, remoteQueued: false })}\n`,
    );
    vivos.add(pid);
  }

  it('acha a execução pela trava, lê tudo desde o começo e devolve o resumo com a lista', async () => {
    simularLoteVivo('20261007-161002', 31337);
    const ativas = await svc.ativas();
    expect(ativas).toEqual([{ runId: '20261007-161002', lista: 'set.txt', pid: 31337, iniciouEm: T, terminou: false }]);
    expect(svc.anexar('20261007-161002')?.eventos.map((e) => e.type)).toEqual(['run.start', 'item.status']);
  });

  it('continua acompanhando: o que o script escrever depois chega ao renderer, e o fim notifica', async () => {
    simularLoteVivo('20261007-161002', 31337);
    await svc.ativas();
    appendFileSync(eventosDe('20261007-161002'), `${runEnd()}\n`);
    await ate(() => notificacoes.length === 1);
    expect(notificacoes[0]?.titulo).toBe('Lote concluído');
  });

  it('chamar duas vezes não duplica o acompanhamento', async () => {
    simularLoteVivo('20261007-161002', 31337);
    await svc.ativas();
    await svc.ativas();
    expect((await svc.ativas()).length).toBe(1);
    expect(emitidosDo('batch.events')).toHaveLength(1);
  });

  it('trava de processo morto, ou sem arquivo de eventos (lote do .bat), é ignorada', async () => {
    mkdirSync(lotes(), { recursive: true });
    writeFileSync(join(lotes(), 'estado-set.lock'), '999\tagora\t20261007-000001\n');
    writeFileSync(eventosDe('20261007-000001'), `${runStart('20261007-000001', 999)}\n`); // PID não está vivo
    writeFileSync(join(lotes(), 'estado-outra.lock'), '888\tagora\t20261007-000002\n'); // vivo, mas sem eventos
    vivos.add(888);
    expect(await svc.ativas()).toEqual([]);
  });

  it('trava com id inválido (arquivo adulterado) é ignorada', async () => {
    mkdirSync(lotes(), { recursive: true });
    writeFileSync(join(lotes(), 'estado-set.lock'), '999\tagora\t..\\..\\x\n');
    vivos.add(999);
    expect(await svc.ativas()).toEqual([]);
  });

  it('sem pasta do Soulcrate, não há o que reconectar', async () => {
    projetoDir = null;
    expect(await svc.ativas()).toEqual([]);
  });
});

describe('memória', () => {
  it('guarda só as execuções terminadas mais recentes (cada uma tem todos os eventos e o log)', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await iniciar();
      const id = r.ok ? r.runId : '';
      ids.push(id);
      appendFileSync(eventosDe(id), `${runStart(id)}\n${runEnd()}\n`);
      await ate(() => svc.anexar(id)?.resumo.terminou === true);
    }
    const ativas = await svc.ativas();
    expect(ativas.length).toBeLessThanOrEqual(5);
    expect(ativas.every((a) => a.terminou)).toBe(true);
    // as mais antigas saíram da memória; as mais novas continuam
    expect(svc.anexar(ids[0] as string)).toBeNull();
    expect(svc.anexar(ids[7] as string)).not.toBeNull();
  });
});

describe('lerTrava', () => {
  it('lê PID, início e id', () => {
    writeFileSync(join(dir, 'x.lock'), '﻿123\t2026-10-07T16:10:02\tabc\r\n');
    expect(lerTrava(join(dir, 'x.lock'))).toEqual({ pid: 123, inicio: '2026-10-07T16:10:02', id: 'abc' });
  });

  it('arquivo ausente ou sem PID válido: null', () => {
    expect(lerTrava(join(dir, 'nao-existe.lock'))).toBeNull();
    writeFileSync(join(dir, 'x.lock'), 'abc\tx\ty\n');
    expect(lerTrava(join(dir, 'x.lock'))).toBeNull();
    writeFileSync(join(dir, 'y.lock'), '');
    expect(lerTrava(join(dir, 'y.lock'))).toBeNull();
  });
});

describe('notificação do fim', () => {
  const fim = (reason: string, exitCode: number, message = '', summary: Record<string, number> = {}) =>
    ({ v: 1, t: T, type: 'run.end', reason, exitCode, message, summary, files: {} }) as Parameters<
      typeof notificacaoDoFim
    >[0];

  it('concluído e parado mostram a contagem; os outros, o motivo', () => {
    const resumo = { baixada: 10, importada: 5, 'nao encontrada': 2, falhou: 1, 'baixada (beets falhou)': 1 };
    expect(notificacaoDoFim(fim('completed', 0, '', resumo), 'set.txt')).toEqual({
      titulo: 'Lote concluído',
      corpo: 'set.txt: 15 baixadas · 2 não encontradas · 2 falhas',
    });
    expect(notificacaoDoFim(fim('user', 2, '', { baixada: 1, 'nao encontrada': 1 }), null)).toEqual({
      titulo: 'Lote parado',
      corpo: '1 baixada · 1 não encontrada · 0 falhas',
    });
    expect(notificacaoDoFim(fim('slskd_down', 3, 'slskd fora'), 'x.txt')).toEqual({
      titulo: 'O slskd não respondeu',
      corpo: 'x.txt: slskd fora',
    });
  });

  it('horaLocal mostra HH:mm; texto que não é data volta como veio', () => {
    expect(horaLocal('2026-10-07T22:47:00-03:00')).toMatch(/^\d{2}:\d{2}$/);
    expect(horaLocal('amanhã')).toBe('amanhã');
  });
});
