# SP2: abrir o Docker Desktop e esperar a engine

**Pergunta.** Como o app abre o Docker Desktop quando ele está fechado e sabe quando a engine ficou pronta, com timeout e mensagem clara?

**Situação: concluído em parte.** Os comandos foram confirmados, mas o Docker Desktop **não foi fechado e reaberto** durante a investigação, para não derrubar outros contêineres da máquina. A partida a frio precisa ser exercitada na Fase 1, numa máquina de teste.

## O que foi verificado

- O plugin de CLI do Docker Desktop (`docker desktop`, versão 0.4.4) tem `start`, `stop`, `restart` e `status`.
- `docker desktop start` aceita `--timeout <segundos>` (sai com código diferente de 0 se estourar) e `-d/--detach` (não espera).
- O executável fica em `%ProgramFiles%\Docker\Docker\Docker Desktop.exe`.

## Plano para o app

1. Se `docker desktop status` indicar que não está rodando: `docker desktop start --timeout 180` (o primeiro start depois de ligar o PC pode passar de 1 min).
2. Se o subcomando não existir (Docker Desktop antigo): abrir o executável com `shell.openPath` e passar ao passo 3.
3. Em paralelo, consultar `docker version --format "{{.Server.Version}}"` a cada 2 s até responder, com limite de 3 min, mostrando o progresso ("Abrindo o Docker Desktop… 40 s").
4. Estourou o limite: mostrar o diagnóstico do WSL ([SP1](sp1-deteccao-docker.md)) e o link de ajuda do Docker. Não tentar consertar o WSL pelo app.

## A testar na Fase 1

- Partida a frio com `docker desktop start --timeout` e o tempo real até a engine responder.
- Comportamento quando o Docker Desktop pede atualização ou aceite de termos na abertura (a CLI pode esperar uma interação na interface do Docker).
- Docker Desktop instalado só para outro usuário do Windows.
