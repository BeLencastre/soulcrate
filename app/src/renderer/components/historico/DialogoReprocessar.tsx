// "Reprocessar a lista do zero…" (§5, Fase 4): apaga a memória da lista (`estado-<lista>.tsv`), com confirmação. O
// arquivo vai para a Lixeira; depois disso a próxima execução da lista não pula mais nada.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { msg } from '@shared/mensagens';
import { api } from '../../lib/api';
import { CHAVE_HISTORICO } from '../../lib/historico';
import { Botao } from '../ui';

export function DialogoReprocessar({
  runId,
  aberto,
  aoFechar,
  aoConcluir,
}: {
  runId: string;
  aberto: boolean;
  aoFechar(): void;
  aoConcluir(resultado: string): void;
}) {
  const t = msg.historico.reprocessar;
  const qc = useQueryClient();
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estado = useQuery({
    queryKey: [...CHAVE_HISTORICO, 'memoria', runId],
    queryFn: () => api.reports.listState(runId),
    enabled: aberto,
    staleTime: 0,
    gcTime: 0,
  });
  const e = estado.data;
  const semMemoria = estado.isSuccess && e === null;

  async function reprocessar() {
    if (!e) return;
    setTrabalhando(true);
    setErro(null);
    try {
      const ok = await api.reports.resetList(runId);
      await qc.invalidateQueries({ queryKey: CHAVE_HISTORICO });
      if (!ok) {
        setErro(t.semMemoria);
        return;
      }
      aoConcluir(t.pronto(e.lista));
      aoFechar();
    } catch (x) {
      setErro(`${t.erro}: ${x instanceof Error ? x.message : String(x)}`);
    } finally {
      setTrabalhando(false);
    }
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o || trabalhando ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[10px] border border-borda-forte bg-[#17191c] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-reprocessar"
        >
          <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
            {t.titulo}
          </Dialog.Title>
          <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
            {e ? t.corpo(e.lista, e.faixas) : semMemoria ? t.semMemoria : estado.isError ? t.erro : msg.app.carregando}
          </Dialog.Description>
          {e && !e.rodando ? <p className="m-0 text-[13px] text-texto-suave">{t.aviso}</p> : null}
          {e?.rodando ? (
            <p role="alert" className="m-0 text-sm text-chip-laranja">
              {t.rodando}
            </p>
          ) : null}
          {erro ? (
            <p role="alert" className="m-0 text-sm text-chip-vermelho">
              {erro}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Botao onClick={aoFechar} disabled={trabalhando}>
              {t.cancelar}
            </Botao>
            <Botao
              variante="perigo"
              disabled={trabalhando || !e || e.rodando}
              onClick={() => void reprocessar()}
              data-testid="confirmar-reprocessar"
            >
              {t.confirmar}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
