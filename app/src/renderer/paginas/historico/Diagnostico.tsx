// Diagnóstico das faixas que não vieram (protótipo "Faixas que não vieram"): para cada uma, o que foi encontrado, por
// que foi recusado e o que fazer. "Talvez seja" corrige a linha; "Revisar e tentar de novo" gera a lista das que
// faltaram (com as correções) e abre as opções do lote já com o que os motivos pedem.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DiagnosticoFaixa, ExecucaoDetalhe, MotivoListaNaoAtualizada } from '@shared/historico';
import { rotuloDoMomento } from '@shared/historico';
import type { MotivoTraduzido } from '@shared/motivos';
import { msg } from '@shared/mensagens';
import { Carregando, ErroDeLeitura, SemPasta, useSemPasta } from '../../components/historico/estados';
import { IconeVoltarPagina } from '../../components/icones';
import { Botao, Cartao, Chip, classeBotao, Rotulo } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { useAgora } from '../../lib/estado';
import { CHAVE_HISTORICO, opcoesComoTexto, useDetalheDaExecucao, useLinhasNaLista } from '../../lib/historico';
import { semPrefixoIpc, estaSujo, useRascunho } from '../../lib/lote-store';

const CATALOGO_VISIVEL = 12;

const mensagemDe = (e: unknown): string => semPrefixoIpc(e instanceof Error ? e.message : String(e));

function ListaDeFaixas({
  diagnosticos,
  selecionada,
  aoEscolher,
}: {
  diagnosticos: readonly DiagnosticoFaixa[];
  selecionada: string;
  aoEscolher(key: string): void;
}) {
  const t = msg.historico.diagnostico;
  return (
    <nav
      aria-label={t.nav}
      className="flex max-w-[360px] flex-[1_1_280px] flex-col gap-1 rounded-[10px] border border-borda-fraca bg-painel p-2"
      data-testid="diagnostico-nav"
    >
      {diagnosticos.map((d) => {
        const titulo = d.correcao?.titulo ?? d.titulo;
        return (
          <button
            key={d.key}
            type="button"
            aria-current={d.key === selecionada}
            aria-label={t.selecionar(d.linha)}
            data-faixa={d.key}
            onClick={() => aoEscolher(d.key)}
            className="flex w-full cursor-pointer flex-col gap-[6px] rounded-lg border border-transparent bg-transparent px-4 py-[14px] text-left hover:bg-elevado aria-[current=true]:border-led-cinza aria-[current=true]:bg-campo"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <Chip cor={d.corStatus}>{d.rotuloStatus}</Chip>
              {d.correcao ? <Chip cor="verde">{t.corrigida}</Chip> : null}
            </span>
            <span className="text-[15px] font-bold text-texto">
              {d.artista} – {titulo}
            </span>
            <span className="text-[13px] text-texto-suave">{d.resumo}</span>
          </button>
        );
      })}
    </nav>
  );
}

function LinhaDeMotivo({ m, aoReceita }: { m: MotivoTraduzido; aoReceita(): void }) {
  const t = msg.historico.diagnostico;
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-[18px] border-t border-linha px-[22px] py-[14px]"
      data-motivo={m.tipo}
    >
      <div className="flex items-center gap-[10px]">
        {m.n > 0 ? (
          <span className="inline-flex h-6 min-w-[30px] items-center justify-center rounded-[4px] bg-borda-fraca px-[6px] font-mono text-xs font-bold">
            ×{m.n}
          </span>
        ) : null}
        <span className="font-bold">{m.rotulo}</span>
      </div>
      <div className="flex flex-col items-start gap-2">
        <span className="text-sm leading-normal text-texto-medio">{m.acao}</span>
        {m.botao === 'soulbeet' ? (
          <Botao pequeno onClick={() => seguro(api.stack.openService('soulbeet', 'preferencia'))}>
            {t.abrirSoulbeet}
          </Botao>
        ) : null}
        {m.botao === 'receita-usuarios-lentos' ? (
          <Botao pequeno onClick={aoReceita}>
            {t.receitaUsuariosLentos}
          </Botao>
        ) : null}
      </div>
    </div>
  );
}

function CartaoDoCatalogo({
  d,
  aoUsar,
  ocupado,
}: {
  d: DiagnosticoFaixa;
  aoUsar(titulo: string): void;
  ocupado: boolean;
}) {
  const t = msg.historico.diagnostico;
  const [todos, setTodos] = useState(false);
  const max = d.catalogo.reduce((a, c) => Math.max(a, c.usuarios), 1);
  const linhas = todos ? d.catalogo : d.catalogo.slice(0, CATALOGO_VISIVEL);
  return (
    <Cartao className="flex flex-col py-2" data-testid="catalogo">
      <Rotulo className="px-[18px] pt-3 pb-[6px]">{t.catalogo(d.artista)}</Rotulo>
      {d.catalogo.length === 0 ? (
        <p className="m-0 border-t border-linha px-[18px] py-[10px] text-[13px] text-texto-suave">
          {d.artistaBuscado ? t.catalogoVazio : t.catalogoNaoBuscado}
        </p>
      ) : (
        linhas.map((c) => (
          <div
            key={c.titulo}
            className="flex items-center gap-3 border-t border-linha px-[18px] py-[9px] text-[13.5px]"
          >
            {d.status === 'nao encontrada' ? (
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-texto hover:text-ambar hover:underline"
                title={t.usarTitulo(c.titulo)}
                aria-label={t.usarTitulo(c.titulo)}
                disabled={ocupado}
                onClick={() => aoUsar(c.titulo)}
              >
                {c.titulo}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
            )}
            <span aria-hidden="true" className="h-[5px] w-[70px] overflow-hidden rounded-[2px] bg-borda-fraca">
              <span className="block h-[5px] bg-ambar" style={{ width: `${Math.round((c.usuarios / max) * 100)}%` }} />
            </span>
            <span className="w-[84px] text-right font-mono text-xs text-texto-mudo">{t.usuarios(c.usuarios)}</span>
          </div>
        ))
      )}
      {d.catalogo.length > CATALOGO_VISIVEL ? (
        <div className="border-t border-linha px-[18px] py-2">
          <Botao variante="fantasma" pequeno onClick={() => setTodos((v) => !v)}>
            {todos ? t.mostrarMenos : t.mostrarTodos(d.catalogoTotal || d.catalogo.length)}
          </Botao>
        </div>
      ) : null}
    </Cartao>
  );
}

function PainelDaFaixa({
  d,
  d0,
  linhaNaLista,
  motivoNaoAtualizada,
  ocupado,
  erro,
  aoEscolherTitulo,
  aoDesfazer,
  aoReceita,
}: {
  d: DiagnosticoFaixa;
  d0: ExecucaoDetalhe;
  linhaNaLista: number | null;
  motivoNaoAtualizada: MotivoListaNaoAtualizada | 'generico' | null;
  ocupado: boolean;
  erro: string | null;
  aoEscolherTitulo(titulo: string): void;
  aoDesfazer(): void;
  aoReceita(): void;
}) {
  const t = msg.historico.diagnostico;
  const titulo = d.correcao?.titulo ?? d.titulo;
  const lista = d0.resumo.lista;
  const buscas = d.buscas.map((b) => (b.tipo === 'artist' ? t.buscaArtista(b.consulta) : b.consulta)).join(' | ');
  const comMotivos = d.motivos.length > 0;
  return (
    <section
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-4"
      data-testid="diagnostico-faixa"
      data-key={d.key}
    >
      <Cartao className="flex flex-col gap-3 !rounded-[10px] p-[22px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <Chip cor={d.corStatus}>{d.rotuloStatus}</Chip>
          {d.musicbrainz ? <Chip cor={d.musicbrainz.cor}>{t.musicbrainz(d.musicbrainz.rotulo)}</Chip> : null}
          {linhaNaLista !== null && lista ? (
            <span className="ml-auto font-mono text-xs text-texto-mudo" data-testid="linha-na-lista">
              {t.linha(linhaNaLista, lista)}
            </span>
          ) : null}
        </div>
        <h2 className="m-0 text-[26px] font-extrabold" data-testid="titulo-da-faixa">
          {d.artista} <span className="font-normal text-texto-apagado">–</span> {titulo}
        </h2>
        <span className="font-mono text-[12.5px] text-texto-suave">{buscas ? t.buscas(buscas) : t.semBuscas}</span>
      </Cartao>

      {d.sugestoes.length > 0 || d.correcao ? (
        <div
          className="flex flex-col gap-3 rounded-[10px] border border-ambar-borda-2 bg-ambar-fundo-2 px-[22px] py-5"
          data-testid="talvez-seja"
        >
          {d.sugestoes.length > 0 ? (
            <>
              <div className="flex flex-wrap items-baseline gap-[10px]">
                <span className="text-base font-extrabold text-ambar-vivo">{t.talvezSeja}</span>
                <span className="text-[13px] text-ambar-texto-suave">{t.cliquePara}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.sugestoes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-md border border-ambar-borda bg-ambar-fundo px-[14px] text-sm font-bold text-ambar-vivo hover:border-ambar-borda-hover hover:bg-ambar-fundo-hover disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={ocupado}
                    onClick={() => aoEscolherTitulo(s)}
                    data-sugestao={s}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {ocupado ? (
            <span role="status" className="text-[13px] text-ambar-texto-suave">
              {t.corrigindo}
            </span>
          ) : null}
          {erro ? (
            <span role="alert" className="text-[13px] text-chip-vermelho">
              {erro}
            </span>
          ) : null}
          {d.correcao ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-md border border-verde-borda bg-verde-fundo px-3 py-[10px] text-[13.5px]"
              data-testid="corrigida"
            >
              <span className="flex flex-wrap items-center gap-[10px]">
                <Chip cor="verde">{t.corrigida}</Chip>
                <span className="font-mono" data-testid="nova-linha">
                  {d.correcao.linha}
                </span>
                <span className="text-texto-suave">{t.corrigidaAviso}</span>
                <Botao variante="fantasma" pequeno className="ml-auto" disabled={ocupado} onClick={aoDesfazer}>
                  {t.desfazer}
                </Botao>
              </span>
              <span className="text-xs text-texto-suave" data-testid="situacao-da-lista">
                {d.correcao.lista && d.correcao.lista.escrita === d.correcao.linha
                  ? t.listaAtualizada(d.correcao.lista.nome, d.correcao.lista.numero)
                  : t.listaNaoAtualizada[motivoNaoAtualizada ?? 'generico']}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <Cartao className="flex flex-col !rounded-[10px] py-2" data-testid="motivos">
        <Rotulo className="px-[22px] pt-3 pb-[6px]">{t.porQueRecusada}</Rotulo>
        {comMotivos ? (
          d.motivos.map((m) => <LinhaDeMotivo key={m.bruto} m={m} aoReceita={aoReceita} />)
        ) : (
          <div className="border-t border-linha px-[22px] py-[14px]">
            <div className="font-bold">{t.semMotivos.rotulo}</div>
            <p className="m-0 mt-1 text-sm text-texto-medio">{d.nota || t.semMotivos.acao}</p>
          </div>
        )}
      </Cartao>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4">
        <Cartao className="flex flex-col !rounded-[10px] py-2" data-testid="arquivos-parecidos">
          <Rotulo className="px-[18px] pt-3 pb-[6px]">
            {d.status === 'falhou' ? t.tentativasFalhas : t.maisParecidos}
          </Rotulo>
          {d.status === 'falhou' ? (
            d.tentativas.length === 0 ? (
              <p className="m-0 border-t border-linha px-[18px] py-[10px] text-[13px] text-texto-suave">
                {t.semTentativas}
              </p>
            ) : (
              d.tentativas.map((r, i) => (
                <div key={i} className="border-t border-linha px-[18px] py-[10px]">
                  <span className="font-mono text-xs break-all text-chip-laranja">{r}</span>
                </div>
              ))
            )
          ) : d.arquivos.length === 0 ? (
            <p className="m-0 border-t border-linha px-[18px] py-[10px] text-[13px] text-texto-suave">
              {t.semArquivos}
            </p>
          ) : (
            d.arquivos.map((a, i) => (
              <div key={i} className="flex flex-col gap-1 border-t border-linha px-[18px] py-[10px]">
                <span className="text-[12.5px] font-bold text-chip-laranja">{a.motivo}</span>
                <span className="font-mono text-xs break-all text-texto-claro">{a.arquivo}</span>
              </div>
            ))
          )}
        </Cartao>
        <CartaoDoCatalogo d={d} aoUsar={aoEscolherTitulo} ocupado={ocupado} />
      </div>
    </section>
  );
}

function Corpo({ d }: { d: ExecucaoDetalhe }) {
  const t = msg.historico.diagnostico;
  const navegar = useNavigate();
  const qc = useQueryClient();
  const agora = useAgora(false);
  const [params, setParams] = useSearchParams();
  const diagnosticos = d.diagnosticos;
  const key = params.get('faixa');
  const atual = diagnosticos.find((x) => x.key === key) ?? diagnosticos[0];

  const linhas = useLinhasNaLista(d.resumo.id, d.listaExiste && diagnosticos.length > 0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, MotivoListaNaoAtualizada>>({});
  const [gerando, setGerando] = useState(false);
  const [erroRodape, setErroRodape] = useState<string | null>(null);

  /** a lista da execução está aberta no editor? Se houver texto não salvo, o app não mexe no arquivo por baixo dele. */
  const estadoDoEditor = () => {
    const r = useRascunho.getState();
    const aberta = !!d.resumo.lista && r.lista?.nome === d.resumo.lista;
    return { aberta, sujo: aberta && estaSujo(r) };
  };

  async function escolher(titulo: string) {
    if (!atual) return;
    setOcupado(true);
    setErro(null);
    try {
      const ed = estadoDoEditor();
      const r = await api.reports.applySuggestion(d.resumo.id, atual.key, titulo, { atualizarLista: !ed.sujo });
      setMotivos((m) => {
        const resto = Object.fromEntries(Object.entries(m).filter(([k]) => k !== atual.key));
        return r.motivoNaoAtualizada ? { ...resto, [atual.key]: r.motivoNaoAtualizada } : resto;
      });
      // o editor continua mostrando o texto antigo se não for relido
      if (r.listaAtualizada && ed.aberta && d.resumo.lista) await useRascunho.getState().abrir(d.resumo.lista);
      await qc.invalidateQueries({ queryKey: [...CHAVE_HISTORICO, 'execucao', d.resumo.id] });
    } catch (e) {
      setErro(`${t.erroCorrigir}: ${mensagemDe(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  async function desfazer() {
    if (!atual) return;
    setOcupado(true);
    setErro(null);
    try {
      const ed = estadoDoEditor();
      const restaurou = await api.reports.undoSuggestion(d.resumo.id, atual.key, { atualizarLista: !ed.sujo });
      if (restaurou && ed.aberta && d.resumo.lista) await useRascunho.getState().abrir(d.resumo.lista);
      if (!restaurou && atual.correcao?.lista) setErro(t.desfazerSemLista);
      await qc.invalidateQueries({ queryKey: [...CHAVE_HISTORICO, 'execucao', d.resumo.id] });
    } catch (e) {
      setErro(`${t.erroCorrigir}: ${mensagemDe(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  async function revisarETentarDeNovo() {
    setGerando(true);
    setErroRodape(null);
    try {
      const r = await api.reports.buildRetryList(d.resumo.id);
      const rascunho = useRascunho.getState();
      if (!(await rascunho.abrir(r.lista.nome))) throw new Error(useRascunho.getState().erro ?? t.rodape.erro);
      useRascunho.getState().definirOpcoes(r.retentativa.opcoes);
      void useRascunho.getState().carregarRecentes();
      navegar('/lista/opcoes');
    } catch (e) {
      setErroRodape(`${t.rodape.erro}: ${mensagemDe(e)}`);
    } finally {
      setGerando(false);
    }
  }

  const voltar = (
    <Link
      to={`/historico/${d.resumo.id}`}
      className="inline-flex items-center gap-[6px] self-start text-[13px] font-semibold text-texto-suave no-underline hover:text-texto"
    >
      <IconeVoltarPagina tamanho={14} />
      {t.voltar(d.resumo.lista ?? d.resumo.id, rotuloDoMomento(d.resumo.inicio, agora))}
    </Link>
  );

  if (!atual) {
    return (
      <div className="flex flex-col gap-[22px]">
        {voltar}
        <Cartao
          borda="vazio"
          className="flex max-w-[520px] flex-col items-start gap-3 p-[22px]"
          data-testid="sem-faltas"
        >
          <h2 className="m-0 text-lg font-extrabold">{t.semFaltas.titulo}</h2>
          <p className="m-0 text-sm leading-normal text-texto-claro">{t.semFaltas.corpo}</p>
          <Link className={classeBotao('primario')} to={`/historico/${d.resumo.id}`}>
            {t.semFaltas.voltar}
          </Link>
        </Cartao>
      </div>
    );
  }

  const re = d.retentativa;
  const flags = re ? opcoesComoTexto(re.opcoes) : '';
  return (
    <div className="flex flex-col gap-[22px]">
      {voltar}
      <header className="flex flex-col gap-2">
        <Rotulo>{t.rotulo}</Rotulo>
        <h1 className="m-0 text-[34px] leading-tight font-extrabold tracking-[-0.01em]" style={{ fontStretch: '112%' }}>
          {t.titulo(diagnosticos.length)}
        </h1>
        <p className="m-0 max-w-[720px] text-[15px] leading-normal text-texto-suave">{t.subtitulo}</p>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <ListaDeFaixas
          diagnosticos={diagnosticos}
          selecionada={atual.key}
          aoEscolher={(k) => {
            setErro(null);
            setParams({ faixa: k }, { replace: true });
          }}
        />
        <PainelDaFaixa
          d={atual}
          d0={d}
          linhaNaLista={linhas.data?.[atual.key] ?? null}
          motivoNaoAtualizada={motivos[atual.key] ?? null}
          ocupado={ocupado}
          erro={erro}
          aoEscolherTitulo={(titulo) => void escolher(titulo)}
          aoDesfazer={() => void desfazer()}
          aoReceita={() => void revisarETentarDeNovo()}
        />
      </div>

      {re ? (
        <Cartao
          className="flex flex-wrap items-center gap-4 !rounded-[10px] !border-borda bg-painel px-[22px] py-[18px]"
          data-testid="rodape-tentar-de-novo"
        >
          <div className="flex min-w-[320px] flex-[1_1_420px] flex-col gap-[6px]">
            <span className="text-base font-extrabold">{t.rodape.titulo(re.faixas)}</span>
            <span className="text-[13.5px] leading-normal text-texto-suave">
              {t.rodape.antes} <span className="font-mono text-texto">{re.arquivo}</span> {t.rodape.depois}
            </span>
            <code className="font-mono text-[12.5px] text-ambar-vivo" data-testid="opcoes-sugeridas">
              {flags || t.rodape.opcoesPadrao}
            </code>
            {re.retentar ? <span className="text-xs text-texto-mudo">{t.rodape.retentarAviso}</span> : null}
            {erroRodape ? (
              <span role="alert" className="text-[13px] text-chip-vermelho">
                {erroRodape}
              </span>
            ) : null}
          </div>
          <Botao
            variante="primario"
            disabled={gerando}
            onClick={() => void revisarETentarDeNovo()}
            data-testid="revisar-e-tentar"
          >
            {gerando ? t.rodape.gerando : t.rodape.revisar}
          </Botao>
        </Cartao>
      ) : null}
    </div>
  );
}

export function DiagnosticoDasFaltas() {
  const { runId } = useParams();
  const semPasta = useSemPasta();
  const q = useDetalheDaExecucao(runId);
  if (semPasta) return <SemPasta />;
  if (q.isError) return <ErroDeLeitura causa={q.error} aoTentarDeNovo={() => void q.refetch()} />;
  if (q.isPending || !runId) return <Carregando rotulo={msg.historico.carregando} />;
  if (q.data === null) {
    return (
      <div className="flex flex-col gap-5">
        <Link to="/historico" className="inline-flex items-center gap-[6px] self-start text-[13px] font-semibold">
          <IconeVoltarPagina tamanho={14} />
          {msg.historico.detalhe.voltar}
        </Link>
        <Cartao borda="vazio" className="flex max-w-[520px] flex-col items-start gap-3 p-[22px]">
          <h2 className="m-0 text-lg font-extrabold">{msg.historico.detalhe.naoExiste.titulo}</h2>
          <p className="m-0 text-sm leading-normal text-texto-claro">{msg.historico.detalhe.naoExiste.corpo}</p>
        </Cartao>
      </div>
    );
  }
  return <Corpo d={q.data} />;
}
