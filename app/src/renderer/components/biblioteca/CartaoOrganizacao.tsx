// O cartão "Organização" na Biblioteca: duas escolhas independentes entre só gênero e gênero e artista, uma para as
// pastas no disco e outra para as playlists do Rekordbox. A do disco vale para as próximas importações do beets; para
// mover o que já está no disco, o cartão oferece "Reorganizar as pastas", o mesmo diálogo (com prévia) de Cuidar da
// biblioteca. A do Rekordbox refaz o arquivo de playlists, se ele já existe. O texto é o mesmo nos dois modos.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { ORGANIZACOES, type AlvoDaOrganizacao, type OrganizacaoDasPastas } from '@shared/organizacao';
import { api } from '../../lib/api';
import { CHAVE_ORGANIZACAO, manutencaoRodando, useManutencao, useOrganizacao } from '../../lib/biblioteca';
import { CartaoErro } from '../CartaoErro';
import { Botao, Cartao, Rotulo } from '../ui';

interface Pedido {
  alvo: AlvoDaOrganizacao;
  organizacao: OrganizacaoDasPastas;
}

function Escolha({
  alvo,
  marcada,
  travada,
  aoEscolher,
}: {
  alvo: AlvoDaOrganizacao;
  marcada: OrganizacaoDasPastas;
  travada: boolean;
  aoEscolher(o: OrganizacaoDasPastas): void;
}) {
  const t = msg.biblioteca.organizacao[alvo];
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" data-alvo={alvo}>
      <legend className="mb-1 p-0 text-[12.5px] font-bold text-texto-medio">{t.legenda}</legend>
      {ORGANIZACOES.map((o) => {
        const op = t.opcoes[o];
        return (
          <label
            key={o}
            className="flex cursor-pointer items-start gap-[10px] rounded-md border border-borda-forte px-3 py-[10px] hover:border-borda-hover has-checked:border-ambar has-disabled:cursor-default has-disabled:opacity-60"
            data-organizacao={o}
          >
            <input
              type="radio"
              name={`organizacao-${alvo}`}
              value={o}
              checked={marcada === o}
              disabled={travada}
              onChange={() => aoEscolher(o)}
              className="mt-[3px] accent-ambar"
            />
            <span className="flex min-w-0 flex-col gap-[2px]">
              <span className="text-sm font-bold">{op.titulo}</span>
              <span className="text-[12.5px] leading-normal text-texto-suave">{op.descricao}</span>
              <span className="truncate font-mono text-[12px] text-texto-medio" title={op.exemplo}>
                {op.exemplo}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function CartaoOrganizacao({ aoReorganizar }: { aoReorganizar(): void }) {
  const t = msg.biblioteca.organizacao;
  const qc = useQueryClient();
  const q = useOrganizacao();
  const rodando = useManutencao(manutencaoRodando);
  const [guardando, setGuardando] = useState<Pedido | null>(null);
  /** a última escolha guardada nesta tela: decide qual aviso aparece */
  const [mudou, setMudou] = useState<AlvoDaOrganizacao | null>(null);
  const [erro, setErro] = useState<{ erro: AppError; pedido: Pedido } | null>(null);
  const estado = q.data ?? null;

  async function escolher(pedido: Pedido) {
    setGuardando(pedido);
    setErro(null);
    try {
      const r = await api.library.setOrganization(pedido.alvo, pedido.organizacao);
      if (r.ok) {
        qc.setQueryData(CHAVE_ORGANIZACAO, r.estado);
        setMudou(pedido.alvo);
      } else {
        setErro({ erro: r.erro, pedido });
      }
    } finally {
      setGuardando(null);
    }
  }

  const marcada = (alvo: AlvoDaOrganizacao): OrganizacaoDasPastas | null =>
    guardando?.alvo === alvo ? guardando.organizacao : (estado?.[alvo] ?? null);
  const disco = marcada('disco');
  const rekordbox = marcada('rekordbox');

  return (
    <Cartao como="section" className="flex flex-col gap-[10px] p-4" data-testid="cartao-organizacao">
      <Rotulo>{t.titulo}</Rotulo>
      {estado === null || disco === null || rekordbox === null ? (
        q.isPending ? (
          <span className="esqueleto h-3 w-[60%]" role="status" aria-label={msg.app.carregando} />
        ) : null
      ) : (
        <>
          <span className="text-[13.5px] leading-normal text-texto-medio">{t.explicacao}</span>
          <Escolha
            alvo="disco"
            marcada={disco}
            travada={guardando !== null || rodando}
            aoEscolher={(o) => void escolher({ alvo: 'disco', organizacao: o })}
          />
          {!estado.configAtende ? (
            <span className="text-[12.5px] leading-normal text-chip-laranja" data-testid="organizacao-config-antigo">
              {t.disco.configAntigo}
            </span>
          ) : null}
          {mudou === 'disco' && !erro ? (
            <>
              <span role="status" className="text-[12.5px] leading-normal text-texto-medio">
                {t.disco.guardado}
              </span>
              <span className="text-[12.5px] leading-normal text-texto-suave">{t.disco.avisoRekordbox}</span>
              <Botao
                pequeno
                className="self-start"
                disabled={rodando}
                onClick={aoReorganizar}
                data-testid="organizacao-reorganizar"
              >
                {t.disco.reorganizar}
              </Botao>
            </>
          ) : null}
          <Escolha
            alvo="rekordbox"
            marcada={rekordbox}
            travada={guardando !== null}
            aoEscolher={(o) => void escolher({ alvo: 'rekordbox', organizacao: o })}
          />
          {mudou === 'rekordbox' && !erro ? (
            <span role="status" className="text-[12.5px] leading-normal text-texto-medio">
              {t.rekordbox.guardado}
            </span>
          ) : null}
          {guardando ? (
            <span role="status" className="text-[12.5px] text-texto-suave">
              {t.guardando}
            </span>
          ) : null}
          {erro ? <CartaoErro erro={erro.erro} aoTentarDeNovo={() => void escolher(erro.pedido)} /> : null}
        </>
      )}
    </Cartao>
  );
}
