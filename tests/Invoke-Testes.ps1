<#
  Roda os testes do PowerShell (Pester 5+).

    powershell -File tests\Invoke-Testes.ps1                 # todos (integracao precisa do Node.js)
    powershell -File tests\Invoke-Testes.ps1 -SemIntegracao  # so os rapidos
    pwsh -File tests/Invoke-Testes.ps1 -CI                   # saida detalhada + resultado em NUnit XML

  Sai com o numero de testes que falharam (0 = tudo certo).
#>
param(
  [switch]$SemIntegracao,
  [switch]$CI
)
$ErrorActionPreference = 'Stop'
Import-Module Pester -MinimumVersion 5.5.0

$c = New-PesterConfiguration
$c.Run.Path = $PSScriptRoot
$c.Run.PassThru = $true
$c.Output.Verbosity = $(if ($CI) { 'Detailed' } else { 'Normal' })
if ($SemIntegracao) { $c.Filter.ExcludeTag = 'Integracao' }
if ($CI) {
  $c.TestResult.Enabled = $true
  $c.TestResult.OutputFormat = 'NUnitXml'
  $c.TestResult.OutputPath = Join-Path $PSScriptRoot "resultado-pester-$($PSVersionTable.PSEdition).xml"
}
$r = Invoke-Pester -Configuration $c
Write-Host ("PowerShell {0} ({1}): {2} ok, {3} falharam, {4} pulados" -f $PSVersionTable.PSVersion, $PSVersionTable.PSEdition, $r.PassedCount, $r.FailedCount, $r.SkippedCount)
exit $r.FailedCount
