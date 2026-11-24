import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import crypto from 'crypto';
import readline from 'readline';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 39229;
const HOST = '127.0.0.1';
const USER_HOME = os.homedir();
const BRAIN_DIR = path.join(USER_HOME, '.gemini', 'antigravity', 'brain');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const STATE_FILE = path.join(__dirname, 'state.json');
const WIDGET_FILE = path.join(__dirname, 'widget.js');
const LOADER_FILE = path.join(__dirname, 'loader.js');
const LOG_FILE = path.join(__dirname, 'statusline.log');
const FEATURES_V2_DIR = path.join(USER_HOME, '.antigravity-features-v2');
const FEATURES_V2_BUNDLE = path.join(FEATURES_V2_DIR, 'localization_injected.js');

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

function writeJsonSafe(filePath, obj) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
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

function resolveModelWindow(modelId, cfg) {
  if (!modelId || typeof modelId !== 'string') return 1_000_000;
  const lower = modelId.toLowerCase();
  const windows = cfg.modelWindows || DEFAULT_CONFIG.modelWindows;
  for (const [prefix, size] of Object.entries(windows)) {
    if (lower.includes(prefix.toLowerCase())) return size;
  }
  return 1_000_000;
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

// Per-transcript cache keyed by path -> { mtimeMs, size, parsed }
const transcriptCache = new Map();

function parseTranscriptFile(filePath, convId) {
  let st;
  try {
    st = fs.statSync(filePath);
  } catch {
    return null;
  }
  const cached = transcriptCache.get(filePath);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached.parsed;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const lines = raw.split(/\r?\n/);
  let startedAtMs = null;
  let turns = 0;
  let lastPlanner = null;
  let prevPromptTotal = null;
  let compactionsCount = 0;
  let lastCompactionBefore = null;
  let lastCompactionAfter = null;
  const events = []; // { tsMs, effectiveTokens, totalTokens }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line[0] !== '{') continue;
    // Fast pre-check before JSON.parse on multi-MB transcripts
    const isPlanner = line.includes('"PLANNER_RESPONSE"');
    const isUser = !isPlanner && line.includes('"USER_INPUT"');
    if (!isPlanner && !isUser) continue;

    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const tsMs = obj.created_at ? Date.parse(obj.created_at) : NaN;
    if (Number.isFinite(tsMs) && (startedAtMs === null || tsMs < startedAtMs)) {
      startedAtMs = tsMs;
    }

    if (obj.type === 'USER_INPUT') {
      turns++;
      continue;
    }

    if (obj.type === 'PLANNER_RESPONSE') {
      const inputTokens = Number(obj.input_tokens) || 0;
      const cacheReadTokens = Number(obj.cache_read_tokens) || 0;
      const outputTokens = Number(obj.output_tokens) || 0;
      const promptTotal = inputTokens + cacheReadTokens;
      const contextTotal = promptTotal + outputTokens;

      if (prevPromptTotal !== null && prevPromptTotal >= 20_000 && promptTotal > 0) {
        const drop = prevPromptTotal - promptTotal;
        if (drop >= 15_000 && promptTotal < prevPromptTotal * 0.65) {
          compactionsCount++;
          lastCompactionBefore = prevPromptTotal;
          lastCompactionAfter = promptTotal;
        }
      }
      if (promptTotal > 0) {
        prevPromptTotal = promptTotal;
      }

      const effectiveTokens = inputTokens + outputTokens;
      if (Number.isFinite(tsMs) && (effectiveTokens > 0 || contextTotal > 0)) {
        events.push({ tsMs, effectiveTokens, totalTokens: contextTotal });
      }

      lastPlanner = {
        stepIndex: obj.step_index,
        createdAt: obj.created_at || null,
        tsMs: Number.isFinite(tsMs) ? tsMs : st.mtimeMs,
        model: obj.model || null,
        inputTokens,
        cacheReadTokens,
        outputTokens,
        promptTotal,
        contextTotal,
      };
    }
  }

  const parsed = {
    conversationId: convId,
    mtimeMs: st.mtimeMs,
    startedAtMs: startedAtMs || st.birthtimeMs || st.mtimeMs,
    turns,
    lastPlanner,
    compactions: compactionsCount > 0
      ? { count: compactionsCount, before: lastCompactionBefore, after: lastCompactionAfter }
      : null,
    events,
  };

  transcriptCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, parsed });
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
    const cutoff5h = now - FIVE_HOURS_MS;
    const cutoff7d = now - SEVEN_DAYS_MS;
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
      }
    }

    cachedAggregate = {
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

  let context = null;
  if (activeParsed && activeParsed.lastPlanner) {
    const lp = activeParsed.lastPlanner;
    const windowSize = resolveModelWindow(lp.model, cfg);
    const usedTokens = lp.contextTotal;
    const contextPercent = windowSize > 0 ? Math.min(100, Math.round((usedTokens / windowSize) * 100)) : 0;
    const promptDenom = lp.inputTokens + lp.cacheReadTokens;
    const cacheHit = promptDenom > 0 ? Math.round((lp.cacheReadTokens / promptDenom) * 100) : null;

    context = {
      conversationId: activeParsed.conversationId,
      model: lp.model,
      modelLabel: formatModelLabel(lp.model),
      tokens: usedTokens,
      window: windowSize,
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

  const localUsage = {
    fiveHour: {
      effectiveTokens: cachedAggregate.eff5h,
      totalTokens: cachedAggregate.total5h,
      requests: cachedAggregate.req5h,
      budgetTokens: budget5h,
      percent: Math.min(100, Math.round((cachedAggregate.eff5h / budget5h) * 100)),
      resetsAt: cachedAggregate.oldest5h ? new Date(cachedAggregate.oldest5h + FIVE_HOURS_MS).toISOString() : null,
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
    version: '1.1.0',
    context,
    localUsage,
    officialQuotas,
    config: {
      enabled: cfg.enabled !== false,
      lang: ['en', 'ru', 'uk'].includes(cfg.lang) ? cfg.lang : 'en',
      collapsed: !!cfg.collapsed,
      showCache: cfg.showCache !== false,
      showFirstRow: cfg.showFirstRow !== false,
      thresholds: sanitizeThresholds(cfg.thresholds),
    },
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

// Self-healing loader guard: keeps our tiny loader attached inside antigravity-features-v2/localization_injected.js
// even after upstream GitHub auto-updates of antigravity-features-v2.
function ensureLoaderAttached() {
  try {
    const uninstallLock = path.join(__dirname, 'uninstalling.lock');
    if (fs.existsSync(uninstallLock)) return;
    if (!fs.existsSync(FEATURES_V2_BUNDLE) || !fs.existsSync(LOADER_FILE)) return;

    const current = fs.readFileSync(FEATURES_V2_BUNDLE, 'utf8');
    if (current.includes('ANTIGRAVITY_STATUSLINE_LOADER_V1')) return;

    const loaderSnippet = fs.readFileSync(LOADER_FILE, 'utf8').trim();
    const eol = current.includes('\r\n') ? '\r\n' : '\n';
    const patched = current.trimEnd() + eol + eol + loaderSnippet.replace(/\r?\n/g, eol) + eol;

    const tmpFile = path.join(os.tmpdir(), `agy-sl-check-${process.pid}.js`);
    fs.writeFileSync(tmpFile, patched, 'utf8');
    try {
      execSync(`"${process.execPath}" --check "${tmpFile}"`, { stdio: 'ignore', windowsHide: true });
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }

    fs.writeFileSync(FEATURES_V2_BUNDLE, patched, 'utf8');
    log('Re-attached ANTIGRAVITY_STATUSLINE_LOADER_V1 into localization_injected.js');
  } catch (err) {
    log(`ensureLoaderAttached error: ${err.message}`);
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

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-Widget-Hash, Content-Length');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const pathname = urlObj.pathname;

    if (pathname === '/health') {
      const w = getWidgetPayload();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, version: '1.1.0', widgetHash: w ? w.hash : null }));
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
          saveState({ officialQuotas: null });
          delete patch.clearOfficialQuotas;
        }
        const nextCfg = saveConfig(patch);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, config: nextCfg }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
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
        const nextState = saveState({
          officialQuotas: {
            fiveHour: nextFive,
            weekly: nextWeek,
            capturedAt: new Date().toISOString(),
            source: payload.source || 'settings-ui',
          },
        });
        log(`Synced official quotas: 5h=${nextFive ? nextFive.percent + '%' : 'n/a'}, week=${nextWeek ? nextWeek.percent + '%' : 'n/a'}`);
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

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log(`HTTP port ${PORT} already bound by primary instance; running MCP stdio only.`);
    } else {
      log(`HTTP server error: ${err.message}`);
    }
  });

  server.listen(PORT, HOST, () => {
    log(`Statusline HTTP server listening on http://${HOST}:${PORT}`);
    ensureLoaderAttached();
    setInterval(ensureLoaderAttached, 60_000).unref();
  });
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
          serverInfo: { name: 'antigravity-statusline', version: '1.1.0' },
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
              description: 'Get live AntiGravity statusline metrics: current conversation context window usage, cache hit rate, compactions, rolling 5h/7d local token usage, and synced official quotas.',
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

const isStandalone = process.argv.includes('--standalone');
startHttpServer();
if (!isStandalone) {
  startMcpStdio();
}
