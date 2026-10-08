// O que cada botão faz: liga os ids de ação do catálogo de erros (e das etapas) a chamadas de IPC e rotas.
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { LINKS, type AcaoErroId, type AppError } from '@shared/erros';
import type { EtapaAcao } from '@shared/stack';
import { api } from './api';

/** Engole a falha de uma chamada de IPC (o main já registra no log); botão nenhum deve estourar na cara do usuário. */
export function seguro(promessa: Promise<unknown>): void {
  promessa.catch((e: unknown) => console.error('IPC falhou:', e));
}

export function textoParaCopiar(erro: AppError): string {
  return [erro.titulo, erro.mensagem, erro.detalhes ? `\n${erro.detalhes}` : ''].join('\n').trim();
}

export function useAcoes() {
  const navegar = useNavigate();

  const executarAcaoErro = useCallback(
    (acao: AcaoErroId, erro: AppError, opcoes: { aoTentarDeNovo?: () => void } = {}) => {
      switch (acao) {
        case 'baixarDocker':
          return seguro(api.app.openExternal(LINKS.baixarDocker));
        case 'comoInstalarWsl':
          return seguro(api.app.openExternal(LINKS.instalarWsl));
        case 'abrirDockerDesktop':
          return seguro(api.env.startDockerDesktop());
        case 'abrirConfiguracoes':
          return void navegar('/configuracoes');
        case 'abrirAssistente':
          return void navegar('/assistente');
        case 'abrirYml':
          return seguro(api.project.openFile('slskd/slskd.yml'));
        case 'verServicos':
          return void navegar('/servicos');
        case 'tentarDeNovo':
          return opcoes.aoTentarDeNovo ? opcoes.aoTentarDeNovo() : seguro(api.env.check());
        case 'verExecucao':
          return void navegar('/lista/execucao');
        case 'abrirPastaLotes':
          return seguro(api.batch.openFolder());
        case 'copiarDetalhes':
          return seguro(api.app.copyText(textoParaCopiar(erro)));
        case 'abrirLog':
          return seguro(api.app.openLogsFolder());
      }
    },
    [navegar],
  );

  const executarAcaoEtapa = useCallback(
    (acao: EtapaAcao) => {
      switch (acao) {
        case 'baixarDocker':
          return seguro(api.app.openExternal(LINKS.baixarDocker));
        case 'abrirDockerDesktop':
          return seguro(api.env.startDockerDesktop());
        case 'abrirAssistente':
          return void navegar('/assistente');
        case 'abrirConfiguracoes':
          return void navegar('/configuracoes');
        case 'ligar':
          return seguro(api.stack.up());
        case 'verServicos':
          return void navegar('/servicos');
      }
    },
    [navegar],
  );

  return { executarAcaoErro, executarAcaoEtapa };
}
