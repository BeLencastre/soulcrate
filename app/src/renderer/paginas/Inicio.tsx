// Tela Início (protótipo "Início"): cinco etapas do ambiente, Ligar/Desligar/Reconstruir, interfaces web e log da stack.
import * as Collapsible from '@radix-ui/react-collapsible';
import { useNavigate } from 'react-router';
import { msg } from '@shared/mensagens';
import { ORDEM_WEBUI, servicoPorId, SERVICOS } from '@shared/servicos';
import {
  acoesDisponiveis,
  derivarEtapas,
  resumirStack,
  servicoSaudavel,
  type Etapa,
  type EtapaEstado,
  type StackStatus,
} from '@shared/stack';
import { ledDoServico } from '../components/BarraLateral';
import { AvisoDeAtualizacaoDoApp, AvisoDosArquivosDaStack } from '../components/AvisosDoApp';
import { CartaoErro } from '../components/CartaoErro';
import { IconeLigar, IconeLinkExterno, IconeReconstruir, IconeSeta } from '../components/icones';
import { Botao, CabecalhoPagina, Cartao, Chip, Led, Rotulo, type CorChip } from '../components/ui';
import { seguro, useAcoes } from '../lib/acoes';
import { api } from '../lib/api';
import { resumirFim } from '@shared/lote-estado';
import { useAgora, useStackStatus, useUi } from '../lib/estado';
import { useAbrirServico } from '../lib/preferencias';
import { execucaoRodando, useExecucao } from '../lib/lote-store';

const COR_DO_ESTADO: Record<EtapaEstado, CorChip> = {
  ok: 'verde',
  erro: 'vermelho',
  aguardando: 'neutro',
  trabalhando: 'azul',
  desligada: 'neutro',
  atencao: 'laranja',
};

const BORDA_DO_ESTADO: Partial<Record<EtapaEstado, 'erro' | 'azul'>> = { erro: 'erro', trabalhando: 'azul' };

function CartaoEtapa({ etapa, status, agora }: { etapa: Etapa; status: StackStatus; agora: number }) {
  const { executarAcaoEtapa } = useAcoes();
  const rodando = status.servicos.filter((s) => s.container === 'running').length;
  const segundos = status.docker.abrindo ? Math.max(0, Math.floor((agora - status.docker.abrindo.desdeMs) / 1000)) : 0;
  const detalhe = msg.etapas.detalhe(etapa.detalhe, {
    versaoDocker: status.docker.versaoServidor,
    segundos,
    erros: status.configuracao.erros,
    avisos: status.configuracao.avisos,
    rodando,
    total: SERVICOS.length,
  });
  const rotuloEstado =
    (msg.etapas.estado[etapa.id] as Partial<Record<EtapaEstado, string>>)[etapa.estado] ?? etapa.estado;
  const mostraServicos = etapa.id === 'servicos';

  return (
    <Cartao
      borda={BORDA_DO_ESTADO[etapa.estado] ?? 'normal'}
      className="flex min-h-[172px] flex-col gap-[10px] p-4"
      data-etapa={etapa.id}
      data-estado={etapa.estado}
    >
      <div className="flex items-center justify-between gap-2">
        <Rotulo>{msg.etapas.rotulo(etapa.numero)}</Rotulo>
        <Chip cor={COR_DO_ESTADO[etapa.estado]}>{rotuloEstado}</Chip>
      </div>
      <h3 className="m-0 text-base font-bold">{msg.etapas.titulo[etapa.id]}</h3>
      {detalhe ? <p className="m-0 text-[13px] leading-[1.45] text-texto-suave">{detalhe}</p> : null}
      {mostraServicos ? (
        <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
          {SERVICOS.map((info) => {
            const s = status.servicos.find((x) => x.id === info.id);
            const led = s ? ledDoServico(s) : 'cinza';
            const texto =
              s?.container !== 'running'
                ? etapa.estado === 'aguardando'
                  ? msg.servicoSaude.ausente
                  : msg.servicoSaude.parado
                : servicoSaudavel(s)
                  ? msg.servicoSaude.healthy
                  : s.saude === 'starting'
                    ? msg.servicoSaude.starting
                    : msg.servicoSaude.unhealthy;
            return (
              <li key={info.id} className="flex items-center gap-2 text-[13px]">
                <Led cor={etapa.estado === 'aguardando' ? 'cinza' : led} brilho={led === 'verde'} />
                <span className="font-semibold">{info.nome}</span>
                <span className="font-mono text-xs text-texto-mudo">:{info.porta}</span>
                <span className="ml-auto text-xs text-texto-suave">{texto}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {etapa.acao ? (
        <Botao
          variante="primario"
          pequeno
          className="mt-auto self-start"
          onClick={() => executarAcaoEtapa(etapa.acao as NonNullable<Etapa['acao']>)}
        >
          {msg.etapas.acao[etapa.acao]}
        </Botao>
      ) : null}
    </Cartao>
  );
}

function PainelLog({ status }: { status: StackStatus }) {
  const aberto = useUi((s) => s.logAberto);
  const definirAberto = useUi((s) => s.definirLogAberto);
  const operacao = useUi((s) => s.operacao);

  const linhas = operacao
    ? operacao.linhas.map((l) => ({
        texto: l.texto,
        cor: l.marcador
          ? 'var(--color-chip-verde)'
          : /^\[(erro)\]/i.test(l.texto)
            ? 'var(--color-chip-vermelho)'
            : 'var(--color-texto-claro)',
      }))
    : status.servicos.some((s) => s.container !== 'ausente')
      ? [
          { texto: 'NAME        STATUS', cor: 'var(--color-texto-mudo)' },
          ...status.servicos.map((s) => ({
            texto: `${s.id.padEnd(11)} ${s.statusTexto ?? 'não existe'}`,
            cor: 'var(--color-texto-claro)',
          })),
        ]
      : [{ texto: msg.inicio.logVazio, cor: 'var(--color-texto-mudo)' }];

  return (
    <Collapsible.Root open={aberto} onOpenChange={definirAberto} asChild>
      <section className="overflow-hidden rounded-lg border border-borda bg-log" aria-label={msg.inicio.logDaStack}>
        <Collapsible.Trigger className="flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-5 py-[14px] text-left">
          <IconeSeta tamanho={16} style={{ transform: `rotate(${aberto ? 90 : 0}deg)` }} />
          <Rotulo className="!text-texto-suave">{msg.inicio.logDaStack}</Rotulo>
          <span className="font-mono text-xs text-texto-mudo">{msg.inicio.logFonte}</span>
          <span className="ml-auto flex gap-[6px]">
            {operacao?.marcadores.map((m) => (
              <Chip key={m} cor={m === 'plugins ok' ? 'verde' : 'neutro'}>
                {m}
              </Chip>
            ))}
          </span>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div
            className="max-h-[360px] overflow-auto py-1 pr-5 pb-[18px] pl-12 font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap"
            data-testid="log-da-stack"
            tabIndex={0}
            role="log"
            aria-label={msg.inicio.logDaStack}
          >
            {operacao && linhas.length === 0 ? (
              <div className="text-texto-mudo">{msg.inicio.logOperacaoVazia}</div>
            ) : (
              linhas.map((l, i) => (
                <div key={i} style={{ color: l.cor }}>
                  {l.texto}
                </div>
              ))
            )}
          </div>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}

/** O lote em andamento (ou o último desta sessão); sem nenhum, o convite para baixar uma lista. */
function CartaoDoLote() {
  const navegar = useNavigate();
  const rodando = useExecucao(execucaoRodando);
  const runId = useExecucao((s) => s.runId);
  const estado = useExecucao((s) => s.estado);
  const resumo = useExecucao((s) => s.resumo);
  const t = msg.lote.inicio;

  if (!runId) {
    return (
      <Cartao
        borda="vazio"
        como="section"
        className="flex flex-col items-start gap-3 p-6"
        data-testid="cartao-sem-lote"
      >
        <Rotulo>{msg.inicio.semLote}</Rotulo>
        <p className="m-0 text-sm leading-normal text-texto-suave">{msg.inicio.semLoteDica}</p>
        <Botao variante="primario" pequeno onClick={() => navegar('/lista')}>
          {t.baixarLista}
        </Botao>
      </Cartao>
    );
  }
  const total = estado.total || estado.faixas.length;
  const feitas = estado.contagem.concluidas;
  const fim = estado.fim ? resumirFim(estado.fim.summary) : null;
  return (
    <Cartao
      como="section"
      borda={rodando ? 'azul' : 'normal'}
      className="flex flex-col items-start gap-3 p-6"
      data-testid="cartao-lote-inicio"
    >
      <Rotulo>{rodando ? t.rodando : t.terminou}</Rotulo>
      <span className="font-mono text-base font-bold">{estado.inicio?.list ?? resumo?.lista ?? '…'}</span>
      <p className="m-0 text-sm leading-normal text-texto-suave">
        {t.progresso(feitas, total)}
        {fim ? ` · ${msg.lote.notificacao.contagem(fim)}` : ''}
      </p>
      <Botao pequeno onClick={() => navegar('/lista/execucao')}>
        {t.ver}
      </Botao>
    </Cartao>
  );
}

export function Inicio() {
  const status = useStackStatus();
  const operacao = useUi((s) => s.operacao);
  const dispensarOperacao = useUi((s) => s.dispensarOperacao);
  const agora = useAgora(status.docker.abrindo !== null);
  const servicoWeb = useAbrirServico();
  // o botão principal segue a preferência (Configurações → Aplicativo); o de ícone oferece o outro destino
  const destinoPrincipal = servicoWeb.preferencia === 'app' ? msg.acoes.abrirNoApp : msg.acoes.abrirNoNavegador;
  const outroDestino = servicoWeb.preferencia === 'app' ? msg.acoes.abrirNoNavegador : msg.acoes.abrirNoApp;

  const resumo = resumirStack(status);
  const { titulo, subtitulo } = msg.inicio.cabecalho(resumo, { abrindo: status.docker.abrindo !== null });
  const etapas = derivarEtapas(status);
  const acoes = acoesDisponiveis(status);
  const erro = operacao?.terminou ? operacao.erro : null;

  return (
    <div className="flex flex-col gap-7">
      <CabecalhoPagina
        rotulo={msg.inicio.rotulo}
        titulo={titulo}
        subtitulo={subtitulo}
        acoes={
          <>
            <Botao variante="primario" disabled={!acoes.ligar} onClick={() => seguro(api.stack.up())}>
              <IconeLigar />
              {msg.acoes.ligar}
            </Botao>
            <Botao disabled={!acoes.desligar} onClick={() => seguro(api.stack.down())}>
              {msg.acoes.desligar}
            </Botao>
            <Botao disabled={!acoes.reconstruir} onClick={() => seguro(api.stack.up({ rebuild: true }))}>
              <IconeReconstruir />
              {msg.acoes.reconstruir}
            </Botao>
          </>
        }
      />

      {erro ? <CartaoErro erro={erro} aoFechar={dispensarOperacao} /> : null}

      <AvisoDeAtualizacaoDoApp />
      <AvisoDosArquivosDaStack />

      <section
        aria-label={msg.inicio.etapas}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(176px,100%),1fr))] gap-3"
      >
        {etapas.map((e) => (
          <CartaoEtapa key={e.id} etapa={e} status={status} agora={agora} />
        ))}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-4">
        <CartaoDoLote />

        <Cartao como="section" className="flex flex-col gap-3 p-5" aria-label={msg.inicio.interfacesWeb}>
          <Rotulo>{msg.inicio.interfacesWeb}</Rotulo>
          {ORDEM_WEBUI.map((id) => {
            const info = servicoPorId(id);
            const s = status.servicos.find((x) => x.id === id);
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 border-t border-linha py-[10px]">
                <Led cor={s ? ledDoServico(s) : 'cinza'} />
                <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[2px]">
                  <span className="text-sm font-bold">
                    {info.nome} <span className="font-mono text-xs font-normal text-texto-mudo">:{info.porta}</span>
                  </span>
                  <span className="text-[13px] text-texto-suave">{msg.inicio.descricaoWebUi[id]}</span>
                </div>
                <Botao pequeno aria-label={`${destinoPrincipal}: ${info.nome}`} onClick={() => servicoWeb.abrir(id)}>
                  {destinoPrincipal}
                </Botao>
                <Botao
                  variante="fantasma"
                  pequeno
                  aria-label={`${outroDestino}: ${info.nome}`}
                  title={outroDestino}
                  onClick={() => servicoWeb.abrirNoOutro(id)}
                >
                  <IconeLinkExterno tamanho={15} />
                </Botao>
              </div>
            );
          })}
        </Cartao>
      </div>

      <PainelLog status={status} />
    </div>
  );
}
