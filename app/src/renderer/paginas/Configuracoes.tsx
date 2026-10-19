// Tela Configurações (protótipo "Configurações", Fase 2): reaproveita as seções do assistente para editar depois.
// As mudanças ficam num rascunho até gravar; "Aplicar e reiniciar" grava, recria os contêineres e refaz a
// pós-configuração (o Soulbeet recebe a API key nova sozinho). Senhas nunca voltam do main.
// No Modo DJ só ficam as seções "Suas coisas" (Pastas, Conta Soulseek, Compartilhamento) e as do app; uma seção que
// o modo não tem, pedida pelo endereço, cai na equivalente ou na inicial.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import {
  entradaDaConfig,
  type ConfigEntrada,
  type EstadoChaveSlskd,
  type ResultadoGravacao,
} from '@shared/configuracao';
import { erroInesperado, type AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { msgDj } from '@shared/mensagens-dj';
import { ehSecaoConfig, secaoNoModo, SECOES_DO_MODO, type SecaoConfig } from '@shared/modo';
import { servicoDe, servicoSaudavel, type AchadoConfig } from '@shared/stack';
import { CartaoErro } from '../components/CartaoErro';
import { ErroDeLeitura } from '../components/estados';
import { ListaTarefas } from '../components/ListaTarefas';
import { SecaoAplicativo, SecaoSobre } from '../components/configuracoes/secoes-app';
import {
  CartaoChave,
  SecaoAjustes,
  SecaoCompartilhamento,
  SecaoPastas,
  SecaoRede,
  SecaoSoulseek,
  SecaoWebUi,
  type PropsSecao,
} from '../components/configuracoes/secoes-config';
import { Botao, CabecalhoPagina, Cartao, Chip, Rotulo } from '../components/ui';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { useStackStatus, useUi } from '../lib/estado';
import { useValidacao } from '../lib/formulario';
import { useModo } from '../lib/modo';

/** Seções que não precisam da configuração lida para aparecer. */
const SECOES_SEM_CONFIG: readonly SecaoConfig[] = ['conferencia', 'app', 'sobre'];

const CHAVE_CONFIG = ['config', 'read'] as const;

function LinhaAchado({ a }: { a: AchadoConfig }) {
  return (
    <li className="flex items-start gap-3 border-t border-linha py-[10px] text-[13px]" data-achado={a.id}>
      <Chip cor={a.nivel === 'erro' ? 'vermelho' : 'laranja'}>
        {a.nivel === 'erro' ? msg.configuracoes.erro : msg.configuracoes.aviso}
      </Chip>
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="leading-normal text-texto-claro">{a.mensagem}</span>
        <span className="font-mono text-xs text-texto-mudo">
          {a.arquivo}
          {a.variavel ? ` · ${a.variavel}` : ''}
        </span>
      </div>
    </li>
  );
}

const COR_CHAVE: Record<EstadoChaveSlskd, 'verde' | 'laranja' | 'vermelho'> = {
  ok: 'verde',
  ausente: 'laranja',
  exemplo: 'laranja',
  diferentes: 'vermelho',
};

export function Configuracoes() {
  const status = useStackStatus();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const definirSetup = useUi((s) => s.definirSetup);
  const setup = useUi((s) => s.setup);
  const operacao = useUi((s) => s.operacao);

  const dir = status.projeto.dir;
  const config = useQuery({
    queryKey: [...CHAVE_CONFIG, dir],
    queryFn: () => api.config.read(),
  });
  const configStatus = status.configuracao;

  // a seção aberta fica na URL (`?secao=sobre`): o menu Ajuda e a bandeja levam direto a ela, e o voltar funciona
  const modo = useModo();
  const dj = modo === 'dj';
  const secoes = SECOES_DO_MODO[modo];
  const [params, setParams] = useSearchParams();
  const doEndereco = params.get('secao');
  const pedida = ehSecaoConfig(doEndereco) ? doEndereco : null;
  const secao = pedida ? secaoNoModo(pedida, modo) : null;
  const setSecao = (s: SecaoConfig) => setParams({ secao: s }, { replace: true });
  const secaoAtual: SecaoConfig =
    secao ?? (dj || (configStatus.estado === 'valida' && configStatus.avisos === 0) ? 'pastas' : 'conferencia');

  // trocou de modo com uma seção que o novo modo não tem: o endereço acompanha a seção que ficou aberta
  useEffect(() => {
    if (pedida && secao !== pedida) setParams(secao ? { secao } : {}, { replace: true });
  }, [pedida, secao, setParams]);

  const [edicao, setEdicao] = useState<Partial<ConfigEntrada>>({});
  const base = useMemo(() => (config.data ? entradaDaConfig(config.data) : null), [config.data]);
  const entrada = useMemo(() => (base ? { ...base, ...edicao } : null), [base, edicao]);
  const modificado =
    base !== null &&
    Object.keys(edicao).some(
      (k) => JSON.stringify(edicao[k as keyof ConfigEntrada]) !== JSON.stringify(base[k as keyof ConfigEntrada]),
    );

  const { validacao } = useValidacao(entrada, entrada !== null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<AppError | null>(null);
  const [gravado, setGravado] = useState<ResultadoGravacao | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [erroPasta, setErroPasta] = useState<string | null>(null);

  const noAr = status.servicos.some((s) => s.container === 'running');
  const slskdNoAr = servicoSaudavel(servicoDe(status, 'slskd'));
  const invalido = validacao !== null && !validacao.ok;
  const mudar = (parcial: Partial<ConfigEntrada>) => {
    setGravado(null);
    setEdicao((e) => ({ ...e, ...parcial }));
  };

  async function gravar(reiniciar: boolean) {
    if (!entrada) return;
    setGravando(true);
    setErro(null);
    setGravado(null);
    try {
      const r = await api.config.write(entrada);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setEdicao({});
      await qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
      if (reiniciar) {
        const backups = r.backups.join(' · ');
        definirSetup(await api.setup.start({ modo: 'recriar', detalheGravacao: backups ? `backup ${backups}` : null }));
        setAplicando(true);
      } else {
        setGravado(r);
      }
    } catch (e) {
      setErro(erroInesperado(e));
    } finally {
      setGravando(false);
    }
  }

  async function escolherOutraPasta() {
    setErroPasta(null);
    try {
      const r = await api.project.pickFolder();
      if (r?.erro) setErroPasta(r.erro);
      else if (r) {
        setEdicao({});
        await qc.invalidateQueries({ queryKey: CHAVE_CONFIG });
      }
    } catch (e) {
      console.error('project.pickFolder falhou:', e);
    }
  }

  const ultimaLinha = operacao && !operacao.terminou ? (operacao.linhas.at(-1)?.texto ?? null) : null;

  // ------------------------------------------------------------ seções

  if (!dir) {
    return (
      <div className="flex flex-col gap-7">
        <CabecalhoPagina
          rotulo={msg.configuracoes.rotulo}
          titulo={msg.configuracoes.titulo}
          subtitulo={dj ? msgDj.configuracoes.subtitulo : msg.configuracoes.subtitulo}
        />
        <Cartao borda="vazio" className="flex flex-col gap-3 p-6" data-testid="sem-pasta">
          <h2 className="m-0 text-lg font-extrabold">{msg.configuracoes.sempastaTitulo}</h2>
          <p className="m-0 text-sm leading-normal text-texto-claro">{msg.configuracoes.sempastaCorpo}</p>
          <Botao variante="primario" className="self-start" onClick={() => navegar('/assistente')}>
            {msg.configuracoes.abrirAssistente}
          </Botao>
        </Cartao>
        <section aria-label={msg.configuracoes.secoes.app} className="flex max-w-[760px] flex-col gap-6">
          <h2 className="m-0 text-[22px] font-extrabold">{msg.configuracoes.secoes.app}</h2>
          <SecaoAplicativo />
        </section>
        <section aria-label={msg.configuracoes.secoes.sobre} className="flex max-w-[760px] flex-col gap-6">
          <h2 className="m-0 text-[22px] font-extrabold">{msg.configuracoes.secoes.sobre}</h2>
          <SecaoSobre />
        </section>
      </div>
    );
  }

  const propsSecao: PropsSecao | null =
    entrada && config.data ? { entrada, aoMudar: mudar, config: config.data, validacao } : null;

  const chaveSlskd = config.data?.chaveSlskd ?? 'ok';
  const trocarChave = entrada?.regenerarChaves === true;

  const conteudo = (() => {
    switch (secaoAtual) {
      case 'conferencia':
        return (
          <Cartao como="section" className="flex flex-col gap-3 p-5" aria-label={msg.configuracoes.conferencia}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Rotulo>{msg.configuracoes.conferencia}</Rotulo>
              {configStatus.estado === 'valida' ? (
                <Chip cor={configStatus.avisos > 0 ? 'laranja' : 'verde'}>
                  {configStatus.avisos > 0 ? msg.configuracoes.estado.avisos : msg.configuracoes.estado.valida}
                </Chip>
              ) : configStatus.estado === 'invalida' ? (
                <Chip cor="vermelho">{msg.configuracoes.estado.invalida}</Chip>
              ) : null}
            </div>
            {configStatus.achados.length === 0 ? (
              <p className="m-0 text-sm leading-normal text-texto-claro">{msg.configuracoes.tudoCerto}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {configStatus.achados.map((a, i) => (
                  <LinhaAchado key={`${a.id}-${a.variavel ?? ''}-${i}`} a={a} />
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {configStatus.estado === 'invalida' ? (
                <Botao variante="primario" pequeno onClick={() => navegar('/assistente')}>
                  {msg.configuracoes.abrirAssistente}
                </Botao>
              ) : null}
              <Botao pequeno onClick={() => seguro(api.config.check())}>
                {msg.configuracoes.conferirDeNovo}
              </Botao>
              <Botao variante="fantasma" pequeno onClick={() => seguro(api.project.openFile('.env'))}>
                {msg.configuracoes.abrirEnv}
              </Botao>
              <Botao variante="fantasma" pequeno onClick={() => seguro(api.project.openFile('slskd/slskd.yml'))}>
                {msg.configuracoes.abrirYml}
              </Botao>
              {configStatus.estado !== 'invalida' ? (
                <Botao variante="fantasma" pequeno onClick={() => navegar('/assistente')}>
                  {msg.configuracoes.refazerAssistente}
                </Botao>
              ) : null}
            </div>
          </Cartao>
        );
      case 'pastas':
        return (
          <div className="flex flex-col gap-[22px]">
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-2">
                <div className="fl min-w-0 flex-1">
                  <label htmlFor="pasta-do-soulcrate">{msg.configuracoes.pasta}</label>
                  <input
                    id="pasta-do-soulcrate"
                    className="inp font-mono"
                    readOnly
                    value={dir}
                    data-testid="pasta-do-projeto"
                  />
                </div>
                <Botao onClick={() => seguro(api.project.openFolder())}>{msg.configuracoes.abrirNoExplorer}</Botao>
                <Botao onClick={() => seguro(escolherOutraPasta())}>{msg.configuracoes.outraPasta}</Botao>
              </div>
              {status.projeto.origem ? (
                <p className="hint m-0">{msg.configuracoes.pastaOrigem[status.projeto.origem]}</p>
              ) : null}
              {erroPasta ? (
                <p role="alert" className="m-0 text-[13px] text-chip-vermelho">
                  {erroPasta}
                </p>
              ) : null}
            </div>
            {propsSecao ? <SecaoPastas {...propsSecao} /> : null}
          </div>
        );
      case 'soulseek':
        return (
          <div className="flex flex-col gap-[22px]">
            {propsSecao ? <SecaoSoulseek {...propsSecao} /> : null}
            <p className="hint m-0">{msg.configuracoes.senhaNuncaMostrada}</p>
          </div>
        );
      case 'webui':
        return (
          <div className="flex flex-col gap-[22px]">
            {propsSecao ? <SecaoWebUi {...propsSecao} /> : null}
            <div className="flex flex-col gap-3">
              <CartaoChave
                titulo={msg.configuracoes.chaveNoEnvEYml}
                onde="SLSKD_API_KEY_SOULBEET"
                chip={
                  trocarChave
                    ? { cor: 'laranja', texto: msg.assistente.chaves.seraTrocada }
                    : { cor: COR_CHAVE[chaveSlskd], texto: msg.configuracoes.chaveProblema[chaveSlskd] }
                }
              />
              <Botao
                pequeno
                className="self-start"
                disabled={!noAr && !trocarChave}
                onClick={() => mudar({ regenerarChaves: !trocarChave })}
              >
                {trocarChave ? msg.configuracoes.cancelarTroca : msg.configuracoes.gerarNovaChave}
              </Botao>
              {!noAr && !trocarChave ? <p className="hint m-0">{msg.configuracoes.chaveSoLigada}</p> : null}
              {trocarChave ? <p className="hint m-0">{msg.assistente.chaves.aviso}</p> : null}
            </div>
          </div>
        );
      case 'rede':
        return entrada ? <SecaoRede entrada={entrada} aoMudar={mudar} /> : null;
      case 'compartilhamento':
        return entrada ? <SecaoCompartilhamento entrada={entrada} aoMudar={mudar} slskdNoAr={slskdNoAr} /> : null;
      case 'avancado':
        return propsSecao ? <SecaoAjustes {...propsSecao} /> : null;
      case 'app':
        return <SecaoAplicativo />;
      case 'sobre':
        return <SecaoSobre />;
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        rotulo={msg.configuracoes.rotulo}
        titulo={msg.configuracoes.titulo}
        subtitulo={dj ? msgDj.configuracoes.subtitulo : msg.configuracoes.subtitulo}
      />

      {dj && configStatus.estado === 'invalida' ? (
        <Cartao
          borda="erro"
          role="alert"
          className="flex flex-wrap items-center gap-3 px-[18px] py-[14px]"
          data-testid="configuracao-incompleta"
        >
          <span className="flex min-w-[260px] flex-1 flex-col gap-[2px]">
            <span className="font-bold">{msgDj.configuracoes.incompleta.titulo}</span>
            <span className="text-[13px] text-texto-claro">{msgDj.configuracoes.incompleta.corpo}</span>
          </span>
          <Botao variante="primario" pequeno onClick={() => navegar('/assistente')}>
            {msg.configuracoes.abrirAssistente}
          </Botao>
        </Cartao>
      ) : null}

      {aplicando && setup ? (
        <Cartao borda="azul" className="flex flex-col gap-4 p-5" data-testid="painel-aplicar">
          <div className="flex items-center justify-between gap-3">
            <Rotulo>{dj ? msgDj.configuracoes.reiniciando : msg.configuracoes.gravado.reiniciando}</Rotulo>
            {setup.terminou ? (
              <Botao variante="fantasma" pequeno onClick={() => setAplicando(false)}>
                {msg.acoes.dispensar}
              </Botao>
            ) : null}
          </div>
          <ListaTarefas
            estado={setup}
            ultimaLinha={ultimaLinha}
            aoTentarDeNovo={() => seguro(api.setup.retry())}
            aoInformarLogin={(login) => seguro(api.setup.provideNavidromeLogin(login))}
          />
        </Cartao>
      ) : null}

      {modificado ? (
        <div
          role="status"
          data-testid="alteracoes-pendentes"
          className="flex flex-wrap items-center gap-[14px] rounded-lg border border-ambar-borda bg-ambar-fundo px-[18px] py-[14px]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-ambar)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3 2 20h20z" />
            <path d="M12 10v4" />
            <path d="M12 17h.01" />
          </svg>
          <span className="flex min-w-[260px] flex-1 flex-col gap-[2px]">
            <span className="font-bold">{msg.configuracoes.pendente.titulo}</span>
            <span className="text-[13px] text-aviso-texto">
              {invalido
                ? msg.configuracoes.pendente.invalida
                : noAr
                  ? (dj ? msgDj.configuracoes.pendente : msg.configuracoes.pendente).corpoNoAr
                  : (dj ? msgDj.configuracoes.pendente : msg.configuracoes.pendente).corpoDesligada}
            </span>
          </span>
          <Botao variante="fantasma" onClick={() => setEdicao({})} disabled={gravando}>
            {msg.configuracoes.pendente.descartar}
          </Botao>
          <Botao
            variante="primario"
            disabled={gravando || invalido || validacao === null}
            onClick={() => void gravar(noAr)}
          >
            {gravando
              ? msg.configuracoes.pendente.salvando
              : noAr
                ? msg.configuracoes.pendente.aplicar
                : msg.configuracoes.pendente.salvar}
          </Botao>
        </div>
      ) : null}

      {gravado ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-borda bg-cartao px-4 py-3"
          data-testid="gravado"
        >
          <Chip cor="verde">{msg.configuracoes.gravado.titulo}</Chip>
          {gravado.backups.length > 0 ? (
            <span className="font-mono text-xs text-texto-mudo">
              {msg.configuracoes.gravado.backup(gravado.backups.join(' · '))}
            </span>
          ) : null}
        </div>
      ) : null}
      {erro ? <CartaoErro erro={erro} aoFechar={() => setErro(null)} aoTentarDeNovo={() => void gravar(noAr)} /> : null}

      <div className="flex flex-wrap items-start gap-8">
        <nav
          aria-label={msg.configuracoes.secoes.aria}
          className="flex max-w-[240px] min-w-[200px] flex-1 flex-col gap-[2px]"
        >
          <span className="lbl px-3 pb-2">
            {dj ? msgDj.configuracoes.grupoSuasCoisas : msg.configuracoes.secoes.grupoStack}
          </span>
          {secoes.stack.map((s) => (
            <button
              key={s}
              type="button"
              className="sub"
              aria-current={s === secaoAtual ? 'page' : undefined}
              onClick={() => setSecao(s)}
            >
              {msg.configuracoes.secoes[s]}
            </button>
          ))}
          <span className="lbl px-3 pt-5 pb-2">{msg.configuracoes.secoes.grupoApp}</span>
          {secoes.app.map((s) => (
            <button
              key={s}
              type="button"
              className="sub"
              aria-current={s === secaoAtual ? 'page' : undefined}
              onClick={() => setSecao(s)}
            >
              {msg.configuracoes.secoes[s]}
            </button>
          ))}
        </nav>

        <section
          className="flex min-w-0 max-w-[760px] flex-[999_1_480px] flex-col gap-6"
          aria-label={msg.configuracoes.secoes[secaoAtual]}
        >
          <h2 className="m-0 text-[22px] font-extrabold">{msg.configuracoes.secoes[secaoAtual]}</h2>
          {config.isLoading && !SECOES_SEM_CONFIG.includes(secaoAtual) ? (
            <p role="status" className="hint m-0">
              {msg.configuracoes.carregando}
            </p>
          ) : config.isError && !SECOES_SEM_CONFIG.includes(secaoAtual) ? (
            <ErroDeLeitura causa={config.error} aoTentarDeNovo={() => void config.refetch()} />
          ) : (
            conteudo
          )}
        </section>
      </div>
    </div>
  );
}
