<#
  Gera as fixtures do protocolo do lote (eventos JSONL, relatorios e analise da lista)
  rodando o baixar-lista.ps1 de verdade contra o slskd falso. O app usa essas fixtures nos
  testes (app/tests/fixtures/lote/). Rode de novo sempre que o formato dos eventos mudar:

    powershell -File tests\Gerar-Fixtures.ps1

  As fixtures nao tem segredos: o .env do ambiente de teste so tem a chave "chave-teste".
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'AmbienteLote.ps1')
$destino = Join-Path (Split-Path -Parent $PSScriptRoot) 'app\tests\fixtures\lote'
New-Item -ItemType Directory -Path $destino -Force | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false

$catalogo = @(
  @{ usuario = 'ruim'; arquivo = '@@r\Music\Azyr\Azyr - No Escape.flac' }
  @{ usuario = 'u1'; arquivo = '@@a\Music\Azyr\Azyr - No Escape.wav' }
  @{ usuario = 'u2'; arquivo = '@@b\Music\Creeds\Creeds - Push Up (Original Mix).flac' }
  @{ usuario = 'u3'; arquivo = '@@c\Music\Vendex\Vendex - Plague.aiff' }
  @{ usuario = 'u4'; arquivo = '@@d\Music\Vendex\Vendex - Abbadon.flac' }
  @{ usuario = 'u5'; arquivo = '@@e\Music\Byørn\Byørn - 2 LOUD.flac' }
)
$linhas = @('# lista de exemplo', 'Azyr - No Escape', 'Creeds - Push Up (Original Mix)', 'Vendex - Plague', 'Vendex - Abaddon', 'Byørn – 2 LOUD', 'Fulano Inexistente - Nada Aqui')

# Copia trocando a pasta temporaria do teste (que tem o nome do usuario) por C:\Soulcrate
# e a porta aleatoria do slskd falso pela padrao
function Copy-Fixture([string]$origem, [string]$nome) {
  $b = [IO.File]::ReadAllBytes($origem)
  $bom = ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)   # os .txt do PowerShell 5.1 tem BOM: o app precisa lidar com isso
  $t = [IO.File]::ReadAllText($origem, $utf8).TrimStart([char]0xFEFF)
  $raiz = $amb.Raiz.TrimEnd('\')
  $t = $t.Replace($raiz.Replace('\', '\\'), 'C:\\Soulcrate').Replace($raiz, 'C:\Soulcrate')
  $t = $t -replace '127\.0\.0\.1:\d+', 'localhost:5030'
  [IO.File]::WriteAllText((Join-Path $destino $nome), $t, (New-Object Text.UTF8Encoding $bom))
  Write-Host "  $nome"
}

Write-Host "Gerando fixtures em $destino"

# 1) execucao completa
$amb = New-AmbienteLote -Arquivos $catalogo -UsuariosComErro @('ruim')
try {
  $r = Invoke-Lote $amb -Linhas $linhas -Extra @('-Eventos', 'lotes\eventos-exemplo.jsonl', '-IdExecucao', 'exemplo')
  if ($r.ExitCode -ne 0) { throw "execucao completa saiu com $($r.ExitCode)" }
  Copy-Fixture (Join-Path $amb.Raiz 'lotes\eventos-exemplo.jsonl') 'eventos-completo.jsonl'
  Copy-Fixture (Join-Path $amb.Raiz 'lotes\resultado-exemplo.txt') 'resultado-exemplo.txt'
  Copy-Fixture (Join-Path $amb.Raiz 'lotes\nao-baixadas-exemplo.txt') 'nao-baixadas-exemplo.txt'
  Copy-Fixture (Join-Path $amb.Raiz 'lotes\diagnostico-exemplo.txt') 'diagnostico-exemplo.txt'
  Copy-Fixture (Join-Path $amb.Raiz 'lotes\estado-lista.tsv') 'estado-lista.tsv'

  # 2) analise da mesma lista depois da execucao (marca as ja feitas)
  $saida = Join-Path $amb.Raiz 'analise.json'
  & $PsExe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $amb.Raiz 'baixar-lista.ps1') -Lista $r.Lista -SoAnalisar -SaidaAnalise $saida
  Copy-Fixture $saida 'analise-lista.json'
} finally { Remove-AmbienteLote $amb }

# 3) execucao parada pelo usuario
$amb = New-AmbienteLote -Arquivos @(@{ usuario = 'lento'; arquivo = '@@l\Music\Azyr\Azyr - No Escape.flac' }) -UsuariosLentos @('lento')
try {
  $ev = Join-Path $amb.Raiz 'ev.jsonl'; $parada = Join-Path $amb.Raiz 'parar.flag'
  $bg = Start-Lote $amb -Linhas @('Azyr - No Escape') -Extra @('-Eventos', $ev, '-ArquivoParada', $parada, '-IdExecucao', 'parada')
  $limite = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $limite -and -not ((Test-Path -LiteralPath $ev) -and (Get-Content -LiteralPath $ev -Raw) -match '"remoteQueued":true')) { Start-Sleep -Milliseconds 500 }
  New-Item -ItemType File -Path $parada | Out-Null
  if (-not $bg.Processo.WaitForExit(60000)) { throw 'execucao parada nao terminou' }
  Copy-Fixture $ev 'eventos-parado.jsonl'
} finally { Remove-AmbienteLote $amb }

# 4) erro de configuracao (API key recusada)
$amb = New-AmbienteLote
try {
  Set-Content -LiteralPath (Join-Path $amb.Raiz '.env') -Encoding UTF8 -Value @('SLSKD_API_KEY_SOULBEET=chave-errada', 'DOWNLOADS_DIR=./downloads')
  $r = Invoke-Lote $amb -Linhas @('Azyr - No Escape') -Extra @('-Eventos', 'ev.jsonl', '-IdExecucao', 'erro')
  Copy-Fixture (Join-Path $amb.Raiz 'ev.jsonl') 'eventos-erro-config.jsonl'
} finally { Remove-AmbienteLote $amb }

Write-Host "Pronto."
