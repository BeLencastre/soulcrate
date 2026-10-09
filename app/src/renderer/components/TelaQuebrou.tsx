// Rede de segurança do renderer (Fase 6, §6.3: "erros inesperados mostram Copiar detalhes e Abrir log, nunca uma pilha
// crua como única informação"): se uma tela lança no meio do desenho, só ela cai. A barra lateral, a bandeja e o lote
// em andamento continuam de pé, e a pessoa tem como voltar.
import { useNavigate, useRouteError } from 'react-router';
import { erroInesperado, type AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { CartaoErro } from './CartaoErro';
import { Botao } from './ui';

export function erroDaTelaQuebrada(causa: unknown): AppError {
  const base = erroInesperado(causa);
  return {
    ...base,
    titulo: msg.telaQuebrou.titulo,
    mensagem: msg.telaQuebrou.mensagem,
    acoes: [
      { id: 'tentarDeNovo', rotulo: msg.telaQuebrou.recarregar, primaria: true },
      { id: 'copiarDetalhes', rotulo: msg.acoes.copiarDetalhes, primaria: false },
      { id: 'abrirLog', rotulo: msg.acoes.abrirLog, primaria: false },
    ],
  };
}

export function TelaQuebrou() {
  const causa = useRouteError();
  const navegar = useNavigate();
  console.error('Tela quebrou:', causa);
  return (
    <div className="flex flex-col gap-4 px-10 pt-8 pb-12" data-testid="tela-quebrou">
      <CartaoErro erro={erroDaTelaQuebrada(causa)} aoTentarDeNovo={() => window.location.reload()} />
      <div>
        <Botao onClick={() => navegar('/')}>{msg.telaQuebrou.voltarAoInicio}</Botao>
      </div>
    </div>
  );
}
