$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$config=Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
New-Item -ItemType File -Path (Join-Path $root 'STOP') -Force | Out-Null
Start-Sleep -Seconds 3
Stop-ScheduledTask -TaskName $config.TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $config.TaskName -Confirm:$false -ErrorAction SilentlyContinue
foreach($p in Get-CimInstance Win32_Process -Filter "Name='node.exe'"){
    if($p.CommandLine -and $p.CommandLine.Contains((Join-Path $root 'guard.mjs'))){Stop-Process -Id $p.ProcessId -ErrorAction SilentlyContinue}
}
& $config.Node (Join-Path $root 'guard.mjs') --restore
function Restore-Flag([string]$Path,[string]$Section,[string]$Key,[string]$Value){
    if(-not(Test-Path -LiteralPath $Path)){return}
    $enc=[Text.Encoding]::GetEncoding(28591)
    $text=$enc.GetString([IO.File]::ReadAllBytes($Path))
    $m=[regex]::Match($text,'(?ms)(^\['+[regex]::Escape($Section)+'\][^\r\n]*\r?\n)(.*?)(?=^\[|\z)')
    if(-not $m.Success){return}
    $body=$m.Groups[2].Value
    $pattern='(?m)^'+[regex]::Escape($Key)+'=[^\r\n]*(?:\r?\n)?'
    if($null -eq $Value -or $Value -eq ''){$body=[regex]::Replace($body,$pattern,'')}
    elseif([regex]::IsMatch($body,$pattern)){$body=[regex]::Replace($body,$pattern,$Key+'='+$Value+"`r`n")}
    else{$body+=$Key+'='+$Value+"`r`n"}
    $next=$text.Substring(0,$m.Groups[2].Index)+$body+$text.Substring($m.Groups[2].Index+$m.Groups[2].Length)
    [IO.File]::WriteAllBytes($Path,$enc.GetBytes($next))
}
Restore-Flag (Join-Path $config.UserRoot 'LStyle\PPStream.ini') 'update' 'auto_update' '1'
Restore-Flag (Join-Path $config.UserRoot 'LStyle\PPStream.ini') 'main' 'lwa_disable_update' '0'
Restore-Flag (Join-Path $config.UserRoot 'LStyle\PPStream.ini') 'main' 'lwa_disable_repalce_update' '0'
Restore-Flag (Join-Path $config.UserRoot 'PluginConfig\Browser.ini') 'Default' 'remote_debugging' ''
$manifest=Join-Path $config.PriorBackup 'disabled-files.json'
if(Test-Path -LiteralPath $manifest){
    foreach($entry in (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)){
        $allowed=$entry.Original.StartsWith($config.InstallRoot,[StringComparison]::OrdinalIgnoreCase) -or $entry.Original.StartsWith($config.UserRoot,[StringComparison]::OrdinalIgnoreCase)
        if(-not $allowed -or $entry.Disabled -ne ($entry.Original+'.disabled-by-user')){throw 'Unexpected restore path.'}
        if((Test-Path -LiteralPath $entry.Disabled) -and -not(Test-Path -LiteralPath $entry.Original)){
            Move-Item -LiteralPath $entry.Disabled -Destination $entry.Original
        }
    }
}
Set-Service -Name QiyiService -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name QiyiService -ErrorAction SilentlyContinue
Write-Output 'Restored automatic updates and watermark. Restart iQIYI to close its local debugging port. Backups and logs are retained.'
