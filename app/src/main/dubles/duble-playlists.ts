// Dublê dos streamings para os testes ponta a ponta: fora do app empacotado, SOULCRATE_DUBLE_PLAYLISTS aponta para um
// JSON com as respostas ({ "<começo da url>": { "status": 200, "corpo": "...", "tipo": "application/json" } }). O
// arquivo é relido a cada pedido: o teste pode mudar a playlist no meio (para "Atualizar da playlist"). Nenhum
// pedido sai para a internet; o que não está no arquivo responde 404.
import { readFileSync } from 'node:fs';
import type { Buscador } from '../services/playlists-service';

export const VAR_PLAYLISTS_DUBLE = 'SOULCRATE_DUBLE_PLAYLISTS';

interface RespostaDuble {
  status?: number;
  corpo?: string;
  tipo?: string;
  /** cabeçalho Location (link curto) */
  destino?: string;
}

export function buscadorDuble(arquivo: string): Buscador {
  return (url) => {
    let respostas: Record<string, RespostaDuble> = {};
    try {
      respostas = JSON.parse(readFileSync(arquivo, 'utf8')) as Record<string, RespostaDuble>;
    } catch {
      /* sem arquivo: tudo 404 */
    }
    // o prefixo mais longo vence (a página de faixas antes da playlist)
    const chave = Object.keys(respostas)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    const r = chave ? respostas[chave] : undefined;
    if (!r) return Promise.resolve(new Response('não encontrado', { status: 404 }));
    const headers: Record<string, string> = { 'content-type': r.tipo ?? 'application/json' };
    if (r.destino) headers.location = r.destino;
    return Promise.resolve(new Response(r.corpo ?? null, { status: r.status ?? 200, headers }));
  };
}
