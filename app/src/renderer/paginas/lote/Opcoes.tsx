// Etapa 2 do lote (protótipo "Baixar lista · Opções"): receitas de um clique, as opções do script agrupadas, as
// avançadas recolhidas e o resumo com o comando equivalente. Os padrões são os do script; o app mostra o que difere.
import * as Collapsible from '@radix-ui/react-collapsible';
import { Link } from 'react-router';
import { msg } from '@shared/mensagens';
import {
  aplicarReceita,
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
import { useRascunho } from '../../lib/lote-store';

function LinhaLigaDesliga({
  id,
  opcoes,
  aoMudar,
}: {
  id: OpcaoBooleanaId;
  opcoes: OpcoesLote;
  aoMudar(valor: boolean): void;
}) {
  const t = msg.lote.opcoes.itens[id];
  const mudou = opcoes[id] !== OPCOES_PADRAO[id];
  return (
    <label
      className="flex cursor-pointer items-start gap-[14px] border-t border-[#22252a] px-[18px] py-[14px]"
      data-opcao={id}
    >
      <input
        type="checkbox"
        role="switch"
        className="sw mt-[2px]"
        checked={opcoes[id]}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-[10px]">
          <span className="text-sm font-bold">{t.titulo}</span>
          {mudou ? <span className="dif">{msg.lote.opcoes.diferente}</span> : null}
        </span>
        <span className="text-[13px] leading-[1.45] text-texto-suave">{t.desc}</span>
      </span>
      <span className="pt-[3px] font-mono text-xs text-texto-apagado">-{id}</span>
    </label>
  );
}

function LinhaNumero({
  id,
  opcoes,
  aoMudar,
}: {
  id: OpcaoNumericaId;
  opcoes: OpcoesLote;
  aoMudar(valor: number): void;
}) {
  const t = msg.lote.opcoes.itens[id];
  const l = LIMITES[id];
  const v = opcoes[id];
  const mudou = v !== l.padrao;
  return (
    <div className="flex flex-wrap items-center gap-[14px] px-[18px] py-[10px]" data-opcao={id}>
      <span className="flex min-w-[260px] flex-[1_1_260px] flex-col gap-[3px]">
        <span className="flex items-center gap-[10px]">
          <span className="text-sm font-bold">{t.titulo}</span>
          {mudou ? <span className="dif">{msg.lote.opcoes.padrao(String(l.padrao))}</span> : null}
        </span>
        <span className="font-mono text-xs text-texto-apagado">-{id}</span>
      </span>
      <span className="inline-flex items-center gap-[6px]">
        <button
          type="button"
          className="knob"
          aria-label={msg.lote.opcoes.diminuir(t.titulo)}
          disabled={v <= l.min}
          onClick={() => aoMudar(limitar(id, v - l.passo))}
        >
          −
        </button>
        <output
          className={`min-w-14 text-center font-mono text-lg font-bold ${mudou ? 'text-ambar' : ''}`}
          aria-label={t.titulo}
          data-valor={id}
        >
          {v}
        </output>
        <button
          type="button"
          className="knob"
          aria-label={msg.lote.opcoes.aumentar(t.titulo)}
          disabled={v >= l.max}
          onClick={() => aoMudar(limitar(id, v + l.passo))}
        >
          +
        </button>
        <span className="w-9 text-xs text-texto-mudo">{l.unidade}</span>
      </span>
    </div>
  );
}

export function Opcoes() {
  const lista = useRascunho((s) => s.lista);
  const opcoes = useRascunho((s) => s.opcoes);
  const definir = useRascunho((s) => s.definirOpcoes);
  const analise = useRascunho((s) => s.analise);
  const iniciarLote = useIniciarLote();
  const t = msg.lote.opcoes;

  const alteradas = opcoesAlteradas(opcoes);
  const alteradasAvancadas = alteradas.filter((id) => GRUPOS_NUMERICOS.some((g) => (g.itens as string[]).includes(id)));
  const resultado = analise?.resultado.analise;
  const paraBaixar = resultado?.ok ? resultado.toProcess : null;
  const mudar = (parcial: Partial<OpcoesLote>) => definir({ ...opcoes, ...parcial });

  return (
    <div className="flex flex-col gap-5 pb-4">
      <header className="flex flex-col gap-2">
        <Rotulo>{msg.lote.rotulo}</Rotulo>
        <h1 className="m-0 font-mono text-[28px] font-bold">{lista ? lista.nome : msg.nav.lista}</h1>
      </header>

      <EtapasDoLote />

      {iniciarLote.erro ? (
        <CartaoErro erro={iniciarLote.erro} aoTentarDeNovo={iniciarLote.iniciar} aoFechar={iniciarLote.limparErro} />
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <section aria-label={t.receitas} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="m-0 text-lg font-extrabold">{t.receitas}</h2>
              <span className="text-[13px] text-texto-suave">{t.receitasDica}</span>
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
                  <span className="text-sm font-bold text-texto">{t.receitasNomes[r.id]}</span>
                  <span className="font-mono text-[11.5px] leading-normal text-texto-suave">{flagsDaReceita(r)}</span>
                </button>
              ))}
            </div>
          </section>

          {GRUPOS_BOOLEANOS.map((g) => (
            <Cartao como="section" key={g.id} className="flex flex-col" aria-label={t.grupos[g.id].nome}>
              <div className="flex items-baseline gap-3 px-[18px] pt-4 pb-[6px]">
                <h2 className="m-0 text-base font-extrabold">{t.grupos[g.id].nome}</h2>
                <span className="text-[13px] text-texto-mudo">{t.grupos[g.id].desc}</span>
              </div>
              {g.itens.map((id) => (
                <LinhaLigaDesliga key={id} id={id} opcoes={opcoes} aoMudar={(v) => mudar({ [id]: v })} />
              ))}
            </Cartao>
          ))}

          <Collapsible.Root asChild defaultOpen={false}>
            <Cartao como="section" className="overflow-hidden" aria-label={t.avancadas}>
              <Collapsible.Trigger className="group flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-[18px] text-left hover:bg-[#181b1f]">
                <IconeSeta tamanho={16} className="transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-base font-extrabold">{t.avancadas}</span>
                <span className="text-[13px] text-texto-mudo">{t.avancadasDica}</span>
                {alteradasAvancadas.length > 0 ? (
                  <span className="dif ml-auto">{t.alteradas(alteradasAvancadas.length)}</span>
                ) : null}
              </Collapsible.Trigger>
              <Collapsible.Content>
                {GRUPOS_NUMERICOS.map((g) => (
                  <div key={g.id}>
                    <div className="border-t border-[#22252a] px-[18px] pt-[14px] pb-1">
                      <span className="lbl">{t.grupos[g.id].nome}</span>
                    </div>
                    {g.itens.map((id) => (
                      <LinhaNumero key={id} id={id} opcoes={opcoes} aoMudar={(v) => mudar({ [id]: v })} />
                    ))}
                  </div>
                ))}
              </Collapsible.Content>
            </Cartao>
          </Collapsible.Root>
        </div>

        <aside
          aria-label={t.resumo}
          className="flex max-w-full flex-[1_1_300px] flex-col gap-[14px] rounded-lg border border-borda bg-painel p-5"
        >
          <Rotulo>{t.resumo}</Rotulo>
          <span className="text-[15px] leading-normal" data-testid="resumo-opcoes">
            {alteradas.length === 0 ? (
              t.nenhuma
            ) : (
              <>
                <strong className="font-mono text-lg">{alteradas.length}</strong> {t.algumas(alteradas.length)}
              </>
            )}
          </span>
          <div className="flex flex-col gap-[6px]">
            <span className="text-xs text-texto-mudo">{t.equivale}</span>
            <code
              className="block rounded-md border border-borda-fraca bg-fundo p-3 font-mono text-xs leading-relaxed break-words text-[#d9d6cf]"
              data-testid="comando-equivalente"
            >
              {comandoEquivalente(lista?.nome ?? 'lista.txt', opcoes)}
            </code>
          </div>
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
              {paraBaixar !== null ? t.iniciar(paraBaixar) : t.iniciarSemContagem}
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
