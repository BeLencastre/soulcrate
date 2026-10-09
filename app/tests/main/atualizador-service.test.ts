import { beforeEach, describe, expect, it } from 'vitest';
import { AtualizadorService, type AutoUpdaterLike } from '../../src/main/services/atualizador-service';
import {
  ATRASO_PRIMEIRA_CHECAGEM_MS,
  INTERVALO_CHECAGEM_MS,
  type EstadoAtualizacao,
} from '../../src/shared/atualizacao';

type Ouvinte = (...args: never[]) => void;

/** Um electron-updater de mentira: o teste dispara os eventos que a rede dispararia. */
class UpdaterFalso implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  checagens = 0;
  instalou: { silencioso?: boolean; reabrir?: boolean } | null = null;
  falhaNaChecagem: Error | null = null;
  private readonly ouvintes = new Map<string, Ouvinte[]>();

  on(evento: string, ouvinte: Ouvinte): this {
    this.ouvintes.set(evento, [...(this.ouvintes.get(evento) ?? []), ouvinte]);
    return this;
  }
  emitir(evento: string, ...args: unknown[]): void {
    for (const o of this.ouvintes.get(evento) ?? []) (o as (...a: unknown[]) => void)(...args);
  }
  checkForUpdates(): Promise<unknown> {
    this.checagens++;
    if (this.falhaNaChecagem) return Promise.reject(this.falhaNaChecagem);
    this.emitir('checking-for-update');
    return Promise.resolve(null);
  }
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.instalou = {
      ...(isSilent === undefined ? {} : { silencioso: isSilent }),
      ...(isForceRunAfter === undefined ? {} : { reabrir: isForceRunAfter }),
    };
  }
}

let updater: UpdaterFalso;
let estados: EstadoAtualizacao[];
let lote: boolean;
let agora: number;
let agendados: { fn: () => void; ms: number; cancelado: boolean; repete: boolean }[];

function criar(sobrescrever: { updater?: UpdaterFalso | null } = {}): AtualizadorService {
  const u = sobrescrever.updater === undefined ? updater : sobrescrever.updater;
  return new AtualizadorService({
    updater: u,
    motivoIndisponivel: u ? null : 'desenvolvimento',
    loteRodando: () => lote,
    aoMudar: (e) => estados.push(e),
    agora: () => agora,
    aoErro: () => undefined,
    agendar: (fn, ms) => {
      const a = { fn, ms, cancelado: false, repete: false };
      agendados.push(a);
      return () => (a.cancelado = true);
    },
    repetir: (fn, ms) => {
      const a = { fn, ms, cancelado: false, repete: true };
      agendados.push(a);
      return () => (a.cancelado = true);
    },
  });
}

beforeEach(() => {
  updater = new UpdaterFalso();
  estados = [];
  lote = false;
  agora = 1_700_000_000_000;
  agendados = [];
});

describe('AtualizadorService', () => {
  it('desenvolvimento (sem updater): indisponível, não agenda nada e não faz nada', async () => {
    const s = criar({ updater: null });
    expect(s.estado).toEqual({ estado: 'indisponivel', motivo: 'desenvolvimento' });
    s.iniciar();
    expect(agendados).toEqual([]);
    expect(await s.verificar()).toEqual({ estado: 'indisponivel', motivo: 'desenvolvimento' });
    expect(s.reiniciarEAtualizar().ok).toBe(false);
    s.aoSair(); // não quebra
  });

  it('configura o updater: baixa sozinho, instala ao sair, nunca pré-lançamento', () => {
    criar();
    expect(updater).toMatchObject({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false });
  });

  it('procura na abertura (depois de alguns segundos) e a cada 24 h', async () => {
    const s = criar();
    s.iniciar();
    expect(agendados.map((a) => [a.ms, a.repete])).toEqual([
      [ATRASO_PRIMEIRA_CHECAGEM_MS, false],
      [INTERVALO_CHECAGEM_MS, true],
    ]);
    expect(INTERVALO_CHECAGEM_MS).toBe(86_400_000);
    agendados[0]?.fn();
    expect(updater.checagens).toBe(1);
    s.parar();
    expect(agendados.every((a) => a.cancelado)).toBe(true);
  });

  it('sem versão nova: "atualizado", com a hora da checagem', async () => {
    const s = criar();
    const p = s.verificar();
    updater.emitir('update-not-available');
    await p;
    expect(s.estado).toEqual({ estado: 'atualizado', ultimaChecagemEm: agora });
    expect(estados.map((e) => e.estado)).toEqual(['verificando', 'verificando', 'atualizado']);
  });

  it('com versão nova: baixa (com o progresso) e fica pronta para aplicar ao reiniciar', async () => {
    const s = criar();
    await s.verificar();
    updater.emitir('update-available', { version: '1.2.0' });
    expect(s.estado).toEqual({ estado: 'baixando', versao: '1.2.0', percentual: 0 });
    updater.emitir('download-progress', { percent: 42.4 });
    expect(s.estado).toEqual({ estado: 'baixando', versao: '1.2.0', percentual: 42 });
    updater.emitir('download-progress', { percent: 250 });
    expect(s.estado).toMatchObject({ percentual: 100 });
    updater.emitir('update-downloaded', { version: '1.2.0' });
    expect(s.estado).toEqual({ estado: 'pronta', versao: '1.2.0' });
  });

  it('com uma atualização pronta, procurar de novo não faz nada (não há o que procurar)', async () => {
    const s = criar();
    await s.verificar();
    updater.emitir('update-downloaded', { version: '1.2.0' });
    const antes = updater.checagens;
    await s.verificar();
    expect(updater.checagens).toBe(antes);
    expect(s.estado.estado).toBe('pronta');
  });

  it('"Reiniciar e atualizar" instala em silêncio e reabre o app', async () => {
    const s = criar();
    await s.verificar();
    updater.emitir('update-downloaded', { version: '1.2.0' });
    expect(s.reiniciarEAtualizar()).toEqual({ ok: true });
    expect(updater.instalou).toEqual({ silencioso: true, reabrir: true });
  });

  it('NUNCA aplica durante um lote: recusa com a mensagem do catálogo e não instala', async () => {
    const s = criar();
    await s.verificar();
    updater.emitir('update-downloaded', { version: '1.2.0' });
    lote = true;
    const r = s.reiniciarEAtualizar();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.codigo).toBe('atualizacao.lote-rodando');
    expect(updater.instalou).toBeNull();
    expect(s.estado).toEqual({ estado: 'pronta', versao: '1.2.0' }); // continua pronta, esperando
    lote = false;
    expect(s.reiniciarEAtualizar()).toEqual({ ok: true });
  });

  it('ao sair do app, o instalador só entra se nenhum lote está rodando', () => {
    const s = criar();
    lote = true;
    s.aoSair();
    expect(updater.autoInstallOnAppQuit).toBe(false);
    lote = false;
    s.aoSair();
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('sem uma atualização pronta, não há o que aplicar', () => {
    const r = criar().reiniciarEAtualizar();
    expect(r.ok).toBe(false);
    expect(updater.instalou).toBeNull();
  });

  it('erro de rede: vira o erro do catálogo (sem pilha crua como única informação) e dá para tentar de novo', async () => {
    const s = criar();
    updater.falhaNaChecagem = new Error('getaddrinfo ENOTFOUND github.com');
    const e = await s.verificar();
    expect(e.estado).toBe('erro');
    if (e.estado === 'erro') {
      expect(e.erro.codigo).toBe('atualizacao.falhou');
      expect(e.erro.detalhes).toContain('ENOTFOUND');
      expect(e.erro.acoes.map((a) => a.id)).toEqual(['tentarDeNovo', 'copiarDetalhes', 'abrirLog']);
    }
    updater.falhaNaChecagem = null;
    const p = s.verificar();
    updater.emitir('update-not-available');
    expect((await p).estado).toBe('atualizado');
  });

  it('o evento de erro do updater (falha no meio do download) também vira erro', () => {
    const s = criar();
    updater.emitir('error', new Error('download interrompido'));
    expect(s.estado.estado).toBe('erro');
  });

  it('uma atualização já baixada sobrevive a uma checagem que falha depois', async () => {
    const s = criar();
    await s.verificar();
    updater.emitir('update-downloaded', { version: '1.2.0' });
    updater.emitir('error', new Error('sem internet'));
    expect(s.estado).toEqual({ estado: 'pronta', versao: '1.2.0' });
  });

  it('a pilha de um erro não leva segredo para a tela', () => {
    const s = criar();
    updater.emitir('error', new Error('401 com X-API-Key: chave-secreta-123456'));
    const e = s.estado;
    expect(e.estado === 'erro' && e.erro.detalhes).not.toContain('chave-secreta-123456');
  });
});
