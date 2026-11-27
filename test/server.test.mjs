import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const asarPatcher = require('../asar-patcher.cjs');

import {
  APP_VERSION,
  SUPPORTED_LANGS,
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
  formatModelShort,
  parseTranscriptFile,
  clearTranscriptCache,
  collectUsageSummary,
  parseDaemonQuotaSummary,
  parseDaemonPlan,
  syncQuotasFromLocalDaemon,
  ensureLoaderAttached,
  createHttpServer,
} from '../server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('APP_VERSION matches package.json version', () => {
  assert.equal(APP_VERSION, pkg.version);
});

test('SUPPORTED_LANGS in server.mjs stay in sync with widget.js I18N and lang buttons', () => {
  const widgetSrc = fs.readFileSync(path.join(__dirname, '..', 'widget.js'), 'utf8');
  assert.deepEqual(SUPPORTED_LANGS, ['en', 'de', 'fr', 'zh', 'ru', 'uk']);
  for (const code of SUPPORTED_LANGS) {
    assert.match(widgetSrc, new RegExp(`\\b${code}:\\s*\\{`), `widget.js I18N missing "${code}"`);
    assert.match(widgetSrc, new RegExp(`data-lang="${code}"`), `widget.js popover missing button for "${code}"`);
  }
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

test('parseTranscriptFile updates context immediately on CHECKPOINT without double-counting compaction', () => {
  clearTranscriptCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-ckpt-'));
  const filePath = path.join(tmpDir, 'transcript.jsonl');
  try {
    const initial = [
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 10,
        created_at: '2026-11-26T17:55:25Z',
        model: 'gemini-4-neon-medium',
        input_tokens: 2410,
        cache_read_tokens: 282656,
        output_tokens: 239,
      }),
      JSON.stringify({
        type: 'CHECKPOINT',
        step_index: 11,
        created_at: '2026-11-26T17:56:27Z',
        input_tokens: 3199,
        cache_read_tokens: 283017,
        output_tokens: 2585,
        content: '# Resuming from a compaction',
      }),
    ];
    fs.writeFileSync(filePath, initial.join('\n') + '\n', 'utf8');

    const afterCkpt = parseTranscriptFile(filePath, '33333333-3333-3333-3333-333333333333');
    assert.equal(afterCkpt.lastPlanner.model, 'gemini-4-neon-medium');
    assert.equal(afterCkpt.lastPlanner.contextTotal, 2585);
    assert.equal(afterCkpt.lastPlanner.cacheReadTokens, 0);
    assert.deepEqual(afterCkpt.compactions, { count: 1, before: 286216, after: 2585 });

    // Next PLANNER_RESPONSE updates real post-compaction context without incrementing count again
    fs.appendFileSync(
      filePath,
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        step_index: 12,
        created_at: '2026-11-26T17:58:59Z',
        model: 'gemini-4-neon-medium',
        input_tokens: 22352,
        cache_read_tokens: 0,
        output_tokens: 507,
      }) + '\n',
      'utf8'
    );
    const afterNext = parseTranscriptFile(filePath, '33333333-3333-3333-3333-333333333333');
    assert.equal(afterNext.lastPlanner.contextTotal, 22859);
    assert.deepEqual(afterNext.compactions, { count: 1, before: 286216, after: 22352 });
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

test('formatModelShort produces compact model badges', () => {
  assert.equal(formatModelShort('gemini-4-neon-medium'), 'Neon');
  assert.equal(formatModelShort('gemini-4-carbon-high'), 'Carbon');
  assert.equal(formatModelShort('claude-opus-4-6-xhigh'), 'Opus 4.6');
  assert.equal(formatModelShort('claude-sonnet-5-5'), 'Sonnet 5.5');
  assert.equal(formatModelShort('gpt-oss-120b'), 'GPT-OSS');
  assert.equal(formatModelShort(''), '');
  assert.equal(formatModelShort(null), '');
});

test('collectUsageSummary aggregates requests and tokens by model and day within window', () => {
  clearTranscriptCache();
  const brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-brain-'));
  try {
    const conv1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const conv2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const logs1 = path.join(brainDir, conv1, '.system_generated', 'logs');
    const logs2 = path.join(brainDir, conv2, '.system_generated', 'logs');
    fs.mkdirSync(logs1, { recursive: true });
    fs.mkdirSync(logs2, { recursive: true });

    const now = Date.now();
    const todayIso = new Date(now - 60_000).toISOString();
    const yestIso = new Date(now - 24 * 3600_000).toISOString();
    const oldIso = new Date(now - 20 * 24 * 3600_000).toISOString();

    fs.writeFileSync(
      path.join(logs1, 'transcript.jsonl'),
      [
        JSON.stringify({
          type: 'PLANNER_RESPONSE',
          created_at: todayIso,
          model: 'gemini-4-neon-medium',
          input_tokens: 1000,
          cache_read_tokens: 4000,
          output_tokens: 500,
        }),
        JSON.stringify({
          type: 'PLANNER_RESPONSE',
          created_at: oldIso, // outside 7d window
          model: 'gemini-4-neon-medium',
          input_tokens: 9999,
          cache_read_tokens: 0,
          output_tokens: 1,
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    fs.writeFileSync(
      path.join(logs2, 'transcript.jsonl'),
      JSON.stringify({
        type: 'PLANNER_RESPONSE',
        created_at: yestIso,
        model: 'claude-opus-4-6-high',
        input_tokens: 2000,
        cache_read_tokens: 8000,
        output_tokens: 1000,
      }) + '\n',
      'utf8'
    );

    const summary = collectUsageSummary(7, brainDir);
    assert.equal(summary.days, 7);
    assert.equal(summary.total.conversations, 2);
    assert.equal(summary.total.requests, 2);
    assert.equal(summary.total.effectiveTokens, 4500);
    assert.equal(summary.total.totalTokens, 16500);
    assert.equal(summary.byModel['gemini-4-neon-medium'].effectiveTokens, 1500);
    assert.equal(summary.byModel['claude-opus-4-6-high'].effectiveTokens, 3000);
    assert.equal(Object.keys(summary.byDay).length, 2);
  } finally {
    clearTranscriptCache();
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('HTTP server serves SSE /api/events and /api/usage-summary with Origin protection', async () => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // Disallowed origin on /api/events -> 403
    const badSse = await fetch(`${base}/api/events`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(badSse.status, 403);

    // Allowed origin on /api/events -> text/event-stream with initial status event
    const ac = new AbortController();
    const sseResp = await fetch(`${base}/api/events`, {
      headers: { Origin: 'vscode-file://vscode-app' },
      signal: ac.signal,
    });
    assert.equal(sseResp.status, 200);
    assert.match(sseResp.headers.get('content-type') || '', /text\/event-stream/i);

    const reader = sseResp.body.getReader();
    const decoder = new TextDecoder();
    let chunkText = '';
    while (!chunkText.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      chunkText += decoder.decode(value, { stream: true });
    }
    ac.abort();

    assert.match(chunkText, /^event: status\n/m);
    const dataLine = chunkText.split('\n').find((l) => l.startsWith('data: '));
    assert.ok(dataLine);
    const payload = JSON.parse(dataLine.slice(6));
    assert.equal(payload.version, APP_VERSION);
    assert.equal(typeof payload.config.showModelBadge, 'boolean');
    assert.equal(typeof payload.subagents.activeCount, 'number');

    // GET /api/usage-summary
    const sumResp = await fetch(`${base}/api/usage-summary?days=3`);
    assert.equal(sumResp.status, 200);
    const sum = await sumResp.json();
    assert.equal(sum.days, 3);
    assert.ok(sum.total && sum.byModel && sum.byDay);
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('parseDaemonQuotaSummary extracts Gemini 5h and weekly buckets accurately', () => {
  const sample = {
    response: {
      groups: [
        {
          displayName: 'Claude and GPT models',
          buckets: [{ window: '5h', remainingFraction: 0.1, resetTime: '2026-11-26T20:00:00Z' }],
        },
        {
          displayName: 'Gemini Models',
          buckets: [
            { window: 'weekly', remainingFraction: 0.72, resetTime: '2026-12-02T12:00:00Z', displayName: 'Weekly' },
            { window: '5h', remainingFraction: 0.85, resetTime: '2026-11-26T21:00:00Z', displayName: '5 hours' },
          ],
        },
      ],
    },
  };
  const parsed = parseDaemonQuotaSummary(sample);
  assert.ok(parsed);
  assert.equal(parsed.fiveHour.percent, 15);
  assert.equal(parsed.fiveHour.resetsAt, '2026-11-26T21:00:00Z');
  assert.equal(parsed.weekly.percent, 28);
  assert.equal(parsed.weekly.resetsAt, '2026-12-02T12:00:00Z');
  assert.equal(parseDaemonQuotaSummary({ response: { groups: [] } }), null);
});

test('parseDaemonPlan extracts short plan name and label without email', () => {
  assert.deepEqual(
    parseDaemonPlan({
      userStatus: {
        email: 'secret@example.com',
        userTier: { name: 'Google AI Pro' },
        planStatus: { planInfo: { planName: 'Pro' } },
      },
    }),
    { short: 'Pro', label: 'Google AI Pro' }
  );
  assert.deepEqual(
    parseDaemonPlan({
      userStatus: {
        userTier: { name: 'Google AI Ultra' },
      },
    }),
    { short: 'Ultra', label: 'Google AI Ultra' }
  );
  assert.equal(parseDaemonPlan({ userStatus: {} }), null);
  assert.equal(parseDaemonPlan(null), null);
});

test('syncQuotasFromLocalDaemon reads hub_*.json and fetches RetrieveUserQuotaSummary and GetUserStatus from mock daemon', async () => {
  const httpMod = await import('node:http');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-daemon-'));
  const expectedCsrf = 'test-csrf-token-123';
  const receivedPaths = [];
  let receivedCsrf = '';

  const mockDaemon = httpMod.default.createServer((req, res) => {
    receivedPaths.push(req.url);
    receivedCsrf = req.headers['x-codeium-csrf-token'];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.endsWith('/GetUserStatus')) {
      res.end(
        JSON.stringify({
          userStatus: {
            email: 'hidden@example.com',
            userTier: { name: 'Google AI Pro' },
            planStatus: { planInfo: { planName: 'Pro' } },
          },
        })
      );
      return;
    }
    res.end(
      JSON.stringify({
        response: {
          groups: [
            {
              displayName: 'Gemini Models',
              buckets: [
                { window: '5h', remainingFraction: 0.6, resetTime: '2026-11-26T22:00:00Z' },
                { window: 'weekly', remainingFraction: 0.9, resetTime: '2026-12-03T00:00:00Z' },
              ],
            },
          ],
        },
      })
    );
  });

  await new Promise((resolve) => mockDaemon.listen(0, '127.0.0.1', resolve));
  const { port } = mockDaemon.address();

  try {
    fs.writeFileSync(
      path.join(tmpDir, `hub_${port}.json`),
      JSON.stringify({ pid: process.pid, httpPort: port, csrfToken: expectedCsrf }),
      'utf8'
    );

    const res = await syncQuotasFromLocalDaemon({ force: true, daemonDir: tmpDir, persist: false });
    assert.equal(res.ok, true);
    assert.ok(receivedPaths.includes('/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary'));
    assert.ok(receivedPaths.includes('/exa.language_server_pb.LanguageServerService/GetUserStatus'));
    assert.equal(receivedCsrf, expectedCsrf);
    assert.equal(res.officialQuotas.source, 'ide-daemon');
    assert.equal(res.officialQuotas.fiveHour.percent, 40);
    assert.equal(res.officialQuotas.weekly.percent, 10);
    assert.deepEqual(res.plan, { short: 'Pro', label: 'Google AI Pro' });
    assert.equal('email' in res.plan, false);
  } finally {
    await new Promise((resolve) => mockDaemon.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ensureLoaderAttached self-heals app.asar after updates (standalone and features-v2) and respects uninstalling.lock', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sl-heal-'));
  const asarPath = path.join(tmpDir, 'app.asar');
  const fv2Dir = path.join(tmpDir, 'fv2');
  const fv2Bundle = path.join(fv2Dir, 'localization_injected.js');
  const lockFile = path.join(tmpDir, 'uninstalling.lock');
  const loaderFile = path.join(__dirname, '..', 'loader.js');

  try {
    // 1. Standalone mode: unpatched app.asar gets healed automatically
    asarPatcher.buildSyntheticAsar(
      {
        'dist/preload.js': 'console.log("clean updated preload");\n',
        'package.json': '{"name":"antigravity"}\n',
      },
      asarPath
    );
    const res1 = ensureLoaderAttached({
      asarPath,
      featuresV2Dir: '',
      featuresV2Bundle: '',
      loaderFile,
      lockFile,
      force: true,
    });
    assert.equal(res1.action, 'healed_asar');
    assert.equal(res1.healedAsar, true);
    assert.ok(asarPatcher.isAsarPatched(asarPath));

    // Second check on already-patched app.asar is a clean no-op
    const res2 = ensureLoaderAttached({
      asarPath,
      featuresV2Dir: '',
      featuresV2Bundle: '',
      loaderFile,
      lockFile,
      force: true,
    });
    assert.equal(res2.action, 'ok');
    assert.equal(res2.healedAsar, false);

    // 2. features-v2 mode: clean app.asar + clean localization_injected.js -> re-attaches bundle AND heals app.asar
    fs.mkdirSync(fv2Dir, { recursive: true });
    fs.writeFileSync(fv2Bundle, 'console.log("fresh fv2");\n', 'utf8');
    asarPatcher.buildSyntheticAsar(
      { 'dist/preload.js': 'console.log("fv2 patched without statusline");\n' },
      asarPath
    );
    let autoPatcherCalled = false;
    const res3 = ensureLoaderAttached({
      asarPath,
      featuresV2Dir: fv2Dir,
      featuresV2Bundle: fv2Bundle,
      loaderFile,
      lockFile,
      force: true,
      runAutoPatcher: () => {
        autoPatcherCalled = true;
        // Simulate auto_patcher.cjs packing localization_injected.js into app.asar
        const injected = fs.readFileSync(fv2Bundle, 'utf8');
        asarPatcher.buildSyntheticAsar({ 'dist/preload.js': injected }, asarPath);
      },
    });
    assert.equal(autoPatcherCalled, true);
    assert.equal(res3.reattachedBundle, true);
    assert.equal(res3.healedAsar, true);
    assert.ok(fs.readFileSync(fv2Bundle, 'utf8').includes('ANTIGRAVITY_STATUSLINE_LOADER_V1'));
    assert.ok(asarPatcher.readFileFromAsar(asarPath, 'dist/preload.js').toString('utf8').includes('ANTIGRAVITY_STATUSLINE_LOADER_V1'));

    // 3. Respects uninstalling.lock
    fs.writeFileSync(lockFile, '1', 'utf8');
    const res4 = ensureLoaderAttached({ asarPath, loaderFile, lockFile, force: true });
    assert.equal(res4.action, 'locked');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
