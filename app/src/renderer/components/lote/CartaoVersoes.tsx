// O card Versão da faixa da aba Ajustes (docs/adr/0006): as versões aceitas em ordem de preferência, numa lista de
// duas zonas (Baixar, nesta ordem / Não baixar), e a duração mínima. Arrastar é só um dos jeitos de mudar: cada linha
// tem os botões ↑ ↓, "mesma posição da de cima" e baixar/não baixar, e a alça funciona no teclado (Espaço pega, as
// setas movem, Espaço solta), como pede a WCAG 2.2 (2.5.7). As regras da ordem são as funções puras de
// `shared/versoes.ts`; aqui só se desenha e se traduz o gesto. Igual nos dois modos; o Dev mostra o parâmetro.
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { msg } from '@shared/mensagens';
import { OPCOES_PADRAO, type OpcoesLote } from '@shared/opcoes-lote';
import {
  aceitarVersao,
  alternarEmpate,
  ATALHOS_VERSAO,
  descerVersao,
  DURACOES_MINIMAS,
  empatadaComAcima,
  ehVersao,
  escreverVersoes,
  formatarDuracao,
  lerVersoes,
  moverVersao,
  recusarVersao,
  subirVersao,
  versoesRecusadas,
  versoesValidas,
  type OrdemVersoes,
  type VersaoId,
} from '@shared/versoes';
import { Cartao } from '../ui';

const t = msg.lote.versoes;
const TIPO_ARRASTO = 'application/x-soulcrate-versao';

type Parcial = Partial<Pick<OpcoesLote, 'Versoes' | 'DuracaoMinima'>>;

function ordemDe(texto: string): OrdemVersoes {
  return lerVersoes(versoesValidas(texto) ? texto : OPCOES_PADRAO.Versoes);
}

/** A versão que está sendo arrastada (o dataTransfer só pode ser lido no drop). */
function versaoArrastada(e: DragEvent): VersaoId | null {
  const v = e.dataTransfer.getData(TIPO_ARRASTO) || e.dataTransfer.getData('text/plain');
  return ehVersao(v) ? v : null;
}

function aceitaArrasto(e: DragEvent) {
  if ([...e.dataTransfer.types].includes(TIPO_ARRASTO)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
}

export function CartaoVersoes({
  opcoes,
  dj,
  aoMudar,
}: {
  opcoes: Pick<OpcoesLote, 'Versoes' | 'DuracaoMinima'>;
  dj: boolean;
  aoMudar(parcial: Parcial): void;
}) {
  const ordem = ordemDe(opcoes.Versoes);
  const aceitas = ordem.flat();
  const recusadas = versoesRecusadas(ordem);
  const [pegada, setPegada] = useState<VersaoId | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const alcas = useRef(new Map<VersaoId, HTMLButtonElement>());
  // a linha que se move no DOM perde o foco: esse blur não solta a versão pega
  const movendo = useRef(false);
  const mudou = opcoes.Versoes !== OPCOES_PADRAO.Versoes || opcoes.DuracaoMinima !== OPCOES_PADRAO.DuracaoMinima;

  // mover uma linha no DOM tira o foco dela em alguns navegadores: devolve o foco à alça que está pega
  useEffect(() => {
    if (pegada) alcas.current.get(pegada)?.focus();
    movendo.current = false;
  }, [pegada, opcoes.Versoes]);

  const mudarOrdem = (nova: OrdemVersoes) => aoMudar({ Versoes: escreverVersoes(nova) });

  const anunciarPosicao = (nova: OrdemVersoes, v: VersaoId) => {
    const pos = nova.findIndex((p) => p.includes(v)) + 1;
    setAnuncio(t.anuncio.moveu(t.nomes[v], pos, nova.length, empatadaComAcima(nova, v)));
  };

  const mover = (v: VersaoId, f: (o: OrdemVersoes, v: VersaoId) => OrdemVersoes) => {
    const nova = f(ordem, v);
    mudarOrdem(nova);
    anunciarPosicao(nova, v);
  };

  const recusar = (v: VersaoId) => {
    mudarOrdem(recusarVersao(ordem, v));
    setPegada(null);
    setAnuncio(t.anuncio.recusou(t.nomes[v]));
  };

  const aceitar = (v: VersaoId) => {
    mudarOrdem(aceitarVersao(ordem, v));
    setAnuncio(t.anuncio.aceitou(t.nomes[v]));
  };

  const teclaNaAlca = (e: KeyboardEvent, v: VersaoId) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (pegada === v) {
        setPegada(null);
        setAnuncio(t.anuncio.soltou(t.nomes[v]));
      } else {
        setPegada(v);
        setAnuncio(t.anuncio.pegou(t.nomes[v]));
      }
    } else if (pegada === v && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      movendo.current = true;
      mover(v, e.key === 'ArrowUp' ? subirVersao : descerVersao);
    } else if (pegada === v && (e.key === 'Escape' || e.key === 'Tab')) {
      setPegada(null);
      setAnuncio(t.anuncio.soltou(t.nomes[v]));
    }
  };

  const soltarAntesDe = (e: DragEvent, antesDe: VersaoId | null) => {
    const v = versaoArrastada(e);
    if (!v) return;
    e.preventDefault();
    e.stopPropagation();
    const nova = moverVersao(ordem, v, antesDe);
    mudarOrdem(nova);
    anunciarPosicao(nova, v);
  };

  const soltarEmNaoBaixar = (e: DragEvent) => {
    const v = versaoArrastada(e);
    if (!v) return;
    e.preventDefault();
    if (aceitas.includes(v) && aceitas.length > 1) recusar(v);
  };

  const comecarArrasto = (e: DragEvent, v: VersaoId) => {
    e.dataTransfer.setData(TIPO_ARRASTO, v);
    e.dataTransfer.setData('text/plain', v);
    e.dataTransfer.effectAllowed = 'move';
  };

  const alca = (v: VersaoId) => (
    <button
      type="button"
      ref={(el) => {
        if (el) alcas.current.set(v, el);
        else alcas.current.delete(v);
      }}
      className="knob cursor-grab text-texto-suave"
      aria-label={t.alca(t.nomes[v])}
      aria-pressed={pegada === v}
      onKeyDown={(e) => teclaNaAlca(e, v)}
      onBlur={() => {
        if (pegada === v && !movendo.current) setPegada(null);
      }}
      data-alca={v}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );

  const nome = (v: VersaoId) => (
    <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
      <span className="text-[15px] font-bold">{t.nomes[v]}</span>
      <span className="text-[12.5px] text-texto-suave">{t.exemplos[v]}</span>
    </span>
  );

  const duracoes: number[] = DURACOES_MINIMAS.includes(opcoes.DuracaoMinima as (typeof DURACOES_MINIMAS)[number])
    ? [...DURACOES_MINIMAS]
    : [...DURACOES_MINIMAS, opcoes.DuracaoMinima].sort((a, b) => a - b);
  const rotuloDuracao = (s: number) => {
    if (s === 0) return t.duracao.desligada;
    return s % 60 === 0 ? t.duracao.minutos(s / 60) : formatarDuracao(s);
  };

  return (
    <Cartao
      como="section"
      className="flex flex-col gap-5 px-6 py-[22px]"
      aria-labelledby="ajustes-versoes"
      data-grupo="versoes"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-[10px]">
          <h2 id="ajustes-versoes" className="m-0 text-lg font-extrabold">
            {t.nome}
          </h2>
          {mudou && !dj ? <span className="dif">{msg.lote.opcoes.diferente}</span> : null}
          {dj ? null : (
            <span className="ml-auto font-mono text-xs text-texto-apagado" data-testid="parametro-versoes">
              -Versoes {opcoes.Versoes}
              {opcoes.DuracaoMinima > 0 ? ` -DuracaoMinima ${opcoes.DuracaoMinima}` : ''}
            </span>
          )}
        </div>
        <span className="text-[13px] text-texto-suave">{t.desc}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.atalhosDica}>
        {ATALHOS_VERSAO.map((a) => (
          <button
            key={a.id}
            type="button"
            className="rc min-h-0 px-3 py-2 text-sm font-bold text-texto"
            aria-pressed={opcoes.Versoes === a.versoes}
            onClick={() => aoMudar({ Versoes: a.versoes })}
            data-atalho-versao={a.id}
          >
            {t.atalhos[a.id]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="lbl" id="versoes-baixar">
          {t.baixar}
        </span>
        <ol
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-labelledby="versoes-baixar"
          data-testid="versoes-aceitas"
          onDragOver={aceitaArrasto}
          onDrop={(e) => soltarAntesDe(e, null)}
        >
          {ordem.map((posicao, i) =>
            posicao.map((v, j) => {
              const empatada = j > 0;
              const ultima = aceitas.length <= 1;
              return (
                <li
                  key={v}
                  draggable
                  onDragStart={(e) => comecarArrasto(e, v)}
                  onDragOver={aceitaArrasto}
                  onDrop={(e) => soltarAntesDe(e, v)}
                  className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${
                    pegada === v ? 'border-ambar bg-ambar-selecionado' : 'border-borda'
                  }`}
                  data-versao={v}
                  data-posicao={i + 1}
                >
                  {alca(v)}
                  <span
                    className="w-8 text-center font-mono text-sm font-bold text-ambar"
                    aria-label={empatada ? t.empate : undefined}
                  >
                    {empatada ? '=' : t.posicao(i + 1)}
                  </span>
                  {nome(v)}
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      className="knob"
                      aria-label={t.subir(t.nomes[v])}
                      disabled={i === 0 && posicao.length === 1}
                      onClick={() => mover(v, subirVersao)}
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      className="knob"
                      aria-label={t.descer(t.nomes[v])}
                      disabled={i === ordem.length - 1 && posicao.length === 1}
                      onClick={() => mover(v, descerVersao)}
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                    <button
                      type="button"
                      className="knob font-mono text-sm aria-pressed:border-ambar aria-pressed:text-ambar"
                      aria-label={t.empatar(t.nomes[v])}
                      aria-pressed={empatada}
                      disabled={i === 0 && !empatada}
                      onClick={() => mover(v, alternarEmpate)}
                      title={t.empate}
                    >
                      <span aria-hidden="true">=</span>
                    </button>
                    <button
                      type="button"
                      className="knob"
                      aria-label={t.recusar(t.nomes[v])}
                      disabled={ultima}
                      title={ultima ? t.ultima : undefined}
                      onClick={() => recusar(v)}
                    >
                      <span aria-hidden="true">−</span>
                    </button>
                  </span>
                </li>
              );
            }),
          )}
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <span className="lbl" id="versoes-nao-baixar">
          {t.naoBaixar}
        </span>
        <ul
          className="m-0 flex min-h-[52px] list-none flex-col gap-2 rounded-md border border-dashed border-borda p-2"
          aria-labelledby="versoes-nao-baixar"
          data-testid="versoes-recusadas"
          onDragOver={aceitaArrasto}
          onDrop={soltarEmNaoBaixar}
        >
          {recusadas.length === 0 ? (
            <li className="px-2 py-2 text-[13px] text-texto-mudo">{t.naoBaixarVazio}</li>
          ) : (
            recusadas.map((v) => (
              <li
                key={v}
                draggable
                onDragStart={(e) => comecarArrasto(e, v)}
                className="flex flex-wrap items-center gap-3 rounded-md border border-borda px-3 py-2 text-texto-suave"
                data-versao={v}
              >
                {nome(v)}
                <button type="button" className="knob" aria-label={t.aceitar(t.nomes[v])} onClick={() => aceitar(v)}>
                  <span aria-hidden="true">+</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-linha pt-4">
        <label className="flex flex-wrap items-center justify-between gap-3" data-opcao="DuracaoMinima">
          <span className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
            <span className="text-[15px] font-bold">{t.duracao.nome}</span>
            <span className="text-[13px] leading-[1.45] text-texto-suave">{t.duracao.desc}</span>
          </span>
          <select
            className="rounded-md border border-borda-forte bg-campo px-3 py-2 text-sm"
            value={opcoes.DuracaoMinima}
            onChange={(e) => aoMudar({ DuracaoMinima: Number(e.target.value) })}
            data-testid="duracao-minima"
          >
            {duracoes.map((s) => (
              <option key={s} value={s}>
                {rotuloDuracao(s)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[13px] leading-[1.45] text-texto-suave">{t.duracao.daLista}</span>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="anuncio-versoes">
        {anuncio}
      </p>
    </Cartao>
  );
}
