// Avisos do Início sobre a atualização (Fase 7): o app novo que já foi baixado e os arquivos da stack que o app trocou
// na pasta do Soulcrate. Os dois dizem o que aconteceu em linguagem simples e oferecem a ação.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { msg } from '@shared/mensagens';
import { erroInesperado, type AppError } from '@shared/erros';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { chaveArquivosDaStack, useArquivosDaStack, useEstadoAtualizacao } from '../lib/atualizacao';
import { useStackStatus } from '../lib/estado';
import { execucaoRodando, useExecucao } from '../lib/lote-store';
import { acoesDisponiveis } from '@shared/stack';
import { CartaoErro } from './CartaoErro';
import { Botao, Cartao, Rotulo } from './ui';

/** "A versão 1.2.0 está pronta": reiniciar aplica; com um lote rodando o botão espera (a §5 manda nunca atualizar no meio). */
export function AvisoDeAtualizacaoDoApp() {
  const estado = useEstadoAtualizacao();
  const loteRodando = useExecucao(execucaoRodando);
  const [adiado, setAdiado] = useState(false);
  const [erro, setErro] = useState<AppError | null>(null);
  const t = msg.atualizacao.aviso;

  if (estado?.estado === 'baixando') {
    return (
      <p role="status" className="hint m-0" data-testid="atualizacao-baixando">
        {t.baixando(estado.versao, estado.percentual)}
      </p>
    );
  }
  if (estado?.estado !== 'pronta' || adiado) return null;

  async function reiniciar() {
    setErro(null);
    try {
      const r = await api.update.restartAndInstall();
      if (!r.ok) setErro(r.erro);
    } catch (e) {
      setErro(erroInesperado(e));
    }
  }

  return (
    <Cartao
      borda="azul"
      className="flex flex-col gap-3 p-5"
      data-testid="aviso-atualizacao"
      role="region"
      aria-label={t.titulo(estado.versao)}
    >
      <Rotulo>{msg.atualizacao.procurar}</Rotulo>
      <h2 className="m-0 text-lg font-extrabold">{t.titulo(estado.versao)}</h2>
      <p className="m-0 text-sm leading-normal text-texto-claro">{loteRodando ? t.corpoLote : t.corpo}</p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" disabled={loteRodando} onClick={() => void reiniciar()}>
          {msg.atualizacao.reiniciar}
        </Botao>
        <Botao variante="fantasma" onClick={() => setAdiado(true)}>
          {t.depois}
        </Botao>
      </div>
      {erro ? <CartaoErro erro={erro} aoFechar={() => setErro(null)} /> : null}
    </Cartao>
  );
}

/** "Os arquivos da stack foram atualizados": o que mudou na pasta, e reconstruir quando a imagem ou o compose mudaram. */
export function AvisoDosArquivosDaStack() {
  const { data } = useArquivosDaStack();
  const status = useStackStatus();
  const qc = useQueryClient();
  const t = msg.arquivosDaStack.aviso;
  if (!data) return null;

  const dispensar = () => {
    seguro(api.stackFiles.dismissNotice().then(() => qc.invalidateQueries({ queryKey: chaveArquivosDaStack })));
  };

  if (data.aviso) {
    const a = data.aviso;
    const podeReconstruir = acoesDisponiveis(status).reconstruir;
    return (
      <Cartao
        borda="azul"
        className="flex flex-col gap-3 p-5"
        data-testid="aviso-arquivos-da-stack"
        role="region"
        aria-label={t.titulo}
      >
        <Rotulo>{msg.sobre.stack}</Rotulo>
        <h2 className="m-0 text-lg font-extrabold">{t.titulo}</h2>
        <p className="m-0 text-sm leading-normal text-texto-claro">{t.corpo(a.versaoAnterior, a.versaoNova)}</p>
        {a.precisaReconstruir ? <p className="m-0 text-sm leading-normal text-aviso-titulo">{t.reconstruir}</p> : null}
        {a.mantidos.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="m-0 text-sm leading-normal text-texto-claro">{t.mantidos(a.mantidos.length)}</p>
            <ul className="m-0 flex list-none flex-col p-0 font-mono text-xs text-texto-suave">
              {a.mantidos.map((m) => (
                <li key={m}>{m}.novo</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {a.precisaReconstruir ? (
            <Botao
              variante="primario"
              disabled={!podeReconstruir}
              onClick={() => {
                seguro(api.stack.up({ rebuild: true }));
                dispensar();
              }}
            >
              {t.reconstruirAgora}
            </Botao>
          ) : null}
          <Botao onClick={() => seguro(api.project.openFolder())}>{t.verPasta}</Botao>
          <Botao variante="fantasma" onClick={dispensar}>
            {msg.acoes.dispensar}
          </Botao>
        </div>
      </Cartao>
    );
  }

  if (data.pendente && data.esperando) {
    return (
      <p role="status" className="hint m-0" data-testid="arquivos-da-stack-esperando">
        {msg.arquivosDaStack.esperando}
      </p>
    );
  }
  return null;
}
