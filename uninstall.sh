#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Antigravity Desktop Statusline — One-Line macOS / Linux Uninstaller (Bash)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/uninstall.sh | bash
# ==============================================================================

INSTALL_DIR="$HOME/.antigravity-statusline"
UNINSTALLER="$INSTALL_DIR/uninstall.cjs"

if [ -f "$UNINSTALLER" ] && command -v node >/dev/null 2>&1; then
  node "$UNINSTALLER"
fi

if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo "[OK] Removed $INSTALL_DIR"
fi

echo "Done. Restart AntiGravity if the bar is still visible."
