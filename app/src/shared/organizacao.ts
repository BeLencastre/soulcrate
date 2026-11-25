// Organização da biblioteca, montada por níveis (ADR 0007): o gênero é sempre o primeiro; para cada destino, o disco e
// o Rekordbox, a pessoa liga ou desliga o subgênero e o artista, nessa ordem fixa (`Gênero / Subgênero / Artista`). O
// app grava as escolhas em `soulbeet/data/pastas.json`: as do disco são lidas pelo plugin `pastas.py` do beets para
// montar o caminho de cada faixa; as do Rekordbox, só pelo app, para montar a árvore de playlists do rekordbox XML.
//
// O formato do arquivo é contrato com o plugin (`organizacao_do_texto` e a leitura do `subgenero` em
// `soulbeet/beets-plugins/pastas.py`): mude os dois juntos. Ele só ganhou chaves (o arquivo antigo continua válido):
//   { "disco": "genero-artista" | "genero", "rekordbox": ..., "subgenero": { "disco": bool, "rekordbox": bool } }
// `disco` e `rekordbox` guardam a escolha do artista, como antes; `subgenero` é a do subgênero. Ao regravar, as chaves
// que o app não conhece ficam (um app mais novo pode ter escrito alguma). Aqui ficam só as regras puras.
import type { AppError } from './erros.js';

/** Como o arquivo guarda a escolha do artista (o nome antigo, que o plugin já entendia). */
export type OrganizacaoDasPastas = 'genero-artista' | 'genero';

export const ORGANIZACOES: readonly OrganizacaoDasPastas[] = ['genero-artista', 'genero'];

/** Onde a escolha vale: as pastas no disco (o beets) ou as playlists do Rekordbox (o rekordbox XML). */
export type AlvoDaOrganizacao = 'disco' | 'rekordbox';

export const ALVOS: readonly AlvoDaOrganizacao[] = ['disco', 'rekordbox'];

/** Os níveis opcionais de um destino; o gênero sempre entra. */
export interface NiveisDaOrganizacao {
  subgenero: boolean;
  artista: boolean;
}

export type Organizacoes = Record<AlvoDaOrganizacao, NiveisDaOrganizacao>;

/** Sem escolha gravada vale o jeito de sempre (`Gênero/Artista/Título`): quem já usava não vê nada mudar. */
export const ORGANIZACAO_PADRAO: OrganizacaoDasPastas = 'genero-artista';

/** O subgênero vem desligado: sem a conta do Beatport, a maior parte das faixas cairia em `_Sem Subgenero`. */
export const NIVEIS_PADRAO: NiveisDaOrganizacao = { subgenero: false, artista: true };

/** A pasta (e a playlist) das faixas sem subgênero conhecido, no estilo de `_Sem Genero` (sem acento). */
export const SEM_SUBGENERO = '_Sem Subgenero';

/** Dentro da pasta do Soulcrate. É dado do usuário: a atualização dos arquivos da stack não toca nele. */
export const ARQUIVO_ORGANIZACAO = ['soulbeet', 'data', 'pastas.json'] as const;

/** O `config.yaml` que entende a escolha do artista no disco traz este campo do plugin no `paths:`. */
export const CAMPO_DO_CONFIG = '$organizar_por_artista';
/** ...e este, se entende a do subgênero. */
export const CAMPO_DO_SUBGENERO = '$subgenero_pasta';

export interface EstadoOrganizacao extends Organizacoes {
  /**
   * false quando o `config.yaml` da pasta do Soulcrate não usa a escolha do disco (foi editado e a versão nova ficou
   * ao lado, como `config.yaml.novo`): o beets continua montando as pastas do jeito antigo.
   */
  configAtende: boolean;
  /** o mesmo, para o nível de subgênero no disco (um `config.yaml` de antes do ADR 0007 não o tem) */
  configAtendeSubgenero: boolean;
  /** há usuário e senha do Beatport no `.env`: o subgênero vem do Beatport, com as regras locais de reserva */
  contaBeatport: boolean;
}

export type ResultadoOrganizacao = { ok: true; estado: EstadoOrganizacao } | { ok: false; erro: AppError };

export function ehOrganizacao(valor: unknown): valor is OrganizacaoDasPastas {
  return typeof valor === 'string' && (ORGANIZACOES as readonly string[]).includes(valor);
}

export function ehAlvoDaOrganizacao(valor: unknown): valor is AlvoDaOrganizacao {
  return typeof valor === 'string' && (ALVOS as readonly string[]).includes(valor);
}

export function ehNiveis(valor: unknown): valor is NiveisDaOrganizacao {
  if (typeof valor !== 'object' || valor === null) return false;
  const chaves = Object.keys(valor);
  return (
    chaves.length === 2 &&
    typeof Reflect.get(valor, 'subgenero') === 'boolean' &&
    typeof Reflect.get(valor, 'artista') === 'boolean'
  );
}

function objetoDoTexto(texto: string | null): Record<string, unknown> {
  try {
    const dados: unknown = texto ? JSON.parse(texto) : null;
    return typeof dados === 'object' && dados !== null && !Array.isArray(dados) ? { ...dados } : {};
  } catch {
    return {};
  }
}

/** O que está gravado; o padrão em cada escolha ausente ou desconhecida (o plugin faz o mesmo com as do disco). */
export function lerOrganizacoes(texto: string | null): Organizacoes {
  const dados = objetoDoTexto(texto);
  const subgenero = dados['subgenero'];
  const niveis = (alvo: AlvoDaOrganizacao): NiveisDaOrganizacao => {
    const artista = dados[alvo];
    const sub: unknown = typeof subgenero === 'object' && subgenero !== null ? Reflect.get(subgenero, alvo) : undefined;
    return {
      subgenero: typeof sub === 'boolean' ? sub : NIVEIS_PADRAO.subgenero,
      artista: ehOrganizacao(artista) ? artista === 'genero-artista' : NIVEIS_PADRAO.artista,
    };
  };
  return { disco: niveis('disco'), rekordbox: niveis('rekordbox') };
}

/** O texto novo do arquivo: as escolhas, mais as chaves que já estavam lá e o app não conhece. */
export function textoDasOrganizacoes(organizacoes: Organizacoes, textoAnterior: string | null = null): string {
  const comoTexto = (n: NiveisDaOrganizacao): OrganizacaoDasPastas => (n.artista ? 'genero-artista' : 'genero');
  const dados = {
    ...objetoDoTexto(textoAnterior),
    disco: comoTexto(organizacoes.disco),
    rekordbox: comoTexto(organizacoes.rekordbox),
    subgenero: { disco: organizacoes.disco.subgenero, rekordbox: organizacoes.rekordbox.subgenero },
  };
  return `${JSON.stringify(dados, null, 2)}\n`;
}

export function configAtende(textoDoConfig: string | null): boolean {
  return textoDoConfig !== null && textoDoConfig.includes(CAMPO_DO_CONFIG);
}

export function configAtendeSubgenero(textoDoConfig: string | null): boolean {
  return textoDoConfig !== null && textoDoConfig.includes(CAMPO_DO_SUBGENERO);
}

/** Os níveis na ordem do caminho, para o exemplo ao vivo e o nome da combinação: `['genero', 'subgenero', 'artista']`. */
export function niveisEmOrdem(n: NiveisDaOrganizacao): ('genero' | 'subgenero' | 'artista')[] {
  return [
    'genero' as const,
    ...(n.subgenero ? ['subgenero' as const] : []),
    ...(n.artista ? ['artista' as const] : []),
  ];
}
