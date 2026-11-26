const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const HOOK_BEGIN = '// BEGIN ANTIGRAVITY STATUSLINE STANDALONE HOOK';
const HOOK_END = '// END ANTIGRAVITY STATUSLINE STANDALONE HOOK';
const HOOK_MARKER = 'ANTIGRAVITY_STATUSLINE_STANDALONE_HOOK_V1';
const PRELOAD_REL_PATH = 'dist/preload.js';
const DEFAULT_BLOCK_SIZE = 4 * 1024 * 1024;

const STANDALONE_HOOK_SNIPPET = `${HOOK_BEGIN}
(() => {
  // ${HOOK_MARKER}
  try {
    const _run = () => {
      try {
        if (typeof window === 'undefined' || window !== window.top) return;
        const _fs = require('fs');
        const _path = require('path');
        const _os = require('os');
        const _loaderPath = _path.join(_os.homedir(), '.antigravity-statusline', 'loader.js');
        if (!_fs.existsSync(_loaderPath)) return;
        const _code = _fs.readFileSync(_loaderPath, 'utf8');
        if (!_code || _code.length < 50) return;
        const _el = (() => { try { return require('electron'); } catch { return null; } })();
        if (_el && _el.webFrame && typeof _el.webFrame.executeJavaScript === 'function') {
          _el.webFrame.executeJavaScript(_code).catch(() => {});
        } else {
          (0, eval)(_code);
        }
      } catch {}
    };
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _run, { once: true });
    } else {
      setTimeout(_run, 50);
    }
  } catch {}
})();
${HOOK_END}`;

function findAntigravityAsar() {
  if (process.env.ANTIGRAVITY_ASAR_PATH && fs.existsSync(process.env.ANTIGRAVITY_ASAR_PATH)) {
    return path.resolve(process.env.ANTIGRAVITY_ASAR_PATH);
  }
  const home = os.homedir();
  const candidates = [];

  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.push(
      path.join(localApp, 'Programs', 'Antigravity', 'resources', 'app.asar'),
      path.join(localApp, 'Antigravity', 'resources', 'app.asar'),
      path.join('C:\\Program Files', 'Antigravity', 'resources', 'app.asar'),
      path.join('C:\\Program Files (x86)', 'Antigravity', 'resources', 'app.asar')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Antigravity.app/Contents/Resources/app.asar',
      '/Applications/Antigravity IDE.app/Contents/Resources/app.asar',
      path.join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app.asar'),
      path.join(home, 'Applications', 'Antigravity IDE.app', 'Contents', 'Resources', 'app.asar')
    );
  } else {
    candidates.push(
      '/opt/Antigravity/resources/app.asar',
      '/usr/lib/antigravity/resources/app.asar',
      '/usr/share/antigravity/resources/app.asar',
      path.join(home, '.local', 'share', 'antigravity', 'resources', 'app.asar')
    );
  }

  return candidates.find((p) => fs.existsSync(p)) || null;
}

function readAsarHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const hdr = Buffer.alloc(16);
    if (fs.readSync(fd, hdr, 0, 16, 0) < 16) {
      throw new Error('Invalid ASAR file: truncated header');
    }
    const u0 = hdr.readUInt32LE(0);
    const headerSize = hdr.readUInt32LE(4);
    const jsonLen = hdr.readUInt32LE(12);
    if (u0 !== 4 || headerSize < 8 || jsonLen === 0 || jsonLen > headerSize) {
      throw new Error('Invalid ASAR header structure');
    }
    const jsonBuf = Buffer.alloc(jsonLen);
    if (fs.readSync(fd, jsonBuf, 0, jsonLen, 16) < jsonLen) {
      throw new Error('Invalid ASAR file: truncated metadata JSON');
    }
    const meta = JSON.parse(jsonBuf.toString('utf8'));
    return { headerSize, dataOffset: 8 + headerSize, meta };
  } finally {
    fs.closeSync(fd);
  }
}

function encodeAsarHeader(meta) {
  const jsonBuf = Buffer.from(JSON.stringify(meta), 'utf8');
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  const u8 = 4 + jsonBuf.length + pad;
  const u4 = u8 + 4;
  const hdr = Buffer.alloc(16 + jsonBuf.length + pad);
  hdr.writeUInt32LE(4, 0);
  hdr.writeUInt32LE(u4, 4);
  hdr.writeUInt32LE(u8, 8);
  hdr.writeUInt32LE(jsonBuf.length, 12);
  jsonBuf.copy(hdr, 16);
  return hdr;
}

function getEntryNode(meta, relPath) {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  let cur = meta;
  for (const part of parts) {
    if (!cur || !cur.files || !Object.prototype.hasOwnProperty.call(cur.files, part)) {
      return null;
    }
    cur = cur.files[part];
  }
  return cur;
}

function walkFileEntries(node, visitor) {
  if (!node || !node.files) return;
  for (const child of Object.values(node.files)) {
    if (child.files) {
      walkFileEntries(child, visitor);
    } else if (!child.unpacked && child.offset !== undefined) {
      visitor(child);
    }
  }
}

function computeFileIntegrity(buf, blockSize = DEFAULT_BLOCK_SIZE) {
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  } else {
    for (let off = 0; off < buf.length; off += blockSize) {
      const slice = buf.subarray(off, Math.min(buf.length, off + blockSize));
      blocks.push(crypto.createHash('sha256').update(slice).digest('hex'));
    }
  }
  return { algorithm: 'SHA256', hash, blockSize, blocks };
}

function readFileFromAsar(asarPath, relPath) {
  const { dataOffset, meta } = readAsarHeader(asarPath);
  const entry = getEntryNode(meta, relPath);
  if (!entry || entry.files || entry.unpacked || entry.offset === undefined) {
    return null;
  }
  const offset = Number(entry.offset);
  const size = Number(entry.size);
  const buf = Buffer.alloc(size);
  const fd = fs.openSync(asarPath, 'r');
  try {
    let total = 0;
    while (total < size) {
      const n = fs.readSync(fd, buf, total, size - total, dataOffset + offset + total);
      if (n <= 0) break;
      total += n;
    }
    return buf.subarray(0, total);
  } finally {
    fs.closeSync(fd);
  }
}

function copyRangeSync(srcFd, dstFd, srcStart, length) {
  const chunkSize = 1024 * 1024;
  const buf = Buffer.allocUnsafe(Math.min(chunkSize, Math.max(1, length)));
  let remaining = length;
  let pos = srcStart;
  while (remaining > 0) {
    const toRead = Math.min(buf.length, remaining);
    const n = fs.readSync(srcFd, buf, 0, toRead, pos);
    if (n <= 0) break;
    fs.writeSync(dstFd, buf, 0, n);
    pos += n;
    remaining -= n;
  }
}

function replaceFileInAsar(asarPath, relPath, newBuf) {
  const { dataOffset, meta } = readAsarHeader(asarPath);
  const entry = getEntryNode(meta, relPath);
  if (!entry || entry.files || entry.unpacked || entry.offset === undefined) {
    throw new Error(`Entry "${relPath}" not found in ${asarPath}`);
  }

  const oldOffset = Number(entry.offset);
  const oldSize = Number(entry.size);
  const delta = newBuf.length - oldSize;

  entry.size = newBuf.length;
  if (entry.integrity) {
    const blockSize = entry.integrity.blockSize || DEFAULT_BLOCK_SIZE;
    entry.integrity = computeFileIntegrity(newBuf, blockSize);
  }

  if (delta !== 0) {
    walkFileEntries(meta, (child) => {
      if (child === entry) return;
      const off = Number(child.offset);
      if (off > oldOffset) {
        child.offset = String(off + delta);
      }
    });
  }

  const newHeaderBuf = encodeAsarHeader(meta);
  const totalSrcSize = fs.statSync(asarPath).size;
  const tailStart = dataOffset + oldOffset + oldSize;
  const tailLen = Math.max(0, totalSrcSize - tailStart);

  const tmpPath = `${asarPath}.agy-sl.${process.pid}.${Date.now()}.tmp`;
  const srcFd = fs.openSync(asarPath, 'r');
  let dstFd;
  try {
    dstFd = fs.openSync(tmpPath, 'w');
    fs.writeSync(dstFd, newHeaderBuf, 0, newHeaderBuf.length);
    if (oldOffset > 0) {
      copyRangeSync(srcFd, dstFd, dataOffset, oldOffset);
    }
    if (newBuf.length > 0) {
      fs.writeSync(dstFd, newBuf, 0, newBuf.length);
    }
    if (tailLen > 0) {
      copyRangeSync(srcFd, dstFd, tailStart, tailLen);
    }
  } catch (err) {
    if (dstFd !== undefined) {
      try { fs.closeSync(dstFd); } catch {}
      dstFd = undefined;
    }
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  } finally {
    fs.closeSync(srcFd);
    if (dstFd !== undefined) fs.closeSync(dstFd);
  }

  try {
    fs.renameSync(tmpPath, asarPath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
      const wrapped = new Error(
        `Cannot write ${asarPath} (${err.code}). Close AntiGravity completely (including system tray) and try again.`
      );
      wrapped.code = err.code;
      throw wrapped;
    }
    throw err;
  }
}

function checkJsSyntax(code) {
  const tmpFile = path.join(os.tmpdir(), `agy-sl-syntax-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, code, 'utf8');
  try {
    execSync(`"${process.execPath}" --check "${tmpFile}"`, { stdio: 'ignore', windowsHide: true });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function maybeResignMacBundle(asarPath) {
  if (process.platform !== 'darwin') return;
  const match = asarPath.match(/^(.+\.app)\/Contents\/Resources\/app\.asar$/);
  if (!match) return;
  try {
    execSync(`codesign --force --deep --sign - "${match[1]}"`, { stdio: 'ignore' });
  } catch {}
}

function isAsarPatched(asarPath) {
  const buf = readFileFromAsar(asarPath, PRELOAD_REL_PATH);
  if (!buf) return false;
  return buf.toString('utf8').includes(HOOK_MARKER);
}

function patchAsar(asarPath, options = {}) {
  const buf = readFileFromAsar(asarPath, PRELOAD_REL_PATH);
  if (!buf) {
    throw new Error(`${PRELOAD_REL_PATH} not found inside ${asarPath}`);
  }
  const current = buf.toString('utf8');
  if (current.includes(HOOK_MARKER)) {
    return { status: 'already_patched', asarPath };
  }

  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const snippet = STANDALONE_HOOK_SNIPPET.replace(/\r?\n/g, eol);
  const patched = current.trimEnd() + eol + eol + snippet + eol;

  checkJsSyntax(patched);

  const bakPath = `${asarPath}.bak`;
  if (options.backup !== false && !fs.existsSync(bakPath)) {
    fs.copyFileSync(asarPath, bakPath);
  }

  replaceFileInAsar(asarPath, PRELOAD_REL_PATH, Buffer.from(patched, 'utf8'));
  if (options.resign !== false) {
    maybeResignMacBundle(asarPath);
  }
  return { status: 'patched', asarPath, backupPath: fs.existsSync(bakPath) ? bakPath : null };
}

function unpatchAsar(asarPath, options = {}) {
  const buf = readFileFromAsar(asarPath, PRELOAD_REL_PATH);
  if (!buf) {
    return { status: 'not_found', asarPath };
  }
  const current = buf.toString('utf8');
  if (!current.includes(HOOK_BEGIN)) {
    return { status: 'not_patched', asarPath };
  }

  const re = /\r?\n*\/\/ BEGIN ANTIGRAVITY STATUSLINE STANDALONE HOOK[\s\S]*?\/\/ END ANTIGRAVITY STATUSLINE STANDALONE HOOK\r?\n*/g;
  const cleaned = current.replace(re, '\n').trimEnd() + '\n';

  checkJsSyntax(cleaned);
  replaceFileInAsar(asarPath, PRELOAD_REL_PATH, Buffer.from(cleaned, 'utf8'));
  if (options.resign !== false) {
    maybeResignMacBundle(asarPath);
  }
  return { status: 'unpatched', asarPath };
}

function buildSyntheticAsar(filesMap, outPath) {
  const meta = { files: {} };
  const buffers = [];
  let offset = 0;

  for (const [relPath, content] of Object.entries(filesMap)) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
    let cur = meta.files;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = { files: {} };
      cur = cur[parts[i]].files;
    }
    cur[parts[parts.length - 1]] = {
      size: buf.length,
      offset: String(offset),
      integrity: computeFileIntegrity(buf),
    };
    buffers.push(buf);
    offset += buf.length;
  }

  const headerBuf = encodeAsarHeader(meta);
  fs.writeFileSync(outPath, Buffer.concat([headerBuf, ...buffers]));
}

module.exports = {
  HOOK_BEGIN,
  HOOK_END,
  HOOK_MARKER,
  PRELOAD_REL_PATH,
  STANDALONE_HOOK_SNIPPET,
  findAntigravityAsar,
  readAsarHeader,
  encodeAsarHeader,
  computeFileIntegrity,
  readFileFromAsar,
  replaceFileInAsar,
  isAsarPatched,
  patchAsar,
  unpatchAsar,
  buildSyntheticAsar,
};

if (require.main === module) {
  const cmd = process.argv[2] || '--status';
  const asarPath = findAntigravityAsar();
  if (!asarPath) {
    console.error('[ERROR] Antigravity app.asar not found. Set ANTIGRAVITY_ASAR_PATH to specify it manually.');
    process.exit(1);
  }
  try {
    if (cmd === '--patch') {
      const res = patchAsar(asarPath);
      console.log(`[OK] ${res.status}: ${res.asarPath}`);
    } else if (cmd === '--unpatch') {
      const res = unpatchAsar(asarPath);
      console.log(`[OK] ${res.status}: ${res.asarPath}`);
    } else {
      console.log(`app.asar: ${asarPath}`);
      console.log(`patched:  ${isAsarPatched(asarPath)}`);
    }
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
}
