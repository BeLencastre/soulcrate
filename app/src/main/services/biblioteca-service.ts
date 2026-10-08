// BibliotecaService (§3.2, Fase 5): o beets visto pelo app. Encapsula o prefixo `BEET` do README
// (`docker compose exec -T -w /data soulbeet python3 -c "…main(sys.argv[1:])" -c /config/config.yaml -l …`) e só monta
// comandos de uma lista fechada: `ls`, `remove -d -f`, `update`, `move`, `keyfinder`, `autobpm` e `import -q -s`.
// Não existe comando livre na v1. O único texto do usuário que chega a um comando é o filtro de `ls` e `remove`, e ele
// é quebrado em termos (cada um um argumento, nunca uma string de shell) e validado antes (`termosDoFiltro`).
//
// O que apaga ou move arquivos exige duas coisas do renderer: a pré-visualização (o mesmo filtro com `ls`, ou o
// `update -p`/`move -p` do beets) e o token que ela devolveu. O token vale para aquele filtro e para aquele conjunto
// de faixas, expira e só funciona uma vez; na hora de apagar, o app lê o filtro de novo e recusa se o resultado mudou.
import { isAbsolute, join, relative } from 'node:path';
import {
  DOWNLOADS_NO_CONTEINER,
  FORMATO_LS,
  lerFaixas,
  lerPrevia,
  ordenarFaixas,
  semAnsi,
  termosDoFiltro,
  type LeituraBiblioteca,
  type ParadoEmDownloads,
  type PreviaManutencao,
  type PreviaRemocao,
  type ResultadoLeitura,
  type ResultadoManutencao,
  type ResultadoPreviaManutencao,
  type ResultadoPreviaRemocao,
  type ResultadoRemocao,
  type TarefaManutencao,
  TAREFAS_COM_PREVIA,
} from '@shared/biblioteca';
import { criarErro, erroInesperado, type AppError } from '@shared/erros';
import type { MainEvent } from '@shared/ipc';
import { servicoDe, type ProjetoStatus, type StackStatus } from '@shared/stack';
import { redigirSegredos } from '../seguranca';
import type { DockerService } from './docker-service';

/** O que vem antes dos argumentos do beets (README, "Manutenção da biblioteca"). */
export const PREFIXO_BEET: readonly string[] = [
  '/usr/bin/python3',
  '-c',
  'import sys; from beets.ui import main; main(sys.argv[1:])',
  '-c',
  '/config/config.yaml',
  '-l',
  '/music/.beets_library.db',
];
/** Onde o baixar-lista.ps1 roda o beets dentro do contêiner. */
export const PASTA_DE_TRABALHO = '/data';

/** Os únicos subcomandos do beets que o app pede. */
export const COMANDOS_PERMITIDOS: readonly string[] = [
  'ls',
  'remove',
  'update',
  'move',
  'keyfinder',
  'autobpm',
  'import',
];

/** Monta o comando do beets; recusa qualquer subcomando fora da lista (defesa em profundidade: a lista é fixa no código). */
export function comandoDoBeet(args: readonly string[]): string[] {
  const subcomando = args[0];
  if (subcomando === undefined || !COMANDOS_PERMITIDOS.includes(subcomando)) {
    throw new Error(`Comando do beets não permitido: ${subcomando ?? '(vazio)'}`);
  }
  return [...PREFIXO_BEET, ...args];
}

/** Quanto tempo uma pré-visualização vale (10 min): o usuário lê, pensa, confirma. */
export const VALIDADE_DO_TOKEN_MS = 10 * 60_000;
const TIMEOUT_LS_MS = 180_000;
const TIMEOUT_PREVIA_MS = 180_000;
const LINHAS_DE_DETALHE = 40;
const MAX_TOKENS = 20;

type TipoToken = 'remover' | TarefaManutencao;

interface Token {
  tipo: TipoToken;
  /** o que o token autoriza: os termos do filtro, ou nada (update e move valem para a biblioteca toda) */
  chave: string;
  /** as faixas que a prévia mostrou (só `remover`) */
  ids: number[];
  expiraEm: number;
}

export interface DependenciasBiblioteca {
  docker: Pick<DockerService, 'exec' | 'execStream'>;
  health: { readonly atual: StackStatus; atualizar(opcoes?: { forcar?: boolean }): Promise<StackStatus> };
  projeto(): ProjetoStatus;
  /** as pastas do disco (já resolvidas): a biblioteca e os downloads */
  pastas(dir: string): { musica: string; downloads: string };
  /** há um lote do app rodando? (mexer na biblioteca durante o lote é recusado) */
  loteRodando(): Promise<boolean>;
  escanearDownloads(raiz: string, agora: number): Promise<ParadoEmDownloads[]>;
  emitir(evento: MainEvent): void;
  novoId(): string;
  novoToken(): string;
  agora(): number;
  aoErro?(erro: unknown): void;
}

export class BibliotecaService {
  private readonly tokens = new Map<string, Token>();
  /** o caminho no disco de cada faixa da última leitura (o renderer só fala em `id`) */
  private caminhos = new Map<number, string>();
  private raizMusica: string | null = null;
  private atual: { id: string; tarefa: TarefaManutencao } | null = null;
  private pararAtual: (() => void) | null = null;

  constructor(private readonly dep: DependenciasBiblioteca) {}

  get emAndamento(): { id: string; tarefa: TarefaManutencao } | null {
    return this.atual;
  }

  /** Ao sair do app: interrompe a espera da operação (o que o beets já começou dentro do contêiner continua). */
  cancelar(): void {
    this.pararAtual?.();
  }

  // ------------------------------------------------------------ leitura

  /** A biblioteca inteira (`ls -f`) e o que está parado em `downloads/`. */
  async ler(): Promise<ResultadoLeitura> {
    const pre = await this.precondicoes(false);
    if ('codigo' in pre) return { ok: false, erro: pre };
    const r = await this.beet(pre.dir, ['ls', '-f', FORMATO_LS], 'ler a biblioteca', TIMEOUT_LS_MS);
    if (!r.ok) return { ok: false, erro: r.erro };

    const { faixas, ignoradas } = lerFaixas(r.saida);
    const pastas = this.dep.pastas(pre.dir);
    this.lembrarCaminhos(pastas.musica, faixas);
    const agora = this.dep.agora();
    const parados = await this.dep.escanearDownloads(pastas.downloads, agora).catch((e: unknown) => {
      this.dep.aoErro?.(e);
      return [] as ParadoEmDownloads[];
    });
    const leitura: LeituraBiblioteca = {
      pastaMusica: pastas.musica,
      pastaDownloads: pastas.downloads,
      lidaEm: agora,
      faixas: ordenarFaixas(faixas),
      ignoradas,
      parados,
    };
    return { ok: true, leitura };
  }

  /** O arquivo de uma faixa da última leitura, só se estiver dentro de `music/`; null se não souber. */
  caminhoDaFaixa(id: number): string | null {
    const caminho = this.caminhos.get(id);
    const raiz = this.raizMusica;
    if (!caminho || !raiz) return null;
    const rel = relative(raiz, caminho);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) ? caminho : null;
  }

  // ------------------------------------------------------------ remoção

  /** `ls` com o filtro: o que um `remove -d` apagaria, mais o token que a remoção exige. */
  async previaRemocao(filtro: string): Promise<ResultadoPreviaRemocao> {
    const termos = termosDoFiltro(filtro);
    if (!termos.ok) return { ok: false, erro: criarErro('biblioteca.filtro-invalido', { motivo: termos.motivo }) };
    const pre = await this.precondicoes(true);
    if ('codigo' in pre) return { ok: false, erro: pre };

    const r = await this.faixasDoFiltro(pre.dir, termos.termos);
    if (!r.ok) return { ok: false, erro: r.erro };
    const token = this.criarToken({
      tipo: 'remover',
      chave: JSON.stringify(termos.termos),
      ids: r.faixas.map((f) => f.id).sort((a, b) => a - b),
    });
    const previa: PreviaRemocao = { filtro: filtro.trim(), token, faixas: ordenarFaixas(r.faixas) };
    return { ok: true, previa };
  }

  /** `remove -d -f`: só com o token da prévia deste filtro e só se as faixas ainda forem as mesmas. */
  async remover(filtro: string, token: string): Promise<ResultadoRemocao> {
    const termos = termosDoFiltro(filtro);
    if (!termos.ok) return { ok: false, erro: criarErro('biblioteca.filtro-invalido', { motivo: termos.motivo }) };
    const pre = await this.precondicoes(true);
    if ('codigo' in pre) return { ok: false, erro: pre };

    const autorizado = this.consumirToken(token, 'remover', JSON.stringify(termos.termos));
    if (!autorizado) {
      return {
        ok: false,
        erro: criarErro('biblioteca.mudou', { detalhes: 'Token de confirmação ausente, usado ou expirado.' }),
      };
    }
    // o conjunto de faixas precisa ser exatamente o que o usuário conferiu
    const agora = await this.faixasDoFiltro(pre.dir, termos.termos);
    if (!agora.ok) return { ok: false, erro: agora.erro };
    const ids = agora.faixas.map((f) => f.id).sort((a, b) => a - b);
    if (ids.length === 0 || ids.join(',') !== autorizado.ids.join(',')) {
      return {
        ok: false,
        erro: criarErro('biblioteca.mudou', {
          detalhes: `Conferido: ${autorizado.ids.length} faixa(s); agora o filtro pega ${ids.length}.`,
        }),
      };
    }

    const r = await this.beet(
      pre.dir,
      ['remove', '-d', '-f', ...termos.termos],
      'remover as faixas',
      TIMEOUT_PREVIA_MS,
    );
    this.esquecerLeitura();
    if (!r.ok) return { ok: false, erro: r.erro };
    return { ok: true, remocao: { removidas: agora.faixas.map((f) => ({ artista: f.artista, titulo: f.titulo })) } };
  }

  // ------------------------------------------------------------ manutenção

  /** `update -p` e `move -p` (o que o beets faria, sem fazer); as outras tarefas só confirmam, sem consultar o beets. */
  async previaManutencao(tarefa: TarefaManutencao): Promise<ResultadoPreviaManutencao> {
    const pre = await this.precondicoes(true);
    if ('codigo' in pre) return { ok: false, erro: pre };
    if (tarefa !== 'update' && tarefa !== 'move') {
      const previa: PreviaManutencao = {
        tarefa,
        token: null,
        afetadas: 0,
        linhas: [],
        totalDeLinhas: 0,
        esquecidas: 0,
      };
      return { ok: true, previa };
    }
    const r = await this.beet(pre.dir, [tarefa, '-p'], 'conferir o que seria feito', TIMEOUT_PREVIA_MS);
    if (!r.ok) return { ok: false, erro: r.erro };
    const lida = lerPrevia(tarefa, [r.avisos, r.saida].join('\n'));
    const token = this.criarToken({ tipo: tarefa, chave: '', ids: [] });
    return { ok: true, previa: { tarefa, token, ...lida } };
  }

  /**
   * Começa a tarefa e devolve o id na hora; o andamento chega por `library.log` e `library.end`. `update` e `move`
   * exigem o token da prévia. Uma só por vez: pedir outra enquanto uma roda devolve a que já está rodando.
   */
  async manutencao(tarefa: TarefaManutencao, token: string | null): Promise<ResultadoManutencao> {
    const jaRodando = this.atual;
    if (jaRodando) return { ok: true, ...jaRodando };
    const pre = await this.precondicoes(true);
    if ('codigo' in pre) return { ok: false, erro: pre };
    const depois = this.atual as { id: string; tarefa: TarefaManutencao } | null;
    if (depois) return { ok: true, ...depois }; // dois cliques durante a conferência

    if ((TAREFAS_COM_PREVIA as readonly string[]).includes(tarefa) && !this.consumirToken(token ?? '', tarefa, '')) {
      return {
        ok: false,
        erro: criarErro('biblioteca.mudou', { detalhes: 'Token de confirmação ausente, usado ou expirado.' }),
      };
    }

    const op = { id: this.dep.novoId(), tarefa };
    this.atual = op;
    this.dep.emitir({ type: 'library.start', id: op.id, tarefa });
    void this.executar(pre.dir, op).catch((e: unknown) => {
      this.dep.aoErro?.(e);
      this.terminar(op, erroInesperado(e));
    });
    return { ok: true, ...op };
  }

  // ------------------------------------------------------------ internos

  private async executar(dir: string, op: { id: string; tarefa: TarefaManutencao }): Promise<void> {
    const etapas = await this.etapasDe(dir, op.tarefa);
    if (etapas.length === 0) {
      this.log(op.id, 'Nada parado em downloads/: não há o que importar.');
      this.terminar(op, null);
      return;
    }
    const ultimas: string[] = [];
    let encerrar = false;
    this.pararAtual = () => {
      encerrar = true;
    };
    for (const etapa of etapas) {
      if (encerrar) break;
      this.log(op.id, `$ beet ${etapa.join(' ')}`);
      const proc = this.dep.docker.execStream(
        dir,
        'soulbeet',
        comandoDoBeet(etapa),
        (linha) => {
          const limpa = semAnsi(linha);
          if (limpa.trim() === '') return;
          ultimas.push(limpa);
          if (ultimas.length > LINHAS_DE_DETALHE) ultimas.shift();
          this.log(op.id, limpa);
        },
        PASTA_DE_TRABALHO,
      );
      this.pararAtual = () => {
        encerrar = true;
        proc.encerrar();
      };
      const r = await proc.terminou;
      if (r.erroSpawn) return this.terminar(op, criarErro('docker.ausente'));
      if (r.codigo !== 0) {
        const detalhes = redigirSegredos(ultimas.join('\n'));
        return this.terminar(op, criarErro('biblioteca.falhou', { tarefa: TITULO_DA_TAREFA[op.tarefa], detalhes }));
      }
    }
    this.terminar(op, null);
  }

  /** Os comandos do beets de cada tarefa. A importação dos parados lê `downloads/` de novo na hora de rodar. */
  private async etapasDe(dir: string, tarefa: TarefaManutencao): Promise<string[][]> {
    switch (tarefa) {
      case 'update':
        return [['update']];
      case 'move':
        return [['move']];
      case 'tomEBpm':
        return [['keyfinder'], ['autobpm']];
      case 'importLeftovers': {
        const parados = await this.dep.escanearDownloads(this.dep.pastas(dir).downloads, this.dep.agora());
        if (parados.length === 0) return [];
        return [['import', '-q', '-s', ...parados.map((p) => `${DOWNLOADS_NO_CONTEINER}/${p.nome}`)]];
      }
    }
  }

  private terminar(op: { id: string; tarefa: TarefaManutencao }, erro: AppError | null): void {
    if (this.atual?.id !== op.id) return;
    this.atual = null;
    this.pararAtual = null;
    this.esquecerLeitura();
    this.dep.emitir(
      erro
        ? { type: 'library.end', id: op.id, tarefa: op.tarefa, ok: false, error: erro }
        : { type: 'library.end', id: op.id, tarefa: op.tarefa, ok: true },
    );
  }

  private log(id: string, linha: string): void {
    this.dep.emitir({ type: 'library.log', id, linha: redigirSegredos(linha) });
  }

  private async faixasDoFiltro(
    dir: string,
    termos: readonly string[],
  ): Promise<{ ok: true; faixas: ReturnType<typeof lerFaixas>['faixas'] } | { ok: false; erro: AppError }> {
    const r = await this.beet(dir, ['ls', '-f', FORMATO_LS, ...termos], 'conferir o filtro', TIMEOUT_LS_MS);
    if (!r.ok) return r;
    return { ok: true, faixas: lerFaixas(r.saida).faixas };
  }

  /** Roda um comando do beets e espera. Falha do comando, tempo esgotado e Docker ausente viram erros do catálogo. */
  private async beet(
    dir: string,
    args: readonly string[],
    oQue: string,
    timeoutMs: number,
  ): Promise<{ ok: true; saida: string; avisos: string } | { ok: false; erro: AppError }> {
    const r = await this.dep.docker.exec(dir, 'soulbeet', comandoDoBeet(args), timeoutMs, PASTA_DE_TRABALHO);
    if (r.erroSpawn) return { ok: false, erro: criarErro('docker.ausente') };
    if (r.tempoEsgotado) {
      return {
        ok: false,
        erro: criarErro('biblioteca.falhou', { tarefa: oQue, detalhes: 'O beets não respondeu a tempo.' }),
      };
    }
    if (r.codigo !== 0) {
      // `remove` sem faixas e `ls` com erro de consulta saem com 1: a mensagem do beets vai nos detalhes
      const texto = semAnsi(`${r.stderr}\n${r.stdout}`)
        .split('\n')
        .filter((l) => l.trim())
        .slice(-LINHAS_DE_DETALHE)
        .join('\n');
      return { ok: false, erro: criarErro('biblioteca.falhou', { tarefa: oQue, detalhes: redigirSegredos(texto) }) };
    }
    // o beets escreve o resultado (a lista) no stdout, mas os resumos ("Moving 1 item (1 already in place).") no stderr
    return { ok: true, saida: r.stdout, avisos: r.stderr };
  }

  /** Erro de ambiente que impede qualquer coisa com o beets, ou a pasta do projeto se está tudo pronto. */
  private async precondicoes(escrita: boolean): Promise<{ dir: string } | AppError> {
    let status = this.dep.health.atual;
    if (!status.docker.engine) status = await this.dep.health.atualizar();
    if (status.docker.instalacao === 'ausente') return criarErro('docker.ausente');
    if (status.docker.instalacao === 'fora-do-path') return criarErro('docker.fora-do-path');
    if (!status.docker.engine) return criarErro('docker.fechado');
    const dir = this.dep.projeto().dir;
    if (!dir) return criarErro('projeto.ausente');
    // nenhuma operação sem a stack no ar (§5, Fase 5): o beets mora no contêiner do Soulbeet
    if (servicoDe(status, 'soulbeet').container !== 'running') return criarErro('biblioteca.stack-fora');
    if (escrita && (await this.dep.loteRodando())) return criarErro('biblioteca.ocupada');
    return { dir };
  }

  private lembrarCaminhos(musica: string, faixas: readonly { id: number; arquivo: string }[]): void {
    this.raizMusica = musica;
    this.caminhos = new Map(faixas.map((f) => [f.id, join(musica, ...f.arquivo.split('/'))]));
  }

  private esquecerLeitura(): void {
    this.caminhos = new Map();
  }

  // ------------------------------------------------------------ tokens

  private criarToken(t: Omit<Token, 'expiraEm'>): string {
    const agora = this.dep.agora();
    for (const [k, v] of this.tokens) if (v.expiraEm <= agora) this.tokens.delete(k);
    while (this.tokens.size >= MAX_TOKENS) {
      const velho = this.tokens.keys().next().value;
      if (velho === undefined) break;
      this.tokens.delete(velho);
    }
    const token = this.dep.novoToken();
    this.tokens.set(token, { ...t, expiraEm: agora + VALIDADE_DO_TOKEN_MS });
    return token;
  }

  /** O token vale uma vez, para o mesmo tipo e a mesma chave, e enquanto não expirou. */
  private consumirToken(token: string, tipo: TipoToken, chave: string): Token | null {
    const t = this.tokens.get(token);
    if (!t) return null;
    this.tokens.delete(token);
    return t.tipo === tipo && t.chave === chave && t.expiraEm > this.dep.agora() ? t : null;
  }
}

/** "Não consegui <tarefa>" no cartão de erro. */
const TITULO_DA_TAREFA: Record<TarefaManutencao, string> = {
  update: 'sincronizar a biblioteca com o disco',
  move: 'reorganizar as pastas',
  tomEBpm: 'recalcular o tom e o BPM',
  importLeftovers: 'importar o que sobrou em downloads/',
};
