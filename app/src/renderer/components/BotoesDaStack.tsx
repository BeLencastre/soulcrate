// Os botões da stack no cabeçalho do Início, iguais nos dois modos: um só botão que alterna entre Ligar e Desligar
// (como no protótipo do Modo DJ) e Reiniciar, que recria os contêineres e reconstrói a imagem (`up --build`).
import { msg } from '@shared/mensagens';
import type { AcoesStack } from '@shared/stack';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { IconeLigar, IconeReconstruir } from './icones';
import { Botao } from './ui';

export function BotaoLigarDesligar({ acoes }: { acoes: AcoesStack }) {
  if (acoes.alternar === 'desligar') {
    return (
      <Botao disabled={!acoes.desligar} onClick={() => seguro(api.stack.down())}>
        <IconeLigar />
        {msg.acoes.desligar}
      </Botao>
    );
  }
  return (
    <Botao variante="primario" disabled={!acoes.ligar} onClick={() => seguro(api.stack.up())}>
      <IconeLigar />
      {msg.acoes.ligar}
    </Botao>
  );
}

export function BotaoReiniciar({ acoes }: { acoes: AcoesStack }) {
  return (
    <Botao disabled={!acoes.reconstruir} onClick={() => seguro(api.stack.up({ rebuild: true }))}>
      <IconeReconstruir />
      {msg.acoes.reiniciar}
    </Botao>
  );
}

/** Ligar/Desligar e Reiniciar, lado a lado. */
export function BotoesDaStack({ acoes }: { acoes: AcoesStack }) {
  return (
    <>
      <BotaoLigarDesligar acoes={acoes} />
      <BotaoReiniciar acoes={acoes} />
    </>
  );
}
