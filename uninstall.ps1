# ==============================================================================
# Antigravity Desktop Statusline — One-Line Windows Uninstaller (PowerShell)
# Usage:
#   irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/uninstall.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:USERPROFILE ".antigravity-statusline"
$Uninstaller = Join-Path $InstallDir "uninstall.cjs"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe" }

if ((Test-Path $Uninstaller) -and (Test-Path $nodeExe)) {
    & $nodeExe $Uninstaller
}

if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Removed $InstallDir" -ForegroundColor Green
}

Write-Host "Done. Restart AntiGravity if the bar is still visible." -ForegroundColor Cyan
