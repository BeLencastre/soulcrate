// Tela Web UI integrada (protótipo "Web UI integrada"): o Soulbeet, o slskd ou o Navidrome numa WebContentsView do
// main, posicionada sobre a área tracejada desta página. O renderer só mede a área e avisa o main.
import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { criarErro } from '@shared/erros';
import { msg } from '@shared/mensagens';
import { ehServicoId, ORDEM_WEBUI, servicoPorId, urlDoServico, type ServicoId } from '@shared/servicos';
import { servicoDe, servicoSaudavel } from '@shared/stack';
import { ledDoServico } from '../components/BarraLateral';
import { CartaoErro } from '../components/CartaoErro';
import { IconeCadeado, IconeLinkExterno, IconeRecarregar, IconeVoltar, IconeVoltarPagina } from '../components/icones';
import { Botao, classeBotao, Led, Rotulo } from '../components/ui';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { useStackStatus, useUi } from '../lib/estado';

export function WebUi() {
  const { servico: parametro } = useParams();
  const navegar = useNavigate();
  const status = useStackStatus();
  const modalAberto = useUi((s) => s.dialogoBandeja);

  const servico: ServicoId | null = ehServicoId(parametro) ? parametro : null;
  const info = servico ? servicoPorId(servico) : null;
  const estadoView = useUi((s) => (servico ? s.webui[servico] : undefined));
  const area = useRef<HTMLDivElement>(null);

  const st = servico ? servicoDe(status, servico) : null;
  const noAr = !!st && servicoSaudavel(st);
  const falhou = estadoView?.carga === 'erro';
  const mostrarView = !!servico && noAr && !falhou && !modalAberto;

  const medir = useCallback(() => {
    const r = area.current?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, []);

  // mostra a view quando o serviço está no ar e acompanha o tamanho da área
  useEffect(() => {
    if (!mostrarView || !servico) {
      seguro(api.webui.hide());
      return;
    }
    const limites = medir();
    if (limites) seguro(api.webui.show(servico, limites));
    const observador = new ResizeObserver(() => {
      const l = medir();
      if (l) seguro(api.webui.setBounds(l));
    });
    if (area.current) observador.observe(area.current);
    const aoRedimensionar = () => {
      const l = medir();
      if (l) seguro(api.webui.setBounds(l));
    };
    window.addEventListener('resize', aoRedimensionar);
    return () => {
      observador.disconnect();
      window.removeEventListener('resize', aoRedimensionar);
      seguro(api.webui.hide());
    };
  }, [mostrarView, servico, medir]);

  if (!servico || !info) {
    return (
      <div className="p-8">
        <CartaoErro erro={criarErro('servico.inacessivel', { servico: parametro ?? '' })} />
      </div>
    );
  }

  const url = estadoView?.url ?? urlDoServico(servico);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-borda-fraca bg-painel px-4 py-3">
        <Link className={classeBotao('fantasma', true)} to="/servicos">
          <IconeVoltarPagina tamanho={15} />
          {msg.webUi.voltarParaServicos}
        </Link>
        <div
          role="tablist"
          aria-label={msg.webUi.interface}
          className="inline-flex gap-[2px] rounded-lg border border-borda bg-hover p-[3px]"
        >
          {ORDEM_WEBUI.map((id) => {
            const s = servicoDe(status, id);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === servico}
                data-state={id === servico ? 'active' : 'inactive'}
                className="seg"
                onClick={() => navegar(`/servicos/web/${id}`)}
              >
                <Led cor={ledDoServico(s)} tamanho={7} />
                {servicoPorId(id).nome}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-[2px]">
          <button
            type="button"
            className="ico-btn"
            aria-label={msg.acoes.voltar}
            disabled={!estadoView?.podeVoltar}
            onClick={() => seguro(api.webui.goBack())}
          >
            <IconeVoltar />
          </button>
          <button
            type="button"
            className="ico-btn"
            aria-label={msg.acoes.recarregar}
            onClick={() => seguro(api.webui.reload())}
          >
            <IconeRecarregar />
          </button>
        </div>
        <div className="flex h-9 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-md border border-borda-fraca bg-fundo px-3 font-mono text-[13px] text-texto-suave">
          <IconeCadeado />
          <span className="truncate" data-testid="url-da-web-ui">
            {url}
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-texto-mudo">{msg.webUi.sessaoSalva}</span>
        </div>
        <Botao pequeno onClick={() => seguro(api.webui.openInBrowser(servico))}>
          <IconeLinkExterno tamanho={15} />
          {msg.acoes.abrirNoNavegador}
        </Botao>
      </div>

      <div
        ref={area}
        className="relative m-4 flex min-h-[420px] flex-1 items-center justify-center rounded-lg border border-dashed border-led-cinza bg-painel p-8"
        style={{
          backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 12px, transparent 12px 24px)',
        }}
        data-testid="area-da-web-ui"
      >
        {!noAr ? (
          <div className="w-full max-w-[520px]">
            <CartaoErro
              erro={criarErro('servico.inacessivel', { servico: info.nome })}
              aoTentarDeNovo={() => seguro(api.env.check())}
            />
          </div>
        ) : falhou ? (
          <div className="w-full max-w-[520px]">
            <CartaoErro
              erro={criarErro('servico.inacessivel', { servico: info.nome, detalhes: estadoView?.erro ?? null })}
              aoTentarDeNovo={() => seguro(api.webui.reload())}
            />
          </div>
        ) : (
          <div className="flex max-w-[520px] flex-col items-center gap-3 text-center">
            <Rotulo>{msg.webUi.particao}</Rotulo>
            <span className="text-[28px] font-extrabold" style={{ fontStretch: '112%' }}>
              {info.nome}
            </span>
            <span className="text-[15px] leading-normal text-texto-suave">
              {msg.inicio.descricaoWebUi[servico]}. {msg.webUi.explicacao}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
