# Antigravity Desktop Statusline

🌐 **🇬🇧 English** | [🇷🇺 Русский](README.ru.md) | [🇺🇦 Українська](README.uk.md)

[![Version](https://img.shields.io/badge/version-v1.0.0-2f7de1.svg)](https://github.com/Biz2k/Antigravity-desktop-statusline/releases/tag/v1.0.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6.svg)](https://github.com/Biz2k/Antigravity-desktop-statusline)
[![Target](https://img.shields.io/badge/Google%20AntiGravity-2.0%2B-orange.svg)](https://antigravity.google)
[![Zero Dependencies](https://img.shields.io/badge/npm%20dependencies-0-10b981.svg)](package.json)

**A sleek, zero-dependency statusline band right above the chat prompt in Google AntiGravity 2.0 Desktop** — inspired by Claude Code's `desktop-statusline`.

![Antigravity Desktop Statusline preview](assets/preview.png)

---

## ✨ Features

1. **Live Context Window Meter (`Context`)**
   - Reads the active conversation's local transcript (`~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`) in real time with `mtime` + `size` caching.
   - Displays exact tokens used vs. model context window (`512K` for Gemini 4 Neon, `1M` for Gemini 4 Carbon / Argon / Hydrogen / Gemini 3.x / Claude 5.5, `200K` for Claude 4.6, `128K` for GPT-OSS).
   - Displays live **prompt cache hit rate** (e.g. `cache 99%`, amber warning below `50%`) and automatic **compaction counter** when context shrinks.
   - Color-coded progress bars: **blue** (`< 80%`), **amber** (`80%–94%`), **red** (`≥ 95%`).

2. **5-Hour & Weekly Usage Meters (`5 hours` / `Weekly`)**
   - **Official Quota Auto-Sync**: whenever you open **Settings → Models**, the widget passively reads the official remaining 5-hour & weekly limits (both English & Russian UI), converts them to used `%`, persists them locally, and renders live reset countdowns (`↻ 4h 34m (03:38)`, `↻ 6d 22h`).
   - **Local Rolling Fallback**: before your first visit to **Settings → Models** (or after a reset window expires), automatically displays rolling 5-hour and 7-day token consumption aggregated across all local conversations against configurable budgets.

3. **Zero Dependencies & Live Hot-Reload**
   - Pure Node.js ESM (`>= 18`) — **zero `npm` packages required**.
   - Runs as a lightweight MCP stdio server (`antigravity-statusline`, exposing `get_statusline_metrics`) + local HTTP server on `127.0.0.1:39229`.
   - Edits to `widget.js` hot-reload into the open AntiGravity window within seconds without restarting the app.
   - Adapts automatically to **Dark / Light** themes and **`EN | RU`** language toggle (`antigravity-features-v2`).
   - Hover controls in the top-right corner of the band: **Refresh (`↻`)**, **Collapse (`▾`)**, and **Settings (`⚙`)**.

---

## ⚡ Quick Install

### Prerequisites
- **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- **Google AntiGravity 2.0 Desktop**
- Recommended: [`antigravity-features-v2`](https://github.com/WiseYaroslav28/antigravity-features-v2) installed (provides seamless Electron DOM injection & auto-reload; the statusline loader also auto-reattaches after `antigravity-features-v2` updates).

### Windows (PowerShell — 1-line)
```powershell
irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.ps1 | iex
```

### macOS / Linux (Bash — 1-line)
```bash
curl -fsSL https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.sh | bash
```

### Manual Install (`git clone`)
```bash
git clone https://github.com/Biz2k/Antigravity-desktop-statusline.git ~/.antigravity-statusline
node ~/.antigravity-statusline/install.cjs
```

Then **restart AntiGravity** (including exiting from the system tray). To sync official 5-hour & weekly plan limits, open **Settings → Models** once.

---

## ⚙️ Configuration

Click the **`⚙`** icon on hover in the top-right corner of the statusline band, or edit `~/.antigravity-statusline/config.json`:

| Option | Default | Description |
| :--- | :--- | :--- |
| `enabled` | `true` | Show or hide the statusline band |
| `collapsed` | `false` | Compact single-line summary mode |
| `showCache` | `true` | Display prompt cache hit percentage (`cache XX%`) |
| `showSecondRow` | `true` | Show or hide the 5-hour & weekly meters row |
| `fiveHourBudgetTokens` | `1500000` | Reference 5-hour token budget for local fallback mode |
| `weeklyBudgetTokens` | `15000000` | Reference 7-day token budget for local fallback mode |

---

## 🗂️ Project Architecture

| File | Purpose |
| :--- | :--- |
| [`server.mjs`](server.mjs) | Zero-dependency MCP stdio server (`get_statusline_metrics`) + local HTTP API (`http://127.0.0.1:39229`) + transcript analyzer + self-healing loader guard |
| [`widget.js`](widget.js) | Hot-reloadable DOM widget rendered directly above the AntiGravity prompt composer + passive Settings → Models quota observer |
| [`loader.js`](loader.js) | Lightweight top-shell-only loader that pulls `widget.js` with `X-Widget-Hash` hot-reload |
| [`install.cjs`](install.cjs) | Cross-platform installer (registers MCP configs + attaches loader) |
| [`install.ps1`](install.ps1) / [`install.sh`](install.sh) | One-line installers for Windows and macOS/Linux |
| [`uninstall.cjs`](uninstall.cjs) / [`uninstall.ps1`](uninstall.ps1) | Clean uninstaller (removes MCP registration, strips loader, cleans directory) |

---

## 🔒 Privacy & Local-Only Design

- **Zero external network calls** — everything runs strictly on `127.0.0.1:39229` and reads only your local transcript files (`~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl`).
- **No credentials or tokens read** — official quotas are captured passively from what AntiGravity already displays in **Settings → Models**.
- **Isolated to the AntiGravity shell** — never injects into guest browser tabs or webviews.

---

## 🗑️ Uninstall

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/uninstall.ps1 | iex
```

**Cross-platform (Node.js):**
```bash
node ~/.antigravity-statusline/uninstall.cjs
```

---

## 📜 License

MIT License — see [`LICENSE`](LICENSE) for details.
