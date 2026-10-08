// Etapa 3 do lote (protótipo "Baixar lista · Execução ao vivo"): faixa de aviso, progresso com a barra por faixa,
// contadores, a tabela de faixas (filtro e busca) e a aba com o log bruto. Tudo vem dos eventos do script; fechar o
// app não interrompe o lote, e ao reabrir o painel é remontado a partir do arquivo de eventos.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Link } from 'react-router';
import { msg } from '@shared/mensagens';
import {
  contarPorGrupo,
  filtrarFaixas,
  infoDoStatus,
  observacaoDaFaixa,
  segmentosDaBarra,
  separarLinha,
  type CorSegmento,
  type FaixaLote,
  type FiltroFaixas,
} from '@shared/lote-estado';
import { CartaoErro } from '../../components/CartaoErro';
import { IconeParar } from '../../components/icones';
import { EtapasDoLote } from '../../components/lote/Etapas';
import { TabelaVirtual } from '../../components/TabelaVirtual';
import { Botao, Cartao, Chip, classeBotao, Rotulo } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { useAgora } from '../../lib/estado';
import {
  chaveDoEstado,
  corDoEstado,
  duracaoDoLote,
  erroDoFim,
  faixaDoPainel,
  formatarDuracao,
  type TomFaixa,
} from '../../lib/lote-painel';
import { useExecucao } from '../../lib/lote-store';

const COR_SEGMENTO: Record<CorSegmento, string> = {
  verde: '#47C58A',
  vermelho: '#FF6161',
  cinza: '#6A6F78',
  azul: '#4A86D0',
  roxo: '#8B6CD1',
  vazio: '#24272C',
};

const TOM_DA_FAIXA: Record<TomFaixa, { fundo: string; borda: string; cor: string }> = {
  azul: { fundo: '#16202C', borda: '#22405F', cor: '#62A8FF' },
  laranja: { fundo: '#2A1B0E', borda: '#5A3A1C', cor: '#FF8B4A' },
  ambar: { fundo: '#241C0C', borda: '#5C4517', cor: '#F2B53A' },
  verde: { fundo: '#13241B', borda: '#1F4A33', cor: '#47C58A' },
};

const COLUNAS_FAIXAS = '44px minmax(220px,2.2fr) minmax(196px,1.2fr) 80px minmax(110px,0.9fr) 56px minmax(200px,1.6fr)';

const COR_DOS_CONTADORES = {
  buscando: '#62A8FF',
  baixando: '#62A8FF',
  naFila: '#62A8FF',
  beets: '#B794FF',
  aguardando: '#8A8F98',
  baixadas: '#47C58A',
  naoAchadas: '#FF6161',
  falhas: '#FF6161',
  puladas: '#6A6F78',
} as const;

// ---------------------------------------------------------------- Peças

function FaixaDeAviso({
  id,
  tom,
  titulo,
  texto,
  pulsa,
}: {
  id: string;
  tom: TomFaixa;
  titulo: string;
  texto: string;
  pulsa: boolean;
}) {
  const c = TOM_DA_FAIXA[tom];
  return (
    <div
      role="status"
      data-faixa={id}
      className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
      style={{ background: c.fundo, borderColor: c.borda }}
    >
      <span
        aria-hidden="true"
        className={`size-[9px] rounded-[2px] ${pulsa ? 'pulsa' : ''}`}
        style={{ background: c.cor }}
      />
      <span className="text-sm font-bold">{titulo}</span>
      <span className="text-[13px] text-[#c9c5bd]">{texto}</span>
    </div>
  );
}

function LinhaDoLog({ texto }: { texto: string }) {
  let cor = '#B4B8BF';
  if (/^\s*OK\b/.test(texto)) cor = '#5BD49A';
  else if (/^\s*x\s|NAO ENCONTRADA|FALHOU|^ERRO/.test(texto)) cor = '#FF7A7A';
  else if (/^\s*->/.test(texto)) cor = '#7DB6FF';
  else if (/^\s*~/.test(texto)) cor = '#F2B53A';
  else if (/^\s*\[beets\]/.test(texto)) cor = '#C3A6FF';
  else if (/^\[\d{2}:\d{2}\]/.test(texto)) cor = '#ECE9E3';
  else if (/^\s*\?/.test(texto)) cor = '#B4B8BF';
  else if (/^\s{5,}/.test(texto)) cor = '#868B93';
  return <div style={{ color: cor }}>{texto || ' '}</div>;
}

function LogBruto({ linhas }: { linhas: readonly string[] }) {
  const fim = useRef<HTMLDivElement>(null);
  const colado = useRef(true);
  // acompanha o fim do log, a menos que o usuário tenha rolado para cima
  useEffect(() => {
    const el = fim.current;
    if (el && colado.current) el.scrollTop = el.scrollHeight;
  }, [linhas.length]);
  return (
    <div
      ref={fim}
      role="log"
      tabIndex={0}
      aria-label={msg.lote.execucao.log}
      data-testid="log-bruto"
      className="max-h-[520px] min-h-[320px] overflow-auto bg-[#0f1113] px-5 py-4 font-mono text-[12.5px] leading-[1.8] whitespace-pre-wrap"
      onScroll={(e) => {
        const el = e.currentTarget;
        colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {linhas.length === 0 ? (
        <div className="text-texto-mudo">{msg.lote.execucao.logVazio}</div>
      ) : (
        linhas.map((l, i) => <LinhaDoLog key={i} texto={l} />)
      )}
    </div>
  );
}

function TabelaDeFaixas({ faixas }: { faixas: readonly FaixaLote[] }) {
  const [filtro, setFiltro] = useState<FiltroFaixas>('todas');
  const [busca, setBusca] = useState('');
  const t = msg.lote.execucao;
  const totais = useMemo(() => contarPorGrupo(faixas), [faixas]);
  const visiveis = useMemo(() => filtrarFaixas(faixas, filtro, busca), [faixas, filtro, busca]);
  const c = t.colunas;
  const FILTROS: FiltroFaixas[] = ['todas', 'andamento', 'concluida', 'atencao', 'pulada'];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {FILTROS.map((f) => (
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
        <label className="relative ml-auto min-w-[180px] flex-[0_1_260px]">
          <span className="sr-only">{t.buscarRotulo}</span>
          <input
            className="inp !h-9 !text-[13px]"
            value={busca}
            placeholder={t.buscar}
            onChange={(e) => setBusca(e.target.value)}
            data-testid="busca-faixas"
          />
        </label>
      </div>
      <TabelaVirtual
        rotulo={t.tabela}
        colunas={COLUNAS_FAIXAS}
        cabecalho={[c.numero, c.faixa, c.status, c.formato, c.usuario, c.tentativa, c.observacao]}
        linhas={visiveis}
        alturaLinha={44}
        alturaMax={520}
        larguraMinima={980}
        chave={(f) => f.key}
        vazio={t.tabelaVazia}
        testId="tabela-faixas"
        celulas={(f) => {
          const info = infoDoStatus(f.status, f.naFilaDoUsuario);
          const { artista, titulo } = separarLinha(f.linha);
          const obs = observacaoDaFaixa(f);
          return [
            <span key="n" className="font-mono text-texto-apagado">
              {f.n}
            </span>,
            <span key="f" className="block truncate" title={f.linha}>
              {artista ? (
                <>
                  <span className="font-semibold">{artista}</span> <span className="text-texto-apagado">–</span>{' '}
                  {titulo}
                </>
              ) : (
                titulo
              )}
            </span>,
            <Chip key="s" cor={info.cor}>
              {info.rotulo}
            </Chip>,
            <span key="fm" className="font-mono text-texto-claro">
              {f.formato ?? '—'}
            </span>,
            <span key="u" className="block truncate font-mono text-texto-claro" title={f.usuario ?? undefined}>
              {f.usuario ?? '—'}
            </span>,
            <span key="t" className="font-mono text-texto-claro">
              {f.tentativa ?? '—'}
            </span>,
            <span key="o" className="block truncate text-texto-suave" title={obs}>
              {obs}
            </span>,
          ];
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- Tela

export function Execucao() {
  const runId = useExecucao((s) => s.runId);
  const anexado = useExecucao((s) => s.anexado);
  const estado = useExecucao((s) => s.estado);
  const log = useExecucao((s) => s.log);
  const resumo = useExecucao((s) => s.resumo);
  const pediuParar = useExecucao((s) => s.pediuParar);
  const t = msg.lote.execucao;
  const rodando = estado.fase !== 'terminou';
  const agora = useAgora(rodando, 1000);
  const [parando, setParando] = useState(false);

  if (!runId) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <Rotulo>{msg.lote.rotulo}</Rotulo>
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
  const faixa = faixaDoPainel(estado, agora);
  const erro = estado.fase === 'terminou' ? erroDoFim(estado.fim, nomeDaLista) : null;
  const c = estado.contagem;
  const total = estado.total || estado.faixas.length;
  const duracao = duracaoDoLote(estado, agora);
  const eta = estado.progresso?.etaMin ?? null;
  const podeParar = estado.fase === 'rodando' || estado.fase === 'aguardando';
  const segmentos = segmentosDaBarra(c, total);
  const andamento = c.buscando + c.baixando + c.naFila + c.beets;
  const arquivos = estado.fim?.files ?? {};

  async function parar() {
    setParando(true);
    try {
      await useExecucao.getState().parar();
    } finally {
      setParando(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px] pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Rotulo>{t.rotulo(runId)}</Rotulo>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-mono text-[28px] font-bold" data-testid="nome-da-lista">
              {nomeDaLista ?? '…'}
            </h1>
            <span data-testid="estado-do-lote" data-estado={chave}>
              <Chip cor={corDoEstado(chave)}>{t.estado[chave]}</Chip>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="fantasma" onClick={() => seguro(api.batch.openFolder())}>
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
              {t.parar}
            </Botao>
          ) : null}
          {estado.fase === 'terminou' && arquivos.result ? (
            <Botao onClick={() => seguro(api.batch.openFile(runId, 'resultado'))}>{t.abrirResultado}</Botao>
          ) : null}
          {estado.fase === 'terminou' && arquivos.notDownloaded ? (
            <Botao onClick={() => seguro(api.batch.openFile(runId, 'nao-baixadas'))}>{t.abrirNaoBaixadas}</Botao>
          ) : null}
          {estado.fase === 'terminou' ? (
            <Link className={classeBotao('primario')} to="/lista">
              {t.novaExecucao}
            </Link>
          ) : null}
        </div>
      </header>

      <EtapasDoLote />

      {erro ? <CartaoErro erro={erro} /> : null}
      {faixa ? <FaixaDeAviso {...faixa} /> : null}

      <Cartao como="section" className="flex flex-col gap-[14px] p-5" aria-label={t.progresso}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-[10px]">
          <span className="font-mono text-[40px] leading-none font-bold" data-testid="progresso-numero">
            {c.concluidas}
            <span className="text-2xl text-texto-apagado">/{total}</span>
          </span>
          <span className="text-[15px] text-texto-suave">{t.concluidas}</span>
          <span className="ml-auto flex gap-6 text-[13px] text-texto-suave">
            {duracao !== null ? (
              <span>
                {t.rodandoHa} <strong className="font-mono text-texto">{formatarDuracao(duracao)}</strong>
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
          aria-label={t.barra({
            baixadas: c.baixadas,
            atencao: c.naoAchadas + c.falhas,
            puladas: c.puladas,
            andamento,
            aguardando: c.aguardando,
          })}
          className="flex h-[30px] gap-[3px]"
          data-testid="barra-progresso"
        >
          {segmentos.map((s, i) => (
            <span
              key={i}
              className={`min-w-0 flex-1 rounded-[2px] ${s.ativo && rodando ? 'pulsa' : ''}`}
              style={{ background: COR_SEGMENTO[s.cor] }}
            />
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-2">
          {(Object.keys(COR_DOS_CONTADORES) as (keyof typeof COR_DOS_CONTADORES)[]).map((k) => (
            <div
              key={k}
              className="flex flex-col gap-[6px] rounded-md border border-[#22252a] bg-log px-[14px] py-3"
              data-contador={k}
            >
              <span className="lbl flex items-center gap-[6px]">
                <span className="size-[7px] rounded-[2px]" style={{ background: COR_DOS_CONTADORES[k] }} />
                {t.contadores[k]}
              </span>
              <span className="font-mono text-[22px] font-bold" data-valor={k}>
                {c[k]}
              </span>
            </div>
          ))}
        </div>
      </Cartao>

      <Cartao como="section" className="flex flex-col overflow-hidden">
        <Tabs.Root defaultValue="faixas">
          <Tabs.List aria-label={t.abas.visao} className="flex gap-3 border-b border-borda-fraca px-4">
            <Tabs.Trigger value="faixas" className="tab">
              {t.abas.faixas}
            </Tabs.Trigger>
            <Tabs.Trigger value="log" className="tab">
              {t.abas.log}
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="faixas">
            {anexado || estado.faixas.length > 0 ? (
              <TabelaDeFaixas faixas={estado.faixas} />
            ) : (
              <div className="px-4 py-8 text-center text-sm text-texto-suave">{msg.app.carregando}</div>
            )}
          </Tabs.Content>
          <Tabs.Content value="log">
            <LogBruto linhas={log} />
          </Tabs.Content>
        </Tabs.Root>
      </Cartao>
    </div>
  );
}
