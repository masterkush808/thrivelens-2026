$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$repo = Split-Path $root -Parent
$python = Join-Path $repo "Training and Validation Model\.venv\Scripts\python.exe"
$serving = Join-Path $repo "serving"

if (-not (Test-Path $python)) {
    throw "VPython not found at $python"
}
if (-not (Test-Path (Join-Path $serving "app\main.py"))) {
    throw "Serving app not found at $serving"
}

$env:THRIVELENS_SERVING_MOCK = if ($env:THRIVELENS_SERVING_MOCK) { $env:THRIVELENS_SERVING_MOCK } else { "1" }
$env:THRIVELENS_SERVING_AUTH = if ($env:THRIVELENS_SERVING_AUTH) { $env:THRIVELENS_SERVING_AUTH } else { "dev" }
$env:THRIVELENS_OFF_ENABLED = if ($env:THRIVELENS_OFF_ENABLED) { $env:THRIVELENS_OFF_ENABLED } else { "1" }

Write-Host ""
Write-Host "ThriveLens serving (mock mode) - press Ctrl+C to stop"
Write-Host "  mock:      $env:THRIVELENS_SERVING_MOCK"
Write-Host "  auth:      $env:THRIVELENS_SERVING_AUTH"
Write-Host "  OFF:       $env:THRIVELENS_OFF_ENABLED  (real Open Food Facts barcode lookups)"
Write-Host "  listening: http://0.0.0.0:8000  (app uses http://192.168.0.101:8000)"
Write-Host ""

& $python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir $serving