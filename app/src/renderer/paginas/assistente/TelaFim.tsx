// Tela final do assistente (protótipo, estado "Pronto"): o app termina sozinho o que antes era feito à mão nas
// interfaces web. Acompanha a pós-configuração que roda no main (`setup.state`) e pergunta o modo da interface
// (protótipo "Assistente · tela final com a escolha do modo"), com o Modo DJ marcado em instalação nova.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { setupInicial, type LoginNavidrome } from '@shared/configuracao';
import type { ModoInterface } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import { MODO_RECOMENDADO, modoProposto } from '@shared/modo';
import { ListaTarefas } from '../../components/ListaTarefas';
import { EscolhaDoModo } from '../../components/modo';
import { Botao, Rotulo } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { useUi } from '../../lib/estado';
import { useMudarSettings, useSettings } from '../../lib/preferencias';

/** "Como você vai usar o Soulcrate?": grava ao marcar e ao sair para o Início (o marcado de fábrica também vale). */
function PerguntaDoModo({ valor, aoMudar }: { valor: ModoInterface; aoMudar(m: ModoInterface): void }) {
  const t = msg.modo.assistente;
  return (
    <fieldset
      className="m-0 mt-2 flex flex-col gap-[14px] rounded-lg border border-borda bg-painel p-6"
      data-testid="pergunta-do-modo"
    >
      <legend className="float-left flex w-full flex-col gap-[6px] p-0">
        <span className="text-xl font-extrabold">{t.titulo}</span>
        <span className="text-sm leading-normal text-texto-suave">{t.dica}</span>
      </legend>
      <EscolhaDoModo textos={t} valor={valor} aoMudar={aoMudar} recomendado={MODO_RECOMENDADO} />
    </fieldset>
  );
}

export function TelaFim() {
  const navegar = useNavigate();
  const setup = useUi((s) => s.setup) ?? setupInicial();
  const operacao = useUi((s) => s.operacao);
  const m = msg.assistente.fim;
  const settings = useSettings();
  const mudarSettings = useMudarSettings();
  const [escolha, setEscolha] = useState<ModoInterface | null>(null);
  const modo = escolha ?? modoProposto(settings.data);
  const escolher = (novo: ModoInterface) => {
    setEscolha(novo);
    seguro(mudarSettings({ modo: novo }));
  };

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
      <PerguntaDoModo valor={modo} aoMudar={escolher} />
      <div className="flex gap-2">
        <Botao
          variante="primario"
          onClick={() => {
            seguro(mudarSettings({ modo }));
            navegar('/');
          }}
        >
          {m.irParaInicio}
        </Botao>
      </div>
    </div>
  );
}
