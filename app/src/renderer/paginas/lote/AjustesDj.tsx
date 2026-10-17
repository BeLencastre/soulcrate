// Etapa 2 do lote no Modo DJ (protótipo "DJ · Baixar lista › Ajustes"): as receitas viram "Situações comuns" com o
// que cada uma faz, a qualidade vira caixas de marcar, os interruptores falam o que fazem (sem "não" nem "sem") e o
// resumo diz o que mudou em palavras, sem o comando equivalente. As opções gravadas são as mesmas do Modo Dev.
import { useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { Link } from 'react-router';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import {
  aplicarReceita,
  GRUPOS_BOOLEANOS,
  GRUPOS_NUMERICOS,
  LIMITES,
  limitar,
  novasOpcoes,
  opcoesAlteradas,
  receitaAtiva,
  RECEITAS,
  type OpcaoBooleanaId,
  type OpcaoNumericaId,
  type OpcoesLote,
} from '@shared/opcoes-lote';
import { CartaoErro } from '../../components/CartaoErro';
import { IconePlay, IconeSeta } from '../../components/icones';
import { EtapasDoLote } from '../../components/lote/Etapas';
import { useIniciarLote } from '../../components/lote/IniciarLote';
import { Botao, Cartao, classeBotao, Rotulo } from '../../components/ui';
import { linhasDoResumoDj, marcadoNoDj, numericosAlterados, opcaoDoDj } from '../../lib/ajustes-dj';
import { semExtensao } from '../../lib/historico';
import { useRascunho } from '../../lib/lote-store';

const t = msgDj.lote.ajustes;

function Interruptor({ id, opcoes, aoMudar }: { id: OpcaoBooleanaId; opcoes: OpcoesLote; aoMudar(v: boolean): void }) {
  const item = t.itens[id];
  const mudou = opcoesAlteradas(opcoes).includes(id);
  return (
    <label className="flex cursor-pointer items-start gap-4" data-opcao={id}>
      <input
        type="checkbox"
        role="switch"
        className="sw mt-[2px]"
        checked={marcadoNoDj(id, opcoes)}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[15px] font-bold">{item.titulo}</span>
          {mudou ? <span className="dif">{t.mudou}</span> : null}
        </span>
        <span className="text-[13px] leading-[1.45] text-texto-suave">{item.desc}</span>
      </span>
    </label>
  );
}

function Numero({ id, opcoes, aoMudar }: { id: OpcaoNumericaId; opcoes: OpcoesLote; aoMudar(v: number): void }) {
  const item = t.itens[id];
  const l = LIMITES[id];
  const v = opcoes[id];
  const mudou = v !== l.padrao;
  const nome = item.titulo.toLowerCase();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-linha py-[14px]" data-opcao={id}>
      <span className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
        <span className="text-[15px] font-bold">{item.titulo}</span>
        {item.desc ? <span className="text-[13px] text-texto-suave">{item.desc}</span> : null}
      </span>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          className="knob"
          aria-label={msg.lote.opcoes.diminuir(nome)}
          disabled={v <= l.min}
          onClick={() => aoMudar(limitar(id, v - l.passo))}
        >
          −
        </button>
        <output
          className={`min-w-10 text-center font-mono text-[15px] font-bold ${mudou ? 'text-ambar' : ''}`}
          aria-label={item.titulo}
          data-valor={id}
        >
          {v}
        </output>
        <button
          type="button"
          className="knob"
          aria-label={msg.lote.opcoes.aumentar(nome)}
          disabled={v >= l.max}
          onClick={() => aoMudar(limitar(id, v + l.passo))}
        >
          +
        </button>
        <span className="w-8 text-xs text-texto-mudo">{l.unidade}</span>
      </span>
    </div>
  );
}

export function AjustesDj() {
  const lista = useRascunho((s) => s.lista);
  const opcoes = useRascunho((s) => s.opcoes);
  const definir = useRascunho((s) => s.definirOpcoes);
  const analise = useRascunho((s) => s.analise);
  const iniciarLote = useIniciarLote();
  const mudar = (parcial: Partial<OpcoesLote>) => definir({ ...opcoes, ...parcial });
  // "Velocidade e paciência" começa aberta se algo ali já mudou: o que difere do padrão nunca fica escondido
  const [velocidadeAberta, setVelocidadeAberta] = useState(() => numericosAlterados(opcoes) > 0);

  const alteradas = opcoesAlteradas(opcoes);
  const nNumericos = numericosAlterados(opcoes);
  const resultado = analise?.resultado.analise;
  const paraBaixar = resultado?.ok ? resultado.toProcess : null;
  const [qualidade, ...outrosGrupos] = GRUPOS_BOOLEANOS;

  return (
    <div className="flex flex-col gap-5 pb-4" data-testid="ajustes-dj">
      <header className="flex flex-col gap-2">
        <Rotulo>{msg.lote.rotulo}</Rotulo>
        <h1 className="m-0 text-[28px] font-bold">{lista ? semExtensao(lista.nome) : msg.nav.lista}</h1>
      </header>

      <EtapasDoLote />

      {iniciarLote.erro ? (
        <CartaoErro erro={iniciarLote.erro} aoTentarDeNovo={iniciarLote.iniciar} aoFechar={iniciarLote.limparErro} />
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <section aria-labelledby="ajustes-situacoes" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 id="ajustes-situacoes" className="m-0 text-xl font-extrabold">
                {t.situacoes}
              </h2>
              <span className="text-sm text-texto-suave">{t.situacoesDica}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-2">
              {RECEITAS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="rc"
                  aria-pressed={receitaAtiva(r, opcoes)}
                  onClick={() => definir(aplicarReceita(opcoes, r))}
                  data-receita={r.id}
                >
                  <span className="text-sm font-bold text-texto">{msg.lote.opcoes.receitasNomes[r.id]}</span>
                  <span className="text-[12.5px] leading-normal text-texto-suave">{t.receitas[r.id]}</span>
                </button>
              ))}
            </div>
          </section>

          {qualidade ? (
            <Cartao como="div" className="p-0">
              <fieldset className="m-0 flex flex-col gap-[14px] border-0 px-6 py-[22px]" data-grupo="qualidade">
                <legend className="float-left mb-1 flex w-full flex-col gap-1 p-0">
                  <span className="text-lg font-extrabold">{t.qualidade.nome}</span>
                  <span className="text-[13px] text-texto-suave">{t.qualidade.desc}</span>
                </legend>
                {qualidade.itens.map((id) => (
                  <label key={id} className="ql" data-opcao={id}>
                    <input type="checkbox" checked={opcoes[id]} onChange={(e) => mudar({ [id]: e.target.checked })} />
                    <span className="flex flex-col gap-1">
                      <span className="text-[15px] font-bold">{t.itens[id].titulo}</span>
                      <span className="text-[13px] leading-[1.45] text-texto-suave">{t.itens[id].desc}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </Cartao>
          ) : null}

          {outrosGrupos.map((g) => {
            const grupo = g.id === 'titulos' ? t.titulos : t.comportamento;
            return (
              <Cartao
                como="section"
                key={g.id}
                className="flex flex-col gap-5 px-6 py-[22px]"
                aria-labelledby={`ajustes-${g.id}`}
              >
                <div className="flex flex-col gap-1">
                  <h2 id={`ajustes-${g.id}`} className="m-0 text-lg font-extrabold">
                    {grupo.nome}
                  </h2>
                  <span className="text-[13px] text-texto-suave">{grupo.desc}</span>
                </div>
                {g.itens.map((id) => (
                  <Interruptor key={id} id={id} opcoes={opcoes} aoMudar={(v) => mudar(opcaoDoDj(id, v))} />
                ))}
              </Cartao>
            );
          })}

          <Collapsible.Root asChild open={velocidadeAberta} onOpenChange={setVelocidadeAberta}>
            <Cartao como="section" className="overflow-hidden" aria-label={t.velocidade.titulo}>
              <Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-6 py-5 text-left hover:bg-elevado">
                <IconeSeta tamanho={16} className="transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-lg font-extrabold">{t.velocidade.titulo}</span>
                <span className="text-[13px] text-texto-mudo">{t.velocidade.dica}</span>
                {nNumericos > 0 ? <span className="dif ml-auto">{t.velocidade.mudou(nNumericos)}</span> : null}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-x-8 px-6 pb-4">
                  {GRUPOS_NUMERICOS.map((g) => (
                    <div key={g.id} className="flex flex-col">
                      <span className="lbl pt-2 pb-3">{t.velocidade.grupos[g.id]}</span>
                      {g.itens.map((id) => (
                        <Numero key={id} id={id} opcoes={opcoes} aoMudar={(v) => mudar({ [id]: v })} />
                      ))}
                    </div>
                  ))}
                </div>
              </Collapsible.Content>
            </Cartao>
          </Collapsible.Root>
        </div>

        <aside
          aria-label={t.resumo}
          className="flex max-w-full flex-[1_1_300px] flex-col gap-4 rounded-lg border border-borda bg-cartao p-6"
        >
          <Rotulo>{t.resumo}</Rotulo>
          <p className="m-0 text-[15px] leading-normal" data-testid="resumo-opcoes">
            {alteradas.length === 0 ? (
              t.nenhuma
            ) : (
              <>
                <strong className="font-mono text-lg">{alteradas.length}</strong> {t.algumas(alteradas.length)}
              </>
            )}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13.5px]" data-testid="resumo-linhas">
            {linhasDoResumoDj(opcoes).map((l) => (
              <li key={l.rotulo} className="flex justify-between gap-3">
                <span className="text-texto-suave">{l.rotulo}</span>
                <span className={`text-right font-bold ${l.mudou ? 'text-ambar' : ''}`}>{l.valor}</span>
              </li>
            ))}
          </ul>
          <Botao variante="fantasma" className="self-start" onClick={() => definir(novasOpcoes())}>
            {t.restaurar}
          </Botao>
          <div className="h-px bg-borda-fraca" />
          <span className="text-[13px] leading-normal text-texto-suave">{t.conferirStack}</span>
          {lista ? (
            <Botao
              variante="primario"
              disabled={iniciarLote.ocupado || (paraBaixar !== null && paraBaixar === 0)}
              onClick={iniciarLote.iniciar}
              data-testid="iniciar-lote"
            >
              <IconePlay />
              {msgDj.lote.lista.iniciar(paraBaixar ?? 0)}
            </Botao>
          ) : (
            <Link to="/lista" className={classeBotao('primario')}>
              {msgDj.lote.download.vazio.irParaLista}
            </Link>
          )}
        </aside>
      </div>
      {iniciarLote.dialogo}
    </div>
  );
}
