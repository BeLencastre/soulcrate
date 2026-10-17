// Etapa 3 do lote no Modo DJ (protótipo "DJ · Baixar lista › Download"): quantas chegaram, quantas não vieram e o
// que está em andamento, a tabela com a situação de cada faixa e, no fim, o que fazer em seguida (organizar, ver o
// que faltou). O log bruto, o usuário e a tentativa de cada faixa ficam no Modo Dev.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { rotuloDoMomento } from '@shared/historico';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import { separarLinha, type FaixaLote } from '@shared/lote-estado';
import { CartaoErro } from '../../components/CartaoErro';
import { IconeParar } from '../../components/icones';
import { EtapasDoLote } from '../../components/lote/Etapas';
import { FaixaDeAviso } from '../../components/lote/FaixaDeAviso';
import { TabelaVirtual } from '../../components/TabelaVirtual';
import { Botao, Cartao, Chip, classeBotao, Rotulo } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import {
  contarDj,
  esperandoOrganizar,
  faixaDoPainelDj,
  filtrarDj,
  FILTROS_DJ,
  infoNoDj,
  notaDj,
  type FiltroDj,
} from '../../lib/download-dj';
import { useAgora } from '../../lib/estado';
import { semExtensao } from '../../lib/historico';
import { chaveDoEstado, corDoEstado, duracaoDoLote, erroDoFim, formatarDuracao } from '../../lib/lote-painel';
import { useExecucao } from '../../lib/lote-store';

const t = msgDj.lote.download;
const COLUNAS = '44px minmax(240px,2.4fr) minmax(170px,1fr) 96px';

function TabelaDj({ runId, faixas, terminou }: { runId: string; faixas: readonly FaixaLote[]; terminou: boolean }) {
  const [filtro, setFiltro] = useState<FiltroDj>('todas');
  const [busca, setBusca] = useState('');
  const totais = useMemo(() => contarDj(faixas), [faixas]);
  const visiveis = useMemo(() => filtrarDj(faixas, filtro, busca), [faixas, filtro, busca]);
  const c = t.colunas;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div role="group" aria-label={t.filtrar} className="flex flex-wrap gap-2">
          {FILTROS_DJ.map((f) => (
            <button
              key={f}
              type="button"
              className="chip-f"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              data-filtro={f}
            >
              {t.filtros[f]} <span className="font-mono text-texto-mudo">{totais[f]}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto min-w-[180px] flex-[0_1_260px]">
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
        cabecalho={[c.numero, c.faixa, c.situacao, c.formato]}
        linhas={visiveis}
        alturaLinha={52}
        alturaMax={520}
        larguraMinima={620}
        chave={(f) => f.key}
        vazio={msg.lote.execucao.tabelaVazia}
        testId="tabela-faixas"
        celulas={(f) => {
          const info = infoNoDj(f);
          const { artista, titulo } = separarLinha(f.linha);
          const nota = notaDj(f);
          const naoVeio = f.status === 'nao encontrada' || f.status === 'falhou';
          return [
            <span key="n" className="font-mono text-texto-apagado">
              {f.n}
            </span>,
            <span key="f" className="flex min-w-0 flex-col gap-[3px]">
              <span className="truncate" title={f.linha}>
                {artista ? (
                  <>
                    <strong className="font-semibold">{artista}</strong> <span className="text-texto-apagado">–</span>{' '}
                    {titulo}
                  </>
                ) : (
                  titulo
                )}
              </span>
              {nota ? (
                <span className="truncate text-xs text-ambar" title={nota}>
                  {nota}
                </span>
              ) : null}
            </span>,
            <Chip key="s" cor={info.cor}>
              {info.rotulo}
            </Chip>,
            naoVeio && terminou && f.temDiagnostico ? (
              <Link
                key="x"
                to={`/historico/${runId}/faltas?faixa=${encodeURIComponent(f.key)}`}
                aria-label={t.porQueDe(f.linha)}
                className="text-[13px] font-semibold"
              >
                {t.porQue}
              </Link>
            ) : (
              <span key="x" className="font-mono text-texto-claro">
                {f.formato ?? '—'}
              </span>
            ),
          ];
        }}
      />
    </>
  );
}

export function DownloadDj() {
  const runId = useExecucao((s) => s.runId);
  const anexado = useExecucao((s) => s.anexado);
  const estado = useExecucao((s) => s.estado);
  const resumo = useExecucao((s) => s.resumo);
  const pediuParar = useExecucao((s) => s.pediuParar);
  const rodando = estado.fase !== 'terminou';
  const agora = useAgora(rodando, 1000);
  const [parando, setParando] = useState(false);

  if (!runId) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <Rotulo>{t.rotulo}</Rotulo>
          <h1 className="m-0 text-[28px] font-bold">{msg.nav.lista}</h1>
        </header>
        <EtapasDoLote />
        <Cartao
          borda="vazio"
          className="flex max-w-[520px] flex-col items-start gap-3 p-[22px]"
          data-testid="execucao-vazia"
        >
          <Rotulo>{t.vazio.titulo}</Rotulo>
          <p className="m-0 text-sm leading-normal text-texto-claro">{t.vazio.corpo}</p>
          <Link className={classeBotao('primario')} to="/lista">
            {t.vazio.irParaLista}
          </Link>
        </Cartao>
      </div>
    );
  }

  const nomeDaLista = estado.inicio?.list ?? resumo?.lista ?? null;
  const chave = chaveDoEstado(estado, agora);
  const faixa = faixaDoPainelDj(estado, agora);
  const terminou = estado.fase === 'terminou';
  const erro = terminou ? erroDoFim(estado.fim, nomeDaLista) : null;
  const total = estado.total || estado.faixas.length;
  const duracao = duracaoDoLote(estado, agora);
  const eta = estado.progresso?.etaMin ?? null;
  const podeParar = estado.fase === 'rodando' || estado.fase === 'aguardando';
  const contagem = contarDj(estado.faixas);
  const concluidas = estado.contagem.concluidas;
  const quando = estado.inicio ? rotuloDoMomento(Date.parse(estado.inicio.t), agora) : null;
  const fimLimpo = terminou && estado.fim && (estado.fim.reason === 'completed' || estado.fim.reason === 'user');
  const organizar = esperandoOrganizar(estado.faixas);
  const partes = [
    { n: contagem.chegaram, cor: 'var(--color-led-verde)', pulsa: false },
    { n: contagem.naoVieram, cor: 'var(--color-led-vermelho)', pulsa: false },
    { n: contagem.pulada, cor: 'var(--color-led-cinza-2)', pulsa: false },
    { n: contagem.andamento, cor: 'var(--color-barra-azul)', pulsa: rodando },
    { n: Math.max(0, total - contagem.todas), cor: 'var(--color-borda-fraca)', pulsa: false },
  ].filter((p) => p.n > 0);

  async function parar() {
    setParando(true);
    try {
      await useExecucao.getState().parar();
    } finally {
      setParando(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px] pb-4" data-testid="download-dj">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Rotulo>{quando ? `${t.rotulo} · ${quando}` : t.rotulo}</Rotulo>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[28px] font-bold" data-testid="nome-da-lista">
              {nomeDaLista ? semExtensao(nomeDaLista) : '…'}
            </h1>
            <span data-testid="estado-do-lote" data-estado={chave}>
              <Chip cor={corDoEstado(chave)}>{msgDj.estadoDoDownload[chave]}</Chip>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="fantasma" onClick={() => seguro(api.library.openMusicFolder())}>
            {t.abrirPasta}
          </Botao>
          {podeParar ? (
            <Botao
              variante="perigo"
              disabled={parando || pediuParar}
              onClick={() => void parar()}
              data-testid="parar-lote"
            >
              <IconeParar tamanho={14} />
              {msg.lote.execucao.parar}
            </Botao>
          ) : null}
          {terminou && contagem.naoVieram > 0 ? (
            <Link className={classeBotao()} to={`/historico/${runId}/faltas`}>
              {t.verOQueFaltou}
            </Link>
          ) : null}
          {terminou ? (
            <Link className={classeBotao('primario')} to="/lista">
              {t.voltarALista}
            </Link>
          ) : null}
        </div>
      </header>

      <EtapasDoLote />

      {erro ? <CartaoErro erro={erro} /> : null}
      {faixa ? <FaixaDeAviso {...faixa} /> : null}
      {fimLimpo ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-verde-borda bg-verde-fundo px-4 py-3"
          data-testid="fim-do-download"
        >
          <span className="flex min-w-[260px] flex-1 flex-col gap-[2px]">
            <strong className="text-sm">{estado.fim?.reason === 'user' ? t.fim.parado : t.fim.titulo}</strong>
            <span className="text-[13px] text-texto-medio">
              {estado.fim?.reason === 'user' ? t.fim.paradoCorpo : organizar ? t.fim.organizar : t.fim.naBiblioteca}
            </span>
          </span>
          {estado.fim?.reason !== 'user' ? (
            <Link className={classeBotao('padrao', true)} to="/biblioteca">
              {organizar ? t.fim.organizarAgora : t.fim.abrirBiblioteca}
            </Link>
          ) : null}
        </div>
      ) : null}

      <Cartao como="section" className="flex flex-col gap-[14px] p-5" aria-label={msg.lote.execucao.progresso}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-[10px]">
          <span className="font-mono text-[40px] leading-none font-bold" data-testid="progresso-numero">
            {concluidas}
            <span className="text-2xl text-texto-apagado">/{total}</span>
          </span>
          <span className="text-[15px] text-texto-suave">{t.concluidas}</span>
          <span className="ml-auto flex gap-6 text-[13px] text-texto-suave">
            {duracao !== null ? (
              <span>
                {terminou ? t.levou : t.baixandoHa}{' '}
                <strong className="font-mono text-texto">{formatarDuracao(duracao)}</strong>
              </span>
            ) : null}
            {estado.fase === 'rodando' ? (
              <span>
                {t.faltam}{' '}
                <strong className="font-mono text-texto">{eta !== null ? `~${eta} min` : t.calculando}</strong>
              </span>
            ) : null}
          </span>
        </div>
        <div
          role="img"
          aria-label={t.barra(contagem)}
          className="flex h-[10px] gap-[3px]"
          data-testid="barra-progresso"
        >
          {partes.map((p, i) => (
            <span
              key={i}
              className={`rounded-[2px] ${p.pulsa ? 'pulsa' : ''}`}
              style={{ flex: `${p.n} 0 0`, background: p.cor }}
            />
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          {(
            [
              ['chegaram', 'var(--color-led-verde)'],
              ['andamento', 'var(--color-led-azul)'],
              ['naoVieram', 'var(--color-led-vermelho)'],
            ] as const
          ).map(([k, cor]) => (
            <div
              key={k}
              className="flex flex-col gap-[6px] rounded-md border border-linha bg-log px-[14px] py-3"
              data-contador={k}
            >
              <span className="lbl flex items-center gap-[6px]">
                <span className="size-[7px] rounded-[2px]" style={{ background: cor }} />
                {t.contadores[k]}
              </span>
              <span className="font-mono text-[22px] font-bold" data-valor={k}>
                {contagem[k]}
              </span>
            </div>
          ))}
        </div>
      </Cartao>

      <Cartao como="section" className="flex flex-col overflow-hidden" aria-label={t.tabela}>
        {anexado || estado.faixas.length > 0 ? (
          <TabelaDj runId={runId} faixas={estado.faixas} terminou={terminou} />
        ) : (
          <div className="px-4 py-8 text-center text-sm text-texto-suave">{msg.app.carregando}</div>
        )}
      </Cartao>
    </div>
  );
}
