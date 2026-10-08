# SP5: criar o primeiro administrador do Navidrome pela API

**Pergunta.** O assistente do app consegue criar o administrador do Navidrome sem mandar o usuário ao navegador?

**Resposta: sim.**

## O que foi testado

Um contêiner descartável `deluan/navidrome:0.64.2` (a versão fixada no compose), sem volumes:

```http
POST http://localhost:4533/auth/createAdmin
Content-Type: application/json

{"username": "...", "password": "..."}
```

| Situação | Resposta |
| --- | --- |
| Banco novo, sem usuários | `200`, com `id`, `isAdmin: true`, `name`, `token` (JWT), `subsonicSalt`, `subsonicToken` |
| Já existe um administrador | `403` `{"error":"Cannot create another first admin"}` |

O `name` volta capitalizado (`probeadmin` → `Probeadmin`); o login continua sendo o `username` enviado.

`GET /ping` responde `200` com o servidor no ar (usado no healthcheck do compose).

## Receita para o app

1. Com a stack no ar e o Navidrome saudável, chamar `POST /auth/createAdmin` com o usuário e a senha escolhidos no assistente.
2. `200`: pronto. Guardar só o nome de usuário nas preferências do app; a senha não é guardada.
3. `403`: já existe administrador (instalação anterior). Pedir o login existente, que será usado também no Soulbeet ([SP6](sp6-soulbeet-config.md)).
4. Não guardar o `token` devolvido: ele não é necessário depois.

A API não é documentada como pública pelo Navidrome (é a que a própria interface usa). Ela fica fixa junto com a versão do compose; ao atualizar o Navidrome, repetir este teste.
