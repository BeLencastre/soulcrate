// Importar playlist (protótipos "importacao-playlist" 2, 3 e 5): escolher o streaming e colar o link, revisar as
// faixas e o nome da lista, e importar. Só playlists públicas, pelo link: o app não entra na conta de ninguém.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { msg } from '@shared/mensagens';
import {
  duracaoDaPlaylist,
  nomeDeArquivoDaPlaylist,
  reconhecerLink,
  revisarPlaylist,
  STREAMINGS,
  streamingPorId,
  textoDaPlaylist,
  type ErroPlaylist,
  type PlaylistImportada,
  type StreamingId,
} from '@shared/playlists';
import { api } from '../../lib/api';
import { semPrefixoIpc, useRascunho } from '../../lib/lote-store';
import { erroDoLink, textoDoErro } from '../../lib/playlist';
import { IconeAlerta, IconeFechar, IconeVoltarPagina } from '../icones';
import { Botao, Chip } from '../ui';

const t = () => msg.lote.lista.playlist;
const LINHAS_NA_REVISAO = 6;
const COLUNAS_REVISAO = '40px minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1fr)';

/** O quadradinho com a sigla do streaming (o app não usa logos de marca). */
export function SiglaStreaming({ servico, ativo = false }: { servico: StreamingId; ativo?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
        ativo ? 'bg-ambar text-sobre-ambar' : 'border border-borda-forte bg-campo text-texto-forte'
      }`}
    >
      {streamingPorId(servico).sigla}
    </span>
  );
}

// ---------------------------------------------------------------- Etapa 1: streaming e link

function EtapaLink({
  servico,
  aoEscolherServico,
  link,
  aoMudarLink,
  aoBuscar,
  buscando,
  erroBusca,
  aoOutroLink,
  aoCancelar,
}: {
  servico: StreamingId;
  aoEscolherServico(s: StreamingId): void;
  link: string;
  aoMudarLink(v: string): void;
  aoBuscar(): void;
  buscando: boolean;
  erroBusca: ErroPlaylist | null;
  aoOutroLink(): void;
  aoCancelar(): void;
}) {
  const idLink = useId();
  const idErro = useId();
  const idDica = useId();
  const [enviado, setEnviado] = useState(false);
  const atual = streamingPorId(servico);
  const reconhecido = reconhecerLink(link);
  const erroCampo = erroDoLink(reconhecido, enviado);
  const pode = !buscando && !erroCampo && (reconhecido.tipo === 'playlist' || reconhecido.tipo === 'curto');
  const falha = erroBusca ? textoDoErro(erroBusca, servico) : null;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setEnviado(true);
        if (pode) aoBuscar();
      }}
    >
      <fieldset className="m-0 flex flex-col gap-[10px] border-0 p-0">
        <legend className="lbl mb-[10px] p-0">{t().passoStreaming}</legend>
        <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-4" data-testid="escolha-streaming">
          {STREAMINGS.map((s) => {
            const ativo = s.id === servico;
            return (
              <label
                key={s.id}
                className={`relative flex min-h-[96px] cursor-pointer flex-col items-center gap-2 rounded-lg border px-2 py-[14px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ambar ${
                  ativo
                    ? 'border-ambar bg-ambar-selecionado text-texto-forte'
                    : 'border-borda bg-cartao text-texto-claro hover:border-borda-hover'
                }`}
              >
                <input
                  type="radio"
                  name="streaming"
                  value={s.id}
                  checked={ativo}
                  onChange={() => aoEscolherServico(s.id)}
                  className="absolute size-px opacity-0"
                />
                <SiglaStreaming servico={s.id} ativo={ativo} />
                <span className="text-center text-[13px] leading-tight font-bold">{s.nome}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={idLink} className="lbl">
          {t().passoLink}
        </label>
        <input
          id={idLink}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={atual.exemplo}
          value={link}
          onChange={(e) => aoMudarLink(e.target.value)}
          aria-invalid={erroCampo ? true : undefined}
          aria-describedby={erroCampo ? idErro : idDica}
          className={`min-h-[44px] rounded-md border bg-campo px-[14px] font-mono text-[13px] text-texto ${
            erroCampo ? 'border-led-vermelho' : 'border-borda-forte'
          }`}
          data-testid="link-playlist"
        />
        {erroCampo ? (
          <p id={idErro} role="alert" className="m-0 flex gap-2 text-[13px] leading-normal text-erro-texto">
            <IconeAlerta className="mt-[2px] shrink-0" />
            {erroCampo}
          </p>
        ) : (
          <p id={idDica} className="m-0 text-[13px] leading-normal text-texto-suave">
            {atual.dica} {t().dicaTroca}
          </p>
        )}
      </div>

      {falha ? (
        <div
          role="alert"
          className="flex flex-col gap-[6px] rounded-lg border border-erro-borda bg-erro-fundo px-4 py-[14px]"
          data-testid="erro-playlist"
        >
          <strong className="text-sm text-erro-texto">{falha.titulo}</strong>
          <span className="text-[13px] leading-normal text-erro-corpo">{falha.corpo}</span>
        </div>
      ) : (
        <p className="m-0 text-[13px] leading-normal text-texto-mudo">{t().soPublicas}</p>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-borda-fraca pt-4">
        {falha ? (
          <Botao variante="fantasma" onClick={aoOutroLink}>
            {t().erros.outroLink}
          </Botao>
        ) : null}
        <Botao variante="fantasma" onClick={aoCancelar}>
          {t().cancelar}
        </Botao>
        <Botao type="submit" variante="primario" disabled={!pode} data-testid="buscar-playlist">
          {buscando ? t().buscando : falha ? t().erros.tentarDeNovo : t().buscar}
        </Botao>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Etapa 2: revisão

function EtapaRevisao({
  playlist,
  aoVoltar,
  aoCancelar,
  aoFechar,
}: {
  playlist: PlaylistImportada;
  aoVoltar(): void;
  aoCancelar(): void;
  aoFechar(): void;
}) {
  const idNome = useId();
  const [nome, setNome] = useState(() => nomeDeArquivoDaPlaylist(playlist.nome));
  const [lembrar, setLembrar] = useState(true);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [capaFalhou, setCapaFalhou] = useState(false);
  const revisao = useMemo(() => revisarPlaylist(playlist), [playlist]);
  const servico = streamingPorId(playlist.servico);
  const r = t().revisao;
  const naLista = revisao.faixas.filter((f) => f.linha).length;
  const duracao = duracaoDaPlaylist(playlist.faixas);
  const meta = [
    playlist.autor ? r.por(playlist.autor) : null,
    r.faixas(playlist.total ?? playlist.faixas.length),
    duracao,
  ]
    .filter(Boolean)
    .join(' · ');
  const nomeValido = nome.trim().length > 0;
  const restantes = revisao.faixas.length - LINHAS_NA_REVISAO;

  async function importar() {
    if (!nomeValido || importando) return;
    setImportando(true);
    setErro(null);
    const falha = await useRascunho
      .getState()
      .importarPlaylist(`${nome.trim()}.txt`, textoDaPlaylist(playlist, { lembrar }), {
        tipo: 'importada',
        servico: playlist.servico,
        faixas: naLista,
        duplicadas: revisao.duplicadas,
        videos: revisao.videos,
      });
    setImportando(false);
    if (falha) setErro(falha);
    else aoFechar();
  }

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        void importar();
      }}
    >
      <div className="flex items-start gap-4">
        {playlist.capa && !capaFalhou ? (
          <img
            src={playlist.capa}
            alt={r.capa}
            referrerPolicy="no-referrer"
            onError={() => setCapaFalhou(true)}
            className="size-[76px] shrink-0 rounded-md border border-borda-forte object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label={r.capa}
            className="flex size-[76px] shrink-0 items-center justify-center rounded-md border border-dashed border-borda-hover bg-campo font-mono text-[10px] tracking-[0.1em] text-texto-mudo"
          >
            {r.semCapa}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <span className="lbl">{r.rotulo(servico.nome)}</span>
          <Dialog.Title
            className="m-0 truncate text-[22px] font-extrabold"
            style={{ fontStretch: '110%' }}
            data-testid="nome-da-playlist"
          >
            {playlist.nome}
          </Dialog.Title>
          <Dialog.Description className="m-0 text-[13px] text-texto-suave">{meta}</Dialog.Description>
        </div>
        <Dialog.Close
          aria-label={t().fechar}
          className="-mt-2 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-texto-suave hover:bg-hover"
        >
          <IconeFechar />
        </Dialog.Close>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="resumo-revisao">
        <Chip cor="verde">{r.paraBaixar(revisao.paraBaixar)}</Chip>
        {revisao.duplicadas > 0 ? <Chip cor="laranja">{r.duplicadas(revisao.duplicadas)}</Chip> : null}
        {revisao.videos > 0 ? <Chip cor="cinza">{r.videos(revisao.videos)}</Chip> : null}
      </div>

      {playlist.parcial || revisao.videos > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-aviso-borda bg-aviso-fundo px-4 py-3 text-[13px] leading-normal text-aviso-texto">
          {playlist.parcial ? (
            <span data-testid="aviso-parcial">
              {playlist.servico === 'spotify'
                ? r.parcialSpotify
                : r.parcial(playlist.faixas.length, playlist.total ?? playlist.faixas.length)}
            </span>
          ) : null}
          {revisao.videos > 0 ? <span>{r.videosDica}</span> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-borda bg-cartao" role="table" aria-label={playlist.nome}>
        <div
          role="row"
          className="grid h-[38px] items-center gap-3 border-b border-borda-fraca px-4 font-mono text-[11px] font-medium tracking-[0.14em] text-texto-mudo uppercase"
          style={{ gridTemplateColumns: COLUNAS_REVISAO }}
        >
          <span role="columnheader">{r.colunas.numero}</span>
          <span role="columnheader">{r.colunas.artista}</span>
          <span role="columnheader">{r.colunas.titulo}</span>
          <span role="columnheader">{r.colunas.aviso}</span>
        </div>
        {revisao.faixas.slice(0, LINHAS_NA_REVISAO).map((f) => (
          <div
            key={f.n}
            role="row"
            className="grid h-10 items-center gap-3 border-b border-linha px-4 text-sm"
            style={{ gridTemplateColumns: COLUNAS_REVISAO }}
          >
            <span role="cell" className="font-mono text-texto-apagado">
              {f.n}
            </span>
            <span role="cell" className="truncate font-semibold" title={f.artista}>
              {f.artista || '—'}
            </span>
            <span role="cell" className="truncate" title={f.titulo}>
              {f.titulo}
            </span>
            <span role="cell" className="min-w-0">
              {f.duplicadaDe !== null ? (
                <Chip cor="laranja">{r.duplicada(f.duplicadaDe)}</Chip>
              ) : f.video ? (
                <Chip cor="cinza">{r.video}</Chip>
              ) : null}
            </span>
          </div>
        ))}
        {restantes > 0 ? <div className="px-4 py-[10px] text-[13px] text-texto-mudo">{r.mais(restantes)}</div> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={idNome} className="lbl">
          {r.nome}
        </label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-borda-forte bg-campo focus-within:border-ambar">
          <input
            id={idNome}
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            maxLength={110}
            aria-invalid={nomeValido ? undefined : true}
            className="min-h-[44px] min-w-0 flex-1 border-0 bg-transparent px-[14px] font-mono text-sm text-texto outline-none"
            data-testid="nome-lista-playlist"
          />
          <span className="inline-flex items-center border-l border-borda-forte px-[14px] font-mono text-sm text-texto-mudo">
            .txt
          </span>
        </div>
        {!nomeValido ? (
          <p role="alert" className="m-0 text-[13px] text-erro-texto">
            {r.nomeVazio}
          </p>
        ) : null}
        <label className="inline-flex min-h-8 cursor-pointer items-start gap-[10px] pt-[6px] text-[13px] leading-normal text-texto-claro">
          <input
            type="checkbox"
            className="mt-[2px] size-4 shrink-0 accent-ambar"
            checked={lembrar}
            onChange={(e) => setLembrar(e.target.checked)}
            data-testid="lembrar-playlist"
          />
          <span>{r.lembrar}</span>
        </label>
      </div>

      {erro ? (
        <p role="alert" className="m-0 text-[13px] leading-normal text-erro-texto">
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-borda-fraca pt-4">
        <Botao variante="fantasma" onClick={aoVoltar}>
          <IconeVoltarPagina />
          {r.outra}
        </Botao>
        <span className="flex-1" />
        <Botao variante="fantasma" onClick={aoCancelar}>
          {t().cancelar}
        </Botao>
        <Botao
          type="submit"
          variante="primario"
          disabled={!nomeValido || importando || naLista === 0}
          data-testid="importar-playlist"
        >
          {importando ? r.importando : r.importar(naLista)}
        </Botao>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Diálogo

export function DialogoPlaylist({
  aberto,
  servicoInicial,
  aoFechar,
}: {
  aberto: boolean;
  servicoInicial: StreamingId;
  aoFechar(): void;
}) {
  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        {/* montado só enquanto aberto: cada abertura começa do zero, no streaming que a pessoa escolheu */}
        {aberto ? <FluxoPlaylist servicoInicial={servicoInicial} aoFechar={aoFechar} /> : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FluxoPlaylist({ servicoInicial, aoFechar }: { servicoInicial: StreamingId; aoFechar(): void }) {
  const [servico, setServico] = useState<StreamingId>(servicoInicial);
  const [link, setLink] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<ErroPlaylist | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistImportada | null>(null);
  const busca = useRef(0);
  // fechou no meio de uma busca: a resposta que chegar depois não vale mais
  useEffect(
    () => () => {
      busca.current++;
    },
    [],
  );

  function mudarLink(v: string) {
    setLink(v);
    setErroBusca(null);
    // colou um link de outro streaming: troca sozinho
    const r = reconhecerLink(v);
    if ('servico' in r) setServico(r.servico);
  }

  async function buscar() {
    const minha = ++busca.current;
    setBuscando(true);
    setErroBusca(null);
    try {
      const r = await api.playlists.fetch(link.trim());
      if (minha !== busca.current) return;
      if (r.ok) setPlaylist(r.playlist);
      else setErroBusca(r.erro);
    } catch (e) {
      if (minha !== busca.current) return;
      setErroBusca({
        motivo: 'rede',
        servico,
        detalhe: semPrefixoIpc(e instanceof Error ? e.message : String(e)),
      });
    } finally {
      if (minha === busca.current) setBuscando(false);
    }
  }

  return (
    <Dialog.Content
      className={`fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-[10px] border border-borda-forte bg-dialogo p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ${
        playlist ? 'w-[min(680px,calc(100vw-32px))]' : 'w-[min(600px,calc(100vw-32px))]'
      }`}
      data-testid="dialogo-playlist"
    >
      {playlist ? (
        <EtapaRevisao
          playlist={playlist}
          aoVoltar={() => setPlaylist(null)}
          aoCancelar={aoFechar}
          aoFechar={aoFechar}
        />
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
                {t().titulo}
              </Dialog.Title>
              <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
                {t().corpo}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t().fechar}
              className="-mt-2 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-texto-suave hover:bg-hover"
            >
              <IconeFechar />
            </Dialog.Close>
          </div>
          <EtapaLink
            servico={servico}
            aoEscolherServico={(s) => {
              setServico(s);
              setErroBusca(null);
            }}
            link={link}
            aoMudarLink={mudarLink}
            aoBuscar={() => void buscar()}
            buscando={buscando}
            erroBusca={erroBusca}
            aoOutroLink={() => mudarLink('')}
            aoCancelar={aoFechar}
          />
        </>
      )}
    </Dialog.Content>
  );
}
