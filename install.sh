#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Antigravity Desktop Statusline — One-Line macOS / Linux Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.sh | bash
# ==============================================================================

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js (>= 18) is required. Install it from https://nodejs.org/" >&2
  exit 1
fi

INSTALL_DIR="$HOME/.antigravity-statusline"
REPO_URL="https://github.com/Biz2k/Antigravity-desktop-statusline.git"

echo "[1/2] Downloading to $INSTALL_DIR..."
if command -v git >/dev/null 2>&1; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull origin main --ff-only
  else
    BAK_DIR=""
    if [ -d "$INSTALL_DIR" ]; then
      BAK_DIR="$(mktemp -d -t agy-statusline-bak.XXXXXX)"
      for f in config.json state.json; do
        [ -f "$INSTALL_DIR/$f" ] && cp "$INSTALL_DIR/$f" "$BAK_DIR/$f"
      done
      rm -rf "$INSTALL_DIR"
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
    if [ -n "$BAK_DIR" ] && [ -d "$BAK_DIR" ]; then
      for f in config.json state.json; do
        [ -f "$BAK_DIR/$f" ] && cp "$BAK_DIR/$f" "$INSTALL_DIR/$f"
      done
      rm -rf "$BAK_DIR"
    fi
  fi
else
  TMP_ZIP="$(mktemp -t agy-statusline.XXXXXX.zip)"
  TMP_DIR="$(mktemp -d -t agy-statusline.XXXXXX)"
  curl -fsSL "https://github.com/Biz2k/Antigravity-desktop-statusline/archive/refs/heads/main.zip" -o "$TMP_ZIP"
  unzip -q "$TMP_ZIP" -d "$TMP_DIR"
  mkdir -p "$INSTALL_DIR"
  cp -R "$TMP_DIR/Antigravity-desktop-statusline-main/"* "$INSTALL_DIR/"
  rm -rf "$TMP_ZIP" "$TMP_DIR"
fi

echo "[2/2] Registering MCP server & attaching UI loader..."
node "$INSTALL_DIR/install.cjs"
