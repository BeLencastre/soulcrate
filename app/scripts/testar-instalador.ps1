<#
.SYNOPSIS
  Critério de aceite da Fase 7 (§5): instalar, atualizar de uma versão para a seguinte e desinstalar sem perder o .env,
  as listas, os lotes/, a biblioteca nem as preferências do app.

.DESCRIPTION
  Roda os instaladores de verdade, em silêncio (/S), no perfil de quem executa:
    1. instala a versão ANTERIOR e confere que ela abre (--smoke-test);
    2. cria uma "pasta do Soulcrate" de mentira (com espaço e acento no nome) e um arquivo marcador nos dados do app;
    3. instala a versão ATUAL por cima (o mesmo caminho que o electron-updater segue ao atualizar) e confere a versão nova
       e que NADA do que foi criado no passo 2 mudou;
    4. desinstala e confere que o programa, o atalho e a entrada do Windows sumiram e que a pasta do Soulcrate e os dados
       do app continuam lá;
    5. (só com -TestarApagarDados, em máquina descartável) reinstala, desinstala com --delete-app-data e confere que só os
       dados do app saíram: a pasta do Soulcrate continua intacta.
  Os instaladores de teste são gerados com `-c.nsis.runAfterFinish=false`: nada abre sozinho depois de instalar, e o
  `--smoke-test` usa uma pasta de dados temporária, então o app instalado nunca toca na sua pasta do Soulcrate de verdade.
  Aviso: instala e desinstala o Soulcrate no usuário atual (HKCU, %LOCALAPPDATA%\Programs, menu Iniciar). Não rode onde
  você já usa o Soulcrate instalado: o script recusa se achar uma instalação anterior.

.EXAMPLE
  ./scripts/testar-instalador.ps1 -Anterior dist-anterior/Soulcrate-Setup-0.0.1.exe -Atual dist/Soulcrate-Setup-0.2.0.exe `
    -VersaoAnterior 0.0.1 -VersaoAtual 0.2.0
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Anterior,
  [Parameter(Mandatory)] [string] $Atual,
  [Parameter(Mandatory)] [string] $VersaoAnterior,
  [Parameter(Mandatory)] [string] $VersaoAtual,
  [switch] $TestarApagarDados
)
$ErrorActionPreference = 'Stop'

$programas = Join-Path $env:LOCALAPPDATA 'Programs'
$atalho = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Soulcrate.lnk'
$dadosDoApp = Join-Path $env:APPDATA 'Soulcrate'
$marcadorDoApp = Join-Path $dadosDoApp 'marcador-teste-instalador.txt'
$raiz = Join-Path $env:TEMP ("sc-instalador-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$pastaDoSoulcrate = Join-Path $raiz 'Soulcrate com espaço'

function Falhar([string] $mensagem) { throw "FALHOU: $mensagem" }
function Passo([string] $texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Conferir([bool] $condicao, [string] $mensagem) {
  if (-not $condicao) { Falhar $mensagem }
  Write-Host "  ok: $mensagem"
}

function Entrada-Instalada {
  # a entrada do Windows que o instalador grava (HKCU, por usuário)
  Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DisplayName -eq 'Soulcrate' }
}

function Achar-Executavel {
  Get-ChildItem $programas -Recurse -Filter 'Soulcrate.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}

function Esperar-Ate([scriptblock] $condicao, [int] $segundos, [string] $oQue) {
  for ($i = 0; $i -lt $segundos; $i++) {
    if (& $condicao) { return }
    Start-Sleep -Seconds 1
  }
  Falhar "demorou demais: $oQue"
}

function Instalar([string] $setup) {
  $p = Start-Process -FilePath (Resolve-Path $setup).Path -ArgumentList '/S' -Wait -PassThru
  Conferir ($p.ExitCode -eq 0) "o instalador $(Split-Path $setup -Leaf) saiu com código 0"
  Esperar-Ate { Achar-Executavel } 60 'o Soulcrate.exe aparecer em %LOCALAPPDATA%\Programs'
  return Achar-Executavel
}

function Versao-Que-Abre([string] $exe) {
  # `--smoke-test`: abre a janela, confere o preload e o IPC e imprime a versão; usa uma pasta de dados temporária
  $saida = Join-Path $raiz ("smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.txt')
  $p = Start-Process -FilePath $exe -ArgumentList '--smoke-test' -RedirectStandardOutput $saida -Wait -PassThru
  $texto = if (Test-Path $saida) { Get-Content $saida -Raw } else { '' }
  Conferir ($p.ExitCode -eq 0) "o app instalado abre e fecha (código $($p.ExitCode))"
  if ($texto -notmatch 'SOULCRATE_SMOKE_OK\s+(\S+)') { Falhar "o smoke test não informou a versão: $texto" }
  return $Matches[1]
}

function Desinstalar([string[]] $argumentos = @('/S')) {
  $exe = Achar-Executavel
  $pasta = Split-Path $exe -Parent
  $un = Get-ChildItem $pasta -Filter 'Uninstall*.exe' | Select-Object -First 1 -ExpandProperty FullName
  if (-not $un) { Falhar "o desinstalador não está em $pasta" }
  Start-Process -FilePath $un -ArgumentList $argumentos -Wait | Out-Null
  # o desinstalador se copia para a pasta temporária e termina por lá: espera o programa sumir de fato
  Esperar-Ate { -not (Achar-Executavel) } 90 'o programa sair de %LOCALAPPDATA%\Programs'
}

function Hashes([string] $pasta) {
  Get-ChildItem $pasta -Recurse -File | Sort-Object FullName | ForEach-Object {
    "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash, $_.FullName.Substring($pasta.Length)
  }
}

function Criar-Dados-Do-Usuario {
  $arquivos = @{
    '.env'                         = "SLSK_PASSWORD=senha-de-teste`r`nMUSIC_DIR=./music`r`n"
    'slskd\slskd.yml'              = "web:`r`n  authentication:`r`n    api_keys:`r`n"
    'lista-sabado.txt'             = "Azyr - No Escape`r`n"
    'lotes\estado-lista-sabado.tsv' = "importada`tazyr no escape`tAzyr - No Escape`r`n"
    'lotes\resultado-20261007-1.txt' = "BAIXADA`tAzyr`r`n"
    'music\Hard Techno\Azyr\No Escape.flac' = 'audio de mentira'
    'navidrome\navidrome.db'       = 'banco de mentira'
    'docker-compose.yml'           = 'name: soulcrate'
  }
  foreach ($k in $arquivos.Keys) {
    $caminho = Join-Path $pastaDoSoulcrate $k
    New-Item -ItemType Directory -Force (Split-Path $caminho -Parent) | Out-Null
    [IO.File]::WriteAllText($caminho, $arquivos[$k], (New-Object Text.UTF8Encoding $false))
  }
  New-Item -ItemType Directory -Force $dadosDoApp | Out-Null
  [IO.File]::WriteAllText($marcadorDoApp, 'preferências do app (marcador do teste)', (New-Object Text.UTF8Encoding $false))
}

# ---------------------------------------------------------------- antes de começar
foreach ($f in @($Anterior, $Atual)) { if (-not (Test-Path $f)) { Falhar "não achei o instalador $f" } }
if (Entrada-Instalada) { Falhar 'já existe um Soulcrate instalado neste usuário. Este teste instala e desinstala: rode numa máquina de teste.' }
if (Test-Path $marcadorDoApp) { Remove-Item $marcadorDoApp -Force }
New-Item -ItemType Directory -Force $raiz | Out-Null

try {
  Passo "1. instalar a versão anterior ($VersaoAnterior)"
  $exe = Instalar $Anterior
  Conferir ((Versao-Que-Abre $exe) -eq $VersaoAnterior) "a versão que abre é a $VersaoAnterior"
  Conferir (Test-Path $atalho) 'há um atalho no menu Iniciar'
  Conferir ($null -ne (Entrada-Instalada)) 'o Windows lista o Soulcrate em Aplicativos instalados'
  Conferir (-not (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Soulcrate.lnk'))) 'não criou atalho na área de trabalho'
  Conferir (Test-Path (Join-Path (Split-Path $exe -Parent) 'resources\stack\docker-compose.yml')) 'os arquivos da stack vieram no instalador'
  Conferir (Test-Path (Join-Path (Split-Path $exe -Parent) 'resources\app-update.yml')) 'o app sabe de onde se atualizar (app-update.yml)'

  Passo '2. criar a pasta do Soulcrate e os dados do app'
  Criar-Dados-Do-Usuario
  $antesPasta = Hashes $pastaDoSoulcrate
  $antesApp = (Get-FileHash $marcadorDoApp -Algorithm SHA256).Hash
  Conferir ($antesPasta.Count -ge 8) "criei $($antesPasta.Count) arquivos na pasta do Soulcrate"

  Passo "3. atualizar para a versão seguinte ($VersaoAtual), por cima"
  $exeNovo = Instalar $Atual
  Conferir ($exeNovo -eq $exe) 'a atualização ficou no mesmo lugar'
  Conferir ((Versao-Que-Abre $exeNovo) -eq $VersaoAtual) "a versão que abre agora é a $VersaoAtual"
  Conferir (@(Entrada-Instalada).Count -eq 1) 'continua uma só entrada em Aplicativos instalados'
  Conferir ((Hashes $pastaDoSoulcrate) -join "`n" -eq ($antesPasta -join "`n")) 'a pasta do Soulcrate está idêntica (.env, listas, lotes/, biblioteca)'
  Conferir ((Get-FileHash $marcadorDoApp -Algorithm SHA256).Hash -eq $antesApp) 'os dados do app estão intactos'

  Passo '4. desinstalar (em silêncio: não pergunta nem apaga nada)'
  Desinstalar
  Conferir (-not (Test-Path $atalho)) 'o atalho do menu Iniciar saiu'
  Conferir ($null -eq (Entrada-Instalada)) 'o Windows não lista mais o Soulcrate'
  Conferir ((Hashes $pastaDoSoulcrate) -join "`n" -eq ($antesPasta -join "`n")) 'a pasta do Soulcrate continua idêntica'
  Conferir ((Test-Path $marcadorDoApp) -and (Get-FileHash $marcadorDoApp -Algorithm SHA256).Hash -eq $antesApp) 'os dados do app continuam lá'

  if ($TestarApagarDados) {
    Passo '5. reinstalar e desinstalar pedindo para apagar os dados do app'
    $null = Instalar $Atual
    Desinstalar @('/S', '--delete-app-data')
    Conferir (-not (Test-Path $marcadorDoApp)) 'os dados do app saíram (--delete-app-data)'
    Conferir ((Hashes $pastaDoSoulcrate) -join "`n" -eq ($antesPasta -join "`n")) 'a pasta do Soulcrate continua idêntica mesmo assim'
  }

  Write-Host "`nInstalar, atualizar e desinstalar: sem perder .env, listas, lotes/ nem biblioteca." -ForegroundColor Green
}
finally {
  # deixa a máquina como estava
  if (Achar-Executavel) { try { Desinstalar } catch { Write-Warning "não consegui desinstalar no fim: $_" } }
  if (Test-Path $marcadorDoApp) { Remove-Item $marcadorDoApp -Force -ErrorAction SilentlyContinue }
  if ((Test-Path $dadosDoApp) -and -not (Get-ChildItem $dadosDoApp -Force -ErrorAction SilentlyContinue)) {
    Remove-Item $dadosDoApp -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $raiz -Recurse -Force -ErrorAction SilentlyContinue
}
