import { createHashRouter } from 'react-router';
import { msg } from '@shared/mensagens';
import { App, Pagina } from './App';
import { Assistente } from './paginas/Assistente';
import { Configuracoes } from './paginas/Configuracoes';
import { EmBreve } from './paginas/EmBreve';
import { Inicio } from './paginas/Inicio';
import { DetalheDaExecucao } from './paginas/historico/Detalhe';
import { DiagnosticoDasFaltas } from './paginas/historico/Diagnostico';
import { Historico } from './paginas/historico/Historico';
import { Execucao } from './paginas/lote/Execucao';
import { Lista } from './paginas/lote/Lista';
import { Opcoes } from './paginas/lote/Opcoes';
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
            <Lista />
          </Pagina>
        ),
      },
      {
        path: 'lista/opcoes',
        element: (
          <Pagina>
            <Opcoes />
          </Pagina>
        ),
      },
      {
        path: 'lista/execucao',
        element: (
          <Pagina>
            <Execucao />
          </Pagina>
        ),
      },
      {
        path: 'historico',
        element: (
          <Pagina>
            <Historico />
          </Pagina>
        ),
      },
      {
        path: 'historico/:runId',
        element: (
          <Pagina>
            <DetalheDaExecucao />
          </Pagina>
        ),
      },
      {
        path: 'historico/:runId/faltas',
        element: (
          <Pagina>
            <DiagnosticoDasFaltas />
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
      { path: 'assistente', element: <Assistente /> },
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
