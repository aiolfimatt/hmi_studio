# ===========================================================================
# HMI Studio - auto-start installer (RUN THIS ON THE PRODUCTION PC).
#
# Registers a Windows Scheduled Task that launches start.ps1 (the auto-restart
# supervisor) so the HMI comes up by itself. No Windows service needed.
#
#   # Start when the current user logs on (default; runs in the user session,
#   # shows the console window, uses the user's PATH):
#   powershell -ExecutionPolicy Bypass -File install-autostart.ps1
#
#   # Start at boot before any login (runs as SYSTEM, no visible window):
#   #   must be run from an elevated (Administrator) PowerShell:
#   powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -AtStartup
#
#   # Remove the task:
#   powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Uninstall
# ===========================================================================
param(
    [switch]$AtStartup,   # trigger at machine boot (SYSTEM) instead of at logon
    [switch]$Uninstall,   # remove the task and exit
    [string]$TaskName = 'HMI Studio'
)
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$start = Join-Path $root 'start.ps1'

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[autostart] removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "[autostart] no scheduled task '$TaskName' found." -ForegroundColor Yellow
    }
    return
}

if (-not (Test-Path $start)) { throw "start.ps1 not found next to this script ($start)" }

# Launch the auto-restart supervisor minimized so it keeps the HMI alive.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$start`"" `
    -WorkingDirectory $root

# Keep the task itself running indefinitely and let Windows relaunch it if it
# ever stops unexpectedly (belt-and-suspenders with start.ps1's own loop).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

if ($AtStartup) {
    # Boot-time, before any user logs on: run as SYSTEM. Requires elevation.
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal `
        -Description 'HMI Studio - start the backend (serves UI + API) at boot.' -Force | Out-Null
    Write-Host "[autostart] registered '$TaskName' to run at STARTUP as SYSTEM." -ForegroundColor Green
    Write-Host "            (headless - browse to http://localhost:3100/ after boot)" -ForegroundColor Green
} else {
    # Logon of the current user: runs in their session with a visible console.
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -RunLevel Limited `
        -Description 'HMI Studio - start the backend (serves UI + API) at logon.' -Force | Out-Null
    Write-Host "[autostart] registered '$TaskName' to run AT LOGON of $env:USERNAME." -ForegroundColor Green
}

Write-Host "Start it now without rebooting:  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Cyan
