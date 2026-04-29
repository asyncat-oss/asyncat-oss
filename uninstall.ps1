# Asyncat uninstaller — Windows (PowerShell)
# Usage: .\uninstall.ps1

$ErrorActionPreference = "Stop"

function Info  { Write-Host "[asyncat] $args" -ForegroundColor Cyan }
function Ok    { Write-Host "[asyncat] $([char]0x2713) $args" -ForegroundColor Green }
function Warn  { Write-Host "[asyncat] ! $args" -ForegroundColor Yellow }

Write-Host ""
Write-Host "    /\_____/\ " -ForegroundColor Magenta
Write-Host "   /  o   o  \    asyncat  goodbye! " -ForegroundColor Magenta -NoNewline; Write-Host "🎬" -ForegroundColor White
Write-Host "  ( ==  ^  == )   ---------------------------------" -ForegroundColor Magenta
Write-Host "   )         (" -ForegroundColor Magenta
Write-Host ""

$BinDir    = "$env:USERPROFILE\.local\bin"
$InstallDir = if ($env:ASYNCAT_INSTALL_DIR) { $env:ASYNCAT_INSTALL_DIR } else { "$env:USERPROFILE\.asyncat" }

# ── Stop services ──────────────────────────────────────────────────────────
Info "Stopping services..."
# Kill any running asyncat processes
Get-Process | Where-Object {
    $_.ProcessName -like "*node*" -and (
        $_.CommandLine -like "*asyncat*" -or
        $_.CommandLine -like "*den*" -or
        $_.CommandLine -like "*neko*" -or
        $_.CommandLine -like "*serve*"
    )
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Also try to find processes by port
$ports = @(8716, 8717)
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) { $proc | Stop-Process -Force -ErrorAction SilentlyContinue }
    }
}

Start-Sleep 1

# ── Remove CLI commands ────────────────────────────────────────────────────
if (Test-Path "$BinDir\asyncat.cmd") {
    Remove-Item "$BinDir\asyncat.cmd" -Force
    Ok "Removed asyncat.cmd"
}
if (Test-Path "$BinDir\asyncat.ps1") {
    Remove-Item "$BinDir\asyncat.ps1" -Force
    Ok "Removed asyncat.ps1"
}

# ── Remove launcher ────────────────────────────────────────────────────────
if (Test-Path "$BinDir\asyncat-ui.ps1") {
    Remove-Item "$BinDir\asyncat-ui.ps1" -Force
    Ok "Removed app launcher"
}

# ── Remove Desktop shortcut ────────────────────────────────────────────────
$Desktop = [Environment]::GetFolderPath("Desktop")
$DesktopShortcut = Join-Path $Desktop "Asyncat.lnk"
if (Test-Path $DesktopShortcut) {
    Remove-Item $DesktopShortcut -Force
    Ok "Removed Desktop shortcut"
}

# ── Remove Start Menu shortcuts ─────────────────────────────────────────────
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"

# Remove direct shortcut
$startMenuShortcut = Join-Path $startMenu "Asyncat.lnk"
if (Test-Path $startMenuShortcut) {
    Remove-Item $startMenuShortcut -Force
    Ok "Removed Start Menu shortcut"
}

# Remove folder with shortcut
$startMenuFolder = Join-Path $startMenu "Asyncat"
if (Test-Path $startMenuFolder) {
    $folderShortcut = Join-Path $startMenuFolder "Asyncat.lnk"
    if (Test-Path $folderShortcut) {
        Remove-Item $folderShortcut -Force
    }
    Remove-Item $startMenuFolder -Force -Recurse
    Ok "Removed Asyncat folder from Start Menu"
}

# ── Remove icon cache ──────────────────────────────────────────────────────
$iconCache = Join-Path $env:LOCALAPPDATA "asyncat-icons"
if (Test-Path $iconCache) {
    Remove-Item $iconCache -Force -Recurse
    Ok "Removed icon cache"
}

# ── Remove from PATH if applicable ─────────────────────────────────────────
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -like "*$BinDir*") {
    $NewPath = $UserPath -replace [regex]::Escape($BinDir + ";?"), ""
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
    Warn "Removed from PATH"
}

# ── Done ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  $([char]0x2713)  asyncat uninstalled!" -ForegroundColor Green
Write-Host ""
Write-Host "  Leftover files (optional cleanup):"
Write-Host "    rmdir /s $InstallDir         # remove installation directory" -ForegroundColor Cyan
Write-Host "    rmdir /s $env:USERPROFILE\.asyncat # remove data, config, database" -ForegroundColor Cyan
Write-Host ""
Write-Host "    /\_____/\ "
Write-Host "   /  ~   ~  \ "
Write-Host "  ( ==  x  == )"
Write-Host "   )   bye   ("
Write-Host "  (           )"
Write-Host " ( (  )   (  ) )"
Write-Host "(__(__)___(__)__)"
Write-Host ""
Write-Host "  it was great having you. come back soon! 💜"
Write-Host ""