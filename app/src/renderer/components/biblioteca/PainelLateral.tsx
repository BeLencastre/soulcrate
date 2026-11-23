// A lateral da Biblioteca: as ferramentas (Cuidar · Organizar · Rekordbox · Compartilhar) em abas, um cartão por
// vez, para a lateral não ficar muito mais comprida que a tabela. O seletor é o mesmo das interfaces em Serviços
// (`.seg`), com o teclado das abas (setas, Home e End). A aba aberta fica no endereço (`?painel=`), como a seção de
// Configurações, e o voltar a reencontra. Enquanto uma tarefa de Cuidar da biblioteca roda, a aba Cuidar mostra um
// ponto, para a tarefa não sumir quando a pessoa está em outra aba.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { msg } from '@shared/mensagens';
import {
  ehPainel,
  manutencaoRodando,
  PAINEIS,
  PAINEL_PADRAO,
  useManutencao,
  type PainelBiblioteca,
} from '../../lib/biblioteca';
import { Led } from '../ui';

const idDaAba = (p: PainelBiblioteca) => `biblioteca-aba-${p}`;
const idDoPainel = (p: PainelBiblioteca) => `biblioteca-painel-${p}`;

export function PainelLateral({ paineis }: { paineis: Record<PainelBiblioteca, ReactNode> }) {
  const t = msg.biblioteca.painel;
  const [params, setParams] = useSearchParams();
  const pedido = params.get('painel');
  const aberto: PainelBiblioteca = ehPainel(pedido) ? pedido : PAINEL_PADRAO;
  const rodando = useManutencao(manutencaoRodando);
  const abas = useRef<Partial<Record<PainelBiblioteca, HTMLButtonElement | null>>>({});

  const abrir = (p: PainelBiblioteca) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        novo.set('painel', p);
        return novo;
      },
      { replace: true },
    );

  function teclar(e: KeyboardEvent<HTMLDivElement>) {
    const i = PAINEIS.indexOf(aberto);
    const destino =
      e.key === 'ArrowRight'
        ? PAINEIS[(i + 1) % PAINEIS.length]
        : e.key === 'ArrowLeft'
          ? PAINEIS[(i - 1 + PAINEIS.length) % PAINEIS.length]
          : e.key === 'Home'
            ? PAINEIS[0]
            : e.key === 'End'
              ? PAINEIS[PAINEIS.length - 1]
              : undefined;
    if (!destino) return;
    e.preventDefault();
    abrir(destino);
    abas.current[destino]?.focus();
  }

  return (
    <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3" aria-label={t.rotulo}>
      <div
        role="tablist"
        aria-label={t.rotulo}
        className="flex gap-[2px] rounded-lg border border-borda bg-hover p-[3px]"
        onKeyDown={teclar}
      >
        {PAINEIS.map((p) => {
          const ativo = p === aberto;
          return (
            <button
              key={p}
              ref={(el) => {
                abas.current[p] = el;
              }}
              id={idDaAba(p)}
              type="button"
              role="tab"
              aria-selected={ativo}
              aria-controls={idDoPainel(p)}
              tabIndex={ativo ? 0 : -1}
              data-state={ativo ? 'active' : 'inactive'}
              data-painel={p}
              className="seg !min-h-[34px] flex-auto justify-center !gap-[5px] !px-[6px] text-[12px] whitespace-nowrap"
              onClick={() => abrir(p)}
            >
              {t.abas[p]}
              {p === 'cuidar' && rodando ? (
                <span data-testid="aba-cuidar-rodando">
                  <Led cor="azul" tamanho={7} />
                  <span className="sr-only">{`, ${t.rodando}`}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={idDoPainel(aberto)} aria-labelledby={idDaAba(aberto)} className="flex min-w-0 flex-col">
        {paineis[aberto]}
      </div>
    </aside>
  );
}
