// Tela Histórico (protótipo "Histórico"): as execuções de lotes/, as do app e as do .bat, com como terminaram e o que
// saiu de cada uma. "Ver faltas" leva ao diagnóstico; "Abrir", ao detalhe (ou ao painel ao vivo, se o app a acompanha).
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ExecucaoResumo } from '@shared/historico';
import { rotuloDaHora, rotuloDoDia } from '@shared/historico';
import { msg } from '@shared/mensagens';
import { Carregando, ErroDeLeitura, SemPasta, useSemPasta } from '../../components/historico/estados';
import { DialogoLimpeza } from '../../components/historico/DialogoLimpeza';
import { IconePasta } from '../../components/icones';
import { Botao, CabecalhoPagina, Cartao, Chip, classeBotao } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { useAgora } from '../../lib/estado';
import {
  destinoDaExecucao,
  filtrarExecucoes,
  fonteDaLinha,
  resumoDaLinha,
  rotuloDoFim,
  segmentosDaLinha,
  useExecucoes,
  type FiltroDoHistorico,
} from '../../lib/historico';
import { corDoEstado, formatarDuracao } from '../../lib/lote-painel';
import { useExecucao } from '../../lib/lote-store';

const COR_SEGMENTO = {
  ok: 'var(--color-led-verde)',
  atencao: 'var(--color-led-laranja)',
  naoVieram: 'var(--color-led-vermelho)',
  puladas: 'var(--color-led-cinza-2)',
  resto: 'var(--color-borda-fraca)',
};

function BarraDeResultado({ r }: { r: ExecucaoResumo }) {
  const s = segmentosDaLinha(r);
  const partes = (Object.keys(COR_SEGMENTO) as (keyof typeof COR_SEGMENTO)[]).filter((k) => s[k] > 0);
  return (
    <span
      role="img"
      aria-label={resumoDaLinha(r)}
      className="flex h-2 gap-[2px] overflow-hidden rounded-[2px] bg-borda-fraca"
    >
      {partes.map((k) => (
        <span key={k} style={{ flex: `${s[k]} 0 0`, background: COR_SEGMENTO[k] }} />
      ))}
    </span>
  );
}

function LinhaDaExecucao({ r, agora, acompanhada }: { r: ExecucaoResumo; agora: number; acompanhada: string | null }) {
  const t = msg.historico;
  const destino = destinoDaExecucao(r, acompanhada);
  return (
    <tr className="row border-t border-linha" data-testid="linha-execucao" data-run={r.id} data-fim={r.fim}>
      <td className="py-[14px] pr-2 pl-[18px] whitespace-nowrap">
        <span className="flex flex-col gap-[3px]">
          <span className="font-semibold">{rotuloDoDia(r.inicio, agora)}</span>
          <span className="font-mono text-xs text-texto-mudo">{rotuloDaHora(r.inicio)}</span>
        </span>
      </td>
      <td className="px-2 py-[14px]">
        <span className="flex flex-col gap-[3px]">
          <Link
            to={destino}
            className="font-mono font-bold text-texto no-underline hover:text-ambar hover:underline"
            title={r.id}
          >
            {r.lista ?? t.semLista}
          </Link>
          <span className="text-xs text-texto-mudo">{fonteDaLinha(r)}</span>
        </span>
      </td>
      <td className="px-2 py-[14px] font-mono whitespace-nowrap text-texto-claro">
        {r.duracaoMs === null ? t.semDuracao : formatarDuracao(r.duracaoMs)}
      </td>
      <td className="w-[250px] px-2 py-[14px]">
        <span className="flex flex-col gap-[6px]">
          <BarraDeResultado r={r} />
          <span className="font-mono text-xs text-texto-suave">{resumoDaLinha(r)}</span>
        </span>
      </td>
      <td className="px-2 py-[14px]">
        <Chip cor={corDoEstado(r.fim)}>{rotuloDoFim(r.fim)}</Chip>
      </td>
      <td className="py-[14px] pr-[18px] pl-2 text-right whitespace-nowrap">
        <span className="inline-flex gap-1">
          {r.temFaltas && r.fim !== 'rodando' ? (
            <Link className={classeBotao('padrao', true)} to={`/historico/${r.id}/faltas`}>
              {t.verFaltas}
            </Link>
          ) : null}
          <Link className={classeBotao('fantasma', true)} to={destino}>
            {destino === '/lista/execucao' ? t.abrirNoPainel : t.abrir}
          </Link>
        </span>
      </td>
    </tr>
  );
}

export function Historico() {
  const t = msg.historico;
  const semPasta = useSemPasta();
  const execucoes = useExecucoes();
  const acompanhada = useExecucao((s) => s.runId);
  const agora = useAgora(true, 30_000);
  const [filtro, setFiltro] = useState<FiltroDoHistorico>('todas');
  const [limpando, setLimpando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const todas = useMemo(() => execucoes.data ?? [], [execucoes.data]);
  const visiveis = useMemo(() => filtrarExecucoes(todas, filtro), [todas, filtro]);
  const comFaltas = useMemo(() => filtrarExecucoes(todas, 'faltas').length, [todas]);

  return (
    <div className="flex flex-col gap-[22px]">
      <CabecalhoPagina
        rotulo={t.rotulo}
        titulo={t.titulo}
        subtitulo={t.subtitulo}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setLimpando(true)} disabled={semPasta}>
              {t.apagarAntigas}
            </Botao>
            <Botao onClick={() => seguro(api.batch.openFolder())} disabled={semPasta}>
              <IconePasta />
              {t.abrirPasta}
            </Botao>
          </>
        }
      />

      {aviso ? (
        <Cartao
          role="status"
          className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          data-testid="aviso-historico"
        >
          <span className="min-w-0 flex-1">{aviso}</span>
          <Botao variante="fantasma" pequeno onClick={() => setAviso(null)}>
            {msg.acoes.dispensar}
          </Botao>
        </Cartao>
      ) : null}

      {semPasta ? (
        <SemPasta />
      ) : execucoes.isError ? (
        <ErroDeLeitura causa={execucoes.error} aoTentarDeNovo={() => void execucoes.refetch()} />
      ) : execucoes.isPending ? (
        <Carregando rotulo={t.carregando} />
      ) : todas.length === 0 ? (
        <Cartao
          borda="vazio"
          className="flex max-w-[520px] flex-col items-start gap-3 p-[22px]"
          data-testid="historico-vazio"
        >
          <h2 className="m-0 text-lg font-extrabold">{t.vazio.titulo}</h2>
          <p className="m-0 text-sm leading-normal text-texto-claro">{t.vazio.corpo}</p>
          <Link className={classeBotao('primario')} to="/lista">
            {t.vazio.irParaLista}
          </Link>
        </Cartao>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['todas', t.filtros.todas, todas.length],
                ['faltas', t.filtros.faltas, comFaltas],
              ] as const
            ).map(([id, nome, n]) => (
              <button
                key={id}
                type="button"
                className="chip-f"
                aria-pressed={filtro === id}
                onClick={() => setFiltro(id)}
                data-filtro={id}
              >
                {nome} <span className="font-mono text-texto-mudo">{n}</span>
              </button>
            ))}
          </div>

          <section className="overflow-x-auto rounded-lg border border-borda bg-cartao">
            <table className="w-full min-w-[900px] border-collapse text-[13.5px]" aria-label={t.tabela}>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="lbl py-3 pr-2 pl-[18px] font-medium">
                    {t.colunas.quando}
                  </th>
                  <th scope="col" className="lbl px-2 py-3 font-medium">
                    {t.colunas.lista}
                  </th>
                  <th scope="col" className="lbl px-2 py-3 font-medium">
                    {t.colunas.duracao}
                  </th>
                  <th scope="col" className="lbl w-[250px] px-2 py-3 font-medium">
                    {t.colunas.resultado}
                  </th>
                  <th scope="col" className="lbl px-2 py-3 font-medium">
                    {t.colunas.fim}
                  </th>
                  <th scope="col" className="lbl py-3 pr-[18px] pl-2 text-right font-medium">
                    {t.colunas.acoes}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <LinhaDaExecucao key={r.id} r={r} agora={agora} acompanhada={acompanhada} />
                ))}
              </tbody>
            </table>
            {visiveis.length === 0 ? (
              <p className="m-0 px-4 py-8 text-center text-sm text-texto-suave" data-testid="filtro-vazio">
                {t.filtroVazio}
              </p>
            ) : null}
          </section>
        </>
      )}

      <DialogoLimpeza aberto={limpando} aoFechar={() => setLimpando(false)} aoConcluir={setAviso} />
    </div>
  );
}
