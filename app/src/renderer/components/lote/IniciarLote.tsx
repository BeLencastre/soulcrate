// "Iniciar lote" (§5, Fase 3): confere a stack antes e oferece ligá-la. Se o slskd já responde, inicia na hora; se não,
// pergunta e, ao ligar, espera os serviços ficarem saudáveis e começa sozinho. Salva a lista antes de iniciar.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router';
import { criarErro, erroInesperado, type AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { acoesDisponiveis, resumirStack, servicoDe, servicoSaudavel } from '@shared/stack';
import { api } from '../../lib/api';
import { useStackStatus, useUi } from '../../lib/estado';
import { useExecucao, useRascunho } from '../../lib/lote-store';
import { Botao } from '../ui';

type Fase = 'ocioso' | 'perguntando' | 'ligando' | 'iniciando';

/** Quanto esperar a stack ficar saudável depois de ligá-la (o primeiro build leva de 5 a 10 minutos). */
export const ESPERA_MAXIMA_MS = 12 * 60_000;
const INTERVALO_ESPERA_MS = 1000;

export interface SinalDeCancelamento {
  cancelado: boolean;
}

/**
 * Espera o slskd responder. Devolve `'ok'`, o erro da operação de ligar (se foi este pedido que falhou) ou `'tempo'`.
 * Não depende de efeitos do React: consulta o estado que o main mantém (`stack.status`) e a operação em curso.
 */
export async function esperarSlskd(
  sinal: SinalDeCancelamento,
  idOperacao: string | null,
  opcoes: { maximoMs?: number; intervaloMs?: number } = {},
): Promise<'ok' | 'tempo' | AppError> {
  const fim = Date.now() + (opcoes.maximoMs ?? ESPERA_MAXIMA_MS);
  while (!sinal.cancelado && Date.now() < fim) {
    const op = useUi.getState().operacao;
    if (idOperacao && op?.id === idOperacao && op.terminou && op.erro) return op.erro;
    if (servicoSaudavel(servicoDe(await api.stack.status(), 'slskd'))) return 'ok';
    await new Promise((r) => setTimeout(r, opcoes.intervaloMs ?? INTERVALO_ESPERA_MS));
  }
  return 'tempo';
}

export interface IniciarLote {
  iniciar(): void;
  /** salvando a lista, ligando a stack ou iniciando o lote: o botão fica desabilitado */
  ocupado: boolean;
  dialogo: ReactNode;
  erro: AppError | null;
  limparErro(): void;
}

export function useIniciarLote(): IniciarLote {
  const navegar = useNavigate();
  const status = useStackStatus();
  const [fase, setFase] = useState<Fase>('ocioso');
  const [erro, setErro] = useState<AppError | null>(null);
  const espera = useRef<SinalDeCancelamento | null>(null);

  const slskdNoAr = servicoSaudavel(servicoDe(status, 'slskd'));
  const resumo = resumirStack(status);
  const acoes = acoesDisponiveis(status);

  // sair da tela no meio da espera cancela o início
  useEffect(
    () => () => {
      if (espera.current) espera.current.cancelado = true;
    },
    [],
  );

  async function comecar() {
    setFase('iniciando');
    setErro(null);
    try {
      const { lista, opcoes, salvar } = useRascunho.getState();
      if (!lista) return setFase('ocioso');
      // a lista vai para o arquivo antes: o script lê o arquivo, não o editor
      if (!(await salvar())) return setFase('ocioso');
      const r = await api.batch.start({ lista: lista.nome, opcoes });
      if (!r.ok) {
        setErro(r.erro);
        return setFase('ocioso');
      }
      await useExecucao.getState().anexar(r.runId);
      setFase('ocioso');
      navegar('/lista/execucao');
    } catch (e) {
      setErro(erroInesperado(e));
      setFase('ocioso');
    }
  }

  async function esperarEComecar(idOperacao: string | null) {
    const sinal: SinalDeCancelamento = { cancelado: false };
    espera.current = sinal;
    setFase('ligando');
    const r = await esperarSlskd(sinal, idOperacao);
    if (sinal.cancelado) return;
    if (r === 'ok') return void comecar();
    setErro(
      r === 'tempo'
        ? criarErro('servico.inacessivel', { servico: 'slskd', detalhes: msg.lote.antesDeIniciar.demorou })
        : r,
    );
    setFase('ocioso');
  }

  function iniciar() {
    setErro(null);
    if (slskdNoAr) return void comecar();
    // alguém já está ligando a stack (este app ou o Docker subindo os serviços): é só esperar
    if (resumo.motivo === 'operacao' || resumo.motivo === 'iniciando') return void esperarEComecar(null);
    setFase('perguntando');
  }

  async function ligarEComecar() {
    setFase('ligando');
    try {
      const op = await api.stack.up();
      await esperarEComecar(op.id);
    } catch (e) {
      setErro(erroInesperado(e));
      setFase('ocioso');
    }
  }

  function cancelar() {
    if (espera.current) espera.current.cancelado = true;
    setFase('ocioso');
  }

  const t = msg.lote.antesDeIniciar;
  const aberto = fase === 'perguntando' || fase === 'ligando';

  const dialogo = (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o ? undefined : cancelar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[10px] border border-borda-forte bg-[#17191c] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-iniciar"
        >
          {fase === 'ligando' ? (
            <>
              <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
                {t.ligandoTitulo}
              </Dialog.Title>
              <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
                {t.ligandoCorpo}
              </Dialog.Description>
              <div className="flex justify-end">
                <Botao onClick={cancelar}>{t.cancelar}</Botao>
              </div>
            </>
          ) : acoes.ligar ? (
            <>
              <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
                {t.semStackTitulo}
              </Dialog.Title>
              <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
                {t.semStackCorpo}
              </Dialog.Description>
              <div className="flex flex-wrap justify-end gap-2">
                <Botao onClick={cancelar}>{t.cancelar}</Botao>
                <Botao variante="primario" onClick={() => void ligarEComecar()}>
                  {t.ligarEComecar}
                </Botao>
              </div>
            </>
          ) : (
            <>
              <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
                {t.naoDaTitulo}
              </Dialog.Title>
              <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
                {t.naoDaCorpo(msg.barraLateral.resumo(resumo))}
              </Dialog.Description>
              <div className="flex flex-wrap justify-end gap-2">
                <Botao onClick={cancelar}>{t.cancelar}</Botao>
                <Botao
                  variante="primario"
                  onClick={() => {
                    cancelar();
                    navegar('/');
                  }}
                >
                  {t.irParaInicio}
                </Botao>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return { iniciar, ocupado: fase !== 'ocioso', dialogo, erro, limparErro: () => setErro(null) };
}
