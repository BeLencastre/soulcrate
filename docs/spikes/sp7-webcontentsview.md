# SP7: Web UIs dentro do app

**Pergunta.** Abrindo o Soulbeet, o slskd e o Navidrome numa `WebContentsView` do Electron, o login persiste entre aberturas do app? É preciso uma partição de sessão separada?

**Situação: pendente.** Precisa do esqueleto do Electron (Fase 0) para ser testado de verdade. Fica para o início da Fase 1, antes da tela "Serviços".

## O que já se sabe

- O Soulbeet guarda o login no cookie `auth_token` (HttpOnly, `SameSite=Lax`, 30 dias) ([SP6](sp6-soulbeet-config.md)).
- O slskd usa usuário e senha da Web UI (`SLSKD_WEB_USER`/`SLSKD_WEB_PASSWORD`).
- O Navidrome guarda o token no armazenamento local do navegador.
- Com o S2, as três interfaces respondem em `127.0.0.1`.

## Plano de teste

1. Uma `WebContentsView` por serviço, com `partition: 'persist:soulcrate-webui'` (persistente e separada da sessão do app), sem preload e com `sandbox: true`.
2. Fazer login em cada uma, fechar o app, reabrir: o login continua?
3. Testar com **uma partição para as três** e com **uma por serviço**. Os três estão no mesmo host (`127.0.0.1`), e cookies não são separados por porta: conferir se algum serviço sobrescreve o cookie de outro com o mesmo nome. Se sim, usar uma partição por serviço.
4. Bloquear navegação para fora de `127.0.0.1:{4533,5030,9765}` (`will-navigate`, `setWindowOpenHandler` → `shell.openExternal`).
5. Conferir que a partição não aparece no pacote de suporte (a [especificação §6.1](../interface-electron.md#61-segurança-e-privacidade) proíbe segredos nele).

## Critério de saída

Login persistente nos três serviços, sem interferência entre eles, e nenhum acesso da `WebContentsView` ao IPC do app.
