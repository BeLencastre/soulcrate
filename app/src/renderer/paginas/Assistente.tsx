// Assistente de configuração (protótipo "Assistente de configuração", Fase 2): sete passos que geram o .env e o
// slskd.yml, e uma tela final que liga a stack e termina a configuração sozinha. Tela cheia, sem a barra lateral.
// Senhas digitadas ficam só nos campos até a gravação; o main não as devolve.
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  entradaDaConfig,
  type ConfigEntrada,
  type ConfigPublica,
  type ModoPasta,
  type ResultadoPasta,
} from '@shared/configuracao';
import type { AppError } from '@shared/erros';
import { erroInesperado } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { CartaoErro } from '../components/CartaoErro';
import { Logo } from '../components/icones';
import {
  SecaoAjustes,
  SecaoChaves,
  SecaoPastas,
  SecaoSoulseek,
  SecaoWebUi,
  type PropsSecao,
} from '../components/secoes-config';
import { Botao, Rotulo } from '../components/ui';
import { api } from '../lib/api';
import { useStackStatus, useUi } from '../lib/estado';
import { temErro, useValidacao } from '../lib/formulario';
import { PassoPasta } from './assistente/PassoPasta';
import { PassoRevisao } from './assistente/PassoRevisao';
import { TelaFim } from './assistente/TelaFim';

const TOTAL = 7;

/** Campos de cada passo que impedem de avançar quando estão com erro. */
const CAMPOS_DO_PASSO: Record<number, Parameters<typeof temErro>[1]> = {
  2: ['pasta.music', 'pasta.downloads', 'pasta.incomplete'],
  3: ['slskUsuario', 'slskSenha'],
  4: ['webUsuario', 'webSenha'],
  6: ['tz', 'puid', 'pgid', 'musicbrainzContato'],
};

interface PastaPronta {
  dir: string;
  config: ConfigPublica;
  /** o que foi digitado quando a pasta foi preparada, para saber se mudou depois */
  modo: ModoPasta;
  caminho: string;
}

function textoDoPasso1(r: ResultadoPasta): string | null {
  if (r.copiados > 0) return msg.assistente.pasta.copiados(r.copiados);
  if (r.jaExistia) return msg.assistente.pasta.jaExistia;
  return null;
}

export function Assistente() {
  const navegar = useNavigate();
  const status = useStackStatus();
  const definirSetup = useUi((s) => s.definirSetup);
  const qc = useQueryClient();

  const [passo, setPasso] = useState(1);
  const [alcancado, setAlcancado] = useState(1);
  const [fim, setFim] = useState(false);

  // ponto de partida: a pasta que o app já usa (existente) ou a padrão, %USERPROFILE%Soulcrate (nova); o que o
  // usuário escolher ou digitar vale a partir daí
  const padrao = useQuery({
    queryKey: ['setup', 'pasta-padrao'],
    queryFn: () => api.setup.defaultFolder(),
    staleTime: Infinity,
  });
  const [modoEscolhido, setModoEscolhido] = useState<ModoPasta | null>(null);
  const [caminhoDigitado, setCaminhoDigitado] = useState<string | null>(null);
  const modo: ModoPasta = modoEscolhido ?? (status.projeto.dir ? 'existente' : 'nova');
  const caminho = caminhoDigitado ?? status.projeto.dir ?? padrao.data ?? '';
  const setModo = setModoEscolhido;
  const setCaminho = setCaminhoDigitado;
  const [preparando, setPreparando] = useState(false);
  const [erroPasta, setErroPasta] = useState<string | null>(null);
  const [falhaPasta, setFalhaPasta] = useState<AppError | null>(null);
  const [avisoPasta, setAvisoPasta] = useState<string | null>(null);
  const [pronta, setPronta] = useState<PastaPronta | null>(null);

  const [entrada, setEntrada] = useState<ConfigEntrada | null>(null);
  const [gravando, setGravando] = useState(false);
  /** passos em que o usuário já tentou avançar com erro: aí os erros dos campos aparecem */
  const [tentou, setTentou] = useState<ReadonlySet<number>>(new Set());
  const [erroGravar, setErroGravar] = useState<AppError | null>(null);

  const { validacao, validarAgora } = useValidacao(entrada, pronta !== null && !fim);

  const mudar = (parcial: Partial<ConfigEntrada>) => setEntrada((e) => (e ? { ...e, ...parcial } : e));

  async function prepararPasta(): Promise<boolean> {
    if (pronta && pronta.modo === modo && pronta.caminho === caminho.trim()) return true;
    setPreparando(true);
    setErroPasta(null);
    setFalhaPasta(null);
    setAvisoPasta(null);
    try {
      const r = await api.setup.prepareFolder({ modo, caminho });
      if (!r.ok || !r.dir || !r.config) {
        setErroPasta(r.erro);
        setFalhaPasta(r.falha);
        return false;
      }
      // trocar de pasta recomeça o formulário; repetir o passo 1 com a mesma pasta mantém o que já foi digitado
      if (!pronta || pronta.dir !== r.dir) setEntrada(entradaDaConfig(r.config));
      setPronta({ dir: r.dir, config: r.config, modo, caminho: caminho.trim() });
      setAvisoPasta(textoDoPasso1(r));
      return true;
    } catch (e) {
      setFalhaPasta(erroInesperado(e));
      return false;
    } finally {
      setPreparando(false);
    }
  }

  async function gravar() {
    if (!entrada) return;
    setGravando(true);
    setErroGravar(null);
    try {
      const r = await api.config.write(entrada);
      if (!r.ok) {
        setErroGravar(r.erro);
        return;
      }
      // as Configurações leem de novo o que acabou de ser gravado
      await qc.invalidateQueries({ queryKey: ['config', 'read'] });
      const backups = r.backups.join(' · ');
      const inicial = await api.setup.start({ modo: 'ligar', detalheGravacao: backups ? `backup ${backups}` : null });
      definirSetup(inicial);
      setFim(true);
    } catch (e) {
      setErroGravar(erroInesperado(e));
    } finally {
      setGravando(false);
    }
  }

  const ocupado = preparando || gravando;

  /** o passo tem erros que impedem de seguir? (passo 1: só o caminho vazio; os demais, a validação do main) */
  async function passoComErro(): Promise<boolean> {
    if (passo === 1) return caminho.trim() === '';
    const campos = CAMPOS_DO_PASSO[passo];
    if (!campos && passo !== 7) return false;
    const v = await validarAgora();
    if (!v) return true;
    return passo === 7 ? !v.ok : temErro(v, campos ?? []);
  }

  async function avancar(e?: FormEvent) {
    e?.preventDefault();
    if (ocupado) return;
    if (await passoComErro()) {
      // o botão não fica cinza sem explicação: clicar revela o que falta
      setTentou((s) => new Set(s).add(passo));
      return;
    }
    if (passo === 1 && !(await prepararPasta())) return;
    if (passo === TOTAL) return void gravar();
    const proximo = passo + 1;
    setPasso(proximo);
    setAlcancado((a) => Math.max(a, proximo));
  }

  const secao: PropsSecao | null =
    entrada && pronta
      ? {
          entrada,
          aoMudar: mudar,
          config: pronta.config,
          validacao,
          // numa pasta que já tinha configuração, o que falta aparece de cara; numa nova, só depois de tentar avançar
          mostrarErros: tentou.has(passo) || pronta.config.envExiste,
        }
      : null;

  const titulos: Record<number, { titulo: string; subtitulo: string; opcional?: boolean }> = {
    1: { titulo: msg.assistente.pasta.titulo, subtitulo: msg.assistente.pasta.subtitulo },
    2: { titulo: msg.assistente.pastas.titulo, subtitulo: msg.assistente.pastas.subtitulo },
    3: { titulo: msg.assistente.soulseek.titulo, subtitulo: msg.assistente.soulseek.subtitulo },
    4: { titulo: msg.assistente.webui.titulo, subtitulo: msg.assistente.webui.subtitulo },
    5: { titulo: msg.assistente.chaves.titulo, subtitulo: msg.assistente.chaves.subtitulo },
    6: { titulo: msg.assistente.ajustes.titulo, subtitulo: msg.assistente.ajustes.subtitulo, opcional: true },
    7: {
      titulo: msg.assistente.revisao.titulo,
      subtitulo:
        pronta?.config.envExiste || pronta?.config.ymlExiste
          ? msg.assistente.revisao.subtituloExistente
          : msg.assistente.revisao.subtituloNovo,
    },
  };
  const atual = titulos[passo] ?? { titulo: '', subtitulo: '' };

  return (
    <div className="flex h-full min-h-0 flex-col bg-fundo text-texto" data-testid="assistente">
      <header className="flex shrink-0 items-center gap-[14px] border-b border-borda-fraca bg-painel px-8 py-[18px]">
        <Logo />
        <span className="text-base font-extrabold tracking-[0.06em]" style={{ fontStretch: '125%' }}>
          SOULCRATE
        </span>
        <span className="text-texto-apagado" aria-hidden="true">
          /
        </span>
        <span className="text-[15px] font-semibold text-texto-claro">{msg.assistente.titulo}</span>
        <Botao variante="fantasma" pequeno className="ml-auto" onClick={() => navegar('/')}>
          {msg.assistente.sair}
        </Botao>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={msg.assistente.passosAria}
          className="flex w-[260px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-borda-fraca px-4 py-7"
        >
          {msg.assistente.passos.map((nome, i) => {
            const n = i + 1;
            const feito = fim || n < passo;
            const aqui = !fim && n === passo;
            return (
              <button
                key={nome}
                type="button"
                className="passo"
                aria-current={aqui ? 'step' : undefined}
                disabled={n > alcancado || fim}
                onClick={() => setPasso(n)}
                data-passo={n}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-[26px] items-center justify-center rounded-[5px] font-mono text-xs font-bold"
                  style={{
                    background: aqui ? '#F2B53A' : feito ? '#13291F' : '#24272C',
                    color: aqui ? '#1A1204' : feito ? '#5BD49A' : '#A3A7AE',
                  }}
                >
                  {feito ? '✓' : n}
                </span>
                <span className="font-semibold">{nome}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          {fim ? (
            <div className="flex-1 overflow-y-auto px-12 py-10">
              <div className="max-w-[880px]">
                <TelaFim />
              </div>
            </div>
          ) : (
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void avancar(e)} noValidate>
              <div className="flex-1 overflow-y-auto px-12 py-10">
                <div className="flex max-w-[880px] flex-col gap-7">
                  <div className="flex flex-col gap-[10px]">
                    <Rotulo>{msg.assistente.rotuloPasso(passo, TOTAL, atual.opcional)}</Rotulo>
                    <h1 className="m-0 text-[32px] leading-tight font-extrabold" style={{ fontStretch: '112%' }}>
                      {atual.titulo}
                    </h1>
                    <p className="m-0 text-[15px] leading-[1.55] text-texto-suave">{atual.subtitulo}</p>
                  </div>

                  {passo === 1 ? (
                    <PassoPasta
                      modo={modo}
                      aoMudarModo={(m) => {
                        setModo(m);
                        setErroPasta(null);
                      }}
                      caminho={caminho}
                      aoMudarCaminho={(c) => {
                        setCaminho(c);
                        setErroPasta(null);
                      }}
                      erro={erroPasta}
                      falha={falhaPasta}
                      aviso={avisoPasta}
                    />
                  ) : null}
                  {passo === 2 && secao ? <SecaoPastas {...secao} comDicaDeDisco /> : null}
                  {passo === 3 && secao ? <SecaoSoulseek {...secao} /> : null}
                  {passo === 4 && secao ? <SecaoWebUi {...secao} /> : null}
                  {passo === 5 && secao ? <SecaoChaves {...secao} /> : null}
                  {passo === 6 && secao ? <SecaoAjustes {...secao} /> : null}
                  {passo === 7 && secao && pronta && entrada ? (
                    <PassoRevisao dir={pronta.dir} config={pronta.config} entrada={entrada} validacao={validacao} />
                  ) : null}
                  {erroGravar && passo === 7 ? (
                    <CartaoErro erro={erroGravar} aoTentarDeNovo={() => void gravar()} />
                  ) : null}
                </div>
              </div>

              <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-borda-fraca bg-painel px-12 py-[18px]">
                <div
                  role="img"
                  aria-label={msg.assistente.barraAria(passo, TOTAL)}
                  className="grid grid-cols-[repeat(7,28px)] gap-1"
                >
                  {Array.from({ length: TOTAL }, (_, i) => (
                    <span
                      key={i}
                      className="h-[6px] rounded-[2px]"
                      style={{ background: i + 1 < passo ? '#47C58A' : i + 1 === passo ? '#F2B53A' : '#2A2E34' }}
                    />
                  ))}
                </div>
                <span className="font-mono text-xs text-texto-mudo">
                  {passo}/{TOTAL}
                </span>
                <div className="ml-auto flex gap-2">
                  <Botao variante="fantasma" disabled={passo === 1} onClick={() => setPasso((p) => Math.max(1, p - 1))}>
                    {msg.assistente.voltar}
                  </Botao>
                  <Botao type="submit" variante="primario" disabled={ocupado} data-testid="avancar">
                    {passo === TOTAL
                      ? gravando
                        ? msg.assistente.gravando
                        : msg.assistente.gravar
                      : passo === 1 && preparando
                        ? msg.assistente.preparando
                        : msg.assistente.avancar}
                  </Botao>
                </div>
              </footer>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
