// Início no Modo DJ (protótipos "DJ · Início" e "DJ · Início, outros estados"): no lugar das cinco etapas, uma frase
// com o único botão que resolve; atalhos para o que a pessoa faz (baixar, buscar, ouvir, ver transferências); o
// último download e a biblioteca. Os detalhes técnicos continuam a um clique, no Modo Dev.
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { contarIndicadores } from '@shared/biblioteca';
import { LINKS } from '@shared/erros';
import { rotuloDoMomento, type ExecucaoResumo } from '@shared/historico';
import { msg } from '@shared/mensagens';
import { FUNCAO_DO_SERVICO, msgDj } from '@shared/mensagens-dj';
import { numeroDoPasso, PASSOS_DE_LIGAR, situacaoDj, type PassoDeLigar, type SituacaoDj } from '@shared/painel-dj';
import { acoesDisponiveis, servicoDe, servicoSaudavel, type StackStatus } from '@shared/stack';
import type { ServicoId } from '@shared/servicos';
import { AvisoDeAtualizacaoDoApp, AvisoDosArquivosDaStack } from '../../components/AvisosDoApp';
import { CartaoErro } from '../../components/CartaoErro';
import { IconeBaixar, IconeBusca, IconeFones, IconeLigar, IconeTransferencias } from '../../components/icones';
import { SaidaParaModoDev } from '../../components/modo';
import { Botao, CabecalhoPagina, Cartao, Chip, classeBotao, Rotulo } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { useLeituraDaBiblioteca } from '../../lib/biblioteca';
import { useAgora, useStackStatus, useUi } from '../../lib/estado';
import { destinoDaExecucao, origemDaTentativa, segmentosDaLinha, semExtensao, useExecucoes } from '../../lib/historico';
import { corDoEstado } from '../../lib/lote-painel';
import { execucaoRodando, useExecucao } from '../../lib/lote-store';
import { useTrocarModo } from '../../lib/modo';
import { useAbrirServico } from '../../lib/preferencias';

const t = msgDj.inicio;

// ---------------------------------------------------------------- Cabeçalho

function AcoesDaSituacao({ sit, status }: { sit: SituacaoDj; status: StackStatus }) {
  const navegar = useNavigate();
  const trocar = useTrocarModo();
  const acoes = acoesDisponiveis(status);
  switch (sit.tipo) {
    case 'ligado':
      return (
        <Botao disabled={!acoes.desligar} onClick={() => seguro(api.stack.down())}>
          <IconeLigar />
          {msg.acoes.desligar}
        </Botao>
      );
    case 'desligado':
      return (
        <Botao variante="primario" disabled={!acoes.ligar} onClick={() => seguro(api.stack.up())}>
          <IconeLigar />
          {msg.acoes.ligar}
        </Botao>
      );
    case 'docker-fechado':
      return (
        <>
          <Botao variante="primario" onClick={() => seguro(api.env.startDockerDesktop())}>
            {t.acoes.abrirDocker}
          </Botao>
          <Botao variante="fantasma" onClick={() => trocar('dev')}>
            {t.acoes.detalhesTecnicos}
          </Botao>
        </>
      );
    case 'docker-ausente':
      return (
        <>
          <Botao variante="primario" onClick={() => seguro(api.app.openExternal(LINKS.baixarDocker))}>
            {t.acoes.baixarDocker}
          </Botao>
          <Botao variante="fantasma" onClick={() => seguro(api.env.check())}>
            {t.acoes.conferirDeNovo}
          </Botao>
        </>
      );
    case 'sem-projeto':
      return (
        <Botao variante="primario" onClick={() => navegar('/assistente')}>
          {t.acoes.abrirAssistente}
        </Botao>
      );
    case 'config-incompleta':
      return sit.faltaSenha ? (
        <Link className={classeBotao('primario')} to="/configuracoes?secao=soulseek">
          {t.acoes.preencherSenha}
        </Link>
      ) : (
        <Botao variante="primario" onClick={() => navegar('/assistente')}>
          {t.acoes.abrirAssistente}
        </Botao>
      );
    case 'com-problema': {
      const [unico] = sit.servicos;
      return (
        <>
          {sit.servicos.length === 1 && unico ? (
            <Botao variante="primario" onClick={() => seguro(api.stack.restartService(unico))}>
              {t.acoes.reiniciar(FUNCAO_DO_SERVICO[unico].sujeito)}
            </Botao>
          ) : (
            <Botao variante="primario" disabled={!acoes.ligar} onClick={() => seguro(api.stack.up())}>
              {t.acoes.ligarDeNovo}
            </Botao>
          )}
          <Link className={classeBotao('fantasma')} to="/servicos">
            {t.acoes.verServicos}
          </Link>
        </>
      );
    }
    case 'verificando':
    case 'ligando':
    case 'desligando':
      return null;
  }
}

/** "Passo 3 de 4 · subindo a busca e o player", com quatro barrinhas (a atual pulsa). */
function PassosDeLigar({ passo }: { passo: PassoDeLigar }) {
  const n = numeroDoPasso(passo);
  const texto = t.passo(n, PASSOS_DE_LIGAR.length, t.passos[passo]);
  return (
    <div className="flex flex-col gap-[10px]" data-testid="passos-de-ligar" data-passo={passo}>
      <div aria-hidden="true" className="flex h-[6px] max-w-[420px] gap-1">
        {PASSOS_DE_LIGAR.map((p, i) => (
          <span
            key={p}
            className={`flex-1 rounded-[2px] ${i + 1 === n ? 'pulsa' : ''}`}
            style={{ background: i + 1 <= n ? 'var(--color-led-azul)' : 'var(--color-borda-fraca)' }}
          />
        ))}
      </div>
      <span className="text-[13px] text-texto-suave">{texto}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Atalhos

const ATALHOS_WEB: readonly { id: ServicoId; Icone: typeof IconeBusca }[] = [
  { id: 'soulbeet', Icone: IconeBusca },
  { id: 'navidrome', Icone: IconeFones },
  { id: 'slskd', Icone: IconeTransferencias },
];

function IconeDoAtalho({ children, destaque = false }: { children: ReactNode; destaque?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-10 items-center justify-center rounded-lg ${
        destaque ? 'bg-ambar text-sobre-ambar' : 'bg-selecionado text-texto'
      }`}
    >
      {children}
    </span>
  );
}

function Atalhos({ status }: { status: StackStatus }) {
  const servicoWeb = useAbrirServico();
  return (
    <section
      aria-label={t.atalhos.grupo}
      className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3"
    >
      <Link className="tile tile-p" to="/lista" data-atalho="lista">
        <IconeDoAtalho destaque>
          <IconeBaixar tamanho={20} />
        </IconeDoAtalho>
        <span className="text-[17px] font-bold">{t.atalhos.lista.titulo}</span>
        <span className="text-[13px] leading-[1.45] text-ambar-texto-suave">{t.atalhos.lista.descricao}</span>
      </Link>
      {ATALHOS_WEB.map(({ id, Icone }) => {
        const a = t.atalhos[id];
        const pronto = servicoSaudavel(servicoDe(status, id));
        return (
          <button
            key={id}
            type="button"
            className="tile"
            disabled={!pronto}
            onClick={() => servicoWeb.abrir(id)}
            data-atalho={id}
          >
            <IconeDoAtalho>
              <Icone tamanho={20} />
            </IconeDoAtalho>
            <span className="text-[17px] font-bold">{a.titulo}</span>
            <span className="text-[13px] leading-[1.45] text-texto-suave">{a.descricao}</span>
            <span className="mt-auto text-xs text-texto-mudo">{pronto ? a.abre : t.atalhos.desligado}</span>
          </button>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- Último download e biblioteca

function BarraDoResultado({ r }: { r: ExecucaoResumo }) {
  const s = segmentosDaLinha(r);
  const partes = [
    { n: s.ok + s.atencao, cor: 'var(--color-led-verde)' },
    { n: s.naoVieram, cor: 'var(--color-led-vermelho)' },
    { n: s.puladas, cor: 'var(--color-led-cinza-2)' },
    { n: s.resto, cor: 'var(--color-borda-fraca)' },
  ].filter((p) => p.n > 0);
  return (
    <div aria-hidden="true" className="flex h-[10px] gap-[3px]">
      {partes.map((p, i) => (
        <span key={i} className="rounded-[2px]" style={{ flex: `${p.n} 0 0`, background: p.cor }} />
      ))}
    </div>
  );
}

function UltimoDownload() {
  const navegar = useNavigate();
  const execucoes = useExecucoes();
  const acompanhada = useExecucao((s) => s.runId);
  const rodando = useExecucao(execucaoRodando);
  const estado = useExecucao((s) => s.estado);
  const resumo = useExecucao((s) => s.resumo);
  const agora = useAgora(true, 30_000);
  const u = t.ultimo;
  const ultima = execucoes.data?.[0] ?? null;

  if (rodando) {
    const total = estado.total || estado.faixas.length;
    return (
      <Cartao como="section" borda="azul" className="flex flex-col gap-[14px] p-6" aria-label={u.rotulo}>
        <div className="flex items-center justify-between gap-3">
          <Rotulo>{u.rotulo}</Rotulo>
          <Chip cor="azul">{u.baixando}</Chip>
        </div>
        <span className="text-xl font-extrabold" style={{ fontStretch: '112%' }}>
          {semExtensao(estado.inicio?.list ?? resumo?.lista ?? '…')}
        </span>
        <p className="m-0 text-sm leading-normal text-texto-medio">{u.progresso(estado.contagem.concluidas, total)}</p>
        <Link className={`${classeBotao('padrao', true)} self-start`} to="/lista/execucao">
          {u.acompanhar}
        </Link>
      </Cartao>
    );
  }

  if (!ultima) {
    return (
      <Cartao borda="vazio" como="section" className="flex flex-col items-start gap-3 p-6" aria-label={u.rotulo}>
        <Rotulo>{u.rotulo}</Rotulo>
        <span className="text-base font-bold">{u.nenhum.titulo}</span>
        <p className="m-0 text-sm leading-normal text-texto-suave">{u.nenhum.corpo}</p>
        <Botao variante="primario" pequeno onClick={() => navegar('/lista')}>
          {u.baixarLista}
        </Botao>
      </Cartao>
    );
  }

  const c = ultima.contagem;
  const origem = origemDaTentativa(ultima, execucoes.data ?? []);
  const chegaram = u.chegaram(c.ok + c.atencao, c.total);
  return (
    <Cartao como="section" className="flex flex-col gap-[14px] p-6" aria-label={u.rotulo} data-testid="ultimo-download">
      <div className="flex items-center justify-between gap-3">
        <Rotulo>{u.rotulo}</Rotulo>
        <Chip cor={corDoEstado(ultima.fim)}>{msgDj.estadoDoDownload[ultima.fim]}</Chip>
      </div>
      <div className="flex flex-wrap items-baseline gap-[10px]">
        <span className="text-xl font-extrabold" style={{ fontStretch: '112%' }}>
          {semExtensao(origem?.lista ?? ultima.lista ?? msg.historico.semLista)}
        </span>
        <span className="text-[13px] text-texto-suave">{rotuloDoMomento(ultima.inicio, agora)}</span>
        {origem !== null ? <Chip cor="neutro">{msgDj.historico.novaTentativa}</Chip> : null}
      </div>
      <BarraDoResultado r={ultima} />
      <p className="m-0 text-sm leading-normal text-texto-medio">
        <strong className="text-texto-forte">{chegaram.numero}</strong>
        {chegaram.resto}
        {u.faltaram(c.naoVieram)}
      </p>
      <div className="flex flex-wrap gap-2">
        {ultima.temFaltas && ultima.fim !== 'rodando' ? (
          <Link className={classeBotao('padrao', true)} to={`/historico/${ultima.id}/faltas`}>
            {u.verOQueFaltou}
          </Link>
        ) : null}
        <Link className={classeBotao('fantasma', true)} to={destinoDaExecucao(ultima, acompanhada)}>
          {u.abrir}
        </Link>
      </div>
    </Cartao>
  );
}

function SuaBiblioteca({ status }: { status: StackStatus }) {
  const soulbeetNoAr = servicoDe(status, 'soulbeet').container === 'running';
  const leitura = useLeituraDaBiblioteca(soulbeetNoAr);
  const b = t.biblioteca;
  const r = leitura.data;
  const lida = soulbeetNoAr && r?.ok ? r.leitura : null;
  const n = lida ? contarIndicadores(lida.faixas, lida.parados) : null;
  const pendencias = n
    ? [
        n.semBpm > 0 ? b.semBpm(n.semBpm) : null,
        n.semTom > 0 ? b.semTom(n.semTom) : null,
        n.semGenero > 0 ? b.semGenero(n.semGenero) : null,
        n.parados > 0 ? b.esperando(n.parados) : null,
      ].filter((x): x is string => x !== null)
    : [];

  return (
    <Cartao como="section" className="flex flex-col gap-[14px] p-6" aria-label={b.rotulo} data-testid="sua-biblioteca">
      <Rotulo>{b.rotulo}</Rotulo>
      {!soulbeetNoAr ? (
        <p className="m-0 text-sm leading-normal text-texto-suave">{b.desligado}</p>
      ) : leitura.isPending ? (
        <p role="status" className="m-0 text-sm text-texto-suave">
          {b.lendo}
        </p>
      ) : !lida ? (
        <p className="m-0 text-sm leading-normal text-texto-suave">{b.naoLeu}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[32px] font-extrabold" data-testid="faixas-na-biblioteca">
              {lida.faixas.length.toLocaleString('pt-BR')}
            </span>
            <span className="text-sm text-texto-suave">{b.faixas(lida.faixas.length)}</span>
          </div>
          {pendencias.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {pendencias.map((p) => (
                <li key={p} className="st st-laranja">
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <span className="st st-verde self-start">{b.tudoCerto}</span>
          )}
        </>
      )}
      <Link className={`${classeBotao('padrao', true)} self-start`} to="/biblioteca">
        {b.abrir}
      </Link>
    </Cartao>
  );
}

// ---------------------------------------------------------------- Tela

export function InicioDj() {
  const status = useStackStatus();
  const operacao = useUi((s) => s.operacao);
  const dispensarOperacao = useUi((s) => s.dispensarOperacao);
  const linhas = operacao && !operacao.terminou ? operacao.linhas.map((l) => l.texto) : [];
  const sit = situacaoDj(status, linhas);
  const baixarFunciona = servicoSaudavel(servicoDe(status, 'slskd'));
  const { titulo, subtitulo } = t.cabecalho(sit, { baixarFunciona });
  const erro = operacao?.terminou ? operacao.erro : null;

  return (
    <div className="flex flex-col gap-7" data-testid="inicio-dj" data-situacao={sit.tipo}>
      <CabecalhoPagina
        rotulo={msg.inicio.rotulo}
        titulo={titulo}
        subtitulo={subtitulo}
        acoes={<AcoesDaSituacao sit={sit} status={status} />}
      />
      {sit.tipo === 'ligando' ? <PassosDeLigar passo={sit.passo} /> : null}
      {erro ? <CartaoErro erro={erro} aoFechar={dispensarOperacao} /> : null}

      <AvisoDeAtualizacaoDoApp />
      <AvisoDosArquivosDaStack />

      <Atalhos status={status} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-4">
        <UltimoDownload />
        <SuaBiblioteca status={status} />
      </div>

      {sit.tipo === 'com-problema' || erro ? <SaidaParaModoDev /> : null}
    </div>
  );
}
