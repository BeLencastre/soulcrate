// Regras da importação de playlist que não dependem de React: o que o diálogo diz sobre o link colado e sobre uma
// busca que falhou.
import { msg } from '@shared/mensagens';
import { streamingPorId, type ErroPlaylist, type LinkReconhecido, type StreamingId } from '@shared/playlists';

const t = () => msg.lote.lista.playlist;

/**
 * O erro do campo de link enquanto a pessoa digita: só o que já dá para saber sem buscar (link de faixa, de álbum…).
 * `enviado`: a pessoa já tentou buscar, então link inválido ou de outro site também aparece.
 */
export function erroDoLink(r: LinkReconhecido, enviado: boolean): string | null {
  if (r.tipo === 'outro') {
    const s = streamingPorId(r.servico);
    return t().erros.naoEPlaylist(t().oque[r.conteudo], s.nome, s.menu);
  }
  if (!enviado) return null;
  if (r.tipo === 'invalido') return t().erros.invalido;
  if (r.tipo === 'desconhecido') return t().erros.desconhecido;
  return null;
}

/** Título e corpo do aviso de uma busca que falhou. */
export function textoDoErro(e: ErroPlaylist, servicoEscolhido: StreamingId): { titulo: string; corpo: string } {
  const e2 = t().erros;
  const nome = streamingPorId(e.servico ?? servicoEscolhido).nome;
  switch (e.motivo) {
    case 'nao-e-playlist':
      return {
        titulo: e2.indisponivelTitulo,
        corpo: e2.naoEPlaylist(t().oque.faixa, nome, streamingPorId(e.servico ?? servicoEscolhido).menu),
      };
    case 'desconhecido':
      return { titulo: e2.indisponivelTitulo, corpo: e2.desconhecido };
    case 'indisponivel':
      return { titulo: e2.indisponivelTitulo, corpo: e2.indisponivel(nome) };
    case 'rede':
      return { titulo: e2.redeTitulo, corpo: e2.rede };
    case 'vazia':
      return { titulo: e2.vaziaTitulo, corpo: e2.vazia };
    case 'formato':
      return { titulo: e2.formatoTitulo, corpo: e2.formato(nome) };
  }
}
