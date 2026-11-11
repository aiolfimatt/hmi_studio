$backend = Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location backend; npm run dev' -PassThru
$frontend = Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location frontend; npm run dev' -PassThru

Write-Host "Backend PID: $($backend.Id)"
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host "Press Ctrl+C to stop both..."

try {
    Wait-Process -Id $backend.Id, $frontend.Id
} finally {
    if (!$backend.HasExited) { Stop-Process -Id $backend.Id -Force }
    if (!$frontend.HasExited) { Stop-Process -Id $frontend.Id -Force }
}
