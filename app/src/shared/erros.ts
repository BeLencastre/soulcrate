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
  | 'porta.em-uso'
  | 'servico.inacessivel'
  | 'operacao.falhou'
  | 'inesperado';

/** Ações que um erro pode oferecer; o renderer liga cada uma a um comportamento. */
export type AcaoErroId =
  | 'baixarDocker'
  | 'comoInstalarWsl'
  | 'abrirDockerDesktop'
  | 'abrirConfiguracoes'
  | 'escolherPasta'
  | 'verServicos'
  | 'tentarDeNovo'
  | 'copiarDetalhes'
  | 'abrirLog';

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
      return { codigo, ...e.projetoAusente, acoes: [acao('escolherPasta', A.escolherPasta, true)], detalhes };
    case 'config.invalida':
      return {
        codigo,
        titulo: e.configInvalida.titulo,
        mensagem: e.configInvalida.mensagem(ctx.problemas ?? 1),
        acoes: [acao('abrirConfiguracoes', A.abrirConfiguracoes, true)],
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
