# SP6: configurar o Soulbeet sem a tela dele

**Pergunta.** As configurações que hoje são feitas à mão na interface do Soulbeet (URL do slskd, API key, pasta `/music`) podem ser gravadas pelo app?

**Resposta: sim, pela API HTTP do próprio Soulbeet.** Não há variável de ambiente nem arquivo para isso.

## O que foi testado

A imagem `local/soulbeet-dj:latest` (construída a partir do digest fixado no `soulbeet/Dockerfile`), num contêiner descartável ligado a um Navidrome descartável. As rotas aparecem no log de inicialização do Soulbeet (`Registering: ...`).

### Autenticação

```http
POST /api/auth/login
Content-Type: application/json

{"username": "<usuario do Navidrome>", "password": "<senha>"}
```

Devolve `200` com `{"username", "user_id", "navidrome_status": "Connected"}` e o cookie `auth_token` (HttpOnly, válido por 30 dias). Todas as rotas abaixo exigem esse cookie; sem ele, `401 No auth token found`.

### Configuração do slskd

```http
GET  /api/config        -> {"slskd_url": null, "slskd_api_key": null}
POST /api/config        {"config": {"slskd_url": "http://slskd:5030", "slskd_api_key": "<chave>"}}
```

O corpo precisa do objeto `config` em volta: sem ele, `500 missing field 'config'`. O `GET` seguinte devolveu os valores gravados.

### Pasta da biblioteca

```http
GET  /api/folders       -> [{"id", "user_id", "name", "path"}]
POST /api/folders       {"name": "Music", "path": "/music"}
```

**Não é idempotente:** dois `POST` iguais criaram duas pastas. O app precisa consultar o `GET` antes e só criar se não houver uma com `path: "/music"`.

### Saúde

`GET /api/system/health` → `{"downloader_online", "beets_ready", "navidrome_online"}` (exige login). `downloader_online` passa a `true` quando o slskd está configurado e acessível. **Atenção:** as rotas que não existem devolvem `200` com o HTML da interface (é uma SPA), então `/health` não serve para checar nada.

## Receita para o app (assistente, depois do [SP5](sp5-navidrome-admin.md))

1. `POST /api/auth/login` com o usuário do Navidrome.
2. `POST /api/config` com `http://slskd:5030` (nome do contêiner, não `localhost`) e a mesma chave de `SLSKD_API_KEY_SOULBEET`.
3. `GET /api/folders`; se não houver `/music`, `POST /api/folders`.
4. `GET /api/system/health` para confirmar `downloader_online: true` e `beets_ready: true`.
5. Não guardar o cookie: refazer o login quando precisar.

Como no SP5, essa API é a que a interface do Soulbeet usa, não uma API documentada. Ela fica fixa junto com o digest da imagem; ao atualizar o Soulbeet, repetir este teste.
