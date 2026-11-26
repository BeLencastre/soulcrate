# Changelog

Mudanças visíveis para quem usa o Soulcrate. Formato baseado no [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

O **app desktop** e a **stack** (Docker Compose, scripts e configuração do beets) têm versões independentes: a do app está em [`app/package.json`](app/package.json) e a da stack em [`VERSION`](VERSION). Cada app traz embutida uma versão da stack e a instala na pasta do Soulcrate.

## Não lançado

## App 1.4.0 (2026-11-25)

Traz o subgênero na pasta e no Rekordbox, com a Conta Beatport opcional, a VIP Mix no card Versão da faixa e a stack 1.5.0.

### Adicionado

- **Subgênero na pasta e no Rekordbox (stack 1.5.0).** Em **Suas músicas → Organizar**, cada destino (**No disco** e **No Rekordbox**) passa a ter duas caixas, **Subgênero** e **Artista**, depois do gênero, que vem sempre: `Techno / Peak Time / Azyr / No Escape`, com um exemplo ao vivo do resultado. O subgênero vem **desligado** e quem atualiza não vê nada mudar; um aviso no cartão apresenta a novidade. A lista de gêneros e subgêneros é a do Beatport (`soulbeet/beets-plugins/beatport-generos.json`). Sem conta, o subgênero vem das regras locais (o `Techno (Peak Time / Driving)` da tag, que antes se perdia, e grafias como `Peak Time Techno`); música sem subgênero conhecido fica em `_Sem Subgenero`. O subgênero decidido fica no banco do beets (`subgenero_resolvido`), nunca na tag, e o Rekordbox o usa mesmo com o disco sem esse nível. **Classificar a biblioteca** decide o subgênero do que já estava lá; depois, **Reorganizar as pastas** leva os arquivos para o lugar novo ([ADR 0007](docs/adr/0007-subgenero-na-pasta-com-beatport.md)).
- **Conta Beatport (opcional), nas Configurações.** Com usuário e senha do Beatport (`BEATPORT_USERNAME` e `BEATPORT_PASSWORD` no `.env`), o Soulcrate consulta o Beatport uma vez por música, na importação ou ao classificar, para o gênero e o subgênero; as regras locais seguem como reserva, e uma falha do Beatport nunca impede a importação. **Testar login** diz se a conta funciona, e **Desconectar** apaga a conta e o token. O acesso não é oficial: o Soulcrate envia artista e título das músicas, ligados à sua conta, e pode parar de funcionar se o Beatport mudar.
- **VIP Mix no card Versão da faixa (stack 1.4.1).** Em **Baixar lista → Ajustes**, o card ganha a **VIP Mix** (`“Título (VIP Mix)”`), que pode ser arrastada e ordenada como as outras versões. Aceita no card, o arquivo com `(VIP Mix)`, `(VIP)` ou `- VIP Mix` no nome deixa de ser recusado como `outra versao ('vip')`. No script, `-Versoes` aceita o nome `vip` ([ADR 0006](docs/adr/0006-versao-da-faixa-e-formato-como-regras-obrigatorias.md#atualização-de-2026-11-23-vip-mix-no-card-e-nova-ordem-padrão)).

### Mudado

- **Nova ordem padrão do card Versão da faixa:** Extended Mix → Original Mix → Club Mix → VIP Mix → Sem versão no nome; Radio Edit em *Não baixar*. O atalho *Pista* segue essa ordem e *Tanto faz a versão* também, com a Radio Edit no fim. Original e Sem versão no nome deixam de dividir a posição; para juntar de novo, use "mesma posição da de cima". Rascunhos e lotes antigos continuam valendo com a ordem que tinham.

## App 1.3.0 (2026-11-22)

Traz as playlists do Soulcrate no Rekordbox, a organização das pastas escolhida no app, a versão e a duração da faixa como regras do download e a stack 1.4.0.

### Adicionado

- **Playlists no Rekordbox.** Em **Suas músicas → Rekordbox**, **Criar as playlists** grava um arquivo no formato oficial *rekordbox xml* com a pasta `Soulcrate`. Dentro dela, `Gêneros` tem uma playlist por pasta de gênero e `Listas` tem uma playlist por lista baixada, na ordem da lista (vale também para as faixas que já estavam na biblioteca). No Rekordbox, aponte **Preferências → Avançado → Banco de dados → rekordbox xml → Imported Library** para esse arquivo uma vez; depois, importe a pasta `Soulcrate` de *rekordbox xml* sempre que quiser trazer o que é novo. O arquivo se atualiza sozinho ao fim de cada download e de cada tarefa de Cuidar da biblioteca. O app não mexe no banco do Rekordbox: pode deixar o Rekordbox aberto. Veja o [ADR 0004](docs/adr/0004-playlists-no-rekordbox-pelo-rekordbox-xml.md).
- **Organização no disco e no Rekordbox (stack 1.4.0).** Em **Suas músicas → Organizar**, escolha separadamente como organizar **no disco** e **no Rekordbox**, cada um entre **Por gênero e artista** (como sempre foi) e **Só por gênero**. No disco, `Hard Techno/Azyr/No Escape` ou `Hard Techno/Azyr - No Escape`; vale para tudo o que o beets importar daqui em diante, também pelo Soulbeet, e para mudar o que já está no disco o cartão oferece **Reorganizar as pastas**, com prévia. No Rekordbox, uma pasta por gênero com a playlist `Todas` e uma playlist por artista, ou uma playlist por gênero; trocar refaz o arquivo de playlists na hora. As escolhas ficam em `soulbeet/data/pastas.json` (ADR 0005 (arquivado)); se o seu `config.yaml` foi editado, junte nele as mudanças do `config.yaml.novo` para a escolha do disco valer.
- **Versão da faixa (stack 1.4.0).** Em **Baixar lista → Ajustes**, o card **Versão da faixa**, entre Qualidade e Títulos, diz quais versões baixar nas linhas sem mix e em que ordem: Extended Mix, Club Mix, Original Mix, sem versão no nome (`Artista - Título.flac`, quase sempre o original) e Radio Edit. Arraste as versões entre *Baixar, nesta ordem* e *Não baixar*, ou use os botões ↑ ↓, "mesma posição da de cima" e −/+ de cada linha; pelo teclado, Espaço pega a versão, as setas a movem e Espaço a solta. Atalhos: *Pista* (o padrão: Extended → Club → Original e sem nome; Radio Edit fora), *Tanto faz a versão* e *Só Extended*. Igual nos dois modos; o Modo Dev mostra o parâmetro. No script, `-Versoes "extended,club,original+semnome"` ([ADR 0006](docs/adr/0006-versao-da-faixa-e-formato-como-regras-obrigatorias.md)).
- **Duração da faixa (stack 1.4.0).** Uma duração no fim da linha (`Creeds - Push Up (Extended Mix) 6:58`), ou a coluna *Duration (ms)* do CSV, passa a ser conferida no arquivo, com folga de 5 s (2% em faixas longas): a Radio Edit de 3:10 não passa por uma Extended de 6:58. A pré-visualização da Lista mostra a duração ao lado da versão. No card, **Duração mínima** (desligada, 3, 4, 5 ou 6 min) recusa as versões mais curtas nas linhas sem mix e sem duração; no script, `-DuracaoMinima <segundos>`.
- **Por que a faixa não veio, por regra.** Versão e formato são as duas regras obrigatórias, e o script confere as duas em cada arquivo, sem parar na primeira. Quando a faixa não vem, o diagnóstico diz se foi pela **versão** ("Só existe em versão não aceita"), pelo **formato** ou pelas **duas** ("Nenhum arquivo cumpre a versão e o formato juntos"), com os motivos novos `versao nao aceita ('radio edit')`, `duracao diferente (...)`, `curta para a versao (...)` e `versao e formato: ...`. **Tentar de novo** já abre com a versão recusada aceita no fim do card, ou com a duração mínima desligada, quando essa troca resolve. Nos eventos, `item.diagnostic` ganha `rejectedBy` e `duration`, e a análise da lista ganha `duration` por linha; campos novos, os antigos continuam iguais ([`docs/eventos-lote.md`](docs/eventos-lote.md)).
- **Análise da lista (stack 1.4.0):** com `-SoAnalisar -AnalisarBiblioteca`, cada linha traz o `libraryId`, o `$id` do beets da faixa que casa com ela (pela mesma regra do "ja na biblioteca"), também nas linhas "ja feita". É com ele que o app monta a playlist de cada lista. Campo novo, os antigos continuam iguais ([`docs/eventos-lote.md`](docs/eventos-lote.md#análise-da-lista--soanalisar)).

### Mudado

- **Escolha do arquivo no lote, pelo app (stack 1.4.0):** a versão passa na frente do formato. Uma Extended em MP3 320 (se você aceitou MP3 320) ganha de uma Original em FLAC; o formato desempata entre duas versões iguais. As descrições do card Qualidade dizem isso. **Listas que já tinham duração no fim da linha** (coladas do Beatport, por exemplo) passam a ser conferidas por ela, e `(Original Mix)` na linha deixa de aceitar a Extended. Pelo `baixar-lista.bat` sem `-Versoes`, nada muda.
- **`baixar-lista.bat`:** repassa todas as opções depois da lista (antes, só as oito primeiras palavras). Valor com vírgula vai entre aspas: `-Versoes "extended,club"`.
- **Biblioteca, nos dois modos:** a lateral virou abas (**Cuidar**, **Organizar**, **Rekordbox** e **Compartilhar**), com um cartão por vez, e a tabela de músicas vai até o fim da janela, para a lateral não passar muito da tabela e deixar a parte de baixo da tela vazia.

### Corrigido

- **Rekordbox: a instrução pedia uma "pasta monitorada" que o Rekordbox não tem.** O README e o cartão Rekordbox da Biblioteca mandavam ativar uma pasta monitorada em Preferências › Avançado, opção que não existe no Rekordbox 7. Agora o cartão cria as playlists do Soulcrate (veja "Playlists no Rekordbox", acima), e o README explica esse caminho e, para quem prefere montar as playlists à mão, a importação da pasta `music` em **Arquivo › Importar › Importar pasta**, repetida depois de cada download.
- **O ícone do Soulcrate na barra de tarefas.** A janela usa o ícone do app (e não o do Electron) e a barra de tarefas agrupa o Soulcrate com ele.

## App 1.2.0 (2026-10-19)

Traz o Modo DJ e o Modo Dev, as telas reorganizadas nos dois modos e a stack 1.3.0 (uma pasta por artista e por gênero na biblioteca).

### Adicionado

- **Modo DJ e Modo Dev.** O Modo DJ mostra só o que importa para baixar, organizar e ouvir, sem termos técnicos; o Modo Dev é o app de sempre, com as etapas do ambiente, os logs, as portas, as opções do script e a configuração completa da stack. Troque pelo alternador no rodapé da barra lateral, ou pelo atalho **Ctrl+Shift+D**. A troca muda só o que aparece: a tela atual fica onde está, nada é apagado e um download em andamento continua.
- Numa instalação nova, a tela final do assistente pergunta como você vai usar o Soulcrate, com o Modo DJ marcado. **Quem já usa o app continua no Modo Dev** até escolher outro.
- No Modo DJ:
  - o **Início** diz numa frase o que está acontecendo, com o único botão que resolve ("O player não está respondendo → Reiniciar o player"), e traz atalhos para baixar, buscar, ouvir e ver transferências, o último download e a biblioteca. O aviso "Os arquivos da stack foram atualizados" (arquivos `.novo`, reconstruir a imagem) só aparece no Modo Dev;
  - **Serviços** mostra um cartão por coisa que você usa (organização, busca e download, player, compartilhamento, pastas);
  - em **Baixar lista → Ajustes**, cada ajuste diz o que faz ("Organizar depois de baixar", "Baixa 8 faixas ao mesmo tempo.") no lugar do parâmetro do script, e o resumo fala em frases, sem o comando equivalente;
  - **Configurações** fica com Pastas, Conta Soulseek, **Compartilhamento** (músicas compartilhadas, ouvir no celular e o teste da porta) e as preferências do app.
  - Onde o Modo DJ esconde algo útil para resolver um problema, "Mostrar detalhes técnicos" leva à mesma tela no Modo Dev.

### Mudado

- **Pastas da biblioteca (stack 1.3.0): uma pasta por artista e por gênero.**
  - Faixa com vários artistas vai para a pasta do **primeiro**: `KUKO, 9inebro, NEUF` e `KUKO feat. NEUF` entram em `KUKO`, ao lado das outras faixas dele. O `&` não separa (`Above & Beyond` continua inteiro).
  - O mesmo gênero escrito de vários jeitos vai para **uma pasta só**: `Hard Dance / Hardcore / Neo Rave`, `Hard Dance;Hardcore;Neo Rave` e `Hard Dance _ Hardcore _ Neo Rave` entram em `Hard Dance`; `Techno (Peak Time / Driving)` e `Techno (Hard)` em `Techno`; `psytrance`, `Psy Trance` e `Psy-Trance` em `Psy-Trance`; `Hip Hop` em `Hip-Hop`. Gêneros diferentes continuam separados (`Hard Techno` não vira `Techno`), e um site no lugar do gênero (`djsoundtop.com`) vai para `_Sem Genero`.
  - Só o nome da pasta muda: as tags de gênero e de artista que o Rekordbox lê ficam como estão. Outras grafias podem ser juntadas em `pastas.apelidos` no `config.yaml`.
  - Vale para o que for importado daqui em diante. Para arrumar o que já está na biblioteca, depois de atualizar, rode **Suas músicas → Cuidar da biblioteca → Reorganizar as pastas**: a prévia mostra quantos arquivos mudam de lugar, e as pastas que ficarem vazias somem.
- **Biblioteca, nos dois modos:** a tela se chama **Suas músicas**; os indicadores viraram "Sem gênero" e "Esperando organizar"; a manutenção virou **Cuidar da biblioteca**, com cada tarefa explicada em palavras ("Calcular tom e BPM que faltam", "Atualizar depois de mexer nos arquivos"); o compartilhamento conta as músicas compartilhadas e o botão virou **Atualizar a lista**. O botão de abrir a pasta diz qual pasta abre ("Abrir DJ/Musics no Explorer"), e o tom aparece também na roda de Camelot ("8A Am").
- **Início, nos dois modos:** Ligar e Desligar viraram um botão só, que alterna conforme a stack está ligada ou desligada, e **Reconstruir** passou a se chamar **Reiniciar** (faz o mesmo: refaz a imagem e recria os contêineres) e aparece também no Modo DJ.
- **Configurações → Aplicativo, nos dois modos:** as preferências usam os textos mais simples ("Avisar quando um download terminar", "Abrir a busca, as transferências e o player").
- **Baixar lista, nos dois modos:** as etapas são *01 Lista · 02 Ajustes · 03 Download* (a 02 se chamava *Opções*). Os Ajustes têm o mesmo layout nos dois modos: a explicação de cada grupo embaixo do título, a qualidade em caixas de marcar e as avançadas em duas colunas; o Modo Dev continua mostrando o parâmetro do script ("-Paralelo 8") e o comando equivalente. A Lista e o Download têm os textos mais simples ("O que vai ser baixado", "Minhas listas", "Baixar 11 faixas", "3 repetidas", "Esta lista está baixando agora", "Buscando devagar", "Terminando…") e continuam com tudo o que tinham: os botões de importar, o nome do arquivo, os nove contadores, a tabela com usuário, tentativa e observação, o log bruto e os relatórios.
- **Histórico, nos dois modos:** a tela se chama **Seus downloads**, com os textos mais simples ("Ver o que faltou", "Com faixas que faltaram", "Apagar os antigos…"), e a coluna Lista mostra quantas faixas a lista tinha, no lugar de "eventos" ou "antiga · lida do resultado-*.txt".

### Corrigido

- **Baixar lista → Ajustes: clicar de novo numa receita não a desmarcava.** Agora o segundo clique desmarca e volta ao padrão só o que a receita tinha ajustado.
- **Assistente: o Avançar podia ignorar um clique feito logo depois de o passo aparecer.** Com o computador ocupado, o clique na hora em que o passo "Pastas das músicas" surgia não fazia nada e não mostrava nenhum aviso. Agora ele sempre avança.

## App 1.1.1 (2026-10-13)

Corrige o download em lote parando com "slskd não respondeu" sem o slskd ter caído. Traz a stack 1.2.1.

### Corrigido

- **Lote parava com "slskd não respondeu" sem o slskd ter caído.** Um artista escrito letra por letra (por exemplo `t e s t p r e s s`, comum em playlists importadas) gerava uma busca só pelo artista que o slskd recusa (HTTP 400: nenhum termo com mais de 1 caractere). O lote tratava a recusa como queda do slskd, repetia a busca 20 vezes e abortava. Agora essa busca é ignorada, o lote segue para a próxima etapa da faixa e continua com o resto da lista. A faixa sem busca válida aparece como "não encontrada".
- Para quem já teve o lote parado por isso: rode a lista de novo, ela continua de onde parou.

## App 1.1.0 (2026-10-13)

Importação de playlists de streaming na tela **Baixar lista**. Traz a mesma stack 1.2.0 (os arquivos da stack não mudaram).

### Adicionado

- **Baixar lista → Importar playlist:** traz uma playlist **pública** do **Spotify**, **Apple Music**, **YouTube Music** ou **Deezer** pelo link e cria uma lista `.txt` no formato Artista - Título (Mix). Antes de importar, a revisão mostra capa, faixas, duplicadas e vídeos que não parecem faixas (estes entram comentados). Colar um link de outro streaming troca o streaming sozinho; link de faixa ou álbum é recusado na hora.
- **Atualizar da playlist:** a lista importada guarda de onde veio na primeira linha (`# Spotify · Nome · link`, que o lote ignora) e traz depois só as faixas novas, no fim. As *Listas recentes* mostram o streaming de cada lista.
- Sem login e sem conta: só playlists públicas. Pelo link, o Spotify entrega no máximo 100 faixas. A Amazon Music não entrou (não há caminho gratuito para ler as playlists).

## App 1.0.1 (2026-10-09)

Muda o que o download em lote aceita por padrão e traz a stack 1.2.0. **Atenção:** o MP3 320 deixou de ser aceito por padrão (veja abaixo).

### Mudado

- **Baixar lista → Opções → Qualidade:** o lote passa a aceitar **só FLAC e WAV** por padrão (o grupo avisa "FLAC e WAV são sempre aceitos"). O resto virou opção, todas desligadas:
  - **Aceitar AAC e AIFF** (`-AceitarAacAiff`): AIFF e AAC (`.m4a`/`.aac`) de 256 kbps ou mais. AAC abaixo de 250 kbps é recusado mesmo com a opção.
  - **Aceitar MP3 320** (`-AceitarMp3320`): o MP3 320 kbps, que antes era aceito sempre.
  - **Aceitar MP3 256 e VBR (V0)** (`-AceitarMp3Menor`): continua como antes, mas agora **também aceita o MP3 320**.
- A ordem de preferência ficou FLAC, WAV, AIFF, MP3 320, AAC e MP3 256/VBR; só entram os formatos que você aceitou. A receita **Quero tudo, nem que seja MP3 256** liga as três opções.
- O diagnóstico e o "Tentar de novo" entendem os motivos novos (`formato aiff (use -AceitarAacAiff)`, `mp3 320 kbps (use -AceitarMp3320)`, `aac 128 kbps (qualidade baixa)`) e sugerem a opção certa. Execuções antigas continuam legíveis no Histórico.
- A tabela "Decida pelo motivo" e a seção de opções do README foram atualizadas.

### Removido

- `-AceitarWav`: o WAV agora é sempre aceito. A opção continua existindo no script, sem efeito, para não quebrar comandos antigos, mas saiu da tela de Opções.

## Stack 1.2.1

Versão da stack que o app 1.1.1 traz. Muda só o `baixar-lista.ps1` (e a biblioteca `baixar-lista.lib.ps1`).

### Corrigido

- Download em lote: uma busca que o slskd recusa com HTTP 400 (por exemplo, a busca só pelo artista de `t e s t p r e s s`) não é mais tratada como slskd fora do ar. A etapa é ignorada, sem gastar o limite de buscas, e o lote segue. Um aviso `search_invalid` é registrado nos eventos.

## Stack 1.2.0

Versão da stack que o app 1.0.1 traz. Muda só o `baixar-lista.ps1` (e a biblioteca `baixar-lista.lib.ps1`).

### Adicionado

- Download em lote: `-AceitarAacAiff` (AIFF e AAC de 256 kbps ou mais) e `-AceitarMp3320` (MP3 320 kbps). O bitrate do AAC que o usuário não informa é estimado por tamanho ÷ duração, como o do MP3.
- Download em lote: o evento `format` distingue `WAV`, `AIFF`, `AAC` (antes `WAV/AIFF`) e as mensagens do relatório citam os novos motivos. Veja [`docs/eventos-lote.md`](docs/eventos-lote.md).

### Mudado

- **Download em lote: por padrão só FLAC e WAV são aceitos.** O MP3 320 precisa de `-AceitarMp3320` (antes entrava sempre) e o WAV deixou de precisar de opção. Quem rodava com o padrão e dependia do MP3 320 passa a ver essas faixas como "existe, mas so em formato/qualidade recusados" no diagnóstico; rode-as de novo com `-AceitarMp3320`.
- `-AceitarMp3Menor` agora inclui o MP3 320.

### Removido

- `-AceitarWav` (sem efeito: o WAV é sempre aceito). O parâmetro ainda é aceito e ignorado.

## App 1.0.0 (2026-10-09)

Primeira versão do app desktop (Windows, Electron). Traz a stack 1.1.0. Instala por usuário, configura tudo por um assistente, liga e desliga a stack, roda o download em lote com progresso ao vivo, explica o que não veio, cuida da biblioteca e se atualiza sozinho. Os `.bat` continuam funcionando na mesma pasta.

> O instalador **não é assinado**: o SmartScreen avisa na primeira vez (**Mais informações → Executar assim mesmo**). Confira o SHA-256 em `SHA256SUMS.txt`. Veja [`docs/distribuicao.md`](docs/distribuicao.md).

### Adicionado

- App desktop (Electron), Fase 7: **instalador e atualização**. Instala por usuário (sem administrador), com atalho no menu Iniciar. O app procura atualização ao abrir e a cada 24 horas nos GitHub Releases e **só reinicia para atualizar quando nenhum lote está rodando**. Quando o app novo traz arquivos novos da stack (`docker-compose.yml`, scripts, `Dockerfile` do Soulbeet, config do beets), ele troca o que você não editou e, para o que você editou, **mantém o seu e grava o novo ao lado como `.novo`**, nunca tocando no `.env`, nas listas, em `lotes/` nem na biblioteca. **Desinstalar nunca apaga a pasta do Soulcrate**; pergunta (padrão: manter) só se remove as preferências e os logs do app. Quem já usa por um clone do Git escolhe "usar uma pasta que já existe": nada é copiado, e o assistente avisa se os arquivos da stack têm alterações locais. O instalador ainda não é assinado, então o SmartScreen avisa na primeira vez. Veja [`docs/distribuicao.md`](docs/distribuicao.md).
- App desktop (Electron), Fase 6: **polimento**. Tema escuro (padrão), claro ou igual ao Windows; iniciar com o Windows direto na bandeja; escolher se as interfaces web abrem dentro do app ou no navegador; avisos do Windows ligáveis. Tela **Sobre** com as versões do app, da stack e dos componentes lidas dos contêineres, créditos e licença. **Gerar pacote de suporte**: um .zip com os logs do app, os últimos `execucao-*.log`, o `docker compose ps` e as versões, **com senhas e chaves removidas** (o `.env` e o `slskd.yml` nunca entram). Navegação completa por teclado ("Pular para o conteúdo", foco visível, o foco vai ao conteúdo ao trocar de tela), contraste AA nos dois temas e uma tela que trava não derruba mais a janela inteira.
- App desktop (Electron), Fase 5: **biblioteca e manutenção**. A tela Biblioteca ("o caixote") lista as faixas do beets com artista, título, BPM, tom, gênero e formato, com busca e indicadores do que falta (sem BPM, sem tom, em `_Sem Genero`, parados em `downloads/`). **Remover uma faixa nunca é imediato**: o app mostra tudo o que o filtro pega, avisa que o arquivo é apagado de vez (sem Lixeira) e só apaga depois da sua confirmação (em remoções grandes, digitando o número). Manutenção sem linha de comando: recalcular tom e BPM só das faixas sem, importar o que sobrou em `downloads/`, sincronizar com o disco (`update`) e reorganizar pastas (`move`), as duas últimas com pré-visualização. Mostra quantos arquivos o slskd anuncia no Soulseek, com *Reescanear*, e a pasta para monitorar no Rekordbox, com botão de copiar. Nada disso roda com a stack desligada nem com um lote em andamento.
- App desktop (Electron), Fase 4: **histórico e diagnóstico**. A tela Histórico lista tudo o que está em `lotes/`, inclusive o que foi rodado pelos `.bat`, com como cada execução terminou e o que saiu dela. O detalhe mostra cada faixa com o arquivo na biblioteca e "Mostrar no Explorer". O diagnóstico explica por que cada faixa não veio, na linguagem da tabela "Decida pelo motivo" do README e com a ação de cada motivo: os arquivos mais parecidos, o catálogo do artista no Soulseek, o resultado do MusicBrainz e o "talvez seja", que **corrige a linha na lista com um clique**. "Tentar de novo" gera a lista das que faltaram, com as correções, e abre as opções já ajustadas ao que os motivos pedem. Também: apagar execuções antigas (vão para a Lixeira, com prévia) e reprocessar uma lista do zero (com confirmação).
- App desktop (Electron), Fase 3: **download em lote pelo app**. Editor de lista com pré-visualização feita pelo próprio script (duplicadas, "já na biblioteca", "já feita", linhas com problema), importação de `.txt`/`.csv` pelo botão ou arrastando para a janela, listas recentes e criação a partir do exemplo. Tela de opções com as nove receitas do README, tudo que difere do padrão destacado e o comando equivalente. Painel ao vivo com progresso, contadores, tabela por faixa (filtro e busca), log bruto, parada segura e notificação do Windows ao terminar. **Fechar o app não interrompe o lote**: ao reabrir, o painel volta de onde estava. A mesma lista não roda duas vezes (app + `.bat`).
- App desktop (Electron), Fase 2: assistente de configuração em sete passos que cria a pasta do Soulcrate, gera o `.env` e o `slskd.yml` (a mesma API key nos dois, sem você ver nem copiar nada), faz backup do que já existia, liga a stack e termina sozinho o que antes era feito à mão nas interfaces web (administrador do Navidrome e URL, API key e pasta `/music` do Soulbeet). A tela Configurações edita tudo depois, com *Aplicar e reiniciar*. Confere a porta 2234.
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
