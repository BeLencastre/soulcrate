<#
  validar-config.ps1 — confere o .env e o slskd\slskd.yml antes de subir a stack.

  As regras estao descritas em docs/validacao-configuracao.md. O app do Soulcrate implementa
  as mesmas regras; os dois sao testados com os casos de app/tests/fixtures/config/casos.json.

  Uso:  powershell -File validar-config.ps1            (texto, usado pelo subir.bat)
        powershell -File validar-config.ps1 -Json      (um objeto JSON na saida padrao)
        powershell -File validar-config.ps1 -Raiz <pasta do Soulcrate>

  Codigo de saida: 0 = pode subir (pode haver avisos)
                   1 = erro no .env (ou nos dois arquivos)
                   2 = erro so no slskd\slskd.yml
  Nunca mostra senhas nem chaves.
#>
param(
  [string]$Raiz = $PSScriptRoot,
  [switch]$Json
)
$ErrorActionPreference = 'Stop'

# KEY=VALOR por linha; ignora comentarios; tira espacos e aspas das pontas (igual ao baixar-lista.ps1)
function Read-EnvArquivo([string]$path) {
  $h = [ordered]@{}
  foreach ($l in Get-Content -LiteralPath $path -Encoding UTF8) {
    if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
  }
  return $h
}

# Chave da API do slskd usada pelo Soulbeet: web.authentication.api_keys.soulbeet.key
# (sem a entrada "soulbeet", usa a primeira "key:" do arquivo, como o baixar-lista.ps1)
function Get-ChaveSlskd([string[]]$linhas) {
  $dentro = $false; $indent = -1
  foreach ($l in $linhas) {
    if ($l -match '^(\s*)soulbeet:\s*$') { $dentro = $true; $indent = $Matches[1].Length; continue }
    if ($dentro) {
      if ($l -match '^(\s*)\S' -and $Matches[1].Length -le $indent -and $l -notmatch '^\s*#') { $dentro = $false; continue }
      if ($l -match '^\s*key:\s*(.+?)\s*$') { return $Matches[1].Trim('"').Trim("'") }
    }
  }
  foreach ($l in $linhas) { if ($l -match '^\s*key:\s*(.+?)\s*$') { return $Matches[1].Trim('"').Trim("'") } }
  return $null
}

function Resolve-PastaEnv([string]$valor) {
  if ([IO.Path]::IsPathRooted($valor)) { return [IO.Path]::GetFullPath($valor) }
  return [IO.Path]::GetFullPath((Join-Path $Raiz $valor))
}

function Test-ConfigSoulcrate {
  $achados = New-Object System.Collections.ArrayList
  function Add-Achado([string]$id, [string]$nivel, [string]$arquivo, [string]$variavel, [string]$mensagem) {
    [void]$achados.Add([ordered]@{ id = $id; nivel = $nivel; arquivo = $arquivo; variavel = $variavel; mensagem = $mensagem })
  }

  # ---------------------------------------------------------------- .env
  $envPath = Join-Path $Raiz '.env'
  $cfg = $null
  if (-not (Test-Path -LiteralPath $envPath)) {
    Add-Achado 'ENV_AUSENTE' 'erro' '.env' $null 'O arquivo .env nao existe. Copie o .env.example para .env e preencha.'
  } else {
    $cfg = Read-EnvArquivo $envPath

    $obrigatorias = [ordered]@{
      PUID = 'id do usuario (1000 no Windows)'; PGID = 'id do grupo (1000 no Windows)'; TZ = 'fuso horario, ex.: America/Sao_Paulo'
      DOWNLOADS_DIR = 'pasta dos downloads'; INCOMPLETE_DIR = 'pasta dos downloads incompletos'; MUSIC_DIR = 'pasta da biblioteca'
      SLSK_USERNAME = 'usuario do Soulseek'; SLSK_PASSWORD = 'senha do Soulseek'
      SLSKD_WEB_USER = 'usuario da Web UI do slskd'; SLSKD_WEB_PASSWORD = 'senha da Web UI do slskd'
      SOULBEET_SECRET_KEY = 'chave secreta do Soulbeet'
    }
    foreach ($k in $obrigatorias.Keys) {
      if (-not $cfg.Contains($k) -or -not $cfg[$k]) { Add-Achado 'ENV_VAZIA' 'erro' '.env' $k "$k esta vazia ou faltando ($($obrigatorias[$k]))." }
    }

    # valores de exemplo do .env.example (senhas e chaves conhecidas)
    foreach ($k in @($cfg.Keys)) {
      $v = [string]$cfg[$k]
      if ($v -match '^PREENCHA_' -or $v -match '^troque-' -or $v -in @('seu_usuario_soulseek', 'sua_senha_soulseek')) {
        Add-Achado 'ENV_EXEMPLO' 'erro' '.env' $k "$k ainda tem o valor de exemplo do .env.example."
      }
    }

    foreach ($k in @('PUID', 'PGID')) {
      if ($cfg[$k] -and $cfg[$k] -notmatch '^\d+$') { Add-Achado 'ENV_ID_INVALIDO' 'erro' '.env' $k "$k precisa ser um numero (ex.: 1000)." }
    }

    # pastas: precisam existir (o Docker nao cria a origem de um bind mount) e de preferencia no mesmo disco
    $pastas = [ordered]@{}
    foreach ($k in @('DOWNLOADS_DIR', 'INCOMPLETE_DIR', 'MUSIC_DIR')) {
      $v = [string]$cfg[$k]
      if (-not $v) { continue }
      if ($v.Contains('\')) { Add-Achado 'PASTA_BARRA_INVERTIDA' 'aviso' '.env' $k "$k usa barra invertida (\). Prefira barras normais, ex.: D:/DJ/Music." }
      $full = $null
      try { $full = Resolve-PastaEnv $v } catch { Add-Achado 'PASTA_INVALIDA' 'erro' '.env' $k "$k nao e um caminho valido: $v"; continue }
      $pastas[$k] = $full
      if (-not (Test-Path -LiteralPath $full -PathType Container)) { Add-Achado 'PASTA_INEXISTENTE' 'erro' '.env' $k "A pasta de $k nao existe: $full. Crie a pasta antes de subir." }
      elseif ($full -match '\\OneDrive( - [^\\]+)?\\') { Add-Achado 'PASTA_ONEDRIVE' 'aviso' '.env' $k "$k esta dentro do OneDrive. A sincronizacao pode travar arquivos durante o download; prefira uma pasta fora dele." }
    }
    if ($pastas.Contains('DOWNLOADS_DIR') -and $pastas.Contains('MUSIC_DIR')) {
      $d1 = [IO.Path]::GetPathRoot($pastas['DOWNLOADS_DIR']); $d2 = [IO.Path]::GetPathRoot($pastas['MUSIC_DIR'])
      if ($d1 -ne $d2) { Add-Achado 'PASTAS_DISCOS_DIFERENTES' 'aviso' '.env' 'MUSIC_DIR' "DOWNLOADS_DIR ($d1) e MUSIC_DIR ($d2) estao em discos diferentes: mover cada faixa para a biblioteca vira copia (mais lento)." }
    }

    if ($cfg['SOULBEET_SECRET_KEY'] -and ([string]$cfg['SOULBEET_SECRET_KEY']).Length -lt 32) {
      Add-Achado 'CHAVE_CURTA' 'aviso' '.env' 'SOULBEET_SECRET_KEY' 'SOULBEET_SECRET_KEY e curta: use pelo menos 32 caracteres aleatorios.'
    }
    if (-not $cfg['SLSKD_API_KEY_SOULBEET']) {
      Add-Achado 'ENV_SEM_CHAVE_LOTE' 'aviso' '.env' 'SLSKD_API_KEY_SOULBEET' 'SLSKD_API_KEY_SOULBEET esta vazia: o download em lote vai usar a chave do slskd\slskd.yml.'
    }
  }

  # ---------------------------------------------------------------- slskd.yml
  $ymlPath = Join-Path $Raiz 'slskd\slskd.yml'
  if (-not (Test-Path -LiteralPath $ymlPath)) {
    Add-Achado 'YML_AUSENTE' 'erro' 'slskd/slskd.yml' $null 'O arquivo slskd\slskd.yml nao existe. Copie o slskd\slskd.example.yml para slskd\slskd.yml.'
  } else {
    $linhas = @(Get-Content -LiteralPath $ymlPath -Encoding UTF8)
    $chave = Get-ChaveSlskd $linhas
    if (-not $chave) {
      Add-Achado 'YML_SEM_CHAVE' 'erro' 'slskd/slskd.yml' 'web.authentication.api_keys.soulbeet.key' 'Nao achei a API key do Soulbeet no slskd\slskd.yml.'
    } elseif ($chave -eq 'TROQUE_POR_UMA_CHAVE_ALEATORIA') {
      Add-Achado 'YML_EXEMPLO' 'erro' 'slskd/slskd.yml' 'web.authentication.api_keys.soulbeet.key' 'A API key do slskd\slskd.yml ainda e a de exemplo. Troque pela mesma chave de SLSKD_API_KEY_SOULBEET do .env.'
    } else {
      if ($chave.Length -lt 16) { Add-Achado 'CHAVE_CURTA' 'aviso' 'slskd/slskd.yml' 'web.authentication.api_keys.soulbeet.key' 'A API key do slskd e curta: use pelo menos 32 caracteres aleatorios.' }
      $chaveEnv = $(if ($cfg) { [string]$cfg['SLSKD_API_KEY_SOULBEET'] } else { '' })
      if ($chaveEnv -and $chaveEnv -notmatch '^troque-' -and $chaveEnv -ne $chave) {
        Add-Achado 'CHAVES_DIFERENTES' 'erro' '.env' 'SLSKD_API_KEY_SOULBEET' 'SLSKD_API_KEY_SOULBEET (.env) e diferente da API key do slskd\slskd.yml: as duas precisam ser identicas.'
      }
    }
  }
  return ,$achados
}

$achados = Test-ConfigSoulcrate
$erros = @($achados | Where-Object { $_.nivel -eq 'erro' })
$codigo = 0
if ($erros.Count) { $codigo = $(if (@($erros | Where-Object { $_.arquivo -eq '.env' }).Count) { 1 } else { 2 }) }

if ($Json) {
  $saida = [ordered]@{ ok = ($erros.Count -eq 0); erros = $erros.Count; avisos = @($achados).Count - $erros.Count; achados = [object[]]@($achados) }
  try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch {}
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $saida -Depth 5 -Compress))
} else {
  foreach ($a in $achados) {
    $cor = $(if ($a.nivel -eq 'erro') { 'Red' } else { 'Yellow' })
    Write-Host ("[{0}] {1}" -f $(if ($a.nivel -eq 'erro') { '!' } else { 'aviso' }), $a.mensagem) -ForegroundColor $cor
  }
  if (-not @($achados).Count) { Write-Host '[ok] Configuracao conferida (.env e slskd\slskd.yml).' -ForegroundColor Green }
}
exit $codigo
