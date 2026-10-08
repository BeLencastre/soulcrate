#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }
<#
  Regras de codificacao dos arquivos do repositorio.
  O Windows PowerShell 5.1 le .ps1 sem BOM como ANSI: "Byørn" vira "ByÃ¸rn" e o script quebra
  em silencio. O cmd.exe nao entende UTF-8 em .bat.
#>

BeforeDiscovery {
  $raiz = Split-Path -Parent $PSScriptRoot
  $ignorar = '\\(node_modules|\.git|app\\out|app\\dist|music|downloads|incomplete|navidrome|soulbeet\\data|slskd\\data|lotes)\\'
  $Scripts = @(Get-ChildItem -Path $raiz -Recurse -File -Include '*.ps1', '*.psm1' | Where-Object { $_.FullName -notmatch $ignorar } |
    ForEach-Object { @{ Nome = $_.FullName.Substring($raiz.Length + 1); Caminho = $_.FullName } })
  $Bats = @(Get-ChildItem -Path $raiz -File -Filter '*.bat' | ForEach-Object { @{ Nome = $_.Name; Caminho = $_.FullName } })
}

Describe 'Codificacao dos arquivos' {
  It '<Nome>: com acentos, precisa de BOM UTF-8' -ForEach $Scripts {
    $b = [IO.File]::ReadAllBytes($Caminho)
    $temBom = ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF)
    $naoAscii = @($b | Where-Object { $_ -gt 127 }).Count -gt 0
    if ($naoAscii) { $temBom | Should -BeTrue -Because 'o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI' }
  }
  It '<Nome>: so ASCII' -ForEach $Bats {
    @([IO.File]::ReadAllBytes($Caminho) | Where-Object { $_ -gt 127 }).Count | Should -Be 0
  }
}
