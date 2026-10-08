// Cartão de erro do protótipo "Estados": diz o que houve em linguagem simples e oferece uma ação.
import type { AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { useAcoes } from '../lib/acoes';
import { Botao, Cartao, Rotulo } from './ui';

export function CartaoErro({
  erro,
  aoTentarDeNovo,
  aoFechar,
}: {
  erro: AppError;
  /** o que "Tentar de novo" faz nesta tela; padrão: conferir o ambiente de novo */
  aoTentarDeNovo?: () => void;
  aoFechar?: () => void;
}) {
  const { executarAcaoErro } = useAcoes();
  const inesperado = erro.codigo === 'inesperado';
  return (
    <Cartao
      role="alert"
      borda={inesperado ? 'normal' : 'erro'}
      className="flex flex-col gap-3 p-[22px]"
      data-codigo-erro={erro.codigo}
    >
      <Rotulo className={inesperado ? '' : '!text-[#ff8a8a]'}>{msg.erro.categoria[erro.codigo]}</Rotulo>
      <h2 className="m-0 text-lg font-extrabold">{erro.titulo}</h2>
      <p className="m-0 text-sm leading-normal text-texto-claro">{erro.mensagem}</p>
      {erro.detalhes && (erro.codigo === 'config.invalida' || erro.codigo === 'biblioteca.falhou') ? (
        <pre className="m-0 max-h-40 overflow-auto rounded-md bg-log p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-texto-claro">
          {erro.detalhes}
        </pre>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {erro.acoes.map((a) => (
          <Botao
            key={a.id}
            variante={a.primaria ? 'primario' : 'fantasma'}
            onClick={() => executarAcaoErro(a.id, erro, aoTentarDeNovo ? { aoTentarDeNovo } : {})}
          >
            {a.rotulo}
          </Botao>
        ))}
        {aoFechar ? (
          <Botao variante="fantasma" onClick={aoFechar}>
            {msg.acoes.dispensar}
          </Botao>
        ) : null}
      </div>
    </Cartao>
  );
}
