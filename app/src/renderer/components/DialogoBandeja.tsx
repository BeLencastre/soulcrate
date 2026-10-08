// Aviso da primeira vez que a janela é fechada (protótipo "Bandeja e notificações"): o app continua na bandeja.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router';
import { msg } from '@shared/mensagens';
import { seguro } from '../lib/acoes';
import { api } from '../lib/api';
import { useUi } from '../lib/estado';
import { Botao } from './ui';

export function DialogoBandeja() {
  const aberto = useUi((s) => s.dialogoBandeja);
  const abrir = useUi((s) => s.abrirDialogoBandeja);
  const navegar = useNavigate();
  const [naoMostrar, setNaoMostrar] = useState(false);

  function responder(irParaConfiguracoes: boolean) {
    abrir(false);
    seguro(api.app.answerClosePrompt({ naoMostrarDeNovo: naoMostrar }));
    if (irParaConfiguracoes) navegar('/configuracoes');
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={(o) => (o ? abrir(true) : responder(false))}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[10px] border border-borda-forte bg-[#17191c] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          data-testid="dialogo-bandeja"
        >
          <Dialog.Title className="m-0 text-xl font-extrabold" style={{ fontStretch: '110%' }}>
            {msg.bandeja.dicaFechar.titulo}
          </Dialog.Title>
          <Dialog.Description className="m-0 text-sm leading-[1.55] text-texto-claro">
            {msg.bandeja.dicaFechar.corpo}
          </Dialog.Description>
          <label className="inline-flex cursor-pointer items-center gap-[10px] text-[13px] text-texto-suave">
            <input
              type="checkbox"
              checked={naoMostrar}
              onChange={(e) => setNaoMostrar(e.target.checked)}
              className="size-4 accent-ambar"
            />
            {msg.bandeja.dicaFechar.naoMostrar}
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Botao onClick={() => responder(true)}>{msg.acoes.mudarNasConfiguracoes}</Botao>
            <Botao variante="primario" onClick={() => responder(false)}>
              {msg.acoes.entendi}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
