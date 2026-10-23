$ErrorActionPreference = 'Stop'
$previewUrl = 'http://127.0.0.1:4173'
$previewReady = $false
try {
    $previewResponse = Invoke-RestMethod -Uri "$previewUrl/api/health" -TimeoutSec 2
    $previewReady = $previewResponse.app -eq 'campus-agent' -and $previewResponse.version -eq 2
} catch {}
if ($previewReady) {
    Start-Process $previewUrl
    Write-Host 'Campus Agent is already running. You can close this window.'
    exit 0
}
$previewNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($previewNodeCommand) {
    $previewNode = $previewNodeCommand.Source
} else {
    $previewNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $previewNode)) {
    Write-Host 'Node.js 22 or newer is required. This version needs the local backend.'
    exit 1
}
Write-Host 'Opening Campus Agent at http://127.0.0.1:4173'
Write-Host 'Keep this window open while using the prototype. Press Ctrl+C to stop.'
& $previewNode (Join-Path $PSScriptRoot 'server.cjs') --open
