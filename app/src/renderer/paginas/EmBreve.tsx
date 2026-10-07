// Telas que chegam nas próximas fases (Baixar lista, Histórico, Biblioteca): estado vazio do protótipo "Estados".
import { Link } from 'react-router';
import { msg } from '@shared/mensagens';
import { CabecalhoPagina, Cartao, classeBotao, Rotulo } from '../components/ui';

export function EmBreve({ nome }: { nome: string }) {
  return (
    <div className="flex flex-col gap-7">
      <CabecalhoPagina rotulo={nome} titulo={nome} />
      <Cartao
        borda="vazio"
        className="flex max-w-[520px] flex-col items-start gap-3 p-[22px]"
        data-tela-em-breve={nome}
      >
        <Rotulo>{msg.emBreve.rotulo}</Rotulo>
        <h2 className="m-0 text-lg font-extrabold">{msg.emBreve.titulo}</h2>
        <p className="m-0 text-sm leading-normal text-texto-claro">{msg.emBreve.corpo(nome)}</p>
        <Link className={classeBotao('primario')} to="/">
          {msg.emBreve.irParaInicio}
        </Link>
      </Cartao>
    </div>
  );
}
