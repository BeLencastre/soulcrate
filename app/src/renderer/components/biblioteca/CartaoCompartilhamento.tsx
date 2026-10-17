// O compartilhamento do slskd (Biblioteca e, no Modo DJ, Configurações → Compartilhamento): quantos arquivos a rede
// enxerga e o botão de varrer de novo. O número vem do slskd; o Modo DJ só muda as palavras.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import { api } from '../../lib/api';
import { CHAVE_BIBLIOTECA, useCompartilhamento } from '../../lib/biblioteca';
import { useModoDj } from '../../lib/modo';
import { Botao, Cartao, Rotulo } from '../ui';

export function CartaoCompartilhamento({ slskdNoAr }: { slskdNoAr: boolean }) {
  const dj = useModoDj();
  const t = dj ? { ...msg.biblioteca.compartilhamento, ...msgDj.compartilhamento } : msg.biblioteca.compartilhamento;
  const qc = useQueryClient();
  const q = useCompartilhamento(slskdNoAr);
  const [pedindo, setPedindo] = useState(false);
  const [pedido, setPedido] = useState(false);
  const r = q.data;
  const c = r?.ok ? r.compartilhamento : null;

  async function reescanear() {
    setPedindo(true);
    try {
      const resposta = await api.library.rescanSharing();
      qc.setQueriesData({ queryKey: [...CHAVE_BIBLIOTECA, 'compartilhamento'] }, resposta);
      setPedido(resposta.ok);
    } finally {
      setPedindo(false);
    }
  }

  return (
    <Cartao como="section" className="flex flex-col gap-[10px] p-4" data-testid="cartao-compartilhamento">
      <Rotulo>{t.titulo}</Rotulo>
      {!slskdNoAr ? (
        <span className="text-[12.5px] leading-normal text-texto-suave">{t.stackFora}</span>
      ) : q.isPending ? (
        <span className="esqueleto h-3 w-[60%]" role="status" aria-label={msg.app.carregando} />
      ) : r && !r.ok ? (
        <span className="text-[13px] leading-normal text-chip-laranja" data-testid="compartilhamento-erro">
          {/* o Modo DJ não fala de slskd nem de contêiner: o detalhe fica no Modo Dev */}
          {dj ? t.desconhecido : `${r.erro.titulo}. ${r.erro.mensagem}`}
        </span>
      ) : (
        <>
          <span className="text-sm leading-normal" data-testid="compartilhamento-n">
            {c?.arquivos === null || c === null ? (
              t.desconhecido
            ) : (
              <>
                <strong className="font-mono">{c.arquivos.toLocaleString('pt-BR')}</strong> {t.anunciados(c.arquivos)}
              </>
            )}
          </span>
          {c?.escaneando ? (
            <span role="status" className="text-[12.5px] text-chip-azul">
              {t.varrendo}
            </span>
          ) : c?.arquivos === 0 ? (
            <span className="text-[12.5px] leading-normal text-chip-laranja">{t.zero}</span>
          ) : (
            <span className="text-[12.5px] leading-normal text-texto-suave">{t.dica}</span>
          )}
          {pedido ? <span className="text-[12.5px] text-texto-suave">{t.pedido}</span> : null}
        </>
      )}
      <Botao
        pequeno
        className="self-start"
        disabled={!slskdNoAr || pedindo || c?.escaneando === true}
        onClick={() => void reescanear()}
        data-testid="reescanear"
      >
        {t.reescanear}
      </Botao>
    </Cartao>
  );
}
