// Componentes do Modo DJ e do Modo Dev (protótipo "Componente · alternador de modo"): o alternador do rodapé da barra
// lateral, a escolha em cartões (assistente e Configurações) e a saída discreta para o Modo Dev onde o DJ esconde algo
// útil.
import type { ModoInterface } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import { useModo, useTrocarModo } from '../lib/modo';
import { IconeCodigo, IconeFones } from './icones';
import { Botao } from './ui';

const ICONE: Record<ModoInterface, typeof IconeFones> = { dj: IconeFones, dev: IconeCodigo };
const ORDEM: readonly ModoInterface[] = ['dj', 'dev'];

/** Dois botões com estado pressionado, num grupo rotulado. O ativo ganha fundo e ícone âmbar; o texto diz qual é. */
export function AlternadorDeModo() {
  const modo = useModo();
  const trocar = useTrocarModo();
  const t = msg.modo;
  return (
    <div role="group" aria-label={t.grupo} className="flex flex-col gap-2 px-3" data-testid="alternador-de-modo">
      <span aria-hidden="true" className="lbl !text-[10.5px]">
        {t.rotulo}
      </span>
      <div className="grid grid-cols-2 gap-[2px] rounded-lg border border-borda bg-fundo p-[3px]">
        {ORDEM.map((m) => {
          const Icone = ICONE[m];
          const ativo = m === modo;
          return (
            <button
              key={m}
              type="button"
              className="seg !min-h-9 justify-center !gap-[7px] !px-2 !text-[13px]"
              aria-pressed={ativo}
              aria-keyshortcuts="Control+Shift+D"
              title={ativo ? t.tituloAtivo(t.nome[m]) : t.titulo(t.nome[m])}
              data-modo={m}
              onClick={() => {
                if (!ativo) trocar(m);
              }}
            >
              <Icone tamanho={15} style={ativo ? { color: 'var(--color-ambar)' } : undefined} />
              {t.nome[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Onde o Modo DJ esconde algo útil para resolver um problema, uma linha discreta leva à mesma tela no Modo Dev. */
export function SaidaParaModoDev() {
  const trocar = useTrocarModo();
  const t = msg.modo.saida;
  return (
    <section
      aria-label={t.rotulo}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-borda-forte bg-fundo px-4 py-[14px]"
      data-testid="saida-para-dev"
    >
      <span className="min-w-[240px] flex-1 text-[13.5px] leading-normal text-texto-suave">{t.texto}</span>
      <Botao variante="fantasma" pequeno onClick={() => trocar('dev')}>
        <IconeCodigo tamanho={15} />
        {t.botao}
      </Botao>
    </section>
  );
}

/**
 * A escolha do modo em dois cartões (rádios num fieldset): na tela final do assistente ("Sou DJ", recomendado). Grava na hora, como as outras preferências.
 */
export function EscolhaDoModo({
  textos,
  valor,
  aoMudar,
  desabilitado = false,
  recomendado,
}: {
  textos: { dj: { titulo: string; descricao: string }; dev: { titulo: string; descricao: string } };
  valor: ModoInterface;
  aoMudar(modo: ModoInterface): void;
  desabilitado?: boolean;
  /** mostra o selo "RECOMENDADO" no cartão deste modo */
  recomendado?: ModoInterface;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
      {ORDEM.map((m) => {
        const Icone = ICONE[m];
        const marcado = valor === m;
        return (
          <label key={m} className="modo" data-escolha-modo={m}>
            <input
              type="radio"
              name="modo-da-interface"
              value={m}
              checked={marcado}
              disabled={desabilitado}
              onChange={() => aoMudar(m)}
            />
            <span className="flex flex-col gap-2">
              <span className="flex flex-wrap items-center gap-[10px]">
                <Icone tamanho={18} style={m === 'dj' ? { color: 'var(--color-ambar)' } : undefined} />
                <span className="text-base font-bold">{textos[m].titulo}</span>
                {recomendado === m ? <span className="dif">{msg.modo.assistente.recomendado}</span> : null}
              </span>
              <span className={`text-sm leading-normal ${marcado ? 'text-ambar-texto-suave' : 'text-texto-suave'}`}>
                {textos[m].descricao}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
