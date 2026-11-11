# ---------------------------------------------------------------------------
# HMI Studio - portable start script (with auto-restart).
#
# Launches the single backend process, which also serves the built frontend
# (frontend\dist) on the configured backend_port (default 3100). The backend
# exits non-zero on an uncaught exception by design, expecting a supervisor to
# restart it; this loop is that supervisor for a portable install.
#
# Uses a node.exe bundled in this folder if present (node\node.exe, then a
# node.exe in this folder); otherwise falls back to node.exe on PATH. So the
# target PC does NOT need Node installed when the package ships its own.
#
# Run:  powershell -ExecutionPolicy Bypass -File start.ps1
# Stop with Ctrl+C.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'

# Prefer a bundled node.exe (node\node.exe, then .\node.exe), else PATH.
$node = 'node'
if (Test-Path (Join-Path $PSScriptRoot 'node.exe'))      { $node = Join-Path $PSScriptRoot 'node.exe' }
if (Test-Path (Join-Path $PSScriptRoot 'node\node.exe')) { $node = Join-Path $PSScriptRoot 'node\node.exe' }
Write-Host "[start] using node: $node" -ForegroundColor DarkGray

while ($true) {
    Write-Host "[start] launching HMI Studio backend..." -ForegroundColor Cyan
    & $node (Join-Path $backend 'server.js')
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Write-Host "[start] backend exited cleanly (0). Stopping." -ForegroundColor Green
        break
    }
    Write-Host "[start] backend exited with code $code - restarting in 3s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}
