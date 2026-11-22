// Organização da biblioteca: só por gênero ou por gênero e artista, escolhida em Suas músicas de forma independente
// para o disco e para o Rekordbox. O app grava as duas escolhas em `soulbeet/data/pastas.json`: a do disco é lida
// pelo plugin `pastas.py` do beets para montar o caminho de cada faixa; a do Rekordbox, só pelo app, para montar a
// árvore de playlists do rekordbox XML.
//
// O formato do arquivo é contrato com o plugin (`organizacao_do_texto` em `soulbeet/beets-plugins/pastas.py`): mude
// os dois juntos. Aqui ficam só as regras puras.
import type { AppError } from './erros.js';

export type OrganizacaoDasPastas = 'genero-artista' | 'genero';

export const ORGANIZACOES: readonly OrganizacaoDasPastas[] = ['genero-artista', 'genero'];

/** Onde a escolha vale: as pastas no disco (o beets) ou as playlists do Rekordbox (o rekordbox XML). */
export type AlvoDaOrganizacao = 'disco' | 'rekordbox';

export const ALVOS: readonly AlvoDaOrganizacao[] = ['disco', 'rekordbox'];

export type Organizacoes = Record<AlvoDaOrganizacao, OrganizacaoDasPastas>;

/** Sem escolha gravada vale o jeito de sempre (`Gênero/Artista/Título`): quem já usava não vê nada mudar. */
export const ORGANIZACAO_PADRAO: OrganizacaoDasPastas = 'genero-artista';

/** Dentro da pasta do Soulcrate. É dado do usuário: a atualização dos arquivos da stack não toca nele. */
export const ARQUIVO_ORGANIZACAO = ['soulbeet', 'data', 'pastas.json'] as const;

/** O `config.yaml` que entende a escolha do disco traz este campo do plugin no `paths:`. */
export const CAMPO_DO_CONFIG = '$organizar_por_artista';

export interface EstadoOrganizacao extends Organizacoes {
  /**
   * false quando o `config.yaml` da pasta do Soulcrate não usa a escolha do disco (foi editado e a versão nova ficou
   * ao lado, como `config.yaml.novo`): o beets continua montando as pastas do jeito antigo.
   */
  configAtende: boolean;
}

export type ResultadoOrganizacao = { ok: true; estado: EstadoOrganizacao } | { ok: false; erro: AppError };

export function ehOrganizacao(valor: unknown): valor is OrganizacaoDasPastas {
  return typeof valor === 'string' && (ORGANIZACOES as readonly string[]).includes(valor);
}

export function ehAlvoDaOrganizacao(valor: unknown): valor is AlvoDaOrganizacao {
  return typeof valor === 'string' && (ALVOS as readonly string[]).includes(valor);
}

/** O que está gravado; o padrão em cada escolha ausente ou desconhecida (o plugin faz o mesmo com a do disco). */
export function lerOrganizacoes(texto: string | null): Organizacoes {
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }
  const valor = (alvo: AlvoDaOrganizacao): OrganizacaoDasPastas => {
    const v: unknown = typeof dados === 'object' && dados !== null ? Reflect.get(dados, alvo) : undefined;
    return ehOrganizacao(v) ? v : ORGANIZACAO_PADRAO;
  };
  return { disco: valor('disco'), rekordbox: valor('rekordbox') };
}

export function textoDasOrganizacoes({ disco, rekordbox }: Organizacoes): string {
  return `${JSON.stringify({ disco, rekordbox }, null, 2)}\n`;
}

export function configAtende(textoDoConfig: string | null): boolean {
  return textoDoConfig !== null && textoDoConfig.includes(CAMPO_DO_CONFIG);
}
