param(
  [string]$TaskName = "Conrad HK Automation",
  [string]$ConfigPath = "$PSScriptRoot\config.local.json"
)

$ErrorActionPreference = "Stop"
$runner = Resolve-Path (Join-Path $PSScriptRoot "run-once-hidden.vbs")
$workdir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$config = Resolve-Path $ConfigPath
$action = "wscript.exe //B `"$runner`""

schtasks.exe /Create /F /TN $TaskName /SC MINUTE /MO 15 /TR $action /ST 00:00 /RL LIMITED | Out-Null
Write-Host "Zainstalowano zadanie: $TaskName"
Write-Host "Folder projektu: $workdir"
Write-Host "Konfiguracja: $config"
