# Asyncat uninstaller — Windows (PowerShell)
# Usage: .\uninstall.ps1 [-Purge]

param(
    [switch]$Purge,
    [switch]$All
)

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
$AsyncatHome = if ($env:ASYNCAT_HOME) { $env:ASYNCAT_HOME } else { "$env:USERPROFILE\.asyncat" }
$LocalRuntimeDir = Join-Path $env:LOCALAPPDATA "Asyncat"
$DoPurge = $Purge -or $All

# ── Stop services ──────────────────────────────────────────────────────────
Info "Stopping services..."
# Kill matching Asyncat node/npm/powershell processes without touching unrelated Node apps.
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -and (
        $_.CommandLine -like "*$InstallDir*" -or
        $_.CommandLine -like "*asyncat-ui.ps1*" -or
        $_.CommandLine -like "*den/src/index.js*" -or
        $_.CommandLine -like "*den\src\index.js*"
    )
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Also try to find processes by port
$ports = @(8716, 8717, 8765, 8766, 8767, 8768)
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) { $proc | Stop-Process -Force -ErrorAction SilentlyContinue }
    }
}

Start-Sleep 1

# ── Remove CLI commands ────────────────────────────────────────────────────
if (Test-Path "$BinDir\asyncat") {
    Remove-Item "$BinDir\asyncat" -Force
    Ok "Removed asyncat"
}
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
    $parts = $UserPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $BinDir.TrimEnd('\') }
    $NewPath = ($parts -join ';')
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
    Warn "Removed from PATH"
}

# ── npm global wrapper ─────────────────────────────────────────────────────
if (Get-Command npm -ErrorAction SilentlyContinue) {
    try { npm uninstall -g @asyncat/asyncat | Out-Null } catch {}
}

# ── Optional full data cleanup ─────────────────────────────────────────────
if ($DoPurge) {
    $legacyToken = Join-Path $env:USERPROFILE ".asyncat_machine_token"
    if (Test-Path $legacyToken) {
        Remove-Item $legacyToken -Force -ErrorAction SilentlyContinue
        Ok "Removed legacy machine token"
    }

    $purgeTargets = @($InstallDir, $AsyncatHome, $LocalRuntimeDir) | Where-Object { $_ } | Select-Object -Unique
    foreach ($target in $purgeTargets) {
        if (Test-Path $target) {
            Remove-Item $target -Force -Recurse -ErrorAction SilentlyContinue
            Ok "Removed $target"
        }
    }
}

# ── Done ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  $([char]0x2713)  asyncat uninstalled!" -ForegroundColor Green
Write-Host ""
if (-not $DoPurge) {
    Write-Host "  Local data was kept:"
    Write-Host "    $InstallDir" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Full cleanup:"
    Write-Host "    .\uninstall.ps1 -Purge" -ForegroundColor Cyan
    Write-Host "    asyncat uninstall --purge" -ForegroundColor Cyan
    Write-Host ""
}
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
