# CaptionForge installer for Windows 10 / 11.
# Installs what CaptionForge needs (Node.js, Python, FFmpeg) with winget, sets up the app,
# and puts a "Start CaptionForge" shortcut on your Desktop.
# Compatible with Windows PowerShell 5.1 (built into Windows).
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Say($text) { Write-Host $text -ForegroundColor Cyan }
function Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }
function Ask($question) { $reply = Read-Host "$question [y/N]"; return $reply -match '^[Yy]' }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Has($command) { return [bool](Get-Command $command -ErrorAction SilentlyContinue) }
function Winget-Install($id, $name) {
  Say "Installing $name..."
  winget install --exact --id $id --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "Could not install $name (winget exit $LASTEXITCODE)" }
  Refresh-Path
}

Say "CaptionForge installer for Windows"
Write-Host "Folder: $Root`n"

if (-not (Has 'winget')) {
  Write-Host "winget (App Installer) is required. Install 'App Installer' from the Microsoft Store, then run this again." -ForegroundColor Red
  exit 1
}

# Node.js 20+
$needNode = $true
if (Has 'node') { $major = [int]((node -p "process.versions.node.split('.')[0]")); if ($major -ge 20) { $needNode = $false } }
if ($needNode) { Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js' }
Ok "Node.js $(node --version)"

# Python 3.9+ (the 'py' launcher is installed with it)
$havePython = $false
if (Has 'py') { py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" 2>$null; if ($LASTEXITCODE -eq 0) { $havePython = $true } }
if (-not $havePython) { Winget-Install 'Python.Python.3.12' 'Python' }
Ok "Python $(py -3 --version)"

# FFmpeg + FFprobe
if (-not ((Has 'ffmpeg') -and (Has 'ffprobe'))) { Winget-Install 'Gyan.FFmpeg' 'FFmpeg' }
if (-not (Has 'ffmpeg')) {
  # winget links can need a new session; find the install folder directly
  $bin = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($bin) { $env:Path += ';' + $bin.DirectoryName }
}
Ok "FFmpeg"

# CaptionForge itself
Write-Host ""
npm run setup
if ($LASTEXITCODE -ne 0) { throw "CaptionForge setup failed - see the messages above." }

# Desktop shortcut
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $desktop 'Start CaptionForge.lnk'))
$link.TargetPath = Join-Path $Root 'Start CaptionForge (Windows).bat'
$link.WorkingDirectory = $Root
$link.Description = 'Start CaptionForge and open it in your browser'
$link.Save()
Ok "Shortcut created on your Desktop: Start CaptionForge"

Write-Host "`nAI captions (automatic transcription + translation) are optional: about 1.1 GB."
Write-Host "You can also install them later with the 'Enable AI captions' button inside the app."
if (Ask 'Install AI captions now?') { npm run setup:ai }

Say "`nAll done! Double-click 'Start CaptionForge' on your Desktop any time."
if (Ask 'Start CaptionForge now?') { npm start }
