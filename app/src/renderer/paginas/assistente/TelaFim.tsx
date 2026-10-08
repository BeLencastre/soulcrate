// Tela final do assistente (protótipo, estado "Pronto"): o app termina sozinho o que antes era feito à mão nas
// interfaces web. Acompanha a pós-configuração que roda no main (`setup.state`).
import { useNavigate } from 'react-router';
import { setupInicial, type LoginNavidrome } from '@shared/configuracao';
import { msg } from '@shared/mensagens';
import { ListaTarefas } from '../../components/ListaTarefas';
import { Botao, Rotulo } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { useUi } from '../../lib/estado';

export function TelaFim() {
  const navegar = useNavigate();
  const setup = useUi((s) => s.setup) ?? setupInicial();
  const operacao = useUi((s) => s.operacao);
  const m = msg.assistente.fim;

  const problema = setup.tarefas.some((t) => t.estado === 'erro' || t.estado === 'precisa-login');
  const titulo = setup.rodando ? m.tituloRodando : problema ? m.tituloAtencao : m.tituloOk;
  const ultimaLinha = operacao && !operacao.terminou ? (operacao.linhas.at(-1)?.texto ?? null) : null;

  return (
    <div className="flex flex-col gap-6" data-testid="tela-fim" data-terminou={setup.terminou}>
      <Rotulo>{m.rotulo}</Rotulo>
      <h1 className="m-0 text-[34px] leading-tight font-extrabold" style={{ fontStretch: '112%' }}>
        {titulo}
      </h1>
      <p className="m-0 text-[15px] leading-[1.55] text-texto-suave">{m.subtitulo}</p>
      <ListaTarefas
        estado={setup}
        ultimaLinha={ultimaLinha}
        aoTentarDeNovo={() => seguro(api.setup.retry())}
        aoInformarLogin={(login: LoginNavidrome) => seguro(api.setup.provideNavidromeLogin(login))}
      />
      <div className="flex gap-2">
        <Botao variante="primario" onClick={() => navegar('/')}>
          {m.irParaInicio}
        </Botao>
      </div>
    </div>
  );
}
