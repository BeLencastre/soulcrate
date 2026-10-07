import { createHashRouter } from 'react-router';
import { msg } from '@shared/mensagens';
import { App, Pagina } from './App';
import { Configuracoes } from './paginas/Configuracoes';
import { EmBreve } from './paginas/EmBreve';
import { Inicio } from './paginas/Inicio';
import { Servicos } from './paginas/Servicos';
import { WebUi } from './paginas/WebUi';

// HashRouter: o app empacotado carrega de file://, onde não há servidor para rotas de caminho.
export const roteador = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <Pagina>
            <Inicio />
          </Pagina>
        ),
      },
      {
        path: 'lista',
        element: (
          <Pagina>
            <EmBreve nome={msg.nav.lista} />
          </Pagina>
        ),
      },
      {
        path: 'historico',
        element: (
          <Pagina>
            <EmBreve nome={msg.nav.historico} />
          </Pagina>
        ),
      },
      {
        path: 'biblioteca',
        element: (
          <Pagina>
            <EmBreve nome={msg.nav.biblioteca} />
          </Pagina>
        ),
      },
      {
        path: 'servicos',
        element: (
          <Pagina>
            <Servicos />
          </Pagina>
        ),
      },
      { path: 'servicos/web/:servico', element: <WebUi /> },
      {
        path: 'configuracoes',
        element: (
          <Pagina>
            <Configuracoes />
          </Pagina>
        ),
      },
    ],
  },
]);
