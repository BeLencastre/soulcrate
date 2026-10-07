#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }
<#
  Roda o validar-config.ps1 contra os casos compartilhados com o app
  (app/tests/fixtures/config/casos.json).
#>

BeforeDiscovery {
  $repo = Split-Path -Parent $PSScriptRoot
  $Casos = @((Get-Content -LiteralPath (Join-Path $repo 'app\tests\fixtures\config\casos.json') -Raw -Encoding UTF8 | ConvertFrom-Json).casos |
    ForEach-Object { @{ nome = $_.nome; esperado = $_.esperado; Caso = $_ } })
}

BeforeAll {
  $repo = Split-Path -Parent $PSScriptRoot
  $Dados = Get-Content -LiteralPath (Join-Path $repo 'app\tests\fixtures\config\casos.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $PsExe = (Get-Process -Id $PID).Path
  $utf8 = New-Object Text.UTF8Encoding $false

  function New-RaizCaso($caso) {
    $raiz = Join-Path ([IO.Path]::GetTempPath()) ("sc-config-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path (Join-Path $raiz 'slskd') -Force | Out-Null
    foreach ($p in $Dados.base.pastas) { New-Item -ItemType Directory -Path (Join-Path $raiz $p) -Force | Out-Null }

    $props = @($caso.PSObject.Properties.Name)
    if ($props -contains 'envDoRepositorio') {
      Copy-Item -LiteralPath (Join-Path $repo $caso.envDoRepositorio) -Destination (Join-Path $raiz '.env')
    } elseif (-not ($props -contains 'env' -and $null -eq $caso.env)) {
      $env = [ordered]@{}
      foreach ($p in $Dados.base.env.PSObject.Properties) { $env[$p.Name] = $p.Value }
      if ($props -contains 'env') {
        if ($caso.env.trocar) { foreach ($p in $caso.env.trocar.PSObject.Properties) { $env[$p.Name] = $p.Value } }
        if ($caso.env.remover) { foreach ($k in $caso.env.remover) { $env.Remove($k) } }
      }
      [IO.File]::WriteAllText((Join-Path $raiz '.env'), ((@($env.Keys | ForEach-Object { "$_=$($env[$_])" }) -join "`n") + "`n"), $utf8)
    }

    if (-not ($props -contains 'yml' -and $null -eq $caso.yml)) {
      $yml = $(if ($props -contains 'yml') { $caso.yml } else { $Dados.base.yml })
      [IO.File]::WriteAllText((Join-Path $raiz 'slskd\slskd.yml'), $yml.Replace('{{CHAVE}}', $Dados.base.chave), $utf8)
    }
    return $raiz
  }
}

Describe 'validar-config.ps1' {
  It '<nome>' -ForEach $Casos {
    $raiz = New-RaizCaso $Caso
    try {
      $out = & $PsExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $repo 'validar-config.ps1') -Raiz $raiz -Json
      $codigo = $LASTEXITCODE
      $r = ($out -join "`n") | ConvertFrom-Json
      $erros = @($r.achados | Where-Object nivel -eq 'erro' | ForEach-Object id | Sort-Object -Unique)
      $avisos = @($r.achados | Where-Object nivel -eq 'aviso' | ForEach-Object id | Sort-Object -Unique)
      $erros | Should -Be @($esperado.erros | Sort-Object -Unique)
      $avisos | Should -Be @($esperado.avisos | Sort-Object -Unique)
      $codigo | Should -Be $esperado.codigo
      $r.ok | Should -Be ($esperado.codigo -eq 0)
      # nunca mostra segredos
      ($out -join "`n") | Should -Not -Match ([regex]::Escape($Dados.base.env.SLSK_PASSWORD))
      ($out -join "`n") | Should -Not -Match ([regex]::Escape($Dados.base.chave))
    } finally { Remove-Item -LiteralPath $raiz -Recurse -Force -ErrorAction SilentlyContinue }
  }

  It 'modo texto: diz que esta tudo certo quando nao ha achados' {
    $raiz = New-RaizCaso ([pscustomobject]@{ nome = 'ok' })
    try {
      $out = & $PsExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $repo 'validar-config.ps1') -Raiz $raiz 6>&1 | ForEach-Object { "$_" }
      $LASTEXITCODE | Should -Be 0
      ($out -join "`n") | Should -Match '\[ok\] Configuracao conferida'
    } finally { Remove-Item -LiteralPath $raiz -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
