// Atualização dos arquivos da stack que o app instalou na pasta do Soulcrate (§3.3, Fase 7) e a migração de uma
// pasta que já existia (clone do Git). Só tipos e as regras puras; o main lê e grava o disco.

/** O que fazer com um arquivo da stack, comparando o da pasta, o que o app instalou e o que o app traz agora. */
export type AcaoDoArquivo =
  /** igual ao que o app traz: nada a fazer (só o manifesto passa a conhecê-lo) */
  | 'igual'
  /** não está na pasta: copia */
  | 'copiar'
  /** a pasta tem o que o app instalou antes (ninguém editou) e o app traz outro: substitui */
  | 'atualizar'
  /** o usuário editou: mantém o dele e grava o novo ao lado, como `<arquivo>.novo` */
  | 'manter-e-oferecer'
  /** o usuário editou e a versão nova já está ao lado desde antes: nada a fazer */
  | 'manter-ja-oferecido'
  /** o app não traz mais esse arquivo (não deveria acontecer) */
  | 'sem-origem';

export interface HashesDoArquivo {
  /** SHA-256 do arquivo na pasta do Soulcrate; null se não existe */
  atual: string | null;
  /** SHA-256 do que o app instalou (manifesto); null se o manifesto não o conhece */
  instalado: string | null;
  /** SHA-256 do arquivo que o app traz agora; null se o app não o traz */
  doApp: string | null;
  /** SHA-256 da versão nova que já está ao lado como `.novo` (manifesto); null se nenhuma */
  jaOferecido: string | null;
  /** o `.novo` ainda existe no disco */
  novoExiste: boolean;
}

/**
 * A regra da §3.3: "se o hash atual bate com o instalado, substitui; se não bate (o usuário editou), mantém o arquivo,
 * grava o novo como `.novo` e avisa". Um arquivo que o manifesto não conhece (o usuário já tinha uma versão diferente
 * quando o app instalou) conta como editado: o app nunca sobrescreve o que não sabe de onde veio.
 */
export function decidirAcao(h: HashesDoArquivo): AcaoDoArquivo {
  if (h.doApp === null) return 'sem-origem';
  if (h.atual === null) return 'copiar';
  if (h.atual === h.doApp) return 'igual';
  if (h.instalado !== null && h.atual === h.instalado) return 'atualizar';
  // editado pelo usuário (ou de origem desconhecida)
  if (h.instalado !== null && h.instalado === h.doApp) return 'manter-ja-oferecido'; // o app não tem versão nova dele
  if (h.jaOferecido === h.doApp && h.novoExiste) return 'manter-ja-oferecido';
  return 'manter-e-oferecer';
}

/** Arquivos cuja mudança só vale depois de reconstruir a stack (imagem do Soulbeet, compose, config do beets). */
export function exigeReconstruir(arquivo: string): boolean {
  return arquivo === 'docker-compose.yml' || arquivo.startsWith('soulbeet/');
}

export interface ResultadoAtualizacaoStack {
  /** epoch ms */
  aplicadoEm: number;
  versaoAnterior: string | null;
  versaoNova: string | null;
  /** substituídos (ninguém os tinha editado) */
  atualizados: string[];
  /** não existiam e foram copiados */
  copiados: string[];
  /** o usuário os editou: ficam como estão e a versão nova está em `<arquivo>.novo` */
  mantidos: string[];
  /** algum arquivo mudado só vale depois de reconstruir a stack */
  precisaReconstruir: boolean;
  /** o aviso no Início foi dispensado */
  dispensado: boolean;
}

export type MotivoSemGestao =
  /** nenhuma pasta do Soulcrate */
  | 'sem-pasta'
  /** o app não traz os arquivos da stack (desenvolvimento sem a pasta de recursos) */
  | 'sem-origem'
  /** a pasta já existia quando o app a adotou (clone do Git): quem a atualiza é quem a criou */
  | 'pasta-existente';

export interface EstadoDaStack {
  /** o app instalou os arquivos desta pasta (há `.soulcrate/manifesto.json`) e cuida da atualização deles */
  gerenciada: boolean;
  motivoSemGestao: MotivoSemGestao | null;
  versaoDaPasta: string | null;
  versaoDoApp: string | null;
  /** há o que atualizar agora */
  pendente: boolean;
  /** a atualização está esperando (um lote está rodando) */
  esperando: boolean;
  /** quantos arquivos mudariam */
  arquivosPendentes: number;
  /** o resultado da última atualização, enquanto o aviso não foi dispensado */
  aviso: ResultadoAtualizacaoStack | null;
}

/** O que a análise de uma pasta que já existia (clone do Git) achou. */
export interface MigracaoInfo {
  /** a pasta tem `.git` */
  clone: boolean;
  /** o git diz que estes arquivos da stack têm alterações locais (só com `.git` e o git instalado) */
  alteracoesLocais: string[];
  /** arquivos da stack que diferem dos que este app traz (versão diferente ou editados) */
  diferentesDoApp: string[];
  /** não deu para consultar o git (não instalado, "dubious ownership"…): só vale `diferentesDoApp` */
  gitIndisponivel: boolean;
}

/**
 * Os arquivos de que o assistente avisa ao adotar uma pasta que já existia. Só um clone do Git entra: com o git, valem
 * as alterações locais que ele aponta; sem o git, a comparação com os arquivos do app (aproximada, pode ser só uma
 * versão diferente). Uma pasta que não é clone (o ZIP do GitHub, por exemplo) não gera aviso.
 */
export function arquivosParaAvisar(m: MigracaoInfo): string[] {
  if (!m.clone) return [];
  return m.gitIndisponivel ? m.diferentesDoApp : m.alteracoesLocais;
}
