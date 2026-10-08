// Passo 1 do assistente: onde fica o Soulcrate. Pasta nova (o app copia a stack) ou uma que já existe (só confere).
import type { ModoPasta } from '@shared/configuracao';
import { msg } from '@shared/mensagens';
import type { AppError } from '@shared/erros';
import { CartaoErro } from '../../components/CartaoErro';
import { Campo } from '../../components/campos';
import { Botao } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';

export function PassoPasta({
  modo,
  aoMudarModo,
  caminho,
  aoMudarCaminho,
  erro,
  falha,
  aviso,
}: {
  modo: ModoPasta;
  aoMudarModo(modo: ModoPasta): void;
  caminho: string;
  aoMudarCaminho(caminho: string): void;
  erro: string | null;
  falha: AppError | null;
  /** o que aconteceu da última vez que a pasta foi preparada (copiados, já existia) */
  aviso: string | null;
}) {
  const m = msg.assistente.pasta;

  async function escolher() {
    const escolhida = await api.config.pickFolder('project', caminho || undefined).catch(() => null);
    if (escolhida) aoMudarCaminho(escolhida);
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="sr-only">{m.titulo}</legend>
        <label className="opt">
          <input
            type="radio"
            name="modo-pasta"
            className="mt-[2px] size-[18px] accent-ambar"
            checked={modo === 'nova'}
            onChange={() => aoMudarModo('nova')}
          />
          <span className="flex flex-col gap-[6px]">
            <span className="text-[15px] font-bold">{m.nova}</span>
            <span className="hint">{m.novaDica}</span>
          </span>
        </label>
        <label className="opt">
          <input
            type="radio"
            name="modo-pasta"
            className="mt-[2px] size-[18px] accent-ambar"
            checked={modo === 'existente'}
            onChange={() => aoMudarModo('existente')}
          />
          <span className="flex flex-col gap-[6px]">
            <span className="text-[15px] font-bold">{m.existente}</span>
            <span className="hint">{m.existenteDica}</span>
          </span>
        </label>
      </fieldset>

      <Campo
        rotulo={m.campo}
        valor={caminho}
        aoMudar={aoMudarCaminho}
        mono
        achados={erro ? [{ id: 'PASTA', nivel: 'erro', campo: 'geral', mensagem: erro }] : []}
        lado={<Botao onClick={() => seguro(escolher())}>{msg.assistente.escolherPasta}</Botao>}
        testId="campo-pasta"
      />
      {aviso ? (
        <p role="status" className="hint m-0" data-testid="aviso-pasta">
          {aviso}
        </p>
      ) : null}
      {falha ? <CartaoErro erro={falha} /> : null}
    </div>
  );
}
