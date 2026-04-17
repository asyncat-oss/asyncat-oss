# Asyncat installer — Windows (PowerShell)
# Usage: irm https://your-host/install.ps1 | iex
#        or: .\install.ps1  (if you already have the repo)
param(
    [string]$InstallDir = "$env:USERPROFILE\.asyncat"
)

$ErrorActionPreference = "Stop"

function Info  { Write-Host "[asyncat] $args" -ForegroundColor Cyan }
function Ok    { Write-Host "[asyncat] ✓ $args" -ForegroundColor Green }
function Warn  { Write-Host "[asyncat] ⚠ $args" -ForegroundColor Yellow }
function Die   { Write-Host "[asyncat] ✗ $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  🐱  Asyncat Installer (Windows)" -ForegroundColor Cyan
Write-Host "  ───────────────────────────────"
Write-Host ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
Info "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Die "Node.js is not installed. Download it from https://nodejs.org (v18+ required)"
}
$nodeVersion = node -e "process.stdout.write(process.version)"
$nodeMajor   = [int]($nodeVersion -replace 'v(\d+)\..*','$1')
if ($nodeMajor -lt 18) { Die "Node.js v18+ required. You have $nodeVersion" }
Ok "Node.js $nodeVersion"

# ── 2. Clone or use existing repo ─────────────────────────────────────────────
$REPO_URL = "https://github.com/yourusername/asyncat-oss.git"   # TODO: real URL

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgJson   = Join-Path $scriptDir "package.json"
if ($scriptDir -and (Test-Path $pkgJson) -and (Select-String -Path $pkgJson -Pattern '"asyncat"' -Quiet)) {
    Info "Running from local repo — using $scriptDir"
    $InstallDir = $scriptDir
} elseif (Test-Path (Join-Path $InstallDir ".git")) {
    Info "Updating existing install at $InstallDir ..."
    git -C $InstallDir pull --ff-only
} else {
    Info "Cloning Asyncat to $InstallDir ..."
    git clone $REPO_URL $InstallDir
    if ($LASTEXITCODE -ne 0) { Die "Clone failed. Check your internet connection." }
}
Ok "Source at $InstallDir"

# ── 3. Install dependencies ───────────────────────────────────────────────────
Info "Installing backend dependencies..."
Push-Location (Join-Path $InstallDir "den")
npm install --silent
Pop-Location
Ok "Backend deps installed"

Info "Installing frontend dependencies..."
Push-Location (Join-Path $InstallDir "neko")
npm install --silent
Pop-Location
Ok "Frontend deps installed"

# ── 4. First-run setup ────────────────────────────────────────────────────────
$denEnv = Join-Path $InstallDir "den\.env"
if (-not (Test-Path $denEnv)) {
    Info "Creating default .env ..."
    @"
PORT=3000
NODE_ENV=development
JWT_SECRET=changeme_use_a_long_random_string
LLAMA_SERVER_PORT=8765
"@ | Set-Content $denEnv
    Warn ".env created — edit JWT_SECRET before running in production!"
}

# ── 5. Create launcher script ─────────────────────────────────────────────────
$launcherDir = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force -Path $launcherDir | Out-Null

$launcher = Join-Path $launcherDir "asyncat.ps1"
@"
# Asyncat launcher
`$ASYNCAT_DIR = "$InstallDir"

Write-Host "🐱 Starting Asyncat..." -ForegroundColor Cyan
Write-Host "   Backend  → http://localhost:3000"
Write-Host "   Frontend → http://localhost:5173"
Write-Host "   Press Ctrl+C to stop."
Write-Host ""

`$den  = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '`$ASYNCAT_DIR\den'; npm run dev" -PassThru
Start-Sleep -Seconds 2
`$neko = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '`$ASYNCAT_DIR\neko'; npm run dev" -PassThru
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host "Asyncat running. Close the terminal windows to stop." -ForegroundColor Green
"@ | Set-Content $launcher

# Also create a .cmd shim so it works from cmd.exe
$shim = Join-Path $launcherDir "asyncat.cmd"
@"
@echo off
powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\.local\bin\asyncat.ps1"
"@ | Set-Content $shim

Ok "Launcher created — run 'asyncat' from any terminal"

# ── 6. Add to PATH ────────────────────────────────────────────────────────────
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$launcherDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$launcherDir", "User")
    Warn "Added $launcherDir to PATH — restart your terminal for it to take effect"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ✓ Asyncat installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run it anytime with:"
Write-Host "    asyncat" -ForegroundColor Cyan
Write-Host ""
