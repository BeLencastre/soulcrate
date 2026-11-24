# Rotas do Navidrome, do Soulbeet e do Beatport que o app usa

O assistente do app cria o administrador do Navidrome e configura o Soulbeet sem abrir nenhuma interface web. Para isso ele chama as rotas que **as próprias interfaces usam**. Nenhum dos dois projetos as documenta como API pública, então elas só valem para as versões fixadas na stack: o Navidrome em `docker-compose.yml` e o Soulbeet pelo digest do `soulbeet/Dockerfile`.

**Ao atualizar o Navidrome ou o Soulbeet, repita os testes abaixo** (num contêiner descartável) e rode o [roteiro manual](roteiro-manual.md). O código que depende disto está em `app/src/main/services/setup-service.ts`, com os dublês em `app/tests/dubles/servicos-falsos.ts`.

Ordem do assistente: Navidrome primeiro, porque o Soulbeet entra com a conta dele. O [Beatport](#beatport-subgênero-pela-conta-do-usuário) é outro caso: não é do assistente, é uma consulta opcional do plugin do beets, e a fonte é um serviço de terceiros.

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

## Beatport: subgênero pela conta do usuário

O plugin `soulbeet/beets-plugins/beatport_cliente.py` (só biblioteca padrão do Python) consulta a API v4 do Beatport para descobrir gênero e sub-gênero de cada faixa (decisão no [ADR 0007](adr/0007-subgenero-na-pasta-com-beatport.md)). Só roda com uma **Conta Beatport** conectada (`BEATPORT_USERNAME` e `BEATPORT_PASSWORD` no `.env`, passados ao contêiner do Soulbeet). A base é `https://api.beatport.com/v4`.

**Esta API não é pública para nós.** O acesso normal é restrito a parceiros; o que o cliente faz é o contorno que o [beets-beatport4](https://github.com/Samik081/beets-beatport4) já usava: o client ID público que o próprio Beatport expõe na documentação, mais o login da conta do usuário. Portanto pode mudar ou ser bloqueado sem aviso.

### Fluxo de autenticação

1. **Client ID:** `GET <base>/docs/` e procurar nos scripts da página `API_CLIENT_ID: '...'`. O valor não é gravado em código nem em log.
2. **Login:** `POST <base>/auth/login/` com JSON `{"username", "password"}`; a resposta traz o cookie de sessão.
3. **Código de autorização:** `GET <base>/auth/o/authorize/?client_id=<id>&response_type=code&redirect_uri=<base>/auth/o/post-message/`, com o cookie, **sem seguir o redirecionamento**. O código vem em `code=` no cabeçalho `Location`. Esse cabeçalho chega como `location` em minúsculas, então a leitura não diferencia maiúsculas (`urllib.error.HTTPError.headers` preserva a caixa que o servidor mandou).
4. **Token:** `POST <base>/auth/o/token/` com `code`, `grant_type=authorization_code`, `redirect_uri` e `client_id` na **query** e o **corpo vazio**. Devolve `access_token`, `expires_in` e `refresh_token`.
5. **Renovação:** o mesmo endpoint com `grant_type=refresh_token` e o `refresh_token`. **É uma suposição, sem fonte confirmada**; se falhar, o cliente faz o login de novo.

O token fica em `soulbeet/data/beatport-token.json` (fora do git, excluído do pacote de suporte), porque cada `beet` é um processo novo e sem isso toda importação faria login de novo. Usuário, senha, token, `refresh_token`, client ID e cookies nunca vão para log, mensagem de erro, pacote de suporte nem teste.

### Busca

```http
GET <base>/catalog/search?q=<artista> <título sem o mix>&type=tracks&per_page=5
Authorization: Bearer <access_token>
```

A lista de faixas vem em `tracks` (ou em `results`, o cliente aceita as duas). Os campos usados de cada faixa:

| Campo | Para quê |
| --- | --- |
| `genre.name` | gênero do Beatport |
| `sub_genre.name` | sub-gênero (opcional: o selo nem sempre o preenche) |
| `mix_name` | conferir o mix do título |
| `artists[].name` | conferir o artista |

Entre as cinco respostas, a melhor vira `exata` (artista e mix conferem), `aproximada` (artista e título conferem, mas o mix difere ou a biblioteca não tem mix) ou `nao-encontrada`. Só nomes que estão em `beatport-generos.json` viram pasta: nada do texto da resposta vai direto para o disco.

### Ritmo e freio

- No máximo uma busca por faixa, **1 s** de pausa entre buscas e timeout de **15 s** por chamada, sem repetição. `User-Agent: soulcrate`.
- **Freio para o resto do processo** em 403 (verificação de navegador), 429, login recusado e 3 falhas de rede seguidas: o plugin deixa de consultar e usa as regras locais. Não há tentativa de contornar a verificação.
- `nao-encontrada` não é consultada de novo antes de 30 dias.

### Códigos do `beet beatport-testar`

| Código | Significa |
| --- | --- |
| `ok` | o login foi aceito e a busca respondeu |
| `sem-conta` | o Soulbeet não vê usuário e senha (salve a conta e reinicie a stack) |
| `login-recusado` | usuário ou senha não foram aceitos |
| `verificacao` | o Beatport pediu verificação de navegador (403) |
| `limite` | limite de taxa (429) |
| `fluxo-mudou` | o fluxo ou a resposta não são mais os esperados |
| `fora-do-ar` | rede ou serviço indisponível |

### O que se sabe e o que não

- **Confirmado** (spike de 2026-11-24, script descartável, a conta do dono do projeto, 30 faixas sorteadas): o fluxo acima funcionou; 26 de 30 faixas foram achadas (87%), e só **7 dessas 26 (27%)** traziam sub-gênero. O Beatport dá gênero padronizado para quase tudo e sub-gênero para poucas faixas.
- **Fonte das rotas:** o beets-beatport4 e o spike. Não há documentação pública que garanta o contrato.
- **Suposição:** a renovação pelo `refresh_token` (item 5).
- **Não sabemos:** o que os termos de uso do Beatport dizem sobre acesso automatizado. Não encontramos o texto sobre acesso automatizado, e o site responde 403 a clientes automatizados. O dono do projeto decidiu publicar o recurso mesmo assim (ADR 0007, condição de liberação retirada em 2026-11-24).
- **Não sabemos** por quanto tempo o client ID público e o fluxo continuam valendo.

**Para repetir o teste:** rode `beet beatport-testar` no contêiner do Soulbeet com a conta conectada (é o que o botão **Testar login** faz) e confira o código. Se o fluxo mudou, ajuste `beatport_cliente.py`, o servidor falso dos testes (`tests/soulbeet/`) e este documento juntos.

## Como repetir o teste

1. Suba um Navidrome e um Soulbeet descartáveis, sem volumes (a imagem do Soulbeet é a que o `soulbeet/Dockerfile` constrói; as rotas aparecem no log de inicialização, `Registering: ...`).
2. Rode as chamadas acima na ordem e compare as respostas com as tabelas.
3. Se algo mudou, ajuste `setup-service.ts` e os dublês juntos e atualize este documento.
