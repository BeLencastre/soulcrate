# App do Soulcrate (Electron)

App desktop do Soulcrate: liga e desliga a stack (slskd, Soulbeet e Navidrome), mostra o estado de cada serviço e abre as Web UIs dentro da janela. A [especificação](../docs/interface-electron.md) tem o plano completo; **as Fases 0, 1 e 2 estão implementadas** (esqueleto, ambiente e stack, e o assistente de configuração). A tela de download em lote, o histórico e a biblioteca vêm nas próximas fases.

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
npm run stack:preparar  # junta os arquivos da stack em resources/stack (o pack:dir e o dist já fazem isso)
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

| Variável                       | Para quê                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOULCRATE_DIR`                | Pasta do Soulcrate a usar (senão: a escolhida em Configurações, a do repositório em dev, ou `%USERPROFILE%\Soulcrate`)                                                                   |
| `SOULCRATE_USER_DATA`          | Pasta de dados do app (padrão: `%APPDATA%\Soulcrate`)                                                                                                                                    |
| `SOULCRATE_SEM_DEV`            | `1`: não usar a pasta do repositório como pasta do Soulcrate                                                                                                                             |
| `SOULCRATE_SETUP_URLS`         | `{"navidrome":"http://127.0.0.1:1","soulbeet":"http://127.0.0.1:2"}`: onde a pós-configuração do assistente fala com o Navidrome e o Soulbeet (os testes apontam para servidores falsos) |
| `SOULCRATE_SLSKD_URL`          | `http://127.0.0.1:5031`: onde o `baixar-lista.ps1` fala com o slskd (`-SlskdUrl`); os testes do lote apontam para o slskd falso da suíte Pester (`tests/dubles/slskd-falso.mjs`)         |
| `SOULCRATE_DUBLE_NOTIFICACOES` | `1`: as notificações do Windows viram uma lista (`globalThis.__notificacoes`) que o teste confere, em vez de aparecer na tela                                                            |

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

| Serviço                         | O que faz                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DockerService`                 | Detecta o Docker ([SP1](../docs/spikes/sp1-deteccao-docker.md)), abre o Docker Desktop ([SP2](../docs/spikes/sp2-abrir-docker-desktop.md)) e roda `docker compose` (`up`, `down`, `ps`, `restart`, `exec`, `logs`)                                                          |
| `HealthService`                 | Sonda Docker, contêineres e endpoints HTTP a cada 5 s (30 s com a janela escondida) e publica o estado                                                                                                                                                                      |
| `OperacoesService`              | Ligar, desligar, reconstruir, reiniciar um serviço e abrir o Docker Desktop, uma de cada vez, com log ao vivo                                                                                                                                                               |
| `ChecksService`                 | As verificações do `status.bat`, em verde/amarelo/vermelho                                                                                                                                                                                                                  |
| `LogsService`                   | `docker compose logs -f` de cada contêiner, em lotes                                                                                                                                                                                                                        |
| `WebUiService`                  | As Web UIs em `WebContentsView`, uma partição de sessão por serviço ([SP7](../docs/spikes/sp7-webcontentsview.md))                                                                                                                                                          |
| `config-validacao`              | Validação do `.env` e do `slskd.yml` (S4), a mesma regra do `validar-config.ps1`                                                                                                                                                                                            |
| `ProjectService`, `AppSettings` | Onde está a pasta do Soulcrate e as preferências do app                                                                                                                                                                                                                     |
| `PastaService`                  | Passo 1 do assistente: copia os arquivos da stack para uma pasta nova (e guarda o hash deles em `.soulcrate/manifesto.json`) ou confere uma pasta existente; nunca sobrescreve nada do usuário                                                                              |
| `ConfigService`                 | Lê (sem segredos), valida e grava o `.env` e o `slskd.yml`: gera as chaves, a mesma nos dois arquivos, faz backup e confere o resultado com a validação S4; edita o `.env` linha a linha e o YAML sem perder comentários                                                    |
| `SetupService`                  | Pós-configuração com a stack no ar: liga, cria o administrador do Navidrome, configura o Soulbeet pela API e confere a porta 2234; cada tarefa é idempotente                                                                                                                |
| `ListasService`                 | As listas `.txt`/`.csv` da pasta do Soulcrate: abrir, salvar (UTF-8, por arquivo temporário), criar do exemplo, importar (por arquivo ou pelos bytes do arrastar e soltar) e analisar com `baixar-lista.ps1 -SoAnalisar`                                                    |
| `LoteService`                   | O download em lote: inicia o `baixar-lista.ps1` destacado ([SP3](../docs/spikes/sp3-processo-destacado.md)), lê o arquivo de eventos e o log por offset ([SP4](../docs/spikes/sp4-tail-jsonl.md)), para por arquivo-sinal, se reconecta a lotes vivos pela trava e notifica |

## Testes

| Nível         | Onde                         | O que cobre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unidade       | `tests/shared`, `tests/main` | Estado e etapas do Início, catálogo de erros, parsers do Docker, validação S4 (**os mesmos casos do PowerShell**, `tests/fixtures/config/casos.json`), filtro de segredos, URLs permitidas. Na Fase 2: edição do `.env` e do `slskd.yml` (comentários, CRLF, formato dos valores, backup), `ConfigService` (ler sem segredos, validar, gravar com chaves iguais nos dois arquivos) e `PastaService` (copiar a stack sem sobrescrever nada do usuário). Na Fase 3: as opções do lote (padrões lidos do `param()` do script, receitas conferidas contra o README, validação do que vem do renderer), o estado do painel calculado a partir dos eventos (contra as execuções reais gravadas em `tests/fixtures/lote/`), o leitor incremental do arquivo de eventos e a montagem do comando do lançador.      |
| Integração    | `tests/main`                 | `DockerService`, `HealthService`, `OperacoesService`, `ChecksService` e `LogsService` contra um executor falso; `ExecutorReal` com processos de verdade (inclusive a árvore de filhos). Na Fase 2: `SetupService` contra um Navidrome e um Soulbeet falsos (`tests/dubles/servicos-falsos.ts`, as rotas dos spikes SP5 e SP6), e o `validar-config.ps1` (o do `subir.bat`) conferindo o que o app gera. Na Fase 3: `LoteService` (iniciar, acompanhar, parar, reconectar, processo que some) e `ListasService` contra executores falsos, e o **PowerShell de verdade** no lançador (aspas, acentos, o lote que sobrevive ao lançador) e na análise da lista (`-SoAnalisar`).                                                                                                                              |
| Renderer      | `tests/renderer`             | A tela Início e a barra lateral (Testing Library, `window.soulcrate` simulado). Na Fase 3: as telas Lista, Opções e Execução, o iniciar com a stack desligada, a tabela virtual com 1.000 faixas e o estado do painel (`lote-store`, que não perde nem repete evento ao reconectar). Na Fase 2: o assistente (passos, validação que não fica muda, senhas que não voltam) e a tela Configurações (rascunho, banner, Salvar e Aplicar e reiniciar).                                                                                                                                                                                                                                                                                                                                                        |
| Ponta a ponta | `tests/e2e`                  | O app de verdade contra o dublê do docker: Docker fechado → abrir; ligar, desligar e reconstruir; contêiner derrubado por fora; porta em uso; configuração inválida; Web UIs (login persistente, isolamento, navegação bloqueada); segurança do renderer. Na Fase 2: instalação limpa até a stack no ar, `.env` com valores de exemplo, refazer com backup, Navidrome que já tem administrador e Configurações (`tests/e2e/fase-2.spec.ts`). Na Fase 3, com o **PowerShell e o `baixar-lista.ps1` de verdade** contra o slskd falso: lista de 30 faixas com o mesmo resultado que o script rodado direto, fechar o app no meio e reabrir, parar, a mesma lista duas vezes, editor, importar e arrastar um CSV, ligar a stack e começar, e as entradas inválidas do renderer (`tests/e2e/fase-3.spec.ts`). |

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
