# ===========================================================================
# HMI Studio - portable package builder.
#
# RUN THIS ON YOUR DEV / BUILD MACHINE (needs npm + internet for installs).
# It produces a clean, self-contained portable folder that you copy to the
# production PC. The production PC then only needs node.exe on PATH.
#
#   powershell -ExecutionPolicy Bypass -File package.ps1
#   powershell -ExecutionPolicy Bypass -File package.ps1 -Output D:\builds\hmi -BlankData
#
# What it does:
#   1. backend : npm ci + npm run bundle  (packs the backend + all prod deps into
#                a single file, backend\server.js — no node_modules is shipped)
#   2. frontend: npm ci + vite build  (produces frontend\dist)
#   3. assembles a portable folder with ONLY what the install needs.
# ===========================================================================
param(
    [string]$Output = (Join-Path $PSScriptRoot 'dist-portable'),
    # Omit the data/ folder (ship a blank install: no pages/users/alarms).
    [switch]$BlankData,
    # Do NOT bundle node.exe (use when the target PC already has Node 22+ on PATH).
    [switch]$NoNode,
    # Path to the node.exe to bundle (default: the one building this package).
    [string]$NodeExe
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# 1. Backend: install deps (incl. esbuild) and bundle to a single file --------
Step "Installing backend dependencies + bundling to backend\server.js"
Push-Location (Join-Path $root 'backend')
npm ci
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "backend npm ci failed" }
npm run bundle
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "backend bundle failed" }
Pop-Location

# 2. Frontend build ----------------------------------------------------------
Step "Building frontend"
Push-Location (Join-Path $root 'frontend')
npm ci
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "frontend npm ci failed" }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "frontend build failed" }
Pop-Location

# 3. Assemble the portable folder --------------------------------------------
Step "Assembling portable folder: $Output"
if (Test-Path $Output) { Remove-Item $Output -Recurse -Force }
New-Item -ItemType Directory -Path $Output | Out-Null

# backend: ONLY the single bundled file (no node_modules, no src). Then
# frontend/dist, config, start scripts, docs.
New-Item -ItemType Directory -Path (Join-Path $Output 'backend') | Out-Null
Copy-Item (Join-Path $root 'backend\server.js') (Join-Path $Output 'backend\server.js')
New-Item -ItemType Directory -Path (Join-Path $Output 'frontend') | Out-Null
Copy-Item (Join-Path $root 'frontend\dist') (Join-Path $Output 'frontend\dist') -Recurse
Copy-Item (Join-Path $root 'config')        (Join-Path $Output 'config') -Recurse
foreach ($f in 'start.bat','start.ps1','install-autostart.ps1','DEPLOY.md') {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $Output $f) }
}

# data/ : ship the configured project but strip volatile runtime state so the
# install starts from a clean operational slate (batch/monitor state rebuild
# on first run). Use -BlankData for a project-less install.
if (-not $BlankData) {
    Copy-Item (Join-Path $root 'data') (Join-Path $Output 'data') -Recurse
    $volatile = 'logs','batch_archive','monitor_state.json','monitor_state.bak',
                'batch_local.json','batch_local.bak','pg_trace_buffer.jsonl',
                'influx_buffer.jsonl'
    foreach ($v in $volatile) {
        $p = Join-Path $Output "data\$v"
        if (Test-Path $p) { Remove-Item $p -Recurse -Force }
    }
} else {
    New-Item -ItemType Directory -Path (Join-Path $Output 'data') | Out-Null
}

# node.exe : bundle a standalone Node so the target PC needs nothing installed.
# On Windows node.exe is self-contained (no sidecar DLLs), so one file suffices.
# The start scripts prefer node\node.exe over PATH.
if (-not $NoNode) {
    $nodeSrc = if ($NodeExe) { $NodeExe } else { (Get-Command node -ErrorAction SilentlyContinue).Source }
    if ($nodeSrc -and (Test-Path $nodeSrc)) {
        New-Item -ItemType Directory -Path (Join-Path $Output 'node') | Out-Null
        Copy-Item $nodeSrc (Join-Path $Output 'node\node.exe')
        $ver = & $nodeSrc --version
        Write-Host "Bundled node.exe ($ver) from $nodeSrc" -ForegroundColor Green
    } else {
        Write-Warning "node.exe not found to bundle; the target PC will need Node 22+ on PATH. (Pass -NodeExe <path>, or -NoNode to silence.)"
    }
}

Write-Host "`nPortable package ready: $Output" -ForegroundColor Green
Write-Host "Copy that folder to the production PC and run start.bat (or start.ps1)." -ForegroundColor Green
Write-Host "REMINDER: edit config\conf.json on the production copy - set jwt_secret and DB credentials." -ForegroundColor Yellow
