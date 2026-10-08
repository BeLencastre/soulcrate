// Detalhe da execução (protótipo "Detalhe da execução"): o resultado de cada faixa com o arquivo na biblioteca, os
// relatórios de lotes/, as opções usadas e os atalhos para entender e refazer o que não veio.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  filtrarFaixasHistorico,
  rotuloDoMomento,
  type ExecucaoDetalhe,
  type FaixaHistorico,
  type FiltroDetalhe,
} from '@shared/historico';
import { msg } from '@shared/mensagens';
import { CartaoErro } from '../../components/CartaoErro';
import { Carregando, ErroDeLeitura, SemPasta, useSemPasta } from '../../components/historico/estados';
import { DialogoReprocessar } from '../../components/historico/DialogoReprocessar';
import { IconeArquivo, IconePasta, IconeVoltarPagina } from '../../components/icones';
import { TabelaVirtual } from '../../components/TabelaVirtual';
import { Botao, Cartao, Chip, classeBotao, Rotulo } from '../../components/ui';
import { api } from '../../lib/api';
import { useAgora } from '../../lib/estado';
import { opcoesComoTexto, rotuloDoFim, useDetalheDaExecucao } from '../../lib/historico';
import { corDoEstado, erroDoMotivo, formatarDuracao } from '../../lib/lote-painel';
import { useExecucao } from '../../lib/lote-store';

const COLUNAS = 'minmax(215px,1fr) minmax(200px,1.8fr) minmax(230px,2fr) 140px';
const STATUS_COM_ARQUIVO = new Set(['importada', 'baixada', 'ja na biblioteca', 'ja feita']);

function Cartoes({ d }: { d: ExecucaoDetalhe }) {
  const t = msg.historico.detalhe.cartoes;
  const contagem = (status: string) => d.faixas.filter((f) => f.status === status).length;
  const itens: { id: string; rotulo: string; valor: number; cor: string }[] = [
    { id: 'bib', rotulo: t.naBiblioteca, valor: d.filtros.bib, cor: '#5BD49A' },
    { id: 'nao-encontradas', rotulo: t.naoEncontradas, valor: contagem('nao encontrada'), cor: '#FF7A7A' },
    { id: 'falharam', rotulo: t.falharam, valor: contagem('falhou'), cor: '#FF7A7A' },
    { id: 'conferir', rotulo: t.paraConferir, valor: d.filtros.conf, cor: '#F2B53A' },
  ];
  if (d.filtros.inc > 0)
    itens.push({ id: 'incompletas', rotulo: t.naoTerminadas, valor: d.filtros.inc, cor: '#B4B8BF' });
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[10px]">
      {itens.map((i) => (
        <Cartao key={i.id} className="flex flex-col gap-[6px] p-4" data-cartao={i.id}>
          <Rotulo>{i.rotulo}</Rotulo>
          <span className="font-mono text-[30px] font-bold" style={{ color: i.cor }} data-valor={i.id}>
            {i.valor}
          </span>
        </Cartao>
      ))}
    </div>
  );
}

function TabelaDasFaixas({
  runId,
  faixas,
  filtros,
  aoFalhar,
}: {
  runId: string;
  faixas: readonly FaixaHistorico[];
  filtros: Record<FiltroDetalhe, number>;
  aoFalhar(texto: string): void;
}) {
  const t = msg.historico.detalhe;
  const [filtro, setFiltro] = useState<FiltroDetalhe>('todas');
  const [busca, setBusca] = useState('');
  const visiveis = useMemo(() => filtrarFaixasHistorico(faixas, filtro, busca), [faixas, filtro, busca]);
  const ids: FiltroDetalhe[] = ['todas', 'bib', 'nao', 'conf', ...(filtros.inc > 0 ? (['inc'] as const) : [])];
  const c = t.colunas;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-borda-fraca px-4 py-3">
        {ids.map((f) => (
          <button
            key={f}
            type="button"
            className="chip-f"
            aria-pressed={filtro === f}
            onClick={() => setFiltro(f)}
            data-filtro={f}
          >
            {t.filtros[f]} <span className="font-mono text-texto-mudo">{filtros[f]}</span>
          </button>
        ))}
        <label className="relative ml-auto min-w-[180px] flex-[0_1_240px]">
          <span className="sr-only">{msg.lote.execucao.buscarRotulo}</span>
          <input
            className="inp !h-9 !text-[13px]"
            value={busca}
            placeholder={msg.lote.execucao.buscar}
            onChange={(e) => setBusca(e.target.value)}
            data-testid="busca-faixas"
          />
        </label>
      </div>
      <TabelaVirtual
        rotulo={t.tabela}
        colunas={COLUNAS}
        cabecalho={[c.status, c.faixa, c.arquivo, c.acoes]}
        linhas={visiveis}
        alturaLinha={56}
        alturaMax={560}
        larguraMinima={800}
        chave={(f) => f.key}
        vazio={t.tabelaVazia}
        testId="tabela-faixas"
        celulas={(f) => [
          <Chip key="s" cor={f.corStatus}>
            {f.rotuloStatus}
          </Chip>,
          <span key="f" className="flex min-w-0 flex-col gap-[3px]">
            <span className="truncate" title={f.linha}>
              {f.artista ? (
                <>
                  <span className="font-semibold">{f.artista}</span> <span className="text-texto-apagado">–</span>{' '}
                  {f.titulo}
                </>
              ) : (
                f.titulo
              )}
            </span>
            {f.nota ? (
              <span className="truncate text-xs text-ambar" title={f.nota}>
                {f.nota}
              </span>
            ) : null}
          </span>,
          <span key="a" className="flex min-w-0 flex-col gap-[2px] font-mono text-xs text-texto-suave">
            {f.arquivo ? (
              <>
                <span className="truncate" title={f.arquivo.caminho}>
                  {f.arquivo.caminho}
                </span>
                {f.arquivo.onde === 'downloads' ? (
                  <span className="truncate font-sans text-[11px] text-texto-mudo">{t.emDownloads}</span>
                ) : null}
              </>
            ) : STATUS_COM_ARQUIVO.has(f.status) ? (
              <span className="truncate font-sans text-texto-mudo" title={t.arquivoNaoAchadoDica}>
                {t.arquivoNaoAchado}
              </span>
            ) : (
              '—'
            )}
          </span>,
          <span key="x" className="flex items-center justify-end gap-1 pr-4">
            {f.arquivo ? (
              <button
                type="button"
                className="ico-btn"
                aria-label={t.mostrarNoExplorerDe(f.linha)}
                title={t.mostrarNoExplorer}
                onClick={() =>
                  void api.reports
                    .revealTrack(runId, f.key)
                    .then((ok) => (ok ? undefined : aoFalhar(t.naoMostrou)))
                    .catch(() => aoFalhar(t.naoMostrou))
                }
              >
                <IconePasta />
              </button>
            ) : null}
            {f.temDiagnostico ? (
              <Link
                className={classeBotao('padrao', true)}
                to={`/historico/${runId}/faltas?faixa=${encodeURIComponent(f.key)}`}
                aria-label={t.porQueDe(f.linha)}
              >
                {t.porQue}
              </Link>
            ) : null}
          </span>,
        ]}
      />
    </>
  );
}

function Corpo({ d }: { d: ExecucaoDetalhe }) {
  const t = msg.historico.detalhe;
  const acompanhada = useExecucao((s) => s.runId);
  const agora = useAgora(d.resumo.fim === 'rodando', 1000);
  const [reprocessando, setReprocessando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const r = d.resumo;
  const rodando = r.fim === 'rodando';
  const erro = erroDoMotivo(r.fim === 'rodando' ? 'completed' : r.fim, r.mensagem, r.lista);
  const duracao = r.duracaoMs !== null ? formatarDuracao(rodando ? Math.max(0, agora - r.inicio) : r.duracaoMs) : null;
  const nTentar = d.retentativa?.faixas ?? 0;

  return (
    <div className="flex flex-col gap-[22px]">
      <Link
        to="/historico"
        className="inline-flex items-center gap-[6px] self-start text-[13px] font-semibold text-texto-suave no-underline hover:text-texto"
      >
        <IconeVoltarPagina tamanho={14} />
        {t.voltar}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Rotulo data-testid="rotulo-execucao">{t.rotulo(r.id, rotuloDoMomento(r.inicio, agora), duracao)}</Rotulo>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-mono text-[28px] font-bold" data-testid="nome-da-lista">
              {r.lista ?? t.listaDesconhecida}
            </h1>
            <span data-testid="fim-da-execucao" data-fim={r.fim}>
              <Chip cor={corDoEstado(r.fim)}>{rotuloDoFim(r.fim)}</Chip>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao
            variante="fantasma"
            disabled={!d.podeReprocessar || rodando}
            onClick={() => setReprocessando(true)}
            data-testid="reprocessar"
          >
            {t.reprocessar}
          </Botao>
          {d.retentativa && !rodando ? (
            <Link className={classeBotao('primario')} to={`/historico/${r.id}/faltas`} data-testid="tentar-de-novo">
              {t.tentarDeNovo(nTentar)}
            </Link>
          ) : null}
        </div>
      </header>

      {aviso ? (
        <Cartao
          role="status"
          className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          data-testid="aviso-detalhe"
        >
          <span className="min-w-0 flex-1">{aviso}</span>
          <Botao variante="fantasma" pequeno onClick={() => setAviso(null)}>
            {msg.acoes.dispensar}
          </Botao>
        </Cartao>
      ) : null}

      {rodando ? (
        <Cartao
          borda="azul"
          role="status"
          className="flex flex-wrap items-center gap-3 bg-[#16202c] px-4 py-3 text-sm"
          data-testid="aviso-rodando"
        >
          <span className="min-w-0 flex-1">{msg.historico.avisoEmAndamento}</span>
          {acompanhada === r.id ? (
            <Link className={classeBotao('padrao', true)} to="/lista/execucao">
              {msg.historico.verAoVivo}
            </Link>
          ) : null}
        </Cartao>
      ) : null}
      {erro ? <CartaoErro erro={erro} /> : null}

      <Cartoes d={d} />

      <div className="flex flex-wrap items-start gap-5">
        <Cartao como="section" className="min-w-0 flex-[999_1_640px] overflow-hidden">
          {d.faixas.length === 0 ? (
            <p className="m-0 px-4 py-8 text-center text-sm text-texto-suave" data-testid="sem-faixas">
              {t.semFaixas}
            </p>
          ) : (
            <TabelaDasFaixas runId={r.id} faixas={d.faixas} filtros={d.filtros} aoFalhar={setAviso} />
          )}
        </Cartao>

        <aside className="flex flex-[1_1_280px] flex-col gap-4">
          <Cartao como="section" className="flex flex-col gap-1 px-2 py-[14px]" data-testid="relatorios">
            <Rotulo className="px-3 pb-2">{t.relatorios}</Rotulo>
            {d.arquivos.length === 0 ? (
              <p className="m-0 px-3 text-[13px] text-texto-suave">{t.relatoriosVazio}</p>
            ) : (
              d.arquivos.map((a) => {
                const desc = msg.historico.arquivos[a.tipo];
                return (
                  <button
                    key={a.tipo}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-[10px] rounded-md border-0 bg-transparent px-3 py-[10px] text-left text-texto hover:bg-campo hover:text-white"
                    aria-label={t.abrirArquivo(a.nome)}
                    data-arquivo={a.tipo}
                    onClick={() =>
                      void api.reports
                        .openFile(r.id, a.tipo)
                        .then((ok) => (ok ? undefined : setAviso(t.naoAbriu)))
                        .catch(() => setAviso(t.naoAbriu))
                    }
                  >
                    <span className="text-texto-mudo">
                      <IconeArquivo />
                    </span>
                    <span className="flex min-w-0 flex-col gap-[2px]">
                      <span className="truncate font-mono text-[12.5px]">{a.nome}</span>
                      <span className="text-xs text-texto-mudo">
                        {typeof desc === 'function' ? desc(a.tipo === 'nao-baixadas' ? nTentar || null : null) : desc}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </Cartao>
          <Cartao como="section" className="flex flex-col gap-[10px] p-4">
            <Rotulo>{t.opcoesUsadas}</Rotulo>
            {d.opcoes === null ? (
              <span className="text-[13px] text-texto-suave" data-testid="opcoes-usadas">
                {t.opcoesNaoRegistradas}
              </span>
            ) : opcoesComoTexto(d.opcoes) ? (
              <code className="font-mono text-xs leading-[1.6] text-[#d9d6cf]" data-testid="opcoes-usadas">
                {opcoesComoTexto(d.opcoes)}
              </code>
            ) : (
              <span className="text-[13px] text-texto-suave" data-testid="opcoes-usadas">
                {t.opcoesPadrao}
              </span>
            )}
          </Cartao>
        </aside>
      </div>

      <DialogoReprocessar
        runId={r.id}
        aberto={reprocessando}
        aoFechar={() => setReprocessando(false)}
        aoConcluir={setAviso}
      />
    </div>
  );
}

export function DetalheDaExecucao() {
  const { runId } = useParams();
  const semPasta = useSemPasta();
  const q = useDetalheDaExecucao(runId);

  if (semPasta) return <SemPasta />;
  if (q.isError) return <ErroDeLeitura causa={q.error} aoTentarDeNovo={() => void q.refetch()} />;
  if (q.isPending || !runId) return <Carregando rotulo={msg.historico.carregando} />;
  if (q.data === null) {
    const t = msg.historico.detalhe.naoExiste;
    return (
      <div className="flex flex-col gap-5">
        <Link to="/historico" className="inline-flex items-center gap-[6px] self-start text-[13px] font-semibold">
          <IconeVoltarPagina tamanho={14} />
          {msg.historico.detalhe.voltar}
        </Link>
        <Cartao
          borda="vazio"
          className="flex max-w-[520px] flex-col items-start gap-3 p-[22px]"
          data-testid="execucao-inexistente"
        >
          <h2 className="m-0 text-lg font-extrabold">{t.titulo}</h2>
          <p className="m-0 text-sm leading-normal text-texto-claro">{t.corpo}</p>
        </Cartao>
      </div>
    );
  }
  return <Corpo d={q.data} />;
}
