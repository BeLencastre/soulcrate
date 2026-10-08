// Tela Configurações (Fase 1, parcial): pasta do Soulcrate, conferência do .env e do slskd.yml e a preferência da bandeja.
// O assistente que gera os arquivos e a edição completa chegam na Fase 2 (protótipo "Configurações").
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { msg } from '@shared/mensagens';
import type { AchadoConfig } from '@shared/stack';
import { Botao, CabecalhoPagina, Cartao, Chip, Rotulo } from '../components/ui';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { useStackStatus } from '../lib/estado';

function LinhaAchado({ a }: { a: AchadoConfig }) {
  return (
    <li className="flex items-start gap-3 border-t border-[#22252a] py-[10px] text-[13px]" data-achado={a.id}>
      <Chip cor={a.nivel === 'erro' ? 'vermelho' : 'laranja'}>
        {a.nivel === 'erro' ? msg.configuracoes.erro : msg.configuracoes.aviso}
      </Chip>
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="leading-normal text-texto-claro">{a.mensagem}</span>
        <span className="font-mono text-xs text-texto-mudo">
          {a.arquivo}
          {a.variavel ? ` · ${a.variavel}` : ''}
        </span>
      </div>
    </li>
  );
}

export function Configuracoes() {
  const status = useStackStatus();
  const qc = useQueryClient();
  const [erroPasta, setErroPasta] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ['app', 'settings'], queryFn: () => api.app.getSettings() });
  const config = status.configuracao;
  const dir = status.projeto.dir;

  async function escolherPasta() {
    setErroPasta(null);
    try {
      const r = await api.project.pickFolder();
      if (r?.erro) setErroPasta(r.erro);
    } catch (e) {
      console.error('project.pickFolder falhou:', e);
    }
  }

  async function mudarBandeja(valor: boolean) {
    const novo = await api.app.setSettings({ minimizarParaBandeja: valor });
    qc.setQueryData(['app', 'settings'], novo);
  }

  return (
    <div className="flex flex-col gap-7">
      <CabecalhoPagina
        rotulo={msg.configuracoes.rotulo}
        titulo={msg.configuracoes.titulo}
        subtitulo={msg.configuracoes.subtitulo}
      />

      <Cartao como="section" className="flex flex-col gap-3 p-5" aria-label={msg.configuracoes.pasta}>
        <Rotulo>{msg.configuracoes.pasta}</Rotulo>
        <p className="m-0 font-mono text-[15px] font-bold break-all" data-testid="pasta-do-projeto">
          {dir ?? msg.configuracoes.semPasta}
        </p>
        {status.projeto.origem ? (
          <p className="m-0 text-[13px] text-texto-suave">{msg.configuracoes.pastaOrigem[status.projeto.origem]}</p>
        ) : null}
        {erroPasta ? (
          <p role="alert" className="m-0 text-[13px] text-chip-vermelho">
            {erroPasta}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Botao variante={dir ? 'padrao' : 'primario'} pequeno onClick={() => void escolherPasta()}>
            {msg.acoes.escolherPasta}
          </Botao>
          {dir ? (
            <Botao variante="fantasma" pequeno onClick={() => seguro(api.project.openFolder())}>
              {msg.acoes.abrirPasta}
            </Botao>
          ) : null}
        </div>
      </Cartao>

      <Cartao como="section" className="flex flex-col gap-3 p-5" aria-label={msg.configuracoes.conferencia}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Rotulo>{msg.configuracoes.conferencia}</Rotulo>
          {config.estado === 'valida' ? (
            <Chip cor={config.avisos > 0 ? 'laranja' : 'verde'}>
              {config.avisos > 0 ? msg.configuracoes.estado.avisos : msg.configuracoes.estado.valida}
            </Chip>
          ) : config.estado === 'invalida' ? (
            <Chip cor="vermelho">{msg.configuracoes.estado.invalida}</Chip>
          ) : null}
        </div>

        {config.estado === 'sem-projeto' ? (
          <p className="m-0 text-sm leading-normal text-texto-suave">{msg.configuracoes.sempasta}</p>
        ) : config.achados.length === 0 ? (
          <p className="m-0 text-sm leading-normal text-texto-claro">{msg.configuracoes.tudoCerto}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {config.achados.map((a, i) => (
              <LinhaAchado key={`${a.id}-${a.variavel ?? ''}-${i}`} a={a} />
            ))}
          </ul>
        )}

        {config.estado !== 'sem-projeto' ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Botao pequeno onClick={() => seguro(api.config.check())}>
              {msg.configuracoes.conferirDeNovo}
            </Botao>
            <Botao variante="fantasma" pequeno onClick={() => seguro(api.project.openFile('.env'))}>
              {msg.configuracoes.abrirEnv}
            </Botao>
            <Botao variante="fantasma" pequeno onClick={() => seguro(api.project.openFile('slskd/slskd.yml'))}>
              {msg.configuracoes.abrirYml}
            </Botao>
          </div>
        ) : null}
      </Cartao>

      <Cartao como="section" className="flex flex-col gap-3 p-5" aria-label={msg.configuracoes.preferencias}>
        <Rotulo>{msg.configuracoes.preferencias}</Rotulo>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-[3px] size-4 accent-ambar"
            checked={settings.data?.minimizarParaBandeja ?? true}
            disabled={!settings.data}
            onChange={(e) => void mudarBandeja(e.target.checked)}
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{msg.configuracoes.bandeja}</span>
            <span className="text-[13px] leading-normal text-texto-suave">{msg.configuracoes.bandejaDica}</span>
          </span>
        </label>
      </Cartao>
    </div>
  );
}
