# Asyncat installer — Windows (PowerShell)
# Usage: irm https://asyncat.com/install.ps1 | iex
#        or: .\install.ps1  (from inside the cloned repo)
param(
    [string]$InstallDir = "$env:USERPROFILE\.asyncat"
)

$ErrorActionPreference = "Stop"

function Info  { Write-Host "[asyncat] $args" -ForegroundColor Cyan }
function Ok    { Write-Host "[asyncat] $([char]0x2713) $args" -ForegroundColor Green }
function Warn  { Write-Host "[asyncat] ! $args" -ForegroundColor Yellow }
function Die   { Write-Host "[asyncat] x $args" -ForegroundColor Red; exit 1 }

$REPO_URL  = "https://github.com/asyncat-oss/asyncat-oss.git"
$BinDir    = "$env:USERPROFILE\.local\bin"

Write-Host ""
Write-Host "    /\_____/\ " -ForegroundColor Magenta
Write-Host "   /  o   o  \    asyncat  open-source AI workspace" -ForegroundColor Magenta
Write-Host "  ( ==  ^  == )   ─────────────────────────────────"
Write-Host "   )         (    https://asyncat.com"
Write-Host ""

# ── 1. Node.js v20+ ───────────────────────────────────────────────────────────
Info "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Die "Node.js not found. Install from https://nodejs.org (v20+ required)"
}
$nodeVer   = node -e "process.stdout.write(process.version)"
$nodeMajor = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
if ($nodeMajor -lt 20) { Die "Node.js v20+ required. You have $nodeVer — upgrade at https://nodejs.org" }
Ok "Node.js $nodeVer"

# ── 2. git ────────────────────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "git not found. Install from https://git-scm.com and try again."
}

# ── 3. Clone or update ────────────────────────────────────────────────────────
$gitDir = Join-Path $InstallDir ".git"
if (Test-Path $gitDir) {
    Info "Updating existing install at $InstallDir..."
    git -C $InstallDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { Warn "Could not pull latest — continuing with existing version." }
} else {
    # If running from inside an already-cloned repo, install in-place
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $pkgJson   = Join-Path $scriptDir "package.json"
    if ($scriptDir -and (Test-Path $pkgJson) -and
        (Select-String -Path $pkgJson -Pattern '"asyncat-oss"' -Quiet)) {
        Info "Running from local repo — using $scriptDir"
        $InstallDir = $scriptDir
    } else {
        Info "Cloning asyncat to $InstallDir..."
        git clone --depth=1 $REPO_URL $InstallDir
        if ($LASTEXITCODE -ne 0) { Die "Clone failed. Check your internet connection." }
    }
}
Ok "Source at $InstallDir"

# ── 4. Install all deps (one workspace install from root) ─────────────────────
Info "Installing dependencies..."
Push-Location $InstallDir
npm install --silent
Pop-Location
Ok "Dependencies installed"

# ── 5. First-run .env setup ───────────────────────────────────────────────────
$denEnv  = Join-Path $InstallDir "den\.env"
$nekoEnv = Join-Path $InstallDir "neko\.env"
$denEx   = Join-Path $InstallDir "den\.env.example"
$nekoEx  = Join-Path $InstallDir "neko\.env.example"
if (-not (Test-Path $denEnv)  -and (Test-Path $denEx))  { Copy-Item $denEx  $denEnv;  Warn "Created den\.env  — edit JWT_SECRET before deploying!" }
if (-not (Test-Path $nekoEnv) -and (Test-Path $nekoEx)) { Copy-Item $nekoEx $nekoEnv }

# ── 6. Wire up the asyncat command ────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# PowerShell script — asyncat.ps1
$ps1 = Join-Path $BinDir "asyncat.ps1"
@"
node "$InstallDir\cat" `$args
"@ | Set-Content $ps1

# CMD shim — asyncat.cmd (so it works in cmd.exe and from npm scripts)
$cmd = Join-Path $BinDir "asyncat.cmd"
@"
@echo off
node "$InstallDir\cat" %*
"@ | Set-Content $cmd

Ok "Command ready: asyncat"

# ── 7. Add to PATH ────────────────────────────────────────────────────────────
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$BinDir", "User")
    Warn "Added $BinDir to PATH — restart your terminal for it to take effect."
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  $([char]0x2713)  asyncat installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run it anytime:"
Write-Host "    asyncat              " -NoNewline; Write-Host "open the interactive CLI" -ForegroundColor Cyan
Write-Host "    asyncat start        " -NoNewline; Write-Host "start backend + frontend directly" -ForegroundColor Cyan
Write-Host "    asyncat install      " -NoNewline; Write-Host "set up .env and check llama.cpp" -ForegroundColor Cyan
Write-Host "    asyncat --help       " -NoNewline; Write-Host "see all commands" -ForegroundColor Cyan
Write-Host ""
Write-Host "  First time? Run:  asyncat install"
Write-Host ""
