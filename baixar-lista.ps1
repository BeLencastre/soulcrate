<#
  baixar-lista.ps1 — download em lote para a stack slskd + Soulbeet (beets)

  Le uma lista (.txt com "Artista - Titulo (Mix)" por linha, ou .csv exportado
  do Spotify/Exportify/TuneMyMusic), busca cada faixa no slskd, escolhe o melhor
  arquivo (FLAC, senao MP3 320), baixa e importa com o MESMO beets do Soulbeet.

  Feito para listas grandes:
    - pula o que ja esta na biblioteca e o que ja foi feito em execucoes anteriores
      (pode fechar a janela no meio e rodar de novo: continua de onde parou)
    - buscas em paralelo, downloads em paralelo e importacao no beets em lotes,
      em segundo plano, sem travar os downloads
    - aguenta quedas do slskd/Docker (espera e tenta de novo)
    - mantem o PC acordado enquanto roda
    - diagnostico das faixas nao encontradas (por que cada arquivo foi recusado)
    - confere os titulos no catalogo do MusicBrainz antes de buscar (corrige grafia, avisa
      quando o titulo nao existe) e evita gastar buscas do Soulseek a toa
    - so pausa as buscas quando uma busca de teste confirma o bloqueio do servidor

  Uso:  baixar-lista.bat                       (usa lista.txt)
        baixar-lista.bat minhas.txt
        baixar-lista.bat playlist.csv -Paralelo 6 -Retentar
#>
param(
  [string]$Lista = "lista.txt",
  [int]$Paralelo = 5,                 # downloads simultaneos
  [int]$Buscas = 2,                   # buscas simultaneas (o slskd so executa 2 por vez; o resto fica na fila dele)
  [int]$BuscasPorJanela = 30,         # maximo de buscas a cada 220 s (o servidor do Soulseek bane por 30 min acima de ~34)
  [int]$Tentativas = 5,               # quantos usuarios/arquivos tentar por faixa
  [int]$FilaMaxMin = 4,               # minutos parado na fila remota antes de trocar de usuario
  [int]$FilaUltimoMin = 30,           # ...quando e o ULTIMO usuario que tem a faixa, espera mais antes de desistir (a espera na fila nao ocupa vaga de download)
  [int]$DownloadMaxMin = 20,          # tempo maximo por tentativa
  [int]$LoteBeets = 10,               # faixas por chamada do beets
  [switch]$AceitarMp3Menor,           # aceita MP3 256 kbps se nao houver FLAC/320
  [switch]$AceitarWav,                # aceita WAV/AIFF (sem perda) antes do MP3
  [switch]$Retentar,                  # tenta de novo o que falhou/nao foi encontrado antes
  [switch]$NaoPularExistentes,        # baixa mesmo se ja estiver na biblioteca
  [switch]$SemBeets,                  # so baixa (nao importa no beets)
  [switch]$SemBuscaArtista,           # nao faz a busca de reserva so pelo nome do artista
  [int]$RetryMin = 10,                # (nao usado: agora uma busca de teste decide na hora se 0 respostas foi bloqueio)
  [int]$PausaBloqueioMin = 15,        # pausa das buscas quando parece que o servidor bloqueou (muitas buscas seguidas com 0 respostas)
  [switch]$TituloAproximado,          # aceita (por ultimo) arquivos com palavras a mais no titulo: "Vengeance" -> "Vengeance Of The Masked"
  [switch]$NaoTolerarGrafia,          # desliga a tolerancia a erros de digitacao no titulo ("Abaddon" x "Abbadon")
  [switch]$SemCatalogo,               # nao confere os titulos no catalogo do MusicBrainz antes de buscar
  [switch]$PularForaDoCatalogo,       # nem busca no Soulseek as faixas cujo titulo nao existe no catalogo do artista
  [string]$SlskdUrl = "http://localhost:5030",
  [string]$BeetsLib = "/music/.beets_library.db",
  [string]$BeetsDir = "/music"
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Root = $PSScriptRoot
Set-Location $Root

# funcoes de texto, comparacao e catalogo (sem rede): baixar-lista.lib.ps1
. (Join-Path $PSScriptRoot "baixar-lista.lib.ps1")

# ============================================================================
# Configuracao (.env / slskd.yml)
# ============================================================================
$envVars = Read-DotEnv (Join-Path $Root ".env")

$ApiKey = $envVars["SLSKD_API_KEY_SOULBEET"]
if (-not $ApiKey) {
  $yml = Join-Path $Root "slskd\slskd.yml"
  if (Test-Path -LiteralPath $yml) {
    $m = Select-String -LiteralPath $yml -Pattern '^\s*key:\s*([0-9A-Za-z]+)' | Select-Object -First 1
    if ($m) { $ApiKey = $m.Matches[0].Groups[1].Value }
  }
}
if (-not $ApiKey) { throw "API key do slskd nao encontrada (.env SLSKD_API_KEY_SOULBEET ou slskd\slskd.yml)." }

$DownloadsDir = $envVars["DOWNLOADS_DIR"]
if (-not $DownloadsDir) { $DownloadsDir = "./downloads" }
if (-not [IO.Path]::IsPathRooted($DownloadsDir)) { $DownloadsDir = Join-Path $Root $DownloadsDir }
$DownloadsDir = [IO.Path]::GetFullPath($DownloadsDir)

if (-not [IO.Path]::IsPathRooted($Lista)) { $Lista = Join-Path $Root $Lista }
if (-not (Test-Path -LiteralPath $Lista)) { throw "Arquivo de lista nao encontrado: $Lista" }

$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $Root "lotes"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$BeetsLog  = Join-Path $logDir "beets-$stamp.log"
# registro completo da execucao (tela inteira), para diagnosticar erros depois
$RunLog = Join-Path $logDir "execucao-$stamp.log"
try { Start-Transcript -LiteralPath $RunLog -Force | Out-Null } catch {}
trap {
  Write-Host ""
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.InvocationInfo) { Write-Host ("  em baixar-lista.ps1, linha {0}: {1}" -f $_.InvocationInfo.ScriptLineNumber, $_.InvocationInfo.Line.Trim()) -ForegroundColor Red }
  Write-Host "  (registro completo em $RunLog)" -ForegroundColor DarkGray
  try { Stop-Transcript | Out-Null } catch {}
  exit 1
}
$DiagFile  = Join-Path $logDir "diagnostico-$stamp.txt"
$listName  = [IO.Path]::GetFileNameWithoutExtension($Lista) -replace '[^\w\-]+', '_'
$StateFile = Join-Path $logDir "estado-$listName.tsv"

# ============================================================================
# API do slskd
# ============================================================================
$Headers = @{ "X-API-Key" = $ApiKey }
function Invoke-Slskd([string]$method, [string]$path, $body = $null) {
  $p = @{ Method = $method; Uri = "$SlskdUrl/api/v0$path"; Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 30 }
  if ($null -ne $body) {
    $json = ConvertTo-Json -InputObject $body -Depth 6 -Compress
    $p.Body = [Text.Encoding]::UTF8.GetBytes($json)
    $p.ContentType = "application/json; charset=utf-8"
  }
  $r = Invoke-RestMethod @p     # PS 5.1 nao enumera arrays JSON: atribuir e reemitir corrige
  return $r
}



# ============================================================================
# Biblioteca do beets (para pular o que ja existe)
# ============================================================================
$py = "import sys; from beets.ui import main; main(sys.argv[1:])"
function Get-Library {
  $idx = @{}
  $ErrorActionPreference = "Continue"
  $out = & docker compose exec -T -w /data soulbeet /usr/bin/python3 -c $py -c /config/config.yaml -l $BeetsLib ls -f '$artist|||$title' 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $n = 0
  foreach ($l in @($out)) {
    $p = ([string]$l) -split '\|\|\|', 2
    if ($p.Count -lt 2) { continue }
    $e = [pscustomobject]@{ A = (Normalize $p[0]); T = (Normalize $p[1]) }
    $e | Add-Member NoteProperty AT ("$($e.A) $($e.T)")
    foreach ($tk in @($e.A -split ' ' | Select-Object -Unique)) {
      if (-not $tk) { continue }
      if (-not $idx.ContainsKey($tk)) { $idx[$tk] = New-Object System.Collections.ArrayList }
      [void]$idx[$tk].Add($e)
    }
    $n++
  }
  return @{ Index = $idx; Count = $n }
}

# ============================================================================
# Estado (retomar de onde parou)
# ============================================================================
function Save-State($it) {
  try { Add-Content -LiteralPath $StateFile -Encoding UTF8 -Value ("{0}`t{1}`t{2}" -f $it.Status, $it.Key, $it.Line) } catch {}
}
function Load-State {
  $h = @{}
  if (Test-Path -LiteralPath $StateFile) {
    foreach ($l in Get-Content -LiteralPath $StateFile -Encoding UTF8) {
      $p = $l -split "`t"
      if ($p.Count -ge 2) { $h[$p[1]] = $p[0] }
    }
  }
  return $h
}

# ============================================================================
# Catalogo (MusicBrainz): confere os titulos da lista ANTES de gastar buscas no Soulseek
#   - corrige grafia e titulo incompleto ("Tataku" -> "Tatakai", "Vengeance" -> "Vengeance Of The Masked")
#   - marca titulos que NAO existem no catalogo do artista (lista errada): vao para o fim da fila
#     (ou nem sao buscados, com -PularForaDoCatalogo)
#   A API do MusicBrainz nao precisa de conta nem chave, mas pede um User-Agent identificavel e
#   no maximo 1 requisicao por segundo. Contato opcional no User-Agent: MUSICBRAINZ_CONTATO=... no .env
#   Cache por artista em lotes\catalogo-mb (7 dias).
# ============================================================================
$CatDir    = Join-Path $logDir "catalogo-mb"
$CatReport = Join-Path $logDir "catalogo-$stamp.txt"
$MbMem = @{}
$MbTotal = @{}                        # artista -> total de gravacoes com esse nome no MusicBrainz
$script:MbOk = $true; $script:MbFails = 0; $script:MbLast = [datetime]::MinValue
$MbContato = $envVars["MUSICBRAINZ_CONTATO"]
$MbAgent = "soulcrate-baixar-lista/1.1 ( " + $(if ($MbContato) { $MbContato } else { "uso pessoal" }) + " )"


# Busca de gravacoes (recordings) no MusicBrainz. $null = nao deu para consultar.
function Invoke-MusicBrainz([string]$query, [int]$limit = 100, [int]$offset = 0) {
  if (-not $script:MbOk) { return $null }
  $uri = "https://musicbrainz.org/ws/2/recording?fmt=json&limit=$limit&offset=$offset&query=" + (Esc $query)
  for ($a = 1; $a -le 4; $a++) {
    $wait = 1100 - ((Get-Date) - $script:MbLast).TotalMilliseconds          # limite do MusicBrainz: 1 requisicao por segundo
    if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]$wait) }
    $script:MbLast = Get-Date
    try {
      $w = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 20 -UserAgent $MbAgent -Headers @{ Accept = "application/json" }
      $txt = $null
      try { $txt = [Text.Encoding]::UTF8.GetString($w.RawContentStream.ToArray()) } catch { $txt = [string]$w.Content }   # acentos certos no PS 5.1
      $r = ConvertFrom-Json -InputObject $txt
      $script:MbFails = 0
      if ($r.error) { return $null }
      return $r
    } catch {
      $code = 0
      try { $code = [int]$_.Exception.Response.StatusCode } catch {}
      if ($code -eq 400 -or $code -eq 404) { $script:MbFails = 0; return $null }          # consulta invalida, nao e queda do servico
      if ($code -eq 503 -or $code -eq 429) { Start-Sleep -Seconds (2 * $a); continue }      # acima do limite: espera e repete
      if ($a -ge 3) { break }
      Start-Sleep -Seconds 2
    }
  }
  $script:MbFails++
  if ($script:MbFails -ge 3) { $script:MbOk = $false }                  # MusicBrainz fora do ar: para de tentar
  return $null
}


# Faixas do artista no MusicBrainz (ate 300 gravacoes, sem repetir titulo). $null = nao deu para consultar.
function Get-MbTracks([string]$artist) {
  $key = Normalize $artist
  if (-not $key) { return $null }
  if ($MbMem.ContainsKey($key)) { $v = $MbMem[$key]; if ($null -eq $v) { return $null }; return ,$v }
  $file = Join-Path $CatDir (($key -replace '[^a-z0-9]+', '_').Trim('_') + ".tsv")
  $list = $null
  try {
    if ((Test-Path -LiteralPath $file) -and ((Get-Date) - (Get-Item -LiteralPath $file).LastWriteTime).TotalDays -lt 7) {
      $tot = 0
      $list = @(Get-Content -LiteralPath $file -Encoding UTF8 | ForEach-Object {
        $p = ([string]$_) -split "`t", 2
        if ($p[0] -eq '#total') { $tot = [int]$p[1] }
        elseif ($p.Count -eq 2) { [pscustomobject]@{ A = $p[0]; T = $p[1] } }
      })
      $MbTotal[$key] = [Math]::Max($tot, $list.Count)
    }
  } catch { $list = $null }
  if ($null -eq $list) {
    $acc = New-Object System.Collections.ArrayList; $seen = @{}; $falhou = $false; $tot = 0
    $names = @($artist); if ($artist -match '[^\x00-\x7F]') { $names += $key }        # "Byørn" e "byorn"
    foreach ($nm in $names) {
      for ($off = 0; $off -lt 300; $off += 100) {
        $r = Invoke-MusicBrainz ('artistname:"' + (Esc-Lucene $nm) + '"') 100 $off
        if ($null -eq $r) {
          $falhou = $true
          if ($off -eq 0 -and $acc.Count -eq 0 -and -not $script:MbOk) { $MbMem[$key] = $null; return $null }
          break
        }
        $tot = [Math]::Max($tot, [int]$r.count)
        foreach ($d in @(ConvertFrom-MbData $r)) {
          $k = (Normalize $d.A) + "`t" + (Normalize $d.T)
          if (-not $seen.ContainsKey($k)) { $seen[$k] = 1; [void]$acc.Add($d) }
        }
        if (@($r.recordings).Count -lt 100 -or ($off + 100) -ge [int]$r.count) { break }
      }
      if ($acc.Count -gt 0) { break }
    }
    $list = @($acc)
    # total de gravacoes no MusicBrainz para esse nome: acima das 300 lidas, o catalogo esta CORTADO
    # (nome comum: "Vegas", "Vermont", "Invasion" sao varios artistas) e "nao existe" nao e confiavel
    $MbTotal[$key] = [Math]::Max($tot, $list.Count)
    if (-not $falhou -or $list.Count -gt 0) {                           # nao grava cache de consulta que falhou
      try {
        New-Item -ItemType Directory -Force -Path $CatDir | Out-Null
        Set-Content -LiteralPath $file -Encoding UTF8 -Value (@("#total`t$($MbTotal[$key])") + @($list | ForEach-Object { "$($_.A)`t$($_.T)" }))
      } catch {}
    }
  }
  $MbMem[$key] = $list
  return ,$list
}

# Busca direta "artista + titulo" (pega faixas que nao estao entre as 300 do artista, e erros de grafia)
function Get-MbStrict($req) {
  $out = @()
  $a = Esc-Lucene $req.Artist
  $out += @(ConvertFrom-MbData (Invoke-MusicBrainz ('recording:"' + (Esc-Lucene $req.Base) + '" AND artistname:"' + $a + '"') 25))
  # tolerante: palavras do titulo com busca aproximada (~), pega "Tataku" -> "Tatakai"
  # (minusculas: AND/OR/NOT em maiusculas seriam operadores da busca)
  $fz = @(@($req.Base.ToLowerInvariant() -split '\s+') | Where-Object { $_ -match '[\p{L}\p{N}]' } | ForEach-Object { $e = Esc-Lucene $_; if ($_.Length -ge 4) { "$e~" } else { $e } }) -join ' '
  $aw = @(@($req.Artist.ToLowerInvariant() -split '\s+') | Where-Object { $_ -match '[\p{L}\p{N}]' } | ForEach-Object { Esc-Lucene $_ }) -join ' '
  if ($fz -and $aw) { $out += @(ConvertFrom-MbData (Invoke-MusicBrainz ('recording:(' + $fz + ') AND artist:(' + $aw + ')') 25)) }
  # SEM a virgula: o resultado vai para um Where-Object. Com ",$out" o pipeline recebia a lista
  # inteira como UM item e $_.T virava todos os titulos juntos ("Chimera Chimera Chimera Chimera",
  # "Forca do Rape ... We Lost It"), estragando a busca no Soulseek (execucoes de 06/10)
  return $out
}


# Troca o titulo usado na busca (a linha original continua no relatorio e no estado)
function Set-SearchTitle($it, [string]$newBase) {
  $i = $it.Line.IndexOf(" - ")
  $artistPart = $(if ($i -gt 0) { $it.Line.Substring(0, $i) } else { $it.Req.Artist })
  $nl = "$artistPart - $newBase"
  if ($it.Req.Mix) { $nl += " ($($it.Req.Mix))" }
  $orig = $it.Req
  $it.SearchLine = $nl
  $it.Req = Parse-Line $nl
  $it.OrigReq = $orig
  $it.Stages = New-Stages $it.Req
  # a correcao pode estar errada (o MusicBrainz nem sempre tem a versao certa): as buscas com o
  # titulo ORIGINAL ficam no fim, e as respostas sao conferidas com os dois titulos
  $have = @($it.Stages | ForEach-Object { $_.Q })
  foreach ($q in $orig.Queries) { if ($have -notcontains $q) { [void]$it.Stages.Add(@{ Kind = 'q'; Q = $q }) } }
}

function Invoke-CatalogCheck {
  $todo = @($items | Where-Object { $_.Status -eq "pendente" -and $_.Req.Artist -and $_.Req.BaseTokens.Count -gt 0 -and -not $_.Req.Remixer })
  if ($todo.Count -eq 0) { return }
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
  Write-Host "Conferindo os titulos no catalogo do MusicBrainz ($($todo.Count) faixas; 1 consulta/s, cache de 7 dias; -SemCatalogo desliga)..." -ForegroundColor DarkGray
  if ($null -eq (Invoke-MusicBrainz 'artistname:"daft punk"' 1)) {
    Write-Host "  (catalogo do MusicBrainz indisponivel agora; seguindo sem conferir)" -ForegroundColor DarkYellow
    return
  }
  $rep = New-Object System.Collections.ArrayList
  $cnt = @{ ok = 0; corr = 0; fora = 0; sem = 0 }
  $i = 0
  foreach ($it in $todo) {
    $i++
    if (-not $script:MbOk) { [void]$rep.Add("?`t$($it.Line)`t(MusicBrainz parou de responder)"); $cnt.sem++; continue }
    if ($i % 15 -eq 0) { Write-Host "  ... $i/$($todo.Count)" -ForegroundColor DarkGray }
    try {
      $req = $it.Req
      $tracks = Get-MbTracks $req.Artist
      if ($null -eq $tracks) { $cnt.sem++; [void]$rep.Add("?`t$($it.Line)`t(catalogo indisponivel)"); continue }
      $mine = @($tracks | Where-Object { Has-Artist $req (Normalize $_.A) })
      $res = Find-InCatalog $req $mine
      if ($res.Kind -ne 'exato') {
        $more = @(Get-MbStrict $req | Where-Object { Has-Artist $req (Normalize $_.A) })
        if ($more.Count) { $mine = @($mine + $more); $res = Find-InCatalog $req $mine }
      }
      if ($mine.Count -eq 0) { $cnt.sem++; [void]$rep.Add("SEM DADOS`t$($it.Line)`t(artista nao encontrado no MusicBrainz: busca normal)"); continue }
      $cut = ([int]$MbTotal[(Normalize $req.Artist)] -gt @($tracks).Count)
      switch ($res.Kind) {
        'exato' { $cnt.ok++; [void]$rep.Add("OK`t$($it.Line)") }
        { $_ -eq 'fora' -and $cut } {
          # nome comum (varios artistas com o mesmo nome) e catalogo cortado em 300: ausencia nao prova nada
          $cnt.sem++
          [void]$rep.Add("NAO CONFIRMADO`t$($it.Line)`t(catalogo de '$($req.Artist)' cortado: $($MbTotal[(Normalize $req.Artist)]) gravacoes com esse nome; busca normal)")
          break
        }
        'fora' {
          $cnt.fora++; $it.Fora = $true
          $sg = $(if ($res.Sugs.Count) { "parecidos: " + ($res.Sugs -join ' | ') } else { "nenhum titulo parecido" })
          $it.CatNote = "titulo nao existe no catalogo de '$($req.Artist)' no MusicBrainz ($($mine.Count) faixas); $sg"
          [void]$rep.Add("NAO EXISTE`t$($it.Line)`t$sg")
        }
        default {
          $cnt.corr++
          $old = $req.Base
          Set-SearchTitle $it $res.Base
          $it.Corrected = "titulo corrigido pelo catalogo: '$old' -> '$($res.Base)'"
          [void]$rep.Add("CORRIGIDO`t$($it.Line)`t-> $($it.SearchLine)")
          Write-Host "  ~  $($it.Line)  ->  $($it.SearchLine)" -ForegroundColor DarkCyan
        }
      }
    } catch {
      $cnt.sem++; [void]$rep.Add("?`t$($it.Line)`t(erro: $($_.Exception.Message))")
    }
  }
  try {
    $hdr = @("# Conferencia dos titulos no catalogo do MusicBrainz ($stamp)",
             "# OK = existe | CORRIGIDO = grafia/titulo completado (a busca usa o titulo corrigido)",
             "# NAO EXISTE = o artista esta no MusicBrainz, mas esse titulo nao: provavelmente errado na lista",
             "# NAO CONFIRMADO = nome de artista comum (catalogo cortado): nao da para afirmar que nao existe; busca normal",
             "# SEM DADOS = artista nao esta no MusicBrainz (comum em edits/bootlegs): busca normal", "")
    Set-Content -LiteralPath $CatReport -Encoding UTF8 -Value (@($hdr) + @($rep))
  } catch {}
  Write-Host ("Catalogo: {0} confirmadas | {1} corrigidas | {2} NAO EXISTEM no catalogo | {3} sem dados  ({4})" -f $cnt.ok, $cnt.corr, $cnt.fora, $cnt.sem, $CatReport) -ForegroundColor Cyan
  if ($cnt.fora -gt 0) {
    if ($PularForaDoCatalogo) { Write-Host "  as $($cnt.fora) que nao existem serao puladas (-PularForaDoCatalogo)" -ForegroundColor Yellow }
    else { Write-Host "  as $($cnt.fora) que nao existem ficam para o fim (use -PularForaDoCatalogo para nem buscar)" -ForegroundColor Yellow }
  }
}

# ============================================================================
# Buscas (nao bloqueantes)
#   Etapas por faixa: "Artista Titulo Mix" -> "Artista Titulo" -> (variacao sem acento)
#   -> busca SO pelo artista (compartilhada entre as faixas do mesmo artista)
#   -> "Titulo Mix" sem artista (so para remixes)
# ============================================================================
$ArtistCache = @{}
$BadUsers = @{}                       # usuario -> quantas vezes travou/recusou nesta execucao

$SearchTimes = New-Object System.Collections.ArrayList
$script:PauseUntil = [datetime]::MinValue
$script:zeroStreak = 0
$script:lastNonEmptyAt = [datetime]::MinValue   # ultima vez que ALGUMA busca voltou com respostas (= servidor respondendo)
$script:Canary = $null                           # busca de teste em andamento (confere se o servidor bloqueou)
$script:BestQuery = $null; $script:BestCount = 0  # busca com mais respostas ate agora (usada como teste)
$ZeroStreakMax = 6

# Limite de buscas: no maximo $BuscasPorJanela a cada 220 s, nenhuma durante a pausa anti-bloqueio
# e nenhuma enquanto a busca de teste nao responde
function Test-SearchBudget {
  $now = Get-Date
  if ($now -lt $script:PauseUntil) { return $false }
  if ($script:Canary) { return $false }
  while ($SearchTimes.Count -gt 0 -and ($now - $SearchTimes[0]).TotalSeconds -gt 220) { $SearchTimes.RemoveAt(0) }
  return ($SearchTimes.Count -lt $BuscasPorJanela)
}


# Uma busca "Artista Titulo" so pode trazer arquivos que a busca "Artista" tambem traria.
# Se a busca do artista veio COMPLETA (nao bateu no limite de respostas), repetir e desperdicio.
function Test-Redundant($it, $stg) {
  if ($stg.Kind -ne 'q' -or -not $it.Req.ArtistQuery) { return $false }
  $c = $ArtistCache[$it.Req.ArtistKey]
  if (-not ($c -and $c.State -eq 'pronto' -and $c.Complete)) { return $false }
  return ($stg.Q.IndexOf($it.Req.ArtistQuery, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function New-SearchBody([string]$id, [string]$q, [int]$timeoutMs, [int]$respLimit, [int]$fileLimit) {
  return @{ id = $id; searchText = $q; filterResponses = $true; minimumResponseFileCount = 1; fileLimit = $fileLimit
            searchTimeout = $timeoutMs; responseLimit = $respLimit }
}

function Start-Search($it) {
  $stg = $it.Stages[$it.Stage]
  $id = [guid]::NewGuid().ToString()
  $isArtist = ($stg.Kind -eq 'artist')
  $body = New-SearchBody $id $stg.Q $(if ($isArtist) { 25000 } else { 15000 }) $(if ($isArtist) { $ArtistRespLimit } else { 100 }) 10000
  [void](Invoke-Slskd POST "/searches" $body)
  [void]$SearchTimes.Add((Get-Date))
  $it.SearchId = $id; $it.SearchStart = Get-Date; $it.Status = "buscando"; $it.SearchIsArtist = $isArtist; $it.RespCache = $null
  $it.RunAt = $null; $it.StopAt = $null; $it.Refetched = $false
  if (-not $it.FirstSearchAt) { $it.FirstSearchAt = $it.SearchStart }
  if ($isArtist) { $ArtistCache[$it.Req.ArtistKey] = @{ State = 'buscando'; Resp = @(); Titles = @(); Complete = $false } }
  $script:lastSearch = Get-Date
}
$ArtistRespLimit = 300

# Escolhe a proxima faixa pendente que pode andar agora. Usa o cache do artista quando ja existe.
function Next-Pending {
  $now = Get-Date
  foreach ($it in $items) {
    if ($it.Status -ne "pendente") { continue }
    if ($it.NotBefore -and $it.NotBefore -gt $now) { continue }
    $stg = $it.Stages[$it.Stage]
    if ($stg.Kind -eq 'artist') {
      $c = $ArtistCache[$it.Req.ArtistKey]
      if ($c -and $c.State -eq 'pronto') { Process-Responses $it $c.Resp; continue }   # reaproveita, sem nova busca
      if ($c -and $c.State -eq 'buscando') { continue }                               # outra faixa ja esta buscando
    }
    elseif (Test-Redundant $it $stg) { Process-Responses $it @(); continue }          # coberta pela busca do artista
    return $it
  }
  return $null
}

function Test-NetError($err) {
  $e = $err.Exception
  while ($e) { if ($e.GetType().FullName -match 'WebException|HttpRequestException') { return $true }; $e = $e.InnerException }
  return $false
}
function Get-HttpStatus($err) {
  try { if ($err.Exception.Response) { return [int]$err.Exception.Response.StatusCode } } catch {}
  return 0
}

# Acompanha uma busca no slskd ate ela TERMINAR e devolve as respostas ($null = ainda nao terminou).
#   O slskd so grava as respostas quando a busca termina: enquanto esta "InProgress", /responses vem
#   VAZIO. Antes o script lia nesse momento (apos 30-45 s), achava "0 respostas" e APAGAVA a busca
#   ainda rodando ("Failed to execute search" no log do slskd). Buscas amplas (so o artista: Omiki,
#   Blazy, Astrix...) continuam recebendo respostas por minutos e caiam sempre nisso: 249 respostas
#   do Omiki viravam "ninguem tem". Agora, passado o tempo, a busca e PARADA (PUT), o que a conclui
#   e preserva tudo o que ja chegou; so entao as respostas sao lidas.
#   $st guarda o estado: RunAt (comecou a rodar), StopAt (pedido de parada), Refetched.
function Read-SearchWhenDone([string]$id, [datetime]$posted, [int]$runSecs, $st) {
  $now = Get-Date
  $s = Invoke-Slskd GET "/searches/$id"
  $state = [string]$s.state
  $done = ($s.isComplete -or $state -match 'Completed')
  if (-not $done) {
    if ($state -notmatch 'InProgress') {
      # ainda na fila do slskd (ele roda poucas buscas por vez): nao conta o tempo, ate 3 min
      if (($now - $posted).TotalSeconds -lt 180) { return $null }
    } elseif (-not $st.RunAt) { $st.RunAt = $now }
    $ran = $(if ($st.RunAt) { ($now - $st.RunAt).TotalSeconds } else { ($now - $posted).TotalSeconds })
    if (-not $st.StopAt) {
      if ($ran -lt $runSecs) { return $null }
      try { [void](Invoke-Slskd PUT "/searches/$id") } catch {}      # para: as respostas recebidas sao mantidas
      $st.StopAt = $now
      return $null
    }
    if (($now - $st.StopAt).TotalSeconds -lt 20) { return $null }     # nao concluiu ao parar: le o que houver
  }
  $resp = Invoke-Slskd GET "/searches/$id/responses"
  $resp = @($resp)
  # a busca diz que teve respostas, mas a lista veio vazia: ainda gravando no banco; le de novo
  if ($resp.Count -eq 0 -and [int]$s.responseCount -gt 0 -and -not $st.Refetched) { $st.Refetched = $true; return $null }
  return ,$resp
}

function Poll-Search($it) {
  $age = ((Get-Date) - $it.SearchStart).TotalSeconds
  $limit = $(if ($it.SearchIsArtist) { 30 } else { 20 })     # segundos rodando antes de parar a busca
  if ($null -eq $it.RespCache) {
    try {
      $resp = Read-SearchWhenDone $it.SearchId $it.SearchStart $limit $it
      if ($null -eq $resp) { return }
      $it.RespCache = @($resp)        # guardado ANTES de apagar a busca: se algo falhar depois, nao refaz nem perde
    } catch {
      if ((Get-HttpStatus $_) -eq 404) {
        # a busca sumiu do slskd (reiniciou?): refaz a mesma etapa uma vez, sem contar como "0 respostas"
        if ($it.SearchIsArtist) { $ArtistCache.Remove($it.Req.ArtistKey) }
        if (-not $it.LostOnce) { $it.LostOnce = $true; $it.Status = "pendente"; return }
        $it.RespCache = @()
      }
      elseif ($age -lt 240) { throw }                       # erro de rede: o laco principal tenta de novo
      else { $it.RespCache = @() }
    }
    try { [void](Invoke-Slskd DELETE "/searches/$($it.SearchId)") } catch {}
  }
  $resp = @($it.RespCache); $it.RespCache = $null
  if ($it.SearchIsArtist) {
    $nFiles = 0; $maxFiles = 0
    foreach ($r in $resp) { $n = @($r.files).Count; $nFiles += $n; if ($n -gt $maxFiles) { $maxFiles = $n } }
    # completa = nao bateu no limite de respostas/arquivos -> as buscas "Artista Titulo" seriam repetidas.
    # NAO e completa: 0 respostas (busca que falhou nao prova nada; antes isso pulava as buscas por titulo
    # de todas as faixas do artista) e usuario com 100+ arquivos (os clientes cortam a lista que devolvem,
    # entao a faixa pedida pode ter ficado de fora)
    $complete = ($resp.Count -gt 0 -and $resp.Count -lt [int]($ArtistRespLimit * 0.9) -and $nFiles -lt 9000 -and $maxFiles -lt 100)
    $ArtistCache[$it.Req.ArtistKey] = @{ State = 'pronto'; Resp = $resp; Titles = $null; Complete = $complete }
  }
  if ($resp.Count -gt 0) {
    $script:zeroStreak = 0; $script:lastNonEmptyAt = Get-Date
    if ($resp.Count -gt $script:BestCount) { $script:BestCount = $resp.Count; $script:BestQuery = $it.Stages[$it.Stage].Q }
  } else {
    $script:zeroStreak++
    # Varias buscas seguidas sem NENHUMA resposta: ou o servidor bloqueou, ou sao faixas que ninguem
    # compartilha (titulo errado na lista). Uma busca de teste com algo que SEMPRE tem resposta decide.
    if ($script:zeroStreak -ge $ZeroStreakMax -and -not $script:Canary -and (Get-Date) -ge $script:PauseUntil) { Start-Canary }
  }
  Process-Responses $it $resp
}

function Start-Canary {
  $q = $(if ($script:BestQuery -and $script:BestCount -ge 20) { $script:BestQuery } else { "daft punk" })   # algo que sempre tem resposta
  $id = [guid]::NewGuid().ToString()
  try {
    [void](Invoke-Slskd POST "/searches" (New-SearchBody $id $q 10000 20 500))
    [void]$SearchTimes.Add((Get-Date))
    $script:Canary = @{ Id = $id; Start = Get-Date; Q = $q; RunAt = $null; StopAt = $null; Refetched = $false }
    Write-Host "  ?  buscas sem resposta: conferindo se o servidor do Soulseek bloqueou (busca de teste: '$q')..." -ForegroundColor DarkYellow
  } catch { $script:zeroStreak = 0 }
}
function Poll-Canary {
  $cn = $script:Canary
  if (-not $cn) { return }
  $age = ((Get-Date) - $cn.Start).TotalSeconds
  $n = -1
  try {
    # mesma regra das buscas normais: le so depois de terminar (antes, apagar o teste ainda rodando
    # dava "0 respostas" e uma pausa de 15 min por um bloqueio que nao existia)
    $resp = Read-SearchWhenDone $cn.Id $cn.Start 12 $cn
    if ($null -eq $resp) { return }
    $n = @($resp).Count
  } catch {
    if ((Test-NetError $_) -and (Get-HttpStatus $_) -ne 404 -and $age -lt 240) { throw }
    $n = 0
  }
  try { [void](Invoke-Slskd DELETE "/searches/$($cn.Id)") } catch {}
  $script:Canary = $null; $script:zeroStreak = 0
  $waiting = @($items | Where-Object { $_.Status -eq "verificar" })
  if ($n -gt 0) {
    $script:lastNonEmptyAt = Get-Date
    Write-Host "     servidor respondendo normalmente ($n respostas no teste): as buscas vazias eram faixas que ninguem compartilha. Sem pausa." -ForegroundColor DarkGray
    foreach ($o in $waiting) { Finish-NotFound $o }
    return
  }
  # bloqueio confirmado: pausa e devolve para a fila o que so teve buscas vazias
  $script:PauseUntil = (Get-Date).AddMinutes($PausaBloqueioMin)
  Write-Host "  !! busca de teste tambem sem resposta: o servidor do Soulseek limitou as buscas. Pausando buscas por $PausaBloqueioMin min (downloads continuam)." -ForegroundColor Yellow
  foreach ($o in $waiting) { $o.Retried = $true; $o.PauseReset = $true; $o.Stage = 0; $o.Status = "pendente"; $o.NotBefore = $script:PauseUntil; $o.FirstSearchAt = $null }
  foreach ($o in $items) {
    if ($o.Status -eq "pendente" -and $o.Responses -eq 0 -and -not $o.PauseReset) { $o.PauseReset = $true; $o.Stage = 0; $o.NotBefore = $script:PauseUntil }
    if ($o.Req.ArtistKey -and $ArtistCache.ContainsKey($o.Req.ArtistKey) -and $ArtistCache[$o.Req.ArtistKey].State -eq 'pronto' -and @($ArtistCache[$o.Req.ArtistKey].Resp).Count -eq 0) { $ArtistCache.Remove($o.Req.ArtistKey) }
  }
}

function Process-Responses($it, $resp) {
  $resp = @($resp)
  $it.Responses += $resp.Count
  $cands = Get-Candidates $it $resp
  $usedOrig = $false
  if ($cands.Count -eq 0 -and $it.OrigReq -and $resp.Count -gt 0) {
    $cands = Get-Candidates $it $resp $it.OrigReq -NoDiag             # titulo corrigido nao achou: tenta o da lista
    $usedOrig = ($cands.Count -gt 0)
  }
  if ($cands.Count -gt 0) {
    $it.Cands = $cands; $it.Idx = 0; $it.Status = "pronta"
    $via = @()
    if ($usedOrig) { $via += "titulo original da lista (a correcao do catalogo nao achou)" }
    elseif ($it.Corrected) { $via += $it.Corrected }
    if ($it.Stages[$it.Stage].Kind -eq 'artist') { $via += "busca pelo artista" }
    if ($cands[0].Approx) { $via += "titulo aproximado: '$($cands[0].Approx)'" }
    $it.Via = ($via -join '; ')
    return
  }
  # proxima etapa (pulando as buscas ja cobertas por uma busca completa do artista)
  $next = $it.Stage + 1
  while ($next -lt $it.Stages.Count -and (Test-Redundant $it $it.Stages[$next])) { $it.Skipped++; $next++ }
  if ($next -lt $it.Stages.Count) { $it.Stage = $next; $it.Status = "pendente"; return }

  # nenhuma etapa deu certo
  # 0 respostas em TUDO: se outra busca teve respostas depois que esta faixa comecou, o servidor esta ok
  # e ninguem compartilha a faixa. Senao, fica em espera ate a busca de teste dizer se houve bloqueio.
  if ($it.Responses -eq 0 -and -not $it.Retried -and $it.FirstSearchAt -and $script:lastNonEmptyAt -lt $it.FirstSearchAt) {
    $it.Status = "verificar"
    if (-not $script:Canary) { Start-Canary }
    return
  }
  Finish-NotFound $it
}

function Finish-NotFound($it) {
  $fmtOnly = @($it.Diag | Where-Object { $_.Score -ge 4 }).Count
  $why = $(if ($it.Responses -eq 0) { "ninguem tem (0 respostas)" }
           elseif ($fmtOnly -gt 0) { "existe, mas so em formato/qualidade recusados ($fmtOnly arquivo(s)) - veja o diagnostico" }
           else { "$($it.Responses) respostas, nenhuma compativel" })
  if ($it.CatNote) { $why += " | $($it.CatNote)" }
  Finish $it "nao encontrada" $why
  Write-Diag $it
}

function Write-Diag($it) {
  try {
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add("")
    [void]$lines.Add("### $($it.Line)")
    [void]$lines.Add("    buscas: " + (($it.Stages | ForEach-Object { if ($_.Kind -eq 'artist') { "[artista] $($_.Q)" } else { $_.Q } }) -join ' | '))
    if ($it.Skipped) { [void]$lines.Add("    ($($it.Skipped) busca(s) pulada(s): a busca so pelo artista ja veio completa)") }
    if ($it.Corrected) { [void]$lines.Add("    $($it.Corrected)") }
    if ($it.CatNote) { [void]$lines.Add("    catalogo: $($it.CatNote)") }
    if ($it.Req.Remixer) { [void]$lines.Add("    (o artista da linha e o remixer: o artista original foi aceito livremente)") }
    if ($it.Reasons.Count) {
      [void]$lines.Add("    motivos: " + (($it.Reasons.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "$($_.Key) x$($_.Value)" }) -join '; '))
    }
    $top = @($it.Diag | Sort-Object Score -Descending | Select-Object -First 10)
    if ($top.Count) { [void]$lines.Add("    arquivos mais parecidos:"); foreach ($d in $top) { [void]$lines.Add("      $($d.Text)") } }
    else { [void]$lines.Add("    nenhum arquivo com o titulo ou o artista apareceu") }
    $c = $ArtistCache[$it.Req.ArtistKey]
    if ($c -and $c.State -eq 'pronto') {
      if ($null -eq $c.Titles) { $c.Titles = @(Get-ArtistTitles $it.Req $c.Resp) }
      if ($c.Titles.Count) {
        $sug = @(Get-TitleSuggestions $it.Req $c.Titles)
        if ($sug.Count) { [void]$lines.Add("    talvez seja: " + ($sug -join ' | ')) }
        $show = @($c.Titles | Select-Object -First 40 | ForEach-Object { if ($_.Users -gt 1) { "$($_.Title) ($($_.Users))" } else { $_.Title } })
        [void]$lines.Add("    catalogo de '$($it.Req.Artist)' no Soulseek ($($c.Titles.Count) titulos, os mais compartilhados primeiro): " + ($show -join ' | ') + $(if ($c.Titles.Count -gt 40) { ' | ...' } else { '' }))
      } else {
        [void]$lines.Add("    a busca so por '$($it.Req.Artist)' nao achou nenhuma faixa desse artista")
      }
    }
    Add-Content -LiteralPath $DiagFile -Encoding UTF8 -Value $lines
  } catch {}
}

# ============================================================================
# Downloads
# ============================================================================
function Start-Download($it) {
  while ($it.Idx -lt $it.Cands.Count -and $it.Idx -lt $Tentativas) {
    $c = $it.Cands[$it.Idx]
    try {
      [void](Invoke-Slskd POST "/transfers/downloads/$(Esc $c.User)" @(@{ filename = $c.File; size = $c.Size }))
      $it.Cur = $c; $it.Started = Get-Date; $it.Status = "baixando"; $it.RemoteQueued = $false; $it.ActiveAt = $null
      $fmt = @('FLAC','WAV/AIFF','MP3 320','MP3 256/VBR')[$c.Tier]
      Write-Host ("  -> {0}  [{1} de {2}, tentativa {3}]" -f $it.Line, $fmt, $c.User, ($it.Idx + 1)) -ForegroundColor DarkCyan
      return
    } catch {
      Write-Host "     x nao enfileirou em $($c.User): $($_.Exception.Message)" -ForegroundColor DarkYellow
      $it.Idx++
    }
  }
  Finish $it "falhou" $(if ($it.Note) { $it.Note } else { "nenhum usuario aceitou" })
}
function Next-Candidate($it, [string]$why) {
  Write-Host "     x $($it.Line): $why" -ForegroundColor DarkYellow
  if ($it.Cur) { $BadUsers[$it.Cur.User] = 1 + [int]$BadUsers[$it.Cur.User] }     # evita o mesmo usuario lento nas proximas faixas
  $it.Note = $why; $it.Idx++; Start-Download $it
}
function Get-AllTransfers {
  $map = @{}
  $all = Invoke-Slskd GET "/transfers/downloads"
  foreach ($u in @($all)) {
    foreach ($d in @($u.directories)) { foreach ($f in @($d.files)) {
      $k = "$($u.username)|$($f.filename)"
      if (-not $map.ContainsKey($k) -or [string]$f.requestedAt -gt [string]$map[$k].requestedAt) { $map[$k] = $f }
    } }
  }
  return $map
}
function Cancel-Transfer($c, $t) {
  if ($t -and $t.id) { try { [void](Invoke-Slskd DELETE "/transfers/downloads/$(Esc $c.User)/$($t.id)?remove=true") } catch {} }
}
function Find-LocalFile($c, [datetime]$since) {
  $parts = $c.File -split '[\\/]'
  try {
    $direct = Join-Path (Join-Path $DownloadsDir $parts[-2]) $parts[-1]      # slskd salva em downloads\<pasta remota>\<arquivo>
    if (Test-Path -LiteralPath $direct) { return (Get-Item -LiteralPath $direct) }
  } catch {}                                                                 # nome com caracteres invalidos no Windows
  # o slskd troca caracteres invalidos no Windows por "_": compara com as duas formas
  $stem = Get-Stem $parts[-1]; $ext = "." + (Get-Ext $parts[-1])
  $stemSan = $stem -replace '[<>:"|?*]', '_'
  return (Get-ChildItem -LiteralPath $DownloadsDir -Recurse -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Extension -eq $ext -and ($_.BaseName.StartsWith($stem) -or $_.BaseName.StartsWith($stemSan)) -and $_.LastWriteTime -ge $since.AddMinutes(-1) } |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

# ============================================================================
# beets em segundo plano (lotes)
# ============================================================================
$BeetsJobScript = {
  param($root, $py, $lib, $dir, $paths)
  Set-Location $root
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}     # nomes com acento no log
  $ErrorActionPreference = "Continue"
  $out = & docker compose exec -T -w /data soulbeet /usr/bin/python3 -c $py -c /config/config.yaml -l $lib -d $dir import -q -s @paths 2>&1
  [pscustomobject]@{ Code = $LASTEXITCODE; Out = @($out | ForEach-Object { "$_" } | Where-Object { $_ -notmatch 'RemoteException' }) }
}
function Start-BeetsBatch {
  $batch = @($items | Where-Object { $_.Status -eq "importar" } | Select-Object -First $LoteBeets)
  if ($batch.Count -eq 0) { return }
  $paths = @($batch | ForEach-Object { "/downloads/" + ($_.Local.Substring($DownloadsDir.Length).TrimStart('\','/') -replace '\\','/') })
  foreach ($b in $batch) { $b.Status = "importando" }
  $script:beetsJob = Start-Job -ScriptBlock $BeetsJobScript -ArgumentList $Root, $py, $BeetsLib, $BeetsDir, $paths
  $script:beetsBatch = $batch
  $script:lastBeets = Get-Date
  Write-Host "  [beets] importando lote de $($batch.Count) faixa(s) em segundo plano..." -ForegroundColor DarkGray
}
function Check-BeetsBatch([switch]$Wait) {
  if (-not $script:beetsJob) { return }
  if ($Wait) { [void](Wait-Job $script:beetsJob) }
  if ($script:beetsJob.State -eq 'Running') { return }
  $r = Receive-Job $script:beetsJob -ErrorAction SilentlyContinue | Select-Object -Last 1
  Remove-Job $script:beetsJob -Force
  $ok = ($r -and $r.Code -eq 0)
  try { Add-Content -LiteralPath $BeetsLog -Encoding UTF8 -Value (@("==== lote $(Get-Date -Format HH:mm:ss) (codigo $($r.Code))") + @($r.Out)) } catch {}
  $errs = @($r.Out | Where-Object { $_ -match '^\*\* |^Error|error in' } | Select-Object -Unique)
  foreach ($e in ($errs | Select-Object -First 3)) { Write-Host "  [beets] $e" -ForegroundColor DarkYellow }
  foreach ($b in $script:beetsBatch) { Finish $b $(if ($ok) { "importada" } else { "baixada (beets falhou)" }) "" }
  Write-Host ("  [beets] lote concluido: {0} faixa(s) {1}" -f $script:beetsBatch.Count, $(if ($ok) { "importadas" } else { "COM ERRO (veja $BeetsLog)" })) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
  $script:beetsJob = $null; $script:beetsBatch = @()
}

# ============================================================================
# Finalizacao de item / status
# ============================================================================
$FinalStatus = @("importada", "baixada", "baixada (beets falhou)", "nao encontrada", "falhou", "ja na biblioteca", "ja feita")
function Finish($it, [string]$status, [string]$note) {
  $it.Status = $status
  if ($status -in @("importada", "baixada")) { $it.Note = "" }           # limpa erros de tentativas anteriores
  if ($note) { $it.Note = $note }
  if ($status -notin @("ja feita")) { Save-State $it }
  switch ($status) {
    "nao encontrada" { Write-Host "  x  NAO ENCONTRADA: $($it.Line)  ($($it.Note))" -ForegroundColor Red }
    "falhou"         { Write-Host "  x  FALHOU: $($it.Line)  ($($it.Note))" -ForegroundColor Red }
  }
}
function Show-Progress {
  $g = @{}; foreach ($i in $items) { $g[$i.Status] = 1 + [int]$g[$i.Status] }
  $done = @($items | Where-Object { $FinalStatus -contains $_.Status }).Count
  $el = (Get-Date) - $t0
  $workDone = $done - $skipped
  $eta = ""
  if ($workDone -ge 3) {
    $rest = $items.Count - $done
    $eta = " | faltam ~" + [int](($el.TotalMinutes / $workDone) * $rest) + " min"
  }
  $nFila = @($items | Where-Object { $_.Status -eq "baixando" -and $_.RemoteQueued }).Count
  Write-Host ("[{0:HH:mm}] {1}/{2} concluidas | buscando {3} | baixando {4} | aguardando {5} | beets {6} | ok {7} | nao achadas {8} | falhas {9}{10}" -f (Get-Date),
    $done, $items.Count, ([int]$g["buscando"] + [int]$g["verificar"]), ("{0}{1}" -f [int]$g["baixando"], $(if ($nFila) { " ($nFila na fila de outros usuarios)" } else { "" })), ([int]$g["pendente"] + [int]$g["pronta"]),
    ([int]$g["importar"] + [int]$g["importando"]), ([int]$g["importada"] + [int]$g["baixada"]),
    [int]$g["nao encontrada"], ([int]$g["falhou"] + [int]$g["baixada (beets falhou)"]), $eta) -ForegroundColor Cyan
  if ((Get-Date) -lt $script:PauseUntil) { Write-Host ("         buscas pausadas ate {0:HH:mm} (protecao contra bloqueio do servidor)" -f $script:PauseUntil) -ForegroundColor Yellow }
  elseif ($SearchTimes.Count -ge $BuscasPorJanela) { Write-Host "         limite de $BuscasPorJanela buscas por 220 s atingido; aguardando" -ForegroundColor DarkGray }
}

# ============================================================================
# Main
# ============================================================================
$raw = Read-Lista $Lista
$ArtistLineCount = @{}
foreach ($l in $raw) { $k0 = (Parse-Line $l).ArtistKey; if ($k0) { $ArtistLineCount[$k0] = 1 + [int]$ArtistLineCount[$k0] } }
$seenKeys = @{}; $items = New-Object System.Collections.ArrayList
foreach ($l in $raw) {
  $k = Normalize $l
  if (-not $k -or $seenKeys.ContainsKey($k)) { continue }
  $seenKeys[$k] = 1
  [void]$items.Add([pscustomobject]@{
    Line = $l; Key = $k; Req = (Parse-Line $l); Status = "pendente"; Stage = 0; SearchId = $null; SearchStart = $null
    Responses = 0; Diag = (New-Object System.Collections.ArrayList); Reasons = @{}; Cands = @(); Idx = 0; Cur = $null; Started = $null
    Note = ""; Local = ""; Stages = $null; Retried = $false; NotBefore = $null; Via = ""; SearchIsArtist = $false; PauseReset = $false
    FirstSearchAt = $null; RespCache = $null; LostOnce = $false; Skipped = 0; Corrected = ""; CatNote = ""; Fora = $false; SearchLine = ""
    OrigReq = $null; RunAt = $null; StopAt = $null; Refetched = $false; RemoteQueued = $false; ActiveAt = $null
  })
  $items[$items.Count - 1].Stages = New-Stages $items[$items.Count - 1].Req
}
if ($items.Count -eq 0) { throw "A lista esta vazia: $Lista" }
Write-Host "Lista: $Lista  ($($items.Count) faixas unicas)" -ForegroundColor Cyan

# o slskd pode levar alguns segundos para subir (ex.: logo depois do subir.bat): espera ate 2 min
$okSlskd = $false; $lastErr = ""
for ($t = 1; $t -le 12; $t++) {
  try { [void](Invoke-Slskd GET "/application"); $okSlskd = $true; break }
  catch {
    $lastErr = $_.Exception.Message
    if ($lastErr -match '401|403|Unauthorized|Forbidden') { break }          # chave errada: nao adianta esperar
    if ($t -eq 1) { Write-Host "Aguardando o slskd responder em $SlskdUrl ..." -ForegroundColor DarkGray }
    Start-Sleep -Seconds 10
  }
}
if (-not $okSlskd) { throw "Nao consegui falar com o slskd em $SlskdUrl (a stack esta no ar? API key correta?). Detalhe: $lastErr" }

# Compartilhamento: o slskd le a lista de arquivos compartilhados de um cache e so reescaneia quando
# pedido. Se o cache foi criado com music\ vazia, ele segue anunciando "0 arquivos" mesmo com a
# biblioteca cheia, e muitos usuarios recusam ("Rejected") ou deixam na fila quem nao compartilha nada.
try {
  $app = Invoke-Slskd GET "/application"
  if ($app.shares -and -not $app.shares.scanning -and [int]$app.shares.files -eq 0) {
    [void](Invoke-Slskd PUT "/shares")
    Write-Host "O slskd estava compartilhando 0 arquivos: pedi uma nova varredura da biblioteca (music\)." -ForegroundColor Yellow
    Write-Host "  (quem nao compartilha nada costuma ser recusado ou ficar no fim da fila dos outros usuarios)" -ForegroundColor DarkGray
  }
} catch {}

# 1) o que ja foi feito antes / ja existe na biblioteca
$state = Load-State
$skipStatus = @("importada", "baixada", "baixada (beets falhou)", "ja na biblioteca")
if (-not $Retentar) { $skipStatus += @("nao encontrada", "falhou") }
$lib = $null
if (-not $NaoPularExistentes -and -not $SemBeets) {
  Write-Host "Lendo a biblioteca do beets..." -ForegroundColor DarkGray
  $lib = Get-Library
  if ($lib) { Write-Host "  $($lib.Count) faixas na biblioteca" -ForegroundColor DarkGray } else { Write-Host "  (nao consegui ler a biblioteca; nada sera pulado por ela)" -ForegroundColor DarkYellow }
}
$nPrev = 0; $nLib = 0
foreach ($it in $items) {
  if ($state.ContainsKey($it.Key) -and $skipStatus -contains $state[$it.Key]) { $it.Status = "ja feita"; $it.Note = "execucao anterior: $($state[$it.Key])"; $nPrev++; continue }
  if ($lib -and (In-Library $lib $it.Req)) { $it.Status = "ja na biblioteca"; $nLib++; Save-State $it }
}
Write-Host ("Pulando: {0} ja feitas em execucoes anteriores, {1} ja na biblioteca. A processar: {2}" -f $nPrev, $nLib, ($items.Count - $nPrev - $nLib)) -ForegroundColor Cyan
if ($nPrev -gt 0 -and -not $Retentar) { Write-Host "  (use -Retentar para tentar de novo as que falharam antes)" -ForegroundColor DarkGray }

# 2) confere os titulos no catalogo (corrige grafia; o que nao existe vai para o fim da fila)
if (-not $SemCatalogo) {
  Invoke-CatalogCheck
  foreach ($it in $items) {
    if ($it.Status -eq "pendente" -and $it.SearchLine -and $lib -and (In-Library $lib $it.Req)) { $it.Status = "ja na biblioteca"; $nLib++; Save-State $it }
  }
  $ord = New-Object System.Collections.ArrayList
  foreach ($x in $items) { if (-not $x.Fora) { [void]$ord.Add($x) } }
  foreach ($x in $items) {
    if (-not $x.Fora) { continue }
    if ($PularForaDoCatalogo -and $x.Status -eq "pendente") { Finish $x "nao encontrada" "nao buscada: $($x.CatNote)" }
    [void]$ord.Add($x)
  }
  $items = $ord
}
$skipped = @($items | Where-Object { $FinalStatus -contains $_.Status }).Count
Write-Host "Downloads: $Paralelo em paralelo | buscas: $Buscas (max $BuscasPorJanela a cada 220 s) | beets em lotes de $LoteBeets | Ctrl+C para parar (rode de novo para continuar)" -ForegroundColor DarkGray

# mantem o PC acordado (Windows)
try {
  Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
  [void][Win32.Power]::SetThreadExecutionState([uint32]"0x80000001")
} catch {}

$t0 = Get-Date
$script:lastSearch = [datetime]::MinValue
$script:lastBeets = Get-Date
$script:beetsJob = $null; $script:beetsBatch = @()
$lastProgress = Get-Date
$errStreak = 0

try {
  while ($true) {
    $open = @($items | Where-Object { $FinalStatus -notcontains $_.Status })
    if ($open.Count -eq 0 -and -not $script:beetsJob) { break }

    try {
      # --- buscas em andamento (um erro de analise numa faixa nao trava as outras)
      Poll-Canary
      if (-not $script:Canary -and @($items | Where-Object { $_.Status -eq "verificar" }).Count -gt 0) { Start-Canary }
      foreach ($it in @($items | Where-Object { $_.Status -eq "buscando" })) {
        try { Poll-Search $it }
        catch {
          if (Test-NetError $_) { throw }
          Write-Host "  !  erro analisando a busca de '$($it.Line)': $($_.Exception.Message)" -ForegroundColor DarkYellow
          if ($it.Status -eq "buscando") { Finish $it "falhou" "erro interno ao analisar a busca: $($_.Exception.Message)" }
        }
      }

      # --- novas buscas (sem buscar longe demais a frente dos downloads)
      $nBusca = @($items | Where-Object { $_.Status -eq "buscando" }).Count
      $nPronta = @($items | Where-Object { $_.Status -eq "pronta" }).Count
      if ($nBusca -lt $Buscas -and $nPronta -lt $Paralelo -and ((Get-Date) - $script:lastSearch).TotalSeconds -ge 2 -and (Test-SearchBudget)) {
        $next = Next-Pending                     # (ja resolve na hora as faixas que podem usar o cache do artista)
        if ($next) {
          if ($next.Stage -eq 0) { Write-Host ("  ?  buscando: $($next.Line)" + $(if ($next.SearchLine) { "  (como: $($next.SearchLine))" } else { "" })) -ForegroundColor Gray }
          elseif ($next.Stages[$next.Stage].Kind -eq 'artist') { Write-Host "  ?  buscando so pelo artista: $($next.Req.Artist)" -ForegroundColor Gray }
          Start-Search $next
        }
      }

      # --- inicia downloads
      # Faixa parada na fila do outro usuario ("Queued, Remotely") nao baixa nada: nao ocupa vaga.
      # Antes, 5 faixas esperando na fila do mesmo usuario travavam todos os downloads por 4+ min.
      $baix = @($items | Where-Object { $_.Status -eq "baixando" })
      $nBaix = @($baix | Where-Object { -not $_.RemoteQueued }).Count
      $nTot = $baix.Count
      foreach ($it in @($items | Where-Object { $_.Status -eq "pronta" })) {
        if ($nBaix -ge $Paralelo -or $nTot -ge 3 * $Paralelo) { break }
        Start-Download $it
        if ($it.Status -eq "baixando") { $nBaix++; $nTot++ }
      }

      # --- acompanha downloads (uma unica chamada para todos)
      $act = @($items | Where-Object { $_.Status -eq "baixando" })
      if ($act.Count -gt 0) {
        $tmap = Get-AllTransfers
        foreach ($it in $act) {
          $c = $it.Cur
          $t = $tmap["$($c.User)|$($c.File)"]
          $st = $(if ($t) { [string]$t.state } else { "" })
          $it.RemoteQueued = ($st -match 'Queued' -and $st -match 'Remotely')
          if (-not $it.ActiveAt -and $st -match 'Initializing|InProgress') { $it.ActiveAt = Get-Date }
          $mins = ((Get-Date) - $it.Started).TotalMinutes
          if ($st -match 'Succeeded') {
            $f = Find-LocalFile $c $it.Started
            if (-not $f) { Finish $it "baixada" "baixou, mas o arquivo nao foi localizado em $DownloadsDir"; continue }
            $it.Local = $f.FullName
            Write-Host "  OK BAIXADA: $($it.Line)" -ForegroundColor Green
            if ($SemBeets) { Finish $it "baixada" "" } else { $it.Status = "importar" }
          }
          elseif ($st -match 'Errored|Rejected|TimedOut|Cancelled|Aborted|Failed') { Cancel-Transfer $c $t; Next-Candidate $it "$($c.User): $st" }
          elseif (-not $t -and $mins -gt 1) { Next-Candidate $it "transferencia sumiu da fila ($($c.User))" }
          elseif ($st -match 'Queued' -and $mins -gt $(if ($it.Idx + 1 -ge [Math]::Min($it.Cands.Count, $Tentativas)) { $FilaUltimoMin } else { $FilaMaxMin })) {
            # so troca de usuario rapido quando ha outro para tentar; com o ultimo, espera mais
            Cancel-Transfer $c $t; Next-Candidate $it "fila longa em $($c.User) (>$([int]$mins) min)"
          }
          elseif (($it.ActiveAt -and ((Get-Date) - $it.ActiveAt).TotalMinutes -gt $DownloadMaxMin) -or
                  (-not $it.ActiveAt -and $st -notmatch 'Queued' -and $mins -gt $DownloadMaxMin)) {
            # o tempo maximo conta a partir do inicio da transferencia, nao da espera na fila
            Cancel-Transfer $c $t; Next-Candidate $it "tempo esgotado em $($c.User) (>$DownloadMaxMin min)"
          }
        }
      }
      $errStreak = 0
    } catch {
      $errStreak++
      Write-Host "  !  erro falando com o slskd ($errStreak): $($_.Exception.Message) -- tentando de novo em 15s" -ForegroundColor Yellow
      if ($errStreak -ge 20) { Write-Host "  !  slskd fora do ar ha muito tempo; parando. Rode de novo para continuar." -ForegroundColor Red; break }
      Start-Sleep -Seconds 15
      continue
    }

    # --- beets em lotes, em segundo plano
    Check-BeetsBatch
    if (-not $script:beetsJob) {
      $nImp = @($items | Where-Object { $_.Status -eq "importar" }).Count
      $busy = @($items | Where-Object { $_.Status -in @("pendente", "buscando", "pronta", "baixando") }).Count
      if ($nImp -gt 0 -and ($nImp -ge $LoteBeets -or $busy -eq 0 -or ((Get-Date) - $script:lastBeets).TotalSeconds -ge 90)) { Start-BeetsBatch }
    }

    if (((Get-Date) - $lastProgress).TotalSeconds -ge 30) { Show-Progress; $lastProgress = Get-Date }
    Start-Sleep -Milliseconds 1500
  }
}
finally {
  if ($script:beetsJob) { Write-Host "Aguardando o lote do beets terminar..." -ForegroundColor DarkGray; Check-BeetsBatch -Wait }
  try { [void][Win32.Power]::SetThreadExecutionState([uint32]"0x80000000") } catch {}

  # ---------------------------------------------------------------- relatorio
  $rep = Join-Path $logDir "resultado-$stamp.txt"
  $items | ForEach-Object { "{0}`t{1}`t{2}" -f $_.Status.ToUpper(), $_.Line, $(if ($_.Note) { $_.Note } elseif ($_.Via) { "$($_.Local)  [$($_.Via)]" } else { $_.Local }) } |
    Set-Content -LiteralPath $rep -Encoding UTF8
  $fail = @($items | Where-Object { $_.Status -in @("falhou", "nao encontrada") })
  $failFile = Join-Path $logDir "nao-baixadas-$stamp.txt"
  if ($fail.Count) { $fail | ForEach-Object { $_.Line } | Set-Content -LiteralPath $failFile -Encoding UTF8 }
  Write-Host ""
  Write-Host "==== Resumo ($([int]((Get-Date) - $t0).TotalMinutes) min) ====" -ForegroundColor Cyan
  $items | Group-Object Status | Sort-Object Count -Descending | ForEach-Object { Write-Host ("{0,5}  {1}" -f $_.Count, $_.Name) }
  Write-Host "Relatorio: $rep"
  if (Test-Path -LiteralPath $BeetsLog) { Write-Host "Log do beets: $BeetsLog" }
  if (Test-Path -LiteralPath $DiagFile) { Write-Host "Por que nao achou (arquivos recusados): $DiagFile" }
  $fmtOnly = @($items | Where-Object { $_.Status -eq "nao encontrada" -and $_.Note -like "existe, mas*" }).Count
  $nFora = @($items | Where-Object { $_.Fora -and $_.Status -eq "nao encontrada" }).Count
  if ($nFora) { Write-Host "$nFora nao encontrada(s) nem existem no catalogo do artista (titulo provavelmente errado na lista): veja $CatReport" -ForegroundColor Yellow }
  if ($BadUsers.Count) { Write-Host ("Usuarios que travaram (evitados nas faixas seguintes): " + (($BadUsers.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5 | ForEach-Object { "$($_.Key) x$($_.Value)" }) -join ', ')) -ForegroundColor DarkGray }
  if ($fmtOnly) { Write-Host "$fmtOnly faixa(s) existem, mas so em WAV/AIFF ou MP3 abaixo de 320: rode as nao baixadas com -AceitarWav -AceitarMp3Menor" -ForegroundColor Yellow }
  if ($fail.Count) { Write-Host "Para tentar de novo so as que faltaram:  baixar-lista.bat lotes\nao-baixadas-$stamp.txt -AceitarMp3Menor -AceitarWav" -ForegroundColor Yellow }
}
try { Stop-Transcript | Out-Null } catch {}
