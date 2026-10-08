// Os três serviços da stack (docker-compose.yml). O id é também o nome do serviço no compose.
export type ServicoId = 'slskd' | 'soulbeet' | 'navidrome';

export interface ServicoInfo {
  id: ServicoId;
  nome: string;
  /** porta da Web UI no host (a mesma do docker-compose.yml) */
  porta: number;
  /** caminho HTTP usado para sondar a saúde (D4 da especificação) */
  caminhoSaude: string;
}

/** Ordem em que a stack é listada (barra lateral, cartão "Serviços saudáveis", logs). */
export const SERVICOS: readonly ServicoInfo[] = [
  { id: 'slskd', nome: 'slskd', porta: 5030, caminhoSaude: '/health' },
  { id: 'soulbeet', nome: 'Soulbeet', porta: 9765, caminhoSaude: '/' },
  { id: 'navidrome', nome: 'Navidrome', porta: 4533, caminhoSaude: '/ping' },
];

/** Ordem em que as interfaces web são oferecidas (o Soulbeet é a mais usada). */
export const ORDEM_WEBUI: readonly ServicoId[] = ['soulbeet', 'slskd', 'navidrome'];

export function servicoPorId(id: ServicoId): ServicoInfo {
  const s = SERVICOS.find((x) => x.id === id);
  if (!s) throw new Error(`Serviço desconhecido: ${id}`);
  return s;
}

export function ehServicoId(valor: unknown): valor is ServicoId {
  return typeof valor === 'string' && SERVICOS.some((s) => s.id === valor);
}

/** Endereço da Web UI. As portas só abrem em 127.0.0.1 (S2); com BIND_ADDR=0.0.0.0 também respondem aqui. */
export function urlDoServico(id: ServicoId): string {
  return `http://127.0.0.1:${servicoPorId(id).porta}`;
}
