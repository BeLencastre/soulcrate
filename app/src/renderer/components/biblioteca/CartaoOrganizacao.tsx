// O cartão "Organização" (aba Organizar) na Biblioteca, montado por níveis (ADR 0007): para cada destino, as pastas no
// disco e as playlists do Rekordbox, o gênero vem sempre e a pessoa liga ou desliga o subgênero e o artista. Um exemplo
// ao vivo mostra o resultado. A escolha do disco vale para as próximas importações do beets; para mover o que já está
// no disco, o cartão oferece "Reorganizar as pastas", o mesmo diálogo (com prévia) de Cuidar da biblioteca. A do
// Rekordbox refaz o arquivo de playlists, se ele já existe.
//
// O subgênero funciona melhor com a conta do Beatport: ligar sem ela mostra antes um painel que leva às Configurações
// ou continua só com as regras locais. Com conta, o cartão oferece classificar o que já está na biblioteca.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { faixasSemClassificacao, type FaixaDaBiblioteca } from '@shared/biblioteca';
import type { AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import {
  SEM_SUBGENERO,
  type AlvoDaOrganizacao,
  type NiveisDaOrganizacao,
  type Organizacoes,
} from '@shared/organizacao';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { CHAVE_ORGANIZACAO, manutencaoRodando, useManutencao, useOrganizacao } from '../../lib/biblioteca';
import { useModoDj } from '../../lib/modo';
import { useMudarSettings, useSettings } from '../../lib/preferencias';
import { CartaoErro } from '../CartaoErro';
import { Botao, Cartao, Rotulo } from '../ui';

/** Onde a seção Conta Beatport fica nas Configurações. */
export const ROTA_CONTA_BEATPORT = '/configuracoes?secao=beatport';

interface Pedido {
  alvo: AlvoDaOrganizacao;
  niveis: NiveisDaOrganizacao;
}

/** O exemplo ao vivo: `Techno / Peak Time / Azyr / No Escape` no disco, `Gêneros › Techno › Peak Time › Azyr` no Rekordbox. */
export function exemploDosNiveis(alvo: AlvoDaOrganizacao, n: NiveisDaOrganizacao): string {
  const e = msg.biblioteca.organizacao.exemplo;
  if (alvo === 'disco') {
    const final = n.artista ? [e.artista, e.titulo] : [`${e.artista} - ${e.titulo}`];
    return [e.genero, ...(n.subgenero ? [e.subgenero] : []), ...final].join(' / ');
  }
  return ['Gêneros', e.genero, ...(n.subgenero ? [e.subgenero] : []), ...(n.artista ? [e.artista] : [])].join(' › ');
}

function Niveis({
  alvo,
  niveis,
  travada,
  dj,
  aoMudar,
}: {
  alvo: AlvoDaOrganizacao;
  niveis: NiveisDaOrganizacao;
  travada: boolean;
  dj: boolean;
  aoMudar(n: NiveisDaOrganizacao): void;
}) {
  const t = msg.biblioteca.organizacao;
  const idExemplo = `organizacao-exemplo-${alvo}`;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" data-alvo={alvo}>
      <legend className="mb-1 p-0 text-[12.5px] font-bold text-texto-medio">{t[alvo].legenda}</legend>
      <span className="flex items-baseline gap-2 px-1 text-sm">
        <span className="font-bold">{t.genero}</span>
        <span className="text-[12.5px] text-texto-suave">{t.generoSempre}</span>
      </span>
      {(['subgenero', 'artista'] as const).map((nivel) => (
        <label
          key={nivel}
          className="flex cursor-pointer items-start gap-[10px] rounded-md border border-borda-forte px-3 py-[10px] hover:border-borda-hover has-checked:border-ambar has-disabled:cursor-default has-disabled:opacity-60"
          data-nivel={nivel}
        >
          <input
            type="checkbox"
            checked={niveis[nivel]}
            disabled={travada}
            aria-describedby={idExemplo}
            onChange={(e) => aoMudar({ ...niveis, [nivel]: e.target.checked })}
            className="mt-[3px] accent-ambar"
          />
          <span className="flex min-w-0 flex-col gap-[2px]">
            <span className="text-sm font-bold">{t.niveis[nivel].titulo}</span>
            <span className="text-[12.5px] leading-normal text-texto-suave">{t.niveis[nivel].descricao}</span>
          </span>
        </label>
      ))}
      <span id={idExemplo} aria-live="polite" className="flex flex-col gap-[2px] px-1" data-testid={idExemplo}>
        <span className="text-[12px] text-texto-suave">
          {t.exemploRotulo}
          {dj ? ` ${t.combinacao(niveis)}` : null}
        </span>
        <span className="truncate font-mono text-[12px] text-texto-medio" title={exemploDosNiveis(alvo, niveis)}>
          {exemploDosNiveis(alvo, niveis)}
        </span>
      </span>
    </fieldset>
  );
}

export function CartaoOrganizacao({
  faixas,
  aoReorganizar,
  aoClassificar,
}: {
  faixas: readonly FaixaDaBiblioteca[];
  aoReorganizar(): void;
  aoClassificar(): void;
}) {
  const t = msg.biblioteca.organizacao;
  const qc = useQueryClient();
  const q = useOrganizacao();
  const navegar = useNavigate();
  const dj = useModoDj();
  const settings = useSettings().data;
  const mudarSettings = useMudarSettings();
  const rodando = useManutencao(manutencaoRodando);
  const [guardando, setGuardando] = useState<Pedido | null>(null);
  /** a última escolha guardada nesta tela: decide qual aviso aparece */
  const [mudou, setMudou] = useState<AlvoDaOrganizacao | null>(null);
  /** ligar o subgênero sem conta: o pedido espera a resposta do painel */
  const [semConta, setSemConta] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<{ erro: AppError; pedido: Pedido } | null>(null);
  const estado = q.data ?? null;
  const novidade = settings !== undefined && !settings.avisoSubgeneroDispensado;

  function dispensarNovidade() {
    if (novidade) seguro(mudarSettings({ avisoSubgeneroDispensado: true }));
  }

  async function guardar(pedido: Pedido) {
    setGuardando(pedido);
    setSemConta(null);
    setErro(null);
    try {
      const r = await api.library.setOrganization(pedido.alvo, pedido.niveis);
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

  function mudar(alvo: AlvoDaOrganizacao, niveis: NiveisDaOrganizacao, antes: NiveisDaOrganizacao) {
    dispensarNovidade();
    const ligouSubgenero = niveis.subgenero && !antes.subgenero;
    if (ligouSubgenero && estado && !estado.contaBeatport) {
      setSemConta({ alvo, niveis });
      return;
    }
    void guardar({ alvo, niveis });
  }

  const atual = (alvo: AlvoDaOrganizacao): NiveisDaOrganizacao | null =>
    guardando?.alvo === alvo ? guardando.niveis : (estado?.[alvo] ?? null);
  const disco = atual('disco');
  const rekordbox = atual('rekordbox');
  const travada = guardando !== null || semConta !== null;
  const naoClassificadas = faixasSemClassificacao(faixas);
  const semSubgenero = faixas.filter((f) => f.subgenero === null || f.subgenero === SEM_SUBGENERO).length;
  const algumSubgenero = (o: Organizacoes) => o.disco.subgenero || o.rekordbox.subgenero;

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
          {novidade ? (
            <div
              className="flex flex-col gap-2 rounded-md border border-ambar px-3 py-[10px]"
              data-testid="organizacao-novidade"
            >
              <span className="text-sm font-bold">{t.novidade.titulo}</span>
              <span className="text-[12.5px] leading-normal text-texto-medio">{t.novidade.texto}</span>
              <Botao pequeno className="self-start" onClick={dispensarNovidade}>
                {t.novidade.dispensar}
              </Botao>
            </div>
          ) : null}

          <Niveis
            alvo="disco"
            niveis={disco}
            travada={travada || rodando}
            dj={dj}
            aoMudar={(n) => mudar('disco', n, disco)}
          />
          {!dj ? (
            <span className="font-mono text-[11.5px] text-texto-mudo" data-testid="organizacao-chaves-disco">
              {t.chaves(disco.artista ? 'genero-artista' : 'genero', disco.subgenero)}
            </span>
          ) : null}
          {!estado.configAtende ? (
            <span className="text-[12.5px] leading-normal text-chip-laranja" data-testid="organizacao-config-antigo">
              {t.disco.configAntigo}
            </span>
          ) : disco.subgenero && !estado.configAtendeSubgenero ? (
            <span
              className="text-[12.5px] leading-normal text-chip-laranja"
              data-testid="organizacao-config-sem-subgenero"
            >
              {t.disco.configAntigoSubgenero}
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

          <Niveis
            alvo="rekordbox"
            niveis={rekordbox}
            travada={travada}
            dj={dj}
            aoMudar={(n) => mudar('rekordbox', n, rekordbox)}
          />
          {mudou === 'rekordbox' && !erro ? (
            <span role="status" className="text-[12.5px] leading-normal text-texto-medio">
              {t.rekordbox.guardado}
            </span>
          ) : null}

          {semConta ? (
            <div
              role="alertdialog"
              aria-labelledby="organizacao-sem-conta-titulo"
              className="flex flex-col gap-2 rounded-md border border-borda-forte px-3 py-[10px]"
              data-testid="organizacao-sem-conta"
            >
              <span id="organizacao-sem-conta-titulo" className="text-sm font-bold">
                {t.semConta.titulo}
              </span>
              <span className="text-[12.5px] leading-normal text-texto-medio">
                {dj ? msgDj.organizacao.semConta : t.semConta.texto}
              </span>
              <span className="flex flex-wrap gap-2">
                <Botao
                  pequeno
                  variante="primario"
                  onClick={() => {
                    setSemConta(null);
                    void navegar(ROTA_CONTA_BEATPORT);
                  }}
                >
                  {t.semConta.conectar}
                </Botao>
                <Botao pequeno onClick={() => void guardar(semConta)} data-testid="organizacao-continuar-sem-conta">
                  {t.semConta.continuar}
                </Botao>
              </span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-borda-fraca pt-[10px]" data-testid="organizacao-conta">
            <span className="text-[12.5px] leading-normal text-texto-medio">
              {estado.contaBeatport ? t.conta.conectada : t.conta.semConta}
            </span>
            {!estado.contaBeatport ? (
              <Botao pequeno className="self-start" onClick={() => void navegar(ROTA_CONTA_BEATPORT)}>
                {t.conta.configurar}
              </Botao>
            ) : null}
            {!algumSubgenero(estado) && faixas.length > naoClassificadas ? (
              <span className="text-[12.5px] leading-normal text-texto-suave" data-testid="organizacao-ficariam-sem">
                {t.ficariamSem(semSubgenero, faixas.length)}
              </span>
            ) : null}
            {estado.contaBeatport || algumSubgenero(estado) ? (
              <>
                <span className="text-[12.5px] leading-normal text-texto-suave" data-testid="organizacao-estimativa">
                  {t.classificar.estimativa(naoClassificadas, estado.contaBeatport)}
                </span>
                <Botao
                  pequeno
                  className="self-start"
                  disabled={rodando}
                  onClick={aoClassificar}
                  data-testid="organizacao-classificar"
                >
                  {t.classificar.botao}
                </Botao>
              </>
            ) : null}
          </div>

          {guardando ? (
            <span role="status" className="text-[12.5px] text-texto-suave">
              {t.guardando}
            </span>
          ) : null}
          {erro ? <CartaoErro erro={erro.erro} aoTentarDeNovo={() => void guardar(erro.pedido)} /> : null}
        </>
      )}
    </Cartao>
  );
}
