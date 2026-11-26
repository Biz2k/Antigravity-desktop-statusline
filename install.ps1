# ==============================================================================
# Antigravity Desktop Statusline — One-Line Windows Installer (PowerShell)
# Usage:
#   irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Antigravity Desktop Statusline — Installer (Windows)          " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    $fallbackNode = Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"
    if (Test-Path $fallbackNode) {
        $nodeExe = $fallbackNode
    } else {
        Write-Host "[ERROR] Node.js (>= 18) is not installed!" -ForegroundColor Red
        Write-Host "Install Node.js LTS from https://nodejs.org/ and re-run this script." -ForegroundColor Yellow
        exit 1
    }
} else {
    $nodeExe = $nodeCmd.Source
}

$InstallDir = Join-Path $env:USERPROFILE ".antigravity-statusline"
$RepoUrl = "https://github.com/Biz2k/Antigravity-desktop-statusline.git"
$ZipUrl = "https://github.com/Biz2k/Antigravity-desktop-statusline/archive/refs/heads/main.zip"

Write-Host "[1/2] Downloading files to: $InstallDir" -ForegroundColor Green
if (Get-Command git -ErrorAction SilentlyContinue) {
    if (Test-Path (Join-Path $InstallDir ".git")) {
        git -C $InstallDir pull origin main --ff-only
    } else {
        $BackupDir = $null
        if (Test-Path $InstallDir) {
            $BackupDir = Join-Path $env:TEMP ("antigravity-statusline-bak-" + [System.Guid]::NewGuid().ToString("N"))
            New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
            foreach ($f in @("config.json", "state.json")) {
                $src = Join-Path $InstallDir $f
                if (Test-Path $src) { Copy-Item -Path $src -Destination (Join-Path $BackupDir $f) -Force }
            }
            Remove-Item $InstallDir -Recurse -Force
        }
        git clone $RepoUrl $InstallDir
        if ($BackupDir -and (Test-Path $BackupDir)) {
            foreach ($f in @("config.json", "state.json")) {
                $bak = Join-Path $BackupDir $f
                if (Test-Path $bak) { Copy-Item -Path $bak -Destination (Join-Path $InstallDir $f) -Force }
            }
            Remove-Item $BackupDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    $TmpZip = Join-Path $env:TEMP "antigravity-statusline.zip"
    $TmpExt = Join-Path $env:TEMP "antigravity-statusline-ext"
    Invoke-WebRequest -Uri $ZipUrl -OutFile $TmpZip -UseBasicParsing
    if (Test-Path $TmpExt) { Remove-Item $TmpExt -Recurse -Force }
    Expand-Archive -Path $TmpZip -DestinationPath $TmpExt -Force
    if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
    Copy-Item -Path (Join-Path $TmpExt "Antigravity-desktop-statusline-main\*") -Destination $InstallDir -Recurse -Force
    Remove-Item $TmpZip -Force -ErrorAction SilentlyContinue
    Remove-Item $TmpExt -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[2/2] Registering MCP server & attaching UI loader..." -ForegroundColor Green
& $nodeExe (Join-Path $InstallDir "install.cjs")
