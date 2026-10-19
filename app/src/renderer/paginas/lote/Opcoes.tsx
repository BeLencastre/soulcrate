// Etapa 02 do lote, Ajustes (protótipos "Baixar lista · Opções" e "DJ · Baixar lista › Ajustes"): receitas de um
// clique, a qualidade em caixas de marcar, os outros grupos em interruptores, as avançadas recolhidas em duas colunas e
// o resumo. O layout é o mesmo nos dois modos; o que muda é o texto: o Modo DJ explica cada ajuste em palavras (com os
// interruptores invertidos onde o script diz "Sem") e resume em frases, o Modo Dev mostra o parâmetro do script e o
// comando equivalente. As opções gravadas são as mesmas.
import { useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { Link } from 'react-router';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import {
  alternarReceita,
  comandoEquivalente,
  flagsDaReceita,
  GRUPOS_BOOLEANOS,
  GRUPOS_NUMERICOS,
  LIMITES,
  limitar,
  novasOpcoes,
  OPCOES_PADRAO,
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
import { useRascunho } from '../../lib/lote-store';
import { useModoDj } from '../../lib/modo';

const tDev = msg.lote.opcoes;
const tDj = msgDj.lote.ajustes;

/** O parâmetro do script, à direita do ajuste (só no Modo Dev). */
function Parametro({ id }: { id: string }) {
  return <span className="pt-[3px] font-mono text-xs text-texto-apagado">-{id}</span>;
}

function Interruptor({
  id,
  opcoes,
  dj,
  aoMudar,
}: {
  id: OpcaoBooleanaId;
  opcoes: OpcoesLote;
  dj: boolean;
  aoMudar(parcial: Partial<OpcoesLote>): void;
}) {
  const item = dj ? tDj.itens[id] : tDev.itens[id];
  const mudou = opcoes[id] !== OPCOES_PADRAO[id];
  return (
    <label className="flex cursor-pointer items-start gap-4" data-opcao={id}>
      <input
        type="checkbox"
        role="switch"
        className="sw mt-[2px]"
        checked={dj ? marcadoNoDj(id, opcoes) : opcoes[id]}
        onChange={(e) => aoMudar(dj ? opcaoDoDj(id, e.target.checked) : { [id]: e.target.checked })}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[15px] font-bold">{item.titulo}</span>
          {mudou ? <span className="dif">{dj ? tDj.mudou : tDev.diferente}</span> : null}
        </span>
        <span className="text-[13px] leading-[1.45] text-texto-suave">{item.desc}</span>
      </span>
      {dj ? null : <Parametro id={id} />}
    </label>
  );
}

function Numero({
  id,
  opcoes,
  dj,
  aoMudar,
}: {
  id: OpcaoNumericaId;
  opcoes: OpcoesLote;
  dj: boolean;
  aoMudar(v: number): void;
}) {
  const item = dj ? tDj.itens[id] : tDev.itens[id];
  const l = LIMITES[id];
  const v = opcoes[id];
  const mudou = v !== l.padrao;
  const nome = dj ? item.titulo.toLowerCase() : item.titulo;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-linha py-[14px]" data-opcao={id}>
      <span className="flex min-w-[220px] flex-1 flex-col gap-[3px]">
        <span className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[15px] font-bold">{item.titulo}</span>
          {mudou && !dj ? <span className="dif">{tDev.padrao(String(l.padrao))}</span> : null}
        </span>
        {dj ? (
          item.desc ? (
            <span className="text-[13px] text-texto-suave">{item.desc}</span>
          ) : null
        ) : (
          <span className="font-mono text-xs text-texto-apagado">-{id}</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          className="knob"
          aria-label={tDev.diminuir(nome)}
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
          aria-label={tDev.aumentar(nome)}
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

/** O resumo à direita: em frases no Modo DJ, com o comando equivalente no Modo Dev. */
function Resumo({ opcoes, nomeDaLista, dj }: { opcoes: OpcoesLote; nomeDaLista: string; dj: boolean }) {
  const alteradas = opcoesAlteradas(opcoes);
  const t = dj ? tDj : tDev;
  return (
    <>
      <p className="m-0 text-[15px] leading-normal" data-testid="resumo-opcoes">
        {alteradas.length === 0 ? (
          t.nenhuma
        ) : (
          <>
            <strong className="font-mono text-lg">{alteradas.length}</strong> {t.algumas(alteradas.length)}
          </>
        )}
      </p>
      {dj ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13.5px]" data-testid="resumo-linhas">
          {linhasDoResumoDj(opcoes).map((l) => (
            <li key={l.rotulo} className="flex justify-between gap-3">
              <span className="text-texto-suave">{l.rotulo}</span>
              <span className={`text-right font-bold ${l.mudou ? 'text-ambar' : ''}`}>{l.valor}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-[6px]">
          <span className="text-xs text-texto-mudo">{tDev.equivale}</span>
          <code
            className="block rounded-md border border-borda-fraca bg-fundo p-3 font-mono text-xs leading-relaxed break-words text-texto-codigo"
            data-testid="comando-equivalente"
          >
            {comandoEquivalente(nomeDaLista, opcoes)}
          </code>
        </div>
      )}
    </>
  );
}

export function Opcoes() {
  const dj = useModoDj();
  const lista = useRascunho((s) => s.lista);
  const opcoes = useRascunho((s) => s.opcoes);
  const definir = useRascunho((s) => s.definirOpcoes);
  const analise = useRascunho((s) => s.analise);
  const iniciarLote = useIniciarLote();
  const mudar = (parcial: Partial<OpcoesLote>) => definir({ ...opcoes, ...parcial });
  // as avançadas começam abertas se algo ali já mudou: o que difere do padrão nunca fica escondido
  const [avancadasAbertas, setAvancadasAbertas] = useState(() => numericosAlterados(opcoes) > 0);

  const nNumericos = numericosAlterados(opcoes);
  const resultado = analise?.resultado.analise;
  const paraBaixar = resultado?.ok ? resultado.toProcess : null;
  const [qualidade, ...outrosGrupos] = GRUPOS_BOOLEANOS;
  const grupo = (id: 'qualidade' | 'titulos' | 'comportamento') =>
    dj ? tDj[id] : { nome: tDev.grupos[id].nome, desc: tDev.grupos[id].desc };

  return (
    <div className="flex flex-col gap-5 pb-4" data-testid="ajustes" data-modo={dj ? 'dj' : 'dev'}>
      <header className="flex flex-col gap-2">
        <Rotulo>{msg.lote.rotulo}</Rotulo>
        <h1 className="m-0 font-mono text-[28px] font-bold" data-testid="nome-da-lista">
          {lista ? lista.nome : msg.nav.lista}
        </h1>
      </header>

      <EtapasDoLote />

      {iniciarLote.erro ? (
        <CartaoErro erro={iniciarLote.erro} aoTentarDeNovo={iniciarLote.iniciar} aoFechar={iniciarLote.limparErro} />
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <section aria-labelledby="ajustes-receitas" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 id="ajustes-receitas" className="m-0 text-xl font-extrabold">
                {dj ? tDj.situacoes : tDev.receitas}
              </h2>
              <span className="text-sm text-texto-suave">{dj ? tDj.situacoesDica : tDev.receitasDica}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-2">
              {RECEITAS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="rc"
                  aria-pressed={receitaAtiva(r, opcoes)}
                  onClick={() => definir(alternarReceita(opcoes, r))}
                  data-receita={r.id}
                >
                  <span className="text-sm font-bold text-texto">{tDev.receitasNomes[r.id]}</span>
                  {dj ? (
                    <span className="text-[12.5px] leading-normal text-texto-suave">{tDj.receitas[r.id]}</span>
                  ) : (
                    <span className="font-mono text-[11.5px] leading-normal text-texto-suave">{flagsDaReceita(r)}</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {qualidade ? (
            <Cartao como="div" className="p-0">
              <fieldset className="m-0 flex flex-col gap-[14px] border-0 px-6 py-[22px]" data-grupo="qualidade">
                <legend className="float-left mb-1 flex w-full flex-col gap-1 p-0">
                  <span className="text-lg font-extrabold">{grupo('qualidade').nome}</span>
                  <span className="text-[13px] text-texto-suave">{grupo('qualidade').desc}</span>
                </legend>
                {qualidade.itens.map((id) => {
                  const item = dj ? tDj.itens[id] : tDev.itens[id];
                  return (
                    <label key={id} className="ql" data-opcao={id}>
                      <input type="checkbox" checked={opcoes[id]} onChange={(e) => mudar({ [id]: e.target.checked })} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-[10px]">
                          <span className="text-[15px] font-bold">{item.titulo}</span>
                          {!dj && opcoes[id] !== OPCOES_PADRAO[id] ? (
                            <span className="dif">{tDev.diferente}</span>
                          ) : null}
                        </span>
                        <span className="text-[13px] leading-[1.45] text-texto-suave">{item.desc}</span>
                      </span>
                      {dj ? null : <Parametro id={id} />}
                    </label>
                  );
                })}
              </fieldset>
            </Cartao>
          ) : null}

          {outrosGrupos.map((g) => (
            <Cartao
              como="section"
              key={g.id}
              className="flex flex-col gap-5 px-6 py-[22px]"
              aria-labelledby={`ajustes-${g.id}`}
            >
              <div className="flex flex-col gap-1">
                <h2 id={`ajustes-${g.id}`} className="m-0 text-lg font-extrabold">
                  {grupo(g.id).nome}
                </h2>
                <span className="text-[13px] text-texto-suave">{grupo(g.id).desc}</span>
              </div>
              {g.itens.map((id) => (
                <Interruptor key={id} id={id} opcoes={opcoes} dj={dj} aoMudar={mudar} />
              ))}
            </Cartao>
          ))}

          <Collapsible.Root asChild open={avancadasAbertas} onOpenChange={setAvancadasAbertas}>
            <Cartao como="section" className="overflow-hidden" aria-label={dj ? tDj.velocidade.titulo : tDev.avancadas}>
              <Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-6 py-5 text-left hover:bg-elevado">
                <IconeSeta tamanho={16} className="transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-lg font-extrabold">{dj ? tDj.velocidade.titulo : tDev.avancadas}</span>
                <span className="text-[13px] text-texto-mudo">{dj ? tDj.velocidade.dica : tDev.avancadasDica}</span>
                {nNumericos > 0 ? (
                  <span className="dif ml-auto">
                    {dj ? tDj.velocidade.mudou(nNumericos) : tDev.alteradas(nNumericos)}
                  </span>
                ) : null}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-x-8 px-6 pb-4">
                  {GRUPOS_NUMERICOS.map((g) => (
                    <div key={g.id} className="flex flex-col">
                      <span className="lbl pt-2 pb-3">{dj ? tDj.velocidade.grupos[g.id] : tDev.grupos[g.id].nome}</span>
                      {g.itens.map((id) => (
                        <Numero key={id} id={id} opcoes={opcoes} dj={dj} aoMudar={(v) => mudar({ [id]: v })} />
                      ))}
                    </div>
                  ))}
                </div>
              </Collapsible.Content>
            </Cartao>
          </Collapsible.Root>
        </div>

        <aside
          aria-label={dj ? tDj.resumo : tDev.resumo}
          className="flex max-w-full flex-[1_1_300px] flex-col gap-4 rounded-lg border border-borda bg-cartao p-6"
        >
          <Rotulo>{dj ? tDj.resumo : tDev.resumo}</Rotulo>
          <Resumo opcoes={opcoes} nomeDaLista={lista?.nome ?? 'lista.txt'} dj={dj} />
          <Botao variante="fantasma" className="self-start" onClick={() => definir(novasOpcoes())}>
            {dj ? tDj.restaurar : tDev.restaurar}
          </Botao>
          <div className="h-px bg-borda-fraca" />
          <span className="text-[13px] leading-normal text-texto-suave">
            {dj ? tDj.conferirStack : tDev.conferirStack}
          </span>
          {lista ? (
            <Botao
              variante="primario"
              disabled={iniciarLote.ocupado || (paraBaixar !== null && paraBaixar === 0)}
              onClick={iniciarLote.iniciar}
              data-testid="iniciar-lote"
            >
              <IconePlay />
              {dj
                ? msg.lote.lista.iniciar(paraBaixar ?? 0)
                : paraBaixar !== null
                  ? tDev.iniciar(paraBaixar)
                  : tDev.iniciarSemContagem}
            </Botao>
          ) : (
            <Link to="/lista" className={classeBotao('primario')}>
              {msg.lote.execucao.vazio.irParaLista}
            </Link>
          )}
        </aside>
      </div>
      {iniciarLote.dialogo}
    </div>
  );
}
