#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }
<#
  Testes de caracterizacao das funcoes do download em lote (baixar-lista.lib.ps1).
  Os casos vem dos exemplos do README: se um teste quebrar, ou o README ou o script mudou.

  Rodar:  Invoke-Pester -Path tests
#>

BeforeAll {
  . (Join-Path $PSScriptRoot '..\baixar-lista.lib.ps1')

  # arquivo como o slskd devolve numa resposta de busca
  function New-F([string]$name, [int]$length = 300, [int]$bitRate = 0, [long]$size = 0, [switch]$Vbr, [switch]$Locked) {
    [pscustomobject]@{ filename = $name; length = $length; bitRate = $bitRate; size = $size; isVariableBitRate = [bool]$Vbr; isLocked = [bool]$Locked }
  }
  function Test-Arquivo([string]$linha, [string]$arquivo, [hashtable]$extra = @{}) {
    $p = @{ name = $arquivo } + $extra
    Test-File (Parse-Line $linha) (New-F @p)
  }
}

Describe 'baixar-lista.lib' {
  BeforeEach {
    # opcoes do script, com os valores padrao
    $NaoTolerarGrafia = $false; $TituloAproximado = $false; $AceitarAacAiff = $false; $AceitarMp3320 = $false; $AceitarMp3Menor = $false
    $SemBuscaArtista = $false; $BadUsers = @{}; $ArtistLineCount = @{}
  }

  Describe 'Normalize' {
    It 'tira acentos e troca letras especiais: <In> -> <Out>' -ForEach @(
      @{ In = 'Byørn'; Out = 'byorn' }
      @{ In = 'Straße'; Out = 'strasse' }
      @{ In = 'Adrián Mills & Selecta'; Out = 'adrian mills selecta' }
      @{ In = "Don't Stop"; Out = 'dont stop' }
      @{ In = '  RIOT   CODE!! '; Out = 'riot code' }
    ) { Normalize $In | Should -Be $Out }
  }

  Describe 'Clean-Line' {
    It 'limpa "<In>"' -ForEach @(
      @{ In = '01. Azyr - No Escape'; Out = 'Azyr - No Escape' }
      @{ In = '1) Azyr - No Escape'; Out = 'Azyr - No Escape' }
      @{ In = '- Azyr - No Escape'; Out = 'Azyr - No Escape' }
      @{ In = '* Azyr - No Escape'; Out = 'Azyr - No Escape' }
      @{ In = 'Azyr – No Escape'; Out = 'Azyr - No Escape' }
      @{ In = 'Azyr — No Escape'; Out = 'Azyr - No Escape' }
      @{ In = 'Azyr - No Escape 3:45'; Out = 'Azyr - No Escape' }
      @{ In = 'Azyr - No Escape (3:45)'; Out = 'Azyr - No Escape' }
      @{ In = "Azyr`t-`tNo   Escape"; Out = 'Azyr - No Escape' }
    ) { Clean-Line $In | Should -Be $Out }
  }

  Describe 'Parse-Line' {
    It 'sem mix: prefere a original e recusa versoes' {
      $r = Parse-Line 'Azyr - No Escape'
      $r.Artist | Should -Be 'Azyr'
      $r.Base | Should -Be 'No Escape'
      $r.IsOriginal | Should -BeTrue
      $r.Banned | Should -Contain 'remix'
      $r.Banned | Should -Contain 'radio'
      $r.Queries[0] | Should -Be 'Azyr No Escape'
    }
    It '"Original Mix" equivale a nao escrever nada' {
      $r = Parse-Line 'Creeds - Push Up (Original Mix)'
      $r.IsOriginal | Should -BeTrue
      $r.MixTokens.Count | Should -Be 0
    }
    It 'remix especifico guarda o nome do remixer no mix' {
      $r = Parse-Line 'RIOT CODE - Direct It To The Roof (Azyr Remix)'
      $r.IsOriginal | Should -BeFalse
      $r.Remixer | Should -BeFalse
      $r.MixTokens | Should -Be @('azyr', 'remix')
      $r.Banned | Should -Not -Contain 'remix'
      $r.Queries[0] | Should -Be 'RIOT CODE Direct It To The Roof Azyr Remix'
      $r.TailQueries | Should -Be @('Direct It To The Roof Azyr Remix')
    }
    It 'varios artistas: usa o primeiro' {
      (Parse-Line 'Azyr & Charlie Sparks - Power').Artist | Should -Be 'Azyr'
      (Parse-Line 'MICH, Teletech - C4 Explosive (Azyr Full Throttle Remix)').Artist | Should -Be 'MICH'
      (Parse-Line 'Azyr feat. Someone - Power').Artist | Should -Be 'Azyr'
    }
    It 'ignora sufixos como (UK) no artista' {
      $r = Parse-Line 'Paul Clark (UK) - Ruach (Azyr Remix)'
      $r.Artist | Should -Be 'Paul Clark'
      $r.ArtistQuery | Should -Be 'Paul Clark'
    }
    It 'artista = remixer: o artista original e desconhecido' {
      $r = Parse-Line 'Novah - Bye Bye (NOVAH Remix)'
      $r.Remixer | Should -BeTrue
      $r.Queries[0] | Should -Be 'Bye Bye NOVAH Remix'
    }
    It 'linha com acento ganha uma busca sem acento' {
      (Parse-Line 'Byørn - 2 LOUD').Queries | Should -Contain 'byorn 2 loud'
    }
    It 'titulo longo sem mix ganha a busca so pelo titulo no fim' {
      (Parse-Line 'Vegas - Invasion Theme').TailQueries | Should -Be @('Invasion Theme')
      (Parse-Line 'Azyr - Power').TailQueries.Count | Should -Be 0
    }
    It 'titulo feito so de palavras vazias ("X") continua exigido' {
      (Parse-Line 'Kobosil - X').BaseTokens | Should -Be @('x')
    }
  }

  Describe 'Tolerancia a grafia' {
    It 'Get-EditDistance conta troca de letras vizinhas como 1' {
      Get-EditDistance 'power' 'pwoer' 2 | Should -Be 1
      Get-EditDistance 'abaddon' 'abbadon' 2 | Should -Be 2
      Get-EditDistance 'kitten' 'sitting' 5 | Should -Be 3
      Get-EditDistance 'abc' 'abcdefgh' 2 | Should -Be 3
    }
    It 'Get-Tolerance: <Word> -> <Tol>' -ForEach @(
      @{ Word = 'abcd'; Tol = 0 }
      @{ Word = 'power'; Tol = 1 }
      @{ Word = 'abaddon'; Tol = 2 }
    ) { Get-Tolerance $Word | Should -Be $Tol }
    It 'aceita erro pequeno com a primeira letra igual' {
      Test-TokenIn 'abaddon' @('abbadon') | Should -BeTrue
      Test-TokenIn 'cthulhu' @('cthulu') | Should -BeTrue
    }
    It 'nao troca a primeira letra (power x tower)' {
      Test-TokenIn 'power' @('tower') | Should -BeFalse
    }
    It 'com -NaoTolerarGrafia exige a palavra exata' {
      $NaoTolerarGrafia = $true
      Test-TokenIn 'abaddon' @('abbadon') | Should -BeFalse
    }
  }

  Describe 'Test-File: conteudo' {
    It 'aceita a faixa certa em FLAC' {
      $r = Test-Arquivo 'Azyr - No Escape' '@@x\Music\Azyr\Azyr - No Escape.flac'
      $r.Tier | Should -Be 0
      $r.Approx | Should -BeNullOrEmpty
    }
    It 'ignora arquivos que nao sao audio' {
      Test-Arquivo 'Azyr - No Escape' 'Azyr\cover.jpg' | Should -BeNullOrEmpty
    }
    It 'recusa previa curta' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.flac' @{ length = 60 }).Reason | Should -Be 'curto demais (previa)'
    }
    It 'recusa arquivo bloqueado' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.flac' @{ Locked = $true }).Reason | Should -Be 'bloqueado pelo usuario'
    }
    It 'recusa titulo diferente' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - Plague.flac').Reason | Should -Be 'titulo diferente'
    }
    It 'recusa quando o artista nao aparece' {
      (Test-Arquivo 'Azyr - No Escape' 'Outro\Fulano - No Escape.flac').Reason | Should -Be 'artista nao aparece'
    }
    It 'aceita o artista na pasta acima do arquivo' {
      (Test-Arquivo 'Azyr - No Escape' 'Music\Azyr\01 No Escape.flac').Tier | Should -Be 0
    }
    It '"RIOTCODE" vale para "RIOT CODE"' {
      (Test-Arquivo 'RIOT CODE - Direct It To The Roof (Azyr Remix)' 'RIOTCODE - Direct It To The Roof (Azyr Remix).flac').Tier | Should -Be 0
    }
    It 'recusa outra versao quando a linha nao pede' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape (Radio Edit).flac').Reason | Should -Match "^outra versao \('(radio|edit)'\)$"
    }
    It 'recusa mix diferente do pedido' {
      (Test-Arquivo 'RIOT CODE - Direct It To The Roof (Azyr Remix)' 'RIOT CODE - Direct It To The Roof (Other Remix).flac').Reason | Should -Be 'mix diferente'
    }
    It 'recusa palavra a mais no titulo ("Azyr - Power" nao aceita "Northern Power")' {
      (Test-Arquivo 'Azyr - Power' 'Azyr - Northern Power.flac').Reason | Should -Be "palavra a mais no titulo: 'northern'"
    }
    It 'com -TituloAproximado aceita a palavra a mais, marcando como aproximado' {
      $TituloAproximado = $true
      $r = Test-Arquivo 'Vendex - Vengeance' 'Vendex - Vengeance Of The Masked.flac'
      $r.Tier | Should -Be 0
      $r.Approx | Should -Be 'Vengeance Of The Masked'
    }
    It 'libera numeros e tons Camelot no titulo' {
      (Test-Arquivo 'Azyr - Paranoia' 'Azyr - Paranoia 5A 160.flac').Tier | Should -Be 0
    }
    It 'tolera erro de grafia no titulo (Abaddon acha Abbadon)' {
      (Test-Arquivo 'Vendex - Abaddon' 'Vendex - Abbadon.flac').Tier | Should -Be 0
    }
    It 'grafia com letras especiais (Byørn acha BYORN)' {
      (Test-Arquivo 'Byørn - 2 LOUD' 'BYORN - 2 LOUD.flac').Tier | Should -Be 0
    }
    It 'artista = remixer aceita qualquer artista original' {
      (Test-Arquivo 'Novah - Bye Bye (NOVAH Remix)' 'Luciid - Bye Bye (NOVAH Remix).flac').Tier | Should -Be 0
    }
    It 'artista dentro do parentese junto com o mix pedido' {
      (Test-Arquivo 'Adrián Mills & Selecta - Orgasm (Klub Mix)' 'La Zowi - Orgasm (Adrián Mills & Selecta Klub Mix).flac').Tier | Should -Be 0
    }
    It 'artista so na pasta e outro artista no nome do arquivo: recusa' {
      (Test-Arquivo 'Novah - ACID' 'Novah Curates Hard Dance\Acid - Marie Vaunt.flac').Reason | Should -Be "outro artista no nome: 'Marie Vaunt'"
    }
    It 'titulo que so aparece colado no nome do artista: recusa (Kobosil - X)' {
      (Test-Arquivo 'Kobosil - X' 'Kobosil\05-kobosil_x_somewhen--hora.flac').Reason | Should -Be 'titulo so aparece junto do nome do artista'
    }
    It 'nomes estilo scene sao separados em trechos' {
      (Test-Arquivo 'Kobosil - While The Stars' '09-kobosil-while_the_stars.flac').Tier | Should -Be 0
    }
    It 'nomes com colchetes sao separados em trechos' {
      (Test-Arquivo 'Vendex - Emotional Khaos' '[01][Vendex][Emotional_Khaos].flac').Tier | Should -Be 0
    }
    It 'da bonus para Original/Extended Mix quando a linha nao pede mix' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape (Extended Mix).flac').Bonus | Should -Be 1
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.flac').Bonus | Should -Be 0
    }
  }

  Describe 'Test-File: formato (conferido por ultimo)' {
    It 'FLAC e WAV sao sempre aceitos (tiers 0 e 1)' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.flac').Tier | Should -Be 0
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.wav').Tier | Should -Be 1
    }
    It 'MP3 320 so com -AceitarMp3320' {
      $r = Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 320 }
      $r.Reason | Should -Be 'mp3 320 kbps (use -AceitarMp3320)'
      $r.Score | Should -Be 4
      $AceitarMp3320 = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 320 }).Tier | Should -Be 3
    }
    It 'MP3 256 so com -AceitarMp3Menor (e -AceitarMp3320 nao basta)' {
      $r = Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 256 }
      $r.Reason | Should -Be 'mp3 256 kbps (use -AceitarMp3Menor)'
      $r.Score | Should -Be 4
      $AceitarMp3320 = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 256 }).Reason | Should -Be 'mp3 256 kbps (use -AceitarMp3Menor)'
      $AceitarMp3320 = $false; $AceitarMp3Menor = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 256 }).Tier | Should -Be 5
    }
    It '-AceitarMp3Menor ja inclui o MP3 320' {
      $AceitarMp3Menor = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 320 }).Tier | Should -Be 3
    }
    It 'MP3 VBR (V0) so com -AceitarMp3Menor' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 240; Vbr = $true }).Reason | Should -Be 'mp3 240 kbps VBR (use -AceitarMp3Menor)'
    }
    It 'MP3 de qualidade baixa e sempre recusado' {
      $AceitarMp3Menor = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ bitRate = 192 }).Reason | Should -Be 'mp3 192 kbps (qualidade baixa)'
    }
    It 'estima o bitrate do MP3 pelo tamanho quando o usuario nao informa' {
      # 300 s a ~330 kbps (audio 320 + capa/tags)
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ size = 12375000 }).Reason | Should -Be 'mp3 320 kbps (use -AceitarMp3320)'
      $AceitarMp3320 = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.mp3' @{ size = 12375000 }).Tier | Should -Be 3
    }
    It 'AIFF so com -AceitarAacAiff' {
      $r = Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.aiff'
      $r.Reason | Should -Be 'formato aiff (use -AceitarAacAiff)'
      $r.Score | Should -Be 4
      $AceitarAacAiff = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.aiff').Tier | Should -Be 2
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.aif').Tier | Should -Be 2
    }
    It 'AAC (m4a/aac) so com -AceitarAacAiff' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.m4a' @{ bitRate = 256 }).Reason | Should -Be 'formato m4a (use -AceitarAacAiff)'
      $AceitarAacAiff = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.m4a' @{ bitRate = 256 }).Tier | Should -Be 4
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.aac' @{ bitRate = 320 }).Tier | Should -Be 4
    }
    It 'AAC de qualidade baixa e recusado mesmo com a opcao' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.m4a' @{ bitRate = 128 }).Reason | Should -Be 'aac 128 kbps (qualidade baixa)'
      $AceitarAacAiff = $true
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.m4a' @{ bitRate = 128 }).Reason | Should -Be 'aac 128 kbps (qualidade baixa)'
    }
    It 'estima o bitrate do AAC pelo tamanho quando o usuario nao informa' {
      $AceitarAacAiff = $true
      # 300 s a ~270 kbps
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.m4a' @{ size = 10125000 }).Tier | Should -Be 4
      # 300 s a ~128 kbps
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.m4a' @{ size = 4800000 }).Reason | Should -Be 'aac 128 kbps (qualidade baixa)'
    }
    It 'prefere FLAC, WAV, AIFF, MP3 320, AAC e MP3 256 nessa ordem (menor tier primeiro)' {
      $FormatoPorTier | Should -Be @('FLAC', 'WAV', 'AIFF', 'MP3 320', 'AAC', 'MP3 256/VBR')
    }
    It 'outros formatos sao recusados' {
      (Test-Arquivo 'Azyr - No Escape' 'Azyr - No Escape.ogg').Reason | Should -Be 'formato ogg'
    }
  }

  Describe 'Get-Candidates' {
    It 'ordena por formato, depois slot livre, fila e velocidade; um arquivo por usuario' {
      $item = [pscustomobject]@{ Req = (Parse-Line 'Azyr - No Escape'); Reasons = @{}; Diag = (New-Object System.Collections.ArrayList) }
      $resp = @(
        [pscustomobject]@{ username = 'wav'; hasFreeUploadSlot = $true; queueLength = 0; uploadSpeed = 9; files = @((New-F 'Azyr - No Escape.wav')) }
        [pscustomobject]@{ username = 'flac-fila'; hasFreeUploadSlot = $false; queueLength = 5; uploadSpeed = 9; files = @((New-F 'Azyr - No Escape.flac')) }
        [pscustomobject]@{ username = 'flac-livre'; hasFreeUploadSlot = $true; queueLength = 0; uploadSpeed = 1; files = @((New-F 'Azyr - No Escape.flac'), (New-F 'Azyr - No Escape (copia).flac')) }
        [pscustomobject]@{ username = 'errado'; hasFreeUploadSlot = $true; queueLength = 0; uploadSpeed = 1; files = @((New-F 'Azyr - Plague.flac')) }
      )
      $c = Get-Candidates $item $resp
      @($c | ForEach-Object User) | Should -Be @('flac-livre', 'flac-fila', 'wav')
      $item.Reasons['titulo diferente'] | Should -Be 1
    }
    It 'manda para o fim o usuario que ja travou 2 vezes' {
      $BadUsers = @{ 'lento' = 2 }
      $item = [pscustomobject]@{ Req = (Parse-Line 'Azyr - No Escape'); Reasons = @{}; Diag = (New-Object System.Collections.ArrayList) }
      $resp = @(
        [pscustomobject]@{ username = 'lento'; hasFreeUploadSlot = $true; queueLength = 0; uploadSpeed = 9; files = @((New-F 'Azyr - No Escape.flac')) }
        [pscustomobject]@{ username = 'ok'; hasFreeUploadSlot = $true; queueLength = 0; uploadSpeed = 1; files = @((New-F 'Azyr - No Escape.wav')) }
      )
      $c = Get-Candidates $item $resp
      @($c | ForEach-Object User) | Should -Be @('ok', 'lento')
    }
  }

  Describe 'Read-Lista' {
    BeforeAll { $tmp = Join-Path ([IO.Path]::GetTempPath()) ("sc-lista-" + [guid]::NewGuid()); New-Item -ItemType Directory -Path $tmp | Out-Null }
    AfterAll { Remove-Item -LiteralPath $tmp -Recurse -Force }

    It 'le .txt ignorando comentarios e linhas em branco, limpando numeracao' {
      $f = Join-Path $tmp 'lista.txt'
      Set-Content -LiteralPath $f -Encoding UTF8 -Value @('# comentario', '', '01. Azyr - No Escape', '  Byørn – 2 LOUD  3:45', '#outra')
      $l = Read-Lista $f
      $l | Should -Be @('Azyr - No Escape', 'Byørn - 2 LOUD')
    }
    It 'le .csv do Exportify (virgula), pega o primeiro artista e converte "Titulo - X Remix"' {
      $f = Join-Path $tmp 'spotify.csv'
      Set-Content -LiteralPath $f -Encoding UTF8 -Value @(
        '"Track URI","Track Name","Artist Name(s)"',
        '"spotify:1","No Escape","Azyr"',
        '"spotify:2","Direct It To The Roof - Azyr Remix","RIOT CODE;Azyr"')
      $l = Read-Lista $f
      $l | Should -Be @('Azyr - No Escape', 'RIOT CODE - Direct It To The Roof (Azyr Remix)')
    }
    It 'le .csv com ponto e virgula e colunas em portugues' {
      $f = Join-Path $tmp 'pt.csv'
      Set-Content -LiteralPath $f -Encoding UTF8 -Value @('Artista;Título', 'Azyr;No Escape')
      $l = Read-Lista $f
      $l | Should -Be @('Azyr - No Escape')
    }
    It 'recusa .csv sem colunas de titulo/artista' {
      $f = Join-Path $tmp 'ruim.csv'
      Set-Content -LiteralPath $f -Encoding UTF8 -Value @('a,b', '1,2')
      { Read-Lista $f } | Should -Throw '*CSV sem colunas*'
    }
  }

  Describe 'Catalogo (MusicBrainz)' {
    BeforeAll {
      function New-Catalogo([string[]]$titulos, [string]$artista = 'Vendex') { @($titulos | ForEach-Object { [pscustomobject]@{ A = $artista; T = $_ } }) }
    }
    It 'Get-CatBase tira mix e parenteses' {
      Get-CatBase 'Vengeance Of The Masked (Original Mix)' | Should -Be 'Vengeance Of The Masked'
      Get-CatBase 'Hora - Extended Mix' | Should -Be 'Hora'
    }
    It 'titulo exato' {
      $r = Find-InCatalog (Parse-Line 'Vendex - Plague') (New-Catalogo @('Plague', 'Abbadon'))
      $r.Kind | Should -Be 'exato'
    }
    It 'corrige grafia (Abaddon -> Abbadon)' {
      $r = Find-InCatalog (Parse-Line 'Vendex - Abaddon') (New-Catalogo @('Abbadon', 'Plague'))
      $r.Kind | Should -Be 'grafia'
      $r.Base | Should -Be 'Abbadon'
    }
    It 'completa titulo incompleto com um unico candidato (Vengeance -> Vengeance Of The Masked)' {
      $r = Find-InCatalog (Parse-Line 'Vendex - Vengeance') (New-Catalogo @('Vengeance Of The Masked', 'Plague'))
      $r.Kind | Should -Be 'completado'
      $r.Base | Should -Be 'Vengeance Of The Masked'
    }
    It 'titulo que nao existe vira "fora", com sugestoes parecidas' {
      $r = Find-InCatalog (Parse-Line 'Vendex - Bloody Angel') (New-Catalogo @('Corrupted Angel', 'Plague'))
      $r.Kind | Should -Be 'fora'
      $r.Sugs | Should -Contain 'Corrupted Angel'
    }
    It 'Esc-Lucene escapa a sintaxe de busca' {
      Esc-Lucene 'AC/DC: Back (In) Black!' | Should -Be 'AC\/DC\: Back \(In\) Black\!'
    }
  }

  Describe 'New-Stages' {
    It 'artista com 2+ faixas na lista: busca o artista primeiro' {
      $req = Parse-Line 'Azyr - No Escape'
      $ArtistLineCount = @{ 'azyr' = 2 }
      $st = New-Stages $req
      $st[0].Kind | Should -Be 'artist'
      $st[1].Q | Should -Be 'Azyr No Escape'
    }
    It 'artista com 1 faixa: busca o artista depois das buscas pela faixa e antes da so pelo titulo' {
      $st = New-Stages (Parse-Line 'Azyr - No Escape')
      @($st | ForEach-Object { "$($_.Kind):$($_.Q)" }) | Should -Be @('q:Azyr No Escape', 'artist:Azyr', 'q:No Escape')
    }
    It '-SemBuscaArtista nao busca o artista' {
      $SemBuscaArtista = $true
      @(New-Stages (Parse-Line 'Azyr - No Escape') | Where-Object { $_.Kind -eq 'artist' }).Count | Should -Be 0
    }
  }

  Describe 'In-Library' {
    It 'acha a faixa pelo indice de artistas, respeitando mix e versao' {
      $e = [pscustomobject]@{ A = 'azyr'; T = 'no escape' }; $e | Add-Member NoteProperty AT 'azyr no escape'
      $r = [pscustomobject]@{ A = 'azyr'; T = 'no escape radio edit' }; $r | Add-Member NoteProperty AT 'azyr no escape radio edit'
      $lib = @{ Index = @{ 'azyr' = [Collections.ArrayList]@($r) }; Count = 1 }
      In-Library $lib (Parse-Line 'Azyr - No Escape') | Should -BeFalse
      [void]$lib.Index['azyr'].Add($e)
      In-Library $lib (Parse-Line 'Azyr - No Escape') | Should -BeTrue
      In-Library $lib (Parse-Line 'Azyr - No Escape (Fulano Remix)') | Should -BeFalse
    }
  }

  Describe 'Read-DotEnv' {
    It 'le chave=valor, ignora comentarios e tira aspas' {
      $f = Join-Path ([IO.Path]::GetTempPath()) ("sc-env-" + [guid]::NewGuid() + '.env')
      Set-Content -LiteralPath $f -Encoding UTF8 -Value @('# comentario', 'A=1', 'B = "dois" ', "C='tres'", 'invalida', '# D=4')
      try {
        $h = Read-DotEnv $f
        $h['A'] | Should -Be '1'; $h['B'] | Should -Be 'dois'; $h['C'] | Should -Be 'tres'
        $h.ContainsKey('D') | Should -BeFalse
      } finally { Remove-Item -LiteralPath $f }
    }
  }
}
