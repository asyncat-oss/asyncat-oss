# Asyncat installer - Windows (PowerShell)
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
$DEN_PORT  = 8716
$NEKO_PORT = 8717

Write-Host ""
Write-Host "    /\_____/\ " -ForegroundColor Magenta
Write-Host "   /  o   o  \    asyncat  open-source AI workspace" -ForegroundColor Magenta
Write-Host "  ( ==  ^  == )   ---------------------------------"
Write-Host "   )         (    https://asyncat.com"
Write-Host ""

# -- 1. Node.js v20+ -----------------------------------------------------------
Info "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Die "Node.js not found. Install from https://nodejs.org (v20+ required)"
}
$nodeVer   = node -e "process.stdout.write(process.version)"
$nodeMajor = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
if ($nodeMajor -lt 20) { Die "Node.js v20+ required. You have $nodeVer - upgrade at https://nodejs.org" }
Ok "Node.js $nodeVer"

# -- 2. git --------------------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "git not found. Install from https://git-scm.com and try again."
}

# -- 3. Clone or update --------------------------------------------------------
$gitDir = Join-Path $InstallDir ".git"
if (Test-Path $gitDir) {
    Info "Updating existing install at $InstallDir..."
    git -C $InstallDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { Warn "Could not pull latest - continuing with existing version." }
} else {
    # If running from inside an already-cloned repo, install in-place
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $pkgJson   = Join-Path $scriptDir "package.json"
    if ($scriptDir -and (Test-Path $pkgJson) -and
        (Select-String -Path $pkgJson -Pattern '"asyncat-oss"' -Quiet)) {
        Info "Running from local repo - using $scriptDir"
        $InstallDir = $scriptDir
    } else {
        Info "Cloning asyncat to $InstallDir..."
        git clone --depth=1 $REPO_URL $InstallDir
        if ($LASTEXITCODE -ne 0) { Die "Clone failed. Check your internet connection." }
    }
}
Ok "Source at $InstallDir"

# -- 4. Install all deps (one workspace install from root) ---------------------
Info "Installing dependencies..."
Push-Location $InstallDir
npm install --silent
Pop-Location
Ok "Dependencies installed"

# -- 5. Build the frontend for production ---------------------------------------
Info "Building frontend..."
Push-Location $InstallDir
npm run build -w neko
Pop-Location
Ok "Frontend built"

# -- 6. First-run .env setup ---------------------------------------------------
$denEnv  = Join-Path $InstallDir "den\.env"
$nekoEnv = Join-Path $InstallDir "neko\.env"
$denEx   = Join-Path $InstallDir "den\.env.example"
$nekoEx  = Join-Path $InstallDir "neko\.env.example"
if (-not (Test-Path $denEnv)  -and (Test-Path $denEx))  { Copy-Item $denEx  $denEnv;  Warn "Created den\.env  - edit JWT_SECRET before deploying!" }
if (-not (Test-Path $nekoEnv) -and (Test-Path $nekoEx)) { Copy-Item $nekoEx $nekoEnv }

# -- 7. Wire up the asyncat command --------------------------------------------
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# PowerShell script - asyncat.ps1
$ps1 = Join-Path $BinDir "asyncat.ps1"
@"
node "$InstallDir\cat" `$args
"@ | Set-Content $ps1

# CMD shim - asyncat.cmd (so it works in cmd.exe and from npm scripts)
$cmd = Join-Path $BinDir "asyncat.cmd"
@"
@echo off
node "$InstallDir\cat" %*
"@ | Set-Content $cmd

Ok "Command ready: asyncat"

# -- 8. Add to PATH ------------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$BinDir", "User")
    Warn "Added $BinDir to PATH - restart your terminal for it to take effect."
}

# -- 9. Copy all PWA icons to system locations ---------------------------------
Info "Installing icons..."

$iconSrcDir = Join-Path $InstallDir "neko\public"
$iconDestDir = Join-Path $env:LOCALAPPDATA "asyncat-icons"
New-Item -ItemType Directory -Force -Path $iconDestDir | Out-Null

# All PWA icon sizes
$pwaIcons = @(
    "pwa-72x72.png",
    "pwa-96x96.png",
    "pwa-128x128.png",
    "pwa-144x144.png",
    "pwa-152x152.png",
    "pwa-192x192.png",
    "pwa-384x384.png",
    "pwa-512x512.png"
)

foreach ($icon in $pwaIcons) {
    $src = Join-Path $iconSrcDir $icon
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $iconDestDir $icon) -Force
    }
}

# Also copy main icon and SVG
$mainIcon = Join-Path $iconSrcDir "pwa-192x192.png"
$svgIcon = Join-Path $iconSrcDir "cat.svg"
if (Test-Path $mainIcon) { Copy-Item $mainIcon (Join-Path $iconDestDir "asyncat.png") -Force }
if (Test-Path $svgIcon) { Copy-Item $svgIcon (Join-Path $iconDestDir "cat.svg") -Force }

Ok "Icons installed"

# -- 10. Desktop launcher (for humans) ------------------------------------------
$uiScript = Join-Path $BinDir "asyncat-ui.ps1"
$iconSrc = Join-Path $InstallDir "neko\public\pwa-192x192.png"

@"
# asyncat-ui - Start services + open as native app window

`$InstallDir = "$InstallDir"
`$BinDir = "$BinDir"
`$NEKO_DIST = Join-Path `$InstallDir "neko\dist"
`$DEN_PORT = $DEN_PORT
`$NEKO_PORT = $NEKO_PORT

# Check if den backend is already running
try {
    `$null = Invoke-WebRequest "http://localhost:`$DEN_PORT/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
    `$denRunning = `$true
} catch { `$denRunning = `$false }

if (-not `$denRunning) {
    Write-Host "[asyncat] Starting backend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-WindowStyle Hidden -NoExit -Command `"cd '\`$InstallDir'; node den/src/index.js`"" -NoNewWindow
    # Wait for den to start
    for (`$i = 0; `$i -lt 30; `$i++) {
        try {
            `$null = Invoke-WebRequest "http://localhost:`$DEN_PORT/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            break
        } catch { Start-Sleep 0.5 }
    }
}

# Check if frontend is already running
try {
    `$null = Invoke-WebRequest "http://localhost:`$NEKO_PORT" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
    `$nekoRunning = `$true
} catch { `$nekoRunning = `$false }

if (-not `$nekoRunning) {
    Write-Host "[asyncat] Starting frontend..." -ForegroundColor Cyan
    
    if (Test-Path `$NEKO_DIST) {
        # Serve built frontend with serve
        Start-Process powershell -ArgumentList "-WindowStyle Hidden -NoExit -Command `"cd '\`$NEKO_DIST'; npx serve -l `\`$NEKO_PORT`"" -NoNewWindow
    } else {
        # Fallback: use Vite dev server
        Start-Process powershell -ArgumentList "-WindowStyle Hidden -NoExit -Command `"cd '\`$InstallDir\neko'; npx vite --port `\``$NEKO_PORT`"" -NoNewWindow
    }
    
    # Wait for frontend to start
    for (`$i = 0; `$i -lt 30; `$i++) {
        try {
            `$null = Invoke-WebRequest "http://localhost:`\``$NEKO_PORT" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            break
        } catch { Start-Sleep 0.5 }
    }
}

# Open in Chrome/Edge with --app flag (app mode = no address bar)
`$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "`$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
`$chrome = `$chromePaths | Where-Object { Test-Path `$_ } | Select-Object -First 1

`$edgePaths = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
`$edge = `$edgePaths | Where-Object { Test-Path `$_ } | Select-Object -First 1

if (`$chrome) {
    Start-Process `$chrome "--app=http://localhost:`$NEKO_PORT"
} elseif (`$edge) {
    Start-Process `$edge "--app=http://localhost:`$NEKO_PORT"
} else {
    Start-Process "http://localhost:`$NEKO_PORT"
}
"@ | Set-Content $uiScript

# Create Desktop shortcut
$desktop = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktop "Asyncat.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($desktopShortcut)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-WindowStyle Hidden -File `"$uiScript`""
if (Test-Path $iconSrc) {
    $shortcut.IconLocation = $iconSrc
}
$shortcut.Save()

# Create Start Menu shortcut
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startMenuShortcut = Join-Path $startMenu "Asyncat.lnk"
$shortcut2 = $WshShell.CreateShortcut($startMenuShortcut)
$shortcut2.TargetPath = "powershell.exe"
$shortcut2.Arguments = "-WindowStyle Hidden -File `"$uiScript`""
if (Test-Path $iconSrc) {
    $shortcut2.IconLocation = $iconSrc
}
$shortcut2.Save()

# Create Start Menu folder for Asyncat
$startMenuFolder = Join-Path $startMenu "Asyncat"
if (-not (Test-Path $startMenuFolder)) {
    New-Item -ItemType Directory -Force -Path $startMenuFolder | Out-Null
}

# Create shortcut in the folder
$folderShortcut = Join-Path $startMenuFolder "Asyncat.lnk"
$shortcut3 = $WshShell.CreateShortcut($folderShortcut)
$shortcut3.TargetPath = "powershell.exe"
$shortcut3.Arguments = "-WindowStyle Hidden -File `"$uiScript`""
if (Test-Path $iconSrc) {
    $shortcut3.IconLocation = $iconSrc
}
$shortcut3.Save()

Ok "App shortcuts created on Desktop + Start Menu"

# -- Done ----------------------------------------------------------------------
Write-Host ""
Write-Host "  $([char]0x2713)  asyncat installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  For humans (UI app):"
Write-Host "    Click " -NoNewline; Write-Host "Asyncat" -ForegroundColor Cyan -NoNewline; Write-Host " on your Desktop or Start Menu"
Write-Host ""
Write-Host "  For terminal gremlins:"
Write-Host "    asyncat              " -NoNewline; Write-Host "open the interactive CLI REPL" -ForegroundColor Cyan
Write-Host "    asyncat start        " -NoNewline; Write-Host "start backend only" -ForegroundColor Cyan
Write-Host "    asyncat-ui.ps1       " -NoNewline; Write-Host "launch the web app" -ForegroundColor Cyan
Write-Host "    asyncat --help       " -NoNewline; Write-Host "see all commands" -ForegroundColor Cyan
Write-Host ""
Write-Host "  First time? Run:  asyncat install"
Write-Host ""