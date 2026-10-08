# Validação da configuração (`.env` e `slskd/slskd.yml`)

Regras conferidas antes de subir a stack. Estão em um só lugar:

- **Implementação de referência:** [`validar-config.ps1`](../validar-config.ps1), chamado pelo `subir.bat`.
- **Casos de teste:** [`app/tests/fixtures/config/casos.json`](../app/tests/fixtures/config/casos.json), rodados por [`tests/validar-config.Tests.ps1`](../tests/validar-config.Tests.ps1). O app implementa as mesmas regras em TypeScript e precisa passar nos mesmos casos.

Mudou uma regra? Altere o script, este documento e os casos juntos.

## Como usar

```bash
powershell -File validar-config.ps1
powershell -File validar-config.ps1 -Json
powershell -File validar-config.ps1 -Raiz D:\Soulcrate
```

| Código de saída | Significado | O `subir.bat`... |
| --- | --- | --- |
| `0` | Pode subir (pode haver avisos) | segue |
| `1` | Erro no `.env` (ou nos dois arquivos) | abre o `.env` e para |
| `2` | Erro só no `slskd/slskd.yml` | abre o `slskd.yml` e para |

Com `-Json`, a saída é `{"ok": bool, "erros": n, "avisos": n, "achados": [{"id", "nivel", "arquivo", "variavel", "mensagem"}]}`. O validador **nunca mostra senhas nem chaves**: as mensagens citam o nome da variável, não o valor.

## Leitura dos arquivos

- **`.env`:** uma variável `NOME=valor` por linha; linhas que não seguem esse formato (comentários, linhas em branco) são ignoradas; espaços e aspas simples ou duplas nas pontas do valor são removidos. É a mesma leitura do `baixar-lista.ps1`.
- **`slskd.yml`:** a chave usada é a de `web.authentication.api_keys.soulbeet.key`. Se não houver a entrada `soulbeet`, vale a primeira linha `key:` do arquivo (o mesmo que o `baixar-lista.ps1` faz). Aspas em volta da chave são removidas.
- **Pastas relativas** (ex.: `./music`) são resolvidas a partir da pasta do Soulcrate.

## Regras

### Erros (impedem de subir)

| Id | Arquivo | Quando |
| --- | --- | --- |
| `ENV_AUSENTE` | `.env` | O `.env` não existe |
| `ENV_VAZIA` | `.env` | Falta ou está vazia uma destas: `PUID`, `PGID`, `TZ`, `DOWNLOADS_DIR`, `INCOMPLETE_DIR`, `MUSIC_DIR`, `SLSK_USERNAME`, `SLSK_PASSWORD`, `SLSKD_WEB_USER`, `SLSKD_WEB_PASSWORD`, `SOULBEET_SECRET_KEY` (um achado por variável) |
| `ENV_EXEMPLO` | `.env` | Algum valor ainda é o do `.env.example`: começa com `PREENCHA_` ou `troque-`, ou é `seu_usuario_soulseek` ou `sua_senha_soulseek` (um achado por variável) |
| `ENV_ID_INVALIDO` | `.env` | `PUID` ou `PGID` não é um número |
| `PASTA_INVALIDA` | `.env` | `DOWNLOADS_DIR`, `INCOMPLETE_DIR` ou `MUSIC_DIR` não é um caminho válido |
| `PASTA_INEXISTENTE` | `.env` | Uma dessas pastas não existe. O Docker não cria a origem de um bind mount: o `docker compose up` falharia |
| `CHAVES_DIFERENTES` | `.env` | `SLSKD_API_KEY_SOULBEET` está preenchida (e não é o exemplo) e é diferente da chave do `slskd.yml`. O download em lote receberia 401 |
| `YML_AUSENTE` | `slskd.yml` | O `slskd/slskd.yml` não existe |
| `YML_SEM_CHAVE` | `slskd.yml` | Não há nenhuma `key:` no arquivo |
| `YML_EXEMPLO` | `slskd.yml` | A chave ainda é `TROQUE_POR_UMA_CHAVE_ALEATORIA` |

### Avisos (aparecem, mas não impedem)

| Id | Quando |
| --- | --- |
| `PASTA_BARRA_INVERTIDA` | Um caminho de pasta usa `\`. Funciona no Windows, mas o README pede barras normais (`D:/DJ/Music`) |
| `PASTA_ONEDRIVE` | Uma pasta está dentro do OneDrive. A sincronização pode travar arquivos durante o download |
| `PASTAS_DISCOS_DIFERENTES` | `DOWNLOADS_DIR` e `MUSIC_DIR` em discos diferentes: mover cada faixa vira cópia |
| `CHAVE_CURTA` | `SOULBEET_SECRET_KEY` ou a API key do slskd com menos de 32 ou 16 caracteres, respectivamente |
| `ENV_SEM_CHAVE_LOTE` | `SLSKD_API_KEY_SOULBEET` vazia: o download em lote usa a chave do `slskd.yml` |

`PASTA_ONEDRIVE` e `PASTAS_DISCOS_DIFERENTES` dependem da máquina e por isso não estão nos casos compartilhados. Quem implementar deve testá-los à parte.

## O que não é validado

- Se a conta do Soulseek existe ou se a senha está certa (só o slskd sabe, ao conectar).
- Portas em uso (`2234`, `5030`, `9765`, `4533`): o app confere a `2234` (o assistente e a tela Configurações tentam uma conexão em `127.0.0.1`) e mostra o erro "porta em uso" quando o `docker compose up` falha por uma delas; o script não testa nenhuma.
- Espaço livre em disco: o assistente mostra o espaço livre do disco da biblioteca e avisa quando há menos de 10 GB; o script não confere.
