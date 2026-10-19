// As três etapas do lote (protótipos "Baixar lista · Lista / Opções / Execução"): 01 Lista, 02 Ajustes, 03 Download,
// iguais nos dois modos.
import { NavLink } from 'react-router';
import { msg } from '@shared/mensagens';

export function EtapasDoLote() {
  const t = msg.lote.etapas;
  const etapas = [
    { rota: '/lista', numero: '01', rotulo: t.lista },
    { rota: '/lista/opcoes', numero: '02', rotulo: t.opcoes },
    { rota: '/lista/execucao', numero: '03', rotulo: t.execucao },
  ];
  return (
    <nav
      aria-label={t.rotulo}
      className="flex flex-wrap gap-1 self-start rounded-lg border border-borda-fraca bg-painel p-1"
    >
      {etapas.map((e) => (
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
