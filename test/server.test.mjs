import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_VERSION,
  DEFAULT_THRESHOLDS,
  DEFAULT_CONFIG,
  TRANSCRIPT_CACHE_MAX,
  transcriptCache,
  writeFileAtomic,
  isAllowedOrigin,
  sanitizeThresholds,
  resolveModelWindowInfo,
  resolveModelWindow,
  formatModelLabel,
  parseTranscriptFile,
  clearTranscriptCache,
  createHttpServer,
} from '../server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('APP_VERSION matches package.json version', () => {
  assert.equal(APP_VERSION, pkg.version);
});

test('sanitizeThresholds returns defaults for empty or invalid input', () => {
  assert.deepEqual(sanitizeThresholds(null), DEFAULT_THRESHOLDS);
  assert.deepEqual(sanitizeThresholds(undefined), DEFAULT_THRESHOLDS);
  assert.deepEqual(sanitizeThresholds({}), DEFAULT_THRESHOLDS);
  assert.deepEqual(
    sanitizeThresholds({ context: { warn: 'bad', danger: NaN } }),
    DEFAULT_THRESHOLDS
  );
});

test('sanitizeThresholds clamps bounds, rounds values, and enforces ordering invariants', () => {
  const res = sanitizeThresholds({
    context: { warn: 98.4, danger: 90 },      // asc: warn > danger -> warn clamped to danger (90)
    cache: { warn: 30.6, danger: 60 },        // desc: danger > warn -> danger clamped to warn (31)
    fiveHour: { warn: -10, danger: 150 },     // clamped to 0..100
    weekly: { warn: 70.2, danger: 85.7 },     // rounded to 70, 86
  });

  assert.deepEqual(res, {
    context: { warn: 90, danger: 90 },
    cache: { warn: 31, danger: 31 },
    fiveHour: { warn: 0, danger: 100 },
    weekly: { warn: 70, danger: 86 },
  });
});

test('resolveModelWindow matches known models case-insensitively and falls back to 1M', () => {
  assert.equal(resolveModelWindow('gemini-4-neon-medium', DEFAULT_CONFIG), 512_000);
  assert.equal(resolveModelWindow('GEMINI-4-CARBON-HIGH', DEFAULT_CONFIG), 1_000_000);
  assert.equal(resolveModelWindow('claude-opus-4-6-xhigh', DEFAULT_CONFIG), 200_000);
  assert.equal(resolveModelWindow('gpt-oss-120b', DEFAULT_CONFIG), 128_000);
  assert.equal(resolveModelWindow('unknown-future-model', DEFAULT_CONFIG), 1_000_000);
  assert.equal(resolveModelWindow('', DEFAULT_CONFIG), 1_000_000);
  assert.equal(resolveModelWindow(null, DEFAULT_CONFIG), 1_000_000);

  const customCfg = { modelWindows: { 'my-custom': 64_000 } };
  assert.equal(resolveModelWindow('my-custom-v2', customCfg), 64_000);
});

test('formatModelLabel formats model ids and effort suffixes', () => {
  assert.equal(formatModelLabel('gemini-4-neon-medium'), 'Gemini 4 Neon (Medium)');
  assert.equal(formatModelLabel('claude-opus-4-6-xhigh'), 'Claude Opus 4 6 (Extra)');
  assert.equal(formatModelLabel('gemini-4-carbon-max'), 'Gemini 4 Carbon (Max)');
  assert.equal(formatModelLabel('gpt-oss'), 'Gpt Oss');
  assert.equal(formatModelLabel(''), '');
  assert.equal(formatModelLabel(null), '');
});

test('parseTranscriptFile parses turns, token metrics, ignores malformed lines, and detects compactions', () => {
  clearTranscriptCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-test-'));
  const filePath = path.join(tmpDir, 'transcript.jsonl');

  try {
    const lines = [
      'not json at all',
      '{ broken json line "PLANNER_RESPONSE"',
      JSON.stringify({ type: 'TOOL_RESULT', created_at: '2026-11-26T10:00:00.000Z', payload: 'ignored' }),
      JSON.stringify({ type: 'USER_INPUT', created_at: '2026-11-26T10:00:01.000Z' }),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 1,
        created_at: '2026-11-26T10:00:05.000Z',
        model: 'gemini-4-neon-medium',
        input_tokens: 10_000,
        cache_read_tokens: 90_000,
        output_tokens: 2_000,
      }),
      JSON.stringify({ type: 'USER_INPUT', created_at: '2026-11-26T10:01:00.000Z' }),
      // Prompt drops from 100k -> 30k (drop = 70k >= 15k and 30k < 65% of 100k) => compaction!
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 2,
        created_at: '2026-11-26T10:01:05.000Z',
        model: 'gemini-4-neon-medium',
        input_tokens: 5_000,
        cache_read_tokens: 25_000,
        output_tokens: 1_500,
      }),
    ];
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');

    const parsed = parseTranscriptFile(filePath, '11111111-1111-1111-1111-111111111111');
    assert.ok(parsed);
    assert.equal(parsed.conversationId, '11111111-1111-1111-1111-111111111111');
    assert.equal(parsed.turns, 2);
    assert.equal(parsed.events.length, 2);
    assert.deepEqual(parsed.compactions, { count: 1, before: 100_000, after: 30_000 });

    assert.equal(parsed.lastPlanner.stepIndex, 2);
    assert.equal(parsed.lastPlanner.model, 'gemini-4-neon-medium');
    assert.equal(parsed.lastPlanner.inputTokens, 5_000);
    assert.equal(parsed.lastPlanner.cacheReadTokens, 25_000);
    assert.equal(parsed.lastPlanner.outputTokens, 1_500);
    assert.equal(parsed.lastPlanner.promptTotal, 30_000);
    assert.equal(parsed.lastPlanner.contextTotal, 31_500);

    // Second call with unchanged file hits cache (same reference)
    const cached = parseTranscriptFile(filePath, '11111111-1111-1111-1111-111111111111');
    assert.strictEqual(cached, parsed);

    // Appending a new turn invalidates cache
    fs.appendFileSync(
      filePath,
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 3,
        created_at: '2026-11-26T10:02:00.000Z',
        model: 'gemini-4-neon-medium',
        input_tokens: 2_000,
        cache_read_tokens: 30_000,
        output_tokens: 500,
      }) + '\n',
      'utf8'
    );
    const reparsed = parseTranscriptFile(filePath, '11111111-1111-1111-1111-111111111111');
    assert.notStrictEqual(reparsed, parsed);
    assert.equal(reparsed.lastPlanner.stepIndex, 3);
    assert.equal(reparsed.events.length, 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseTranscriptFile does not flag small prompt drops as compaction and returns null for missing file', () => {
  clearTranscriptCache();
  assert.equal(parseTranscriptFile(path.join(os.tmpdir(), 'does-not-exist-agy.jsonl'), 'id'), null);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-test-'));
  const filePath = path.join(tmpDir, 'transcript.jsonl');
  try {
    const lines = [
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 1,
        created_at: '2026-11-26T10:00:00.000Z',
        input_tokens: 50_000,
        cache_read_tokens: 0,
        output_tokens: 500,
      }),
      // Drop is only 10k (< 15k) and 40k > 65% of 50k -> not a compaction
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 2,
        created_at: '2026-11-26T10:00:10.000Z',
        input_tokens: 40_000,
        cache_read_tokens: 0,
        output_tokens: 500,
      }),
    ];
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
    const parsed = parseTranscriptFile(filePath, '22222222-2222-2222-2222-222222222222');
    assert.equal(parsed.compactions, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveModelWindowInfo flags unknown or missing models as estimated', () => {
  assert.deepEqual(resolveModelWindowInfo('gemini-4-neon-medium', DEFAULT_CONFIG), {
    window: 512_000,
    estimated: false,
  });
  assert.deepEqual(resolveModelWindowInfo('unknown-next-gen-model', DEFAULT_CONFIG), {
    window: 1_000_000,
    estimated: true,
  });
  assert.deepEqual(resolveModelWindowInfo(null, DEFAULT_CONFIG), {
    window: 1_000_000,
    estimated: true,
  });
});

test('writeFileAtomic writes content atomically and leaves no temp files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-atomic-'));
  const target = path.join(tmpDir, 'data.json');
  try {
    writeFileAtomic(target, '{"v":1}\n');
    assert.equal(fs.readFileSync(target, 'utf8'), '{"v":1}\n');
    writeFileAtomic(target, '{"v":2}\n');
    assert.equal(fs.readFileSync(target, 'utf8'), '{"v":2}\n');
    const leftover = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftover, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseTranscriptFile handles incremental appends, partial lines without double-counting, and truncation', () => {
  clearTranscriptCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-inc-'));
  const filePath = path.join(tmpDir, 'transcript.jsonl');

  try {
    const line1 = JSON.stringify({
      type: 'USER_INPUT',
      created_at: '2026-11-26T10:00:00.000Z',
    });
    const line2 = JSON.stringify({
      type: 'PLANNER_RESPONSE',
      step_index: 1,
      created_at: '2026-11-26T10:00:05.000Z',
      model: 'gemini-4-neon-medium',
      input_tokens: 1000,
      cache_read_tokens: 9000,
      output_tokens: 200,
    });
    // Write line1 with newline + complete line2 WITHOUT trailing newline
    fs.writeFileSync(filePath, `${line1}\n${line2}`, 'utf8');

    const p1 = parseTranscriptFile(filePath, '33333333-3333-3333-3333-333333333333');
    assert.equal(p1.turns, 1);
    assert.equal(p1.events.length, 1);
    assert.equal(p1.lastPlanner.stepIndex, 1);

    // Now finish line2 with newline and append a partial line3
    const line3 = JSON.stringify({
      type: 'PLANNER_RESPONSE',
      step_index: 2,
      created_at: '2026-11-26T10:00:15.000Z',
      model: 'gemini-4-neon-medium',
      input_tokens: 500,
      cache_read_tokens: 10000,
      output_tokens: 300,
    });
    const splitAt = Math.floor(line3.length / 2);
    fs.appendFileSync(filePath, `\n${line3.slice(0, splitAt)}`, 'utf8');

    const p2 = parseTranscriptFile(filePath, '33333333-3333-3333-3333-333333333333');
    // line2 must NOT be double-counted; partial line3 is ignored until complete
    assert.equal(p2.turns, 1);
    assert.equal(p2.events.length, 1);
    assert.equal(p2.lastPlanner.stepIndex, 1);

    // Finish line3 + newline
    fs.appendFileSync(filePath, `${line3.slice(splitAt)}\n`, 'utf8');
    const p3 = parseTranscriptFile(filePath, '33333333-3333-3333-3333-333333333333');
    assert.equal(p3.turns, 1);
    assert.equal(p3.events.length, 2);
    assert.equal(p3.lastPlanner.stepIndex, 2);

    // Truncate file to smaller size -> triggers clean full reparse
    const fresh = JSON.stringify({
      type: 'PLANNER_RESPONSE',
      step_index: 99,
      created_at: '2026-11-26T11:00:00.000Z',
      model: 'gpt-oss',
      input_tokens: 100,
      cache_read_tokens: 0,
      output_tokens: 50,
    });
    fs.writeFileSync(filePath, `${fresh}\n`, 'utf8');
    const p4 = parseTranscriptFile(filePath, '33333333-3333-3333-3333-333333333333');
    assert.equal(p4.turns, 0);
    assert.equal(p4.events.length, 1);
    assert.equal(p4.lastPlanner.stepIndex, 99);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('transcriptCache enforces TRANSCRIPT_CACHE_MAX LRU limit', () => {
  clearTranscriptCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-lru-'));
  try {
    const total = TRANSCRIPT_CACHE_MAX + 10;
    for (let i = 0; i < total; i++) {
      const f = path.join(tmpDir, `t-${i}.jsonl`);
      fs.writeFileSync(f, JSON.stringify({ type: 'USER_INPUT', created_at: '2026-11-26T10:00:00.000Z' }) + '\n', 'utf8');
      parseTranscriptFile(f, `id-${i}`);
    }
    assert.equal(transcriptCache.size, TRANSCRIPT_CACHE_MAX);
  } finally {
    clearTranscriptCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('isAllowedOrigin accepts Electron/local origins and rejects external web origins', () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin('null'), true);
  assert.equal(isAllowedOrigin('vscode-file://vscode-app'), true);
  assert.equal(isAllowedOrigin('antigravity-ide://shell'), true);
  assert.equal(isAllowedOrigin('file://'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:39229'), true);
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);

  assert.equal(isAllowedOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1.evil.com'), false);
  assert.equal(isAllowedOrigin('https://google.com'), false);
});

test('HTTP server enforces CORS/Origin rules and serves /health and /api/status', async () => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // Allowed origin GET /health
    const r1 = await fetch(`${base}/health`, { headers: { Origin: 'vscode-file://vscode-app' } });
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('access-control-allow-origin'), 'vscode-file://vscode-app');
    const h1 = await r1.json();
    assert.equal(h1.ok, true);
    assert.equal(h1.version, APP_VERSION);

    // Disallowed origin GET /health -> no ACAO header
    const r2 = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('access-control-allow-origin'), null);

    // Disallowed origin OPTIONS -> 403
    const r3 = await fetch(`${base}/api/config`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(r3.status, 403);

    // Allowed origin OPTIONS -> 204
    const r4 = await fetch(`${base}/api/config`, {
      method: 'OPTIONS',
      headers: { Origin: 'antigravity-ide://main' },
    });
    assert.equal(r4.status, 204);
    assert.equal(r4.headers.get('access-control-allow-origin'), 'antigravity-ide://main');

    // Disallowed origin POST /api/config -> 403 Forbidden
    const r5 = await fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'ru' }),
    });
    assert.equal(r5.status, 403);

    // Disallowed origin POST /api/quota-sync -> 403 Forbidden
    const r6 = await fetch(`${base}/api/quota-sync`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fiveHour: { percent: 50 } }),
    });
    assert.equal(r6.status, 403);

    // GET /api/status
    const r7 = await fetch(`${base}/api/status`);
    assert.equal(r7.status, 200);
    const st = await r7.json();
    assert.equal(st.version, APP_VERSION);
    assert.ok(st.localUsage && st.config);

    // Unknown route -> 404
    const r8 = await fetch(`${base}/does-not-exist`);
    assert.equal(r8.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
