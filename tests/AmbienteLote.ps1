<#
  Ambiente isolado para rodar o baixar-lista.ps1 de verdade nos testes de integracao:
  uma pasta temporaria com copia do script, um .env de teste e o slskd falso
  (tests\dubles\slskd-falso.mjs, precisa do Node.js).

  Uso (dot-source):
    $amb = New-AmbienteLote -Arquivos @(@{ usuario = 'u1'; arquivo = '@@a\Music\Azyr\Azyr - No Escape.flac' })
    $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape')        # roda e espera terminar
    $r.ExitCode; $r.Saida; $amb.Raiz
    Remove-AmbienteLote $amb
#>

$script:RepoRaiz = Split-Path -Parent $PSScriptRoot

function New-AmbienteLote {
  param(
    [object[]]$Arquivos = @(),
    [string[]]$UsuariosLentos = @(),
    [string[]]$UsuariosComErro = @(),
    [string]$Origem = $script:RepoRaiz         # de onde copiar o baixar-lista.ps1 (permite comparar versoes)
  )
  $raiz = Join-Path ([IO.Path]::GetTempPath()) ("soulcrate-teste-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path (Join-Path $raiz 'downloads') -Force | Out-Null
  foreach ($f in @('baixar-lista.ps1', 'baixar-lista.lib.ps1')) {
    $p = Join-Path $Origem $f
    if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $raiz }
  }
  Set-Content -LiteralPath (Join-Path $raiz '.env') -Encoding UTF8 -Value @('SLSKD_API_KEY_SOULBEET=chave-teste', 'DOWNLOADS_DIR=./downloads')

  # a busca de teste ("daft punk") precisa ter resposta, senao toda faixa sem resposta vira "bloqueio"
  $todos = @($Arquivos) + @(@{ usuario = 'canario'; arquivo = '@@c\Music\Daft Punk\Daft Punk - One More Time.flac' })
  $cat = Join-Path $raiz 'catalogo.json'
  $json = ConvertTo-Json -Depth 5 -InputObject ([ordered]@{ arquivos = @($todos); usuariosLentos = @($UsuariosLentos); usuariosComErro = @($UsuariosComErro); compartilhados = 10 })
  [IO.File]::WriteAllText($cat, $json, (New-Object Text.UTF8Encoding $false))

  $saida = Join-Path $raiz 'slskd-falso.out'
  $proc = Start-Process -FilePath 'node' -PassThru -WindowStyle Hidden -RedirectStandardOutput $saida -RedirectStandardError (Join-Path $raiz 'slskd-falso.err') `
    -ArgumentList @("`"$(Join-Path $PSScriptRoot 'dubles\slskd-falso.mjs')`"", '--catalogo', "`"$cat`"", '--downloads', "`"$(Join-Path $raiz 'downloads')`"")
  $porta = $null
  for ($i = 0; $i -lt 100 -and -not $porta; $i++) {
    Start-Sleep -Milliseconds 100
    $l = Get-Content -LiteralPath $saida -TotalCount 1 -ErrorAction SilentlyContinue
    if ($l) { $porta = (ConvertFrom-Json $l).porta }
  }
  if (-not $porta) { $proc | Stop-Process -Force -ErrorAction SilentlyContinue; throw "slskd falso nao subiu: $(Get-Content (Join-Path $raiz 'slskd-falso.err') -Raw)" }
  return [pscustomobject]@{ Raiz = $raiz; Porta = $porta; Url = "http://127.0.0.1:$porta"; Processo = $proc }
}

function Get-ArgsLote($amb, [string]$Lista, [string[]]$Extra) {
  $s = Join-Path $amb.Raiz 'baixar-lista.ps1'
  return @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $s, '-Lista', $Lista, '-SlskdUrl', $amb.Url, '-SemCatalogo', '-SemBeets') + @($Extra)
}

function Write-ListaTeste($amb, [string[]]$Linhas, [string]$Nome = 'lista.txt') {
  $lista = Join-Path $amb.Raiz $Nome
  Set-Content -LiteralPath $lista -Encoding UTF8 -Value $Linhas
  return $lista
}

# Roda o lote e espera terminar. Devolve a saida (texto) e o codigo de saida.
function Invoke-Lote($amb, [string[]]$Linhas, [string[]]$Extra = @(), [string]$Nome = 'lista.txt') {
  $lista = Write-ListaTeste $amb $Linhas $Nome
  $out = & powershell.exe (Get-ArgsLote $amb $lista $Extra) 2>&1 | ForEach-Object { "$_" }
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Saida = @($out); Lista = $lista }
}

# Inicia o lote em segundo plano (para testar parada e trava). Saida em <raiz>\saida-<n>.log
function Start-Lote($amb, [string[]]$Linhas, [string[]]$Extra = @(), [string]$Nome = 'lista.txt') {
  $lista = Write-ListaTeste $amb $Linhas $Nome
  $log = Join-Path $amb.Raiz ("saida-" + [guid]::NewGuid().ToString('N').Substring(0, 6) + ".log")
  $args = @(Get-ArgsLote $amb $lista $Extra | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } })
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  return [pscustomobject]@{ Processo = $p; Log = $log; Lista = $lista }
}

function Get-RelatorioLote($amb, [string]$Prefixo) {
  return @(Get-ChildItem -LiteralPath (Join-Path $amb.Raiz 'lotes') -Filter "$Prefixo*" -File -ErrorAction SilentlyContinue | Sort-Object Name)
}

function Remove-AmbienteLote($amb) {
  if ($amb.Processo) { $amb.Processo | Stop-Process -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
  Remove-Item -LiteralPath $amb.Raiz -Recurse -Force -ErrorAction SilentlyContinue
}
