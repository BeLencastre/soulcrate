# SP4: ler o arquivo de eventos enquanto ele é escrito

**Pergunta.** O app consegue acompanhar o `eventos-<id>.jsonl` enquanto o PowerShell grava, no Windows, sem perder nem duplicar linhas?

**Resposta: sim.** Com leitura por offset, acionada pelo `fs.watch` e por um timer de segurança.

## O que foi testado

Script: [`codigo/sp4-tail-jsonl.mjs`](codigo/sp4-tail-jsonl.mjs). Um PowerShell grava 3.000 eventos com o **mesmo método** do `baixar-lista.ps1` (`[IO.File]::AppendAllText`, UTF-8 sem BOM), com texto acentuado (`Byørn – 2 LOUD áéíõç`), tamanho de linha variando de ~100 B a ~3 KB e pausas irregulares. Ao mesmo tempo, a classe `LeitorJsonl` lê o arquivo.

| Modo | Eventos | Perdidos | Repetidos | Fora de ordem | JSON quebrado | Leituras |
| --- | --- | --- | --- | --- | --- | --- |
| `fs.watch` + timer de 250 ms | 3.000 | 0 | 0 | 0 | 0 | 123 (todas pelo watch) |
| Só o timer de 250 ms | 3.000 | 0 | 0 | 0 | 0 | 24 |

Também foi testada a remontagem de linhas cortando um arquivo **byte a byte**, inclusive no meio de caracteres de 2, 3 e 4 bytes (`ø`, `€`, `𝄞`) e com BOM no início: todos os eventos saíram certos.

Na prática nenhuma leitura pegou uma linha pela metade, porque cada `AppendAllText` é uma única escrita. A remontagem continua necessária: não há garantia disso.

## Receita para o app

- Guardar o **offset em bytes** e, a cada aviso, ler de `offset` até o tamanho atual.
- Cortar por byte `0x0A` **antes** de decodificar (em UTF-8, `\n` nunca aparece dentro de um caractere) e guardar o pedaço final sem `\n` para a próxima leitura.
- Ignorar BOM no começo de linha e linhas vazias; linha com JSON inválido vai para o log, sem derrubar a leitura.
- `fs.watch` na **pasta** (filtrando pelo nome do arquivo), porque ele pode ainda não existir, mais um `setInterval` de 500 ms. No Windows o `fs.watch` pode juntar ou perder avisos; o timer garante.
- Uma leitura por vez: um aviso que chega durante a leitura marca "ler de novo".
- Se o arquivo ficar menor que o offset (foi recriado), recomeçar do zero.
- Parar de acompanhar quando chegar o `run.end`, ou quando o processo morrer (ver [SP3](sp3-processo-destacado.md)) e uma última leitura não trouxer nada.

A classe `LeitorJsonl` do script é um bom ponto de partida para o `BatchService`, depois de revisada e coberta por testes no app.
