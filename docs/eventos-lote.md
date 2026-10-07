# Protocolo do download em lote (`baixar-lista.ps1`)

Referência de como um programa (o app do Soulcrate, ou qualquer outro) controla e acompanha o download em lote sem interpretar o texto da tela. Para o uso pelo `baixar-lista.bat`, veja o [README](../README.md#download-em-lote): **sem os parâmetros abaixo, o script se comporta exatamente como antes**.

Exemplos reais de tudo o que está aqui ficam em [`app/tests/fixtures/lote/`](../app/tests/fixtures/lote/), gerados por [`tests/Gerar-Fixtures.ps1`](../tests/Gerar-Fixtures.ps1).

## Parâmetros

| Parâmetro | Efeito |
| --- | --- |
| `-Eventos <arquivo>` | Grava um evento JSON por linha (JSONL) com o andamento da execução. Caminho relativo à pasta do Soulcrate |
| `-ArquivoParada <arquivo>` | Quando esse arquivo passa a existir, o lote para com segurança: termina o que está em andamento, grava os relatórios e sai com o código `2`. O script apaga o arquivo ao terminar |
| `-IdExecucao <id>` | Nome dos arquivos desta execução em `lotes/` (padrão: data e hora, `20261007-161002`). Só letras, números, `-` e `_`, até 64 caracteres |
| `-SoAnalisar` | Só lê e analisa a lista, escreve um JSON e sai. Não busca nada, não cria `lotes/`, não precisa do slskd nem da API key |
| `-AnalisarBiblioteca` | Com `-SoAnalisar`: confere também o que já está na biblioteca (precisa da stack no ar) |
| `-SaidaAnalise <arquivo>` | Com `-SoAnalisar`: grava o JSON nesse arquivo, e não na saída padrão |

Todas as opções do lote (`-Paralelo`, `-AceitarWav` etc.) continuam valendo e aparecem no evento `run.start`.

## Como rodar a partir de outro programa

```text
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <pasta>\baixar-lista.ps1
  -Lista <lista> -IdExecucao <id> -Eventos lotes\eventos-<id>.jsonl -ArquivoParada lotes\parar-<id>.flag [opções]
```

- Chame o `.ps1` direto: o `.bat` tem `pause` e abre o Bloco de Notas.
- Escolha o `-IdExecucao` antes de iniciar: assim todos os nomes de arquivo são conhecidos de antemão (tabela abaixo).
- Para a execução sobreviver ao fechamento do programa que a iniciou, inicie o processo destacado e mande stdout/stderr para um **arquivo**, não para um pipe.
- Para parar, crie o arquivo de `-ArquivoParada` (o conteúdo não importa). **Não mate o processo**: isso pula a gravação dos relatórios e deixa a trava para trás. A trava abandonada é reconhecida e ignorada na próxima execução, mas os relatórios daquela execução se perdem.

### Arquivos de uma execução

| Arquivo | Quando existe |
| --- | --- |
| `lotes/resultado-<id>.txt` | Sempre, ao terminar (inclusive parando) |
| `lotes/nao-baixadas-<id>.txt` | Se alguma faixa falhou ou não foi encontrada |
| `lotes/diagnostico-<id>.txt` | Se alguma faixa não foi encontrada |
| `lotes/catalogo-<id>.txt` | Se a conferência no MusicBrainz rodou |
| `lotes/beets-<id>.log` | Se o beets importou algum lote |
| `lotes/execucao-<id>.log` | Sempre (transcrição da tela) |
| `lotes/estado-<lista>.tsv` | Memória da lista entre execuções (`<lista>` = nome do arquivo da lista sem extensão, com caracteres especiais trocados por `_`) |
| `lotes/estado-<lista>.lock` | **Enquanto** a lista está rodando (ver [Trava](#trava)) |

O evento `run.start` traz esses caminhos em `files`; o `run.end` traz só os que de fato existem.

## Códigos de saída

| Código | Significado | `reason` no `run.end` |
| --- | --- | --- |
| `0` | Concluído | `completed` |
| `1` | Erro inesperado (veja `message` e `execucao-<id>.log`) | `error` |
| `2` | Parado pelo usuário (`-ArquivoParada`) | `user` |
| `3` | slskd inacessível (não respondeu na partida ou caiu por muito tempo) | `slskd_down` |
| `4` | Configuração inválida: lista inexistente, vazia ou CSV sem colunas reconhecidas, API key ausente ou recusada (401/403), `-IdExecucao` inválido | `config` |
| `5` | A mesma lista já está rodando em outro processo | `locked` |
| `130` | Interrompido com Ctrl+C | `interrupted` |

## Trava

Ao começar, o script cria `lotes/estado-<lista>.lock` com uma linha `PID<TAB>início<TAB>id` e a apaga ao terminar, também quando há erro, parada ou Ctrl+C. Se a trava já existe e o PID nela é de um processo `powershell`/`pwsh` vivo, o script se recusa a rodar (código `5`). Se o processo não existe mais, a trava é considerada abandonada e substituída. Vale tanto para o app quanto para o `.bat`.

## Eventos

Arquivo UTF-8 **sem BOM**, um objeto JSON por linha, terminado em `\n`. Cada linha é gravada de uma vez, mas quem lê enquanto o script escreve deve guardar um pedaço de linha sem `\n` até a próxima leitura.

Campos comuns a todo evento:

| Campo | Conteúdo |
| --- | --- |
| `v` | Versão do esquema (hoje `1`). Campos novos podem aparecer sem mudar `v`; remover ou mudar o significado de um campo incrementa `v` |
| `t` | Data e hora local com fuso (`2026-10-07T16:10:02.994-03:00`) |
| `type` | Tipo do evento (tabela abaixo) |

Regras:

- O primeiro evento é `run.start`, exceto quando a execução para antes de ler a lista e obter a trava (lista inexistente, vazia ou ilegível, API key ausente, `-IdExecucao` inválido, lista já rodando): nesse caso só existe o `run.end`. A API key **recusada** pelo slskd é descoberta depois, então vem após o `run.start`.
- O último evento é **sempre** `run.end`, e só existe um.
- `key` identifica a faixa: é a linha normalizada (minúsculas, sem acentos e pontuação), a mesma chave do `estado-<lista>.tsv`. Ela se mantém entre execuções da mesma lista.
- Caminhos são relativos à pasta do Soulcrate e usam `/`.

### Tipos

| `type` | Quando | Campos |
| --- | --- | --- |
| `run.start` | Lista lida, trava obtida | `id`, `pid`, `list`, `listName`, `total` (faixas únicas), `options` (todas as opções do lote, com os valores efetivos), `files`, `powershell` |
| `run.skip` | Depois de conferir estado e biblioteca | `alreadyDone`, `inLibrary`, `toProcess`, `libraryChecked` |
| `catalog.progress` | Conferência no MusicBrainz (no início, a cada faixa e no fim) | `done`, `total` |
| `catalog.result` | Resultado de cada faixa conferida | `key`, `line`, `result` (`OK`, `CORRIGIDO`, `NAO EXISTE`, `NAO CONFIRMADO`, `SEM DADOS`, `INDISPONIVEL`), `searchLine` (linha usada na busca, se corrigida), `similar` (títulos parecidos), `detail` |
| `item.status` | A faixa mudou de estado (sem ainda ter terminado) | `key`, `line`, `status`, e conforme o estado: `search` (`kind`: `q`/`artist`, `query`, `stage`, `stages`), `searchLine`, `candidates`, `user`, `format`, `attempt`, `remoteQueued` |
| `item.attemptFailed` | Uma tentativa de download falhou e o script vai para o próximo usuário | `key`, `user`, `attempt`, `reason` |
| `item.diagnostic` | Faixa não encontrada (o mesmo conteúdo do `diagnostico-<id>.txt`, estruturado) | `key`, `line`, `searches[]` (`kind`, `query`), `skipped`, `corrected`, `catalog`, `remixer`, `responses`, `reasons` (motivo → quantidade), `closest[]` (`reason`, `user`, `file`, `score`), `suggestions[]`, `artistSearched`, `artistCatalog[]` (`title`, `users`; até 100), `artistCatalogTotal` |
| `item.final` | A faixa terminou (uma vez por faixa) | `key`, `line`, `status`, `note`, `via`, `local` (arquivo baixado em `downloads/`; o beets o move depois para `music/`), `user`, `format` |
| `search.check` | Busca de teste para saber se o servidor do Soulseek bloqueou | `phase` (`start`/`end`), `query`, e no fim `responses` e `blocked` |
| `search.paused` | Bloqueio confirmado: buscas pausadas | `until`, `minutes`, `reason` |
| `search.windowFull` | Mudou o estado do limite de buscas por janela | `full`, `limit`, `windowSeconds` |
| `beets.batch` | Lote do beets começou ou terminou | `phase` (`start`/`end`), `count`, `keys` (no início), `ok`, `errors`, `log` (no fim) |
| `progress` | A cada ~5 s durante o laço principal | `done`, `total`, `searching`, `downloading`, `remoteQueued`, `waiting`, `beets`, `ok`, `notFound`, `failed`, `etaMin`, `searchesPausedUntil`, `searchWindowFull` |
| `warning` | Problema recuperável | `code` (`slskd_unreachable`, `musicbrainz_unavailable`), `message`, e para o slskd `streak`/`maxStreak` |
| `run.stopping` | O arquivo de parada apareceu | `reason` (`user`) |
| `run.end` | Fim, sempre o último | `reason`, `exitCode`, `message`, `summary` (status → quantidade), `files` (os que existem) |

### Status das faixas

Status em andamento (`item.status`): `pendente`, `buscando`, `verificar` (esperando a busca de teste), `pronta` (tem candidato, esperando vaga), `baixando`, `importar`, `importando`.

Status finais (`item.final`): `importada`, `baixada`, `baixada (beets falhou)`, `nao encontrada`, `falhou`, `ja na biblioteca`, `ja feita`.

Se a execução for parada, as faixas que estavam no meio não recebem `item.final`: o status delas aparece no `resultado-<id>.txt` (ex.: `BAIXANDO`), e na próxima execução da lista elas são tentadas de novo.

### Exemplo (resumido)

```jsonl
{"v":1,"t":"…","type":"run.start","id":"exemplo","pid":19224,"list":"lista.txt","listName":"lista","total":6,"options":{"Paralelo":5,"AceitarWav":false,…},"files":{"result":"lotes/resultado-exemplo.txt",…},"powershell":"5.1.26100.9444"}
{"v":1,"t":"…","type":"run.skip","alreadyDone":0,"inLibrary":0,"toProcess":6,"libraryChecked":false}
{"v":1,"t":"…","type":"item.status","key":"azyr no escape","line":"Azyr - No Escape","status":"pendente","search":{"kind":"q","query":"Azyr No Escape","stage":1,"stages":3}}
{"v":1,"t":"…","type":"item.status","key":"azyr no escape","line":"Azyr - No Escape","status":"baixando","user":"ruim","format":"FLAC","attempt":1,"remoteQueued":false}
{"v":1,"t":"…","type":"item.attemptFailed","key":"azyr no escape","user":"ruim","attempt":1,"reason":"ruim: Completed, Errored"}
{"v":1,"t":"…","type":"item.final","key":"azyr no escape","line":"Azyr - No Escape","status":"baixada","note":"","via":"","local":"downloads/Azyr/Azyr - No Escape.mp3","user":"u1","format":"MP3 320"}
{"v":1,"t":"…","type":"run.end","reason":"completed","exitCode":0,"message":"","summary":{"baixada":4,"nao encontrada":2},"files":{"result":"lotes/resultado-exemplo.txt",…}}
```

## Análise da lista (`-SoAnalisar`)

Usa a mesma leitura, limpeza e separação de artista/título/mix do lote. Escreve um único objeto JSON (UTF-8 sem BOM) na saída padrão, ou em `-SaidaAnalise`. Código de saída `0`, ou `4` com `ok: false` quando a lista não existe ou o CSV não tem as colunas esperadas.

```jsonc
{
  "v": 1, "ok": true, "list": "C:\\Soulcrate\\lista.txt",
  "total": 6,            // linhas de faixa (sem comentários e linhas em branco)
  "unique": 6, "duplicates": 0,
  "alreadyDone": 6,      // pelo estado-<lista>.tsv (respeita -Retentar)
  "libraryChecked": false, "inLibrary": null,   // só com -AnalisarBiblioteca
  "toProcess": 0,
  "lines": [{
    "sourceLine": 2,     // linha no arquivo (no .csv, linha do registro, cabeçalho = 1)
    "line": "Azyr - No Escape", "key": "azyr no escape",
    "artist": "Azyr", "title": "No Escape", "mix": "", "original": true, "remixer": false,
    "queries": ["Azyr No Escape"],
    "status": "ja feita",          // nova | repetida | ignorada | ja feita | ja na biblioteca
    "duplicateOf": null,           // em "repetida": sourceLine da primeira ocorrência
    "previous": "baixada",         // status da execução anterior, se houver
    "warnings": []                 // ex.: linha sem " - ", título vazio, artista = remixer
  }]
}
```

Em caso de erro: `{"v":1,"ok":false,"list":"…","error":"CSV sem colunas de titulo/artista reconhecidas. …"}`.
