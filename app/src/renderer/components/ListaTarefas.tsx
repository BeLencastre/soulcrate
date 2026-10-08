// As tarefas da pós-configuração (protótipo "Assistente de configuração", tela final): gravar, ligar a stack, criar o
// administrador do Navidrome, configurar o Soulbeet e conferir a porta 2234. Usada no fim do assistente e no
// "Aplicar e reiniciar" das Configurações.
import { useState, type FormEvent } from 'react';
import type { LoginNavidrome, SetupEstado, TarefaEstado, TarefaSetup } from '@shared/configuracao';
import { msg } from '@shared/mensagens';
import { CartaoErro } from './CartaoErro';
import { Campo } from './campos';
import { Botao, Chip, type CorChip } from './ui';

const COR_DO_ESTADO: Record<TarefaEstado, CorChip> = {
  feito: 'verde',
  agora: 'azul',
  depois: 'neutro',
  erro: 'vermelho',
  aviso: 'laranja',
  'precisa-login': 'laranja',
};

const BORDA: Partial<Record<TarefaEstado, string>> = {
  agora: 'border-azul-borda',
  erro: 'border-erro-borda',
  aviso: 'border-aviso-borda',
  'precisa-login': 'border-aviso-borda',
};

function FormularioLogin({
  aoEnviar,
  recusado,
}: {
  aoEnviar(login: LoginNavidrome): void;
  /** o login anterior não entrou */
  recusado: boolean;
}) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const pronto = usuario.trim() !== '' && senha !== '';

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (pronto) aoEnviar({ usuario: usuario.trim(), senha });
  }

  return (
    <form onSubmit={enviar} className="flex w-full flex-col gap-4 border-t border-borda pt-4" data-login-navidrome>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold">{msg.assistente.fim.loginTitulo}</h3>
        <p className="hint m-0">{msg.assistente.fim.loginCorpo}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo={msg.assistente.fim.loginUsuario} valor={usuario} aoMudar={setUsuario} autoComplete="username" />
        <Campo
          rotulo={msg.assistente.fim.loginSenha}
          valor={senha}
          aoMudar={setSenha}
          tipo="password"
          autoComplete="current-password"
        />
      </div>
      {recusado ? (
        <p role="alert" className="m-0 text-[13px] text-chip-vermelho">
          {msg.assistente.fim.loginErrado}
        </p>
      ) : null}
      <Botao type="submit" variante="primario" className="self-start" disabled={!pronto}>
        {msg.assistente.fim.loginContinuar}
      </Botao>
    </form>
  );
}

export function ListaTarefas({
  estado,
  aoTentarDeNovo,
  aoInformarLogin,
  ultimaLinha,
}: {
  estado: SetupEstado;
  aoTentarDeNovo(): void;
  aoInformarLogin(login: LoginNavidrome): void;
  /** última linha do log do build, mostrada enquanto a stack liga */
  ultimaLinha?: string | null;
}) {
  const [enviouLogin, setEnviouLogin] = useState(false);

  return (
    <ul
      className="m-0 flex list-none flex-col gap-[10px] p-0"
      aria-label={msg.assistente.fim.tarefasAria}
      data-testid="tarefas-setup"
    >
      {estado.tarefas.map((t: TarefaSetup) => (
        <li
          key={t.id}
          data-tarefa={t.id}
          data-estado={t.estado}
          className={`flex flex-wrap items-center gap-[14px] rounded-lg border bg-cartao px-4 py-[14px] ${BORDA[t.estado] ?? 'border-borda'}`}
        >
          <Chip cor={COR_DO_ESTADO[t.estado]}>{msg.assistente.fim.estado[t.estado]}</Chip>
          <span className="font-semibold">{msg.assistente.fim.tarefa(t.id, t.estado, t.detalhe)}</span>
          {t.detalhe ? <span className="ml-auto font-mono text-xs text-texto-mudo">{t.detalhe}</span> : null}

          {t.id === 'stack' && t.estado === 'agora' ? (
            <div className="flex w-full flex-col gap-1">
              <span className="hint">{msg.assistente.fim.construindo}</span>
              {ultimaLinha ? (
                <code className="truncate font-mono text-xs text-texto-mudo" data-testid="ultima-linha">
                  {ultimaLinha}
                </code>
              ) : null}
            </div>
          ) : null}

          {t.id === 'porta' && (t.estado === 'aviso' || t.estado === 'feito') ? (
            <p className="hint m-0 w-full">{msg.configuracoes.rede.explicacao}</p>
          ) : null}

          {t.estado === 'erro' && t.erro ? (
            <div className="w-full">
              <CartaoErro erro={t.erro} aoTentarDeNovo={aoTentarDeNovo} />
            </div>
          ) : null}

          {t.estado === 'precisa-login' ? (
            <FormularioLogin
              recusado={enviouLogin && !estado.rodando}
              aoEnviar={(login) => {
                setEnviouLogin(true);
                aoInformarLogin(login);
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
