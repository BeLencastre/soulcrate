// "Remover da biblioteca e do disco" (protótipo "Remover faixa (confirmação)", §5 da Fase 5): o filtro do beets, a lista
// do que ele pega (o mesmo `ls` que antecede o `remove -d`), o aviso de que não há Lixeira e a confirmação explícita.
// Nada é apagado sem a pré-visualização: o botão só liga com o token da prévia deste filtro e com o "conferi".
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router';
import {
  FAIXAS_NA_PREVIA,
  filtroDaFaixa,
  REMOCAO_EM_MASSA,
  type FaixaDaBiblioteca,
  type RemocaoFeita,
  type ResultadoPreviaRemocao,
} from '@shared/biblioteca';
import { erroInesperado, type AppError } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { api } from '../../lib/api';
import { useRascunho } from '../../lib/lote-store';
import { Botao, Chip, Rotulo } from '../ui';

const ESPERA_DIGITACAO_MS = 400;

function Aviso({ erro }: { erro: AppError }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-erro-borda bg-chip-vermelho-fundo px-[14px] py-3"
      data-codigo-erro={erro.codigo}
    >
      <span className="text-sm font-bold">{erro.titulo}</span>
      <span className="text-[13.5px] leading-normal text-[#f2c9c9]">{erro.mensagem}</span>
    </div>
  );
}

function Conteudo({
  faixa,
  totalNaBiblioteca,
  aoFechar,
  aoRemover,
}: {
  faixa: FaixaDaBiblioteca;
  totalNaBiblioteca: number;
  aoFechar(): void;
  /** a tabela relê a biblioteca */
  aoRemover(): void;
}) {
  const t = msg.biblioteca.remover;
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState(() => filtroDaFaixa(faixa));
  const [previa, setPrevia] = useState<{ filtro: string; resultado: ResultadoPreviaRemocao } | null>(null);
  // a confirmação vale para uma prévia só: mudar o filtro (outro token) a desfaz sem precisar de efeito nenhum
  const [conferido, setConferido] = useState<string | null>(null);
  const [digitado, setDigitado] = useState<{ token: string | null; texto: string }>({ token: null, texto: '' });
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<AppError | null>(null);
  const [feito, setFeito] = useState<RemocaoFeita | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  /** sobe quando a prévia que valia foi gasta (a remoção falhou) e é preciso conferir de novo */
  const [rodada, setRodada] = useState(0);
  const sequencia = useRef(0);
  const primeira = useRef(true);

  // a prévia acompanha o que se digita, com uma pausa, e uma resposta atrasada de um filtro antigo é descartada
  useEffect(() => {
    const minha = ++sequencia.current;
    const espera = primeira.current ? 0 : ESPERA_DIGITACAO_MS;
    primeira.current = false;
    const timer = setTimeout(() => {
      api.library
        .previewRemove(filtro)
        .catch((e: unknown): ResultadoPreviaRemocao => ({ ok: false, erro: erroInesperado(e) }))
        .then((resultado) => {
          if (minha === sequencia.current) setPrevia({ filtro, resultado });
        });
    }, espera);
    return () => clearTimeout(timer);
  }, [filtro, rodada]);

  const atual = previa?.filtro === filtro ? previa.resultado : null;
  const pronta = atual?.ok ? atual.previa : null;
  const token = pronta?.token ?? null;
  const n = pronta?.faixas.length ?? 0;
  const exigeDigitar = n > REMOCAO_EM_MASSA;
  const conferi = token !== null && conferido === token;
  const digitou = digitado.token === token && digitado.texto.trim() === String(n);
  const podeApagar = pronta !== null && n > 0 && conferi && (!exigeDigitar || digitou) && !apagando;

  async function apagar() {
    if (!pronta || !podeApagar) return;
    setApagando(true);
    setErro(null);
    try {
      const r = await api.library.remove(filtro, pronta.token);
      if (r.ok) {
        setFeito(r.remocao);
        aoRemover();
      } else {
        setErro(r.erro);
        // a prévia que valia foi gasta: confere de novo antes de uma nova tentativa
        setPrevia(null);
        setRodada((n) => n + 1);
      }
    } catch (e) {
      setErro(erroInesperado(e));
    } finally {
      setApagando(false);
    }
  }

  async function novaLista() {
    const unica = feito?.removidas[0];
    if (!unica) return;
    setErroLista(null);
    try {
      const r = useRascunho.getState();
      await r.criar('vazia');
      const lista = useRascunho.getState().lista;
      if (!lista) throw new Error(useRascunho.getState().erro ?? t.erroNovaLista);
      r.editar(`${unica.artista} - ${unica.titulo}`);
      if (!(await useRascunho.getState().salvar())) throw new Error(useRascunho.getState().erro ?? t.erroNovaLista);
      aoFechar();
      void navegar('/lista');
    } catch (e) {
      setErroLista(`${t.erroNovaLista}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (feito) {
    return (
      <div className="flex flex-col gap-4" data-testid="remocao-feita">
        <span className="self-start">
          <Chip cor="verde">{t.feito}</Chip>
        </span>
        <Dialog.Title className="m-0 text-[22px] font-extrabold">{t.feitoTitulo(feito.removidas)}</Dialog.Title>
        <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">{t.aposRemover}</Dialog.Description>
        {erroLista ? (
          <p role="alert" className="m-0 text-sm text-chip-vermelho">
            {erroLista}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Botao onClick={aoFechar}>{t.voltar}</Botao>
          {feito.removidas.length === 1 ? (
            <Botao variante="primario" onClick={() => void novaLista()} data-testid="nova-lista">
              {t.novaLista}
            </Botao>
          ) : null}
        </div>
      </div>
    );
  }

  const faixas = pronta?.faixas ?? [];
  const mostradas = faixas.slice(0, FAIXAS_NA_PREVIA);
  const porcento = totalNaBiblioteca > 0 ? Math.round((n / totalNaBiblioteca) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-[6px]">
        <Rotulo className="!text-[#ff8a8a]">{t.rotulo}</Rotulo>
        <Dialog.Title className="m-0 text-2xl font-extrabold" style={{ fontStretch: '110%' }}>
          {t.titulo}
        </Dialog.Title>
      </div>

      <label className="flex flex-col gap-2 text-sm font-semibold">
        {t.filtro}
        <input
          className="inp font-mono"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          data-testid="filtro-remover"
        />
        <span className="text-[13px] font-normal text-texto-suave">{t.dicaFiltro}</span>
      </label>

      <div
        className="flex flex-col overflow-hidden rounded-lg border border-borda"
        data-testid="previa-remocao"
        aria-busy={atual === null}
      >
        <div className="flex items-center gap-[10px] border-b border-borda-fraca bg-painel px-[14px] py-[10px]">
          <Rotulo>{t.sera}</Rotulo>
          {pronta && n > 0 ? (
            <span className="ml-auto font-mono text-xs text-[#ff8a8a]" data-testid="previa-resumo">
              {t.resumo(n)}
            </span>
          ) : null}
        </div>
        {atual === null ? (
          <p role="status" className="m-0 px-[14px] py-3 text-sm text-texto-suave">
            {t.conferindo}
          </p>
        ) : !atual.ok ? (
          <div className="p-3">
            <Aviso erro={atual.erro} />
          </div>
        ) : n === 0 ? (
          <p className="m-0 px-[14px] py-3 text-sm text-texto-suave" data-testid="previa-nenhuma">
            {t.nenhuma}
          </p>
        ) : (
          <ul className="m-0 flex max-h-[240px] list-none flex-col overflow-y-auto p-0">
            {mostradas.map((f) => (
              <li
                key={f.id}
                className="flex flex-col gap-1 border-t border-borda-fraca px-[14px] py-[10px] first:border-t-0"
                data-testid="previa-faixa"
              >
                <span className="text-sm">
                  {f.artista ? (
                    <>
                      <strong>{f.artista}</strong> <span className="text-texto-apagado">–</span>{' '}
                    </>
                  ) : null}
                  {f.titulo}{' '}
                  <span className="font-mono text-xs text-texto-mudo">
                    {[f.bpm ? `${f.bpm} BPM` : null, f.tom, f.formato].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="font-mono text-xs text-texto-suave">music/{f.arquivo}</span>
              </li>
            ))}
            {faixas.length > mostradas.length ? (
              <li className="border-t border-borda-fraca px-[14px] py-[10px] text-[13px] text-texto-suave">
                {t.eMais(faixas.length - mostradas.length)}
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="flex gap-3 rounded-lg border border-erro-borda bg-[#2a1414] px-[14px] py-3">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ff8a8a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-px shrink-0"
        >
          <path d="M12 3 2 20h20z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
        <span className="text-[13.5px] leading-normal text-[#f2c9c9]">{t.aviso}</span>
      </div>

      {exigeDigitar ? (
        <div className="flex flex-col gap-2" data-testid="remocao-em-massa">
          <p role="alert" className="m-0 text-[13.5px] leading-normal text-chip-laranja">
            {t.massa(n, porcento)}
          </p>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            {t.digitar(n)}
            <input
              className="inp w-40 font-mono"
              inputMode="numeric"
              value={digitado.token === token ? digitado.texto : ''}
              onChange={(e) => setDigitado({ token, texto: e.target.value })}
              autoComplete="off"
              data-testid="digitar-numero"
            />
          </label>
        </div>
      ) : null}

      <label className="inline-flex cursor-pointer items-center gap-[10px] text-sm">
        <input
          type="checkbox"
          className="h-[18px] w-[18px] accent-[#c23b3b]"
          checked={conferi}
          disabled={pronta === null || n === 0}
          onChange={(e) => setConferido(e.target.checked ? token : null)}
          data-testid="conferi"
        />
        {t.conferi(n)}
      </label>

      {erro ? <Aviso erro={erro} /> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="fantasma" onClick={aoFechar} disabled={apagando}>
          {t.cancelar}
        </Botao>
        <Botao variante="destrutivo" disabled={!podeApagar} onClick={() => void apagar()} data-testid="apagar">
          {apagando ? t.apagando : t.apagar(n)}
        </Botao>
      </div>
    </div>
  );
}

export function DialogoRemover({
  faixa,
  totalNaBiblioteca,
  aoFechar,
  aoRemover,
}: {
  /** a faixa de onde o usuário clicou em remover; null = fechado */
  faixa: FaixaDaBiblioteca | null;
  totalNaBiblioteca: number;
  aoFechar(): void;
  aoRemover(): void;
}) {
  return (
    <Dialog.Root open={faixa !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(6,7,8,0.72)]" />
        <Dialog.Content
          className="fixed top-[min(96px,8vh)] left-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-5 overflow-y-auto rounded-xl border border-[#3a3e45] bg-[#17191c] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          data-testid="dialogo-remover"
          aria-describedby={undefined}
        >
          {faixa ? (
            <Conteudo
              key={faixa.id}
              faixa={faixa}
              totalNaBiblioteca={totalNaBiblioteca}
              aoFechar={aoFechar}
              aoRemover={aoRemover}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
