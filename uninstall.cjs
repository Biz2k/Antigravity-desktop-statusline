const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const installDir = __dirname;
const lockFile = path.join(installDir, 'uninstalling.lock');

try {
  fs.writeFileSync(lockFile, String(Date.now()), 'utf8');
} catch {}

// 1. Remove MCP registration from both config files
const mcpPaths = [
  path.join(home, '.gemini', 'config', 'mcp_config.json'),
  path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
];
for (const p of mcpPaths) {
  if (!fs.existsSync(p)) continue;
  try {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (cfg && cfg.mcpServers && cfg.mcpServers['antigravity-statusline']) {
      delete cfg.mcpServers['antigravity-statusline'];
      fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      console.log('Removed antigravity-statusline from', p);
    }
  } catch (err) {
    console.error('Failed to update', p, err.message);
  }
}

// 2. Strip loader block from antigravity-features-v2/localization_injected.js
const bundlePath = path.join(home, '.antigravity-features-v2', 'localization_injected.js');
if (fs.existsSync(bundlePath)) {
  try {
    const raw = fs.readFileSync(bundlePath, 'utf8');
    const cleaned = raw.replace(/\r?\n*\/\/ BEGIN ANTIGRAVITY STATUSLINE LOADER[\s\S]*?\/\/ END ANTIGRAVITY STATUSLINE LOADER\r?\n*/g, '\n');
    if (cleaned !== raw) {
      fs.writeFileSync(bundlePath, cleaned, 'utf8');
      console.log('Removed statusline loader from', bundlePath);
    }
  } catch (err) {
    console.error('Failed to clean bundle:', err.message);
  }
}

console.log('✅ antigravity-statusline uninstalled. Restart AntiGravity or wait 4s for hot-reload.');
