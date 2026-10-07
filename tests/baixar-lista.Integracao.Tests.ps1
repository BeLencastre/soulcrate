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
    @{ usuario = 'u2'; arquivo = '@@b\Music\Creeds\Creeds - Push Up (Original Mix).mp3'; bitrate = 320 }
    @{ usuario = 'u3'; arquivo = '@@c\Music\Vendex\Vendex - Plague.wav' }
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
      Join-Path $amb.Raiz 'downloads\Creeds\Creeds - Push Up (Original Mix).mp3' | Should -Exist
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
      $d | Should -Match 'motivos: formato wav \(use -AceitarWav\) x\d+'
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
      It 'com -Retentar e -AceitarWav, baixa a que so existia em WAV' {
        $r3 = Invoke-Lote $amb -Linhas @('Azyr - No Escape', 'Creeds - Push Up (Original Mix)', 'Vendex - Plague', 'Fulano Inexistente - Nada Aqui') -Extra @('-Retentar', '-AceitarWav')
        $r3.ExitCode | Should -Be 0
        Join-Path $amb.Raiz 'downloads\Vendex\Vendex - Plague.wav' | Should -Exist
      }
    }
  }

  Context 'troca de usuario' {
    BeforeAll {
      $amb = New-AmbienteLote -Arquivos @(
        @{ usuario = 'ruim'; arquivo = '@@r\Music\Azyr\Azyr - No Escape.flac' }
        @{ usuario = 'bom'; arquivo = '@@b\Music\Azyr\Azyr - No Escape.mp3'; bitrate = 320 }
      ) -UsuariosComErro @('ruim')
      $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape')
    }
    AfterAll { Remove-AmbienteLote $amb }

    It 'tenta o proximo usuario quando o download falha' {
      ($r.Saida -join "`n") | Should -Match 'ruim: Completed, Errored'
      Join-Path $amb.Raiz 'downloads\Azyr\Azyr - No Escape.mp3' | Should -Exist
    }
  }

  Context 'erros de configuracao' {
    BeforeAll { $amb = New-AmbienteLote }
    AfterAll { Remove-AmbienteLote $amb }

    It 'lista inexistente: falha com mensagem clara' {
      $out = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $amb.Raiz 'baixar-lista.ps1') -Lista 'nao-existe.txt' -SlskdUrl $amb.Url 2>&1 | ForEach-Object { "$_" }
      $LASTEXITCODE | Should -Not -Be 0
      ($out -join "`n") | Should -Match 'Arquivo de lista nao encontrado'
    }
    It 'lista vazia: falha com mensagem clara' {
      $r = Invoke-Lote $amb -Linhas @('# so comentario')
      $r.ExitCode | Should -Not -Be 0
      ($r.Saida -join "`n") | Should -Match 'A lista esta vazia'
    }
  }
}
