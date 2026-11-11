@echo off
REM ---------------------------------------------------------------------------
REM HMI Studio - portable start script.
REM Launches the single backend process, which also serves the built frontend
REM (frontend\dist) on the configured backend_port (default 3100).
REM
REM Uses a node.exe bundled in this folder if present (node\node.exe, then a
REM node.exe in this folder); otherwise falls back to node.exe on PATH. So the
REM target PC does NOT need Node installed when the package ships its own.
REM ---------------------------------------------------------------------------
set "NODE_EXE=node"
if exist "%~dp0node.exe" set "NODE_EXE=%~dp0node.exe"
if exist "%~dp0node\node.exe" set "NODE_EXE=%~dp0node\node.exe"

cd /d "%~dp0backend"
"%NODE_EXE%" server.js
REM Window stays open on exit so the operator can read any error.
pause
