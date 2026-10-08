// As três etapas do lote (protótipos "Baixar lista · Lista / Opções / Execução"): 01 Lista, 02 Opções, 03 Execução.
import { NavLink } from 'react-router';
import { msg } from '@shared/mensagens';

const ETAPAS = [
  { rota: '/lista', numero: '01', rotulo: msg.lote.etapas.lista },
  { rota: '/lista/opcoes', numero: '02', rotulo: msg.lote.etapas.opcoes },
  { rota: '/lista/execucao', numero: '03', rotulo: msg.lote.etapas.execucao },
] as const;

export function EtapasDoLote() {
  return (
    <nav
      aria-label={msg.lote.etapas.rotulo}
      className="flex flex-wrap gap-1 self-start rounded-lg border border-borda-fraca bg-painel p-1"
    >
      {ETAPAS.map((e) => (
        <NavLink key={e.rota} to={e.rota} end className="stp">
          {({ isActive }) => (
            <>
              <span className={`font-mono ${isActive ? 'text-ambar' : ''}`}>{e.numero}</span>
              {e.rotulo}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
