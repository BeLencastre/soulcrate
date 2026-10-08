// Etapa 1 do lote (protótipo "Baixar lista · Lista"): editor da lista com a pré-visualização ao lado (gerada pelo
// próprio baixar-lista.ps1, com debounce), importação, listas recentes, retomada e o botão de iniciar.
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router';
import { msg } from '@shared/mensagens';
import { alterouAlgo, opcoesAlteradas } from '@shared/opcoes-lote';
import { resumirStack } from '@shared/stack';
import type { LinhaAnalise } from '@shared/analise-lista';
import { IconeEnviar, IconePlay } from '../../components/icones';
import { CartaoErro } from '../../components/CartaoErro';
import { EtapasDoLote } from '../../components/lote/Etapas';
import { useIniciarLote } from '../../components/lote/IniciarLote';
import { TabelaVirtual } from '../../components/TabelaVirtual';
import { Botao, Cartao, Chip, classeBotao, Rotulo } from '../../components/ui';
import { useAgora, useStackStatus } from '../../lib/estado';
import { avisoDaLinha, COR_DO_MARCADOR, linhaPulada, marcadoresDoEditor } from '../../lib/lote-lista';
import { dataCurta, haQuanto } from '../../lib/lote-painel';
import { estaSujo, execucaoRodando, ultimaListaLembrada, useExecucao, useRascunho } from '../../lib/lote-store';

const ALTURA_LINHA_EDITOR = 24;
const COLUNAS_PREVIA = '44px minmax(80px,1.1fr) minmax(90px,1.4fr) minmax(70px,0.9fr) minmax(150px,1.5fr)';

// ---------------------------------------------------------------- Editor

function EditorDaLista({
  texto,
  aoMudar,
  somenteLeitura,
  marcadores,
}: {
  texto: string;
  aoMudar(t: string): void;
  somenteLeitura: boolean;
  marcadores: ReadonlyMap<number, keyof typeof COR_DO_MARCADOR> | null;
}) {
  const linhas = texto.split('\n').length;
  // o textarea cresce com o texto e quem rola é a caixa: o gutter e o texto nunca saem de alinhamento
  const altura = Math.max(linhas, 16) * ALTURA_LINHA_EDITOR + 28;
  return (
    <div className="flex max-h-[560px] flex-1 overflow-auto" data-testid="editor-rolagem">
      <div
        aria-hidden="true"
        className="w-[52px] shrink-0 self-stretch border-r border-[#1e2125] py-[14px] text-right font-mono text-xs leading-6 text-[#5f646c]"
        data-testid="editor-gutter"
      >
        {Array.from({ length: linhas }, (_, i) => {
          const cor = marcadores?.get(i + 1);
          return (
            <div key={i} className="flex h-6 items-center justify-end gap-[6px] pr-[10px]">
              {cor ? (
                <span
                  className="size-[6px] rounded-[2px]"
                  style={{ background: COR_DO_MARCADOR[cor] }}
                  data-marcador={cor}
                />
              ) : null}
              {i + 1}
            </div>
          );
        })}
      </div>
      <textarea
        className="ed min-w-0 flex-1"
        style={{ height: altura }}
        aria-label={msg.lote.lista.textoDaLista}
        spellCheck={false}
        wrap="off"
        readOnly={somenteLeitura}
        value={texto}
        onChange={(e) => aoMudar(e.target.value)}
        data-testid="editor-lista"
      />
    </div>
  );
}

// ---------------------------------------------------------------- Pré-visualização

function Previa({ linhas }: { linhas: readonly LinhaAnalise[] }) {
  const c = msg.lote.lista.colunas;
  return (
    <TabelaVirtual
      rotulo={msg.lote.lista.comoVaiLer}
      colunas={COLUNAS_PREVIA}
      cabecalho={[c.numero, c.artista, c.titulo, c.mix, c.aviso]}
      linhas={linhas}
      alturaLinha={40}
      alturaMax={520}
      larguraMinima={420}
      chave={(l) => `${l.sourceLine}-${l.key}`}
      vazio={msg.lote.lista.previaVazia}
      testId="previa-lista"
      celulas={(l) => {
        const aviso = avisoDaLinha(l);
        const apagada = linhaPulada(l);
        const tom = apagada ? 'text-texto-mudo' : 'text-texto';
        return [
          <span key="n" className="font-mono text-texto-apagado">
            {l.sourceLine}
          </span>,
          <span key="a" className={`block truncate font-semibold ${tom}`} title={l.artist}>
            {l.artist || '—'}
          </span>,
          <span key="t" className={`block truncate ${tom}`} title={l.title}>
            {l.title || '—'}
          </span>,
          <span key="m" className="block truncate text-texto-suave" title={l.mix}>
            {l.mix || '—'}
          </span>,
          aviso ? (
            <Chip key="w" cor={aviso.cor}>
              {aviso.texto}
            </Chip>
          ) : null,
        ];
      }}
    />
  );
}

// ---------------------------------------------------------------- Listas recentes e estado vazio

function ListaDeRecentes({ aoEscolher }: { aoEscolher(nome: string): void }) {
  const recentes = useRascunho((s) => s.recentes);
  const agora = useAgora(true, 30_000);
  if (recentes.length === 0) {
    return <p className="m-0 text-sm text-texto-suave">{msg.lote.lista.recentes.vazio}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="lista-recentes">
      {recentes.map((r) => (
        <li key={r.nome} className="border-t border-[#22252a] first:border-t-0">
          <button
            type="button"
            className="row flex min-h-[44px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-2 py-2 text-left"
            onClick={() => aoEscolher(r.nome)}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold">{r.nome}</span>
            <span className="text-xs text-texto-mudo">{haQuanto(agora - r.modificadaEm)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DialogoRecentes({
  aberto,
  aoFechar,
  aoEscolher,
}: {
  aberto: boolean;
  aoFechar(): void;
  aoEscolher(nome: string): void;
}) {
  const t = msg.lote.lista.recentes;
  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-[10px] border border-borda-forte bg-[#17191c] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-recentes"
        >
          <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
            {t.titulo}
          </Dialog.Title>
          <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">{t.corpo}</Dialog.Description>
          <div className="min-h-0 overflow-y-auto">
            <ListaDeRecentes
              aoEscolher={(nome) => {
                aoFechar();
                aoEscolher(nome);
              }}
            />
          </div>
          <div className="flex justify-end">
            <Botao onClick={aoFechar}>{t.fechar}</Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ListaVazia() {
  const abrir = useRascunho((s) => s.abrir);
  const criar = useRascunho((s) => s.criar);
  const importar = useRascunho((s) => s.importarArquivo);
  const t = msg.lote.lista;
  return (
    <div className="flex flex-col gap-6">
      <Cartao
        borda="vazio"
        className="flex max-w-[640px] flex-col items-start gap-3 p-[22px]"
        data-testid="lista-vazia"
      >
        <Rotulo>{msg.lote.rotulo}</Rotulo>
        <h2 className="m-0 text-lg font-extrabold">{t.vazio.titulo}</h2>
        <p className="m-0 text-sm leading-normal text-texto-claro">{t.vazio.corpo}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Botao variante="primario" onClick={() => void criar('exemplo')}>
            {t.novaDoExemplo}
          </Botao>
          <Botao onClick={() => void criar('vazia')}>{t.novaEmBranco}</Botao>
          <Botao onClick={() => void importar()}>
            <IconeEnviar />
            {t.importar}
          </Botao>
        </div>
      </Cartao>
      <Cartao className="flex max-w-[640px] flex-col gap-3 p-5">
        <Rotulo>{t.recentes.titulo}</Rotulo>
        <ListaDeRecentes aoEscolher={(nome) => void abrir(nome)} />
      </Cartao>
    </div>
  );
}

/** "salva há 12 s": tem o próprio relógio para o resto da tela não renderizar a cada segundo (o editor pode ser grande). */
function EstadoDoSalvamento() {
  const salvoEm = useRascunho((s) => s.salvoEm);
  const salvando = useRascunho((s) => s.salvando);
  const sujo = useRascunho(estaSujo);
  const agora = useAgora(true, 1000);
  const t = msg.lote.lista;
  const texto = salvando
    ? t.salvando
    : sujo
      ? t.naoSalva
      : salvoEm !== null
        ? agora - salvoEm < 3000
          ? t.salvaAgora
          : t.salvaHa(haQuanto(agora - salvoEm))
        : '';
  return (
    <span className="text-[13px] text-texto-mudo" role="status" data-testid="estado-salvamento">
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------- Tela

export function Lista() {
  const lista = useRascunho((s) => s.lista);
  const texto = useRascunho((s) => s.texto);
  const textoSalvo = useRascunho((s) => s.textoSalvo);
  const salvando = useRascunho((s) => s.salvando);
  const analise = useRascunho((s) => s.analise);
  const analisando = useRascunho((s) => s.analisando);
  const erroAnalise = useRascunho((s) => s.erroAnalise);
  const erro = useRascunho((s) => s.erro);
  const opcoes = useRascunho((s) => s.opcoes);
  const definirOpcoes = useRascunho((s) => s.definirOpcoes);
  const status = useStackStatus();
  const [recentesAbertas, setRecentesAbertas] = useState(false);
  const iniciarLote = useIniciarLote();

  const sujo = estaSujo({ texto, textoSalvo });
  const somenteLeitura = lista?.somenteLeitura ?? false;
  const nome = lista?.nome ?? null;
  // a pré-visualização também confere a biblioteca, mas só com a stack no ar (é o beets que responde)
  const biblioteca = resumirStack(status).motivo === 'no-ar' && !opcoes.NaoPularExistentes && !opcoes.SemBeets;
  const retentar = opcoes.Retentar;

  // ao abrir a tela: volta para a última lista usada e carrega as recentes
  useEffect(() => {
    const s = useRascunho.getState();
    void s.carregarRecentes();
    const ultima = ultimaListaLembrada();
    if (!s.lista && ultima) void s.abrir(ultima);
  }, []);

  // ao sair da tela, o que foi digitado vai para o arquivo
  useEffect(
    () => () => {
      void useRascunho.getState().salvar();
    },
    [],
  );

  // editou: espera uma pausa na digitação, salva e pede a análise do arquivo salvo
  useEffect(() => {
    if (!nome || somenteLeitura || !sujo) return;
    const t = setTimeout(() => {
      const s = useRascunho.getState();
      void s.salvar().then((ok) => {
        if (ok) void s.analisar({ biblioteca, retentar });
      });
    }, 700);
    return () => clearTimeout(t);
  }, [nome, somenteLeitura, sujo, texto, biblioteca, retentar]);

  // abriu a lista, ou mudou o que a análise considera (biblioteca, tentar de novo): analisa de novo
  useEffect(() => {
    if (!nome) return;
    const s = useRascunho.getState();
    if (s.texto === s.textoSalvo) void s.analisar({ biblioteca, retentar });
  }, [nome, biblioteca, retentar]);

  const resultado = analise?.resultado.analise ?? null;
  const analiseOk = resultado?.ok ? resultado : null;
  const fresca = !!analise && analise.texto === textoSalvo && !sujo;
  const marcadores = fresca && analiseOk && lista?.tipo === 'txt' ? marcadoresDoEditor(analiseOk.lines) : null;
  const ultimaExecucao = analise?.resultado.ultimaExecucaoEm ?? null;
  const rodandoEstaLista = useExecucao(
    (s) => execucaoRodando(s) && (s.estado.inicio?.list ?? s.resumo?.lista) === nome,
  );

  const t = msg.lote.lista;
  const paraBaixar = analiseOk?.toProcess ?? 0;
  const nAlteracoes = opcoesAlteradas(opcoes).length;
  const podeIniciar =
    !!lista && !!analiseOk && paraBaixar > 0 && !rodandoEstaLista && !iniciarLote.ocupado && !salvando;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Rotulo>{msg.lote.rotulo}</Rotulo>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-mono text-[28px] font-bold" data-testid="nome-da-lista">
              {lista ? lista.nome : msg.nav.lista}
            </h1>
            {lista ? <EstadoDoSalvamento /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao
            variante="fantasma"
            onClick={() => {
              void useRascunho.getState().carregarRecentes();
              setRecentesAbertas(true);
            }}
          >
            {t.listasRecentes}
          </Botao>
          <Botao onClick={() => void useRascunho.getState().criar('exemplo')}>{t.novaDoExemplo}</Botao>
          <Botao onClick={() => void useRascunho.getState().importarArquivo()}>
            <IconeEnviar />
            {t.importar}
          </Botao>
        </div>
      </header>

      <EtapasDoLote />

      {erro ? (
        <Cartao
          borda="erro"
          role="alert"
          className="flex flex-wrap items-center gap-3 px-4 py-3"
          data-testid="erro-lista"
        >
          <span className="min-w-0 flex-1 text-sm text-texto-claro">{erro}</span>
          <Botao variante="fantasma" pequeno onClick={() => useRascunho.getState().limparErro()}>
            {msg.acoes.dispensar}
          </Botao>
        </Cartao>
      ) : null}
      {iniciarLote.erro ? (
        <CartaoErro erro={iniciarLote.erro} aoTentarDeNovo={iniciarLote.iniciar} aoFechar={iniciarLote.limparErro} />
      ) : null}

      {!lista ? (
        <ListaVazia />
      ) : (
        <>
          {ultimaExecucao !== null && analiseOk ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-[14px] rounded-lg border border-borda bg-cartao px-4 py-3"
              data-testid="faixa-retomada"
            >
              <span className="min-w-[320px] flex-1 text-sm leading-normal">
                <strong>{t.retomada.titulo(dataCurta(ultimaExecucao))}</strong>{' '}
                <span className="text-texto-suave">{t.retomada.corpo(analiseOk.alreadyDone)}</span>
              </span>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="size-4 accent-ambar"
                  checked={opcoes.Retentar}
                  onChange={(e) => definirOpcoes({ ...opcoes, Retentar: e.target.checked })}
                />
                {t.retomada.retentar}
              </label>
            </div>
          ) : null}

          {rodandoEstaLista ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-azul-borda bg-[#16202c] px-4 py-3 text-sm"
            >
              <span className="flex-1">{t.rodandoAgora}</span>
              <Link className={classeBotao('padrao', true)} to="/lista/execucao">
                {t.verExecucao}
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-stretch gap-4">
            <section
              aria-label={t.editor}
              className="flex flex-col overflow-hidden rounded-lg border border-borda bg-log"
              data-testid="editor"
            >
              <div className="flex items-center gap-3 border-b border-borda-fraca px-4 py-[10px]">
                <span className="lbl">{t.cabecalhoEditor}</span>
                <span className="ml-auto font-mono text-xs text-texto-mudo">{t.linhas(texto.split('\n').length)}</span>
              </div>
              <EditorDaLista
                texto={texto}
                aoMudar={(v) => useRascunho.getState().editar(v)}
                somenteLeitura={somenteLeitura}
                marcadores={marcadores}
              />
              <div className="flex items-center gap-[10px] border-t border-dashed border-borda-forte px-4 py-3 text-[13px] text-texto-suave">
                {somenteLeitura ? t.somenteLeitura : t.dica}
              </div>
            </section>

            <section
              aria-label={t.previa}
              className="flex flex-col overflow-hidden rounded-lg border border-borda bg-cartao"
              aria-busy={analisando || !fresca}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-borda-fraca px-4 py-[10px]">
                <span className="lbl mr-[6px]">{t.comoVaiLer}</span>
                {analiseOk ? (
                  <>
                    <Chip cor="verde">{t.paraBaixar(paraBaixar)}</Chip>
                    <Chip cor="laranja">{t.duplicadas(analiseOk.duplicates)}</Chip>
                    {analiseOk.libraryChecked ? (
                      <Chip cor="cinza">{t.naBiblioteca(analiseOk.inLibrary ?? 0)}</Chip>
                    ) : null}
                    <Chip cor="cinza">{t.jaFeitas(analiseOk.alreadyDone)}</Chip>
                  </>
                ) : null}
                {analisando || (analiseOk && !fresca) ? (
                  <span className="ml-auto text-xs text-texto-mudo" role="status">
                    {t.atualizando}
                  </span>
                ) : null}
              </div>
              {resultado && !resultado.ok ? (
                <p
                  className="m-0 px-4 py-6 text-sm leading-normal text-chip-laranja"
                  role="alert"
                  data-testid="analise-erro"
                >
                  {t.analiseFalhou}: {resultado.error}
                </p>
              ) : erroAnalise ? (
                <p
                  className="m-0 px-4 py-6 text-sm leading-normal text-chip-laranja"
                  role="alert"
                  data-testid="analise-erro"
                >
                  {t.analiseFalhou}: {erroAnalise}
                </p>
              ) : (
                <div className={fresca ? '' : 'opacity-60'}>
                  <Previa linhas={analiseOk?.lines ?? []} />
                </div>
              )}
            </section>
          </div>

          <div className="sticky bottom-0 -mx-10 mt-1 flex flex-wrap items-center gap-4 border-t border-borda-fraca bg-painel px-10 py-4">
            <span className="text-sm" data-testid="rodape-contagem">
              <strong className="font-mono text-base">{paraBaixar}</strong> {t.rodapeFaixas(paraBaixar)}
            </span>
            <span className="text-[13px] text-texto-suave">
              {alterouAlgo(opcoes) ? t.opcoesAlteradas(nAlteracoes) : t.opcoesPadrao}
            </span>
            <Link to="/lista/opcoes" className="text-[13px] font-semibold">
              {t.revisarOpcoes}
            </Link>
            <div className="ml-auto flex gap-2">
              <Botao
                disabled={!sujo || somenteLeitura || salvando}
                onClick={() => void useRascunho.getState().salvar()}
              >
                {t.salvar}
              </Botao>
              <Botao
                variante="primario"
                disabled={!podeIniciar}
                onClick={iniciarLote.iniciar}
                data-testid="iniciar-lote"
              >
                <IconePlay />
                {iniciarLote.ocupado ? t.iniciando : t.iniciar}
              </Botao>
            </div>
          </div>
        </>
      )}

      <DialogoRecentes
        aberto={recentesAbertas}
        aoFechar={() => setRecentesAbertas(false)}
        aoEscolher={(n) => void useRascunho.getState().abrir(n)}
      />
      {iniciarLote.dialogo}
    </div>
  );
}
