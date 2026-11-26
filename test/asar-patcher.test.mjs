import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  HOOK_MARKER,
  PRELOAD_REL_PATH,
  buildSyntheticAsar,
  readAsarHeader,
  readFileFromAsar,
  computeFileIntegrity,
  isAsarPatched,
  patchAsar,
  unpatchAsar,
} = require('../asar-patcher.cjs');

test('asar-patcher patches and unpatches dist/preload.js while preserving other files and SHA-256 integrity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-asar-'));
  const asarPath = path.join(tmpDir, 'app.asar');

  const fileA = 'console.log("before preload");\n';
  const origPreload = 'const electron = require("electron");\nconsole.log("preload ready");\n';
  const fileB = JSON.stringify({ name: 'antigravity', version: '2.0.0' }, null, 2) + '\n';
  const binC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);

  try {
    buildSyntheticAsar(
      {
        'dist/a.js': fileA,
        'dist/preload.js': origPreload,
        'package.json': fileB,
        'assets/icon.png': binC,
      },
      asarPath
    );

    assert.equal(isAsarPatched(asarPath), false);
    assert.equal(readFileFromAsar(asarPath, PRELOAD_REL_PATH).toString('utf8'), origPreload);

    // 1. Patch
    const r1 = patchAsar(asarPath, { resign: false });
    assert.equal(r1.status, 'patched');
    assert.ok(fs.existsSync(`${asarPath}.bak`));
    assert.equal(isAsarPatched(asarPath), true);

    const patchedPreload = readFileFromAsar(asarPath, PRELOAD_REL_PATH);
    assert.ok(patchedPreload.toString('utf8').includes(HOOK_MARKER));
    assert.ok(patchedPreload.toString('utf8').startsWith(origPreload.trimEnd()));

    // Verify integrity hash matches actual patched bytes
    const { meta } = readAsarHeader(asarPath);
    const entry = meta.files.dist.files['preload.js'];
    assert.equal(entry.size, patchedPreload.length);
    assert.deepEqual(entry.integrity, computeFileIntegrity(patchedPreload));

    // Verify surrounding files (before & after preload.js) are byte-for-byte intact
    assert.equal(readFileFromAsar(asarPath, 'dist/a.js').toString('utf8'), fileA);
    assert.equal(readFileFromAsar(asarPath, 'package.json').toString('utf8'), fileB);
    assert.deepEqual(readFileFromAsar(asarPath, 'assets/icon.png'), binC);

    // 2. Idempotent re-patch
    const r2 = patchAsar(asarPath, { resign: false });
    assert.equal(r2.status, 'already_patched');

    // 3. Unpatch surgically
    const r3 = unpatchAsar(asarPath, { resign: false });
    assert.equal(r3.status, 'unpatched');
    assert.equal(isAsarPatched(asarPath), false);

    const restoredPreload = readFileFromAsar(asarPath, PRELOAD_REL_PATH);
    assert.equal(restoredPreload.toString('utf8'), origPreload);
    assert.equal(readFileFromAsar(asarPath, 'dist/a.js').toString('utf8'), fileA);
    assert.equal(readFileFromAsar(asarPath, 'package.json').toString('utf8'), fileB);
    assert.deepEqual(readFileFromAsar(asarPath, 'assets/icon.png'), binC);

    // Verify integrity after unpatch
    const { meta: metaAfter } = readAsarHeader(asarPath);
    assert.deepEqual(
      metaAfter.files.dist.files['preload.js'].integrity,
      computeFileIntegrity(restoredPreload)
    );

    // 4. Idempotent unpatch
    const r4 = unpatchAsar(asarPath, { resign: false });
    assert.equal(r4.status, 'not_patched');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
