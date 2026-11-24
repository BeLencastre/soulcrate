# 0007. Subgênero na pasta e no Rekordbox, com o Beatport (pela conta do usuário) como fonte e regras locais de reserva

- Status: Aceito (etapas 1 a 3 implementadas em 2026-11-24; o recurso do Beatport foi liberado pelo dono do projeto, ver [Condição de liberação](#condição-de-liberação))
- Data: 2026-11-24

## Contexto

Hoje a biblioteca é organizada por **gênero** ou por **gênero e artista**, com uma escolha para o disco e outra para o Rekordbox (ADR 0005, arquivado). A pessoa quer um nível a mais, o **subgênero**: `Techno/Peak Time`, `Trance (Main Floor)/Tech Trance`. Duas perguntas precisam de resposta: qual é a lista de subgêneros, e de onde sai o subgênero correto de cada faixa. E a tela precisa deixar a pessoa montar a organização com os níveis que quiser, no disco e no Rekordbox.

### O que já existe

- O plugin `soulbeet/beets-plugins/pastas.py` decide o nome da pasta de gênero (`$genero_pasta`). Ele **descarta** o qualificador entre parênteses: `Techno (Peak Time / Driving)` vira `Techno`. A informação de subgênero que o arquivo traz se perde.
- As escolhas moram em `soulbeet/data/pastas.json` (`disco` e `rekordbox`, cada uma `genero` ou `genero-artista`), porque o Soulbeet importa sem o app. O `config.yaml` é arquivo da stack (se foi editado, a versão nova fica ao lado como `.novo`).
- **A árvore de playlists do Rekordbox é montada pelo caminho do arquivo no disco** (`generoDaPasta` e `artistaDaPasta`, em `shared/rekordbox.ts`): o gênero é a primeira pasta, e o artista, a segunda pasta ou o texto antes do primeiro " - ". Isso funciona enquanto o disco tem os mesmos níveis. Um subgênero **só no Rekordbox**, com o disco sem ele, não está no caminho.
- O app lê a biblioteca com `beet ls -f` (`FORMATO_LS`, em `biblioteca-service.ts`) e só roda os subcomandos de uma lista fechada no código.
- A regra "só o nome da pasta muda, as tags ficam" vale desde o início, porque o Rekordbox lê as tags originais.

### O que as medições mostraram

**A tag quase nunca traz o subgênero.** Na biblioteca de teste (301 faixas, 299 com artista e título): 61 `Techno`, 19 `Hard Techno`, 26 vazias, 8 `Techno (Peak Time / Driving)`, 4 `Techno (Raw / Deep / Hypnotic)`, além de lixo como `Электронная музыка`, `Électronique, Techno` e listas enormes. Nenhuma tag traz "Peak Time", "Driving" ou "Raw" separado; só aparecem textos soltos do MusicBrainz ("Peak Time Techno", "Minimal Techno"). Ler só a tag cobriria pouquíssimas faixas.

**O Beatport tem a taxonomia que a pessoa quer.** A página do suporte para selos, [Beatport Genres](https://greenroomsupport.beatport.com/hc/en-us/articles/41043520429076-Beatport-Genres-Including-NEW-Open-Format-Genres) (atualizada em setembro de 2026), lista os gêneros e sub-gêneros aceitos (apêndice A). *Hard Techno* é um gênero próprio, sem sub-gêneros, e o Techno é dividido em dois gêneros, `Techno (Peak Time / Driving)` e `Techno (Raw / Deep / Hypnotic)`. O sub-gênero é **opcional**: o selo pode enviá-lo no XML, e o Beatport não o atualiza depois por esse caminho.

**O Beatport só é consultável com a conta do usuário.** Em 2026-11-24:

- as páginas do site respondem **403 com verificação de navegador** a clientes automatizados (não contornamos isso);
- a API v4 responde 401 sem login; o acesso "normal" é restrito a parceiros (citação de segunda mão: um serviço para "licenciados pré-aprovados");
- o plugin `beatport` do beets está obsoleto desde a 2.8. O [beets-beatport4](https://github.com/Samik081/beets-beatport4) usa um contorno: o client ID público da documentação (`api.beatport.com/v4/docs/`) mais usuário e senha da conta;
- **não encontramos o texto dos termos de uso sobre acesso automatizado** (ver [Condição de liberação](#condição-de-liberação)).

**O spike de 2026-11-24 confirmou que o contorno funciona hoje.** Foi um script descartável (stdlib do Python), rodado pelo dono do projeto com a própria conta, sobre 30 faixas sorteadas da biblioteca, uma busca por faixa com 2 s de pausa:

| Resultado | Faixas |
| --- | --- |
| Login e busca funcionaram | sim |
| Encontradas com artista e título conferindo | 26 de 30 (87%): 10 com o mix igual e 16 em que a biblioteca não tinha mix no título e o Beatport trouxe `(Original Mix)` (conferidas à mão: eram a faixa certa) |
| Não encontradas | 4 de 30 (13%) |
| Dos casamentos, com sub-gênero | **7 de 26 (27%)** |

Gênero e sub-gênero do Beatport nos 26 casamentos: Psy-Trance 8 (sem sub-gênero), Hard Techno 7 (sem), Hard Dance / Hardcore / Neo Rave 4 (Neo Rave), Techno (Peak Time / Driving) 2 (sem), Trance (Main Floor) 3 (1 Tech Trance, 1 Hard Trance, 1 sem), Electronica 1, Mainstage 1 (Speed House).

O Beatport dá um **gênero limpo e padronizado para quase toda a biblioteca** (corrigiu `Электронная музыка` para Hard Techno e `Progressive Metal` para Psy-Trance), mas dá **subgênero para uma minoria**, porque o selo não o preenche. Nenhuma fonte resolve o subgênero de todas as faixas. O Beatport também discorda da tag em alguns casos (uma faixa de Sara Landry está como Hard Techno na tag e como Hard Dance / Hardcore / Neo Rave no Beatport).

## Decisão

### 1. A organização é montada por níveis, com duas escolhas por destino

O gênero é sempre o primeiro nível. Para cada destino, **disco** e **Rekordbox**, a pessoa liga ou desliga o **subgênero** e o **artista**, e a ordem é fixa: `Gênero / Subgênero / Artista`. As quatro combinações (Gênero; Gênero / Subgênero; Gênero / Artista; Gênero / Subgênero / Artista) saem dessas duas escolhas, e o cartão mostra o resultado com um exemplo ao vivo (ver [item 9](#9-o-app)). Foram consideradas quatro opções fixas (radio); a escolha por níveis ganhou por ser mais compacta (4 caixas em vez de 8 cartões grandes), mostrar que são duas decisões independentes e crescer sem multiplicar opções (ver [Alternativas](#alternativas-consideradas)).

**Formato em `pastas.json`, só com chaves a mais** (arquivo antigo continua válido):

```json
{
  "disco": "genero-artista",
  "rekordbox": "genero-artista",
  "subgenero": { "disco": false, "rekordbox": false }
}
```

- `disco` e `rekordbox` seguem com o significado de hoje: `genero` ou `genero-artista` (a escolha do **artista**). A chave nova `subgenero` diz, por destino, se o nível de subgênero entra.
- **O Beatport não tem chave própria**: ele é usado quando há uma **Conta Beatport conectada** (usuário e senha no `.env`, [item 7](#7-a-conta-beatport-nas-configurações)). Desconectar apaga as credenciais e o token, e a consulta para. Isso evita o estado confuso de "Beatport ligado, mas sem conta".
- O plugin e o app leem o arquivo de forma tolerante: chave ausente ou inválida vale o padrão. Um app antigo que regrave o arquivo perde a chave nova, e volta o padrão (desligado); é seguro.

**Padrão: o subgênero fica desligado**, nos dois destinos, para todos (decisão do dono do projeto, 2026-11-24, revista no mesmo dia: ligado por padrão fazia a maior parte das importações novas cair em `_Sem Subgenero` sem a conta do Beatport e mudava o comportamento de quem já usa). Quem atualiza não vê nada mudar, e o `pastas.json` antigo continua valendo. O cartão mostra, na primeira abertura depois da atualização, um aviso de novidade que apresenta o subgênero e leva às caixas (o aviso some quando a pessoa o dispensa ou mexe numa das caixas).

**Ao ligar o subgênero sem conta**, o cartão não liga em silêncio: mostra um painel curto dizendo que o subgênero funciona bem com a conta do Beatport e que, sem ela, muitas faixas ficam em `_Sem Subgenero`. Os botões são **Conectar conta** (leva às Configurações, seção Conta Beatport) e **Continuar sem conta** (liga o subgênero só com as regras locais). Nenhum dos dois é obrigatório: a conta é opcional, e o Techno que já traz `Peak Time / Driving` ou `Raw / Deep / Hypnotic` na tag é aproveitado sem ela. Com a conta já conectada, a caixa liga direto.

### 2. A taxonomia é a do Beatport, num arquivo de dados

`soulbeet/beets-plugins/beatport-generos.json` guarda a lista do apêndice A: para cada gênero do Beatport, a **pasta de gênero**, o **qualificador** (se houver) e os **sub-gêneros**. Plugin e testes leem o mesmo arquivo.

- **A pasta de gênero continua sendo o nome curto de hoje**, para as pastas que já existem não mudarem de nome: `Techno (Peak Time / Driving)` e `Techno (Raw / Deep / Hypnotic)` caem em `Techno`; `Trance (Main Floor)` e `Trance (Raw / Deep / Hypnotic)` caem em `Trance`; `Hard Dance / Hardcore / Neo Rave` cai em `Hard Dance`; `Minimal / Deep Tech` cai em `Minimal`; os demais mantêm o nome (`Hard Techno`, `Psy-Trance`, `Melodic House & Techno`…). A tabela `GENEROS_CANONICOS` do `pastas.py` continua valendo para o que não vem do Beatport.
- **Nome seguro para pasta:** o Beatport usa `/` em nomes (`Deep / Hypnotic`). O `/` vira ` - ` (`Deep - Hypnotic`), e só nomes da tabela viram pasta (ver [Segurança](#segurança)).

### 3. A regra do subgênero

O subgênero da faixa é, nesta ordem:

1. o **sub-gênero do Beatport**, quando a faixa tem (`Tech Trance`, `Neo Rave`, `Speed House`, `Psy-Techno`…);
2. o **qualificador do gênero**, quando o gênero é uma metade de uma família dividida: `Peak Time - Driving` e `Raw - Deep - Hypnotic` (Techno), `Main Floor` e `Raw - Deep - Hypnotic` (Trance);
3. senão, `_Sem Subgenero` (no estilo de `_Sem Genero`, sem acento).

Com o nível de subgênero ligado, **todas** as faixas ganham o nível, para a pasta de gênero nunca misturar subpastas com arquivos soltos. Desligado, o nível não existe.

A regra 2 faz `Techno/Peak Time - Driving` conviver com `Techno/Peak Time` e `Techno/Driving`. É o custo de manter a divisão Peak Time / Raw, que é o que a pessoa mais quer; fica nos [pontos em aberto](#pontos-em-aberto).

### 4. O resolvedor em camadas

Uma função pura em `pastas.py` (`resolver_genero_e_subgenero`), testável sem beets, recebe o que as camadas encontraram e devolve `(pasta_de_genero, subgenero)`. Ordem, da primeira que responder:

1. **Beatport**, se há Conta Beatport conectada e a faixa tem resultado guardado. É o **plano A**.
2. **Tag e MusicBrainz**: o gênero da tag, tratado como hoje, mais o qualificador entre parênteses (que hoje se perde) e aliases de texto do `beatport-generos.json` (`Peak Time Techno` → Peak Time, `Minimal Techno` → Minimal, `Psytrance` → Psy-Trance…). Cobre a faixa que o Beatport não achou e quem não usa o Beatport.
3. **Sem subgênero**: `_Sem Subgenero`, com a pasta de gênero pela regra atual.

A reserva roda sempre que o Beatport não responde: sem conta conectada, faixa não encontrada, fora do ar ou bloqueado. **Uma falha do Beatport nunca impede a importação nem muda o caminho de quem não usa a opção.**

### 5. O resultado fica no banco do beets, não no arquivo

Campos flexíveis do beets (guardados em `.beets_library.db`, **não gravados na tag**):

- `beatport_id`, `beatport_genero`, `beatport_subgenero`, `beatport_situacao` (`exata`, `aproximada` ou `nao-encontrada`) e `beatport_em` (data da consulta);
- **`subgenero_resolvido`**: o subgênero que o resolvedor decidiu (já com o nome seguro de pasta), gravado **sempre**, com o nível ligado ou não. É o que permite ao Rekordbox mostrar subgênero **mesmo com o disco sem ele**.

A consulta roda **uma vez por faixa**. "Reorganizar as pastas" (`beet move`) só lê o que está guardado, sem rede. `nao-encontrada` não se repete antes de 30 dias. A confirmação de que os campos flexíveis não vão para a tag é um teste da etapa 2, no beets 2.11 real. Os campos entram na prévia de "Reorganizar" para a pessoa ver de onde saiu cada subgênero. Faixa que nunca passou pelo resolvedor (importada antes) não tem `subgenero_resolvido` e vale `_Sem Subgenero` até ser classificada ([item 8](#8-a-biblioteca-existente)).

### 6. A consulta ao Beatport (`beatport.py`, só biblioteca padrão)

Um módulo novo ao lado do `pastas.py`, em `soulbeet/beets-plugins/`. **Só `urllib`**: a imagem do Soulbeet é distroless e não se adiciona pacote pip por causa disso (nenhuma dependência nova no mapa).

- **Autenticação**: o fluxo `authorization_code` que o spike validou: client ID lido dos scripts de `api.beatport.com/v4/docs/`, `POST /auth/login/` com usuário e senha, `GET /auth/o/authorize/` (o código vem no cabeçalho `Location`, sem seguir o redirecionamento, lido sem diferenciar maiúsculas) e `POST /auth/o/token/`.
- **Token guardado**: cada `beet` é um processo novo, então o token (e o `refresh_token`) vai para `soulbeet/data/beatport-token.json`, com permissão restrita, fora do git, reaproveitado até expirar. Sem isso, cada importação faria login de novo.
- **Busca**: `GET /catalog/search/?q=<artista> <título sem mix>&type=tracks&per_page=5`. O melhor resultado entre os cinco:
  - `exata`: artista confere e o mix do título confere;
  - `aproximada`: artista e título conferem, mas o mix difere ou a biblioteca não tem mix (o gênero quase nunca muda entre mixes); fica marcada para auditoria;
  - senão, `nao-encontrada`.
- **Ritmo e freio**: no máximo uma busca por faixa, 1 s de pausa mínima e nenhuma repetição. Qualquer 403 (verificação de navegador), 429 ou login recusado **liga um freio para o resto do processo**: o plugin para de consultar, cai na reserva local e registra uma linha de log sem dado secreto. Não há tentativa de contornar a verificação.
- **Importação**: o plugin consulta no estágio de importação de cada faixa (que já tem artista e título do MusicBrainz ou do Bandcamp). Timeout de 15 s por chamada; se o Beatport demorar, a faixa segue sem ele.

### 7. A Conta Beatport nas Configurações

Em **Configurações** nasce a seção **Conta Beatport**, ao lado de **Conta Soulseek**, com o mesmo desenho (`SecaoBeatport` em `secoes-config.tsx`, com `Campo` de usuário e `CampoSenha`).

- **Variáveis do `.env`**: `BEATPORT_USERNAME` e `BEATPORT_PASSWORD`, opcionais, documentadas (comentadas) no `.env.example` e passadas ao contêiner do Soulbeet pelo `environment:` do `docker-compose.yml`. Nunca no `config.yaml`, no `pastas.json`, no código, nos logs, nos testes ou no pacote de suporte.
- **Validação**: a conta é **opcional** (diferente da do Soulseek). Vazia é válido. Só usuário ou só senha avisa "preencha os dois ou deixe os dois vazios". O app não grava a senha em lugar nenhum além do `.env` (`config-service.ts`, `config-arquivos.ts`, `shared/configuracao.ts`).
- **Segredos**: `infra/seguranca.ts` passa a mascarar `BEATPORT_PASSWORD` e o `beatport-token.json`, e o pacote de suporte exclui o token.
- **Testar login**: um botão na seção roda o subcomando `beet beatport-testar` (login e **uma** busca) e mostra "funcionou" ou o motivo (login recusado, verificação de navegador, limite de taxa, fluxo mudou). Roda pelo mesmo executor do `biblioteca-service`, que ganha os subcomandos novos na lista fechada. A lógica fica toda em Python, sem duplicar o fluxo no app.
- **Conectar e desconectar**: salvar usuário e senha **conecta** a conta (o Beatport passa a ser a camada 1 do resolvedor); o botão **Desconectar** apaga as duas variáveis do `.env` e o `beatport-token.json`. Os campos já gravados no banco do beets ficam (são dados da faixa).
- **Texto de consentimento** na seção, em palavras simples: o Soulcrate usa a sua conta para consultar o Beatport, envia artista e título das faixas, o acesso não é oficial e pode parar de funcionar; nada se perde se parar.
- **Modo DJ**: a seção entra em "Suas coisas" (Pastas, Conta Soulseek, **Conta Beatport**, Compartilhamento), com texto de `mensagens-dj.ts` que não cita arquivos nem variáveis: "Com a sua conta do Beatport, o Soulcrate descobre o subgênero de cada música. É opcional."
- **Assistente**: a conta não entra no assistente (que fica curto); o caminho até ela é o painel do cartão da Biblioteca ([item 1](#1-a-organização-é-montada-por-níveis-com-duas-escolhas-por-destino)).

### 8. A biblioteca existente

Conectar a conta ou ligar o subgênero não classifica o que já está no disco. Um subcomando, `beet beatport-classificar`, percorre as faixas sem resultado guardado (ou com `nao-encontrada` antigo), respeita o ritmo e o freio, grava os campos e **pode ser interrompido e retomado**. Sem conta conectada, ele aplica só as regras locais. Depois de **Testar login** dar certo, a seção Conta Beatport oferece "Classificar a biblioteca". A tela mostra a estimativa antes (cerca de 2 s por faixa com o Beatport: ~10 min para 300 faixas) e o progresso. Depois, "Reorganizar as pastas" (com prévia) move os arquivos, e o Rekordbox refaz o arquivo de playlists.

### 9. O app

**Cartão Organização** (aba Organizar da Biblioteca, `CartaoOrganizacao.tsx`): continua com um grupo por destino, **No disco** e **No Rekordbox**. Cada grupo troca os dois cartões de rádio por:

- uma linha fixa "Gênero" (sempre incluído, só informativa);
- duas caixas de seleção, **Subgênero** e **Artista**, em um `fieldset` com `legend`, com a descrição de uma linha cada;
- **um exemplo ao vivo** do que sai, com nomes de verdade, em `aria-live="polite"`: `Techno / Peak Time / Azyr / No Escape`, `Techno / Peak Time`, `Techno / Azyr`, `Techno`. No Modo DJ aparece também o nome da combinação ("Gênero / Subgênero / Artista").

Abaixo das caixas, uma linha com o **estado da conta** ("Conta Beatport conectada" ou "Sem conta do Beatport: o subgênero vem só das regras locais", com atalho para as Configurações) e, ao marcar **Subgênero** sem conta, o painel **Conectar conta / Continuar sem conta** do [item 1](#1-a-organização-é-montada-por-níveis-com-duas-escolhas-por-destino). Com a conta conectada, aparece também o botão "Classificar a biblioteca" com a estimativa. Antes de a pessoa ligar o subgênero, o cartão diz quantas faixas da biblioteca ficariam em `_Sem Subgenero`, quando já houver classificação.

O que já funciona continua: o aviso "Reorganizar as pastas" depois de mudar o disco (com prévia) e o refazer do arquivo do Rekordbox ao mudar o dele. O texto vem de `mensagens.ts` e `mensagens-dj.ts`, e o Modo Dev mostra também as chaves do `pastas.json`.

**Contrato:** `shared/organizacao.ts` ganha o formato do item 1 (preservando chaves desconhecidas ao regravar), `definir` passa a receber o destino e as duas escolhas, e `EstadoOrganizacao` ganha `subgenero` (por destino) e `contaBeatport` (há usuário e senha no `.env`). `configAtende` confere também o campo `$subgenero_pasta` no `config.yaml`. O plugin muda junto (`organizacao_do_texto` / leitura das opções); o contrato tem comentário nos dois lados.

### 10. O `config.yaml` e a stack

```yaml
paths:
  singleton: '$genero_pasta/%if{$subgenero_pasta,$subgenero_pasta/}%if{$organizar_por_artista,$artista_pasta/$title,$artista_pasta - $title}'
  default:   '$genero_pasta/%if{$subgenero_pasta,$subgenero_pasta/}%if{$organizar_por_artista,$albumartista_pasta/$title,$albumartista_pasta - $title}'
  comp:      '$genero_pasta/%if{$subgenero_pasta,$subgenero_pasta/}%if{$organizar_por_artista,Various Artists/}$artist - $title'
```

`$subgenero_pasta` é o `subgenero_resolvido` quando `subgenero.disco` está ligado, e vazio quando não, então o caminho fica idêntico ao de hoje com o nível desligado. A `/` dentro dos argumentos do `%if` vira separador de pasta (aprendizado de 2026-11-22), que é o que queremos. `config.yaml`, `beatport-generos.json`, `beatport.py` e o `.env.example` são arquivos da stack: a lista `app/src/shared/stack-arquivos.ts` entra na mudança (o `pasta-service.test.ts` confere) e a stack muda de versão (minor).

### 11. O Rekordbox lê o subgênero do banco, não do caminho

A árvore do Rekordbox continua independente do disco. Para o gênero e o artista nada muda (vêm do caminho, que sempre os tem). O **subgênero** vem do campo `subgenero_resolvido`: `FORMATO_LS` ganha o campo, `FaixaDaBiblioteca` ganha `subgenero: string | null` e `montarArvore` recebe as duas escolhas (`subgenero`, `artista`). A regra geral é a que já existe para o artista: **cada nível ligado transforma o nó em pasta com a playlist "Todas" e uma playlist por filho; o último nível são playlists**.

| Escolha | Árvore em `Soulcrate/Gêneros` |
| --- | --- |
| Gênero | uma playlist por gênero (como hoje) |
| Gênero / Artista | pasta do gênero → `Todas` + uma playlist por artista (como hoje) |
| Gênero / Subgênero | pasta do gênero → `Todas` + uma playlist por subgênero |
| Gênero / Subgênero / Artista | pasta do gênero → `Todas` + pasta do subgênero → `Todas` + uma playlist por artista |

O `artistaDaPasta` hoje conta as partes do caminho para achar o artista; com o nível de subgênero no disco, ele precisa pular essa pasta. A etapa 1 troca a leitura por posição por uma que saiba se o disco tem o nível (a escolha `subgenero.disco` vale para as faixas importadas depois dela; as antigas ficam onde estão até "Reorganizar"). O caso está nos testes.

### Segurança

- A resposta do Beatport é **entrada não confiável**. Nenhum texto dela vira nome de pasta ou de playlist: só nomes que estão em `beatport-generos.json` (comparados pela chave normalizada) produzem pasta. Gênero ou sub-gênero desconhecido é ignorado (cai na reserva), o que também barra `..`, separadores e caracteres inválidos em FAT32/exFAT.
- Usuário, senha, token, `refresh_token`, client ID capturado e cookies **nunca** vão para log, mensagem de erro, pacote de suporte ou teste. Registra-se o resultado ("login recusado, HTTP 401"), não os valores.
- Processo externo continua recebendo argumentos em lista, e os subcomandos novos entram na lista fechada do `biblioteca-service`.
- A consulta envia **artista e título** de cada faixa ao Beatport, ligados à conta da pessoa. O cartão diz isso, e sem conta nada é enviado.
- O `User-Agent` é honesto (`soulcrate`), e o freio impede insistir diante de bloqueio.

### Condição de liberação

Proposta original: o recurso de Beatport só seria publicado numa release depois de os termos de uso do Beatport sobre acesso automatizado serem lidos e registrados aqui.

**Decisão de 2026-11-24 (dono do projeto): a condição foi retirada.** O recurso do Beatport é implementado e publicado por completo, sem esperar a leitura dos termos. Continua valendo o que reduz o risco: a conta é opcional e da própria pessoa, o texto de consentimento diz que o acesso não é oficial, o `User-Agent` é honesto, o freio para diante de bloqueio e nada se perde se o Beatport parar de responder. Se o Beatport pedir para parar, este ADR é substituído e o botão **Conectar conta** sai.

## O que a implementação ajustou (2026-11-24)

- **O cliente se chama `beatport_cliente.py`**, não `beatport.py`: os plugins do `pluginpath` entram no namespace `beetsplug`, e o beets já tem um `beetsplug.beatport` próprio. O `pastas.py` carrega o cliente pelo caminho do arquivo.
- **`pastas` vem depois do `lastgenre`** na lista `plugins:` do `config.yaml`: os estágios de importação rodam nessa ordem, e o resolvedor precisa do gênero final.
- **Os aliases locais só valem com o nível de subgênero ligado** (ou com resultado do Beatport guardado). Desligado, `$genero_pasta` é o de sempre, para o caminho de quem não usa a opção não mudar.
- **Freio também em rede caída:** três falhas `fora-do-ar` seguidas ligam o freio, para cada faixa não esperar os 15 s do timeout.
- **O token guardado é da conta que o pediu:** `beatport-token.json` leva um resumo (hash) do usuário, e outra conta não o reaproveita.
- **O refresh do token** (`grant_type=refresh_token`) é suposição, sem fonte; se o Beatport o recusar, o cliente faz o login completo.
- **A prévia de "Reorganizar as pastas"** continua sendo a saída do `beet move -p`; os campos do Beatport não entram nela. A origem de cada subgênero fica nos campos do banco (`beet ls -f '$beatport_situacao $subgenero_resolvido'`).
- **"Classificar a biblioteca" fica só no cartão Organizar** (com a estimativa), e não também na seção Conta Beatport depois de "Testar login": um caminho só, perto das caixas de nível que dependem dele.
- **A tela usa a tarefa de manutenção `classificar`** (o mesmo diálogo de Cuidar da biblioteca, com o andamento "12 de 300"); interromper é desligar a stack (fechar o app não para o beets dentro do contêiner), e rodar de novo continua de onde parou.

## Plano de implementação

Cada etapa é um PR pequeno, com testes, CHANGELOG ("Não lançado") e documentação.

### Etapa 0: aceitar o ADR e ler os termos

- Aceitar este ADR (e o índice em `docs/adr/README.md`).
- Ler e registrar os termos do Beatport (condição de liberação). Não bloqueia a etapa 1.
- Decidir os [pontos em aberto](#pontos-em-aberto) que são da pessoa.

### Etapa 1: subgênero com regras locais, nos dois destinos

1. `beatport-generos.json` com a taxonomia do apêndice A e os aliases de texto.
2. `pastas.py`: carregar o JSON, `resolver_genero_e_subgenero` (funções puras), gravar `subgenero_resolvido` na importação, `$subgenero_pasta`, leitura de `subgenero` no `pastas.json` (padrão desligado); tratar o qualificador entre parênteses em vez de descartá-lo.
3. `config.yaml`: os três `paths:` do item 10.
4. App, contrato e serviço: `shared/organizacao.ts` (formato novo, chaves preservadas, padrões desligados, aviso de novidade), `organizacao-service.ts`, `ipc.ts`, `ipc-entradas.ts`, preload; `FORMATO_LS`, `FaixaDaBiblioteca` e `biblioteca-service.ts` (campo novo); `shared/rekordbox.ts` e `rekordbox-service.ts` (item 11).
5. App, tela: `CartaoOrganizacao.tsx` (caixas, exemplo ao vivo, aviso de novidade), `mensagens.ts` e `mensagens-dj.ts`. Nesta etapa o painel "Conectar conta / Continuar sem conta" ainda não aparece (não há conta para conectar): ligar o subgênero usa só as regras locais e o cartão avisa que muitas faixas ficam em `_Sem Subgenero`. O painel entra na etapa 2.
6. `stack-arquivos.ts`, versão da stack, CHANGELOG, README (a seção de organização e a captura da aba Organizar).
7. Testes:
   - Python (`tests/soulbeet/`): cada regra do resolvedor; a tabela inteira do JSON (todo nome de pasta é seguro e sem `/`); aliases, qualificador e `_Sem Subgenero`; arquivo ausente ou ilegível; formato antigo e novo do `pastas.json`.
   - Vitest: `organizacao.test.ts` (as 4 combinações por destino, chaves desconhecidas preservadas, padrões desligados, inclusive com `pastas.json` antigo sem a chave nova), `organizacao-service.test.ts`, `ipc-entradas.test.ts`, `rekordbox.test.ts` e `rekordbox-service.test.ts` (as 4 árvores, artista com e sem subgênero no disco), o cartão (`biblioteca-telas.test.tsx`: exemplo ao vivo para cada combinação).
   - e2e: o cartão nos dois modos, com axe (rodar `npm run build` antes, aprendizado de 2026-11-22).
   - Beets real: montar a `Library` com `ui.get_path_formats()` (`pip install beets==2.11.0` num venv) e conferir os caminhos das 4 combinações.

### Etapa 2: Beatport e Conta Beatport

1. `beatport.py`: cliente (client ID, login, token guardado, busca), casamento (`exata`, `aproximada`, `nao-encontrada`), freio e ritmo. **Sem rede nos testes**: um servidor HTTP falso (`http.server`, stdlib) responde com fixtures anonimizadas do spike (inclusive 401, 403 de verificação, 429 e `location` em minúsculas).
2. Plugin: estágio de importação que consulta e grava os campos flexíveis; o resolvedor passa a usar o resultado guardado (camada 1); subcomandos `beatport-testar` e `beatport-classificar` (retomável), na lista fechada do `biblioteca-service`.
3. Conta Beatport: `shared/configuracao.ts`, `config-service.ts`, `config-arquivos.ts` (modelo do `.env`), `config-validacao.ts`, `validar-config.ps1`, `.env.example`, `docker-compose.yml`, `seguranca.ts` e o pacote de suporte; `SecaoBeatport` em `secoes-config.tsx` e em `Configuracoes.tsx` (nos dois modos); botão "Testar login".
4. Cartão: o estado da conta, o painel "Conectar conta / Continuar sem conta" ao marcar Subgênero, "Classificar a biblioteca" com estimativa e progresso e as mensagens de erro do catálogo (`erros.ts`); na seção Conta Beatport, o texto de consentimento, "Testar login" e "Desconectar".
5. Testes: Python (cliente contra o servidor falso, freio, cache negativo de 30 dias, nome fora da tabela nunca vira pasta, campos flexíveis fora da tag no beets 2.11 real); Vitest (configuração com conta opcional e "os dois ou nenhum", seção, cartão, serviço); e2e com o dublê.
6. ADR: registrar a decisão sobre a condição de liberação (retirada em 2026-11-24).

### Etapa 3: documentação e release

1. `docs/apis-da-stack.md`: o contrato com o Beatport (rotas, fluxo, campos usados, o que se sabe e o que não), como já é feito com o Navidrome e o Soulbeet.
2. README (tabela de organização e o aviso sobre o Beatport), `docs/roteiro-manual.md` (roteiro com a conta real), capturas (`npm run capturas`), CHANGELOG e versões (stack e app).

### Verificação (definição de pronto de cada etapa)

`npm run check`, Pester, `python -m unittest discover -s tests/soulbeet -v`, `node --test "scripts/*.test.mjs" ".claude/hooks/*.test.mjs"` e o e2e verdes; `node scripts/dependencias.mjs --check` sem pendência (nenhuma dependência nova de pacote); nenhum segredo no diff; e, na etapa 2, um teste manual com a stack real e a conta do Beatport (login, 30 faixas, "Reorganizar" com prévia).

## Alternativas consideradas

- **Quatro opções fixas por destino** (Gênero; Gênero / Subgênero; Gênero / Artista; Gênero / Subgênero / Artista, em botões de rádio). É o desenho mais explícito, mas são oito cartões altos na aba (a tela já tem três linhas por cartão), esconde que são duas decisões independentes e cada nível novo dobraria as opções. A escolha por níveis com exemplo ao vivo mostra exatamente o resultado e cabe em quatro caixas. O modelo guardado são dois booleanos por destino, que servem a qualquer das duas telas.
- **O Rekordbox ler o subgênero do caminho do disco.** Mais simples, mas o prende ao disco e a pessoa não poderia ter subgênero só no Rekordbox. O campo `subgenero_resolvido` custa uma coluna no `ls` e mantém as duas escolhas independentes.
- **Só a tag e as regras locais.** Fica na etapa 1. Sem custo e sem risco de termos de uso, mas a cobertura de subgênero é mínima. Continua como reserva e como o modo de quem não tem conta.
- **Só o Beatport, sem reserva.** Recusada: 13% das faixas da amostra não foram achadas (Bandcamp, rips, edits), e um login expirado ou uma mudança na API deixaria a importação sem subgênero.
- **Ler as páginas do site do Beatport.** Recusada: o site responde 403 com verificação de navegador a clientes automatizados, e contornar isso está fora de cogitação.
- **Gravar o subgênero na tag.** Recusada: quebra a regra de só mudar o nome da pasta, e o Rekordbox leria a tag alterada. Os campos ficam no banco do beets.
- **Plugin `beets-beatport4` em vez de código próprio.** Recusada: exigiria `pip install` no estágio de build do distroless, traria dependências a manter, guarda usuário e senha no `config.yaml` sem criptografia e não tem o freio, o cache negativo nem os subcomandos de que precisamos. O módulo próprio é pequeno (stdlib) e testável com servidor falso.
- **Discogs** (estilos da release). Boa taxonomia, mas por release e não por faixa, e sem lista de estilos confirmada. Pode virar outra camada num ADR futuro.
- **Classificação pelo áudio** (Essentia Discogs-EffNet, 400 estilos). Pesada para a imagem distroless, licença do Essentia (AGPLv3) e dos modelos por conferir, e o resultado não usa a taxonomia do Beatport. Fica para depois, se as camadas acima deixarem muita faixa sem subgênero.
- **`lastgenre` com a árvore padrão do beets.** Tem acid, industrial, dub e schranz, mas não tem Hard Techno, Melodic Techno nem Raw / Deep / Hypnotic, e é votação de usuários. Serve só como reserva com uma lista própria.
- **O subgênero com dois níveis sempre** (`Techno/Peak Time - Driving/Peak Time`). Mais fiel ao Beatport, mas deixa o caminho com quatro níveis até o título. Fica como evolução se a regra do item 3 incomodar.
- **A Conta Beatport obrigatória no assistente.** Recusada: a conta é opcional e o assistente deve ficar curto.
- **O subgênero ligado por padrão** (a primeira decisão deste ADR, no mesmo dia). Recusada: sem a conta do Beatport as regras locais cobrem pouco, e a maior parte das importações novas cairia em `_Sem Subgenero`, além de mudar o comportamento de quem já usa. Desligado, o subgênero é uma escolha consciente, e o caminho até a conta fica no momento de ligar.
- **A conta obrigatória para ligar o subgênero.** Recusada: tiraria a opção de quem não quer ou não pode ter conta, e o Techno que já traz `Peak Time / Driving` na tag funciona sem ela.
- **Um interruptor "Usar o Beatport" separado da conta.** Recusada: criaria o estado "ligado, sem conta" e uma opção a mais sem ganho. A conta conectada é o interruptor, e "Desconectar" desliga.

## Consequências

- **Ninguém vê nada mudar sozinho**: o subgênero vem desligado, o `pastas.json` antigo continua válido, e a novidade é apresentada por um aviso no cartão e no CHANGELOG.
- Com o subgênero ligado, **todas** as faixas ganham o nível, e muitas ficam em `_Sem Subgenero`, porque o Beatport só preenche o sub-gênero de uma parte (7 de 26 na amostra) e, sem conta, só as regras locais respondem. O cartão avisa antes de ligar e oferece conectar a conta.
- Com a conta conectada, a pasta de **gênero** pode mudar de nome para algumas faixas (o Beatport discorda da tag em alguns casos). "Reorganizar as pastas" tem prévia, e a divergência fica visível nos campos guardados.
- Passa a existir uma dependência de um serviço de terceiros por um caminho não oficial. Se o Beatport mudar o fluxo, o plugin cai na reserva sozinho e "Testar login" diz o motivo; o custo é o contrato registrado em `docs/apis-da-stack.md` e os testes com o servidor falso.
- A consulta expõe artista e título das faixas ao Beatport, ligados à conta da pessoa; só acontece com a conta preenchida.
- A classificação da biblioteca existente leva cerca de 2 s por faixa com o Beatport; a pessoa vê a estimativa e o progresso e pode interromper.
- O Rekordbox deixa de depender só do caminho: o subgênero vem do banco do beets, e a árvore ganha o terceiro nível opcional.
- Mudam juntos: `soulbeet/beets-plugins/pastas.py`, `beatport.py` e `beatport-generos.json`; `soulbeet/config/config.yaml`; `docker-compose.yml`, `.env.example`, `validar-config.ps1`; `app/src/shared/organizacao.ts`, `rekordbox.ts`, `biblioteca.ts`, `configuracao.ts`, `stack-arquivos.ts`, `erros.ts`, `mensagens.ts`, `mensagens-dj.ts`, `ipc.ts`; `main/services/organizacao-service.ts`, `rekordbox-service.ts`, `biblioteca-service.ts`, `config-service.ts`, `config-arquivos.ts`, `config-validacao.ts`, `main/infra/seguranca.ts`; o preload; `CartaoOrganizacao.tsx`, `secoes-config.tsx` e `Configuracoes.tsx`; os testes de cada uma; README, `docs/apis-da-stack.md`, `docs/roteiro-manual.md`, CHANGELOG, capturas e as versões.

## Pontos em aberto

1. **Quem liga o subgênero sem conta** verá muitas importações novas em `_Sem Subgenero` (as regras locais cobrem pouco). O painel avisa e oferece conectar, mas a pessoa pode continuar. Vale reavaliar depois da etapa 1, com números reais, se as regras locais precisam de mais aliases.
2. **Peak Time e Driving.** Com a regra do item 3, `Techno` terá `Peak Time`, `Driving`, `Psy-Techno` (sub-gêneros) e `Peak Time - Driving` (o qualificador, para a faixa sem sub-gênero). Alternativas: juntar `Peak Time` e `Driving` numa pasta só, ou aceitar o quarto nível. Decidir olhando o resultado real da etapa 1.
3. **Quem manda no gênero quando o Beatport e a tag divergem.** A decisão é que o Beatport manda (é o plano A), mas a pessoa pode preferir só o subgênero do Beatport e manter o gênero da tag. Se for assim, vira uma terceira opção.
4. ~~**Termos de uso do Beatport** (condição de liberação).~~ Resolvido: o dono do projeto retirou a condição em 2026-11-24.
5. **Gêneros "open format"** (Hip-Hop, Latin, African…) têm sub-gêneros na página do Beatport, mas o projeto é de música eletrônica. Entram no JSON só pelo nome; confirmar se valem as pastas desses.
## Apêndice A: gêneros e sub-gêneros do Beatport

Fonte: [Beatport Genres](https://greenroomsupport.beatport.com/hc/en-us/articles/41043520429076-Beatport-Genres-Including-NEW-Open-Format-Genres), lida em 2026-11-24 (a página estava atualizada havia 2 meses). Gênero → sub-gêneros. O `beatport-generos.json` é gerado a partir desta tabela e conferido contra a página na implementação.

| Gênero | Sub-gêneros |
| --- | --- |
| 140 / Deep Dubstep / Grime | Grime |
| Afro House | Afro / Latin, 3Step, Afro Melodic |
| Amapiano | |
| Ambient / Experimental | |
| Bass / Club | Juke / Footwork, Global Club, Jersey Club, Gqom, Bass / Club, Reggae / Dancehall, UK Funky |
| Bass House | |
| Brazilian Funk | Carioca Funk, Mandelao Funk, BH Funk, Melodic Funk, Eletrofunk |
| Breaks / Breakbeat / UK Bass | Glitch Hop |
| Dance / Pop | Pop, Tropical House, Afro Pop |
| Deep House | |
| DJ Tools | Loops, Acapellas, Battle Tools |
| Downtempo | |
| Drum & Bass | Liquid, Jump Up, Jungle, Deep, Halftime |
| Dubstep | Melodic Dubstep, Midtempo |
| Electro (Classic / Detroit / Modern) | |
| Electronica | |
| Funky House | |
| Hard Dance / Hardcore / Neo Rave | Hardstyle, Hard House, Uptempo, Terror, UK / Happy Hardcore, Frenchcore, Neo Rave |
| Hard Techno | |
| House | Acid, Soulful, Latin House |
| Indie Dance | Dark Disco |
| Indie Tech | |
| Latin Electronic | Raptor House, Tribal / Guaracha, Electronic Cumbia, Moombahton |
| Mainstage | Big Room, Electro House, Future House, Speed House, Future Rave |
| Melodic House & Techno | Melodic House, Melodic Techno |
| Minimal / Deep Tech | Bounce, Deep Tech, Minimal House |
| Nu Disco / Disco | Funk / Soul, Italo |
| Organic House | |
| Progressive House | |
| Psy-Trance | Full-On, Progressive Psy, Psychedelic, Goa Trance, Dark & Forest, Psycore & H-Tech |
| Tech House | Latin Tech |
| Techno (Peak Time / Driving) | Peak Time, Driving, Psy-Techno |
| Techno (Raw / Deep / Hypnotic) | Deep / Hypnotic, Raw, EBM, Dub, Broken |
| Trance (Main Floor) | Progressive Trance, Tech Trance, Hard Trance, Uplifting Trance, Vocal Trance |
| Trance (Raw / Deep / Hypnotic) | Raw Trance, Deep Trance, Hypnotic Trance |
| Trap / Future Bass | Trap |
| UK Garage / Bassline | UK Garage, Bassline, 2-Step, Speed Garage |

**Gêneros "open format"** (a segunda coluna da página): Hip-Hop (East Coast, West Coast, Global, Southern); Pop (K-Pop, J-Pop, Holiday); R&B (Funk, Soul); Latin (Cumbia, Salsa, Merengue, Reggaeton, Dembow, Regional Mexican, Bachata, Latin Dance, Latin Pop, Latin Hip-Hop); African (Afrobeats, Afropop, Afro R&B, Alte); Caribbean (Reggae, Dancehall, Soca, Calypso, Ska & Rocksteady); Rock (Indie Rock, Metal, Punk & Pop Punk, Ska); Country (Country Pop, Country Dance). O agrupamento sai de uma tabela de duas colunas e deve ser conferido com a página.
