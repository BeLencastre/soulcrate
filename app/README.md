# App do Soulcrate (Electron)

App desktop do Soulcrate: liga e desliga a stack (slskd, Soulbeet e Navidrome), mostra o estado de cada serviço e abre as Web UIs dentro da janela. A [especificação](../docs/interface-electron.md) tem o plano completo; **as Fases 0 e 1 estão implementadas** (esqueleto, ambiente e stack). A tela de download em lote, o assistente de configuração, o histórico e a biblioteca vêm nas próximas fases.

## Requisitos

- Node.js 24 (`.nvmrc`). Com o nvm-windows: `nvm install 24 && nvm use 24`.
- Windows 10 ou 11. Docker Desktop só para usar a stack de verdade: desenvolver e testar **não** precisa dele (veja [Sem Docker](#desenvolver-sem-docker)).
- Para os testes do PowerShell (na raiz do repositório): Pester 5 ou mais novo (`Install-Module Pester -Scope CurrentUser`).

## Comandos

```bash
npm ci               # instala as dependências (exatamente as do package-lock.json)
npm run dev          # abre o app com recarga automática (HMR)
npm run check        # lint + formatação + tipos + testes unitários (o mesmo que o CI roda)
npm test             # só os testes unitários e de integração (Vitest)
npm run test:e2e     # build + testes ponta a ponta (Playwright, abre o app de verdade)
npm run build        # compila main, preload e renderer em out/
npm run pack:dir     # gera o app desempacotado em dist/win-unpacked (para testar sem instalar)
npm run dist         # gera o instalador NSIS em dist/ (sem assinatura)
npm run icones       # regenera os ícones em resources/ (só se o desenho mudar)
npm run format       # formata o código
```

`Soulcrate.exe --smoke-test` (no app empacotado ou instalado) abre a janela, confere o preload e o IPC e sai com código 0. É o que o CI usa para checar o instalador.

## Desenvolver sem Docker

O app chama o `docker` por um executor que, **fora do app empacotado**, aceita um dublê (`tests/dubles/docker-falso.mjs`) no lugar do Docker de verdade. É o que os testes e2e usam, e serve para mexer na interface sem derrubar a sua stack:

```powershell
$env:SOULCRATE_DOCKER_DUBLE = "$PWD\tests\dubles\docker-falso.mjs"
$env:SOULCRATE_DUBLE_ESTADO = "$env:TEMP\docker-mundo.json"
$env:SOULCRATE_HTTP_DUBLE = '1'      # as Web UIs contam como "respondendo"
'{"engineProntaEm":0,"containers":{}}' | Set-Content $env:SOULCRATE_DUBLE_ESTADO
npm run dev
```

O arquivo de estado é o "mundo" do Docker falso: editá-lo à mão simula o que acontece por fora (por exemplo, trocar `"slskd": { "estado": "exited" }` equivale a um `docker stop slskd`). Os campos estão descritos no cabeçalho do dublê.

Outras variáveis (só fora do app empacotado, e só para desenvolvimento e testes):

| Variável              | Para quê                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SOULCRATE_DIR`       | Pasta do Soulcrate a usar (senão: a escolhida em Configurações, a do repositório em dev, ou `%USERPROFILE%\Soulcrate`) |
| `SOULCRATE_USER_DATA` | Pasta de dados do app (padrão: `%APPDATA%\Soulcrate`)                                                                  |
| `SOULCRATE_SEM_DEV`   | `1`: não usar a pasta do repositório como pasta do Soulcrate                                                           |

## Estrutura

| Caminho         | Conteúdo                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/`     | Processo principal: serviços (`services/`), IPC, janela, bandeja, menu, log                                                                  |
| `src/preload/`  | `window.soulcrate`: a API mínima e tipada que o renderer enxerga (nenhum `ipcRenderer` cru)                                                  |
| `src/renderer/` | A interface (React, React Router, Tailwind, TanStack Query, Zustand)                                                                         |
| `src/shared/`   | O que main e renderer compartilham: contrato do IPC, modelo de estado, catálogo de erros, mensagens em português, tipos do protocolo do lote |
| `resources/`    | Ícones (app e bandeja), gerados por `scripts/gerar-icones.mjs`                                                                               |
| `tests/`        | Vitest (`main/`, `shared/`, `renderer/`), Playwright (`e2e/`), dublê do docker (`dubles/`) e fixtures                                        |

### Serviços do main (§3.2 da especificação)

| Serviço                         | O que faz                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DockerService`                 | Detecta o Docker ([SP1](../docs/spikes/sp1-deteccao-docker.md)), abre o Docker Desktop ([SP2](../docs/spikes/sp2-abrir-docker-desktop.md)) e roda `docker compose` (`up`, `down`, `ps`, `restart`, `exec`, `logs`) |
| `HealthService`                 | Sonda Docker, contêineres e endpoints HTTP a cada 5 s (30 s com a janela escondida) e publica o estado                                                                                                             |
| `OperacoesService`              | Ligar, desligar, reconstruir, reiniciar um serviço e abrir o Docker Desktop, uma de cada vez, com log ao vivo                                                                                                      |
| `ChecksService`                 | As verificações do `status.bat`, em verde/amarelo/vermelho                                                                                                                                                         |
| `LogsService`                   | `docker compose logs -f` de cada contêiner, em lotes                                                                                                                                                               |
| `WebUiService`                  | As Web UIs em `WebContentsView`, uma partição de sessão por serviço ([SP7](../docs/spikes/sp7-webcontentsview.md))                                                                                                 |
| `config-validacao`              | Validação do `.env` e do `slskd.yml` (S4), a mesma regra do `validar-config.ps1`                                                                                                                                   |
| `ProjectService`, `AppSettings` | Onde está a pasta do Soulcrate e as preferências do app                                                                                                                                                            |

## Testes

| Nível         | Onde                         | O que cobre                                                                                                                                                                                                                                              |
| ------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unidade       | `tests/shared`, `tests/main` | Estado e etapas do Início, catálogo de erros, parsers do Docker, validação S4 (**os mesmos casos do PowerShell**, `tests/fixtures/config/casos.json`), filtro de segredos, URLs permitidas                                                               |
| Integração    | `tests/main`                 | `DockerService`, `HealthService`, `OperacoesService`, `ChecksService` e `LogsService` contra um executor falso; `ExecutorReal` com processos de verdade (inclusive a árvore de filhos)                                                                   |
| Renderer      | `tests/renderer`             | A tela Início e a barra lateral (Testing Library, `window.soulcrate` simulado)                                                                                                                                                                           |
| Ponta a ponta | `tests/e2e`                  | O app de verdade contra o dublê do docker: Docker fechado → abrir; ligar, desligar e reconstruir; contêiner derrubado por fora; porta em uso; configuração inválida; Web UIs (login persistente, isolamento, navegação bloqueada); segurança do renderer |

Os testes e2e **nunca** tocam na sua stack, nos seus dados nem no seu navegador: `shell.openExternal` é trocado por um registro. As Web UIs são testadas com servidores HTTP locais nas portas 5030 e 9765; se a stack de verdade estiver no ar (portas ocupadas), esses testes são pulados. As capturas de tela ficam em `test-results/capturas/`.

## Segurança (§6.1)

- Renderer com `contextIsolation`, `sandbox`, sem `nodeIntegration` e com CSP sem `unsafe-eval` (no build); permissões negadas.
- Navegação e `window.open` bloqueados; links externos só `https:` ou as três Web UIs locais, por `shell.openExternal`.
- Todo canal de IPC confere o remetente (só a janela principal, só páginas do app) e valida os argumentos.
- Segredos só no main: o estado e a configuração que chegam ao renderer trazem nomes de variáveis, nunca valores. O log passa pelo filtro `redigirSegredos`.
- Comandos externos sempre com lista de argumentos (`spawn(cmd, args)`), nunca com string de shell; todo filho é encerrado, com a árvore inteira, ao sair.

## Logs

`%APPDATA%\Soulcrate\logs\main.log` (rotativo, 5 MB), também em "Ajuda → Abrir pasta de logs" (tecla Alt mostra o menu).

## Convenções

- TypeScript estrito; todo o app em TypeScript.
- Commits no padrão [Conventional Commits](../CONTRIBUTING.md#commits).
- Textos da interface em português do Brasil, num só arquivo (`src/shared/mensagens.ts`), com o vocabulário do README ("lista", "lote", "biblioteca", "faixa").
- Identidade visual dos protótipos (`soulcrate-prototipos`): tokens de cor e tipografia em `src/renderer/estilos.css`.

## Fixtures do lote

As fixtures do lote são geradas rodando o script de verdade. Regenere sempre que o protocolo mudar:

```bash
powershell -File ..\tests\Gerar-Fixtures.ps1
```

Elas ficam com os bytes exatos que o PowerShell grava (BOM e CRLF nos `.txt`, `.gitattributes` com `-text`). O código do app precisa lidar com isso. Não formate nem edite as fixtures à mão. O slskd falso (`../tests/dubles/slskd-falso.mjs`) também serve para os testes de integração do app.
