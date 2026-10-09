# Changelog

Mudanças visíveis para quem usa o Soulcrate. Formato baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

O **app desktop** e a **stack** (Docker Compose, scripts e configuração do beets) têm versões independentes: a do app está em [`app/package.json`](app/package.json) e a da stack em [`VERSION`](VERSION). Cada app traz embutida uma versão da stack e a instala na pasta do Soulcrate.

## Não lançado

Nada ainda.

## App 1.0.0 (2026-10-09)

Primeira versão do app desktop (Windows, Electron). Traz a stack 1.1.0. Instala por usuário, configura tudo por um assistente, liga e desliga a stack, roda o download em lote com progresso ao vivo, explica o que não veio, cuida da biblioteca e se atualiza sozinho. Os `.bat` continuam funcionando na mesma pasta.

> O instalador **não é assinado**: o SmartScreen avisa na primeira vez (**Mais informações → Executar assim mesmo**). Confira o SHA-256 em `SHA256SUMS.txt`. Veja [`docs/distribuicao.md`](docs/distribuicao.md).

### Adicionado

- App desktop (Electron), Fase 7: **instalador e atualização**. Instala por usuário (sem administrador), com atalho no menu Iniciar. O app procura atualização ao abrir e a cada 24 horas nos GitHub Releases e **só reinicia para atualizar quando nenhum lote está rodando**. Quando o app novo traz arquivos novos da stack (`docker-compose.yml`, scripts, `Dockerfile` do Soulbeet, config do beets), ele troca o que você não editou e, para o que você editou, **mantém o seu e grava o novo ao lado como `.novo`**, nunca tocando no `.env`, nas listas, em `lotes/` nem na biblioteca. **Desinstalar nunca apaga a pasta do Soulcrate**; pergunta (padrão: manter) só se remove as preferências e os logs do app. Quem já usa por um clone do Git escolhe "usar uma pasta que já existe": nada é copiado, e o assistente avisa se os arquivos da stack têm alterações locais. O instalador ainda não é assinado, então o SmartScreen avisa na primeira vez. Veja [`docs/distribuicao.md`](docs/distribuicao.md).
- App desktop (Electron), Fase 6: **polimento**. Tema escuro (padrão), claro ou igual ao Windows; iniciar com o Windows direto na bandeja; escolher se as interfaces web abrem dentro do app ou no navegador; avisos do Windows ligáveis. Tela **Sobre** com as versões do app, da stack e dos componentes lidas dos contêineres, créditos e licença. **Gerar pacote de suporte**: um .zip com os logs do app, os últimos `execucao-*.log`, o `docker compose ps` e as versões, **com senhas e chaves removidas** (o `.env` e o `slskd.yml` nunca entram). Navegação completa por teclado ("Pular para o conteúdo", foco visível, o foco vai ao conteúdo ao trocar de tela), contraste AA nos dois temas e uma tela que trava não derruba mais a janela inteira. Veja [`docs/interface-electron.md`](docs/interface-electron.md#fase-6-polimento).
- App desktop (Electron), Fase 5: **biblioteca e manutenção**. A tela Biblioteca ("o caixote") lista as faixas do beets com artista, título, BPM, tom, gênero e formato, com busca e indicadores do que falta (sem BPM, sem tom, em `_Sem Genero`, parados em `downloads/`). **Remover uma faixa nunca é imediato**: o app mostra tudo o que o filtro pega, avisa que o arquivo é apagado de vez (sem Lixeira) e só apaga depois da sua confirmação (em remoções grandes, digitando o número). Manutenção sem linha de comando: recalcular tom e BPM só das faixas sem, importar o que sobrou em `downloads/`, sincronizar com o disco (`update`) e reorganizar pastas (`move`), as duas últimas com pré-visualização. Mostra quantos arquivos o slskd anuncia no Soulseek, com *Reescanear*, e a pasta para monitorar no Rekordbox, com botão de copiar. Nada disso roda com a stack desligada nem com um lote em andamento. Veja [`docs/interface-electron.md`](docs/interface-electron.md#fase-5-biblioteca-e-manutenção).
- App desktop (Electron), Fase 4: **histórico e diagnóstico**. A tela Histórico lista tudo o que está em `lotes/`, inclusive o que foi rodado pelos `.bat`, com como cada execução terminou e o que saiu dela. O detalhe mostra cada faixa com o arquivo na biblioteca e "Mostrar no Explorer". O diagnóstico explica por que cada faixa não veio, na linguagem da tabela "Decida pelo motivo" do README e com a ação de cada motivo: os arquivos mais parecidos, o catálogo do artista no Soulseek, o resultado do MusicBrainz e o "talvez seja", que **corrige a linha na lista com um clique**. "Tentar de novo" gera a lista das que faltaram, com as correções, e abre as opções já ajustadas ao que os motivos pedem. Também: apagar execuções antigas (vão para a Lixeira, com prévia) e reprocessar uma lista do zero (com confirmação). Veja [`docs/interface-electron.md`](docs/interface-electron.md#fase-4-histórico-e-diagnóstico).
- App desktop (Electron), Fase 3: **download em lote pelo app**. Editor de lista com pré-visualização feita pelo próprio script (duplicadas, "já na biblioteca", "já feita", linhas com problema), importação de `.txt`/`.csv` pelo botão ou arrastando para a janela, listas recentes e criação a partir do exemplo. Tela de opções com as nove receitas do README, tudo que difere do padrão destacado e o comando equivalente. Painel ao vivo com progresso, contadores, tabela por faixa (filtro e busca), log bruto, parada segura e notificação do Windows ao terminar. **Fechar o app não interrompe o lote**: ao reabrir, o painel volta de onde estava. A mesma lista não roda duas vezes (app + `.bat`). Veja [`docs/interface-electron.md`](docs/interface-electron.md#fase-3-download-em-lote).
- App desktop (Electron), Fase 2: assistente de configuração em sete passos que cria a pasta do Soulcrate, gera o `.env` e o `slskd.yml` (a mesma API key nos dois, sem você ver nem copiar nada), faz backup do que já existia, liga a stack e termina sozinho o que antes era feito à mão nas interfaces web (administrador do Navidrome e URL, API key e pasta `/music` do Soulbeet). A tela Configurações edita tudo depois, com *Aplicar e reiniciar*. Confere a porta 2234. Veja [`docs/interface-electron.md`](docs/interface-electron.md#fase-2-assistente-de-configuração).
- App desktop (Electron), Fases 0 e 1: janela com navegação lateral, tela Início com as cinco etapas do ambiente (Docker, Docker Desktop, configuração, stack e serviços), Ligar, Desligar e Reconstruir com log ao vivo, tela Serviços com as verificações do `status.bat` e os logs de cada contêiner, Web UIs do Soulbeet, slskd e Navidrome dentro do app, ícone na bandeja com o estado da stack e instalador do Windows (NSIS, sem assinatura). Veja [`app/README.md`](app/README.md).
- Testes automatizados (Pester para os scripts; Vitest e Playwright para o app, inclusive acessibilidade com axe-core) e CI no GitHub Actions. O workflow de release gera o instalador, o `latest.yml` do atualizador e o `SHA256SUMS.txt`.

## Stack 1.1.0

Versão da stack que o app 1.0.0 traz.

### Adicionado

- Download em lote: parâmetros para programas que controlam o lote, como o app (`-Eventos`, `-ArquivoParada`, `-IdExecucao`, `-SoAnalisar`). Sem eles, nada muda. Veja [`docs/eventos-lote.md`](docs/eventos-lote.md).
- Download em lote: códigos de saída distintos (`0` concluído, `2` parado, `3` slskd fora, `4` configuração, `5` lista já rodando).
- Download em lote: a mesma lista não roda duas vezes ao mesmo tempo (trava em `lotes/estado-<lista>.lock`).
- `validar-config.ps1`: confere o `.env` e o `slskd.yml` antes de subir. Acusa campos vazios, pasta inexistente e API key diferente nos dois arquivos, e avisa sobre OneDrive, discos diferentes e chaves curtas. Regras em [`docs/validacao-configuracao.md`](docs/validacao-configuracao.md).
- Healthcheck nos três serviços (`docker compose ps` mostra `healthy`).
- Arquivo `VERSION` com a versão da stack.

### Mudado

- **As interfaces web (Soulbeet, slskd e Navidrome) passam a abrir só neste PC** (`127.0.0.1`). Para usar de outro aparelho da rede, por exemplo um app Subsonic no celular com o Navidrome, ponha `BIND_ADDR=0.0.0.0` no `.env` e rode o `subir.bat`. A porta `2234` do Soulseek não muda.
- `subir.bat` usa o `validar-config.ps1` no lugar das checagens com `findstr`.

## Stack 1.0.0

Primeira versão numerada da stack: slskd 0.26.0, Navidrome 0.64.2, Soulbeet (digest de 15/08/2026) com beets 2.11.0, keyfinder e autobpm, e o download em lote.
