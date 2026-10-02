# CaptionForge launcher for Windows: starts the bundled local server and opens the browser.
# A small window offers "Open in Browser" and "Quit CaptionForge".
$ErrorActionPreference = 'Stop'
$R = $PSScriptRoot
$Port = if ($env:CAPTIONFORGE_PORT) { $env:CAPTIONFORGE_PORT } else { '8765' }
$Url = "http://127.0.0.1:$Port"
$Logs = Join-Path $env:APPDATA 'CaptionForge\logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

$env:Path = "$R\node\bin;$R\ffmpeg;$env:SystemRoot\System32;$env:SystemRoot"
$env:PYTHONPATH = "$R\api"
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:CAPTIONFORGE_STATIC = "$R\web"
$env:CAPTIONFORGE_RENDERER = "$R\rendering"
$env:CAPTIONFORGE_AI_WORKERS = "$R\ai-worker"
$env:CAPTIONFORGE_BUNDLED_PYTHON = "$R\python\python.exe"

function Test-Running { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$Url/api/health").StatusCode -eq 200 } catch { $false } }

if (Test-Running) { Start-Process $Url; exit 0 }

$server = Start-Process -FilePath "$R\python\python.exe" -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', $Port `
  -WorkingDirectory "$R\api" -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "$Logs\app.log" -RedirectStandardError "$Logs\app-errors.log"

$ready = $false
for ($i = 0; $i -lt 120; $i++) { if (Test-Running) { $ready = $true; break }; Start-Sleep -Milliseconds 500 }
Add-Type -AssemblyName System.Windows.Forms
if (-not $ready) {
  [System.Windows.Forms.MessageBox]::Show("CaptionForge could not start. See $Logs", 'CaptionForge', 'OK', 'Error') | Out-Null
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
  exit 1
}
Start-Process $Url
while (-not $server.HasExited) {
  $answer = [System.Windows.Forms.MessageBox]::Show("CaptionForge is running at $Url`n`nYes = open it in the browser`nNo = quit CaptionForge", 'CaptionForge', 'YesNo', 'Information')
  if ($answer -eq 'No') { break }
  Start-Process $Url
}
Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
