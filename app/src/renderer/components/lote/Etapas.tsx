// As três etapas do lote (protótipos "Baixar lista · Lista / Opções / Execução"): 01 Lista, 02 Opções, 03 Execução.
// No Modo DJ: 1 Lista, 2 Ajustes, 3 Download (as mesmas rotas).
import { NavLink } from 'react-router';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import { useModoDj } from '../../lib/modo';

const ROTAS = [
  { rota: '/lista', id: 'lista' },
  { rota: '/lista/opcoes', id: 'opcoes' },
  { rota: '/lista/execucao', id: 'execucao' },
] as const;

const DEV = {
  rotulo: msg.lote.etapas.rotulo,
  lista: { numero: '01', rotulo: msg.lote.etapas.lista },
  opcoes: { numero: '02', rotulo: msg.lote.etapas.opcoes },
  execucao: { numero: '03', rotulo: msg.lote.etapas.execucao },
};

export function EtapasDoLote() {
  const t = useModoDj() ? msgDj.lote.etapas : DEV;
  return (
    <nav
      aria-label={t.rotulo}
      className="flex flex-wrap gap-1 self-start rounded-lg border border-borda-fraca bg-painel p-1"
    >
      {ROTAS.map((e) => (
        <NavLink key={e.rota} to={e.rota} end className="stp">
          {({ isActive }) => (
            <>
              <span className={`font-mono ${isActive ? 'text-ambar' : ''}`}>{t[e.id].numero}</span>
              {t[e.id].rotulo}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
