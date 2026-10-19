// Serviços no Modo DJ (protótipo "DJ · Serviços"): um cartão por coisa que a pessoa usa (organização, busca, player,
// compartilhamento, pastas), cada um com o estado em palavras e o único botão que resolve. Logs, portas e as
// verificações completas ficam no Modo Dev, a um clique no rodapé.
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { ChecksResultado } from '@shared/ipc';
import { msg } from '@shared/mensagens';
import { FUNCAO_DO_SERVICO, msgDj } from '@shared/mensagens-dj';
import { cartoesDeServicoDj, precisaAtencao, type CartaoServicoDj, type EstadoCartaoDj } from '@shared/painel-dj';
import { servicoDe, servicoSaudavel } from '@shared/stack';
import { ErroDeLeitura } from '../../components/estados';
import { IconeRecarregar } from '../../components/icones';
import { SaidaParaModoDev } from '../../components/modo';
import { Botao, CabecalhoPagina, Cartao, Chip, classeBotao, type CorChip } from '../../components/ui';
import { seguro } from '../../lib/acoes';
import { api } from '../../lib/api';
import { CHAVE_BIBLIOTECA, useCompartilhamento } from '../../lib/biblioteca';
import { useAgora, useStackStatus } from '../../lib/estado';
import { useAbrirServico } from '../../lib/preferencias';

const t = msgDj.servicos;

const COR: Record<EstadoCartaoDj, CorChip> = {
  ok: 'verde',
  lento: 'laranja',
  ligando: 'azul',
  parado: 'vermelho',
  problema: 'vermelho',
  incompleto: 'laranja',
  zero: 'laranja',
  desconhecido: 'neutro',
};

function CartaoDj({
  cartao,
  texto,
  origem,
  acao,
}: {
  cartao: CartaoServicoDj;
  texto: ReactNode;
  origem: string | null;
  acao: ReactNode;
}) {
  const atencao = precisaAtencao(cartao);
  const rotulo = cartao.id === 'pastas' && cartao.estado === 'ok' ? t.pastasOk : t.estado[cartao.estado];
  return (
    <Cartao
      como="section"
      borda={atencao ? 'aviso' : 'normal'}
      className="flex flex-col gap-[10px] px-[22px] py-5"
      aria-labelledby={`cartao-${cartao.id}`}
      data-cartao={cartao.id}
      data-estado={cartao.estado}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`cartao-${cartao.id}`} className="m-0 text-base font-bold">
          {t.cartao[cartao.id]}
        </h2>
        <Chip cor={COR[cartao.estado]}>{rotulo}</Chip>
      </div>
      <p className={`m-0 text-sm leading-normal ${atencao ? 'text-texto-medio' : 'text-texto-suave'}`}>{texto}</p>
      {origem || acao ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-texto-mudo">{origem}</span>
          {acao}
        </div>
      ) : null}
    </Cartao>
  );
}

export function ServicosDj() {
  const status = useStackStatus();
  const servicoWeb = useAbrirServico();
  const rodando = status.docker.engine && status.servicos.some((s) => s.container === 'running');
  const slskdNoAr = servicoSaudavel(servicoDe(status, 'slskd'));
  // a mesma consulta da tela no Modo Dev: trocar de modo não refaz as verificações
  const assinatura = status.servicos.map((s) => `${s.container}/${s.saude}/${String(s.http)}`).join('|');
  const checks = useQuery<ChecksResultado>({
    queryKey: ['stack', 'checks', assinatura],
    queryFn: () => api.stack.runChecks(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    enabled: rodando,
  });
  const compartilhamento = useCompartilhamento(slskdNoAr);
  const config = useQuery({ queryKey: ['config', 'read', status.projeto.dir], queryFn: () => api.config.read() });
  // o número de faixas só se a Biblioteca já leu (ler o beets aqui seria caro): a consulta não busca, só observa
  const biblioteca = useQuery({
    queryKey: [...CHAVE_BIBLIOTECA, 'leitura', true],
    queryFn: () => api.library.list(),
    enabled: false,
  });
  const agora = useAgora(rodando);

  const resultado = checks.data;
  const lista = resultado?.executado ? resultado.checks : [];
  const r = compartilhamento.data;
  const compartilhados = r === undefined ? undefined : r.ok ? r.compartilhamento.arquivos : null;
  const cartoes = cartoesDeServicoDj(status, lista, compartilhados);
  const atencao = cartoes.filter(precisaAtencao).length;
  const segundos = resultado?.executado ? Math.max(0, Math.round((agora - resultado.verificadoEm) / 1000)) : null;
  const usuario = config.data?.slskUsuario ?? '';
  const faixas = biblioteca.data?.ok ? biblioteca.data.leitura.faixas.length : null;

  const titulo = !rodando
    ? t.titulo.desligado
    : !resultado?.executado
      ? t.titulo.verificando
      : atencao > 0
        ? t.titulo.atencao(atencao)
        : t.titulo.ok;

  function textoDo(c: CartaoServicoDj): ReactNode {
    switch (c.id) {
      case 'slskd':
        if (c.estado !== 'ok' && c.estado !== 'zero') return t.servico(c.id, c.estado);
        return usuario ? (
          <>
            {t.conectadoComo} <strong className="text-texto">{usuario}</strong>.
          </>
        ) : (
          t.conectado
        );
      case 'soulbeet':
        return c.estado === 'ok' || c.estado === 'zero' ? t.soulbeetOk : t.servico(c.id, c.estado);
      case 'navidrome':
        if (c.estado !== 'ok' && c.estado !== 'zero') return t.servico(c.id, c.estado);
        return faixas !== null ? t.playerFaixas(faixas) : t.playerOk;
      case 'compartilhamento':
        if (c.estado === 'zero') return t.compartilhadosZero;
        return typeof compartilhados === 'number' && c.estado === 'ok'
          ? t.compartilhados(compartilhados)
          : t.compartilhadosSemInfo;
      case 'pastas':
        return c.estado === 'ok'
          ? t.pastasTexto.ok
          : c.estado === 'problema'
            ? t.pastasTexto.problema
            : t.pastasTexto.desconhecido;
    }
  }

  function acaoDo(c: CartaoServicoDj): ReactNode {
    switch (c.id) {
      case 'slskd':
      case 'soulbeet':
      case 'navidrome': {
        const id = c.id;
        if (c.estado === 'lento' || c.estado === 'parado' || c.estado === 'problema') {
          return (
            <Botao pequeno onClick={() => seguro(api.stack.restartService(id))}>
              {t.botoes.reiniciar(FUNCAO_DO_SERVICO[id].sujeito)}
            </Botao>
          );
        }
        if (c.estado !== 'ok' || id === 'soulbeet') return null;
        return (
          <Botao variante="fantasma" pequeno onClick={() => servicoWeb.abrir(id)}>
            {id === 'slskd' ? t.botoes.verTransferencias : t.botoes.abrirPlayer}
          </Botao>
        );
      }
      case 'compartilhamento':
        return (
          <Link className={classeBotao('fantasma', true)} to="/configuracoes?secao=compartilhamento">
            {t.botoes.ajustar}
          </Link>
        );
      case 'pastas':
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="servicos-dj">
      <CabecalhoPagina
        rotulo={msg.servicos.rotulo}
        titulo={titulo}
        subtitulo={rodando ? t.subtitulo(segundos, atencao) : t.desligado}
        acoes={
          <Botao variante="primario" disabled={!rodando || checks.isFetching} onClick={() => void checks.refetch()}>
            <IconeRecarregar />
            {msg.acoes.verificarDeNovo}
          </Botao>
        }
      />

      {!rodando ? (
        <Cartao borda="vazio" className="flex flex-col items-start gap-3 p-[22px]">
          <p className="m-0 text-sm leading-normal text-texto-claro">{t.desligado}</p>
          <Link className={classeBotao('primario')} to="/">
            {t.irParaInicio}
          </Link>
        </Cartao>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-3">
          {cartoes.map((c) => (
            <CartaoDj
              key={c.id}
              cartao={c}
              texto={textoDo(c)}
              origem={c.id === 'pastas' ? null : t.origem[c.id]}
              acao={acaoDo(c)}
            />
          ))}
        </div>
      )}
      {rodando && checks.isError ? (
        <ErroDeLeitura causa={checks.error} aoTentarDeNovo={() => void checks.refetch()} />
      ) : null}

      <SaidaParaModoDev />
    </div>
  );
}
