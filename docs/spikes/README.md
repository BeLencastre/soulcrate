# Investigações técnicas (spikes)

Perguntas que precisavam de resposta antes de construir o app ([especificação, §4.3](../interface-electron.md#43-investigações-técnicas-spikes)). Cada nota traz a pergunta, o que foi testado, o resultado e o que muda na implementação.

| Spike | Pergunta | Situação | Conclusão em uma linha |
| --- | --- | --- | --- |
| [SP1](sp1-deteccao-docker.md) | Como detectar Docker instalado, aberto e pronto? | Concluído | `docker desktop status --format json` + `docker version`; WSL só para diagnóstico |
| [SP2](sp2-abrir-docker-desktop.md) | Como abrir o Docker Desktop e esperar a engine? | Concluído em parte | `docker desktop start --timeout`, com o executável como plano B; partida a frio não exercitada |
| [SP3](sp3-processo-destacado.md) | O lote sobrevive ao app fechar? Dá para reconectar? | Concluído | Sim, iniciando por um PowerShell lançador com `Start-Process`; `detached: true` **não funciona** com o PowerShell |
| [SP4](sp4-tail-jsonl.md) | Ler o JSONL enquanto é escrito, sem perder nem duplicar? | Concluído | Leitura por offset + `fs.watch` + timer; 3.000 eventos sem perda |
| [SP5](sp5-navidrome-admin.md) | Criar o primeiro admin do Navidrome pela API? | Concluído | Sim: `POST /auth/createAdmin` |
| [SP6](sp6-soulbeet-config.md) | Configurar o Soulbeet sem a tela dele? | Concluído | Sim: login com a conta do Navidrome, `POST /api/config` e `POST /api/folders` |
| [SP7](sp7-webcontentsview.md) | As Web UIs dentro do app guardam o login? | Pendente | Depende do esqueleto do Electron (Fase 0); plano de teste escrito |
| [SP8](sp8-caminhos.md) | Que caminhos de pasta funcionam no Docker Desktop? | Concluído | Espaço e acento funcionam; OneDrive e discos diferentes viram avisos |

Os scripts usados estão em [`codigo/`](codigo/). São código de investigação: servem para reproduzir os resultados e não entram no app sem revisão.

Ambiente dos testes (7 de outubro de 2026): Windows 11, Docker Desktop 4.94.0 (Engine 29.8.2, Compose 5.5.1, CLI `docker desktop` 0.4.4), Node.js 24.15, Windows PowerShell 5.1.
