// O cartão do Rekordbox na Biblioteca: cria o arquivo de playlists que o Rekordbox lê (uma por gênero e uma por lista
// baixada), mostra quando ele foi atualizado e onde está, e explica como levar para o Rekordbox. Depois da primeira
// vez, o main refaz o arquivo sozinho e avisa por evento. O texto é o mesmo nos dois modos.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { rotuloDoMomento } from '@shared/historico';
import { msg } from '@shared/mensagens';
import type { EstadoRekordbox } from '@shared/rekordbox';
import { api } from '../../lib/api';
import { CHAVE_REKORDBOX, useRekordbox } from '../../lib/biblioteca';
import { CartaoErro } from '../CartaoErro';
import { Botao, Cartao, Rotulo } from '../ui';

function Situacao({ estado, gerando, agora }: { estado: EstadoRekordbox; gerando: boolean; agora: number }) {
  const t = msg.biblioteca.rekordbox;
  const r = estado.resumo;
  const quando = estado.geradoEm === null ? t.nunca : t.atualizadoEm(rotuloDoMomento(estado.geradoEm, agora));
  return (
    <span aria-live="polite" className="text-[12.5px] leading-normal text-texto-suave" data-testid="rekordbox-situacao">
      {gerando ? t.gerando : r ? `${quando} ${t.resumo(r.faixas, r.generos, r.listas)}` : quando}
    </span>
  );
}

export function CartaoRekordbox({ agora }: { agora: number }) {
  const t = msg.biblioteca.rekordbox;
  const qc = useQueryClient();
  const q = useRekordbox();
  const [pedindo, setPedindo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const estado = q.data ?? null;
  const gerando = pedindo || estado?.gerando === true;
  const criado = estado !== null && estado.geradoEm !== null;

  async function gerar() {
    setPedindo(true);
    try {
      const r = await api.rekordbox.generate();
      // o erro também fica no estado do main (é o mesmo das gerações automáticas): relê para mostrá-lo
      if (r.ok) qc.setQueryData(CHAVE_REKORDBOX, r.estado);
      else await qc.invalidateQueries({ queryKey: CHAVE_REKORDBOX });
    } finally {
      setPedindo(false);
    }
  }

  async function copiar(caminho: string) {
    await api.app.copyText(caminho);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Cartao como="section" className="flex flex-col gap-[10px] p-4" data-testid="cartao-rekordbox">
      <Rotulo>{t.titulo}</Rotulo>
      <span className="text-[13.5px] leading-normal text-texto-medio">{t.explicacao}</span>
      {estado === null ? (
        q.isPending ? (
          <span className="esqueleto h-3 w-[60%]" role="status" aria-label={msg.app.carregando} />
        ) : null
      ) : (
        <>
          <Situacao estado={estado} gerando={gerando} agora={agora} />
          {!gerando && estado.resumo && estado.resumo.listasComFalha.length > 0 ? (
            <span className="text-[12.5px] leading-normal text-chip-laranja" data-testid="rekordbox-listas-com-falha">
              {t.listasComFalha(estado.resumo.listasComFalha)}
            </span>
          ) : null}
          {!gerando && estado.erro ? <CartaoErro erro={estado.erro} aoTentarDeNovo={() => void gerar()} /> : null}
          {criado ? (
            <div className="flex items-center gap-2 rounded-md border border-borda-fraca bg-fundo py-2 pr-2 pl-3">
              <span
                className="min-w-0 flex-1 truncate font-mono text-[12.5px]"
                title={estado.caminho}
                aria-label={t.arquivo}
                data-testid="arquivo-rekordbox"
              >
                {estado.caminho}
              </span>
              <Botao pequeno onClick={() => void copiar(estado.caminho)} data-testid="copiar-arquivo-rekordbox">
                {copiado ? t.copiado : t.copiar}
              </Botao>
            </div>
          ) : null}
        </>
      )}
      <Botao
        pequeno
        className="self-start"
        disabled={estado === null || gerando}
        onClick={() => void gerar()}
        data-testid="gerar-rekordbox"
      >
        {criado ? t.atualizar : t.criar}
      </Botao>
      {criado ? <span className="text-[12.5px] leading-normal text-texto-suave">{t.sozinho}</span> : null}
      <details className="text-[12.5px] leading-normal text-texto-medio">
        <summary className="cursor-pointer font-bold">{t.comoLevar}</summary>
        <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5">
          {t.passos.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>
      </details>
    </Cartao>
  );
}
