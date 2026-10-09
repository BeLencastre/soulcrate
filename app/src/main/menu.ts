// Menu do aplicativo (aparece com Alt; a barra fica escondida). "Ajuda → Abrir pasta de logs" é da Fase 0.
import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { msg } from '@shared/mensagens';

export interface AcoesMenu {
  abrirPastaDeLogs(): void;
  /** leva à tela Configurações → Sobre, onde ficam o pacote de suporte e a atualização */
  abrirSobre(): void;
  sair(): void;
  /** só em desenvolvimento */
  devTools: boolean;
}

export function criarMenu(acoes: AcoesMenu): Menu {
  const exibir: MenuItemConstructorOptions[] = [
    { role: 'resetZoom', label: msg.menu.zoomPadrao },
    { role: 'zoomIn', label: msg.menu.zoomMais },
    { role: 'zoomOut', label: msg.menu.zoomMenos },
    { type: 'separator' },
    { role: 'togglefullscreen', label: msg.menu.telaCheia },
  ];
  if (acoes.devTools) {
    exibir.push(
      { type: 'separator' },
      { role: 'reload', label: msg.menu.recarregar },
      { role: 'toggleDevTools', label: msg.menu.ferramentasDev },
    );
  }
  return Menu.buildFromTemplate([
    {
      label: msg.menu.arquivo,
      submenu: [{ label: msg.bandeja.sair, accelerator: 'Alt+F4', click: () => acoes.sair() }],
    },
    { label: msg.menu.exibir, submenu: exibir },
    {
      label: msg.menu.ajuda,
      submenu: [
        { label: msg.menu.abrirPastaLogs, click: () => acoes.abrirPastaDeLogs() },
        { label: msg.menu.gerarPacoteSuporte, click: () => acoes.abrirSobre() },
        { type: 'separator' },
        { label: `${msg.menu.sobre} ${app.getVersion()}`, click: () => acoes.abrirSobre() },
      ],
    },
  ]);
}
