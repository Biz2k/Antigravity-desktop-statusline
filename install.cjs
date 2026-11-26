const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { findAntigravityAsar, patchAsar } = require('./asar-patcher.cjs');

const home = os.homedir();
const installDir = __dirname;
const serverPath = path.join(installDir, 'server.mjs').replace(/\\/g, '/');
const loaderPath = path.join(installDir, 'loader.js');
const lockFile = path.join(installDir, 'uninstalling.lock');
const forceStandalone = process.argv.includes('--standalone');

// Clear any previous uninstall lock
if (fs.existsSync(lockFile)) {
  try { fs.unlinkSync(lockFile); } catch {}
}

// 1. Register MCP server in AntiGravity config files (preserving existing servers)
const mcpPaths = [
  path.join(home, '.gemini', 'config', 'mcp_config.json'),
  path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
];

for (const cfgPath of mcpPaths) {
  const dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let cfg = { mcpServers: {} };
  if (fs.existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (!cfg.mcpServers) cfg.mcpServers = {};
    } catch {}
  }
  cfg.mcpServers['antigravity-statusline'] = {
    command: process.execPath,
    args: [serverPath],
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log('[OK] Registered MCP server in:', cfgPath);
}

// 2. Attach UI loader: use antigravity-features-v2 if present (unless --standalone),
//    otherwise patch Antigravity's app.asar directly (zero external dependencies).
const fv2Dir = path.join(home, '.antigravity-features-v2');
const fv2Bundle = path.join(fv2Dir, 'localization_injected.js');
const loaderSnippet = fs.readFileSync(loaderPath, 'utf8').trim();

if (!forceStandalone && fs.existsSync(fv2Bundle)) {
  const current = fs.readFileSync(fv2Bundle, 'utf8');
  if (!current.includes('ANTIGRAVITY_STATUSLINE_LOADER_V1')) {
    const eol = current.includes('\r\n') ? '\r\n' : '\n';
    const patched = current.trimEnd() + eol + eol + loaderSnippet.replace(/\r?\n/g, eol) + eol;
    const tmp = path.join(os.tmpdir(), `agy-sl-check-${process.pid}.js`);
    fs.writeFileSync(tmp, patched, 'utf8');
    try {
      execSync(`"${process.execPath}" --check "${tmp}"`, { stdio: 'ignore', windowsHide: true });
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
    fs.writeFileSync(fv2Bundle, patched, 'utf8');
    console.log('[OK] Attached statusline loader to antigravity-features-v2/localization_injected.js');
  } else {
    console.log('[OK] Statusline loader already attached in antigravity-features-v2');
  }

  const autoPatcher = path.join(fv2Dir, 'auto_patcher.cjs');
  if (fs.existsSync(autoPatcher)) {
    try {
      execSync(`"${process.execPath}" "${autoPatcher}" --once`, { cwd: fv2Dir, stdio: 'inherit', windowsHide: true });
    } catch (err) {
      console.warn('[WARN] auto_patcher.cjs notice:', err.message);
    }
  }
} else {
  const asarPath = findAntigravityAsar();
  if (asarPath) {
    try {
      const res = patchAsar(asarPath);
      if (res.status === 'already_patched') {
        console.log('[OK] Standalone statusline hook already present in:', asarPath);
      } else {
        console.log('[OK] Patched AntiGravity app.asar directly (standalone mode):', asarPath);
        if (res.backupPath) console.log('[OK] Clean backup saved at:', res.backupPath);
      }
    } catch (err) {
      console.warn('[WARN] Standalone app.asar patch could not be applied:', err.message);
      console.warn('[INFO] Close AntiGravity completely (including system tray) and re-run:');
      console.warn(`       node "${path.join(installDir, 'install.cjs')}"`);
    }
  } else {
    console.log('[INFO] AntiGravity app.asar not found automatically.');
    console.log('[INFO] MCP server is registered and ready on http://127.0.0.1:39229.');
    console.log('[INFO] To patch manually, set ANTIGRAVITY_ASAR_PATH and re-run install.cjs.');
  }
}

console.log('\n✅ Installation complete! Restart AntiGravity (including tray exit) to activate.');
