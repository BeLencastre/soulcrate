// Navegação lateral (protótipo "Componente navegação lateral"): logo, seis telas e o estado da stack.
import type { ComponentType } from 'react';
import { NavLink } from 'react-router';
import { msg } from '@shared/mensagens';
import { SERVICOS } from '@shared/servicos';
import { resumirStack, servicoSaudavel, type EstadoStack, type ServicoStatus } from '@shared/stack';
import { useStackStatus } from '../lib/estado';
import { execucaoRodando, useExecucao } from '../lib/lote-store';
import {
  IconeBaixar,
  IconeBiblioteca,
  IconeConfiguracoes,
  IconeHistorico,
  IconeInicio,
  IconeServicos,
  Logo,
} from './icones';
import { Led, type CorLed } from './ui';

const ITENS: { rota: string; rotulo: string; Icone: ComponentType<{ tamanho?: number }>; fim?: boolean }[] = [
  { rota: '/', rotulo: msg.nav.inicio, Icone: IconeInicio, fim: true },
  { rota: '/lista', rotulo: msg.nav.lista, Icone: IconeBaixar },
  { rota: '/historico', rotulo: msg.nav.historico, Icone: IconeHistorico },
  { rota: '/biblioteca', rotulo: msg.nav.biblioteca, Icone: IconeBiblioteca },
  { rota: '/servicos', rotulo: msg.nav.servicos, Icone: IconeServicos },
  { rota: '/configuracoes', rotulo: msg.nav.configuracoes, Icone: IconeConfiguracoes },
];

const LED_DO_ESTADO: Record<EstadoStack, CorLed> = {
  verificando: 'cinza',
  'no-ar': 'verde',
  desligada: 'cinza',
  ligando: 'azul',
  atencao: 'laranja',
  erro: 'vermelho',
};

export function ledDoServico(s: ServicoStatus): CorLed {
  if (s.container !== 'running') return 'cinza';
  if (servicoSaudavel(s)) return 'verde';
  if (s.saude === 'starting') return 'azul';
  return 'vermelho';
}

/** O lote rodando, sempre à mão (protótipo "Componente navegação lateral"): lista, progresso e tempo restante. */
function CartaoDoLote() {
  const rodando = useExecucao(execucaoRodando);
  const estado = useExecucao((s) => s.estado);
  const resumo = useExecucao((s) => s.resumo);
  if (!rodando) return null;
  const total = estado.total || estado.faixas.length;
  const feitas = estado.contagem.concluidas;
  const eta = estado.progresso?.etaMin ?? null;
  return (
    <NavLink
      to="/lista/execucao"
      data-testid="cartao-lote"
      className="flex flex-col gap-2 rounded-md border border-borda bg-[#181b1f] p-3 text-texto no-underline hover:border-[#4a4f57]"
    >
      <span className="lbl !text-[10.5px] !text-chip-azul">{msg.lote.sidebar.rodando}</span>
      <span className="truncate font-mono text-[13px] font-bold">{estado.inicio?.list ?? resumo?.lista ?? '…'}</span>
      <span aria-hidden="true" className="block h-1 overflow-hidden rounded-sm bg-borda">
        <span
          className="block h-1 bg-ambar"
          style={{ width: `${total > 0 ? Math.round((feitas / total) * 100) : 0}%` }}
        />
      </span>
      <span className="font-mono text-xs text-texto-suave">{msg.lote.sidebar.progresso(feitas, total, eta)}</span>
    </NavLink>
  );
}

export function BarraLateral() {
  const status = useStackStatus();
  const resumo = resumirStack(status);

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col gap-[26px] overflow-y-auto border-r border-borda-fraca bg-painel px-[14px] pt-[22px] pb-6">
      <div className="flex items-center gap-[10px] px-2 py-1">
        <Logo />
        <span className="text-[17px] font-extrabold tracking-[0.06em]" style={{ fontStretch: '125%' }}>
          SOULCRATE
        </span>
      </div>

      <nav aria-label={msg.nav.principal} className="flex flex-col gap-[2px]">
        {ITENS.map(({ rota, rotulo, Icone, fim }) => (
          <NavLink
            key={rota}
            to={rota}
            end={fim ?? false}
            className={({ isActive }) =>
              `flex min-h-[42px] items-center gap-3 rounded-md px-3 text-sm font-semibold no-underline ${
                isActive ? 'bg-[#23262b] text-texto-forte' : 'text-texto-suave hover:bg-campo hover:text-texto'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icone tamanho={18} />
                <span>{rotulo}</span>
                <span
                  aria-hidden="true"
                  className="ml-auto size-[6px] rounded-[2px]"
                  style={{ background: isActive ? '#F2B53A' : 'transparent' }}
                />
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-[14px]">
        <CartaoDoLote />
        <div
          className="flex flex-col gap-[10px] border-t border-[#24272c] p-3"
          role="status"
          aria-label={`${msg.barraLateral.titulo}: ${msg.barraLateral.resumo(resumo)}`}
        >
          <span className="lbl !text-[10.5px]">{msg.barraLateral.titulo}</span>
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <Led cor={LED_DO_ESTADO[resumo.estado]} tamanho={9} brilho />
            <span data-testid="resumo-stack">{msg.barraLateral.resumo(resumo)}</span>
          </div>
          {SERVICOS.map((info) => {
            const s = status.servicos.find((x) => x.id === info.id);
            return (
              <div key={info.id} className="flex items-center gap-2 text-[12.5px] text-texto-suave">
                <Led cor={s ? ledDoServico(s) : 'cinza'} tamanho={6} />
                <span>{info.nome}</span>
                <span className="ml-auto font-mono text-[11.5px] text-texto-mudo">:{info.porta}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
