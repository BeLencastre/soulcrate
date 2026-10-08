// Logs de contêiner ao vivo: assina `docker compose logs -f` no main enquanto a tela precisa dele.
import { useEffect, useState } from 'react';
import type { AlvoLog, LinhaLog } from '@shared/ipc';
import { api } from './api';

export const MAX_LINHAS_LOG = 2000;
const SEM_LINHAS: LinhaLog[] = [];

export function limitar<T>(linhas: T[], max = MAX_LINHAS_LOG): T[] {
  return linhas.length > max ? linhas.slice(linhas.length - max) : linhas;
}

/**
 * Linhas do log de `alvo`. `ativo` liga e desliga a assinatura (o log só existe com contêiner rodando);
 * trocar de alvo ou de estado reinicia a assinatura e limpa a tela.
 */
export function useLogs(alvo: AlvoLog, ativo: boolean): LinhaLog[] {
  // as linhas valem para uma combinação alvo/ativo; outra combinação começa vazia, sem setState dentro do efeito
  const chave = `${alvo}|${String(ativo)}`;
  const [estado, setEstado] = useState<{ chave: string; linhas: LinhaLog[] }>({ chave, linhas: SEM_LINHAS });

  useEffect(() => {
    if (!ativo) return;

    const acrescentar = (novas: LinhaLog[]) =>
      setEstado((anterior) => ({
        chave,
        linhas: limitar([...(anterior.chave === chave ? anterior.linhas : SEM_LINHAS), ...novas]),
      }));

    let idAtual: string | null = null;
    let cancelado = false;
    // linhas que chegam antes de `subscribe` devolver o id (o main começa a emitir em ~100 ms)
    const antesDoId = new Map<string, LinhaLog[]>();

    const parar = api.onEvent((e) => {
      if (e.type !== 'logs.lines') return;
      if (idAtual === null) {
        antesDoId.set(e.id, [...(antesDoId.get(e.id) ?? []), ...e.linhas]);
      } else if (e.id === idAtual) {
        acrescentar(e.linhas);
      }
    });

    api.logs
      .subscribe(alvo)
      .then((id) => {
        if (cancelado) {
          void api.logs.unsubscribe(id);
          return;
        }
        idAtual = id;
        const guardadas = antesDoId.get(id);
        if (guardadas) acrescentar(guardadas);
        antesDoId.clear();
      })
      .catch((erro: unknown) => console.error('logs.subscribe falhou:', erro));

    return () => {
      cancelado = true;
      parar();
      if (idAtual) void api.logs.unsubscribe(idAtual);
    };
  }, [alvo, ativo, chave]);

  return estado.chave === chave ? estado.linhas : SEM_LINHAS;
}

export function textoDasLinhas(linhas: readonly LinhaLog[]): string {
  return linhas.map((l) => [l.hora, l.servico, l.texto].filter(Boolean).join(' ')).join('\n');
}
