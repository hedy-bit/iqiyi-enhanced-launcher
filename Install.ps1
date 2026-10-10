$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$node=(Get-Command node -ErrorAction Stop).Source
$nodeMajor=[int]((& $node -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1)
if($nodeMajor -lt 22){throw 'Node.js 22 or newer is required.'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$config=@{
    Node=$node
    InstallRoot='D:\Program Files\IQIYI Video\'
    UserRoot=(Join-Path $env:APPDATA 'IQIYI Video\')
    TaskName='IQIYI-Local-Logo-Guard'
    PriorBackup=(Join-Path (Split-Path $root -Parent) 'iqiyi-update-backup-20260915')
}
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'config.json') -Encoding UTF8
if(Test-Path -LiteralPath (Join-Path $root 'STOP')){Remove-Item -LiteralPath (Join-Path $root 'STOP')}
$taskExe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action=New-ScheduledTaskAction -Execute $taskExe -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Guard.ps1')+'"') -WorkingDirectory $root
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Highest
$options=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $config.TaskName -Action $action -Principal $principal -Settings $options -Description 'On-demand iQIYI guard, started by Launch-Iqiyi.ps1. No Windows logon trigger.' -Force | Out-Null
Write-Output 'Installed on-demand IQIYI-Local-Logo-Guard. Use Launch-Iqiyi.ps1 to start playback with the guard.'
