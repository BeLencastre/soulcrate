// Modelo do assistente de configuração (Fase 2): o que o renderer envia (`ConfigEntrada`), o que recebe de volta
// (`ConfigPublica`, sem nenhum segredo) e os resultados da validação, da gravação e da pós-configuração.
// Segredos (senhas e chaves) só atravessam o IPC em um sentido: o renderer envia as senhas digitadas uma vez e
// nunca as recebe; as chaves nascem no main e ficam lá (§6.1).
import type { AppError } from './erros.js';
import type { ConfigStatus } from './stack.js';
import type { MigracaoInfo } from './stack-atualizacao.js';

// ---------------------------------------------------------------- Variáveis do .env gerenciadas pelo assistente

/** Variáveis que o assistente lê e escreve (as demais linhas do .env são preservadas como estão). */
export const VARIAVEIS_ENV = [
  'PUID',
  'PGID',
  'TZ',
  'DOWNLOADS_DIR',
  'INCOMPLETE_DIR',
  'MUSIC_DIR',
  'SLSK_USERNAME',
  'SLSK_PASSWORD',
  'SLSKD_WEB_USER',
  'SLSKD_WEB_PASSWORD',
  'SOULBEET_SECRET_KEY',
  'SLSKD_API_KEY_SOULBEET',
] as const;

export type VariavelEnv = (typeof VARIAVEIS_ENV)[number];

/**
 * `ok`: preenchida com um valor de verdade; `vazio`: faltando ou em branco; `exemplo`: ainda tem o valor do
 * `.env.example` (`PREENCHA_…`, `troque-…`, `seu_usuario_soulseek`…). É o que mostra "exatamente quais campos faltam".
 */
export type EstadoCampo = 'ok' | 'vazio' | 'exemplo';

/** A API key do slskd olhada nos dois arquivos: `ok` quando as duas existem, são de verdade e iguais. */
export type EstadoChaveSlskd = 'ok' | 'ausente' | 'exemplo' | 'diferentes';

export type PastaId = 'music' | 'downloads' | 'incomplete';

export const PASTAS_ID: readonly PastaId[] = ['music', 'downloads', 'incomplete'];

export interface PastasConfig {
  music: string;
  downloads: string;
  incomplete: string;
}

// ---------------------------------------------------------------- Configuração lida (sem segredos)

export interface ConfigPublica {
  /** a pasta do Soulcrate onde a configuração foi lida */
  dir: string;
  envExiste: boolean;
  ymlExiste: boolean;
  /** os valores gravados no .env; pasta ou usuário com valor de exemplo voltam em branco */
  pastas: PastasConfig;
  slskUsuario: string;
  webUsuario: string;
  tz: string;
  puid: string;
  pgid: string;
  musicbrainzContato: string;
  /** BIND_ADDR=0.0.0.0 */
  abrirParaRede: boolean;
  /** o estado de cada variável gerenciada */
  campos: Record<VariavelEnv, EstadoCampo>;
  chaveSlskd: EstadoChaveSlskd;
  /** o que o assistente propõe quando o campo está em branco */
  sugestoes: { tz: string; pastas: PastasConfig };
}

// ---------------------------------------------------------------- Entrada (renderer → main)

export interface ConfigEntrada {
  pastas: PastasConfig;
  slskUsuario: string;
  /** em branco: manter a senha que já está no .env (só vale se ela já estiver configurada) */
  slskSenha: string;
  webUsuario: string;
  /** em branco: manter a que já está no .env */
  webSenha: string;
  /** gera chaves novas mesmo que as atuais estejam boas (as ausentes ou de exemplo são sempre geradas) */
  regenerarChaves: boolean;
  tz: string;
  puid: string;
  pgid: string;
  musicbrainzContato: string;
  abrirParaRede: boolean;
}

/** Campos do formulário aos quais um achado da validação se refere. */
export type CampoForm =
  | 'pasta.music'
  | 'pasta.downloads'
  | 'pasta.incomplete'
  | 'slskUsuario'
  | 'slskSenha'
  | 'webUsuario'
  | 'webSenha'
  | 'tz'
  | 'puid'
  | 'pgid'
  | 'musicbrainzContato'
  | 'geral';

export interface AchadoEntrada {
  id: string;
  nivel: 'erro' | 'aviso';
  campo: CampoForm;
  mensagem: string;
}

export type EstadoPasta = 'existe' | 'sera-criada' | 'invalida' | 'e-arquivo';

/** O que o main descobriu sobre uma pasta digitada: existência, disco, espaço livre e problemas conhecidos (SP8). */
export interface InspecaoPasta {
  /** o que foi digitado */
  entrada: string;
  /** como será gravado no .env: barras normais, sem barra no fim */
  gravar: string;
  /** caminho absoluto (relativos valem a partir da pasta do Soulcrate) */
  absoluto: string;
  estado: EstadoPasta;
  /** "D:" (ou "\\\\servidor\\share"); null se não deu para saber */
  disco: string | null;
  livreBytes: number | null;
  onedrive: boolean;
  rede: boolean;
  /** pasta alternativa fora do OneDrive, quando há uma óbvia */
  sugestao: string | null;
}

export interface ResultadoValidacao {
  achados: AchadoEntrada[];
  pastas: Record<PastaId, InspecaoPasta>;
  /** downloads e biblioteca no mesmo disco; null quando algum dos dois não foi resolvido */
  mesmoDisco: boolean | null;
  /** sem erros: dá para gravar */
  ok: boolean;
}

// ---------------------------------------------------------------- Pasta do Soulcrate (passo 1)

export type ModoPasta = 'nova' | 'existente';

export interface EntradaPasta {
  modo: ModoPasta;
  caminho: string;
}

export interface ResultadoPasta {
  ok: boolean;
  /** o que está errado com a pasta escolhida, em português, quando `ok` é false */
  erro: string | null;
  /** falha inesperada (disco, permissão) ao copiar os arquivos; `erro` fica null */
  falha: AppError | null;
  dir: string | null;
  /** quantos arquivos da stack foram copiados (0 numa pasta existente) */
  copiados: number;
  /** a pasta já era uma instalação do Soulcrate (tinha o docker-compose.yml) */
  jaExistia: boolean;
  /** a configuração que a pasta já tem, para preencher os passos seguintes */
  config: ConfigPublica | null;
  /** só numa pasta que já existia (clone do Git): alterações locais nos arquivos da stack, para avisar */
  migracao?: MigracaoInfo | null;
}

// ---------------------------------------------------------------- Gravação (passo 7)

export interface ResultadoGravacao {
  ok: boolean;
  /** nomes dos backups criados (`.env.bak-2026-10-07`), em ordem */
  backups: string[];
  pastasCriadas: string[];
  chavesGeradas: { soulbeet: boolean; slskd: boolean };
  /** a conferência S4 dos arquivos recém-gravados (a mesma do subir.bat) */
  conferencia: ConfigStatus | null;
  erro: AppError | null;
}

// ---------------------------------------------------------------- Pós-configuração (com a stack no ar)

export type TarefaSetupId = 'gravar' | 'stack' | 'navidrome' | 'soulbeet' | 'porta';

/**
 * `feito`, `agora` (em andamento), `depois` (na fila), `erro`, `aviso` (terminou, mas pede atenção; a porta 2234
 * nunca bloqueia) e `precisa-login` (o Navidrome já tem administrador e a senha não bateu).
 */
export type TarefaEstado = 'feito' | 'agora' | 'depois' | 'erro' | 'aviso' | 'precisa-login';

export interface TarefaSetup {
  id: TarefaSetupId;
  estado: TarefaEstado;
  /** texto curto à direita do cartão ("backup .env.bak-…", "primeiro build: 7 min 12 s"); nunca um segredo */
  detalhe: string | null;
  erro: AppError | null;
}

export interface SetupEstado {
  /** a pós-configuração está rodando agora */
  rodando: boolean;
  /** terminou (com tudo feito, com aviso ou parada num erro) */
  terminou: boolean;
  tarefas: TarefaSetup[];
}

export const TAREFAS_SETUP: readonly TarefaSetupId[] = ['gravar', 'stack', 'navidrome', 'soulbeet', 'porta'];

export function setupInicial(): SetupEstado {
  return {
    rodando: false,
    terminou: false,
    tarefas: TAREFAS_SETUP.map((id) => ({ id, estado: 'depois', detalhe: null, erro: null })),
  };
}

export interface OpcoesSetup {
  /**
   * Como a stack é posta no ar antes do resto: `ligar` (o assistente: `up -d --build`) ou `recriar` ("Aplicar e
   * reiniciar" nas Configurações: `up -d --build --force-recreate`, para o slskd reler o slskd.yml e o .env novos).
   */
  modo: 'ligar' | 'recriar';
  /** texto da tarefa "gravar" (nomes dos backups), copiado do resultado da gravação */
  detalheGravacao?: string | null;
}

export interface LoginNavidrome {
  usuario: string;
  senha: string;
}

// ---------------------------------------------------------------- Porta 2234

/**
 * `escutando`: algo atende na porta 2234 deste PC (com a stack no ar, é o slskd); `livre`: nada escuta (com a stack
 * no ar, o Docker não publicou a porta); `ocupada`: a stack está desligada e outro programa usa a porta.
 */
export type PortaEstado = 'escutando' | 'livre' | 'ocupada';

export interface PortaStatus {
  porta: number;
  estado: PortaEstado;
  /** a stack estava no ar quando foi testado */
  stackNoAr: boolean;
}

export const PORTA_SOULSEEK = 2234;

// ---------------------------------------------------------------- Conveniências

const BYTES_POR_GB = 1024 ** 3;

/** "412 GB", "8,4 GB", "640 MB" (pt-BR). */
export function formatarEspaco(bytes: number): string {
  if (bytes >= BYTES_POR_GB) {
    const gb = bytes / BYTES_POR_GB;
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: gb >= 100 ? 0 : 1 }).format(gb)} GB`;
  }
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(bytes / 1024 ** 2)} MB`;
}

export function entradaVazia(sugestoes: ConfigPublica['sugestoes']): ConfigEntrada {
  return {
    pastas: { ...sugestoes.pastas },
    slskUsuario: '',
    slskSenha: '',
    webUsuario: 'admin',
    webSenha: '',
    regenerarChaves: false,
    tz: sugestoes.tz,
    puid: '1000',
    pgid: '1000',
    musicbrainzContato: '',
    abrirParaRede: false,
  };
}

/** Preenche o formulário com o que a pasta já tem; o que está em branco ou de exemplo cai no padrão sugerido. */
export function entradaDaConfig(c: ConfigPublica): ConfigEntrada {
  const base = entradaVazia(c.sugestoes);
  return {
    ...base,
    pastas: {
      music: c.pastas.music || base.pastas.music,
      downloads: c.pastas.downloads || base.pastas.downloads,
      incomplete: c.pastas.incomplete || base.pastas.incomplete,
    },
    slskUsuario: c.slskUsuario,
    webUsuario: c.webUsuario || base.webUsuario,
    tz: c.tz || base.tz,
    puid: c.puid || base.puid,
    pgid: c.pgid || base.pgid,
    musicbrainzContato: c.musicbrainzContato,
    abrirParaRede: c.abrirParaRede,
  };
}
