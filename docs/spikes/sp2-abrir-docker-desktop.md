# SP2: abrir o Docker Desktop e esperar a engine

**Pergunta.** Como o app abre o Docker Desktop quando ele está fechado e sabe quando a engine ficou pronta, com timeout e mensagem clara?

**Situação: implementado na Fase 1 (`DockerService.abrirDockerDesktop`), com a partida a frio ainda por exercitar.** Os comandos foram confirmados, mas o Docker Desktop **não foi fechado e reaberto** durante a investigação nem durante a implementação, para não derrubar outros contêineres da máquina. A lógica está coberta por testes com um executor falso e pelo e2e com o dublê do `docker`; falta rodá-la contra o Docker Desktop de verdade fechado, numa máquina de teste.

## O que foi verificado

- O plugin de CLI do Docker Desktop (`docker desktop`, versão 0.4.4) tem `start`, `stop`, `restart` e `status`.
- `docker desktop start` aceita `--timeout <segundos>` (sai com código diferente de 0 se estourar) e `-d/--detach` (não espera).
- O executável fica em `%ProgramFiles%\Docker\Docker\Docker Desktop.exe`.

## Plano para o app

1. Se a engine não responde: `docker desktop start --detach` (o app faz a própria espera, em vez do `--timeout` da CLI, para mostrar o progresso).
2. Se o subcomando não existir (Docker Desktop antigo): abrir o executável com `shell.openPath` e passar ao passo 3.
3. Em paralelo, consultar `docker version --format "{{.Server.Version}}"` a cada 2 s até responder, com limite de 3 min, mostrando o progresso ("Abrindo o Docker Desktop… 40 s").
4. Estourou o limite: mostrar o diagnóstico do WSL ([SP1](sp1-deteccao-docker.md)) e o link de ajuda do Docker. Não tentar consertar o WSL pelo app.

## Como ficou na Fase 1

- `docker desktop start --detach`; se a CLI não tiver o subcomando, `shell.openPath` no `Docker Desktop.exe`.
- A engine é consultada a cada 2 s (`docker version`), por até 3 min; o progresso ("Esperando a engine ficar pronta… 18 s") vem do estado da stack.
- Estourou o limite: erro `docker.timeout` do catálogo (abrir o Docker Desktop, ver se pede atualização ou termos, conferir o WSL 2).
- Docker não instalado: `docker.ausente`, com o link de download e o guia do WSL 2.

## Ainda a testar

- Partida a frio com `docker desktop start --timeout` e o tempo real até a engine responder.
- Comportamento quando o Docker Desktop pede atualização ou aceite de termos na abertura (a CLI pode esperar uma interação na interface do Docker).
- Docker Desktop instalado só para outro usuário do Windows.
