# SP3: o lote sobrevive ao app fechar?

**Pergunta.** Um `baixar-lista.ps1` iniciado pelo app continua rodando quando o app fecha? O app consegue se reconectar a ele quando reabre?

**Resposta: sim, mas não do jeito óbvio.** `spawn` com `detached: true`, o caminho recomendado pela documentação do Node, **não funciona com o PowerShell**.

## O que foi testado

Script: [`codigo/sp3-processo-destacado.mjs`](codigo/sp3-processo-destacado.mjs). Ele inicia, de quatro formas, um PowerShell que grava uma linha por segundo, sai do Node após 3 s (simulando o app fechando) e depois confere quem continuou. Rodado numa pasta **com espaço** no caminho.

| Forma | Resultado |
| --- | --- |
| `spawn` comum | **Morre junto com o app.** O libuv coloca os filhos num *job object* com `KILL_ON_JOB_CLOSE` |
| `spawn` com `detached: true` (+ `windowsHide`, saída em arquivo) | **O PowerShell nem roda:** sai em ~120 ms com código 0, sem executar o script e sem escrever nada. O libuv usa `DETACHED_PROCESS` (processo sem console), e o `powershell.exe` não roda assim |
| **PowerShell lançador + `Start-Process`** | **Sobrevive**, continua gravando, PID conhecido. O lançador termina em ~350 ms |
| `cmd /c start /min powershell …` | Sobrevive, mas deixa uma janela minimizada na barra de tarefas |

### Por que o lançador funciona

O job do libuv é criado com `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK`: o lançador (filho direto) fica no job, mas o processo que **ele** cria com `Start-Process` nasce fora dele e não morre quando o app fecha.

### Armadilha encontrada: handles herdados

Na primeira versão, o app esperou 31 s pelo lançador. O `Start-Process` com redirecionamento cria o neto herdando **todos** os handles herdáveis do lançador, inclusive o pipe de saída que o Node estava lendo. O pipe só fechava quando o neto terminava. Solução: o lançador não recebe pipe nenhum (`stdio: 'ignore'`), e o lote grava a saída em arquivos.

## Receita para o app (`BatchService`)

```text
powershell.exe -NoProfile -NonInteractive -Command
  Start-Process -FilePath powershell.exe -WindowStyle Hidden
    -RedirectStandardOutput '<lotes>\saida-<id>.log' -RedirectStandardError '<lotes>\erro-<id>.log'
    -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','"<pasta>\baixar-lista.ps1"',
                  '-Lista','"<lista>"','-IdExecucao','<id>','-Eventos','"lotes\eventos-<id>.jsonl"','-ArquivoParada','"lotes\parar-<id>.flag"', …
```

- O lançador roda com `spawn(..., { stdio: 'ignore', windowsHide: true })`, e o app espera o evento `exit` (código 0 = iniciou).
- O `-ArgumentList` do `Start-Process` **junta os itens com espaço sem aspas**: todo caminho precisa de aspas próprias (`'"C:\pasta com espaco\x"'`). Montar e escapar isso num só lugar, com teste.
- O app **não precisa** do PID devolvido pelo lançador: o lote grava o próprio PID na trava (`lotes/estado-<lista>.lock`) e no evento `run.start` ([protocolo](../eventos-lote.md)).
- Antes de iniciar, o app confere a trava (o lote também confere e sai com código `5`).

### Reconectar ao reabrir

1. Para cada `lotes/estado-*.lock`, ler o PID e conferir se o processo vive (`process.kill(pid, 0)`) e se o nome é `powershell`/`pwsh`.
2. Vivo: abrir `lotes/eventos-<id>.jsonl` (o `id` está na trava) e lê-lo do começo com o leitor do [SP4](sp4-tail-jsonl.md) para reconstruir o estado.
3. Morto sem `run.end` no arquivo de eventos: a execução foi encerrada à força. Mostrar como "interrompida" e oferecer rodar a lista de novo (ela continua de onde parou).

### Fechar o app

Não precisa fazer nada com o lote: ele continua. Para pará-lo, o botão "Parar" cria o arquivo de `-ArquivoParada`. Só se ele não terminar em 2 min o app oferece encerrar à força, avisando que os relatórios dessa execução se perdem.
