param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
try {
    $settings=Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
    $versions=Get-ChildItem -LiteralPath (Join-Path $settings.InstallRoot 'LStyle') -Directory -Force | Where-Object {$_.Name -match '^\d+\.\d+\.\d+\.\d+$'} | Sort-Object {[version]$_.Name} -Descending
    $client=$versions | ForEach-Object {Join-Path $_.FullName 'QyClient.exe'} | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1
    if(-not $client){throw 'Cannot find QyClient.exe in the configured installation.'}
    $task=Get-ScheduledTask -TaskName $settings.TaskName -ErrorAction Stop
    $triggerCount=@($task.Triggers | Where-Object {$null -ne $_}).Count
    if($triggerCount -gt 0){throw 'Unexpected automatic task trigger; reinstall the on-demand task.'}
    if($CheckOnly){[pscustomobject]@{Client=$client;Task=$task.TaskName;TriggerCount=$triggerCount};return}
    if(Test-Path -LiteralPath (Join-Path $root 'STOP')){Remove-Item -LiteralPath (Join-Path $root 'STOP')}
    Start-ScheduledTask -TaskName $settings.TaskName
    $ready=$false
    for($attempt=0;$attempt -lt 40;$attempt++){
        try {
            $state=Get-Content -LiteralPath (Join-Path $root 'guard-ready.json') -Raw | ConvertFrom-Json
            if(((Get-Date).ToUniversalTime()-[datetime]$state.checkedAt).TotalSeconds -lt 8 -and (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)){$ready=$true;break}
        }catch{}
        Start-Sleep -Milliseconds 500
    }
    if(-not $ready){throw 'Guard did not become ready. See guard.log.'}
    $existing=@(Get-Process QyClient -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith($settings.InstallRoot,[StringComparison]::OrdinalIgnoreCase)})
    # Launch on every shortcut activation: the client's single-instance handler
    # brings its existing window back from the tray. Process existence alone
    # does not mean a window is visible. This is the user-requested app window.
    Start-Process -FilePath $client -WorkingDirectory (Split-Path $client) -WindowStyle Normal
    Write-Output 'iQIYI and the on-demand guard are running.'
}catch{
    if($CheckOnly){throw}
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'iQIYI launcher') | Out-Null
    throw
}
