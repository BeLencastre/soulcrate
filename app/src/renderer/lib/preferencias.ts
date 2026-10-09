// Preferências do app no renderer: o main é a fonte da verdade, o Query só guarda a cópia mais recente.
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, OndeAbrirWebUi } from '@shared/ipc';
import type { ServicoId } from '@shared/servicos';
import { seguro } from './acoes';
import { api } from './api';

export const chaveSettings = ['app', 'settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: chaveSettings, queryFn: () => api.app.getSettings() });
}

/**
 * Grava uma ou mais preferências. A tela muda NA HORA (um interruptor que espera o main para virar parece quebrado) e
 * depois adota o que o main devolveu, já normalizado; se a gravação falha, volta ao que estava.
 */
export function useMudarSettings(): (parcial: Partial<AppSettings>) => Promise<void> {
  const qc = useQueryClient();
  return useCallback(
    async (parcial) => {
      const anterior = qc.getQueryData<AppSettings>(chaveSettings);
      if (anterior) qc.setQueryData(chaveSettings, { ...anterior, ...parcial });
      try {
        qc.setQueryData(chaveSettings, await api.app.setSettings(parcial));
      } catch (e) {
        if (anterior) qc.setQueryData(chaveSettings, anterior);
        throw e;
      }
    },
    [qc],
  );
}

/**
 * "Abrir" uma Web UI. O botão principal respeita a preferência (Configurações → Aplicativo); o secundário oferece
 * sempre o outro destino, para a pessoa poder escolher na hora sem mexer na preferência.
 */
export function useAbrirServico(): {
  preferencia: OndeAbrirWebUi;
  abrir(id: ServicoId): void;
  abrirNoOutro(id: ServicoId): void;
} {
  const { data } = useSettings();
  const preferencia: OndeAbrirWebUi = data?.abrirWebUi ?? 'app';
  return {
    preferencia,
    abrir: (id) => seguro(api.stack.openService(id, 'preferencia')),
    abrirNoOutro: (id) => seguro(api.stack.openService(id, preferencia === 'app' ? 'browser' : 'app')),
  };
}
