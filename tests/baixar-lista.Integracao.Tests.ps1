#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }
<#
  Testes de integracao: rodam o baixar-lista.ps1 inteiro contra o slskd falso
  (tests\dubles\slskd-falso.mjs). Precisam do Node.js. Levam cerca de 1 minuto.

  Rodar so estes:  Invoke-Pester -Path tests -TagFilter Integracao
#>

BeforeAll {
  . (Join-Path $PSScriptRoot 'AmbienteLote.ps1')
  $Catalogo = @(
    @{ usuario = 'u1'; arquivo = '@@a\Music\Azyr\Azyr - No Escape.flac' }
    @{ usuario = 'u2'; arquivo = '@@b\Music\Creeds\Creeds - Push Up (Original Mix).wav' }
    @{ usuario = 'u3'; arquivo = '@@c\Music\Vendex\Vendex - Plague.aiff' }
  )
}

Describe 'baixar-lista.ps1 (integracao)' -Tag 'Integracao' {
  Context 'execucao completa' {
    BeforeAll {
      $amb = New-AmbienteLote -Arquivos $Catalogo
      $r = Invoke-Lote $amb -Linhas @('# minha lista', 'Azyr - No Escape', 'Creeds - Push Up (Original Mix)', 'Vendex - Plague', 'Fulano Inexistente - Nada Aqui')
    }
    AfterAll { Remove-AmbienteLote $amb }

    It 'termina com codigo 0' { $r.ExitCode | Should -Be 0 }
    It 'baixa as faixas encontradas para downloads, na pasta remota do arquivo' {
      Join-Path $amb.Raiz 'downloads\Azyr\Azyr - No Escape.flac' | Should -Exist
      Join-Path $amb.Raiz 'downloads\Creeds\Creeds - Push Up (Original Mix).wav' | Should -Exist
    }
    It 'grava o resultado de cada faixa' {
      $rel = Get-RelatorioLote $amb 'resultado-'
      $rel.Count | Should -Be 1
      $linhas = Get-Content -LiteralPath $rel[0].FullName -Encoding UTF8
      $linhas | Should -HaveCount 4
      ($linhas -match '^BAIXADA\tAzyr - No Escape\t').Count | Should -Be 1
      ($linhas -match '^BAIXADA\tCreeds - Push Up \(Original Mix\)\t').Count | Should -Be 1
      ($linhas -match '^NAO ENCONTRADA\tVendex - Plague\t.*formato/qualidade recusados').Count | Should -Be 1
      ($linhas -match '^NAO ENCONTRADA\tFulano Inexistente - Nada Aqui\t.*0 respostas').Count | Should -Be 1
    }
    It 'lista as que faltaram em nao-baixadas-*.txt' {
      $f = Get-RelatorioLote $amb 'nao-baixadas-'
      Get-Content -LiteralPath $f[0].FullName -Encoding UTF8 | Should -Be @('Vendex - Plague', 'Fulano Inexistente - Nada Aqui')
    }
    It 'explica no diagnostico por que nao achou' {
      $d = Get-Content -LiteralPath (Get-RelatorioLote $amb 'diagnostico-')[0].FullName -Encoding UTF8 -Raw
      $d | Should -Match '### Vendex - Plague'
      $d | Should -Match 'motivos: formato aiff \(use -AceitarAacAiff\) x\d+'
    }
    It 'guarda o estado da lista' {
      $e = Get-Content -LiteralPath (Join-Path $amb.Raiz 'lotes\estado-lista.tsv') -Encoding UTF8
      $e | Should -HaveCount 4
    }
    It 'mostra o resumo na tela' {
      ($r.Saida -join "`n") | Should -Match '==== Resumo'
      ($r.Saida -join "`n") | Should -Match 'OK BAIXADA: Azyr - No Escape'
    }

    Context 'rodando a mesma lista de novo' {
      BeforeAll { $r2 = Invoke-Lote $amb -Linhas @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)', 'Vendex - Plague', 'Fulano Inexistente - Nada Aqui') }
      It 'pula o que ja foi feito' {
        ($r2.Saida -join "`n") | Should -Match 'Pulando: 4 ja feitas em execucoes anteriores'
      }
      It 'com -Retentar e -AceitarAacAiff, baixa a que so existia em AIFF' {
        $r3 = Invoke-Lote $amb -Linhas @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)', 'Vendex - Plague', 'Fulano Inexistente - Nada Aqui') -Extra @('-Retentar', '-AceitarAacAiff')
        $r3.ExitCode | Should -Be 0
        Join-Path $amb.Raiz 'downloads\Vendex\Vendex - Plague.aiff' | Should -Exist
      }
    }
  }

  Context 'troca de usuario' {
    BeforeAll {
      $amb = New-AmbienteLote -Arquivos @(
        @{ usuario = 'ruim'; arquivo = '@@r\Music\Azyr\Azyr - No Escape.flac' }
        @{ usuario = 'bom'; arquivo = '@@b\Music\Azyr\Azyr - No Escape.wav' }
      ) -UsuariosComErro @('ruim')
      $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape')
    }
    AfterAll { Remove-AmbienteLote $amb }

    It 'tenta o proximo usuario quando o download falha' {
      ($r.Saida -join "`n") | Should -Match 'ruim: Completed, Errored'
      Join-Path $amb.Raiz 'downloads\Azyr\Azyr - No Escape.wav' | Should -Exist
    }
  }

  Context 'erros de configuracao (codigo de saida 4)' {
    BeforeAll { $amb = New-AmbienteLote }
    AfterAll { Remove-AmbienteLote $amb }

    It 'lista inexistente: falha com mensagem clara' {
      $out = & $PsExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $amb.Raiz 'baixar-lista.ps1') -Lista 'nao-existe.txt' -SlskdUrl $amb.Url 2>&1 | ForEach-Object { "$_" }
      $LASTEXITCODE | Should -Be 4
      ($out -join "`n") | Should -Match 'Arquivo de lista nao encontrado'
    }
    It 'lista vazia: falha com mensagem clara' {
      $r = Invoke-Lote $amb -Linhas @('# so comentario')
      $r.ExitCode | Should -Be 4
      ($r.Saida -join "`n") | Should -Match 'A lista esta vazia'
    }
    It 'API key recusada pelo slskd: nao espera e sai com 4' {
      Set-Content -LiteralPath (Join-Path $amb.Raiz '.env') -Encoding UTF8 -Value @('SLSKD_API_KEY_SOULBEET=chave-errada', 'DOWNLOADS_DIR=./downloads')
      try {
        $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape') -Extra @('-Eventos', 'ev-401.jsonl')
        $r.ExitCode | Should -Be 4
        ($r.Saida -join "`n") | Should -Match 'Nao consegui falar com o slskd'
        $ev = Get-EventosLote (Join-Path $amb.Raiz 'ev-401.jsonl')
        $ev[-1].type | Should -Be 'run.end'
        $ev[-1].reason | Should -Be 'config'
        $ev[-1].exitCode | Should -Be 4
      } finally {
        Set-Content -LiteralPath (Join-Path $amb.Raiz '.env') -Encoding UTF8 -Value @('SLSKD_API_KEY_SOULBEET=chave-teste', 'DOWNLOADS_DIR=./downloads')
      }
    }
    It '-IdExecucao invalido: sai com 4' {
      $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape') -Extra @('-IdExecucao', '../fora')
      $r.ExitCode | Should -Be 4
    }
  }

  Context '-Eventos (P3) e -IdExecucao (P9)' {
    BeforeAll {
      $amb = New-AmbienteLote -Arquivos (@($Catalogo) + @(@{ usuario = 'ruim'; arquivo = '@@r\Music\Azyr\Azyr - No Escape.flac' })) -UsuariosComErro @('ruim')
      $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)', 'Vendex - Plague', 'Fulano Inexistente - Nada Aqui') -Extra @('-Eventos', 'lotes\eventos-teste1.jsonl', '-IdExecucao', 'teste1')
      $arq = Join-Path $amb.Raiz 'lotes\eventos-teste1.jsonl'
      $ev = Get-EventosLote $arq
    }
    AfterAll { Remove-AmbienteLote $amb }

    It 'termina com codigo 0' { $r.ExitCode | Should -Be 0 }
    It 'grava UTF-8 sem BOM, um JSON valido por linha, com v, t e type' {
      $bytes = [IO.File]::ReadAllBytes($arq)
      $bytes[0] | Should -Not -Be 0xEF
      $ev.Count | Should -BeGreaterThan 5
      foreach ($e in $ev) { $e.v | Should -Be 1; $e.t | Should -Not -BeNullOrEmpty; $e.type | Should -Not -BeNullOrEmpty }
    }
    It 'comeca com run.start e termina com run.end (completed, 0)' {
      $ev[0].type | Should -Be 'run.start'
      $ev[0].id | Should -Be 'teste1'
      $ev[0].total | Should -Be 4
      $ev[0].options.Paralelo | Should -Be 5
      $ev[0].options.SemBeets | Should -BeTrue
      $ev[0].files.result | Should -Be 'lotes/resultado-teste1.txt'
      $ev[-1].type | Should -Be 'run.end'
      $ev[-1].reason | Should -Be 'completed'
      $ev[-1].exitCode | Should -Be 0
      $ev[-1].summary.baixada | Should -Be 2
      $ev[-1].summary.'nao encontrada' | Should -Be 2
      @($ev | Where-Object type -eq 'run.end').Count | Should -Be 1
    }
    It 'usa o -IdExecucao no nome dos arquivos' {
      Join-Path $amb.Raiz 'lotes\resultado-teste1.txt' | Should -Exist
      Join-Path $amb.Raiz 'lotes\nao-baixadas-teste1.txt' | Should -Exist
      $ev[-1].files.result | Should -Be 'lotes/resultado-teste1.txt'
      $ev[-1].files.diagnostic | Should -Be 'lotes/diagnostico-teste1.txt'
    }
    It 'emite item.final uma vez por faixa, com a chave do estado' {
      $fin = @($ev | Where-Object type -eq 'item.final')
      $fin.Count | Should -Be 4
      ($fin | Where-Object line -eq 'Azyr - No Escape').status | Should -Be 'baixada'
      ($fin | Where-Object line -eq 'Azyr - No Escape').local | Should -Be 'downloads/Azyr/Azyr - No Escape.flac'
      ($fin | Where-Object line -eq 'Azyr - No Escape').user | Should -Be 'u1'
      ($fin | Where-Object line -eq 'Azyr - No Escape').key | Should -Be 'azyr no escape'
    }
    It 'emite item.status enquanto a faixa anda (busca e download)' {
      $st = @($ev | Where-Object { $_.type -eq 'item.status' -and $_.key -eq 'creeds push up original mix' })
      @($st | ForEach-Object status) | Should -Contain 'pendente'
      ($st | Where-Object status -eq 'pendente' | Select-Object -First 1).search.query | Should -Not -BeNullOrEmpty
    }
    It 'emite item.attemptFailed quando troca de usuario' {
      $f = @($ev | Where-Object type -eq 'item.attemptFailed')
      $f.Count | Should -Be 1
      $f[0].user | Should -Be 'ruim'
      $f[0].reason | Should -Match 'Completed, Errored'
    }
    It 'emite item.diagnostic estruturado para as nao encontradas (P6)' {
      $d = @($ev | Where-Object type -eq 'item.diagnostic')
      $d.Count | Should -Be 2
      $p = $d | Where-Object line -eq 'Vendex - Plague'
      $p.reasons.'formato aiff (use -AceitarAacAiff)' | Should -BeGreaterThan 0
      $p.closest[0].reason | Should -Be 'formato aiff (use -AceitarAacAiff)'
      $p.closest[0].user | Should -Be 'u3'
      $p.closest[0].file | Should -Match 'Vendex - Plague\.aiff$'
      @($p.searches).Count | Should -BeGreaterThan 0
      ($d | Where-Object line -eq 'Fulano Inexistente - Nada Aqui').responses | Should -Be 0
    }
    It 'emite a busca de teste (search.check) quando as buscas voltam vazias' {
      $c = @($ev | Where-Object type -eq 'search.check')
      $c[0].phase | Should -Be 'start'
      ($c | Where-Object phase -eq 'end').blocked | Should -BeFalse
    }
    It 'emite progress com os contadores' {
      $p = @($ev | Where-Object type -eq 'progress')
      $p.Count | Should -BeGreaterThan 0
      $p[-1].total | Should -Be 4
    }
    It 'solta a trava da lista no fim' {
      Join-Path $amb.Raiz 'lotes\estado-lista.lock' | Should -Not -Exist
    }
  }

  Context '-ArquivoParada (P4)' {
    BeforeAll {
      $amb = New-AmbienteLote -Arquivos @(
        @{ usuario = 'lento'; arquivo = '@@l\Music\Azyr\Azyr - No Escape.flac' }
        @{ usuario = 'u2'; arquivo = '@@b\Music\Creeds\Creeds - Push Up (Original Mix).flac' }
      ) -UsuariosLentos @('lento')
      $evArq = Join-Path $amb.Raiz 'ev-parada.jsonl'
      $parada = Join-Path $amb.Raiz 'parar.flag'
      $bg = Start-Lote $amb -Linhas @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)') -Extra @('-Eventos', $evArq, '-ArquivoParada', $parada)
      # espera a faixa do usuario lento ficar parada na fila dele
      $limite = (Get-Date).AddSeconds(90)
      while ((Get-Date) -lt $limite -and -not ((Test-Path -LiteralPath $evArq) -and (Get-Content -LiteralPath $evArq -Raw) -match '"remoteQueued":true')) { Start-Sleep -Milliseconds 500 }
      $travaDurante = Test-Path -LiteralPath (Join-Path $amb.Raiz 'lotes\estado-lista.lock')
      # tentar a mesma lista enquanto ela roda: recusado (P8)
      $outra = Invoke-Lote $amb -Linhas @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)')
      New-Item -ItemType File -Path $parada | Out-Null
      $terminou = $bg.Processo.WaitForExit(60000)
      $ev = Get-EventosLote $evArq
    }
    AfterAll { if (-not $bg.Processo.HasExited) { $bg.Processo | Stop-Process -Force }; Remove-AmbienteLote $amb }

    It 'cria a trava enquanto roda' { $travaDurante | Should -BeTrue }
    It 'recusa outra execucao da mesma lista com codigo 5 (P8)' {
      $outra.ExitCode | Should -Be 5
      ($outra.Saida -join "`n") | Should -Match 'ja esta sendo baixada por outro processo'
    }
    It 'para com codigo 2' {
      $terminou | Should -BeTrue
      $bg.Processo.ExitCode | Should -Be 2
    }
    It 'grava run.stopping e termina com run.end (user)' {
      @($ev | Where-Object type -eq 'run.stopping').Count | Should -Be 1
      $ev[-1].type | Should -Be 'run.end'
      $ev[-1].reason | Should -Be 'user'
      $ev[-1].exitCode | Should -Be 2
    }
    It 'grava os relatorios mesmo parando no meio' {
      $rel = Get-RelatorioLote $amb 'resultado-'
      $rel.Count | Should -Be 1
      $linhas = Get-Content -LiteralPath $rel[0].FullName -Encoding UTF8
      ($linhas -match '^BAIXANDO\tAzyr - No Escape\t').Count | Should -Be 1
    }
    It 'solta a trava e apaga o arquivo de parada' {
      Join-Path $amb.Raiz 'lotes\estado-lista.lock' | Should -Not -Exist
      $parada | Should -Not -Exist
    }
  }

  Context 'trava abandonada (P8)' {
    BeforeAll { $amb = New-AmbienteLote -Arquivos $Catalogo }
    AfterAll { Remove-AmbienteLote $amb }

    It 'ignora trava de processo que nao existe mais' {
      New-Item -ItemType Directory -Path (Join-Path $amb.Raiz 'lotes') -Force | Out-Null
      Set-Content -LiteralPath (Join-Path $amb.Raiz 'lotes\estado-lista.lock') -Value "999999`t2026-01-01T00:00:00`tvelho"
      $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape')
      $r.ExitCode | Should -Be 0
      Join-Path $amb.Raiz 'lotes\estado-lista.lock' | Should -Not -Exist
    }
  }

  Context '-SoAnalisar (P5)' {
    BeforeAll {
      $amb = New-AmbienteLote -Arquivos $Catalogo
      function Invoke-Analise([string[]]$Linhas, [string[]]$Extra = @(), [string]$Nome = 'lista.txt') {
        $lista = Write-ListaTeste $amb $Linhas $Nome
        $out = & $PsExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $amb.Raiz 'baixar-lista.ps1') -Lista $lista -SoAnalisar @Extra
        [pscustomobject]@{ ExitCode = $LASTEXITCODE; Texto = ($out -join "`n"); Json = $(try { ($out -join "`n") | ConvertFrom-Json } catch { $null }) }
      }
    }
    AfterAll { Remove-AmbienteLote $amb }

    It 'devolve um JSON so na saida padrao, sem criar lotes\' {
      $a = Invoke-Analise @('# comentario', '01. Azyr - No Escape', '', 'Byørn – 2 LOUD', 'azyr - no escape', 'So Um Titulo', 'Novah - Bye Bye (NOVAH Remix)')
      $a.ExitCode | Should -Be 0
      $a.Json | Should -Not -BeNullOrEmpty
      $a.Json.ok | Should -BeTrue
      Join-Path $amb.Raiz 'lotes' | Should -Not -Exist
    }
    It 'separa artista, titulo e mix, com o numero da linha de origem' {
      $j = (Invoke-Analise @('# comentario', '01. Azyr - No Escape', '', 'RIOT CODE - Direct It To The Roof (Azyr Remix)')).Json
      $j.total | Should -Be 2
      $j.lines[0].sourceLine | Should -Be 2
      $j.lines[0].line | Should -Be 'Azyr - No Escape'
      $j.lines[0].artist | Should -Be 'Azyr'
      $j.lines[0].title | Should -Be 'No Escape'
      $j.lines[1].sourceLine | Should -Be 4
      $j.lines[1].mix | Should -Be 'Azyr Remix'
      $j.lines[1].original | Should -BeFalse
    }
    It 'marca repetidas, avisos e remixer' {
      $j = (Invoke-Analise @('Azyr - No Escape', 'azyr - no escape', 'So Um Titulo', 'Novah - Bye Bye (NOVAH Remix)')).Json
      $j.unique | Should -Be 3
      $j.duplicates | Should -Be 1
      $j.lines[1].status | Should -Be 'repetida'
      $j.lines[1].duplicateOf | Should -Be 1
      $j.lines[2].warnings[0] | Should -Match "sem ' - '"
      $j.lines[3].remixer | Should -BeTrue
    }
    It 'mantem acentos no JSON' {
      (Invoke-Analise @('Byørn – 2 LOUD')).Json.lines[0].line | Should -Be 'Byørn - 2 LOUD'
    }
    It 'marca o que ja foi feito numa execucao anterior da mesma lista' {
      $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape') -Nome 'feita.txt'
      $r.ExitCode | Should -Be 0
      $j = (Invoke-Analise @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)') -Nome 'feita.txt').Json
      $j.lines[0].status | Should -Be 'ja feita'
      $j.lines[0].previous | Should -Be 'baixada'
      $j.lines[1].status | Should -Be 'nova'
      $j.alreadyDone | Should -Be 1
      $j.toProcess | Should -Be 1
    }
    It 'grava em arquivo com -SaidaAnalise' {
      $saida = Join-Path $amb.Raiz 'analise.json'
      $a = Invoke-Analise @('Azyr - No Escape') -Extra @('-SaidaAnalise', $saida)
      $a.ExitCode | Should -Be 0
      (Get-Content -LiteralPath $saida -Raw -Encoding UTF8 | ConvertFrom-Json).lines[0].artist | Should -Be 'Azyr'
    }
    It 'CSV invalido: ok=false e codigo 4' {
      $a = Invoke-Analise @('a,b', '1,2') -Nome 'ruim.csv'
      $a.ExitCode | Should -Be 4
      $a.Json.ok | Should -BeFalse
      $a.Json.error | Should -Match 'CSV sem colunas'
    }
    It 'lista inexistente: ok=false e codigo 4, ainda em JSON' {
      $out = & $PsExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $amb.Raiz 'baixar-lista.ps1') -Lista 'nao-existe.txt' -SoAnalisar
      $LASTEXITCODE | Should -Be 4
      (($out -join "`n") | ConvertFrom-Json).ok | Should -BeFalse
    }
  }
}
