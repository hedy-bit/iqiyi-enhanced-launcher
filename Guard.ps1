param([switch]$Once)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$settings=Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$mutex=[Threading.Mutex]::new($false,'Local\HedyIqiyiLogoGuardV1')
if(-not $mutex.WaitOne(0)){exit 0}
$runtime=$null
$startedAt=Get-Date
$lastClientSeen=$null
function Write-GuardLog([string]$Message) {
    $log=Join-Path $root 'guard.log'
    if((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB){Move-Item -LiteralPath $log -Destination ($log+'.previous') -Force}
    Add-Content -LiteralPath $log -Value ((Get-Date -Format o)+' '+$Message) -Encoding UTF8
}
function Set-IniFlag([string]$Path,[string]$Section,[string]$Key,[string]$Value){
    if(-not(Test-Path -LiteralPath $Path)){return}
    $bytes=[IO.File]::ReadAllBytes($Path)
    $enc=[Text.Encoding]::GetEncoding(28591)
    $text=$enc.GetString($bytes)
    $pattern='(?ms)(^\['+[regex]::Escape($Section)+'\][^\r\n]*\r?\n)(.*?)(?=^\[|\z)'
    $match=[regex]::Match($text,$pattern)
    if(-not $match.Success){return}
    $body=$match.Groups[2].Value
    $line='(?m)^'+[regex]::Escape($Key)+'=[^\r\n]*'
    $updated=if([regex]::IsMatch($body,$line)){[regex]::Replace($body,$line,$Key+'='+$Value)}else{$Key+'='+$Value+"`r`n"+$body}
    if($updated -ne $body){
        $next=$text.Substring(0,$match.Groups[2].Index)+$updated+$text.Substring($match.Groups[2].Index+$body.Length)
        [IO.File]::WriteAllBytes($Path,$enc.GetBytes($next))
    }
}
try {
    Write-GuardLog 'Guard started.'
    do {
        try {
            if(Test-Path -LiteralPath (Join-Path $root 'STOP')){break}
            $clients=@(Get-Process -Name QyClient -ErrorAction SilentlyContinue | Where-Object {$_.Path -and $_.Path.StartsWith($settings.InstallRoot,[StringComparison]::OrdinalIgnoreCase)})
            if($clients.Count){$lastClientSeen=Get-Date}
            elseif($lastClientSeen -and ((Get-Date)-$lastClientSeen).TotalSeconds -gt 30){Write-GuardLog 'iQIYI exited; stopping on-demand guard.';break}
            elseif(-not $lastClientSeen -and ((Get-Date)-$startedAt).TotalSeconds -gt 90){Write-GuardLog 'No iQIYI process started; stopping on-demand guard.';break}
            $svc=Get-Service -Name QiyiService -ErrorAction SilentlyContinue
            if($svc){
                if($svc.StartType -ne 'Disabled'){Set-Service -Name QiyiService -StartupType Disabled;Write-GuardLog 'Disabled update service.'}
                if($svc.Status -ne 'Stopped'){Stop-Service -Name QiyiService -Force;Write-GuardLog 'Stopped update service.'}
            }
            foreach($process in Get-Process -Name 'QyUpdate','QyUpdateD','IQIYIsetup_update*' -ErrorAction SilentlyContinue){
                $path=$process.Path
                if($path -and ($path.StartsWith($settings.InstallRoot,[StringComparison]::OrdinalIgnoreCase) -or $path.StartsWith($settings.UserRoot,[StringComparison]::OrdinalIgnoreCase))){
                    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
                    Write-GuardLog ('Stopped automatic updater: '+$process.ProcessName)
                }
            }
            Set-IniFlag (Join-Path $settings.UserRoot 'LStyle\PPStream.ini') 'update' 'auto_update' '0'
            Set-IniFlag (Join-Path $settings.UserRoot 'LStyle\PPStream.ini') 'main' 'lwa_disable_update' '1'
            Set-IniFlag (Join-Path $settings.UserRoot 'LStyle\PPStream.ini') 'main' 'lwa_disable_repalce_update' '1'
            Set-IniFlag (Join-Path $settings.UserRoot 'PluginConfig\Browser.ini') 'Default' 'remote_debugging' '1'
            if(-not $Once -and ($null -eq $runtime -or $runtime.HasExited)){
                $runtime=Start-Process -FilePath $settings.Node -ArgumentList ('"'+(Join-Path $root 'guard.mjs')+'"') -WindowStyle Hidden -PassThru
                Write-GuardLog ('Runtime worker started: '+$runtime.Id)
            }
            @{pid=$PID;checkedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'guard-ready.json') -Encoding UTF8
        }catch{Write-GuardLog ('ERROR: '+$_.Exception.Message)}
        if(-not $Once){Start-Sleep -Seconds 2}
    }while(-not $Once)
}finally{
    if($runtime -and -not $runtime.HasExited){Stop-Process -Id $runtime.Id -ErrorAction SilentlyContinue}
    $mutex.ReleaseMutex();$mutex.Dispose()
}
