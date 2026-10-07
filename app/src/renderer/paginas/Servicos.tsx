// Tela Serviços (protótipo "Serviços"): as verificações do status.bat em verde/amarelo/vermelho e os logs de cada contêiner.
import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { AlvoLog, CheckEstado, CheckItem, HealthCheckResult, LinhaLog } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import { SERVICOS, type ServicoId } from '@shared/servicos';
import { IconeRecarregar } from '../components/icones';
import { Botao, CabecalhoPagina, Cartao, Chip, classeBotao, Led, type CorChip, type CorLed } from '../components/ui';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { useAgora, useStackStatus } from '../lib/estado';
import { textoDasLinhas, useLogs } from '../lib/logs';

const ALVOS: AlvoLog[] = [...SERVICOS.map((s) => s.id), 'todos'];

const COR_CHIP: Record<CheckEstado, CorChip> = { ok: 'verde', aviso: 'laranja', erro: 'vermelho' };
const COR_ITEM: Record<CheckItem['estado'], CorLed> = {
  ok: 'verde',
  aviso: 'laranja',
  erro: 'vermelho',
  neutro: 'cinza',
};
const COR_LINHA = { info: '#B4B8BF', aviso: '#FF9A5C', erro: '#FF7A7A' } as const;

function CartaoCheck({ check }: { check: HealthCheckResult }) {
  const info = msg.servicos.check[check.id];
  return (
    <Cartao className="flex flex-col gap-[10px] px-[18px] py-4" data-check={check.id} data-estado={check.estado}>
      <div className="flex items-center gap-3">
        <Chip cor={COR_CHIP[check.estado]}>{msg.servicos.estadoCheck[check.estado]}</Chip>
        <h3 className="m-0 text-[15px] font-bold">{info.titulo}</h3>
        <span className="ml-auto font-mono text-xs text-texto-mudo">{info.fonte}</span>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-[6px] p-0">
        {check.itens.map((i, n) => (
          <li key={n} className="inline-flex items-center gap-[7px] text-[13px] text-texto-claro">
            <Led cor={COR_ITEM[i.estado]} tamanho={6} />
            {i.texto}
          </li>
        ))}
      </ul>
      {check.nota ? <p className="m-0 text-[13px] leading-normal text-[#ffb98f]">{check.nota}</p> : null}
    </Cartao>
  );
}

function PainelLogs({ rodando }: { rodando: boolean }) {
  const [alvo, setAlvo] = useState<AlvoLog>('slskd');
  const [seguir, setSeguir] = useState(true);
  const linhas = useLogs(alvo, rodando);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (seguir && area.current) area.current.scrollTop = area.current.scrollHeight;
  }, [linhas, seguir]);

  const nomeAtual = alvo === 'todos' ? '' : (SERVICOS.find((s) => s.id === alvo)?.nome ?? '');

  return (
    <Tabs.Root
      value={alvo}
      onValueChange={(v) => setAlvo(v as AlvoLog)}
      className="flex min-h-[600px] flex-col overflow-hidden rounded-lg border border-borda bg-log"
      aria-label={msg.servicos.logsDosConteineres}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-borda-fraca px-3">
        <Tabs.List aria-label={msg.servicos.contêiner} className="flex gap-[2px]">
          {ALVOS.map((a) => (
            <Tabs.Trigger key={a} value={a} className="tab">
              {a === 'todos' ? msg.servicos.todos : a}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="ml-auto flex items-center gap-[6px] py-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-texto-suave">
            <input
              type="checkbox"
              checked={seguir}
              onChange={(e) => setSeguir(e.target.checked)}
              className="size-4 accent-ambar"
            />
            {msg.servicos.seguir}
          </label>
          <Botao variante="fantasma" pequeno onClick={() => seguro(api.app.copyText(textoDasLinhas(linhas)))}>
            {msg.acoes.copiar}
          </Botao>
          {alvo !== 'todos' ? (
            <Botao pequeno onClick={() => seguro(api.stack.restartService(alvo as ServicoId))}>
              {msg.servicos.reiniciar(nomeAtual)}
            </Botao>
          ) : null}
        </div>
      </div>
      <Tabs.Content
        value={alvo}
        ref={area}
        role="log"
        aria-label={`${msg.servicos.logsDosConteineres}: ${alvo}`}
        tabIndex={0}
        data-testid="log-do-conteiner"
        className="flex-1 overflow-auto px-[18px] py-[14px] font-mono text-[12.5px] leading-[1.8] whitespace-pre-wrap text-texto-claro"
      >
        <div className="text-texto-mudo">$ docker compose logs -f --tail 200 {alvo === 'todos' ? '' : alvo}</div>
        {linhas.length === 0 ? <div className="text-texto-apagado">{msg.servicos.semLogs}</div> : null}
        {linhas.map((l: LinhaLog, i) => (
          <div key={i}>
            {l.hora ? <span className="text-texto-apagado">{l.hora}</span> : null}
            {alvo === 'todos' && l.servico ? (
              <span className="text-texto-mudo"> {l.servico.padEnd(9)}</span>
            ) : null}{' '}
            <span style={{ color: COR_LINHA[l.nivel] }}>{l.texto}</span>
          </div>
        ))}
      </Tabs.Content>
    </Tabs.Root>
  );
}

export function Servicos() {
  const status = useStackStatus();
  const rodando = status.docker.engine && status.servicos.some((s) => s.container === 'running');
  // refaz as verificações quando algum contêiner muda de estado, além do ritmo normal
  const assinatura = status.servicos.map((s) => `${s.container}/${s.saude}/${String(s.http)}`).join('|');

  const checks = useQuery({
    queryKey: ['stack', 'checks', assinatura],
    queryFn: () => api.stack.runChecks(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    enabled: rodando,
  });
  const resultado = checks.data;
  const agora = useAgora(rodando);

  const lista = resultado?.executado ? resultado.checks : [];
  const ok = lista.filter((c) => c.estado === 'ok').length;
  const avisos = lista.filter((c) => c.estado === 'aviso').length;
  const erros = lista.filter((c) => c.estado === 'erro').length;
  const titulo = !rodando
    ? msg.servicos.titulo.semStack
    : !resultado?.executado
      ? msg.servicos.titulo.verificando
      : erros > 0
        ? msg.servicos.titulo.erro
        : avisos > 0
          ? msg.servicos.titulo.aviso
          : msg.servicos.titulo.ok;
  const segundos = resultado?.executado ? Math.max(0, Math.round((agora - resultado.verificadoEm) / 1000)) : null;
  const subtitulo = !rodando
    ? msg.servicos.semStack
    : resultado?.executado
      ? msg.servicos.subtitulo(ok, lista.length, avisos, segundos)
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        rotulo={msg.servicos.rotulo}
        titulo={titulo}
        {...(subtitulo ? { subtitulo } : {})}
        acoes={
          <>
            <Botao variante="primario" disabled={!rodando || checks.isFetching} onClick={() => void checks.refetch()}>
              <IconeRecarregar />
              {msg.acoes.verificarDeNovo}
            </Botao>
            <Link className={classeBotao()} to="/servicos/web/soulbeet">
              {msg.acoes.abrirWebUis}
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <section aria-label={msg.servicos.verificacoes} className="flex flex-col gap-[10px]">
          {lista.map((c) => (
            <CartaoCheck key={c.id} check={c} />
          ))}
          {rodando && !resultado?.executado ? (
            <Cartao role="status" className="flex flex-col gap-3 p-5" aria-label={msg.servicos.titulo.verificando}>
              <span className="esqueleto h-3 w-[30%]" />
              <span className="esqueleto h-3 w-[55%]" />
              <span className="esqueleto h-3 w-[40%]" />
            </Cartao>
          ) : null}
          {!rodando ? (
            <Cartao borda="vazio" className="flex flex-col items-start gap-3 p-[22px]">
              <p className="m-0 text-sm leading-normal text-texto-claro">{msg.servicos.semStack}</p>
              <Link className={classeBotao('primario')} to="/">
                {msg.emBreve.irParaInicio}
              </Link>
            </Cartao>
          ) : null}
        </section>
        <PainelLogs rodando={rodando} />
      </div>
    </div>
  );
}
