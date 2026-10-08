// RelatoriosService (ReportService, §3.2): lê e interpreta `lotes/` (Fase 4). O histórico lista as execuções que estão
// lá, as do app (arquivo de eventos, P3) e as do `.bat` (só o `resultado-*.txt`); o detalhe e o diagnóstico vêm da mesma
// leitura. Também cuida do que muda arquivo: corrigir uma linha pela sugestão, gerar a lista do "tentar de novo",
// apagar execuções antigas (para a Lixeira) e reprocessar uma lista do zero. O renderer só fala em id de execução e
// chave de faixa: todo caminho é montado aqui dentro da pasta do Soulcrate.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { lerLinhaEvento, type EventoLote, type Progress, type RunEnd, type RunStart } from '@shared/eventos-lote';
import {
  contarStatus,
  dataDoId,
  detalharExecucao,
  diagnosticarFaixa,
  lerDiagnosticoTexto,
  lerExecucaoDeEventos,
  lerResultadoAntigo,
  linhasParaTentarDeNovo,
  resumirExecucao,
  type ArquivoRelatorio,
  type ArquivoRelatorioInfo,
  type CorrecaoFaixa,
  type CriterioLimpeza,
  type DadosDoResumo,
  type EstadoDaLista,
  type ExecucaoBruta,
  type ExecucaoDetalhe,
  type ExecucaoResumo,
  type FaixaBase,
  type FaixaHistorico,
  type FonteExecucao,
  type MotivoListaNaoAtualizada,
  type NovaTentativa,
  type PreviaLimpeza,
  type ResultadoCorrecao,
  type ResultadoLimpeza,
} from '@shared/historico';
import { ehIdDeExecucao, nomeDeListaValido, nomeDoEstado, tipoDaLista } from '@shared/lote';
import { separarLinha } from '@shared/lote-estado';
import { normalizar, semBom } from '@shared/texto';
import type { ProjetoStatus } from '@shared/stack';
import { indexarBiblioteca, localizarNaBiblioteca, type IndiceBiblioteca } from './arquivos-biblioteca';
import type { ListasService } from './listas-service';
import { lerTrava } from './lote-service';

type TipoNoDisco =
  | 'eventos'
  | 'saida'
  | 'erro'
  | 'parar'
  | 'resultado'
  | 'nao-baixadas'
  | 'diagnostico'
  | 'catalogo'
  | 'beets'
  | 'execucao';

/** Os arquivos que uma execução deixa em `lotes/`: `<prefixo>-<id>.<ext>`. O `id` é só o que vem depois do prefixo. */
const PADROES: readonly { tipo: TipoNoDisco; re: RegExp }[] = [
  { tipo: 'eventos', re: /^eventos-(.+)\.jsonl$/ },
  { tipo: 'saida', re: /^saida-(.+)\.log$/ },
  { tipo: 'erro', re: /^erro-(.+)\.log$/ },
  { tipo: 'parar', re: /^parar-(.+)\.flag$/ },
  { tipo: 'resultado', re: /^resultado-(.+)\.txt$/ },
  { tipo: 'nao-baixadas', re: /^nao-baixadas-(.+)\.txt$/ },
  { tipo: 'diagnostico', re: /^diagnostico-(.+)\.txt$/ },
  { tipo: 'catalogo', re: /^catalogo-(.+)\.txt$/ },
  { tipo: 'beets', re: /^beets-(.+)\.log$/ },
  { tipo: 'execucao', re: /^execucao-(.+)\.log$/ },
];

/** Os relatórios que o detalhe lista, na ordem do protótipo. */
const RELATORIOS: readonly { tipo: ArquivoRelatorio; no: TipoNoDisco }[] = [
  { tipo: 'resultado', no: 'resultado' },
  { tipo: 'nao-baixadas', no: 'nao-baixadas' },
  { tipo: 'diagnostico', no: 'diagnostico' },
  { tipo: 'catalogo', no: 'catalogo' },
  { tipo: 'beets', no: 'beets' },
  { tipo: 'log', no: 'execucao' },
];

interface ArquivoNoDisco {
  nome: string;
  bytes: number;
  mtimeMs: number;
}
type ArquivosDoId = Partial<Record<TipoNoDisco, ArquivoNoDisco>>;

/** Quantas execuções o histórico lê ao mesmo tempo. */
const LEITURAS_POR_VEZ = 16;
const PONTA_INICIO_BYTES = 64 * 1024;
const PONTA_FIM_BYTES = 128 * 1024;
/** O índice de `music/` vale por este tempo: abrir o diagnóstico e o detalhe em sequência não repete a leitura. */
const VALIDADE_DO_INDICE_MS = 2 * 60_000;

export interface PastasDoProjeto {
  /** a biblioteca (`MUSIC_DIR`) e os downloads (`DOWNLOADS_DIR`), como caminhos absolutos */
  musica: string | null;
  downloads: string | null;
}

export interface DepsRelatorios {
  projeto(): ProjetoStatus;
  agora(): number;
  processoVivo(pid: number): boolean;
  pastas(dir: string): PastasDoProjeto;
  listas: Pick<ListasService, 'analisar' | 'ler' | 'salvar'>;
  /** manda o arquivo para a Lixeira (nunca apaga de vez) */
  descartar(caminho: string): Promise<void>;
  aoErro(e: unknown): void;
}

const ehExecucao = (a: ArquivosDoId): boolean => !!(a.eventos ?? a.resultado ?? a.execucao);

function lerEventosDoTexto(texto: string, aoErro: (e: unknown) => void): EventoLote[] {
  const eventos: EventoLote[] = [];
  for (const linha of texto.split('\n')) {
    try {
      const ev = lerLinhaEvento(linha);
      if (ev) eventos.push(ev);
    } catch (e) {
      aoErro(e); // uma linha ruim vai para o log e a leitura segue
    }
  }
  return eventos;
}

/** O começo e o fim de um arquivo de eventos, sem ler o meio (uma execução grande tem milhares de linhas). */
async function lerPontas(arquivo: string): Promise<{ inicio: string[]; fim: string[] }> {
  const fh = await open(arquivo, 'r');
  try {
    const { size } = await fh.stat();
    const ler = async (de: number, n: number): Promise<string> => {
      const buf = Buffer.alloc(n);
      const { bytesRead } = await fh.read(buf, 0, n, de);
      return buf.subarray(0, bytesRead).toString('utf8');
    };
    if (size <= PONTA_INICIO_BYTES + PONTA_FIM_BYTES) {
      const tudo = (await ler(0, size)).split('\n');
      return { inicio: tudo, fim: tudo };
    }
    const inicio = (await ler(0, PONTA_INICIO_BYTES)).split('\n');
    inicio.pop(); // a última linha do pedaço pode estar cortada
    const fim = (await ler(size - PONTA_FIM_BYTES, PONTA_FIM_BYTES)).split('\n');
    fim.shift(); // e a primeira também
    return { inicio, fim };
  } finally {
    await fh.close();
  }
}

export class RelatoriosService {
  private indice: { raiz: string; em: number; dados: IndiceBiblioteca } | null = null;

  constructor(private readonly d: DepsRelatorios) {}

  // ------------------------------------------------------------ histórico

  /** Todas as execuções de `lotes/`, a mais recente primeiro. */
  async listar(): Promise<ExecucaoResumo[]> {
    const dir = this.d.projeto().dir;
    if (!dir) return [];
    const todos = await this.descobrir(dir);
    const vivos = this.idsRodando(dir);
    const agora = this.d.agora();
    // algumas por vez: um histórico com centenas de execuções não abre centenas de arquivos ao mesmo tempo
    const entradas = [...todos.entries()];
    const resumos: (ExecucaoResumo | null)[] = [];
    for (let i = 0; i < entradas.length; i += LEITURAS_POR_VEZ) {
      resumos.push(
        ...(await Promise.all(
          entradas.slice(i, i + LEITURAS_POR_VEZ).map(async ([id, arq]) => {
            try {
              return await this.resumoRapido(dir, id, arq, vivos.has(id), agora);
            } catch (e) {
              this.d.aoErro(e);
              return null;
            }
          }),
        )),
      );
    }
    return resumos.filter((r): r is ExecucaoResumo => r !== null).sort((a, b) => b.inicio - a.inicio);
  }

  /** O detalhe de uma execução: faixas, diagnóstico de cada uma que não veio e a "tentar de novo" já montada. */
  async detalhe(runId: string): Promise<ExecucaoDetalhe | null> {
    const dir = this.d.projeto().dir;
    if (!dir) return null;
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) return null;
    const bruta = await this.carregar(dir, runId, arq);
    const agora = this.d.agora();
    const resumo = resumirExecucao(this.dadosDoResumo(runId, arq, bruta, this.idsRodando(dir).has(runId), agora));

    const arquivoDaRetentativa = `nao-baixadas-${runId}.txt`;
    const parte = detalharExecucao(bruta, {
      correcoes: this.lerCorrecoes(dir, runId),
      retentar: existsSync(join(dir, 'lotes', `estado-${nomeDoEstado(arquivoDaRetentativa)}.tsv`)),
      arquivoDaRetentativa,
    });

    const porChave = new Map(bruta.faixas.map((f) => [f.key, f]));
    const janela = {
      inicio: resumo.inicio,
      fim: resumo.fim === 'rodando' ? null : resumo.inicio + (resumo.duracaoMs ?? 0),
    };
    const faixas: FaixaHistorico[] = [];
    for (const f of parte.faixas) {
      const base = porChave.get(f.key);
      const achado = base && PRECISA_DE_ARQUIVO.has(f.status) ? await this.localizar(dir, base, janela) : null;
      faixas.push(achado ? { ...f, arquivo: { caminho: achado.mostrar, onde: achado.onde } } : f);
    }

    const estado = this.arquivoDeEstado(dir, bruta);
    const lista = resumo.lista;
    return {
      resumo,
      listaExiste: !!lista && nomeDeListaValido(lista) && existsSync(join(dir, lista)),
      opcoes: parte.opcoes,
      faixas,
      filtros: parte.filtros,
      arquivos: this.infoArquivos(arq),
      diagnosticos: parte.diagnosticos,
      retentativa: parte.retentativa,
      podeReprocessar: !!estado && existsSync(estado.abs),
    };
  }

  /** Caminho absoluto de um relatório da execução (só dentro de `lotes/`), ou null se não existe. */
  async caminhoDoArquivo(runId: string, tipo: ArquivoRelatorio): Promise<string | null> {
    const dir = this.d.projeto().dir;
    if (!dir) return null;
    const arq = (await this.descobrir(dir)).get(runId);
    const no = RELATORIOS.find((r) => r.tipo === tipo)?.no;
    const achado = no ? arq?.[no] : undefined;
    if (!achado) return null;
    const abs = resolve(dir, 'lotes', achado.nome);
    return abs.startsWith(resolve(dir, 'lotes') + sep) && existsSync(abs) ? abs : null;
  }

  /** O arquivo de uma faixa, para "Mostrar no Explorer": só dentro da biblioteca ou dos downloads. */
  async caminhoDaFaixa(runId: string, key: string): Promise<string | null> {
    const dir = this.d.projeto().dir;
    if (!dir) return null;
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) return null;
    const bruta = await this.carregar(dir, runId, arq);
    const faixa = bruta.faixas.find((f) => f.key === key);
    if (!faixa) return null;
    const resumo = resumirExecucao(
      this.dadosDoResumo(runId, arq, bruta, this.idsRodando(dir).has(runId), this.d.agora()),
    );
    const achado = await this.localizar(dir, faixa, {
      inicio: resumo.inicio,
      fim: resumo.fim === 'rodando' ? null : resumo.inicio + (resumo.duracaoMs ?? 0),
    });
    if (!achado) return null;
    const { musica, downloads } = this.d.pastas(dir);
    const dentro = (raiz: string | null) =>
      !!raiz && (achado.abs + sep).toLowerCase().startsWith((resolve(raiz) + sep).toLowerCase());
    return dentro(musica) || dentro(downloads) || dentro(dir) ? achado.abs : null;
  }

  /** O número da linha de cada faixa que não veio dentro da lista (`-SoAnalisar`); null se a lista não está mais lá. */
  async linhasNaLista(runId: string): Promise<Record<string, number> | null> {
    const dir = this.d.projeto().dir;
    if (!dir) return null;
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) return null;
    const bruta = await this.carregar(dir, runId, arq);
    const lista = bruta.inicioEvento?.list;
    if (!lista || !nomeDeListaValido(lista) || !existsSync(join(dir, lista))) return null;
    try {
      const r = await this.d.listas.analisar(dir, lista, { biblioteca: false, retentar: false });
      if (!r.analise.ok) return null;
      const saida: Record<string, number> = {};
      const faltam = new Set(
        bruta.faixas.filter((f) => f.status === 'nao encontrada' || f.status === 'falhou').map((f) => f.key),
      );
      for (const l of r.analise.lines) {
        if (faltam.has(l.key) && saida[l.key] === undefined && l.status !== 'repetida') saida[l.key] = l.sourceLine;
      }
      return saida;
    } catch (e) {
      this.d.aoErro(e);
      return null;
    }
  }

  // ------------------------------------------------------------ correção e "tentar de novo"

  /**
   * "Talvez seja": troca o título da linha pelo escolhido. A correção fica guardada (entra no "tentar de novo") e,
   * se a lista da execução ainda existe e a linha continua igual, ela também é reescrita lá.
   */
  async corrigir(
    runId: string,
    key: string,
    titulo: string,
    opcoes: { atualizarLista: boolean },
  ): Promise<ResultadoCorrecao> {
    const dir = this.exigirDir();
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) throw new Error('Execução não encontrada.');
    const bruta = await this.carregar(dir, runId, arq);
    const faixa = bruta.faixas.find((f) => f.key === key && (f.status === 'nao encontrada' || f.status === 'falhou'));
    if (!faixa) throw new Error('Esta faixa não está entre as que não vieram.');

    const diag = diagnosticarFaixa(faixa, bruta, null);
    const permitidos = new Set([...diag.sugestoes, ...diag.catalogo.map((c) => c.titulo)]);
    if (!permitidos.has(titulo)) throw new Error('Esse título não está entre as sugestões da faixa.');
    const { artista } = separarLinha(faixa.linha);
    if (!artista) throw new Error('A linha não tem o " - " entre artista e título: corrija-a na lista.');
    const linhaNova = `${artista} - ${titulo}`;

    const correcoes = this.lerCorrecoes(dir, runId);
    const anterior = correcoes[key] ?? null;
    let listaDaCorrecao: CorrecaoFaixa['lista'] = anterior?.lista ?? null;
    let motivo: MotivoListaNaoAtualizada | null;
    if (opcoes.atualizarLista) {
      const r = await this.reescreverNaLista(dir, bruta, faixa, linhaNova, anterior);
      if (r.lista) listaDaCorrecao = r.lista;
      motivo = r.motivo;
    } else {
      motivo = 'editando';
    }
    const atualizada = motivo === null && listaDaCorrecao !== null;
    const correcao: CorrecaoFaixa = {
      titulo,
      linha: linhaNova,
      // sem reescrever agora, a linha que o app deixou da correção anterior continua lá: "Desfazer" ainda a restaura
      lista: atualizada ? listaDaCorrecao : (anterior?.lista ?? null),
      em: new Date(this.d.agora()).toISOString(),
    };
    correcoes[key] = correcao;
    this.gravarCorrecoes(dir, runId, correcoes);
    return { correcao, listaAtualizada: atualizada, motivoNaoAtualizada: atualizada ? null : motivo };
  }

  /** Desfaz a correção: devolve a linha original à lista (se ela ainda está como o app a deixou) e esquece a escolha. */
  async desfazerCorrecao(runId: string, key: string, opcoes: { atualizarLista: boolean }): Promise<boolean> {
    const dir = this.exigirDir();
    const correcoes = this.lerCorrecoes(dir, runId);
    const c = correcoes[key];
    if (!c) return false;
    // a lista está aberta no editor com texto não salvo: o app não escreve por baixo dele nem esquece a correção
    if (c.lista && !opcoes.atualizarLista) {
      throw new Error('A lista está aberta no editor com alterações não salvas. Salve-as e desfaça de novo.');
    }
    let restaurada = false;
    if (c.lista && nomeDeListaValido(c.lista.nome) && existsSync(join(dir, c.lista.nome))) {
      const linhas = this.d.listas.ler(dir, c.lista.nome).texto.split('\n');
      if (linhas[c.lista.numero - 1] === c.lista.escrita) {
        linhas[c.lista.numero - 1] = c.lista.original;
        this.d.listas.salvar(dir, c.lista.nome, linhas.join('\n'));
        restaurada = true;
      }
    }
    this.gravarCorrecoes(dir, runId, Object.fromEntries(Object.entries(correcoes).filter(([k]) => k !== key)));
    return restaurada;
  }

  /** Gera `nao-baixadas-<id>.txt` com as linhas que falharam (e as correções) e devolve as opções com que o lote abre. */
  async novaTentativa(runId: string): Promise<NovaTentativa> {
    const dir = this.exigirDir();
    const detalhe = await this.detalhe(runId);
    if (!detalhe?.retentativa) throw new Error('Esta execução não tem faixas para tentar de novo.');
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) throw new Error('Execução não encontrada.');
    const bruta = await this.carregar(dir, runId, arq);
    const linhas = linhasParaTentarDeNovo(bruta.faixas, this.lerCorrecoes(dir, runId));
    const lista = this.d.listas.salvar(dir, detalhe.retentativa.arquivo, linhas.join('\n'));
    return { lista, retentativa: detalhe.retentativa };
  }

  // ------------------------------------------------------------ manutenção dos relatórios

  async previaDaLimpeza(criterio: CriterioLimpeza): Promise<PreviaLimpeza> {
    const { execucoes, arquivos, bytes } = await this.selecionarParaLimpar(criterio);
    return { execucoes: execucoes.length, arquivos: arquivos.length, bytes };
  }

  /** Manda os arquivos das execuções escolhidas para a Lixeira. Nunca mexe no que está rodando nem na memória das listas. */
  async limpar(criterio: CriterioLimpeza): Promise<ResultadoLimpeza> {
    const sel = await this.selecionarParaLimpar(criterio);
    const porId = new Map<string, { total: number; ok: number }>();
    let bytes = 0;
    let falhas = 0;
    let feitos = 0;
    for (const a of sel.arquivos) {
      const g = porId.get(a.id) ?? { total: 0, ok: 0 };
      g.total++;
      try {
        await this.d.descartar(a.caminho);
        g.ok++;
        feitos++;
        bytes += a.bytes;
      } catch (e) {
        falhas++;
        this.d.aoErro(e);
      }
      porId.set(a.id, g);
    }
    const execucoes = [...porId.values()].filter((g) => g.ok === g.total).length;
    return { execucoes, arquivos: feitos, bytes, falhas };
  }

  /** A memória (`estado-<lista>.tsv`) da lista da execução, ou null se não há (ou não se sabe qual é). */
  async estadoDaLista(runId: string): Promise<EstadoDaLista | null> {
    const dir = this.d.projeto().dir;
    if (!dir) return null;
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) return null;
    const bruta = await this.carregar(dir, runId, arq);
    const estado = this.arquivoDeEstado(dir, bruta);
    if (!estado || !existsSync(estado.abs)) return null;
    const chaves = new Set<string>();
    for (const l of semBom(readFileSync(estado.abs, 'utf8')).split(/\r?\n/)) {
      const k = l.split('\t')[1];
      if (k) chaves.add(k);
    }
    const trava = lerTrava(join(dir, 'lotes', estado.nome.replace(/\.tsv$/, '.lock')));
    return {
      lista: bruta.inicioEvento?.list ?? estado.nome,
      faixas: chaves.size,
      rodando: !!trava && this.d.processoVivo(trava.pid),
    };
  }

  /** "Reprocessar a lista do zero": a memória vai para a Lixeira e a próxima execução não pula mais nada. */
  async reprocessarLista(runId: string): Promise<boolean> {
    const dir = this.exigirDir();
    const estado = await this.estadoDaLista(runId);
    if (!estado) return false;
    if (estado.rodando) throw new Error('Esta lista está rodando agora.');
    const arq = (await this.descobrir(dir)).get(runId);
    if (!arq) return false;
    const bruta = await this.carregar(dir, runId, arq);
    const alvo = this.arquivoDeEstado(dir, bruta);
    if (!alvo || !existsSync(alvo.abs)) return false;
    await this.d.descartar(alvo.abs);
    return true;
  }

  // ------------------------------------------------------------ leitura

  private exigirDir(): string {
    const dir = this.d.projeto().dir;
    if (!dir) throw new Error('Escolha a pasta do Soulcrate primeiro.');
    return dir;
  }

  /** Os arquivos de `lotes/` agrupados pelo id da execução (só os ids que são mesmo uma execução). */
  private async descobrir(dir: string): Promise<Map<string, ArquivosDoId>> {
    const lotes = join(dir, 'lotes');
    let nomes: string[];
    try {
      nomes = await readdir(lotes);
    } catch {
      return new Map();
    }
    const porId = new Map<string, ArquivosDoId>();
    for (const nome of nomes) {
      for (const p of PADROES) {
        const id = p.re.exec(nome)?.[1];
        if (!id) continue;
        if (!ehIdDeExecucao(id)) break;
        const st = await stat(join(lotes, nome)).catch(() => null);
        if (st?.isFile()) {
          const a = porId.get(id) ?? {};
          a[p.tipo] = { nome, bytes: st.size, mtimeMs: st.mtimeMs };
          porId.set(id, a);
        }
        break;
      }
    }
    for (const [id, a] of porId) if (!ehExecucao(a)) porId.delete(id);
    return porId;
  }

  /** Ids das execuções cuja trava (P8) tem um processo vivo: as que estão rodando agora, pelo app ou pelo `.bat`. */
  private idsRodando(dir: string): Set<string> {
    const vivos = new Set<string>();
    let nomes: string[];
    try {
      nomes = readdirSync(join(dir, 'lotes'));
    } catch {
      return vivos;
    }
    for (const nome of nomes) {
      if (!/^estado-.+\.lock$/.test(nome)) continue;
      const t = lerTrava(join(dir, 'lotes', nome));
      if (t && ehIdDeExecucao(t.id) && this.d.processoVivo(t.pid)) vivos.add(t.id);
    }
    return vivos;
  }

  private fonteDe(arq: ArquivosDoId): FonteExecucao {
    return arq.eventos ? 'eventos' : arq.resultado ? 'resultado' : 'log';
  }

  private dadosDoResumo(
    id: string,
    arq: ArquivosDoId,
    bruta: Pick<ExecucaoBruta, 'inicioEvento' | 'fimEvento' | 'progresso' | 'faixas'>,
    rodando: boolean,
    agora: number,
  ): DadosDoResumo {
    const fonte = this.fonteDe(arq);
    const principal = arq.eventos ?? arq.resultado ?? arq.execucao;
    return {
      id,
      fonte,
      inicioEvento: bruta.inicioEvento,
      fimEvento: bruta.fimEvento,
      progresso: bruta.progresso,
      summary: bruta.fimEvento?.summary ?? (bruta.faixas.length > 0 ? contarStatus(bruta.faixas) : null),
      inicioMs: dataDoId(id) ?? principal?.mtimeMs ?? agora,
      fimMs: fonte === 'eventos' ? null : (principal?.mtimeMs ?? null),
      rodando,
      agora,
    };
  }

  /** A linha do histórico sem ler a execução inteira: para o arquivo de eventos, só o começo e o fim dele. */
  private async resumoRapido(
    dir: string,
    id: string,
    arq: ArquivosDoId,
    rodando: boolean,
    agora: number,
  ): Promise<ExecucaoResumo> {
    if (arq.eventos) {
      const { inicio, fim } = await lerPontas(join(dir, 'lotes', arq.eventos.nome));
      const doInicio = lerEventosDoTexto(inicio.join('\n'), this.d.aoErro);
      const doFim = lerEventosDoTexto(fim.join('\n'), this.d.aoErro);
      const inicioEvento = (doInicio.find((e) => e.type === 'run.start') as RunStart | undefined) ?? null;
      const fimEvento = (doFim.findLast((e) => e.type === 'run.end') as RunEnd | undefined) ?? null;
      const progresso = (doFim.findLast((e) => e.type === 'progress') as Progress | undefined) ?? null;
      return resumirExecucao(
        this.dadosDoResumo(id, arq, { inicioEvento, fimEvento, progresso, faixas: [] }, rodando, agora),
      );
    }
    const bruta = await this.carregar(dir, id, arq);
    return resumirExecucao(this.dadosDoResumo(id, arq, bruta, rodando, agora));
  }

  /** A execução inteira: os eventos, ou o `resultado-*.txt` (e o `diagnostico-*.txt`) das antigas. */
  private async carregar(dir: string, id: string, arq: ArquivosDoId): Promise<ExecucaoBruta> {
    const lotes = join(dir, 'lotes');
    if (arq.eventos) {
      const texto = await readFile(join(lotes, arq.eventos.nome), 'utf8');
      return lerExecucaoDeEventos(id, lerEventosDoTexto(texto, this.d.aoErro));
    }
    if (arq.resultado) {
      const bruta = lerResultadoAntigo(id, await readFile(join(lotes, arq.resultado.nome), 'utf8'));
      if (arq.diagnostico) {
        const diag = lerDiagnosticoTexto(await readFile(join(lotes, arq.diagnostico.nome), 'utf8'));
        for (const f of bruta.faixas) {
          const d = diag[f.key];
          if (d) bruta.diagnosticos[f.key] = d;
        }
      }
      return bruta;
    }
    return {
      id,
      fonte: 'log',
      inicioEvento: null,
      fimEvento: null,
      progresso: null,
      faixas: [],
      diagnosticos: {},
      catalogo: {},
      tentativas: {},
      arquivos: {},
    };
  }

  private infoArquivos(arq: ArquivosDoId): ArquivoRelatorioInfo[] {
    const saida: ArquivoRelatorioInfo[] = [];
    for (const r of RELATORIOS) {
      const a = arq[r.no];
      if (a) saida.push({ tipo: r.tipo, nome: a.nome, bytes: a.bytes });
    }
    return saida;
  }

  /** `lotes/estado-<lista>.tsv` da execução: o que ela registrou, ou o nome calculado a partir da lista. */
  private arquivoDeEstado(dir: string, bruta: ExecucaoBruta): { abs: string; nome: string } | null {
    const lotes = resolve(dir, 'lotes');
    const registrado = bruta.arquivos.state;
    let nome: string | null = null;
    if (registrado && /^lotes[\\/]estado-[^\\/]+\.tsv$/.test(registrado))
      nome = basename(registrado.replace(/\\/g, '/'));
    else if (bruta.inicioEvento)
      nome = `estado-${nomeDoEstado(basename(bruta.inicioEvento.list.replace(/\\/g, '/')))}.tsv`;
    if (!nome) return null;
    const abs = resolve(lotes, nome);
    return abs.startsWith(lotes + sep) ? { abs, nome } : null;
  }

  // ------------------------------------------------------------ arquivos das faixas

  private async indiceDaBiblioteca(raiz: string): Promise<IndiceBiblioteca> {
    const agora = this.d.agora();
    if (this.indice && this.indice.raiz === raiz && agora - this.indice.em < VALIDADE_DO_INDICE_MS)
      return this.indice.dados;
    const dados = await indexarBiblioteca(raiz);
    this.indice = { raiz, em: agora, dados };
    return dados;
  }

  /** O arquivo da faixa: o baixado em downloads/ enquanto o beets não o moveu; depois, o que está em music/. */
  private async localizar(
    dir: string,
    f: FaixaBase,
    janela: { inicio: number; fim: number | null },
  ): Promise<{ abs: string; mostrar: string; onde: 'biblioteca' | 'downloads' } | null> {
    const { musica, downloads } = this.d.pastas(dir);
    if (f.local) {
      const abs = resolve(dir, f.local);
      if (existsSync(abs)) return { abs, mostrar: mostrarCaminho(abs, 'downloads', downloads, dir), onde: 'downloads' };
    }
    if (!musica || !existsSync(musica)) return null;
    const indice = await this.indiceDaBiblioteca(musica);
    const { artista, titulo } = separarLinha(f.linha);
    const rel = localizarNaBiblioteca(indice, { artista, titulo, local: f.local, formato: f.formato }, janela, (r) => {
      try {
        return statSync(join(musica, r)).mtimeMs;
      } catch {
        return null;
      }
    });
    if (!rel) return null;
    return { abs: join(musica, rel), mostrar: `music/${rel}`, onde: 'biblioteca' };
  }

  // ------------------------------------------------------------ correções

  private arquivoDeCorrecoes(dir: string, id: string): string {
    return join(dir, '.soulcrate', `correcoes-${id}.json`);
  }

  private lerCorrecoes(dir: string, id: string): Record<string, CorrecaoFaixa> {
    try {
      const o = JSON.parse(semBom(readFileSync(this.arquivoDeCorrecoes(dir, id), 'utf8'))) as {
        v?: number;
        correcoes?: Record<string, CorrecaoFaixa>;
      };
      const lidas = o.v === 1 && o.correcoes && typeof o.correcoes === 'object' ? o.correcoes : {};
      return Object.assign(Object.create(null) as Record<string, CorrecaoFaixa>, lidas);
    } catch {
      return Object.create(null) as Record<string, CorrecaoFaixa>;
    }
  }

  private gravarCorrecoes(dir: string, id: string, correcoes: Record<string, CorrecaoFaixa>): void {
    const arquivo = this.arquivoDeCorrecoes(dir, id);
    mkdirSync(join(dir, '.soulcrate'), { recursive: true });
    const tmp = `${arquivo}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ v: 1, correcoes }, null, 2)}\n`, 'utf8');
    renameSync(tmp, arquivo);
  }

  /** Troca a linha na lista da execução, se ela ainda existe, é `.txt` e a linha continua como estava. */
  private async reescreverNaLista(
    dir: string,
    bruta: ExecucaoBruta,
    faixa: FaixaBase,
    linhaNova: string,
    anterior: CorrecaoFaixa | null,
  ): Promise<{ lista: CorrecaoFaixa['lista']; motivo: MotivoListaNaoAtualizada | null }> {
    const nome = bruta.inicioEvento?.list;
    if (!nome || !nomeDeListaValido(nome) || !existsSync(join(dir, nome))) return { lista: null, motivo: 'sem-lista' };
    if (tipoDaLista(nome) === 'csv') return { lista: null, motivo: 'csv' };

    let linhas = this.d.listas.ler(dir, nome).texto.split('\n');
    let numero: number;
    let original: string;
    const antes = anterior?.lista;
    if (antes && antes.nome === nome && linhas[antes.numero - 1] === antes.escrita) {
      // já corrigida antes por este app: a linha está onde a deixamos
      numero = antes.numero;
      original = antes.original;
    } else {
      const r = await this.d.listas.analisar(dir, nome, { biblioteca: false, retentar: false });
      if (!r.analise.ok) return { lista: null, motivo: 'nao-achou' };
      // a análise leva alguns segundos: o que está no arquivo agora é o que vale (alguém pode tê-lo salvo nesse meio-tempo)
      linhas = this.d.listas.ler(dir, nome).texto.split('\n');
      const l = r.analise.lines.find((x) => x.key === faixa.key && x.status !== 'repetida');
      const bruto = l ? linhas[l.sourceLine - 1] : undefined;
      // a linha precisa conter o título antigo: se a lista foi mexida depois da execução, não se escreve às cegas
      if (!l || bruto === undefined || !normalizar(bruto).includes(normalizar(separarLinha(faixa.linha).titulo))) {
        return { lista: null, motivo: 'nao-achou' };
      }
      numero = l.sourceLine;
      original = bruto;
    }
    linhas[numero - 1] = linhaNova;
    this.d.listas.salvar(dir, nome, linhas.join('\n'));
    return { lista: { nome, numero, original, escrita: linhaNova }, motivo: null };
  }

  // ------------------------------------------------------------ limpeza

  private async selecionarParaLimpar(
    criterio: CriterioLimpeza,
  ): Promise<{ execucoes: string[]; arquivos: { id: string; caminho: string; bytes: number }[]; bytes: number }> {
    const dir = this.exigirDir();
    const agora = this.d.agora();
    const resumos = (await this.listar()).filter((r) => r.fim !== 'rodando');
    let escolhidas: ExecucaoResumo[];
    if (criterio.tipo === 'idade') {
      const limite = agora - criterio.dias * 86_400_000;
      escolhidas = resumos.filter((r) => r.inicio < limite);
    } else {
      escolhidas = resumos.slice(Math.max(0, criterio.quantas)); // `listar` já vem da mais recente para a mais antiga
    }
    const todos = await this.descobrir(dir);
    const arquivos: { id: string; caminho: string; bytes: number }[] = [];
    for (const r of escolhidas) {
      const arq = todos.get(r.id);
      if (!arq) continue;
      for (const a of Object.values(arq)) {
        arquivos.push({ id: r.id, caminho: join(dir, 'lotes', a.nome), bytes: a.bytes });
      }
      const correcoes = this.arquivoDeCorrecoes(dir, r.id);
      if (existsSync(correcoes)) arquivos.push({ id: r.id, caminho: correcoes, bytes: statSync(correcoes).size });
    }
    return { execucoes: escolhidas.map((r) => r.id), arquivos, bytes: arquivos.reduce((t, a) => t + a.bytes, 0) };
  }
}

/** O que o app tenta achar no disco: as faixas que chegaram à biblioteca (ou à pasta de downloads). */
const PRECISA_DE_ARQUIVO = new Set(['importada', 'baixada', 'baixada (beets falhou)', 'ja na biblioteca', 'ja feita']);

/** `downloads/Artista/Faixa.flac`: relativo à pasta de downloads quando o arquivo está nela; senão, o caminho inteiro. */
function mostrarCaminho(abs: string, prefixo: string, raiz: string | null, dir: string): string {
  const rel = (base: string | null) => {
    if (!base) return null;
    const r = relative(resolve(base), abs);
    return r && !r.startsWith('..') && !/^[A-Za-z]:/.test(r) ? r.split(sep).join('/') : null;
  };
  const dentro = rel(raiz);
  if (dentro !== null) return `${prefixo}/${dentro}`;
  return rel(dir) ?? abs.split(sep).join('/');
}
