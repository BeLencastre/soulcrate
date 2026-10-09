// Configurações → Aplicativo e Sobre (Fase 6, protótipo "Configurações"): as preferências do app e a tela com versões,
// atualização, créditos e o pacote de suporte.
import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import type { AppSettings, OndeAbrirWebUi, TemaPreferido } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import type { ResultadoPacoteSuporte } from '@shared/sobre';
import { erroInesperado, type AppError } from '@shared/erros';
import { resumirStack } from '@shared/stack';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { textoDaAtualizacao, useArquivosDaStack, useEstadoAtualizacao } from '../lib/atualizacao';
import { useStackStatus } from '../lib/estado';
import { formatarBytes } from '../lib/historico';
import { useMudarSettings, useSettings } from '../lib/preferencias';
import { CartaoErro } from './CartaoErro';
import { ErroDeLeitura } from './historico/estados';
import { Interruptor } from './campos';
import { Botao, Cartao, Chip, Rotulo } from './ui';

// ---------------------------------------------------------------- Aplicativo

function GrupoDeOpcoes<T extends string>({
  legenda,
  dica,
  nome,
  valor,
  opcoes,
  aoMudar,
  desabilitado,
}: {
  legenda: string;
  dica?: string;
  nome: string;
  valor: T | undefined;
  opcoes: readonly { valor: T; rotulo: string }[];
  aoMudar(valor: T): void;
  desabilitado: boolean;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-[10px] border-0 p-0" disabled={desabilitado}>
      <legend className="pb-[10px] font-bold">{legenda}</legend>
      {dica ? <p className="hint m-0">{dica}</p> : null}
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <label key={o.valor} className="rad">
            <input
              type="radio"
              name={nome}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => aoMudar(o.valor)}
              className="accent-ambar"
            />
            {o.rotulo}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** As preferências do app: interruptores, onde abrir as Web UIs e o tema. Gravam na hora (sem botão "Salvar"). */
export function SecaoAplicativo() {
  const { data, isError, refetch } = useSettings();
  const mudar = useMudarSettings();
  const t = msg.aplicativo;
  const gravar = (parcial: Partial<AppSettings>) => seguro(mudar(parcial));

  if (isError) {
    return (
      <ErroDeLeitura
        causa={new Error('Não consegui ler as preferências do app.')}
        aoTentarDeNovo={() => void refetch()}
      />
    );
  }
  const desabilitado = !data;
  return (
    <div className="flex flex-col gap-[22px]" data-testid="secao-aplicativo" aria-busy={desabilitado}>
      <Interruptor
        titulo={t.iniciarComWindows.titulo}
        descricao={t.iniciarComWindows.dica}
        marcado={data?.iniciarComWindows ?? false}
        desabilitado={desabilitado}
        aoMudar={(v) => gravar({ iniciarComWindows: v })}
      />
      <Interruptor
        titulo={t.bandeja.titulo}
        descricao={t.bandeja.dica}
        marcado={data?.minimizarParaBandeja ?? true}
        desabilitado={desabilitado}
        aoMudar={(v) => gravar({ minimizarParaBandeja: v })}
      />
      <Interruptor
        titulo={t.avisarLote.titulo}
        descricao={t.avisarLote.dica}
        marcado={data?.avisarFimDoLote ?? true}
        desabilitado={desabilitado}
        aoMudar={(v) => gravar({ avisarFimDoLote: v })}
      />
      <Interruptor
        titulo={t.avisarPausa.titulo}
        descricao={t.avisarPausa.dica}
        marcado={data?.avisarBuscasPausadas ?? true}
        desabilitado={desabilitado}
        aoMudar={(v) => gravar({ avisarBuscasPausadas: v })}
      />
      <GrupoDeOpcoes<OndeAbrirWebUi>
        legenda={t.abrirWebUi.grupo}
        nome="abrir-webui"
        valor={data?.abrirWebUi}
        desabilitado={desabilitado}
        aoMudar={(v) => gravar({ abrirWebUi: v })}
        opcoes={[
          { valor: 'app', rotulo: t.abrirWebUi.app },
          { valor: 'navegador', rotulo: t.abrirWebUi.navegador },
        ]}
      />
      <GrupoDeOpcoes<TemaPreferido>
        legenda={t.tema.grupo}
        dica={t.tema.dica}
        nome="tema"
        valor={data?.tema}
        desabilitado={desabilitado}
        aoMudar={(v) => gravar({ tema: v })}
        opcoes={[
          { valor: 'escuro', rotulo: t.tema.escuro },
          { valor: 'claro', rotulo: t.tema.claro },
          { valor: 'sistema', rotulo: t.tema.sistema },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Sobre

function Linha({ rotulo, children, ultima }: { rotulo: string; children: ReactNode; ultima?: boolean }) {
  const borda = ultima ? '' : 'border-b border-linha';
  return (
    <>
      <dt className={`px-4 py-3 text-texto-suave ${borda}`}>{rotulo}</dt>
      <dd className={`m-0 px-4 py-3 font-mono text-[13px] ${borda}`}>{children}</dd>
    </>
  );
}

function DialogoCreditos({ aberto, aoFechar }: { aberto: boolean; aoFechar(): void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['app', 'credits'],
    queryFn: () => api.app.getCredits(),
    enabled: aberto,
    staleTime: Infinity,
  });
  const t = msg.sobre;
  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[10px] border border-borda-forte bg-dialogo p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-creditos"
        >
          <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
            {t.creditosTitulo}
          </Dialog.Title>
          <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
            {t.creditosDescricao}
          </Dialog.Description>
          {isLoading || !data ? (
            <p role="status" className="hint m-0">
              {msg.app.carregando}
            </p>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col p-0">
                {data.creditos.map((c) => (
                  <li key={c.nome} className="flex flex-wrap items-baseline gap-x-3 border-t border-linha py-2 text-sm">
                    <a
                      href={c.url}
                      className="font-bold"
                      onClick={(e) => {
                        e.preventDefault();
                        seguro(api.app.openExternal(c.url));
                      }}
                    >
                      {c.nome}
                    </a>
                    <span className="text-texto-suave">{c.papel}</span>
                  </li>
                ))}
              </ul>
              {data.arquivosDeLicencas.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Rotulo>{t.licencasDeTerceiros}</Rotulo>
                  <div className="flex flex-wrap gap-2">
                    {data.arquivosDeLicencas.map((a) => (
                      <Botao key={a.id} pequeno onClick={() => seguro(api.app.openLicenseFile(a.id))}>
                        {a.nome}
                      </Botao>
                    ))}
                  </div>
                </div>
              ) : null}
              {data.licenca ? (
                <div className="flex flex-col gap-2">
                  <Rotulo>{t.licencaDoSoulcrate}</Rotulo>
                  <pre
                    tabIndex={0}
                    aria-label={t.licencaDoSoulcrate}
                    className="m-0 max-h-56 overflow-auto rounded-md bg-log p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-texto-claro"
                  >
                    {data.licenca}
                  </pre>
                </div>
              ) : null}
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Botao variante="primario">{t.fechar}</Botao>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CartaoDeSuporte() {
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoPacoteSuporte | null>(null);
  const t = msg.suporte;

  async function gerar() {
    setGerando(true);
    setResultado(null);
    try {
      const r = await api.app.createSupportBundle();
      // cancelar a janela "Salvar como" não é erro nem sucesso: a tela fica como estava
      setResultado(r.ok === false && r.cancelado ? null : r);
    } catch (e) {
      setResultado({ ok: false, cancelado: false, erro: erroInesperado(e) });
    } finally {
      setGerando(false);
    }
  }

  return (
    <Cartao como="section" className="flex flex-col gap-3 p-[18px]" aria-label={t.titulo} data-testid="cartao-suporte">
      <span className="font-bold">{t.titulo}</span>
      <p className="hint m-0">{t.descricao}</p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" disabled={gerando} onClick={() => void gerar()}>
          {gerando ? t.gerando : t.gerar}
        </Botao>
        <Botao onClick={() => seguro(api.app.openLogsFolder())}>{msg.menu.abrirPastaLogs}</Botao>
      </div>
      {resultado?.ok ? (
        <div role="status" className="flex flex-wrap items-center gap-3" data-testid="pacote-pronto">
          <Chip cor="verde">{t.pronto}</Chip>
          <span className="text-[13px] text-texto-claro">
            {t.prontoCorpo(resultado.arquivos.length, formatarBytes(resultado.bytes))}
          </span>
          <Botao variante="fantasma" pequeno onClick={() => seguro(api.app.revealSupportBundle())}>
            {t.mostrarNaPasta}
          </Botao>
        </div>
      ) : null}
      {resultado && !resultado.ok && !resultado.cancelado ? (
        <CartaoErro erro={resultado.erro} aoTentarDeNovo={() => void gerar()} aoFechar={() => setResultado(null)} />
      ) : null}
    </Cartao>
  );
}

function CartaoArquivosDaStack() {
  const { data } = useArquivosDaStack();
  const [aplicando, setAplicando] = useState(false);
  const t = msg.arquivosDaStack;
  if (!data) return null;
  return (
    <Cartao
      como="section"
      className="flex flex-col gap-2 p-[18px]"
      aria-label={msg.sobre.stack}
      data-testid="arquivos-da-stack"
    >
      <p className="m-0 text-sm text-texto-claro">
        {data.gerenciada
          ? t.gerenciada(data.versaoDaPasta)
          : data.motivoSemGestao === 'pasta-existente'
            ? t.naoGerenciada
            : null}
      </p>
      {data.pendente ? (
        <div className="flex flex-wrap items-center gap-3">
          {data.esperando ? <span className="hint">{t.esperando}</span> : null}
          <Botao
            pequeno
            disabled={aplicando || data.esperando}
            onClick={() => {
              setAplicando(true);
              void api.stackFiles.apply().finally(() => setAplicando(false));
            }}
          >
            {t.atualizarAgora}
          </Botao>
        </div>
      ) : null}
    </Cartao>
  );
}

/** Configurações → Sobre: versões, atualização, créditos e pacote de suporte. */
export function SecaoSobre() {
  const status = useStackStatus();
  const resumo = resumirStack(status);
  const atualizacao = useEstadoAtualizacao();
  const [creditos, setCreditos] = useState(false);
  const [erroReiniciar, setErroReiniciar] = useState<AppError | null>(null);
  const t = msg.sobre;

  // as versões vêm dos contêineres: relê quando a stack liga ou desliga
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['app', 'about', resumo.estado, resumo.saudaveis],
    queryFn: () => api.app.getAbout(),
    staleTime: 60_000,
    // ao ligar ou desligar a stack a consulta muda de chave: mostra o que já havia até chegar o novo, sem piscar "Lendo…"
    placeholderData: (anterior) => anterior,
  });

  if (isError) {
    return <ErroDeLeitura causa={new Error(t.erroLer)} aoTentarDeNovo={() => void refetch()} />;
  }

  const procurando = atualizacao?.estado === 'verificando' || atualizacao?.estado === 'baixando';
  const naoEmDev = atualizacao !== undefined && atualizacao.estado !== 'indisponivel';

  async function reiniciar() {
    setErroReiniciar(null);
    const r = await api.update.restartAndInstall();
    if (!r.ok) setErroReiniciar(r.erro);
  }

  return (
    <div className="flex flex-col gap-[22px]" data-testid="secao-sobre">
      {isLoading || !data ? (
        <p role="status" className="hint m-0" data-testid="sobre-carregando">
          {t.lendo}
        </p>
      ) : (
        <dl
          aria-label={t.versoes}
          className="m-0 grid grid-cols-[200px_1fr] overflow-hidden rounded-lg border border-borda text-sm"
          data-testid="sobre-versoes"
        >
          <Linha rotulo={t.app}>
            <span data-testid="versao-do-app">{data.app.versao}</span>
            {data.app.empacotado ? null : <span className="text-texto-mudo"> · {t.desenvolvimento}</span>}
            <span className="text-texto-mudo"> · Electron {data.app.electron}</span>
          </Linha>
          <Linha rotulo={t.stack}>
            <span data-testid="versao-da-stack">{data.stack.instalada ?? t.nao}</span>
            {data.stack.doApp && data.stack.doApp !== data.stack.instalada ? (
              <span className="text-texto-mudo"> · {t.stackDoApp(data.stack.doApp)}</span>
            ) : null}
          </Linha>
          {data.componentes.map((c, i) => (
            <Linha key={c.id} rotulo={c.nome} ultima={i === data.componentes.length - 1}>
              {c.versao ? (
                <>
                  <span data-testid={`versao-${c.id}`}>{c.versao}</span>
                  <span className="text-texto-mudo"> · {c.fonte === 'conteiner' ? t.lidaDoConteiner : t.daImagem}</span>
                </>
              ) : (
                <span className="text-texto-suave" data-testid={`versao-${c.id}`}>
                  {c.motivo ? t.semVersao[c.motivo] : t.nao}
                </span>
              )}
            </Linha>
          ))}
        </dl>
      )}

      <Cartao
        como="section"
        className="flex flex-col gap-3 p-[18px]"
        aria-label={msg.atualizacao.procurar}
        data-testid="cartao-atualizacao"
      >
        <p role="status" className="m-0 text-sm leading-normal text-texto-claro" data-testid="estado-atualizacao">
          {atualizacao ? textoDaAtualizacao(atualizacao) : msg.app.carregando}
        </p>
        <div className="flex flex-wrap gap-2">
          {atualizacao?.estado === 'pronta' ? (
            <Botao variante="primario" onClick={() => void reiniciar()}>
              {msg.atualizacao.reiniciar}
            </Botao>
          ) : (
            <Botao disabled={!naoEmDev || procurando} onClick={() => seguro(api.update.check())}>
              {procurando ? msg.atualizacao.procurando : msg.atualizacao.procurar}
            </Botao>
          )}
          <Botao variante="fantasma" onClick={() => setCreditos(true)}>
            {t.creditos}
          </Botao>
        </div>
        {atualizacao?.estado === 'erro' ? (
          <CartaoErro erro={atualizacao.erro} aoTentarDeNovo={() => seguro(api.update.check())} />
        ) : null}
        {erroReiniciar ? <CartaoErro erro={erroReiniciar} aoFechar={() => setErroReiniciar(null)} /> : null}
      </Cartao>

      <CartaoArquivosDaStack />
      <CartaoDeSuporte />
      <DialogoCreditos aberto={creditos} aoFechar={() => setCreditos(false)} />
    </div>
  );
}
