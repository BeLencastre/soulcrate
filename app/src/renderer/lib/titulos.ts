// Título de cada tela (Fase 6, acessibilidade): vai para o `document.title` e para o nome da região principal, que é o
// que o leitor de tela anuncia quando a pessoa troca de tela. Função pura: o mapa de rotas fica fácil de testar.
import { msg } from '@shared/mensagens';
import { ehServicoId, servicoPorId } from '@shared/servicos';

export function tituloDaRota(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return msg.nav.inicio;
  if (p === '/assistente') return msg.assistente.titulo;
  if (p === '/lista' || p.startsWith('/lista/')) return msg.nav.lista;
  if (p === '/historico' || p.startsWith('/historico/')) return msg.nav.historico;
  if (p === '/biblioteca') return msg.nav.biblioteca;
  if (p === '/configuracoes') return msg.nav.configuracoes;
  if (p === '/servicos') return msg.nav.servicos;
  const web = /^\/servicos\/web\/([^/]+)$/.exec(p)?.[1];
  if (web !== undefined) return ehServicoId(web) ? servicoPorId(web).nome : msg.nav.servicos;
  return msg.app.nome;
}

export function tituloDaJanela(pathname: string): string {
  const t = tituloDaRota(pathname);
  return t === msg.app.nome ? t : `${t} · ${msg.app.nome}`;
}
