// Diálogo das tarefas de manutenção (Fase 5): descreve o que o beets vai fazer, mostra a pré-visualização quando a tarefa
// mexe nos arquivos (`update -p`, `move -p`), pede a confirmação, acompanha a saída ao vivo e mostra como terminou.
// O andamento vem do Zustand (`useManutencao`), não do diálogo: fechar a janela não interrompe a tarefa.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  TAREFAS_COM_PREVIA,
  type Indicadores,
  type ParadoEmDownloads,
  type ResultadoPreviaManutencao,
  type TarefaManutencao,
} from '@shared/biblioteca';
import { erroInesperado, type AppError } from '@shared/erros';
import { rotuloDoMomento } from '@shared/historico';
import { msg } from '@shared/mensagens';
import { api } from '../../lib/api';
import { useManutencao } from '../../lib/biblioteca';
import { CartaoErro } from '../CartaoErro';
import { Botao, Chip } from '../ui';

const LINHAS_VISIVEIS = 12;

function Saida({ linhas, vivo }: { linhas: readonly string[]; vivo: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [linhas.length]);
  if (linhas.length === 0 && !vivo) return null;
  return (
    <pre
      ref={ref}
      aria-label={msg.biblioteca.dialogo.saida}
      className="m-0 max-h-[220px] overflow-auto rounded-md bg-log p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-texto-claro"
      data-testid="saida-manutencao"
    >
      {linhas.join('\n')}
    </pre>
  );
}

/** O texto de cada tarefa (o corpo e o rótulo do botão que confirma). */
function textosDaTarefa(
  tarefa: TarefaManutencao,
  indicadores: Indicadores,
): { titulo: string; corpo: string; confirmar: string } {
  const d = msg.biblioteca.dialogo;
  switch (tarefa) {
    case 'tomEBpm':
      return {
        titulo: d.tomEBpm.titulo,
        corpo: d.tomEBpm.corpo(indicadores.semBpm, indicadores.semTom),
        confirmar: d.tomEBpm.confirmar,
      };
    case 'importLeftovers':
      return {
        titulo: d.importLeftovers.titulo,
        corpo: d.importLeftovers.corpo,
        confirmar: d.importLeftovers.confirmar,
      };
    case 'update':
      return { titulo: d.update.titulo, corpo: d.update.corpo, confirmar: d.update.confirmar };
    case 'move':
      return { titulo: d.move.titulo, corpo: d.move.corpo, confirmar: d.move.confirmar };
  }
}

function Conteudo({
  tarefa,
  indicadores,
  parados,
  agora,
  aoFechar,
}: {
  tarefa: TarefaManutencao;
  indicadores: Indicadores;
  parados: readonly ParadoEmDownloads[];
  agora: number;
  aoFechar(): void;
}) {
  const d = msg.biblioteca.dialogo;
  const operacao = useManutencao((s) => s.operacao);
  const dispensar = useManutencao((s) => s.dispensar);
  const [previa, setPrevia] = useState<ResultadoPreviaManutencao | null>(null);
  /** sobe quando o usuário pede "Tentar de novo" depois de um erro na conferência */
  const [rodada, setRodada] = useState(0);
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState<AppError | null>(null);
  /** o id da execução que ESTE diálogo começou (ou encontrou rodando ao abrir) */
  const [meuId, setMeuId] = useState<string | null>(() =>
    operacao && !operacao.terminou && operacao.tarefa === tarefa ? operacao.id : null,
  );

  const comPrevia = (TAREFAS_COM_PREVIA as readonly string[]).includes(tarefa);
  const naoPrecisaDeConferencia = meuId !== null;

  // `update` e `move` mostram antes o que o beets faria (o `-p` dele); as outras tarefas só descrevem
  useEffect(() => {
    if (naoPrecisaDeConferencia) return;
    let vale = true;
    api.library
      .previewMaintenance(tarefa)
      .catch((e: unknown): ResultadoPreviaManutencao => ({ ok: false, erro: erroInesperado(e) }))
      .then((r) => {
        if (vale) setPrevia(r);
      });
    return () => {
      vale = false;
    };
  }, [tarefa, naoPrecisaDeConferencia, rodada]);

  const t = textosDaTarefa(tarefa, indicadores);
  const minha = operacao && operacao.id === meuId ? operacao : null;

  async function comecar(token: string | null) {
    setIniciando(true);
    setErro(null);
    try {
      const r = await api.library.maintenance(tarefa, token);
      if (r.ok) setMeuId(r.id);
      else setErro(r.erro);
    } catch (e) {
      setErro(erroInesperado(e));
    } finally {
      setIniciando(false);
    }
  }

  // ---- rodando ou terminada
  if (meuId !== null) {
    const terminou = minha?.terminou ?? false;
    return (
      <div className="flex flex-col gap-4" data-testid="manutencao-andamento" data-fim={terminou ? 'sim' : 'nao'}>
        <div className="flex items-center gap-3">
          <Chip cor={!terminou ? 'azul' : minha?.erro ? 'vermelho' : 'verde'}>
            {!terminou ? d.rodando : minha?.erro ? msg.erro.categoria[minha.erro.codigo] : d.concluido}
          </Chip>
          <Dialog.Title className="m-0 text-xl font-extrabold">{t.titulo}</Dialog.Title>
        </div>
        {!terminou ? (
          <Dialog.Description className="m-0 text-[13.5px] leading-normal text-texto-suave">
            {d.emSegundoPlano}
          </Dialog.Description>
        ) : minha?.erro ? (
          <Dialog.Description className="sr-only">{minha.erro.titulo}</Dialog.Description>
        ) : (
          <Dialog.Description className="m-0 text-sm text-texto-claro">{d.concluidoCorpo}</Dialog.Description>
        )}
        <Saida linhas={minha?.linhas ?? []} vivo={!terminou} />
        {minha?.erro ? <CartaoErro erro={minha.erro} /> : null}
        <div className="flex justify-end">
          <Botao
            variante={terminou ? 'primario' : 'padrao'}
            onClick={() => {
              if (terminou) dispensar();
              aoFechar();
            }}
          >
            {d.fechar}
          </Botao>
        </div>
      </div>
    );
  }

  // ---- antes de começar
  const emConferencia = comPrevia && previa === null;
  let corpoDaPrevia: ReactNode = null;
  let nada = false;
  let confirmarComoPerigo = false;

  if (tarefa === 'tomEBpm') {
    nada = indicadores.semBpm === 0 && indicadores.semTom === 0;
    if (nada) corpoDaPrevia = <p className="m-0 text-sm text-texto-suave">{d.tomEBpm.nada}</p>;
  } else if (tarefa === 'importLeftovers') {
    nada = parados.length === 0;
    corpoDaPrevia = nada ? (
      <p className="m-0 text-sm text-texto-suave">{d.importLeftovers.nada}</p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="parados-lista">
        {parados.map((p) => (
          <li key={p.nome} className="rounded-md border border-borda-fraca bg-painel px-3 py-2 text-[13px]">
            <span className="font-mono">downloads/{p.nome}</span>
            <span className="text-texto-suave">
              {' · '}
              {msg.biblioteca.parados.detalhe(p.arquivos, p.total)}
            </span>
            <span className="block text-xs text-texto-mudo">
              {msg.biblioteca.parados.desde(rotuloDoMomento(p.modificadoEm, agora))}
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (previa?.ok) {
    const p = previa.previa;
    nada = p.afetadas === 0;
    if (tarefa === 'move') {
      corpoDaPrevia = nada ? (
        <p className="m-0 text-sm text-texto-suave">{d.move.nada}</p>
      ) : (
        <p className="m-0 text-sm font-semibold">{d.move.resumo(p.afetadas)}</p>
      );
    } else {
      corpoDaPrevia = nada ? (
        <p className="m-0 text-sm text-texto-suave">{d.update.nada}</p>
      ) : (
        <p className="m-0 text-sm font-semibold">{d.update.resumo(p.afetadas, p.esquecidas)}</p>
      );
      confirmarComoPerigo = p.esquecidas > 0;
    }
  }

  const linhasDaPrevia = previa?.ok ? previa.previa.linhas.slice(0, LINHAS_VISIVEIS) : [];
  const restantes = previa?.ok ? previa.previa.totalDeLinhas - linhasDaPrevia.length : 0;
  const token = previa?.ok ? previa.previa.token : null;
  const podeComecar = !nada && !iniciando && !emConferencia && (!comPrevia || (previa?.ok === true && token !== null));

  return (
    <div className="flex flex-col gap-4">
      <Dialog.Title className="m-0 text-2xl font-extrabold" style={{ fontStretch: '110%' }}>
        {t.titulo}
      </Dialog.Title>
      <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">{t.corpo}</Dialog.Description>

      {emConferencia ? (
        <p role="status" className="m-0 text-sm text-texto-suave" data-testid="conferindo">
          {d.previa}
        </p>
      ) : previa && !previa.ok ? (
        <CartaoErro
          erro={previa.erro}
          aoTentarDeNovo={() => {
            setPrevia(null);
            setRodada((n) => n + 1);
          }}
        />
      ) : (
        corpoDaPrevia
      )}

      {linhasDaPrevia.length > 0 ? (
        <pre
          className="m-0 max-h-[200px] overflow-auto rounded-md bg-log p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-texto-claro"
          data-testid="previa-manutencao"
        >
          {linhasDaPrevia.join('\n')}
          {restantes > 0 ? `\n${d.maisLinhas(restantes)}` : ''}
        </pre>
      ) : null}

      {erro ? <CartaoErro erro={erro} /> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="fantasma" onClick={aoFechar}>
          {d.cancelar}
        </Botao>
        <Botao
          variante={confirmarComoPerigo ? 'destrutivo' : 'primario'}
          disabled={!podeComecar}
          onClick={() => void comecar(token)}
          data-testid="comecar-manutencao"
        >
          {t.confirmar}
        </Botao>
      </div>
    </div>
  );
}

export function DialogoManutencao({
  tarefa,
  indicadores,
  parados,
  agora,
  aoFechar,
}: {
  /** a tarefa que o usuário escolheu; null = fechado */
  tarefa: TarefaManutencao | null;
  indicadores: Indicadores;
  parados: readonly ParadoEmDownloads[];
  agora: number;
  aoFechar(): void;
}) {
  return (
    <Dialog.Root open={tarefa !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[10px] border border-borda-forte bg-dialogo p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-manutencao"
          aria-describedby={undefined}
        >
          {tarefa ? (
            <Conteudo
              key={tarefa}
              tarefa={tarefa}
              indicadores={indicadores}
              parados={parados}
              agora={agora}
              aoFechar={aoFechar}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
