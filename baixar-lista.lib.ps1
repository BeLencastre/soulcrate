<#
  baixar-lista.lib.ps1 — funcoes do download em lote que nao dependem do slskd, do docker
  nem da rede: leitura da lista, limpeza das linhas, comparacao de nomes de arquivo,
  tolerancia a grafia e conferencia no catalogo.

  Carregado pelo baixar-lista.ps1 (dot-source) e pelos testes em tests\. As funcoes leem as
  opcoes do script (ex.: $NaoTolerarGrafia, $AceitarAacAiff, $BadUsers) do escopo de quem chama.
#>

# ============================================================================
# Configuracao (.env)
# ============================================================================
function Read-DotEnv([string]$path) {
  $h = @{}
  if (Test-Path -LiteralPath $path) {
    foreach ($l in Get-Content -LiteralPath $path -Encoding UTF8) {
      if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $h[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
    }
  }
  return $h
}

# ============================================================================
# URL
# ============================================================================
function Esc([string]$s) { return [uri]::EscapeDataString($s) }

# ============================================================================
# Texto / matching
# ============================================================================
$StopWords = @('feat','ft','featuring','and','the','vs','x','e')
# Formato de cada Tier (a ordem de preferencia no download): so o que serve chega a ter Tier
$FormatoPorTier = @('FLAC','WAV','AIFF','MP3 320','AAC','MP3 256/VBR')
$AudioExt  = @('flac','mp3','wav','aif','aiff','m4a','aac','ogg','opus','wma','alac','ape','wv')
$Translit  = @{ [char]0x00F8 = 'o'; [char]0x00E6 = 'ae'; [char]0x00DF = 'ss'; [char]0x0142 = 'l'; [char]0x0111 = 'd'; [char]0x00FE = 'th'; [char]0x0153 = 'oe'; [char]0x0131 = 'i' }


# Extensao / nome sem extensao SEM usar [IO.Path]: no Windows PowerShell 5.1 ele lanca
# "Caracteres invalidos no caminho" para nomes vindos de Linux/Mac com | " < > (isso
# derrubava a analise de uma busca inteira na execucao de 06/10).
function Get-Leaf([string]$p) { return ($p -split '[\\/]')[-1] }
function Get-Ext([string]$p) {
  $leaf = Get-Leaf $p; $i = $leaf.LastIndexOf('.')
  if ($i -lt 0 -or $i -ge $leaf.Length - 1) { return "" }
  return $leaf.Substring($i + 1).ToLowerInvariant()
}
function Get-Stem([string]$leaf) { $i = $leaf.LastIndexOf('.'); if ($i -le 0) { return $leaf }; return $leaf.Substring(0, $i) }

# Normalize e chamada milhares de vezes por busca (mesmos nomes de arquivo para varias faixas
# do mesmo artista): guarda o resultado
$NormCache = New-Object 'System.Collections.Generic.Dictionary[string,string]'
function Normalize([string]$s) {
  if (-not $s) { return "" }
  $cached = $null
  if ($NormCache.TryGetValue($s, [ref]$cached)) { return $cached }
  $r = Normalize-Raw $s
  if ($NormCache.Count -gt 200000) { $NormCache.Clear() }
  $NormCache[$s] = $r
  return $r
}
function Normalize-Raw([string]$s) {
  $d = $s.ToLowerInvariant()
  if ($d -match '[øæßłđþœı]') {       # Byørn -> byorn, Straße -> strasse
    $sb0 = New-Object Text.StringBuilder
    foreach ($c in $d.ToCharArray()) { if ($Translit.ContainsKey($c)) { [void]$sb0.Append($Translit[$c]) } else { [void]$sb0.Append($c) } }
    $d = $sb0.ToString()
  }
  $d = $d.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object Text.StringBuilder
  foreach ($c in $d.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($c) }
  }
  return ($sb.ToString() -replace "[’'`]", "" -replace '[^a-z0-9]+', ' ').Trim()
}
function Tokens([string]$s) {
  $n = Normalize $s
  if (-not $n) { return @() }
  return @($n -split ' ' | Where-Object { $_ -and $StopWords -notcontains $_ })
}
# $hayN = texto JA normalizado
function Has-AllTokensN([string[]]$need, [string]$hayN) {
  $w = " $hayN "
  foreach ($t in $need) { if ($w.IndexOf(" $t ") -lt 0) { return $false } }
  return $true
}
function Has-AnyTokenN([string[]]$need, [string]$hayN) {
  $w = " $hayN "
  foreach ($t in $need) { if ($w.IndexOf(" $t ") -ge 0) { return $true } }
  return $false
}
function Has-Artist($req, [string]$hayN) {
  if ($req.ArtistTokens.Count -eq 0) { return $true }
  if (Has-AllTokensN $req.ArtistTokens $hayN) { return $true }
  return (" $hayN ").Contains(" $($req.ArtistJoined) ")      # "RIOT CODE" x "RIOTCODE"
}

$VersionWords = @('remix','edit','rework','bootleg','dub','vip','live','acapella','acappella','instrumental',
                  'radio','karaoke','mashup','cover','reprise','remake','flip','sped','slowed','nightcore','8d')
$AllowedExtra = @('original','mix','extended','version','club','feat','ft','featuring','and','the','vs','x','e',
                  'official','audio','hq','kbps','mp3','flac','wav','aiff','www','free','download','master','mastered','remastered','remaster')

function Clean-Line([string]$l) {
  $l = $l -replace "`t", ' ' -replace '\s+[–—]\s+', ' - ' -replace '\s+', ' '
  $l = $l -replace '^\s*(\d{1,4}\s*[\.\)\-:]\s+|[\-\*•]\s+)', ''     # "01. ", "1) ", "- ", "* "
  $l = $l -replace '\s*[\[\(]?\b\d{1,2}:\d{2}\b[\]\)]?\s*$', ''          # duracao no fim "3:45"
  return $l.Trim()
}
function Clean-Query([string]$q) { return ($q -replace '[^\w\s]', ' ' -replace '\s+', ' ').Trim() }

function Parse-Line([string]$line) {
  $artist = ""; $title = $line
  $i = $line.IndexOf(" - ")
  if ($i -gt 0) { $artist = $line.Substring(0, $i); $title = $line.Substring($i + 3) }
  $mix  = (([regex]::Matches($title, '[\(\[]([^\)\]]*)[\)\]]') | ForEach-Object { $_.Groups[1].Value }) -join ' ')
  $base = ($title -replace '[\(\[][^\)\]]*[\)\]]', ' ').Trim()
  $artistNoBr = ($artist -replace '[\(\[][^\)\]]*[\)\]]', ' ')                # "Paul Clark (UK)" -> "Paul Clark"
  $mainArtist = ($artistNoBr -split '(?i)\s+(?:feat\.?|ft\.?|featuring|&|x|vs\.?|and)\s+|,')[0].Trim()
  $mixN = Normalize $mix
  $isOriginal = ($mixN -eq "" -or $mixN -eq "original mix" -or $mixN -eq "original")
  $mixTokens = @()
  if (-not $isOriginal) { $mixTokens = @(Tokens $mix | Where-Object { $_ -ne 'mix' }) }
  $artistT = @(Tokens $mainArtist)
  $baseT = @(Tokens $base)
  # titulo feito so de "palavras vazias" ("X", "The") -> usa as palavras assim mesmo
  if ($baseT.Count -eq 0) { $nb = Normalize $base; if ($nb) { $baseT = @($nb -split ' ') } }
  $wanted = @(@(Tokens $line) + $baseT | Select-Object -Unique)
  # "Cloudy - Yeah (Cloudy Remix)": o artista da linha e o REMIXER; o artista original e desconhecido
  $remixer = ($artistT.Count -gt 0 -and $mixTokens.Count -gt 0 -and (Has-AllTokensN $artistT ($mixTokens -join ' ')))
  $artistQ = Clean-Query $mainArtist
  $baseQ = Clean-Query $base
  $mixQ = Clean-Query $mix
  $qs = New-Object System.Collections.ArrayList
  if ($remixer) {
    [void]$qs.Add("$baseQ $mixQ")                                            # "Yeah Cloudy Remix"
  } else {
    [void]$qs.Add(((@($artistQ, $baseQ) + $(if ($isOriginal) { @() } else { @($mixQ) })) -join ' '))
    [void]$qs.Add("$artistQ $baseQ")
  }
  $ascii = (Normalize "$mainArtist $base")                                   # "Byørn 2 LOUD" -> "byorn 2 loud"
  if ("$mainArtist $base" -match '[^\x00-\x7F]') { [void]$qs.Add($ascii) }
  $queries = @($qs | ForEach-Object { ($_ -replace '\s+', ' ').Trim() } | Where-Object { $_ } | Select-Object -Unique)
  $tail = @()
  if (-not $isOriginal -and -not $remixer) { $tail = @(("$baseQ $mixQ" -replace '\s+', ' ').Trim()) }   # "Titulo X Remix", sem artista
  elseif (-not $remixer -and $artistQ -and ($baseQ -replace '[^\p{L}]', '').Length -ge 6) {
    # ultimo recurso: SO o titulo (o arquivo ainda precisa ter o artista no caminho). Pega o que a
    # busca com o artista perde: artista escrito diferente na pasta ("Vegas (BR)", "VEGAS"), artista
    # so no nome da pasta do album, ou nome de artista comum demais ("Vegas", "Invasion")
    $tail = @($baseQ)
  }
  return [pscustomobject]@{
    Line = $line; Artist = $mainArtist; ArtistQuery = $artistQ; ArtistKey = ($artistT -join ' '); Base = $base; Mix = $mix
    IsOriginal = $isOriginal; Remixer = $remixer
    ArtistTokens = $artistT; ArtistJoined = ($artistT -join ''); BaseTokens = $baseT; MixTokens = $mixTokens
    AllTokens = $wanted; Banned = @($VersionWords | Where-Object { $wanted -notcontains $_ })
    Queries = $queries; TailQueries = $tail
  }
}

# ---------------------------------------------------------------- tolerancia a grafia
# Distancia de edicao (com troca de letras vizinhas): "abaddon" x "abbadon" = 1
function Get-EditDistance([string]$a, [string]$b, [int]$max) {
  # matriz guardada num vetor simples (o Windows PowerShell 5.1 nao aceita $d[$i, $j])
  $la = $a.Length; $lb = $b.Length
  if ([Math]::Abs($la - $lb) -gt $max) { return $max + 1 }
  $w = $lb + 1
  $d = New-Object 'int[]' (($la + 1) * $w)
  for ($i = 0; $i -le $la; $i++) { $d[$i * $w] = $i }
  for ($j = 0; $j -le $lb; $j++) { $d[$j] = $j }
  for ($i = 1; $i -le $la; $i++) {
    $rowMin = [int]::MaxValue
    for ($j = 1; $j -le $lb; $j++) {
      $cost = 1
      if ($a[$i - 1] -eq $b[$j - 1]) { $cost = 0 }
      $del = $d[($i - 1) * $w + $j] + 1
      $ins = $d[$i * $w + $j - 1] + 1
      $sub = $d[($i - 1) * $w + $j - 1] + $cost
      $v = [Math]::Min([Math]::Min($del, $ins), $sub)
      if ($i -gt 1 -and $j -gt 1 -and $a[$i - 1] -eq $b[$j - 2] -and $a[$i - 2] -eq $b[$j - 1]) {
        $tr = $d[($i - 2) * $w + $j - 2] + 1
        if ($tr -lt $v) { $v = $tr }
      }
      $d[$i * $w + $j] = $v
      if ($v -lt $rowMin) { $rowMin = $v }
    }
    if ($rowMin -gt $max) { return $max + 1 }
  }
  return $d[$la * $w + $lb]
}
# Quantos erros de digitacao toleramos numa palavra: 0 ate 4 letras, 1 com 5-6, 2 com 7+
# A primeira letra tem que bater sempre; com 2 erros, a ultima tambem ("abaddon" ~ "abbadon", "darkness" !~ "madness")
function Get-Tolerance([string]$t) { if ($t.Length -ge 7) { return 2 } elseif ($t.Length -ge 5) { return 1 } else { return 0 } }
function Test-TokenIn([string]$t, [string[]]$words) {
  if ($words -contains $t) { return $true }
  $k = Get-Tolerance $t
  if ($k -eq 0 -or $NaoTolerarGrafia) { return $false }
  foreach ($w in $words) {
    if ($w.Length -lt 4 -or $t[0] -ne $w[0] -or [Math]::Abs($t.Length - $w.Length) -gt $k -or $w -match '^\d+$') { continue }   # filtros baratos antes da distancia
    $dist = Get-EditDistance $t $w $k
    if ($dist -le 1 -and (Get-Tolerance $w) -ge 1 -and $t[0] -eq $w[0]) { return $true }      # 1a letra igual: "power" !~ "tower"
    if ($dist -eq 2 -and $k -ge 2 -and $t[0] -eq $w[0] -and $t[-1] -eq $w[-1]) { return $true }
  }
  return $false
}
# Todas as palavras do titulo presentes, aceitando pequenos erros de grafia
function Has-TitleTokensN([string[]]$need, [string]$hayN) {
  if (Has-AllTokensN $need $hayN) { return $true }
  $words = @($hayN -split ' ' | Where-Object { $_ })
  foreach ($t in $need) { if (-not (Test-TokenIn $t $words)) { return $false } }
  return $true
}
# Palavra "conhecida" no trecho do titulo: esta na linha (ou quase), e permitida, numero, tom (5A/12B)
function Test-KnownWord($req, [string]$w) {
  if ($AllowedExtra -contains $w -or $w -match '^\d+$' -or $w -match '^(1[0-2]|[1-9])[ab]$') { return $true }
  return (Test-TokenIn $w $req.AllTokens)
}

# Divide o nome do arquivo em trechos "artista - titulo". Nomes estilo scene sem espacos
# ("09-kobosil-while_the_stars") usam "-" como separador e "_" como espaco.
function Split-Segments([string]$leafNoBr) {
  $s = $leafNoBr
  if ($s -notmatch '\s' -or ($s -match '_' -and $s -notmatch ' - ')) { $s = ($s -replace '_', ' ') -replace '-', ' - ' }
  return @($s -split '\s+[-–—]\s+' | Where-Object { $_.Trim() })
}

# Avalia UM arquivo. Retorna @{Tier;Bonus;Approx} se servir; senao @{Reason;Score} (Score = quao parecido era).
# Checa o CONTEUDO antes do formato, para o diagnostico mostrar o motivo real.
function Test-File($req, $f) {
  $fn = [string]$f.filename
  $ext = Get-Ext $fn
  if ($AudioExt -notcontains $ext) { return $null }                          # .jpg/.lrc/.nfo...: ignora em silencio
  $parts = $fn -split '[\\/]'
  $leafNoExt = Get-Stem $parts[-1]
  # "[01][Vendex][Emotional_Khaos]" -> "01 - Vendex - Emotional_Khaos"
  if (($leafNoExt -replace '[\(\[][^\)\]]*[\)\]]', '') -notmatch '[A-Za-z]' -and $leafNoExt -match '^\s*\[') {
    $leafNoExt = ($leafNoExt.Trim() -replace '^\[', '' -replace '\]$', '' -replace '\]\s*\[', ' - ')
  }
  $brText   = (([regex]::Matches($leafNoExt, '[\(\[]([^\)\]]*)[\)\]]') | ForEach-Object { $_.Groups[1].Value }) -join ' ')
  $leafNoBr = $leafNoExt -replace '[\(\[][^\)\]]*[\)\]]', ' '
  $tailAll  = ((@($parts | Select-Object -Last 3 | Select-Object -First ([Math]::Min(2, $parts.Count - 1))) + $leafNoExt) -join ' ')
  $tailNoBr = $tailAll -replace '[\(\[][^\)\]]*[\)\]]', ' '
  $leafN = Normalize $leafNoBr
  $titleOk  = Has-TitleTokensN $req.BaseTokens $leafN
  $brN = Normalize $brText
  $artistOk = $(if ($req.Remixer) { Has-Artist $req (Normalize $tailAll) } else { Has-Artist $req (Normalize $tailNoBr) })
  # "La Zowi - Orgasm (Adrián Mills & Selecta Klub Mix)" para "Adrián Mills & Selecta - Orgasm (Klub Mix)":
  # o artista pedido aparece no parentese, junto do mix pedido -> e a versao dele
  if (-not $artistOk -and $req.MixTokens.Count -gt 0 -and (Has-Artist $req $brN) -and (Has-AllTokensN $req.MixTokens $brN)) { $artistOk = $true }
  $score = [int]$titleOk * 2 + [int]$artistOk
  if ($f.isLocked) { return @{ Reason = "bloqueado pelo usuario"; Score = $score } }
  if ($f.length -and [int]$f.length -lt 90) { return @{ Reason = "curto demais (previa)"; Score = $score } }
  if (-not $titleOk)  { return @{ Reason = "titulo diferente"; Score = $score } }
  if (-not $artistOk) { return @{ Reason = "artista nao aparece"; Score = $score } }
  if ($req.MixTokens.Count -gt 0) {
    $mixHay = $(if ($brText) { $brText } else { $leafNoBr })
    if (-not (Has-AllTokensN $req.MixTokens (Normalize $mixHay))) { return @{ Reason = "mix diferente"; Score = $score } }
  }
  $artistInLeaf = Has-Artist $req (Normalize $leafNoExt)
  $segs = @(Split-Segments $leafNoBr)
  $approx = ""
  $titleInOwnSeg = $false; $otherWords = $false
  $titleIsArtist = ($req.ArtistTokens.Count -gt 0 -and -not @($req.BaseTokens | Where-Object { $req.ArtistTokens -notcontains $_ }).Count)
  foreach ($seg in $segs) {
    $segN = Normalize $seg
    $segT = @(Tokens $seg | Where-Object { $_ -notmatch '^\d+$' })
    if ($segT.Count -eq 0) { continue }
    $isArtistSeg = ($req.ArtistTokens.Count -gt 0 -and (Has-AnyTokenN $req.ArtistTokens $segN))
    $hasAllTitle = Has-TitleTokensN $req.BaseTokens $segN
    if ($hasAllTitle -and -not $isArtistSeg) { $titleInOwnSeg = $true }
    if ($isArtistSeg) { continue }                                           # trecho do artista: feat. etc. sao livres
    $hasTitle = $false
    foreach ($t in $req.BaseTokens) { if (Test-TokenIn $t @($segN -split ' ')) { $hasTitle = $true; break } }
    if (-not $hasTitle) {
      $otherWords = $true
      # trecho sem o titulo e sem o artista pedido = outro artista
      if ($req.Remixer) { continue }                       # remix: artista original e desconhecido, tudo bem
      if (-not $artistInLeaf) { return @{ Reason = "outro artista no nome: '$($seg.Trim())'"; Score = $score } }
      continue                                             # ex.: nome do album no arquivo
    }
    foreach ($w in $segT) {
      if (-not (Test-KnownWord $req $w)) {
        if ($TituloAproximado -and -not $approx) { $approx = $seg.Trim(); break }
        return @{ Reason = "palavra a mais no titulo: '$w'"; Score = $score }
      }
    }
  }
  # "05-kobosil_x_somewhen--hora" para "Kobosil - X": o "x" so aparece colado no nome do artista
  if (-not $titleInOwnSeg -and $otherWords -and $segs.Count -gt 1 -and -not $titleIsArtist) {
    return @{ Reason = "titulo so aparece junto do nome do artista"; Score = $score }
  }
  $leafWords = @((Normalize $leafNoExt) -split ' ')
  foreach ($b in $req.Banned) { if ($leafWords -contains $b) { return @{ Reason = "outra versao ('$b')"; Score = $score } } }
  # --- formato por ultimo
  $tier = -1; $fmtWhy = ""
  $br = 0; if ($f.bitRate) { $br = [int]$f.bitRate }
  $vbr = [bool]$f.isVariableBitRate
  if ($br -le 0 -and $ext -eq 'mp3' -and [long]$f.size -gt 0 -and [int]$f.length -gt 0) {
    # muitos clientes nao informam o bitrate (era recusado como "mp3 0 kbps"): estima por tamanho/duracao,
    # com folga para a capa embutida e as tags (320 kbps de audio rendem ~325-345 no calculo)
    $est = [int]([long]$f.size * 8 / [int]$f.length / 1000)
    $br = $(if ($est -ge 310) { 320 } elseif ($est -ge 250) { 256 } else { $est })
  }
  if ($br -le 0 -and $ext -in @('m4a','aac') -and [long]$f.size -gt 0 -and [int]$f.length -gt 0) {
    $br = [int]([long]$f.size * 8 / [int]$f.length / 1000)                   # AAC sem bitrate informado: estima por tamanho/duracao
  }
  # FLAC e WAV sempre servem. AIFF e AAC so com -AceitarAacAiff; MP3 320 so com -AceitarMp3320; MP3 256/VBR so com
  # -AceitarMp3Menor (que ja inclui o 320).
  switch ($ext) {
    'flac' { $tier = 0 }
    'wav' { $tier = 1 }
    { $_ -in @('aif','aiff') } { if ($AceitarAacAiff) { $tier = 2 } else { $fmtWhy = "formato $ext (use -AceitarAacAiff)" } }
    'mp3' {
      if ($br -ge 315) { if ($AceitarMp3320 -or $AceitarMp3Menor) { $tier = 3 } else { $fmtWhy = "mp3 $br kbps (use -AceitarMp3320)" } }
      elseif ($br -ge 256 -or ($vbr -and $br -ge 220)) {
        if ($AceitarMp3Menor) { $tier = 5 } else { $fmtWhy = "mp3 $br kbps$(if ($vbr) {' VBR'}) (use -AceitarMp3Menor)" }
      }
      else { $fmtWhy = "mp3 $br kbps (qualidade baixa)" }
    }
    { $_ -in @('m4a','aac') } {
      # o bitrate vem primeiro: AAC abaixo de 250 kbps nao serve nem com a opcao (mesma regra do "MP3 baixo")
      if ($br -lt 250) { $fmtWhy = "aac $br kbps (qualidade baixa)" }
      elseif ($AceitarAacAiff) { $tier = 4 }
      else { $fmtWhy = "formato $ext (use -AceitarAacAiff)" }
    }
    default { $fmtWhy = "formato $ext" }
  }
  if ($tier -lt 0) { return @{ Reason = $fmtWhy; Score = 4 } }               # era a faixa certa, so o formato nao serviu
  $bonus = 0
  if ($req.IsOriginal -and ((Normalize $leafNoExt) -match 'original mix|extended mix|extended version|club mix')) { $bonus = 1 }
  return @{ Tier = $tier; Bonus = $bonus; Approx = $approx }
}

function Add-Diag($item, [string]$reason, [int]$score, [string]$user, [string]$file) {
  $item.Reasons[$reason] = 1 + [int]$item.Reasons[$reason]
  if ($score -lt 1) { return }                                               # sem titulo nem artista: lixo da busca
  if ($item.Diag.Count -ge 300) { return }
  [void]$item.Diag.Add([pscustomobject]@{ Score = $score; Text = ("{0,-40} {1} :: {2}" -f $reason, $user, $file); Reason = $reason; User = $user; File = $file })
}

function Get-Candidates($item, $responses, $req = $null, [switch]$NoDiag) {
  if ($null -eq $req) { $req = $item.Req }
  $list = New-Object System.Collections.ArrayList
  foreach ($r in $responses) {
    foreach ($f in @($r.files)) {
      try { $res = Test-File $req $f }
      catch { $res = @{ Reason = "nome de arquivo ilegivel"; Score = 0 } }         # um arquivo estranho nao derruba a busca inteira
      if ($null -eq $res) { continue }
      if ($res.ContainsKey('Reason')) { if (-not $NoDiag) { Add-Diag $item $res.Reason $res.Score $r.username $f.filename }; continue }
      [void]$list.Add([pscustomobject]@{
        User = [string]$r.username; File = [string]$f.filename; Size = [long]$f.size; Tier = $res.Tier; Bonus = $res.Bonus
        Approx = [string]$res.Approx; Free = [bool]$r.hasFreeUploadSlot; Queue = [int]$r.queueLength; Speed = [long]$r.uploadSpeed
      })
    }
  }
  # titulo exato sempre antes do aproximado; usuarios que ja travaram 2+ vezes nesta execucao vao para o fim;
  # depois formato, usuario sem falhas, mix preferido, slot livre, fila, velocidade
  $sorted = $list | Sort-Object @{e={[int][bool]$_.Approx}}, @{e={[int]([int]$BadUsers[$_.User] -ge 2)}}, @{e={$_.Tier}}, @{e={[int]$BadUsers[$_.User]}},
                                @{e={$_.Bonus}; Descending=$true}, @{e={$_.Free}; Descending=$true}, @{e={$_.Queue}}, @{e={$_.Speed}; Descending=$true}
  $seen = @{}; $out = New-Object System.Collections.ArrayList
  foreach ($c in $sorted) { if (-not $seen.ContainsKey($c.User)) { $seen[$c.User] = 1; [void]$out.Add($c) } }
  return ,$out
}

# Catalogo do artista no Soulseek (a partir da busca so pelo artista):
# titulos limpos, ordenados por quantos usuarios tem cada um.
function Get-ArtistTitles($req, $responses) {
  $t = @{}
  foreach ($r in $responses) {
    $seenHere = @{}
    foreach ($f in @($r.files)) {
      $fn = [string]$f.filename
      $ext = Get-Ext $fn
      if ($AudioExt -notcontains $ext) { continue }
      if ($f.length -and [int]$f.length -lt 90) { continue }
      $parts = $fn -split '[\\/]'
      if (-not (Has-Artist $req (Normalize (($parts | Select-Object -Last 3) -join ' ')))) { continue }
      $leaf = Get-Stem $parts[-1]
      if (($leaf -replace '[\(\[][^\)\]]*[\)\]]', '') -notmatch '[A-Za-z]' -and $leaf -match '^\s*\[') { $leaf = ($leaf.Trim() -replace '^\[', '' -replace '\]$', '' -replace '\]\s*\[', ' - ') }
      $leaf = $leaf -replace '^\s*[a-dA-D]?\d{1,4}\s*[\.\-_ ]\s*', ''
      $segs = @(Split-Segments $leaf | Where-Object { $_ -and -not (Has-Artist $req (Normalize $_)) -and ($_ -match '[A-Za-z]{2}') })
      if (-not $segs.Count) { continue }
      $title = ($segs[-1] -replace '_', ' ' -replace '\s+', ' ').Trim()
      $title = ($title -replace '\s*[\(\[](original mix|extended mix|original)[\)\]]', '' -replace '\s*\[[^\]]*\]\s*$', '').Trim()
      $k = Normalize $title
      if (-not $k -or $k -match '^[0-9a-f]{6,}$' -or $k.Length -lt 2) { continue }      # hashes / lixo
      if ($seenHere.ContainsKey($k)) { continue }; $seenHere[$k] = 1
      if (-not $t.ContainsKey($k)) { $t[$k] = [pscustomobject]@{ Title = $title; Key = $k; Users = 0 } }
      $t[$k].Users++
    }
  }
  return @($t.Values | Sort-Object @{e={$_.Users}; Descending=$true}, @{e={$_.Title}})
}
# Titulos do catalogo mais parecidos com o pedido (para sugerir correcao da lista)
function Get-TitleSuggestions($req, $titles) {
  $want = @($req.BaseTokens)
  if (-not $want.Count) { return @() }
  $sc = foreach ($ti in $titles) {
    $words = @($ti.Key -split ' ')
    $hit = 0; foreach ($w in $want) { if (Test-TokenIn $w $words) { $hit++ } }
    if ($hit -eq 0) {
      $d = Get-EditDistance ($want -join ' ') $ti.Key 3
      if ($d -le 3) { $hit = 0.5 }
    }
    if ($hit -gt 0) { [pscustomobject]@{ T = $ti; S = ($hit / $want.Count) - (0.02 * [Math]::Max(0, $words.Count - $want.Count)) } }
  }
  return @($sc | Sort-Object S -Descending | Select-Object -First 5 | ForEach-Object { $_.T.Title })
}

# ============================================================================
# Leitura da lista (.txt ou .csv)
# ============================================================================
# Linhas da lista ja limpas, com o numero da linha de origem no arquivo (SourceLine; no .csv,
# o numero da linha do registro, contando o cabecalho como linha 1)
function Read-ListaDetalhada([string]$path) {
  $out = New-Object System.Collections.ArrayList
  if ([IO.Path]::GetExtension($path).ToLowerInvariant() -eq '.csv') {
    $first = Get-Content -LiteralPath $path -Encoding UTF8 -TotalCount 1
    $delim = $(if (($first.Split(';').Count) -gt ($first.Split(',').Count)) { ';' } else { ',' })
    $rows = @(Import-Csv -LiteralPath $path -Encoding UTF8 -Delimiter $delim)
    if ($rows.Count -eq 0) { return ,$out }
    $cols = @($rows[0].PSObject.Properties.Name)
    $tCol = $cols | Where-Object { $_ -match '^(track name|track|title|titulo|título|name|song|musica|música|faixa)$' } | Select-Object -First 1
    $aCol = $cols | Where-Object { $_ -match '^(artist name\(s\)|artist name|artists?|artista\(s\)|artistas?)$' } | Select-Object -First 1
    if (-not $tCol -or -not $aCol) { throw "CSV sem colunas de titulo/artista reconhecidas. Colunas: $($cols -join ', ')" }
    $n = 1
    foreach ($r in $rows) {
      $n++
      $a = ([string]$r.$aCol -split '\s*[;|]\s*')[0]      # varios artistas -> o primeiro basta para a busca
      $t = [string]$r.$tCol
      $t = $t -replace '\s+-\s+((?:[^-]*?)\b(?:Remix|Mix|Edit|Version|Rework|Dub|VIP|Bootleg)\b.*)$', ' ($1)'   # "Title - X Remix" (Spotify) -> "Title (X Remix)"
      if ($t) { [void]$out.Add([pscustomobject]@{ Line = (Clean-Line "$a - $t"); SourceLine = $n }) }
    }
  } else {
    $n = 0
    foreach ($l in Get-Content -LiteralPath $path -Encoding UTF8) {
      $n++
      $t = $l.Trim()
      if (-not $t -or $t.StartsWith('#')) { continue }
      $t = Clean-Line $t
      if ($t) { [void]$out.Add([pscustomobject]@{ Line = $t; SourceLine = $n }) }
    }
  }
  return ,$out
}
function Read-Lista([string]$path) {
  $out = New-Object System.Collections.ArrayList
  foreach ($d in (Read-ListaDetalhada $path)) { [void]$out.Add($d.Line) }
  return ,$out
}

# ============================================================================
# Biblioteca do beets (a leitura, que chama o docker, fica no baixar-lista.ps1)
# ============================================================================
function In-Library($lib, $req) {
  if (-not $lib -or $req.ArtistTokens.Count -eq 0) { return $false }
  $bucket = $lib.Index[$req.ArtistTokens[0]]
  if (-not $bucket) { return $false }
  foreach ($e in $bucket) {
    if (-not (Has-AllTokensN $req.BaseTokens $e.T)) { continue }
    if (-not (Has-Artist $req $e.AT)) { continue }
    if ($req.MixTokens.Count -gt 0 -and -not (Has-AllTokensN $req.MixTokens $e.T)) { continue }
    $words = @($e.T -split ' '); $bad = $false
    foreach ($b in $req.Banned) { if ($words -contains $b) { $bad = $true; break } }
    if (-not $bad) { return $true }
  }
  return $false
}

# ============================================================================
# Catalogo (MusicBrainz): partes que nao acessam a rede
# ============================================================================
# Escapa caracteres especiais da sintaxe de busca (Lucene) do MusicBrainz
function Esc-Lucene([string]$s) { return ($s -replace '([+\-&|!(){}\[\]^"~*?:\\/])', '\$1') }

# Gravacoes -> { A = artistas creditados ("X feat. Y"), T = titulo }
function ConvertFrom-MbData($r) {
  if ($null -eq $r) { return @() }
  return @(@($r.recordings) | Where-Object { $_ -and $_.title } | ForEach-Object {
    $credit = (@($_.'artist-credit') | Where-Object { $_ } | ForEach-Object { [string]$_.name + [string]$_.joinphrase }) -join ''
    [pscustomobject]@{ A = $credit; T = [string]$_.title }
  })
}

# "Vengeance Of The Masked (Original Mix)" / "Hora - Extended Mix" -> "Vengeance Of The Masked" / "Hora"
function Get-CatBase([string]$t) {
  $b = $t -replace '[\(\[][^\)\]]*[\)\]]', ' '
  $b = $b -replace '(?i)\s+-\s+.*\b(mix|remix|edit|version|rework|vip|dub|remaster(ed)?)\b.*$', ''
  return ($b -replace '\s+', ' ').Trim()
}

# Procura o titulo pedido entre as faixas do artista.
#   exato      = mesmo titulo (ignorando acentos/pontuacao)
#   grafia     = mesmo titulo escrito diferente ("Abaddon" x "Abbadon", "Tataku" x "Tatakai")
#   completado = o pedido e parte de UM unico titulo ("Vengeance" -> "Vengeance Of The Masked")
#   fora       = artista existe, titulo nao
function Find-InCatalog($req, $tracks) {
  $want = Normalize $req.Base
  $exact = $null; $super = @{}; $fuzzy = @{}; $partial = @{}
  $tol = $(if ($want.Length -ge 6) { 2 } elseif ($want.Length -ge 4) { 1 } else { 0 })
  if ($NaoTolerarGrafia) { $tol = 0 }
  foreach ($tr in $tracks) {
    $base = Get-CatBase $tr.T
    $bN = Normalize $base
    if (-not $bN) { continue }
    if ($bN -eq $want) { $exact = $base; break }
    if (Has-TitleTokensN $req.BaseTokens $bN) {
      $extra = @(@($bN -split ' ') | Where-Object { -not (Test-KnownWord $req $_) }).Count
      if ($extra -eq 0) { if (-not $exact) { $exact = $base }; continue }               # so grafia/palavras vazias
      if (-not $super.ContainsKey($bN)) { $super[$bN] = [pscustomobject]@{ Base = $base; Extra = $extra; N = 0 } }
      $super[$bN].N++
      continue
    }
    if ($tol -gt 0 -and $bN[0] -eq $want[0] -and [Math]::Abs($bN.Length - $want.Length) -le $tol) {
      $d = Get-EditDistance $want $bN $tol
      if ($d -le $tol) {
        if (-not $fuzzy.ContainsKey($bN)) { $fuzzy[$bN] = [pscustomobject]@{ Base = $base; D = $d; N = 0 } }
        $fuzzy[$bN].N++
        continue
      }
    }
    # so para sugerir: titulos com alguma palavra em comum ("Bloody Angel" -> "Corrupted Angel")
    if ($partial.Count -lt 20) {
      $bWords = @($bN -split ' ')
      foreach ($tk in $req.BaseTokens) { if ($tk.Length -ge 3 -and (Test-TokenIn $tk $bWords)) { $partial[$bN] = $base; break } }
    }
  }
  if ($exact) { return @{ Kind = $(if ((Normalize $exact) -eq $want) { 'exato' } else { 'grafia' }); Base = $exact; Sugs = @() } }
  if ($super.Count -eq 1 -and $fuzzy.Count -eq 0) { return @{ Kind = 'completado'; Base = @($super.Values)[0].Base; Sugs = @() } }
  if ($super.Count -eq 0 -and $fuzzy.Count -eq 1) { return @{ Kind = 'grafia'; Base = @($fuzzy.Values)[0].Base; Sugs = @() } }
  $sugs = @(@(@($fuzzy.Values | Sort-Object D) + @($super.Values | Sort-Object Extra, @{e={$_.N}; Descending=$true})) | ForEach-Object { $_.Base })
  $sugs = @(@($sugs) + @($partial.Values | Sort-Object) | Select-Object -Unique | Select-Object -First 5)
  return @{ Kind = 'fora'; Base = ''; Sugs = $sugs }
}

# ============================================================================
# Etapas de busca de cada faixa
# ============================================================================
function New-Stages($req) {
  $st = New-Object System.Collections.ArrayList
  $useArtist = (-not $SemBuscaArtista -and $req.ArtistTokens.Count -gt 0 -and $req.ArtistQuery)
  # artista com 2+ faixas na lista: busca o artista PRIMEIRO (1 busca serve para todas as faixas dele)
  $artistFirst = ($useArtist -and [int]$ArtistLineCount[$req.ArtistKey] -ge 2)
  if ($artistFirst) { [void]$st.Add(@{ Kind = 'artist'; Q = $req.ArtistQuery }) }
  foreach ($q in $req.Queries) { [void]$st.Add(@{ Kind = 'q'; Q = $q }) }
  if ($useArtist -and -not $artistFirst) { [void]$st.Add(@{ Kind = 'artist'; Q = $req.ArtistQuery }) }
  foreach ($q in $req.TailQueries) { if ($req.Queries -notcontains $q) { [void]$st.Add(@{ Kind = 'q'; Q = $q }) } }
  return ,$st
}
