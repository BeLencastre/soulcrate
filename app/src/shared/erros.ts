// Catálogo de erros conhecidos (§6.3): título, explicação em linguagem simples e a ação oferecida.
// Erro inesperado nunca mostra só a pilha: sempre "Copiar detalhes" e "Abrir log".
import { msg } from './mensagens.js';
import type { OperacaoStack } from './stack.js';

export type ErroCodigo =
  | 'docker.ausente'
  | 'docker.fora-do-path'
  | 'docker.fechado'
  | 'docker.timeout'
  | 'compose.ausente'
  | 'projeto.ausente'
  | 'config.invalida'
  | 'config.nao-gravou'
  | 'config.yml-invalido'
  | 'pasta.nao-instalou'
  | 'setup.falhou'
  | 'porta.em-uso'
  | 'servico.inacessivel'
  | 'operacao.falhou'
  | 'lote.lista-rodando'
  | 'lote.stack-fora'
  | 'lote.nao-iniciou'
  | 'lote.slskd-fora'
  | 'lote.config'
  | 'lote.erro'
  | 'lote.interrompido'
  | 'inesperado';

/** Ações que um erro pode oferecer; o renderer liga cada uma a um comportamento. */
export type AcaoErroId =
  | 'baixarDocker'
  | 'comoInstalarWsl'
  | 'abrirDockerDesktop'
  | 'abrirConfiguracoes'
  | 'abrirAssistente'
  | 'verServicos'
  | 'tentarDeNovo'
  | 'copiarDetalhes'
  | 'abrirLog'
  | 'abrirYml'
  | 'verExecucao'
  | 'abrirPastaLotes';

export interface AcaoErro {
  id: AcaoErroId;
  rotulo: string;
  primaria: boolean;
}

export interface AppError {
  codigo: ErroCodigo;
  titulo: string;
  mensagem: string;
  acoes: AcaoErro[];
  /** texto técnico para "Copiar detalhes" (sem segredos) */
  detalhes: string | null;
}

const A = msg.acoes;
const acao = (id: AcaoErroId, rotulo: string, primaria = false): AcaoErro => ({ id, rotulo, primaria });

export interface ContextoErro {
  detalhes?: string | null;
  /** porta em uso (porta.em-uso) */
  porta?: string;
  /** nome do serviço (servico.inacessivel) */
  servico?: string;
  /** quantidade de problemas (config.invalida) */
  problemas?: number;
  operacao?: OperacaoStack | 'reiniciando';
  /** passo da pós-configuração que falhou (setup.falhou): "o Soulbeet", "o Navidrome" */
  passo?: string;
  /** lista do lote (lote.lista-rodando) */
  lista?: string;
  /** desde quando a lista está rodando, como a trava registrou (lote.lista-rodando) */
  desde?: string;
}

export function criarErro(codigo: ErroCodigo, ctx: ContextoErro = {}): AppError {
  const detalhes = ctx.detalhes ?? null;
  const e = msg.erro;
  switch (codigo) {
    case 'docker.ausente':
      return {
        codigo,
        ...e.dockerAusente,
        acoes: [acao('baixarDocker', A.baixarDocker, true), acao('comoInstalarWsl', A.comoInstalarWsl)],
        detalhes,
      };
    case 'docker.fora-do-path':
      return {
        codigo,
        ...e.dockerForaDoPath,
        acoes: [acao('tentarDeNovo', A.tentarDeNovo, true), acao('baixarDocker', A.baixarDocker)],
        detalhes,
      };
    case 'docker.fechado':
      return { codigo, ...e.dockerFechado, acoes: [acao('abrirDockerDesktop', A.abrirDocker, true)], detalhes };
    case 'docker.timeout':
      return {
        codigo,
        ...e.dockerTimeout,
        acoes: [
          acao('tentarDeNovo', A.tentarDeNovo, true),
          acao('comoInstalarWsl', A.comoInstalarWsl),
          acao('copiarDetalhes', A.copiarDetalhes),
        ],
        detalhes,
      };
    case 'compose.ausente':
      return { codigo, ...e.composeAusente, acoes: [acao('baixarDocker', A.baixarDocker, true)], detalhes };
    case 'projeto.ausente':
      return { codigo, ...e.projetoAusente, acoes: [acao('abrirAssistente', A.abrirAssistente, true)], detalhes };
    case 'config.invalida':
      return {
        codigo,
        titulo: e.configInvalida.titulo,
        mensagem: e.configInvalida.mensagem(ctx.problemas ?? 1),
        acoes: [acao('abrirConfiguracoes', A.abrirConfiguracoes, true)],
        detalhes,
      };
    case 'config.nao-gravou':
      return {
        codigo,
        ...e.configNaoGravou,
        acoes: [
          acao('tentarDeNovo', A.tentarDeNovo, true),
          acao('copiarDetalhes', A.copiarDetalhes),
          acao('abrirLog', A.abrirLog),
        ],
        detalhes,
      };
    case 'config.yml-invalido':
      return {
        codigo,
        ...e.configYmlInvalido,
        acoes: [acao('abrirYml', A.abrirYml, true), acao('copiarDetalhes', A.copiarDetalhes)],
        detalhes,
      };
    case 'pasta.nao-instalou':
      return {
        codigo,
        ...e.pastaNaoInstalou,
        acoes: [
          acao('tentarDeNovo', A.tentarDeNovo, true),
          acao('copiarDetalhes', A.copiarDetalhes),
          acao('abrirLog', A.abrirLog),
        ],
        detalhes,
      };
    case 'setup.falhou':
      return {
        codigo,
        titulo: e.setupFalhou.titulo(ctx.passo ?? 'a configuração'),
        mensagem: e.setupFalhou.mensagem,
        acoes: [
          acao('tentarDeNovo', A.tentarDeNovo, true),
          acao('verServicos', A.verServicos),
          acao('copiarDetalhes', A.copiarDetalhes),
        ],
        detalhes,
      };
    case 'porta.em-uso': {
      const porta = ctx.porta ?? '?';
      return {
        codigo,
        titulo: e.portaEmUso.titulo(porta),
        mensagem: e.portaEmUso.mensagem(porta),
        acoes: [acao('tentarDeNovo', A.tentarDeNovo, true), acao('copiarDetalhes', A.copiarDetalhes)],
        detalhes,
      };
    }
    case 'servico.inacessivel':
      return {
        codigo,
        titulo: e.servicoInacessivel.titulo(ctx.servico ?? 'serviço'),
        mensagem: e.servicoInacessivel.mensagem,
        acoes: [acao('verServicos', A.verServicos, true), acao('tentarDeNovo', A.tentarDeNovo)],
        detalhes,
      };
    case 'operacao.falhou':
      return {
        codigo,
        titulo: e.operacaoFalhou.titulo(ctx.operacao ?? 'ligando'),
        mensagem: e.operacaoFalhou.mensagem,
        acoes: [acao('copiarDetalhes', A.copiarDetalhes, true), acao('abrirLog', A.abrirLog)],
        detalhes,
      };
    case 'lote.lista-rodando':
      return {
        codigo,
        titulo: e.loteListaRodando.titulo(ctx.lista ?? 'Esta lista'),
        mensagem: e.loteListaRodando.mensagem(ctx.desde ?? null),
        acoes: [acao('verExecucao', A.verExecucao, true)],
        detalhes,
      };
    case 'lote.stack-fora':
      return { codigo, ...e.loteStackFora, acoes: [acao('verServicos', A.verServicos, true)], detalhes };
    case 'lote.nao-iniciou':
      return {
        codigo,
        ...e.loteNaoIniciou,
        acoes: [
          acao('tentarDeNovo', A.tentarDeNovo, true),
          acao('copiarDetalhes', A.copiarDetalhes),
          acao('abrirLog', A.abrirLog),
        ],
        detalhes,
      };
    case 'lote.slskd-fora':
      return {
        codigo,
        ...e.loteSlskdFora,
        acoes: [acao('verServicos', A.verServicos, true), acao('abrirPastaLotes', A.abrirPastaLotes)],
        detalhes,
      };
    case 'lote.config':
      return {
        codigo,
        ...e.loteConfig,
        acoes: [
          acao('abrirConfiguracoes', A.abrirConfiguracoes, true),
          acao('copiarDetalhes', A.copiarDetalhes),
          acao('abrirPastaLotes', A.abrirPastaLotes),
        ],
        detalhes,
      };
    case 'lote.interrompido':
      return {
        codigo,
        ...e.loteInterrompido,
        acoes: [acao('copiarDetalhes', A.copiarDetalhes, true), acao('abrirPastaLotes', A.abrirPastaLotes)],
        detalhes,
      };
    case 'lote.erro':
      return {
        codigo,
        ...e.loteErro,
        acoes: [
          acao('copiarDetalhes', A.copiarDetalhes, true),
          acao('abrirPastaLotes', A.abrirPastaLotes),
          acao('abrirLog', A.abrirLog),
        ],
        detalhes,
      };
    case 'inesperado':
      return {
        codigo,
        ...e.inesperado,
        acoes: [acao('copiarDetalhes', A.copiarDetalhes, true), acao('abrirLog', A.abrirLog)],
        detalhes,
      };
  }
}

/** Qualquer coisa lançada vira um erro "inesperado" com os detalhes (mensagem e pilha) para copiar. */
export function erroInesperado(causa: unknown): AppError {
  const detalhes = causa instanceof Error ? (causa.stack ?? causa.message) : String(causa);
  return criarErro('inesperado', { detalhes });
}

/** Links externos das ações de ambiente (abertos com shell.openExternal, só https). */
export const LINKS = {
  baixarDocker: 'https://www.docker.com/products/docker-desktop/',
  instalarWsl: 'https://learn.microsoft.com/pt-br/windows/wsl/install',
} as const;
