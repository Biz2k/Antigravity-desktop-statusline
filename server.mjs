import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import readline from 'readline';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const asarPatcher = require('./asar-patcher.cjs');

const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {}
  return '1.1.0';
})();

const PORT = 39229;
const HOST = '127.0.0.1';
const USER_HOME = os.homedir();
const BRAIN_DIR = path.join(USER_HOME, '.gemini', 'antigravity', 'brain');
const DAEMON_DIR = path.join(USER_HOME, '.gemini', 'antigravity', 'daemon');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const STATE_FILE = path.join(__dirname, 'state.json');
const WIDGET_FILE = path.join(__dirname, 'widget.js');
const LOADER_FILE = path.join(__dirname, 'loader.js');
const LOG_FILE = path.join(__dirname, 'statusline.log');
const FEATURES_V2_DIR = path.join(USER_HOME, '.antigravity-features-v2');
const FEATURES_V2_BUNDLE = path.join(FEATURES_V2_DIR, 'localization_injected.js');

const SUPPORTED_LANGS = ['en', 'de', 'fr', 'zh', 'ru', 'uk'];

const DEFAULT_THRESHOLDS = {
  context: { warn: 80, danger: 95 },
  cache: { warn: 50, danger: 20 },
  fiveHour: { warn: 80, danger: 95 },
  weekly: { warn: 80, danger: 95 },
};

const DEFAULT_CONFIG = {
  enabled: true,
  lang: 'en',
  collapsed: false,
  showCache: true,
  showFirstRow: true,
  showModelBadge: false,
  showPlanBadge: true,
  showCompacts: true,
  showCompactBtn: true,
  showFiveHour: true,
  showWeekly: true,
  fiveHourBudgetTokens: 1_500_000,
  weeklyBudgetTokens: 15_000_000,
  thresholds: DEFAULT_THRESHOLDS,
  modelWindows: {
    'gemini-4-neon': 512_000,
    'gemini-4-carbon': 1_000_000,
    'gemini-4-argon': 1_000_000,
    'gemini-4-hydrogen': 1_000_000,
    'gemini-3': 1_000_000,
    'claude-opus-5-5': 1_000_000,
    'claude-sonnet-5-5': 1_000_000,
    'claude-opus-4-6': 200_000,
    'claude-sonnet-4-6': 200_000,
    'gpt-oss': 128_000,
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIVE_HOURS_MS = 5 * 3600 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

function log(msg) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 256 * 1024) {
      const raw = fs.readFileSync(LOG_FILE);
      fs.writeFileSync(LOG_FILE, raw.subarray(Math.max(0, raw.length - 64 * 1024)));
    }
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch {}
}

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return fallback;
}

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

function writeJsonSafe(filePath, obj) {
  try {
    writeFileAtomic(filePath, JSON.stringify(obj, null, 2) + '\n');
  } catch (err) {
    log(`writeJsonSafe(${filePath}) error: ${err.message}`);
  }
}

function sanitizeThresholds(raw) {
  const clamp = (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fb;
  };
  const src = raw && typeof raw === 'object' ? raw : {};
  const asc = (key) => {
    const d = DEFAULT_THRESHOLDS[key];
    const s = src[key] && typeof src[key] === 'object' ? src[key] : {};
    let warn = clamp(s.warn, d.warn);
    let danger = clamp(s.danger, d.danger);
    if (warn > danger) warn = danger;
    return { warn, danger };
  };
  const desc = (key) => {
    const d = DEFAULT_THRESHOLDS[key];
    const s = src[key] && typeof src[key] === 'object' ? src[key] : {};
    let warn = clamp(s.warn, d.warn);
    let danger = clamp(s.danger, d.danger);
    if (danger > warn) danger = warn;
    return { warn, danger };
  };
  return {
    context: asc('context'),
    cache: desc('cache'),
    fiveHour: asc('fiveHour'),
    weekly: asc('weekly'),
  };
}

function getConfig() {
  const saved = readJsonSafe(CONFIG_FILE, {});
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    thresholds: sanitizeThresholds(saved.thresholds),
    modelWindows: {
      ...DEFAULT_CONFIG.modelWindows,
      ...(saved.modelWindows || {}),
    },
  };
}

function saveConfig(patch) {
  const current = getConfig();
  const next = {
    ...current,
    ...patch,
    thresholds: sanitizeThresholds(
      patch.thresholds
        ? {
            context: { ...current.thresholds.context, ...(patch.thresholds.context || {}) },
            cache: { ...current.thresholds.cache, ...(patch.thresholds.cache || {}) },
            fiveHour: { ...current.thresholds.fiveHour, ...(patch.thresholds.fiveHour || {}) },
            weekly: { ...current.thresholds.weekly, ...(patch.thresholds.weekly || {}) },
          }
        : current.thresholds
    ),
    modelWindows: {
      ...current.modelWindows,
      ...(patch.modelWindows || {}),
    },
  };
  writeJsonSafe(CONFIG_FILE, next);
  return next;
}

function getState() {
  return readJsonSafe(STATE_FILE, { officialQuotas: null });
}

function saveState(next) {
  writeJsonSafe(STATE_FILE, next);
  return next;
}

function resolveModelWindowInfo(modelId, cfg) {
  if (!modelId || typeof modelId !== 'string') {
    return { window: 1_000_000, estimated: true };
  }
  const lower = modelId.toLowerCase();
  const windows = (cfg && cfg.modelWindows) || DEFAULT_CONFIG.modelWindows;
  for (const [prefix, size] of Object.entries(windows)) {
    if (lower.includes(prefix.toLowerCase())) {
      return { window: size, estimated: false };
    }
  }
  return { window: 1_000_000, estimated: true };
}

function resolveModelWindow(modelId, cfg) {
  return resolveModelWindowInfo(modelId, cfg).window;
}

function formatModelLabel(modelId) {
  if (!modelId || typeof modelId !== 'string') return '';
  const m = modelId.toLowerCase();
  const effortMatch = m.match(/-(xhigh|high|medium|low|max)$/);
  const effortMap = { xhigh: 'Extra', high: 'High', medium: 'Medium', low: 'Low', max: 'Max' };
  const effort = effortMatch ? effortMap[effortMatch[1]] : null;
  const base = effortMatch ? modelId.slice(0, -effortMatch[0].length) : modelId;
  const pretty = base
    .split('-')
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
  return effort ? `${pretty} (${effort})` : pretty;
}

function formatModelShort(modelId) {
  if (!modelId || typeof modelId !== 'string') return '';
  const base = modelId.replace(/-(xhigh|high|medium|low|max)$/i, '');
  const lower = base.toLowerCase();
  const g4 = lower.match(/^gemini-4-([a-z0-9]+)/);
  if (g4) return g4[1].charAt(0).toUpperCase() + g4[1].slice(1);
  const g3 = lower.match(/^gemini-(3(?:\.\d+)?)-([a-z0-9]+)/);
  if (g3) return `G${g3[1]} ${g3[2].charAt(0).toUpperCase() + g3[2].slice(1)}`;
  const claude = lower.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) return `${claude[1].charAt(0).toUpperCase() + claude[1].slice(1)} ${claude[2]}.${claude[3]}`;
  if (lower.startsWith('gpt-oss')) return 'GPT-OSS';
  return formatModelLabel(base).slice(0, 18);
}

// Per-transcript LRU cache keyed by path -> { mtimeMs, size, ino, byteOffset, state, parsed }
const TRANSCRIPT_CACHE_MAX = 50;
const transcriptCache = new Map();

function createParserState() {
  return {
    startedAtMs: null,
    turns: 0,
    lastPlanner: null,
    prevPromptTotal: null,
    pendingCheckpoint: false,
    compactionsCount: 0,
    lastCompactionBefore: null,
    lastCompactionAfter: null,
    events: [], // { tsMs, effectiveTokens, totalTokens }
  };
}

function applyTranscriptLine(state, line, fallbackMtimeMs) {
  if (!line || line[0] !== '{') return;
  // Fast pre-check before JSON.parse on multi-MB transcripts
  const isPlanner = line.includes('"PLANNER_RESPONSE"');
  const isUser = !isPlanner && line.includes('"USER_INPUT"');
  const isCheckpoint = !isPlanner && !isUser && line.includes('"CHECKPOINT"');
  if (!isPlanner && !isUser && !isCheckpoint) return;

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }

  const tsMs = obj.created_at ? Date.parse(obj.created_at) : NaN;
  if (Number.isFinite(tsMs) && (state.startedAtMs === null || tsMs < state.startedAtMs)) {
    state.startedAtMs = tsMs;
  }

  if (obj.type === 'USER_INPUT') {
    state.turns++;
    return;
  }

  if (obj.type === 'CHECKPOINT') {
    const inputTokens = Number(obj.input_tokens) || 0;
    const cacheReadTokens = Number(obj.cache_read_tokens) || 0;
    const outputTokens = Number(obj.output_tokens) || 0;
    const beforeTokens =
      inputTokens + cacheReadTokens > 0
        ? inputTokens + cacheReadTokens
        : state.prevPromptTotal || (state.lastPlanner ? state.lastPlanner.promptTotal : 0);
    const summaryTokens =
      outputTokens > 0
        ? outputTokens
        : typeof obj.content === 'string' && obj.content.length > 0
          ? Math.max(1, Math.round(obj.content.length / 4))
          : 0;

    const effectiveTokens = inputTokens + outputTokens;
    const totalTokens = inputTokens + cacheReadTokens + outputTokens;
    if (Number.isFinite(tsMs) && (effectiveTokens > 0 || totalTokens > 0)) {
      state.events.push({
        tsMs,
        effectiveTokens,
        totalTokens,
        model: (state.lastPlanner && state.lastPlanner.model) || obj.model || null,
      });
    }

    if (beforeTokens > 0) {
      state.compactionsCount++;
      state.lastCompactionBefore = beforeTokens;
      state.lastCompactionAfter = summaryTokens;
      state.pendingCheckpoint = true;
      state.prevPromptTotal = summaryTokens;
    }

    if (state.lastPlanner) {
      state.lastPlanner = {
        ...state.lastPlanner,
        stepIndex: obj.step_index ?? state.lastPlanner.stepIndex,
        createdAt: obj.created_at || state.lastPlanner.createdAt,
        tsMs: Number.isFinite(tsMs) ? tsMs : fallbackMtimeMs,
        inputTokens: summaryTokens,
        cacheReadTokens: 0,
        outputTokens: 0,
        promptTotal: summaryTokens,
        contextTotal: summaryTokens,
      };
    }
    return;
  }

  if (obj.type === 'PLANNER_RESPONSE') {
    const inputTokens = Number(obj.input_tokens) || 0;
    const cacheReadTokens = Number(obj.cache_read_tokens) || 0;
    const outputTokens = Number(obj.output_tokens) || 0;
    const promptTotal = inputTokens + cacheReadTokens;
    const contextTotal = promptTotal + outputTokens;

    if (state.pendingCheckpoint) {
      if (promptTotal > 0) {
        state.lastCompactionAfter = promptTotal;
      }
      state.pendingCheckpoint = false;
    } else if (state.prevPromptTotal !== null && state.prevPromptTotal >= 20_000 && promptTotal > 0) {
      const drop = state.prevPromptTotal - promptTotal;
      if (drop >= 15_000 && promptTotal < state.prevPromptTotal * 0.65) {
        state.compactionsCount++;
        state.lastCompactionBefore = state.prevPromptTotal;
        state.lastCompactionAfter = promptTotal;
      }
    }
    if (promptTotal > 0) {
      state.prevPromptTotal = promptTotal;
    }

    const effectiveTokens = inputTokens + outputTokens;
    if (Number.isFinite(tsMs) && (effectiveTokens > 0 || contextTotal > 0)) {
      state.events.push({ tsMs, effectiveTokens, totalTokens: contextTotal, model: obj.model || null });
    }

    state.lastPlanner = {
      stepIndex: obj.step_index,
      createdAt: obj.created_at || null,
      tsMs: Number.isFinite(tsMs) ? tsMs : fallbackMtimeMs,
      model: obj.model || null,
      inputTokens,
      cacheReadTokens,
      outputTokens,
      promptTotal,
      contextTotal,
    };
  }
}

function buildParsedSnapshot(convId, st, state) {
  return {
    conversationId: convId,
    mtimeMs: st.mtimeMs,
    startedAtMs: state.startedAtMs || st.birthtimeMs || st.mtimeMs,
    turns: state.turns,
    lastPlanner: state.lastPlanner,
    compactions: state.compactionsCount > 0
      ? { count: state.compactionsCount, before: state.lastCompactionBefore, after: state.lastCompactionAfter }
      : null,
    events: state.events,
  };
}

function setTranscriptCacheEntry(filePath, entry) {
  if (transcriptCache.has(filePath)) {
    transcriptCache.delete(filePath);
  }
  transcriptCache.set(filePath, entry);
  while (transcriptCache.size > TRANSCRIPT_CACHE_MAX) {
    const oldestKey = transcriptCache.keys().next().value;
    if (oldestKey === undefined) break;
    transcriptCache.delete(oldestKey);
  }
}

function parseTranscriptFile(filePath, convId) {
  let st;
  try {
    st = fs.statSync(filePath);
  } catch {
    return null;
  }

  const cached = transcriptCache.get(filePath);
  const sameInode = !!(cached && cached.ino === st.ino);

  if (cached && sameInode && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    // Refresh LRU order
    setTranscriptCacheEntry(filePath, cached);
    return cached.parsed;
  }

  const canIncremental = !!(cached && sameInode && st.size >= cached.byteOffset);
  const state = canIncremental ? cached.state : createParserState();
  let byteOffset = canIncremental ? cached.byteOffset : 0;

  const bytesToRead = st.size - byteOffset;
  let trailingLine = '';

  if (bytesToRead > 0) {
    let buf;
    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
      buf = Buffer.allocUnsafe(bytesToRead);
      let totalRead = 0;
      while (totalRead < bytesToRead) {
        const n = fs.readSync(fd, buf, totalRead, bytesToRead - totalRead, byteOffset + totalRead);
        if (n <= 0) break;
        totalRead += n;
      }
      if (totalRead < bytesToRead) {
        buf = buf.subarray(0, totalRead);
      }
    } catch {
      return null;
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }

    // Commit only complete newline-terminated lines so UTF-8 multi-byte chars and partial writes are never split
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl !== -1) {
      const completeChunk = buf.subarray(0, lastNl + 1).toString('utf8');
      const lines = completeChunk.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        applyTranscriptLine(state, lines[i], st.mtimeMs);
      }
      byteOffset += lastNl + 1;
    }

    if (lastNl + 1 < buf.length) {
      trailingLine = buf.subarray(lastNl + 1).toString('utf8').replace(/\r$/, '');
    }
  }

  // If the file has a complete trailing JSON line without a final newline, apply it ephemerally for this snapshot
  // without advancing byteOffset so it won't be double-counted once a newline is appended.
  let snapshotState = state;
  if (trailingLine) {
    snapshotState = { ...state, events: state.events.slice() };
    applyTranscriptLine(snapshotState, trailingLine, st.mtimeMs);
  }

  const parsed = buildParsedSnapshot(convId, st, snapshotState);
  setTranscriptCacheEntry(filePath, {
    mtimeMs: st.mtimeMs,
    size: st.size,
    ino: st.ino,
    byteOffset,
    state,
    parsed,
  });
  return parsed;
}

let lastAggregateAt = 0;
let cachedAggregate = null;

function collectAllMetrics(requestedConvId) {
  const now = Date.now();
  const cfg = getConfig();
  const state = getState();

  let entries = [];
  try {
    if (fs.existsSync(BRAIN_DIR)) {
      entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    }
  } catch {}

  const candidates = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || !UUID_RE.test(ent.name)) continue;
    const tPath = path.join(BRAIN_DIR, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      const st = fs.statSync(tPath);
      candidates.push({ convId: ent.name, tPath, mtimeMs: st.mtimeMs });
    } catch {}
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  let activeCandidate = null;
  if (requestedConvId && UUID_RE.test(requestedConvId)) {
    activeCandidate = candidates.find((c) => c.convId.toLowerCase() === requestedConvId.toLowerCase()) || null;
  }
  if (!activeCandidate && candidates.length > 0) {
    activeCandidate = candidates[0];
  }

  const activeParsed = activeCandidate ? parseTranscriptFile(activeCandidate.tPath, activeCandidate.convId) : null;

  // Rolling 5h and 7d usage across all recent conversations (cached for 2s)
  if (!cachedAggregate || now - lastAggregateAt > 2000) {
    const cutoff30m = now - 30 * 60_000;
    const cutoff5h = now - FIVE_HOURS_MS;
    const cutoff7d = now - SEVEN_DAYS_MS;
    let eff30m = 0;
    let oldest30m = null;
    let eff5h = 0;
    let total5h = 0;
    let req5h = 0;
    let oldest5h = null;
    let eff7d = 0;
    let total7d = 0;
    let req7d = 0;
    let oldest7d = null;

    for (const c of candidates) {
      if (c.mtimeMs < cutoff7d - 60_000) continue;
      const p = parseTranscriptFile(c.tPath, c.convId);
      if (!p) continue;
      for (const ev of p.events) {
        if (ev.tsMs >= cutoff7d) {
          eff7d += ev.effectiveTokens;
          total7d += ev.totalTokens;
          req7d++;
          if (oldest7d === null || ev.tsMs < oldest7d) oldest7d = ev.tsMs;
        }
        if (ev.tsMs >= cutoff5h) {
          eff5h += ev.effectiveTokens;
          total5h += ev.totalTokens;
          req5h++;
          if (oldest5h === null || ev.tsMs < oldest5h) oldest5h = ev.tsMs;
        }
        if (ev.tsMs >= cutoff30m) {
          eff30m += ev.effectiveTokens;
          if (oldest30m === null || ev.tsMs < oldest30m) oldest30m = ev.tsMs;
        }
      }
    }

    cachedAggregate = {
      eff30m,
      oldest30m,
      eff5h,
      total5h,
      req5h,
      oldest5h,
      eff7d,
      total7d,
      req7d,
      oldest7d,
    };
    lastAggregateAt = now;
  }

  // Detect active parallel/subagent conversations updated within the last 60s
  const subagentCutoff = now - 60_000;
  let activeSubagentCount = 0;
  for (const c of candidates) {
    if (activeCandidate && c.convId === activeCandidate.convId) continue;
    if (c.mtimeMs >= subagentCutoff) {
      activeSubagentCount++;
    } else {
      break; // candidates are sorted by mtimeMs descending
    }
  }

  let context = null;
  if (activeParsed && activeParsed.lastPlanner) {
    const lp = activeParsed.lastPlanner;
    const { window: windowSize, estimated: windowEstimated } = resolveModelWindowInfo(lp.model, cfg);
    const usedTokens = lp.contextTotal;
    const contextPercent = windowSize > 0 ? Math.min(100, Math.round((usedTokens / windowSize) * 100)) : 0;
    const promptDenom = lp.inputTokens + lp.cacheReadTokens;
    const cacheHit = promptDenom > 0 ? Math.round((lp.cacheReadTokens / promptDenom) * 100) : null;

    context = {
      conversationId: activeParsed.conversationId,
      model: lp.model,
      modelLabel: formatModelLabel(lp.model),
      modelShort: formatModelShort(lp.model),
      tokens: usedTokens,
      window: windowSize,
      windowEstimated,
      percent: contextPercent,
      inputTokens: lp.inputTokens,
      cacheReadTokens: lp.cacheReadTokens,
      outputTokens: lp.outputTokens,
      cacheHit,
      turns: activeParsed.turns,
      startedAt: new Date(activeParsed.startedAtMs).toISOString(),
      lastTurnAt: lp.createdAt || new Date(lp.tsMs).toISOString(),
      idleMs: Math.max(0, now - lp.tsMs),
      compactions: activeParsed.compactions,
    };
  }

  const budget5h = Math.max(50_000, Number(cfg.fiveHourBudgetTokens) || DEFAULT_CONFIG.fiveHourBudgetTokens);
  const budget7d = Math.max(500_000, Number(cfg.weeklyBudgetTokens) || DEFAULT_CONFIG.weeklyBudgetTokens);

  const fiveHourPct = Math.min(100, Math.round((cachedAggregate.eff5h / budget5h) * 100));
  let burnRate = null;
  if (cachedAggregate.eff30m > 0 && cachedAggregate.oldest30m !== null) {
    const spanMs = Math.max(5 * 60_000, Math.min(30 * 60_000, now - cachedAggregate.oldest30m));
    const tokensPerHour = Math.round((cachedAggregate.eff30m / spanMs) * 3600_000);
    const pctPerHour = (tokensPerHour / budget5h) * 100;
    const remainingPct = Math.max(0, 100 - fiveHourPct);
    const minutesToLimit =
      remainingPct > 0 && pctPerHour > 0.5
        ? Math.round((remainingPct / pctPerHour) * 60)
        : null;
    burnRate = {
      tokensPerHour,
      minutesToLimit: minutesToLimit !== null && minutesToLimit <= 1440 ? minutesToLimit : null,
    };
  }

  const localUsage = {
    fiveHour: {
      effectiveTokens: cachedAggregate.eff5h,
      totalTokens: cachedAggregate.total5h,
      requests: cachedAggregate.req5h,
      budgetTokens: budget5h,
      percent: fiveHourPct,
      resetsAt: cachedAggregate.oldest5h ? new Date(cachedAggregate.oldest5h + FIVE_HOURS_MS).toISOString() : null,
      burnRate,
    },
    weekly: {
      effectiveTokens: cachedAggregate.eff7d,
      totalTokens: cachedAggregate.total7d,
      requests: cachedAggregate.req7d,
      budgetTokens: budget7d,
      percent: Math.min(100, Math.round((cachedAggregate.eff7d / budget7d) * 100)),
      resetsAt: cachedAggregate.oldest7d ? new Date(cachedAggregate.oldest7d + SEVEN_DAYS_MS).toISOString() : null,
    },
  };

  // Validate official synced quotas (drop windows whose resetsAt already expired)
  let officialQuotas = null;
  if (state.officialQuotas) {
    const oq = state.officialQuotas;
    const capturedAtMs = oq.capturedAt ? Date.parse(oq.capturedAt) : 0;
    const isWindowValid = (w) => {
      if (!w || typeof w.percent !== 'number') return false;
      if (w.resetsAt) {
        const rMs = Date.parse(w.resetsAt);
        if (Number.isFinite(rMs) && rMs <= now) return false;
      }
      // If no resetsAt, keep valid for 12 hours after capture
      if (!w.resetsAt && capturedAtMs && now - capturedAtMs > 12 * 3600 * 1000) return false;
      return true;
    };
    const fiveHour = isWindowValid(oq.fiveHour) ? oq.fiveHour : null;
    const weekly = isWindowValid(oq.weekly) ? oq.weekly : null;
    if (fiveHour || weekly) {
      officialQuotas = {
        fiveHour,
        weekly,
        capturedAt: oq.capturedAt || null,
        source: oq.source || 'settings-ui',
      };
    }
  }

  return {
    now,
    version: APP_VERSION,
    context,
    plan: state.plan || null,
    subagents: { activeCount: activeSubagentCount },
    localUsage,
    officialQuotas,
    config: {
      enabled: cfg.enabled !== false,
      lang: SUPPORTED_LANGS.includes(cfg.lang) ? cfg.lang : 'en',
      collapsed: !!cfg.collapsed,
      showCache: cfg.showCache !== false,
      showFirstRow: cfg.showFirstRow !== false,
      showModelBadge: cfg.showModelBadge === true,
      showPlanBadge: cfg.showPlanBadge !== false,
      showCompacts: cfg.showCompacts !== false,
      showCompactBtn: cfg.showCompactBtn !== false,
      showFiveHour: cfg.showFiveHour !== false,
      showWeekly: cfg.showWeekly !== false,
      thresholds: sanitizeThresholds(cfg.thresholds),
    },
  };
}

function collectUsageSummary(daysInput = 7, brainDir = BRAIN_DIR) {
  const daysNum = Number(daysInput);
  const days = Number.isFinite(daysNum) ? Math.max(1, Math.min(30, Math.round(daysNum))) : 7;
  const now = Date.now();
  const cutoff = now - days * 24 * 3600 * 1000;

  let entries = [];
  try {
    if (fs.existsSync(brainDir)) {
      entries = fs.readdirSync(brainDir, { withFileTypes: true });
    }
  } catch {}

  const total = { requests: 0, effectiveTokens: 0, totalTokens: 0, conversations: 0 };
  const byModel = {};
  const byDay = {};

  for (const ent of entries) {
    if (!ent.isDirectory() || !UUID_RE.test(ent.name)) continue;
    const tPath = path.join(brainDir, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
    let st;
    try {
      st = fs.statSync(tPath);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoff - 60_000) continue;
    const p = parseTranscriptFile(tPath, ent.name);
    if (!p) continue;

    let convMatched = false;
    for (const ev of p.events) {
      if (ev.tsMs < cutoff) continue;
      convMatched = true;
      total.requests++;
      total.effectiveTokens += ev.effectiveTokens;
      total.totalTokens += ev.totalTokens;

      const modelKey = ev.model || 'unknown';
      if (!byModel[modelKey]) {
        byModel[modelKey] = {
          modelLabel: ev.model ? formatModelLabel(ev.model) : 'Unknown',
          requests: 0,
          effectiveTokens: 0,
          totalTokens: 0,
        };
      }
      byModel[modelKey].requests++;
      byModel[modelKey].effectiveTokens += ev.effectiveTokens;
      byModel[modelKey].totalTokens += ev.totalTokens;

      const dayKey = new Date(ev.tsMs).toISOString().slice(0, 10);
      if (!byDay[dayKey]) {
        byDay[dayKey] = { requests: 0, effectiveTokens: 0, totalTokens: 0 };
      }
      byDay[dayKey].requests++;
      byDay[dayKey].effectiveTokens += ev.effectiveTokens;
      byDay[dayKey].totalTokens += ev.totalTokens;
    }
    if (convMatched) total.conversations++;
  }

  return {
    now,
    version: APP_VERSION,
    days,
    total,
    byModel,
    byDay,
  };
}

let cachedWidget = { mtimeMs: 0, hash: '', content: '' };
function getWidgetPayload() {
  try {
    const st = fs.statSync(WIDGET_FILE);
    if (cachedWidget.mtimeMs !== st.mtimeMs || !cachedWidget.content) {
      const content = fs.readFileSync(WIDGET_FILE, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
      cachedWidget = { mtimeMs: st.mtimeMs, hash, content };
    }
    return cachedWidget;
  } catch (err) {
    log(`getWidgetPayload error: ${err.message}`);
    return null;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !!(err && err.code === 'EPERM');
  }
}

function findLiveDaemonHubs(daemonDir = DAEMON_DIR) {
  let names = [];
  try {
    if (!fs.existsSync(daemonDir)) return [];
    names = fs.readdirSync(daemonDir).filter((n) => /^hub_.*\.json$/i.test(n));
  } catch {
    return [];
  }

  const withMtime = [];
  for (const name of names) {
    const full = path.join(daemonDir, name);
    try {
      const st = fs.statSync(full);
      withMtime.push({ full, mtimeMs: st.mtimeMs });
    } catch {}
  }
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const hubs = [];
  const seenPids = new Set();
  for (const item of withMtime.slice(0, 20)) {
    let j;
    try {
      j = JSON.parse(fs.readFileSync(item.full, 'utf8'));
    } catch {
      continue;
    }
    const pid = Number(j && j.pid);
    const csrfToken = typeof (j && j.csrfToken) === 'string' ? j.csrfToken : '';
    const httpsPort = Number(j && j.httpsPort) || 0;
    const httpPort = Number(j && j.httpPort) || 0;
    if (!csrfToken || (!httpsPort && !httpPort)) continue;
    if (!isPidAlive(pid) || seenPids.has(pid)) continue;
    seenPids.add(pid);
    hubs.push({ pid, httpsPort, httpPort, csrfToken, file: item.full });
  }
  return hubs;
}

function postLocalDaemonJson(port, scheme, csrfToken, method, bodyObj, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj || {});
    const lib = scheme === 'https' ? https : http;
    const req = lib.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        timeout: timeoutMs,
        rejectUnauthorized: false,
        headers: {
          'X-Codeium-Csrf-Token': csrfToken,
          'Connect-Protocol-Version': '1',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
          if (raw.length > 512 * 1024) {
            req.destroy();
            reject(new Error('Daemon response too large'));
          }
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode || 0}`));
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Daemon RPC timeout'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function callDaemonRpc(hub, method, body = {}, timeoutMs = 5000) {
  const attempts = [];
  if (hub.httpsPort) attempts.push(['https', hub.httpsPort]);
  if (hub.httpPort) attempts.push(['http', hub.httpPort]);
  for (const [scheme, port] of attempts) {
    try {
      return await postLocalDaemonJson(port, scheme, hub.csrfToken, method, body, timeoutMs);
    } catch {}
  }
  return null;
}

function parseDaemonQuotaSummary(raw) {
  const summary = (raw && raw.response) || raw;
  const groups = summary && Array.isArray(summary.groups) ? summary.groups : [];
  if (groups.length === 0) return null;

  const geminiGroup =
    groups.find((g) => {
      const text = `${g && g.displayName ? g.displayName : ''} ${g && g.description ? g.description : ''}`.toLowerCase();
      return text.includes('gemini');
    }) || groups[0];

  const buckets = geminiGroup && Array.isArray(geminiGroup.buckets) ? geminiGroup.buckets : [];
  let fiveHour = null;
  let weekly = null;

  for (const b of buckets) {
    if (!b || typeof b !== 'object') continue;
    const rem = b.remainingFraction === null || b.remainingFraction === undefined
      ? 1.0
      : Number(b.remainingFraction);
    if (!Number.isFinite(rem)) continue;
    const usedPct = Math.max(0, Math.min(100, Math.round((1 - rem) * 100)));
    const resetsAt =
      typeof b.resetTime === 'string' && Number.isFinite(Date.parse(b.resetTime))
        ? b.resetTime
        : null;
    const win = String(b.window || '').toLowerCase();
    const label = String(b.displayName || '').toLowerCase();

    if (!fiveHour && (win === '5h' || /5\s*h|5[\s-]*hour/i.test(label))) {
      fiveHour = { percent: usedPct, resetsAt, label: b.displayName || '5h' };
    } else if (!weekly && (win === 'weekly' || /week|7[\s-]*day/i.test(label))) {
      weekly = { percent: usedPct, resetsAt, label: b.displayName || 'Weekly' };
    }
  }

  if (!fiveHour && !weekly) return null;
  return { fiveHour, weekly };
}

function parseDaemonPlan(raw) {
  const us = raw && raw.userStatus;
  if (!us || typeof us !== 'object') return null;
  const tierName = (us.userTier && typeof us.userTier.name === 'string' ? us.userTier.name : '').trim();
  const planName = (
    us.planStatus &&
    us.planStatus.planInfo &&
    typeof us.planStatus.planInfo.planName === 'string'
      ? us.planStatus.planInfo.planName
      : ''
  ).trim();
  const label = tierName || planName;
  if (!label) return null;
  const short = planName || label.replace(/^google\s+ai\s+/i, '').trim() || label;
  return { short: short.slice(0, 20), label: label.slice(0, 60) };
}

let lastDaemonSyncAttempt = 0;
let lastDaemonQuotaFp = '';
let lastPlanFetchAt = 0;
let lastPlanHubPid = 0;
let daemonSyncInFlight = null;

async function syncQuotasFromLocalDaemon({ force = false, daemonDir = DAEMON_DIR, persist = true } = {}) {
  const now = Date.now();
  const cooldown = force ? 5_000 : 90_000;
  if (persist && now - lastDaemonSyncAttempt < cooldown) {
    return { ok: false, skipped: true };
  }
  if (daemonSyncInFlight) return daemonSyncInFlight;

  const run = async () => {
    if (persist) lastDaemonSyncAttempt = Date.now();
    const hubs = findLiveDaemonHubs(daemonDir);
    if (hubs.length === 0) return { ok: false, reason: 'no_live_hub' };

    for (const hub of hubs) {
      const resp = await callDaemonRpc(hub, 'RetrieveUserQuotaSummary', { forceRefresh: true });
      const parsed = parseDaemonQuotaSummary(resp);
      if (!parsed) continue;

      let plan = null;
      const shouldFetchPlan = !persist || force || hub.pid !== lastPlanHubPid || Date.now() - lastPlanFetchAt > 5 * 60_000;
      if (shouldFetchPlan) {
        const statusResp = await callDaemonRpc(hub, 'GetUserStatus', {
          metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' },
        });
        plan = parseDaemonPlan(statusResp);
        if (persist && plan) {
          lastPlanFetchAt = Date.now();
          lastPlanHubPid = hub.pid;
        }
      }

      const officialQuotas = {
        fiveHour: parsed.fiveHour,
        weekly: parsed.weekly,
        capturedAt: new Date().toISOString(),
        source: 'ide-daemon',
      };

      if (persist) {
        const prevState = getState();
        const prev = prevState.officialQuotas || {};
        const merged = {
          fiveHour: parsed.fiveHour || prev.fiveHour || null,
          weekly: parsed.weekly || prev.weekly || null,
          capturedAt: officialQuotas.capturedAt,
          source: 'ide-daemon',
        };
        const nextPlan = plan || prevState.plan || null;
        saveState({ ...prevState, officialQuotas: merged, plan: nextPlan });
        const fp = JSON.stringify({
          f: merged.fiveHour && [merged.fiveHour.percent, merged.fiveHour.resetsAt],
          w: merged.weekly && [merged.weekly.percent, merged.weekly.resetsAt],
          p: nextPlan && nextPlan.short,
        });
        if (fp !== lastDaemonQuotaFp) {
          lastDaemonQuotaFp = fp;
          log(
            `Synced quotas from local IDE daemon: 5h=${merged.fiveHour ? merged.fiveHour.percent + '%' : 'n/a'}, week=${merged.weekly ? merged.weekly.percent + '%' : 'n/a'}${nextPlan ? `, plan=${nextPlan.short}` : ''}`
          );
        }
        return { ok: true, officialQuotas: merged, plan: nextPlan };
      }

      return { ok: true, officialQuotas, plan };
    }

    return { ok: false, reason: 'no_quota_response' };
  };

  daemonSyncInFlight = run().finally(() => {
    daemonSyncInFlight = null;
  });
  return daemonSyncInFlight;
}

// Self-healing loader guard: keeps our loader attached inside both
// antigravity-features-v2/localization_injected.js and AntiGravity's app.asar
// even after AntiGravity Desktop or antigravity-features-v2 auto-updates.
let lastCheckedAsarSig = '';
let lastCheckedBundleSig = '';
let lastAsarHealFailedAt = 0;

function asarHasStatuslineLoader(asarPath) {
  try {
    const preloadText = asarPatcher.readFileFromAsar(asarPath, asarPatcher.PRELOAD_REL_PATH).toString('utf8');
    return (
      preloadText.includes('ANTIGRAVITY_STATUSLINE_LOADER_V1') ||
      preloadText.includes(asarPatcher.HOOK_MARKER)
    );
  } catch {
    return false;
  }
}

function ensureLoaderAttached(opts = {}) {
  try {
    const lockFile = opts.lockFile || path.join(__dirname, 'uninstalling.lock');
    if (fs.existsSync(lockFile)) return { action: 'locked' };

    const loaderFile = opts.loaderFile || LOADER_FILE;
    if (!fs.existsSync(loaderFile)) return { action: 'no_loader' };

    const fv2Dir = opts.featuresV2Dir !== undefined ? opts.featuresV2Dir : FEATURES_V2_DIR;
    const fv2Bundle = opts.featuresV2Bundle !== undefined ? opts.featuresV2Bundle : FEATURES_V2_BUNDLE;
    const hasFv2 = !!(fv2Bundle && fs.existsSync(fv2Bundle));
    const asarPath = opts.asarPath !== undefined ? opts.asarPath : asarPatcher.findAntigravityAsar();
    const force = !!opts.force;

    let bundleSig = '';
    if (hasFv2) {
      try {
        const st = fs.statSync(fv2Bundle);
        bundleSig = `${st.mtimeMs}:${st.size}`;
      } catch {}
    }

    let asarSig = '';
    if (asarPath && fs.existsSync(asarPath)) {
      try {
        const st = fs.statSync(asarPath);
        asarSig = `${st.mtimeMs}:${st.size}`;
      } catch {}
    }

    // Fast path: nothing changed since last verified healthy check
    if (!force && !opts.asarPath && !opts.featuresV2Bundle && asarSig === lastCheckedAsarSig && bundleSig === lastCheckedBundleSig) {
      return { action: 'unchanged' };
    }

    let reattachedBundle = false;
    if (hasFv2) {
      const current = fs.readFileSync(fv2Bundle, 'utf8');
      if (!current.includes('ANTIGRAVITY_STATUSLINE_LOADER_V1')) {
        const loaderSnippet = fs.readFileSync(loaderFile, 'utf8').trim();
        const eol = current.includes('\r\n') ? '\r\n' : '\n';
        const patched = current.trimEnd() + eol + eol + loaderSnippet.replace(/\r?\n/g, eol) + eol;

        const tmpFile = path.join(os.tmpdir(), `agy-sl-check-${process.pid}.js`);
        fs.writeFileSync(tmpFile, patched, 'utf8');
        try {
          execSync(`"${process.execPath}" --check "${tmpFile}"`, { stdio: 'ignore', windowsHide: true });
        } finally {
          try { fs.unlinkSync(tmpFile); } catch {}
        }

        writeFileAtomic(fv2Bundle, patched);
        reattachedBundle = true;
        log('Re-attached ANTIGRAVITY_STATUSLINE_LOADER_V1 into localization_injected.js');
      }
    }

    let healedAsar = false;
    if (asarPath && fs.existsSync(asarPath)) {
      if (!asarHasStatuslineLoader(asarPath)) {
        const now = Date.now();
        if (!force && lastAsarHealFailedAt && now - lastAsarHealFailedAt < 5 * 60_000 && asarSig === lastCheckedAsarSig) {
          return { action: 'cooldown', reattachedBundle };
        }

        try {
          if (hasFv2) {
            const autoPatcher = path.join(fv2Dir, 'auto_patcher.cjs');
            if (typeof opts.runAutoPatcher === 'function') {
              opts.runAutoPatcher(autoPatcher, fv2Dir);
            } else if (fs.existsSync(autoPatcher)) {
              execSync(`"${process.execPath}" "${autoPatcher}" --once`, {
                cwd: fv2Dir,
                stdio: 'ignore',
                windowsHide: true,
                timeout: 30_000,
              });
            }
          }

          if (asarHasStatuslineLoader(asarPath)) {
            healedAsar = true;
            log('Self-healed app.asar via antigravity-features-v2 auto_patcher.cjs');
          } else {
            const patchFn = opts.patchAsarFn || asarPatcher.patchAsar;
            patchFn(asarPath);
            healedAsar = true;
            log(`Self-healed app.asar directly (standalone hook): ${asarPath}`);
          }
          lastAsarHealFailedAt = 0;
        } catch (err) {
          lastAsarHealFailedAt = Date.now();
          log(`Self-heal app.asar failed: ${err.message}`);
        }
      }
    }

    if (!opts.asarPath && !opts.featuresV2Bundle) {
      if (hasFv2) {
        try {
          const st = fs.statSync(fv2Bundle);
          lastCheckedBundleSig = `${st.mtimeMs}:${st.size}`;
        } catch {}
      } else {
        lastCheckedBundleSig = '';
      }
      if (asarPath && fs.existsSync(asarPath)) {
        try {
          const st = fs.statSync(asarPath);
          lastCheckedAsarSig = `${st.mtimeMs}:${st.size}`;
        } catch {}
      } else {
        lastCheckedAsarSig = '';
      }
    }

    return {
      action: healedAsar ? 'healed_asar' : (reattachedBundle ? 'reattached_bundle' : 'ok'),
      reattachedBundle,
      healedAsar,
    };
  } catch (err) {
    log(`ensureLoaderAttached error: ${err.message}`);
    return { action: 'error', error: err.message };
  }
}

function readRequestBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;
  const lower = String(origin).toLowerCase();
  if (
    lower.startsWith('vscode-file://') ||
    lower.startsWith('antigravity-ide://') ||
    lower.startsWith('file://')
  ) {
    return true;
  }
  try {
    const u = new URL(origin);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) {
      return true;
    }
  } catch {}
  return false;
}

function createHttpServer() {
  const sseClients = new Set();
  let broadcastTimer = null;
  let brainWatcher = null;

  const pushToClient = (client) => {
    try {
      const data = collectAllMetrics(client.convId);
      const w = getWidgetPayload();
      data.widgetHash = w ? w.hash : null;
      client.res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      sseClients.delete(client);
      try { client.res.end(); } catch {}
    }
  };

  const broadcastNow = () => {
    if (sseClients.size === 0) return;
    lastAggregateAt = 0; // force fresh aggregate on push
    for (const client of Array.from(sseClients)) {
      pushToClient(client);
    }
  };

  const scheduleBroadcast = () => {
    if (sseClients.size === 0 || broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      broadcastNow();
    }, 250);
    if (typeof broadcastTimer.unref === 'function') broadcastTimer.unref();
  };

  const ensureBrainWatcher = () => {
    if (brainWatcher || !fs.existsSync(BRAIN_DIR)) return;
    try {
      brainWatcher = fs.watch(BRAIN_DIR, { recursive: true }, (_eventType, filename) => {
        if (!filename || String(filename).endsWith('transcript.jsonl')) {
          scheduleBroadcast();
        }
      });
      brainWatcher.on('error', () => {
        try { brainWatcher.close(); } catch {}
        brainWatcher = null;
      });
    } catch {
      // Recursive fs.watch may not be supported on older Linux kernels; fallback polling still works
      brainWatcher = null;
    }
  };

  const heartbeatTimer = setInterval(() => {
    for (const client of Array.from(sseClients)) {
      try {
        client.res.write(': ping\n\n');
      } catch {
        sseClients.delete(client);
      }
    }
  }, 25_000);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const originAllowed = isAllowedOrigin(origin);

    if (origin && originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-Widget-Hash, Content-Length');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.writeHead(originAllowed ? 204 : 403);
      res.end();
      return;
    }

    if (req.method === 'POST' && !originAllowed) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Forbidden origin' }));
      return;
    }

    const urlObj = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const pathname = urlObj.pathname;

    if (pathname === '/health') {
      const w = getWidgetPayload();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, version: APP_VERSION, widgetHash: w ? w.hash : null }));
      return;
    }

    if (pathname === '/api/events') {
      if (!originAllowed) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Forbidden origin' }));
        return;
      }
      const convId = urlObj.searchParams.get('conversationId') || '';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      const client = { res, convId };
      sseClients.add(client);
      ensureBrainWatcher();
      pushToClient(client);
      req.on('close', () => {
        sseClients.delete(client);
      });
      return;
    }

    if (pathname === '/api/usage-summary') {
      try {
        const days = urlObj.searchParams.get('days') || '7';
        const summary = collectUsageSummary(days);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(summary));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/widget.js') {
      const w = getWidgetPayload();
      if (!w) {
        res.writeHead(404);
        res.end('// widget.js not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'X-Widget-Hash': w.hash,
      });
      res.end(w.content);
      return;
    }

    if (pathname === '/api/status') {
      try {
        const convId = urlObj.searchParams.get('conversationId') || '';
        const data = collectAllMetrics(convId);
        const w = getWidgetPayload();
        data.widgetHash = w ? w.hash : null;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/config' && req.method === 'POST') {
      try {
        const raw = await readRequestBody(req);
        const patch = raw ? JSON.parse(raw) : {};
        if (patch.clearOfficialQuotas) {
          const prevState = getState();
          saveState({ ...prevState, officialQuotas: null });
          delete patch.clearOfficialQuotas;
        }
        const nextCfg = saveConfig(patch);
        broadcastNow();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, config: nextCfg }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    if (pathname === '/api/quota-refresh' && req.method === 'POST') {
      try {
        const result = await syncQuotasFromLocalDaemon({ force: true });
        if (result && result.ok) {
          broadcastNow();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: !!(result && result.ok), officialQuotas: (result && result.officialQuotas) || getState().officialQuotas || null }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    if (pathname === '/api/quota-sync' && req.method === 'POST') {
      try {
        const raw = await readRequestBody(req);
        const payload = raw ? JSON.parse(raw) : {};
        const prev = getState().officialQuotas || {};
        const sanitizeWin = (w) => {
          if (!w || typeof w.percent !== 'number' || !Number.isFinite(w.percent)) return null;
          return {
            percent: Math.max(0, Math.min(100, Math.round(w.percent))),
            resetsAt: typeof w.resetsAt === 'string' && Number.isFinite(Date.parse(w.resetsAt)) ? w.resetsAt : null,
            label: typeof w.label === 'string' ? w.label.slice(0, 60) : null,
          };
        };
        const nextFive = sanitizeWin(payload.fiveHour) || prev.fiveHour || null;
        const nextWeek = sanitizeWin(payload.weekly) || prev.weekly || null;
        if (!nextFive && !nextWeek) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'No valid quota window supplied' }));
          return;
        }
        const prevState = getState();
        const nextState = saveState({
          ...prevState,
          officialQuotas: {
            fiveHour: nextFive,
            weekly: nextWeek,
            capturedAt: new Date().toISOString(),
            source: payload.source || 'settings-ui',
          },
        });
        log(`Synced official quotas: 5h=${nextFive ? nextFive.percent + '%' : 'n/a'}, week=${nextWeek ? nextWeek.percent + '%' : 'n/a'}`);
        broadcastNow();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, officialQuotas: nextState.officialQuotas }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.on('close', () => {
    clearInterval(heartbeatTimer);
    if (broadcastTimer) clearTimeout(broadcastTimer);
    if (brainWatcher) {
      try { brainWatcher.close(); } catch {}
      brainWatcher = null;
    }
    for (const client of Array.from(sseClients)) {
      try { client.res.end(); } catch {}
      sseClients.delete(client);
    }
  });

  server.broadcastNow = broadcastNow;
  return server;
}

function startHttpServer(port = PORT, host = HOST) {
  const server = createHttpServer();

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log(`HTTP port ${port} already bound by primary instance; running MCP stdio only.`);
    } else {
      log(`HTTP server error: ${err.message}`);
    }
  });

  server.listen(port, host, () => {
    log(`Statusline HTTP server listening on http://${host}:${port}`);
    ensureLoaderAttached();
    setInterval(ensureLoaderAttached, 60_000).unref();
    // Auto-sync official quotas directly from AntiGravity's local daemon (hub_*.json)
    const runDaemonSync = (force) => {
      syncQuotasFromLocalDaemon({ force })
        .then((r) => {
          if (r && r.ok && typeof server.broadcastNow === 'function') server.broadcastNow();
        })
        .catch(() => {});
    };
    setTimeout(() => runDaemonSync(true), 1500).unref();
    setInterval(() => runDaemonSync(false), 90_000).unref();
  });

  return server;
}

// Lightweight zero-dependency MCP Stdio JSON-RPC 2.0 server
function startMcpStdio() {
  const send = (obj) => {
    try {
      process.stdout.write(JSON.stringify(obj) + '\n');
    } catch {}
  };

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('close', () => {
    setTimeout(() => process.exit(0), 50).unref();
  });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }

    const { id, method, params } = msg;

    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'antigravity-statusline', version: APP_VERSION },
        },
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    if (method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'get_statusline_metrics',
              description: 'Get live AntiGravity statusline metrics: current conversation context window usage, cache hit rate, compactions, rolling 5h/7d local token usage, burn rate, active subagents, and synced official quotas.',
              inputSchema: {
                type: 'object',
                properties: {
                  conversationId: {
                    type: 'string',
                    description: 'Optional conversation UUID. Defaults to the most recently active conversation.',
                  },
                },
              },
            },
            {
              name: 'get_usage_summary',
              description: 'Get aggregated local token usage summary over the last N days (1-30) broken down by model and by day.',
              inputSchema: {
                type: 'object',
                properties: {
                  days: {
                    type: 'number',
                    description: 'Number of days to aggregate (1-30). Defaults to 7.',
                  },
                },
              },
            },
          ],
        },
      });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params && params.name;
      if (toolName === 'get_statusline_metrics') {
        const convId = (params.arguments && params.arguments.conversationId) || '';
        const metrics = collectAllMetrics(convId);
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }],
          },
        });
        return;
      }
      if (toolName === 'get_usage_summary') {
        const days = (params.arguments && params.arguments.days) || 7;
        const summary = collectUsageSummary(days);
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
          },
        });
        return;
      }
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      });
      return;
    }

    if (id !== undefined) {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  });
}

function clearTranscriptCache() {
  transcriptCache.clear();
  cachedAggregate = null;
  lastAggregateAt = 0;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);
  } catch {
    const a = path.resolve(process.argv[1]);
    const b = path.resolve(__filename);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  }
}

export {
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
  collectAllMetrics,
  collectUsageSummary,
  findLiveDaemonHubs,
  parseDaemonQuotaSummary,
  parseDaemonPlan,
  syncQuotasFromLocalDaemon,
  ensureLoaderAttached,
  createHttpServer,
  startHttpServer,
  startMcpStdio,
};

if (isMainModule()) {
  const isStandalone = process.argv.includes('--standalone');
  startHttpServer();
  if (!isStandalone) {
    startMcpStdio();
  }
}
