// Tela Biblioteca (protótipo "Biblioteca", Fase 5): o caixote. A tabela das faixas (artista, título, BPM, tom, gênero,
// formato) lida do beets, os indicadores que filtram o que está faltando, a manutenção, o compartilhamento do slskd e
// o caminho para o Rekordbox. Remover e as tarefas que mexem nos arquivos passam por diálogos com pré-visualização.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  contarIndicadores,
  filtrarFaixas,
  type FaixaDaBiblioteca,
  type IndicadorId,
  type LeituraBiblioteca,
  type TarefaManutencao,
} from '@shared/biblioteca';
import { msg } from '@shared/mensagens';
import { servicoDe, servicoSaudavel } from '@shared/stack';
import { DialogoManutencao } from '../components/biblioteca/DialogoManutencao';
import { DialogoRemover } from '../components/biblioteca/DialogoRemover';
import { CartaoErro } from '../components/CartaoErro';
import { Carregando, SemPasta, useSemPasta } from '../components/historico/estados';
import { IconeLixeira, IconePasta, IconeRecarregar } from '../components/icones';
import { TabelaVirtual } from '../components/TabelaVirtual';
import { Botao, CabecalhoPagina, Cartao, Chip, classeBotao, Rotulo } from '../components/ui';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import {
  CHAVE_BIBLIOTECA,
  desdeQuandoParado,
  manutencaoRodando,
  useCompartilhamento,
  useLeituraDaBiblioteca,
  useManutencao,
} from '../lib/biblioteca';
import { useAgora, useStackStatus } from '../lib/estado';

const COLUNAS = 'minmax(150px,1.2fr) minmax(220px,2.2fr) 70px 70px minmax(120px,1.1fr) 96px 84px';
const FALTA = 'font-bold text-chip-laranja';

// ---------------------------------------------------------------- Indicadores

const COR_DO_NUMERO = { zero: '#ece9e3', pendente: '#ff9a5c' } as const;

function Indicadores({
  leitura,
  selecionado,
  aoEscolher,
}: {
  leitura: LeituraBiblioteca;
  selecionado: IndicadorId | null;
  aoEscolher(id: IndicadorId | null): void;
}) {
  const t = msg.biblioteca.indicadores;
  const n = contarIndicadores(leitura.faixas, leitura.parados);
  const itens: { id: IndicadorId; nome: string; valor: number }[] = [
    { id: 'bpm', nome: t.bpm, valor: n.semBpm },
    { id: 'tom', nome: t.tom, valor: n.semTom },
    { id: 'gen', nome: t.gen, valor: n.semGenero },
    { id: 'dl', nome: t.dl, valor: n.parados },
  ];
  return (
    <div role="group" aria-label={t.grupo} className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[10px]">
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          className="ind"
          aria-pressed={selecionado === i.id}
          onClick={() => aoEscolher(selecionado === i.id ? null : i.id)}
          data-indicador={i.id}
        >
          <span className="lbl">{i.nome}</span>
          <span
            className="font-mono text-[26px] font-bold"
            style={{ color: i.valor > 0 ? COR_DO_NUMERO.pendente : COR_DO_NUMERO.zero }}
            data-valor={i.id}
          >
            {i.valor.toLocaleString('pt-BR')}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Tabela

function TabelaDeFaixas({
  leitura,
  indicador,
  aoRemover,
  aoImportar,
}: {
  leitura: LeituraBiblioteca;
  indicador: IndicadorId | null;
  aoRemover(f: FaixaDaBiblioteca): void;
  aoImportar(): void;
}) {
  const t = msg.biblioteca;
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const visiveis = useMemo(() => filtrarFaixas(leitura.faixas, busca, indicador), [leitura.faixas, busca, indicador]);

  async function mostrar(f: FaixaDaBiblioteca) {
    setAviso(null);
    const achou = await api.library.revealTrack(f.id).catch(() => false);
    if (!achou) setAviso(t.naoAchouArquivo);
  }

  const vazio =
    indicador === 'dl' ? (
      leitura.parados.length === 0 ? (
        <span data-testid="parados-nenhum">{t.parados.nenhum}</span>
      ) : (
        <span className="flex flex-col items-center gap-3" data-testid="parados-vazio">
          {leitura.parados.map((p) => (
            <span key={p.nome}>{t.parados.item(p.nome, p.arquivos, p.total)}</span>
          ))}
          <Botao pequeno onClick={aoImportar}>
            {t.parados.importarAgora}
          </Botao>
        </span>
      )
    ) : leitura.faixas.length === 0 ? (
      <span className="flex flex-col items-center gap-3" data-testid="biblioteca-vazia">
        <strong className="text-base text-texto">{t.vazioBiblioteca.titulo}</strong>
        <span>{t.vazioBiblioteca.corpo}</span>
        <Link className={classeBotao('primario', true)} to="/lista">
          {t.vazioBiblioteca.irParaLista}
        </Link>
      </span>
    ) : (
      t.vazioFiltro
    );

  return (
    <section className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-lg border border-borda bg-cartao">
      <div className="flex flex-wrap items-center gap-3 border-b border-borda-fraca px-4 py-3">
        <label className="flex h-10 min-w-[280px] flex-[1_1_280px] items-center gap-[10px] rounded-md border border-borda-forte bg-fundo px-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#868b93"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="sr-only">{t.buscar}</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t.placeholderBusca}
            className="h-[38px] min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            data-testid="busca"
          />
        </label>
        <span className="font-mono text-xs text-texto-mudo" data-testid="contagem">
          {t.contagem(visiveis.length, leitura.faixas.length)}
        </span>
      </div>
      {aviso ? (
        <p role="status" className="m-0 border-b border-borda-fraca px-4 py-2 text-[13px] text-chip-laranja">
          {aviso}
        </p>
      ) : null}
      <TabelaVirtual
        rotulo={t.tabela}
        colunas={COLUNAS}
        cabecalho={[
          t.colunas.artista,
          t.colunas.titulo,
          t.colunas.bpm,
          t.colunas.tom,
          t.colunas.genero,
          t.colunas.formato,
          t.colunas.acoes,
        ]}
        linhas={visiveis}
        alturaLinha={46}
        alturaMax={560}
        larguraMinima={760}
        chave={(f) => String(f.id)}
        vazio={vazio}
        testId="tabela-biblioteca"
        celulas={(f) => [
          <span
            key="a"
            className={`block truncate ${f.artista ? 'font-semibold' : 'text-texto-mudo'}`}
            title={f.artista}
          >
            {f.artista || '—'}
          </span>,
          <span key="t" className="block truncate" title={f.titulo}>
            {f.titulo}
          </span>,
          <span key="b" className={`block text-right font-mono ${f.bpm === null ? FALTA : ''}`}>
            {f.bpm ?? t.sem}
          </span>,
          <span key="k" className={`block font-mono ${f.tom === null ? FALTA : ''}`}>
            {f.tom ?? t.sem}
          </span>,
          <span
            key="g"
            className={`block truncate ${f.semGenero ? 'text-chip-laranja' : 'text-texto-claro'}`}
            title={f.genero ?? t.semGenero}
          >
            {f.genero ?? t.semGenero}
          </span>,
          <span key="f" className="block font-mono text-texto-suave">
            {f.formato}
          </span>,
          <span key="x" className="flex justify-end gap-[2px] pr-2 whitespace-nowrap">
            <button
              type="button"
              className="ico-btn !h-8 !w-8"
              aria-label={t.mostrarNoExplorer(f.titulo)}
              title={t.mostrarNoExplorer(f.titulo)}
              onClick={() => void mostrar(f)}
              data-acao="explorer"
            >
              <IconePasta tamanho={15} />
            </button>
            <button
              type="button"
              className="ico-btn ico-d !h-8 !w-8"
              aria-label={t.removerFaixa(f.titulo)}
              title={t.removerFaixa(f.titulo)}
              onClick={() => aoRemover(f)}
              data-acao="remover"
            >
              <IconeLixeira tamanho={15} />
            </button>
          </span>,
        ]}
      />
    </section>
  );
}

// ---------------------------------------------------------------- Lateral

function CartaoManutencao({
  leitura,
  agora,
  aoEscolher,
}: {
  leitura: LeituraBiblioteca;
  agora: number;
  aoEscolher(t: TarefaManutencao): void;
}) {
  const t = msg.biblioteca.manutencao;
  const operacao = useManutencao((s) => s.operacao);
  const rodando = useManutencao(manutencaoRodando);
  const desde = desdeQuandoParado(leitura.parados, agora);
  const tarefas: { id: TarefaManutencao; titulo: string; descricao: string; desabilitada?: boolean }[] = [
    { id: 'tomEBpm', ...t.tomEBpm },
    {
      id: 'importLeftovers',
      titulo: t.importLeftovers.titulo,
      descricao: t.importLeftovers.descricao(leitura.parados.length, desde),
    },
    { id: 'update', ...t.update },
    { id: 'move', ...t.move },
  ];
  return (
    <Cartao como="section" className="flex flex-col gap-[2px] px-[6px] py-3" data-testid="cartao-manutencao">
      <span className="flex items-center gap-3 px-[14px] pt-1 pb-2">
        <Rotulo>{t.titulo}</Rotulo>
        {rodando && operacao ? (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-chip-azul hover:underline"
            onClick={() => aoEscolher(operacao.tarefa)}
            data-testid="ver-andamento"
          >
            <Chip cor="azul">{t.rodando}</Chip>
            {t.verProgresso}
          </button>
        ) : null}
      </span>
      {tarefas.map((x) => (
        <button
          key={x.id}
          type="button"
          className="act"
          disabled={rodando && operacao?.tarefa !== x.id}
          onClick={() => aoEscolher(x.id)}
          data-tarefa={x.id}
        >
          <span className="flex flex-col gap-[2px]">
            <span className="text-sm font-bold">{x.titulo}</span>
            <span className="text-[12.5px] text-texto-suave">{x.descricao}</span>
          </span>
        </button>
      ))}
    </Cartao>
  );
}

function CartaoCompartilhamento({ slskdNoAr }: { slskdNoAr: boolean }) {
  const t = msg.biblioteca.compartilhamento;
  const qc = useQueryClient();
  const q = useCompartilhamento(slskdNoAr);
  const [pedindo, setPedindo] = useState(false);
  const [pedido, setPedido] = useState(false);
  const r = q.data;
  const c = r?.ok ? r.compartilhamento : null;

  async function reescanear() {
    setPedindo(true);
    try {
      const resposta = await api.library.rescanSharing();
      qc.setQueriesData({ queryKey: [...CHAVE_BIBLIOTECA, 'compartilhamento'] }, resposta);
      setPedido(resposta.ok);
    } finally {
      setPedindo(false);
    }
  }

  return (
    <Cartao como="section" className="flex flex-col gap-[10px] p-4" data-testid="cartao-compartilhamento">
      <Rotulo>{t.titulo}</Rotulo>
      {!slskdNoAr ? (
        <span className="text-[12.5px] leading-normal text-texto-suave">{t.stackFora}</span>
      ) : q.isPending ? (
        <span className="esqueleto h-3 w-[60%]" role="status" aria-label={msg.app.carregando} />
      ) : r && !r.ok ? (
        <span className="text-[13px] leading-normal text-chip-laranja" data-testid="compartilhamento-erro">
          {r.erro.titulo}. {r.erro.mensagem}
        </span>
      ) : (
        <>
          <span className="text-sm leading-normal" data-testid="compartilhamento-n">
            {c?.arquivos === null || c === null ? (
              t.desconhecido
            ) : (
              <>
                <strong className="font-mono">{c.arquivos.toLocaleString('pt-BR')}</strong> {t.anunciados(c.arquivos)}
              </>
            )}
          </span>
          {c?.escaneando ? (
            <span role="status" className="text-[12.5px] text-chip-azul">
              {t.varrendo}
            </span>
          ) : c?.arquivos === 0 ? (
            <span className="text-[12.5px] leading-normal text-chip-laranja">{t.zero}</span>
          ) : (
            <span className="text-[12.5px] leading-normal text-texto-suave">{t.dica}</span>
          )}
          {pedido ? <span className="text-[12.5px] text-texto-suave">{t.pedido}</span> : null}
        </>
      )}
      <Botao
        pequeno
        className="self-start"
        disabled={!slskdNoAr || pedindo || c?.escaneando === true}
        onClick={() => void reescanear()}
        data-testid="reescanear"
      >
        {t.reescanear}
      </Botao>
    </Cartao>
  );
}

function CartaoRekordbox({ pasta }: { pasta: string }) {
  const t = msg.biblioteca.rekordbox;
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    await api.app.copyText(pasta);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  return (
    <Cartao como="section" className="flex flex-col gap-[10px] p-4" data-testid="cartao-rekordbox">
      <Rotulo>{t.titulo}</Rotulo>
      <span className="text-[13.5px] leading-normal text-[#c9c5bd]">{t.instrucao}</span>
      <div className="flex items-center gap-2 rounded-md border border-borda-fraca bg-fundo py-2 pr-2 pl-3">
        <span
          className="min-w-0 flex-1 truncate font-mono text-[12.5px]"
          title={pasta}
          aria-label={t.pastaMonitorada}
          data-testid="pasta-rekordbox"
        >
          {pasta}
        </span>
        <Botao pequeno onClick={() => void copiar()} data-testid="copiar-pasta">
          {copiado ? t.copiado : t.copiar}
        </Botao>
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------- Página

export function Biblioteca() {
  const t = msg.biblioteca;
  const qc = useQueryClient();
  const semPasta = useSemPasta();
  const status = useStackStatus();
  const soulbeetNoAr = servicoDe(status, 'soulbeet').container === 'running';
  const slskdNoAr = servicoSaudavel(servicoDe(status, 'slskd'));
  const leitura = useLeituraDaBiblioteca(soulbeetNoAr);
  const agora = useAgora(true, 60_000);
  const [indicador, setIndicador] = useState<IndicadorId | null>(null);
  const [removendo, setRemovendo] = useState<FaixaDaBiblioteca | null>(null);
  const [tarefa, setTarefa] = useState<TarefaManutencao | null>(null);

  const r = leitura.data;
  const lida = r?.ok ? r.leitura : null;
  const indicadores = useMemo(
    () => (lida ? contarIndicadores(lida.faixas, lida.parados) : { semBpm: 0, semTom: 0, semGenero: 0, parados: 0 }),
    [lida],
  );
  const recarregar = () => void qc.invalidateQueries({ queryKey: CHAVE_BIBLIOTECA });

  return (
    <div className="flex flex-col gap-[22px]">
      <CabecalhoPagina
        rotulo={t.rotulo}
        titulo={t.titulo}
        {...(lida ? { subtitulo: t.subtitulo(lida.pastaMusica, lida.faixas.length) } : {})}
        acoes={
          <>
            <Botao variante="fantasma" onClick={recarregar} disabled={semPasta || leitura.isFetching}>
              <IconeRecarregar />
              {t.atualizar}
            </Botao>
            <Botao onClick={() => seguro(api.library.openMusicFolder())} disabled={semPasta}>
              <IconePasta />
              {t.abrirMusic}
            </Botao>
          </>
        }
      />

      {semPasta ? (
        <SemPasta />
      ) : leitura.isPending ? (
        <>
          <Carregando rotulo={t.carregando} />
          <p className="m-0 text-[13px] text-texto-suave">{t.lendo}</p>
        </>
      ) : leitura.isError ? (
        <CartaoErro
          erro={{
            codigo: 'inesperado',
            titulo: msg.erro.inesperado.titulo,
            mensagem: msg.erro.inesperado.mensagem,
            acoes: [{ id: 'tentarDeNovo', rotulo: msg.acoes.tentarDeNovo, primaria: true }],
            detalhes: String(leitura.error),
          }}
          aoTentarDeNovo={() => void leitura.refetch()}
        />
      ) : r && !r.ok ? (
        <CartaoErro erro={r.erro} aoTentarDeNovo={() => void leitura.refetch()} />
      ) : lida ? (
        <>
          <Indicadores leitura={lida} selecionado={indicador} aoEscolher={setIndicador} />
          {lida.ignoradas > 0 ? <p className="m-0 text-xs text-texto-mudo">{t.ignoradas(lida.ignoradas)}</p> : null}
          <div className="flex flex-wrap items-start gap-5">
            <TabelaDeFaixas
              leitura={lida}
              indicador={indicador}
              aoRemover={setRemovendo}
              aoImportar={() => setTarefa('importLeftovers')}
            />
            <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
              <CartaoManutencao leitura={lida} agora={agora} aoEscolher={setTarefa} />
              <CartaoCompartilhamento slskdNoAr={slskdNoAr} />
              <CartaoRekordbox pasta={lida.pastaMusica} />
            </aside>
          </div>
        </>
      ) : null}

      <DialogoRemover
        faixa={removendo}
        totalNaBiblioteca={lida?.faixas.length ?? 0}
        aoFechar={() => setRemovendo(null)}
        aoRemover={recarregar}
      />
      <DialogoManutencao
        tarefa={tarefa}
        indicadores={indicadores}
        parados={lida?.parados ?? []}
        agora={agora}
        aoFechar={() => setTarefa(null)}
      />
    </div>
  );
}
