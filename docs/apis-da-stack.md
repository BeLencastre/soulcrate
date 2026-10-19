# Rotas do Navidrome e do Soulbeet que o assistente usa

O assistente do app cria o administrador do Navidrome e configura o Soulbeet sem abrir nenhuma interface web. Para isso ele chama as rotas que **as próprias interfaces usam**. Nenhum dos dois projetos as documenta como API pública, então elas só valem para as versões fixadas na stack: o Navidrome em `docker-compose.yml` e o Soulbeet pelo digest do `soulbeet/Dockerfile`.

**Ao atualizar o Navidrome ou o Soulbeet, repita os testes abaixo** (num contêiner descartável) e rode o [roteiro manual](roteiro-manual.md). O código que depende disto está em `app/src/main/services/setup-service.ts`, com os dublês em `app/tests/dubles/servicos-falsos.ts`.

Ordem do assistente: Navidrome primeiro, porque o Soulbeet entra com a conta dele.

## Navidrome: criar o primeiro administrador

```http
POST http://localhost:4533/auth/createAdmin
Content-Type: application/json

{"username": "...", "password": "..."}
```

| Situação | Resposta |
| --- | --- |
| Banco novo, sem usuários | `200`, com `id`, `isAdmin: true`, `name`, `token` (JWT), `subsonicSalt`, `subsonicToken` |
| Já existe um administrador | `403` `{"error":"Cannot create another first admin"}` |

- O `name` volta capitalizado (`probeadmin` → `Probeadmin`); o login continua sendo o `username` enviado.
- `GET /ping` responde `200` com o servidor no ar (é o healthcheck do compose).
- `200`: o app guarda só o nome de usuário, nunca a senha nem o `token`.
- `403`: já existe administrador (instalação anterior). O assistente pede o login existente e o usa também no Soulbeet, sem guardá-lo.

## Soulbeet: login, slskd e pasta da biblioteca

### Autenticação

```http
POST /api/auth/login
Content-Type: application/json

{"username": "<usuário do Navidrome>", "password": "<senha>"}
```

Devolve `200` com `{"username", "user_id", "navidrome_status": "Connected"}` e o cookie `auth_token` (HttpOnly, `SameSite=Lax`, 30 dias). Todas as rotas abaixo exigem esse cookie; sem ele, `401 No auth token found`. O app não guarda o cookie: refaz o login quando precisa.

### Configuração do slskd

```http
GET  /api/config        -> {"slskd_url": null, "slskd_api_key": null}
POST /api/config        {"config": {"slskd_url": "http://slskd:5030", "slskd_api_key": "<chave>"}}
```

- O corpo precisa do objeto `config` em volta; sem ele, `500 missing field 'config'`.
- A URL usa o **nome do contêiner** (`slskd`), não `localhost`, e a chave é a mesma de `SLSKD_API_KEY_SOULBEET`.

### Pasta da biblioteca

```http
GET  /api/folders       -> [{"id", "user_id", "name", "path"}]
POST /api/folders       {"name": "Music", "path": "/music"}
```

**O `POST` não é idempotente:** dois iguais criam duas pastas. O app consulta o `GET` antes e só cria se não houver uma com `path: "/music"`.

### Saúde

`GET /api/system/health` → `{"downloader_online", "beets_ready", "navidrome_online"}` (exige login). `downloader_online` vira `true` quando o slskd está configurado e acessível.

**Armadilha:** o Soulbeet é uma SPA, e rota que não existe devolve `200` com o HTML da interface. Por isso o `/health` da raiz não serve para checar nada; o app usa a checagem HTTP da raiz só para saber se o servidor responde.

## Como repetir o teste

1. Suba um Navidrome e um Soulbeet descartáveis, sem volumes (a imagem do Soulbeet é a que o `soulbeet/Dockerfile` constrói; as rotas aparecem no log de inicialização, `Registering: ...`).
2. Rode as chamadas acima na ordem e compare as respostas com as tabelas.
3. Se algo mudou, ajuste `setup-service.ts` e os dublês juntos e atualize este documento.
