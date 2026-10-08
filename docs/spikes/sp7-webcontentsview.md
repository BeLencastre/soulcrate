# SP7: Web UIs dentro do app

**Pergunta.** Abrindo o Soulbeet, o slskd e o Navidrome numa `WebContentsView` do Electron, o login persiste entre aberturas do app? É preciso uma partição de sessão separada?

**Situação: concluído com servidores de teste; falta uma rodada com os três serviços de verdade.** O esqueleto do Electron (Fase 0) permitiu testar o mecanismo (partições, cookies, bloqueio de navegação). Os testes usam servidores HTTP locais nas portas reais, que fazem o que os serviços fazem do ponto de vista do navegador (`Set-Cookie: auth_token`, mesma porta e host). O login real de cada serviço ainda precisa ser conferido à mão, com a stack no ar.

## O que já se sabe

- O Soulbeet guarda o login no cookie `auth_token` (HttpOnly, `SameSite=Lax`, 30 dias) ([SP6](sp6-soulbeet-config.md)).
- O slskd usa usuário e senha da Web UI (`SLSKD_WEB_USER`/`SLSKD_WEB_PASSWORD`).
- O Navidrome guarda o token no armazenamento local do navegador.
- Com o S2, as três interfaces respondem em `127.0.0.1`.

## Resultado

Testes em `app/tests/e2e/web-ui.spec.ts`, rodando o app de verdade:

1. **O login persiste.** Cada serviço abre numa `WebContentsView` com `partition: 'persist:soulcrate-webui-<serviço>'`. O cookie que o servidor define continua na partição depois de fechar e abrir o app, sem o servidor estar no ar (veio do disco). O `WebUiService` grava cookies e armazenamento ao sair (`flushStorageData` e `cookies.flushStore`).
2. **Uma partição por serviço.** Os três respondem no mesmo host (`127.0.0.1`) e cookies não são separados por porta: o Soulbeet e o slskd definindo o mesmo `auth_token` não se sobrescrevem, porque cada um tem a sua partição. Uma partição só para os três **não serve** se algum par usar o mesmo nome de cookie, e não há como garantir que não usam. A sessão do próprio app não recebe nenhum cookie das Web UIs.
3. **A view não sai da própria porta.** `will-navigate` e `window.open` só deixam navegar dentro da origem do serviço (host local e a porta dele). Outro serviço da stack ou um site externo vai para o navegador do sistema (`shell.openExternal`, só `https:` ou as três portas locais), nunca para dentro da view.
4. **Sem acesso ao IPC.** A view não tem preload: `window.soulcrate`, `require`, `process` e `ipcRenderer` não existem nela.
5. **Posicionamento.** A view cobre exatamente a área reservada da tela (medida pelo renderer, com o fator de zoom aplicado pelo main) e sai da tela quando se muda de rota ou abre um diálogo.

## Ainda a conferir à mão (stack de verdade)

- Entrar nos três serviços, fechar o app, abrir: o login continua? (Soulbeet: cookie; Navidrome: `localStorage`, que é por origem e portanto já separado; slskd: depende de como ele guarda o token.)
- O Soulbeet abre links para o Navidrome (`NAVIDROME_URL`): hoje isso vai para o navegador do sistema. Se for incômodo, dá para abrir dentro do app.
- Que a partição não aparece no pacote de suporte (§6.1, Fase 6).

## Critério de saída

Login persistente nos três serviços, sem interferência entre eles, e nenhum acesso da `WebContentsView` ao IPC do app. Atendido para o mecanismo; falta a conferência com os serviços reais.
