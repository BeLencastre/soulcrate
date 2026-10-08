// Estados comuns das telas do histórico (carregando, erro de leitura, sem pasta do Soulcrate), do protótipo "Estados".
import { criarErro, erroInesperado, type AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { useStackStatus } from '../../lib/estado';
import { CartaoErro } from '../CartaoErro';
import { Cartao } from '../ui';

/** Esqueleto de uma lista que ainda está sendo lida. */
export function Carregando({ rotulo }: { rotulo: string }) {
  return (
    <Cartao role="status" aria-label={rotulo} className="flex flex-col gap-3 p-5" data-testid="carregando">
      <span className="esqueleto h-3 w-[30%]" />
      <span className="esqueleto h-3 w-[55%]" />
      <span className="esqueleto h-3 w-[40%]" />
    </Cartao>
  );
}

/** A leitura de lotes/ falhou: o motivo e "Tentar de novo". */
export function ErroDeLeitura({ causa, aoTentarDeNovo }: { causa: unknown; aoTentarDeNovo: () => void }) {
  const base = erroInesperado(causa);
  const erro: AppError = {
    ...base,
    acoes: [
      { id: 'tentarDeNovo', rotulo: msg.acoes.tentarDeNovo, primaria: true },
      ...base.acoes.map((a) => ({ ...a, primaria: false })),
    ],
  };
  return <CartaoErro erro={erro} aoTentarDeNovo={aoTentarDeNovo} />;
}

/** O app ainda não sabe qual é a pasta do Soulcrate (nada a ler): leva ao assistente. */
export function useSemPasta(): boolean {
  const status = useStackStatus();
  return status.atualizadoEm > 0 && status.projeto.dir === null;
}

export function SemPasta() {
  return <CartaoErro erro={criarErro('projeto.ausente')} />;
}
