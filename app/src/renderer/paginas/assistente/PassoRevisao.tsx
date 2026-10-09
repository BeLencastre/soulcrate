// Passo 7 do assistente: o resumo do que será gravado (sem nenhuma senha ou chave) e o que o app fará.
import type { ReactNode } from 'react';
import type { ConfigEntrada, ConfigPublica, ResultadoValidacao } from '@shared/configuracao';
import { msg } from '@shared/mensagens';
import { Chip } from '../../components/ui';
import { dataDeHoje } from '../../lib/formulario';

function Linha({ rotulo, children, ultima = false }: { rotulo: string; children: ReactNode; ultima?: boolean }) {
  return (
    <>
      <dt className={`px-4 py-3 text-texto-suave ${ultima ? '' : 'border-b border-linha'}`}>{rotulo}</dt>
      <dd className={`m-0 px-4 py-3 ${ultima ? '' : 'border-b border-linha'}`}>{children}</dd>
    </>
  );
}

export function PassoRevisao({
  dir,
  config,
  entrada,
  validacao,
}: {
  dir: string;
  config: ConfigPublica;
  entrada: ConfigEntrada;
  validacao: ResultadoValidacao | null;
}) {
  const m = msg.assistente.revisao;
  const gravar = (id: 'music' | 'downloads' | 'incomplete') => validacao?.pastas[id].gravar || entrada.pastas[id];
  const aCriar = validacao
    ? (['music', 'downloads', 'incomplete'] as const).filter((p) => validacao.pastas[p].estado === 'sera-criada')
    : [];
  const data = dataDeHoje();
  const existentes = config.envExiste || config.ymlExiste;
  const avisos = validacao?.achados.filter((a) => a.nivel === 'aviso') ?? [];
  const chavesBoas = config.campos.SOULBEET_SECRET_KEY === 'ok' && config.chaveSlskd === 'ok';
  const senhaDe = (nova: string, configurada: boolean) => (nova || configurada ? m.senhaConfigurada : '—');

  return (
    <div className="flex flex-col gap-6">
      <dl
        className="m-0 grid grid-cols-[200px_1fr] overflow-hidden rounded-lg border border-borda text-sm"
        data-testid="revisao"
      >
        <Linha rotulo={m.pasta}>
          <span className="font-mono text-[13px]">{dir}</span>
        </Linha>
        <Linha rotulo={m.biblioteca}>
          <span className="font-mono text-[13px]">{gravar('music')}</span>
        </Linha>
        <Linha rotulo={m.downloads}>
          <span className="font-mono text-[13px]">{gravar('downloads')}</span>
        </Linha>
        <Linha rotulo={m.incompletos}>
          <span className="font-mono text-[13px]">{gravar('incomplete')}</span>
        </Linha>
        <Linha rotulo={m.contaSoulseek}>
          {entrada.slskUsuario} · {senhaDe(entrada.slskSenha, config.campos.SLSK_PASSWORD === 'ok')}
        </Linha>
        <Linha rotulo={m.webui}>
          {entrada.webUsuario} · {senhaDe(entrada.webSenha, config.campos.SLSKD_WEB_PASSWORD === 'ok')}
        </Linha>
        <Linha rotulo={m.chaves} ultima>
          {chavesBoas && !entrada.regenerarChaves ? m.chavesMantidas : m.chavesDescricao(entrada.regenerarChaves)}
        </Linha>
      </dl>

      {aCriar.length > 0 ? (
        <p className="hint m-0" data-testid="pastas-a-criar">
          {m.criarPastas}: <span className="font-mono">{aCriar.map((p) => gravar(p)).join(' · ')}</span>
        </p>
      ) : null}

      {existentes ? (
        <div className="flex flex-wrap items-center gap-[10px] text-[13px] text-texto-suave" data-testid="backup">
          <Chip cor="neutro">{m.backup}</Chip>
          <span className="font-mono">
            {[config.envExiste ? `.env.bak-${data}` : null, config.ymlExiste ? `slskd.yml.bak-${data}` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ) : null}

      {avisos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="lbl">{m.avisos}</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {avisos.map((a, i) => (
              <li key={`${a.id}-${i}`} className="text-[13px] leading-normal text-chip-laranja">
                {a.mensagem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
