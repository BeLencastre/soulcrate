// Bandeja do sistema: ícone com o estado da stack (cinza, verde, amarelo, vermelho) e menu Ligar/Desligar/Abrir.
import { join } from 'node:path';
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import { msg, rotuloResumo } from '@shared/mensagens';
import { SERVICOS, type ServicoId } from '@shared/servicos';
import { acoesDisponiveis, resumirStack, type NivelBandeja, type StackStatus } from '@shared/stack';

export interface AcoesBandeja {
  abrir(): void;
  ligar(): void;
  desligar(): void;
  abrirServico(id: ServicoId): void;
  sair(): void;
}

/** Texto da linha de estado e da dica do ícone, a partir do estado da stack. */
export function textosDaBandeja(status: StackStatus): { nivel: NivelBandeja; rotulo: string; dica: string } {
  const resumo = resumirStack(status);
  const rotulo = rotuloResumo(resumo);
  return { nivel: resumo.nivel, rotulo, dica: `${msg.app.nome} — ${rotulo}` };
}

export class Bandeja {
  private readonly tray: Tray;
  private nivel: NivelBandeja | null = null;

  constructor(
    private readonly pastaDosIcones: string,
    private readonly acoes: AcoesBandeja,
    status: StackStatus,
  ) {
    this.tray = new Tray(this.icone('cinza'));
    this.tray.on('click', () => this.acoes.abrir());
    this.tray.on('double-click', () => this.acoes.abrir());
    this.atualizar(status);
  }

  private icone(nivel: NivelBandeja): Electron.NativeImage {
    return nativeImage.createFromPath(join(this.pastaDosIcones, `${nivel}.png`));
  }

  atualizar(status: StackStatus): void {
    const { nivel, rotulo, dica } = textosDaBandeja(status);
    if (nivel !== this.nivel) {
      this.tray.setImage(this.icone(nivel));
      this.nivel = nivel;
    }
    this.tray.setToolTip(dica);

    const disp = acoesDisponiveis(status);
    const itens: MenuItemConstructorOptions[] = [
      { label: msg.app.nome.toUpperCase(), enabled: false },
      { label: `■ ${rotulo}`, enabled: false },
      { type: 'separator' },
      { label: msg.bandeja.abrir, click: () => this.acoes.abrir() },
      { type: 'separator' },
      { label: msg.bandeja.ligar, enabled: disp.ligar, click: () => this.acoes.ligar() },
      { label: msg.bandeja.desligar, enabled: disp.desligar, click: () => this.acoes.desligar() },
      { type: 'separator' },
      ...(['soulbeet', 'slskd', 'navidrome'] as const).map((id): MenuItemConstructorOptions => ({
        label: SERVICOS.find((s) => s.id === id)?.nome ?? id,
        click: () => this.acoes.abrirServico(id),
      })),
      { type: 'separator' },
      { label: `${msg.bandeja.sair} (${msg.bandeja.sairDica})`, click: () => this.acoes.sair() },
    ];
    this.tray.setContextMenu(Menu.buildFromTemplate(itens));
  }

  destruir(): void {
    this.tray.destroy();
  }
}
