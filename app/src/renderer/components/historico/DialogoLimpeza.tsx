// "Apagar execuções antigas…" (§5, Fase 4, "ações de manutenção dos relatórios"): escolhe o critério, mostra o que vai
// sair (quantas execuções, arquivos e quanto espaço) e só então manda para a Lixeira. Tudo é pré-visualizado antes.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CriterioLimpeza } from '@shared/historico';
import { msg } from '@shared/mensagens';
import { api } from '../../lib/api';
import { CHAVE_HISTORICO, formatarBytes } from '../../lib/historico';
import { Botao } from '../ui';

type Opcao = keyof typeof msg.historico.limpar.opcoes;

const CRITERIOS: Record<Opcao, CriterioLimpeza> = {
  dias30: { tipo: 'idade', dias: 30 },
  dias90: { tipo: 'idade', dias: 90 },
  dias180: { tipo: 'idade', dias: 180 },
  manter10: { tipo: 'manter', quantas: 10 },
  manter30: { tipo: 'manter', quantas: 30 },
};
const ORDEM: Opcao[] = ['dias30', 'dias90', 'dias180', 'manter10', 'manter30'];

export function DialogoLimpeza({
  aberto,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean;
  aoFechar(): void;
  /** o texto do que foi feito, para a tela mostrar depois de fechar */
  aoConcluir(resultado: string): void;
}) {
  const t = msg.historico.limpar;
  const qc = useQueryClient();
  const [opcao, setOpcao] = useState<Opcao>('dias90');
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const previa = useQuery({
    queryKey: [...CHAVE_HISTORICO, 'previa-limpeza', opcao],
    queryFn: () => api.reports.previewCleanup(CRITERIOS[opcao]),
    enabled: aberto,
    staleTime: 0,
    gcTime: 0,
  });
  const p = previa.data;
  const nada = p !== undefined && p.execucoes === 0;

  async function apagar() {
    setApagando(true);
    setErro(null);
    try {
      const r = await api.reports.cleanup(CRITERIOS[opcao]);
      await qc.invalidateQueries({ queryKey: CHAVE_HISTORICO });
      aoConcluir([t.pronto(r.execucoes), r.falhas > 0 ? t.falhas(r.falhas) : ''].filter(Boolean).join(' '));
      aoFechar();
    } catch (e) {
      setErro(`${t.erro}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApagando(false);
    }
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o || apagando ? undefined : aoFechar())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[10px] border border-borda-forte bg-dialogo p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-limpeza"
        >
          <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
            {t.titulo}
          </Dialog.Title>
          <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">{t.corpo}</Dialog.Description>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="lbl mb-2 p-0">{t.criterio}</legend>
            {ORDEM.map((o) => (
              <label key={o} className="rad">
                <input
                  type="radio"
                  name="criterio-limpeza"
                  className="accent-ambar"
                  checked={opcao === o}
                  onChange={() => setOpcao(o)}
                />
                {t.opcoes[o]}
              </label>
            ))}
          </fieldset>

          <p
            role="status"
            className={`m-0 font-mono text-[13px] ${nada ? 'text-texto-suave' : 'text-texto'}`}
            data-testid="previa-limpeza"
          >
            {previa.isPending
              ? t.calculando
              : previa.isError
                ? t.erro
                : nada
                  ? t.nada
                  : p
                    ? t.previa(p.execucoes, p.arquivos, formatarBytes(p.bytes))
                    : ''}
          </p>
          {erro ? (
            <p role="alert" className="m-0 text-sm text-chip-vermelho">
              {erro}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Botao onClick={aoFechar} disabled={apagando}>
              {t.cancelar}
            </Botao>
            <Botao
              variante="perigo"
              disabled={apagando || !p || nada}
              onClick={() => void apagar()}
              data-testid="confirmar-limpeza"
            >
              {apagando ? t.apagando : t.confirmar}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
