# SP1: detectar o Docker

**Pergunta.** Como saber, de forma confiável e rápida, se o Docker está instalado, se o Docker Desktop está aberto, se a engine responde e se o WSL 2 está ativo?

## O que foi testado

Comandos rodados no Windows 11 com o Docker Desktop aberto, medindo o tempo de cada um:

| Comando | Tempo | Para quê |
| --- | --- | --- |
| `docker --version` | ~0,8 s | Instalado? (`ENOENT` no `spawn` = não está no PATH) |
| `docker desktop status --format json` | ~0,9 s | Docker Desktop aberto? Devolve `{"SessionID": "...", "Status": "running"}` |
| `docker version --format "{{.Server.Version}}"` | ~0,7 s | Engine responde? Sai com erro se não houver servidor |
| `docker info` | ~1,7 s (e ~2 s para falhar) | Mais lento; desnecessário para a detecção |
| `docker compose version --short` | ~0,7 s | Compose v2 disponível (`5.5.1`) |
| `docker compose ps -a --format json` | ~1 s (**14 s** na primeira chamada a frio) | Contêineres da stack, um JSON por linha |
| `wsl.exe --status`, `wsl.exe -l -v` | rápido | Saída em **UTF-16LE** e **traduzida** ("Versão Padrão: 2") |

O contexto ativo é `desktop-linux` (`npipe:////./pipe/dockerDesktopLinuxEngine`).

## Conclusões para o app (`DockerService`)

Ordem de detecção, parando no primeiro problema:

1. **Instalado:** `spawn('docker', ['--version'])`. Erro `ENOENT` → não instalado; se o arquivo `%ProgramFiles%\Docker\Docker\Docker Desktop.exe` existir, está instalado mas fora do PATH (mensagem específica).
2. **Docker Desktop aberto:** `docker desktop status --format json` → `Status === "running"`. Se o subcomando não existir (Docker Desktop antigo), pular para o passo 3.
3. **Engine pronta:** `docker version --format "{{.Server.Version}}"` com código 0 e saída não vazia.
4. **Compose v2:** `docker compose version --short`.
5. **WSL:** não usar para a detecção. A saída é UTF-16LE e traduzida para o idioma do Windows, frágil de interpretar. Usar só como **diagnóstico** quando o Docker Desktop não sobe (mostrar a saída crua de `wsl --status` decodificada como UTF-16LE).

Outros pontos:

- **Timeouts:** 10 s para os comandos de detecção e 30 s para `docker compose ps`, porque a primeira chamada a frio passou de 10 s.
- `docker compose ps --format json` devolve **um objeto por linha** (NDJSON), não um array. O campo `Health` vem vazio para serviço sem healthcheck; com o S1 do compose ele passa a vir preenchido.
- Sempre passar `-f <pasta do Soulcrate>\docker-compose.yml` (ou usar `cwd`), para não depender da pasta atual.
- Fora do Soulcrate há outros contêineres na máquina: filtrar pelo projeto (`name: soulcrate` no compose, label `com.docker.compose.project=soulcrate`).
