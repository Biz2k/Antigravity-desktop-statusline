(() => {
  'use strict';

  const API_BASE = 'http://127.0.0.1:39229';
  const ROOT_ID = 'agy-statusline-root';
  const STYLE_ID = 'agy-statusline-style';
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // Clean up any previous hot-reloaded instance cleanly
  if (typeof window.__ag_statusline_dispose === 'function') {
    try { window.__ag_statusline_dispose(); } catch {}
  }

  let disposed = false;
  let lastData = null;
  let pollTimer = null;
  let mountTimer = null;
  let settingsScanTimer = null;
  let domObserver = null;
  let popoverOpen = false;
  let lastQuotaFingerprint = '';

  function isEnglish() {
    try {
      return localStorage.getItem('antigravity_lang') === 'en';
    } catch {
      return false;
    }
  }

  function t(ru, en) {
    return isEnglish() ? en : ru;
  }

  function fmtTokens(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    if (n >= 1_000_000) {
      const val = n / 1_000_000;
      return `${val >= 10 ? Math.round(val) : +val.toFixed(1)}M`;
    }
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
  }

  function fmtUntil(iso, nowMs) {
    if (!iso) return '';
    const target = Date.parse(iso);
    if (!Number.isFinite(target)) return '';
    const minutes = Math.max(0, Math.round((target - nowMs) / 60_000));
    const en = isEnglish();
    if (minutes < 60) return en ? `${minutes}m` : `${minutes}м`;
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return en ? `${h}h ${m}m` : `${h}ч ${m}м`;
    }
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    return en ? `${d}d ${h}h` : `${d}д ${h}ч`;
  }

  function fmtClock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function fmtAgo(iso, nowMs) {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    const mins = Math.max(0, Math.floor((nowMs - ts) / 60_000));
    const en = isEnglish();
    if (mins < 1) return en ? '<1m' : '<1м';
    if (mins < 60) return en ? `${mins}m` : `${mins}м`;
    const h = Math.floor(mins / 60);
    return en ? `${h}h` : `${h}ч`;
  }

  function barColorClass(pct) {
    if (pct >= 95) return 'is-danger';
    if (pct >= 80) return 'is-warn';
    return 'is-normal';
  }

  function detectConversationId() {
    try {
      const href = window.location.href || '';
      // Prefer explicit /conversations/<uuid> or /chat/<uuid> match if present
      const explicit = href.match(/(?:conversation|chat|session|thread)s?[\/=?&]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (explicit) return explicit[1];
      // Otherwise check all UUIDs in URL (skip /projects/<uuid> when another UUID follows)
      const all = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
      if (all && all.length > 0) {
        const projMatch = href.match(/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        const nonProj = all.filter((u) => !projMatch || u.toLowerCase() !== projMatch[1].toLowerCase());
        if (nonProj.length > 0) return nonProj[nonProj.length - 1];
      }
      // Fallback: check DOM attributes for active conversation id
      const el = document.querySelector('[data-conversation-id], [data-session-id]');
      if (el) {
        const val = el.getAttribute('data-conversation-id') || el.getAttribute('data-session-id') || '';
        const m = val.match(UUID_RE);
        if (m) return m[0];
      }
    } catch {}
    return '';
  }

  function injectStyles() {
    let style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: relative;
        width: 100%;
        box-sizing: border-box;
        margin: 0 auto 8px auto;
        padding: 9px 14px;
        border-radius: 12px;
        background: var(--card, rgba(255, 255, 255, 0.035));
        border: 1px solid var(--border, rgba(255, 255, 255, 0.09));
        color: var(--foreground, #e8eaed);
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        font-size: 12.5px;
        line-height: 1.35;
        user-select: none;
        -webkit-app-region: no-drag;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      #${ROOT_ID}:hover {
        border-color: var(--glass-border, rgba(128, 128, 128, 0.28));
      }
      #${ROOT_ID}.is-collapsed {
        padding: 4px 12px;
      }
      .agy-sl-rows {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .agy-sl-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 18px;
        flex-wrap: nowrap;
      }
      .agy-sl-row-limits {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
      }
      .agy-sl-meter {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .agy-sl-meter-context {
        flex: 0 1 auto;
      }
      .agy-sl-meter-limit {
        flex: 1 1 200px;
        max-width: 340px;
      }
      .agy-sl-label {
        flex: 0 0 auto;
        min-width: 64px;
        color: var(--foreground, #e8eaed);
        font-weight: 450;
        white-space: nowrap;
      }
      .agy-sl-meter-limit-right .agy-sl-label {
        min-width: 54px;
      }
      .agy-sl-track {
        position: relative;
        flex: 0 0 156px;
        width: 156px;
        height: 7px;
        border-radius: 999px;
        background: rgba(128, 128, 128, 0.28);
        overflow: hidden;
      }
      .agy-sl-meter-limit .agy-sl-track {
        flex: 1 1 110px;
        width: auto;
        min-width: 72px;
        max-width: 170px;
      }
      .agy-sl-fill {
        height: 100%;
        border-radius: 999px;
        background: #4e8ef7;
        transition: width 0.35s ease, background-color 0.25s ease;
      }
      .agy-sl-fill.is-warn {
        background: #e0a030;
      }
      .agy-sl-fill.is-danger {
        background: #e5484d;
      }
      .agy-sl-pct {
        flex: 0 0 auto;
        min-width: 34px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-weight: 500;
        color: var(--foreground, #e8eaed);
      }
      .agy-sl-pct.is-warn {
        color: #e0a030;
      }
      .agy-sl-pct.is-danger {
        color: #e5484d;
      }
      .agy-sl-detail {
        flex: 0 1 auto;
        color: var(--muted-foreground, #9aa0a6);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .agy-sl-detail.is-warn {
        color: #e0a030;
      }
      .agy-sl-meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--muted-foreground, #9aa0a6);
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .agy-sl-dot {
        opacity: 0.55;
      }
      .agy-sl-badge-local {
        display: inline-flex;
        align-items: center;
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 999px;
        background: rgba(128, 128, 128, 0.16);
        color: var(--muted-foreground, #9aa0a6);
        margin-left: 2px;
      }
      .agy-sl-actions {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        opacity: 0.25;
        transition: opacity 0.15s ease;
      }
      #${ROOT_ID}:hover .agy-sl-actions,
      #${ROOT_ID}.has-popover .agy-sl-actions {
        opacity: 1;
      }
      .agy-sl-icon-btn {
        background: transparent;
        border: none;
        color: var(--muted-foreground, #9aa0a6);
        cursor: pointer;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        padding: 0;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      .agy-sl-icon-btn:hover {
        background: var(--secondary, rgba(128, 128, 128, 0.18));
        color: var(--foreground, #ffffff);
      }
      .agy-sl-popover {
        position: absolute;
        right: 8px;
        bottom: calc(100% + 6px);
        width: 295px;
        background: var(--card, #1e1f22);
        border: 1px solid var(--border, rgba(128, 128, 128, 0.28));
        border-radius: 10px;
        padding: 11px 12px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
        color: var(--foreground, #e8eaed);
        z-index: 9000;
        display: none;
        flex-direction: column;
        gap: 8px;
        font-size: 11.5px;
      }
      #${ROOT_ID}.has-popover .agy-sl-popover {
        display: flex;
      }
      .agy-sl-pop-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        font-size: 12px;
      }
      .agy-sl-pop-note {
        font-size: 11px;
        line-height: 1.4;
        color: var(--muted-foreground, #9aa0a6);
      }
      .agy-sl-pop-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .agy-sl-pop-input {
        width: 92px;
        padding: 3px 6px;
        border-radius: 6px;
        border: 1px solid var(--border, rgba(128, 128, 128, 0.28));
        background: var(--background, rgba(0, 0, 0, 0.2));
        color: var(--foreground, #e8eaed);
        font-size: 11.5px;
        text-align: right;
      }
      .agy-sl-pop-btn {
        background: var(--secondary, rgba(128, 128, 128, 0.16));
        border: 1px solid var(--border, rgba(128, 128, 128, 0.22));
        color: var(--foreground, #e8eaed);
        border-radius: 6px;
        padding: 5px 9px;
        font-size: 11px;
        cursor: pointer;
        font-weight: 500;
      }
      .agy-sl-pop-btn:hover {
        background: rgba(78, 142, 247, 0.22);
        border-color: rgba(78, 142, 247, 0.5);
      }
      .agy-sl-collapsed-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 11.5px;
        color: var(--muted-foreground, #9aa0a6);
      }
      @media (max-width: 620px) {
        .agy-sl-track {
          flex: 0 1 110px;
          width: 110px;
        }
        .agy-sl-row-limits {
          gap: 6px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Locate the visible chat prompt composer card so we can insert right above it
  function findComposerContainer() {
    const candidates = Array.from(
      document.querySelectorAll(
        'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]'
      )
    );

    const winH = window.innerHeight || 900;
    const winW = window.innerWidth || 1200;
    let bestEditor = null;
    let bestScore = -1;

    for (const el of candidates) {
      if (!el || el.closest(`#${ROOT_ID}`)) continue;
      // Ignore terminal, dialogs, popovers, settings pages, search inputs
      if (
        el.closest(
          '.xterm, [role="dialog"], [role="menu"], [data-base-ui-portal], [data-floating-ui-portal], header, nav'
        )
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 14 || rect.height > 420) continue;
      if (rect.bottom > winH + 40 || rect.top < winH * 0.25) continue;
      // Exclude left sidebar inputs
      if (rect.left < 180 && rect.width < 280) continue;

      // Prefer elements closer to the bottom and wider
      const score = rect.bottom * 2 + rect.width;
      if (score > bestScore) {
        bestScore = score;
        bestEditor = el;
      }
    }

    if (!bestEditor) return null;

    // Walk upward from the editor to find the rounded bordered composer card
    let node = bestEditor;
    let bestCard = null;
    for (let depth = 0; depth < 9 && node && node !== document.body; depth++) {
      const parent = node.parentElement;
      if (!parent) break;
      const r = node.getBoundingClientRect();
      const cs = window.getComputedStyle(node);
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const hasBorder =
        (parseFloat(cs.borderTopWidth) || 0) > 0 ||
        (cs.boxShadow && cs.boxShadow !== 'none') ||
        (cs.backgroundColor &&
          cs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          cs.backgroundColor !== 'transparent');

      // Stop walking if we reached a full-height chat column or container much taller than a composer
      if (r.height > Math.min(340, winH * 0.45)) break;

      if (radius >= 8 && hasBorder && r.width >= 260 && r.width <= winW - 40) {
        bestCard = node;
      }
      node = parent;
    }

    return bestCard || bestEditor.parentElement;
  }

  function createRootElement() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-ag-no-translate', '1');
    return root;
  }

  function ensureMounted() {
    if (disposed) return null;
    const composer = findComposerContainer();
    const existing = document.getElementById(ROOT_ID);

    if (!composer || !composer.parentElement) {
      if (existing) existing.remove();
      return null;
    }

    const parent = composer.parentElement;
    // Check if already mounted directly before the composer
    if (existing && existing.parentElement === parent && existing.nextElementSibling === composer) {
      syncWidthWithComposer(existing, composer);
      return existing;
    }

    const root = existing || createRootElement();
    try {
      parent.insertBefore(root, composer);
      syncWidthWithComposer(root, composer);
      return root;
    } catch {
      return null;
    }
  }

  function syncWidthWithComposer(root, composer) {
    try {
      const cs = window.getComputedStyle(composer);
      if (cs.maxWidth && cs.maxWidth !== 'none') {
        root.style.maxWidth = cs.maxWidth;
      } else {
        const w = composer.getBoundingClientRect().width;
        if (w > 240) {
          root.style.maxWidth = `${Math.round(w)}px`;
        }
      }
    } catch {}
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function postConfig(patch) {
    try {
      const resp = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (resp.ok) {
        await fetchStatusAndRender();
      }
    } catch {}
  }

  function render(data) {
    const root = ensureMounted();
    if (!root || !data) return;

    const cfg = data.config || {};
    if (cfg.enabled === false) {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';
    root.classList.toggle('is-collapsed', !!cfg.collapsed);
    root.classList.toggle('has-popover', popoverOpen);

    const nowMs = data.now || Date.now();
    const ctx = data.context;
    const localU = data.localUsage || {};
    const oq = data.officialQuotas || null;

    const ctxPct = ctx ? ctx.percent : 0;
    const ctxDetail = ctx ? `${fmtTokens(ctx.tokens)} / ${fmtTokens(ctx.window)}` : t('ожидание первого ответа', 'waiting for first response');
    const ctxColor = barColorClass(ctxPct);

    // Extra context metadata (cache hit + compactions)
    const metaParts = [];
    if (ctx && cfg.showCache !== false && ctx.cacheHit !== null && ctx.cacheHit !== undefined) {
      const cacheWarn = ctx.cacheHit < 50 ? ' is-warn' : '';
      metaParts.push(`<span class="agy-sl-dot">·</span><span class="agy-sl-detail${cacheWarn}">${t('кеш', 'cache')} ${ctx.cacheHit}%</span>`);
    }
    if (ctx && ctx.compactions && ctx.compactions.count > 0) {
      metaParts.push(
        `<span class="agy-sl-dot">·</span><span class="agy-sl-detail">${t('сжатий', 'compacts')}: ${ctx.compactions.count}</span>`
      );
    }

    // Decide 2nd row sources: official synced quotas (when present) OR local rolling 5h / 7d usage
    const hasOfficial5h = !!(oq && oq.fiveHour);
    const hasOfficialWeek = !!(oq && oq.weekly);

    const fivePct = hasOfficial5h ? oq.fiveHour.percent : (localU.fiveHour ? localU.fiveHour.percent : 0);
    const fiveReset = hasOfficial5h && oq.fiveHour.resetsAt
      ? `↻ ${fmtUntil(oq.fiveHour.resetsAt, nowMs)} (${fmtClock(oq.fiveHour.resetsAt)})`
      : (localU.fiveHour ? `${fmtTokens(localU.fiveHour.effectiveTokens)}` : '');

    const weekPct = hasOfficialWeek ? oq.weekly.percent : (localU.weekly ? localU.weekly.percent : 0);
    const weekReset = hasOfficialWeek && oq.weekly.resetsAt
      ? `↻ ${fmtUntil(oq.weekly.resetsAt, nowMs)}`
      : (localU.weekly ? `${fmtTokens(localU.weekly.effectiveTokens)}` : '');

    const fiveTooltip = hasOfficial5h
      ? t(
          `Официальная 5-часовая квота (синхр. ${fmtAgo(oq.capturedAt, nowMs)} назад из Настройки → Модели)`,
          `Official 5h quota (synced ${fmtAgo(oq.capturedAt, nowMs)} ago from Settings → Models)`
        )
      : t(
          `Локальный расход за 5ч: ${fmtTokens(localU.fiveHour?.effectiveTokens || 0)} новых токенов (всего с кешем: ${fmtTokens(localU.fiveHour?.totalTokens || 0)}). Откройте «Настройки → Модели» для синхронизации официальных квот.`,
          `Local 5h usage: ${fmtTokens(localU.fiveHour?.effectiveTokens || 0)} new tokens (${fmtTokens(localU.fiveHour?.totalTokens || 0)} incl. cache). Open Settings → Models to sync official quotas.`
        );

    const weekTooltip = hasOfficialWeek
      ? t(
          `Официальная недельная квота (синхр. ${fmtAgo(oq.capturedAt, nowMs)} назад из Настройки → Модели)`,
          `Official weekly quota (synced ${fmtAgo(oq.capturedAt, nowMs)} ago from Settings → Models)`
        )
      : t(
          `Локальный расход за 7д: ${fmtTokens(localU.weekly?.effectiveTokens || 0)} новых токенов (всего с кешем: ${fmtTokens(localU.weekly?.totalTokens || 0)}). Откройте «Настройки → Модели» для синхронизации официальных квот.`,
          `Local 7d usage: ${fmtTokens(localU.weekly?.effectiveTokens || 0)} new tokens (${fmtTokens(localU.weekly?.totalTokens || 0)} incl. cache). Open Settings → Models to sync official quotas.`
        );

    const ctxTooltip = ctx
      ? `${ctx.modelLabel || ctx.model || 'Model'} · ${t('ходов', 'turns')}: ${ctx.turns} · ${t('вход', 'in')}: ${fmtTokens(ctx.inputTokens)} + ${t('кеш', 'cache')}: ${fmtTokens(ctx.cacheReadTokens)} + ${t('выход', 'out')}: ${fmtTokens(ctx.outputTokens)}`
      : t('Ожидание первого ответа модели', 'Waiting for first model response');

    const popoverHtml = `
      <div class="agy-sl-popover" id="agy-sl-popover">
        <div class="agy-sl-pop-title">
          <span>${t('Настройки статус-бара', 'Statusline Settings')}</span>
          <button class="agy-sl-icon-btn" id="agy-sl-pop-close" title="${t('Закрыть', 'Close')}">✕</button>
        </div>
        <div class="agy-sl-pop-note">
          ${
            hasOfficial5h || hasOfficialWeek
              ? t(
                  `Официальные квоты синхронизированы ${fmtAgo(oq.capturedAt, nowMs)} назад. Откройте «Настройки → Модели» для обновления.`,
                  `Official quotas synced ${fmtAgo(oq.capturedAt, nowMs)} ago. Open Settings → Models to refresh.`
                )
              : t(
                  'Сейчас показан локальный расход токенов за 5ч и 7д. Откройте «Настройки → Модели», чтобы автоматически подхватить официальные квоты.',
                  'Showing local rolling 5h & 7d token usage. Open Settings → Models to sync official plan quotas.'
                )
          }
        </div>
        <div class="agy-sl-pop-row">
          <label for="agy-sl-b5h">${t('Бюджет 5ч (ток.):', '5h local budget:')}</label>
          <input class="agy-sl-pop-input" id="agy-sl-b5h" type="number" step="100000" value="${cfg.fiveHourBudgetTokens || 1500000}" />
        </div>
        <div class="agy-sl-pop-row">
          <label for="agy-sl-b7d">${t('Бюджет 7д (ток.):', '7d local budget:')}</label>
          <input class="agy-sl-pop-input" id="agy-sl-b7d" type="number" step="1000000" value="${cfg.weeklyBudgetTokens || 15000000}" />
        </div>
        <div class="agy-sl-pop-row">
          <button class="agy-sl-pop-btn" id="agy-sl-toggle-row2">${cfg.showSecondRow !== false ? t('Скрыть 2-ю строку', 'Hide 2nd row') : t('Показать 2-ю строку', 'Show 2nd row')}</button>
          <button class="agy-sl-pop-btn" id="agy-sl-save-budgets">${t('Сохранить', 'Save')}</button>
        </div>
        ${
          hasOfficial5h || hasOfficialWeek
            ? `<button class="agy-sl-pop-btn" id="agy-sl-clear-quotas">${t('Сбросить синхр. квоты (к локальным)', 'Reset synced quotas to local')}</button>`
            : ''
        }
      </div>
    `;

    if (cfg.collapsed) {
      root.innerHTML = `
        <div class="agy-sl-collapsed-row">
          <span>${t('Контекст', 'Context')}: <b>${ctxPct}%</b> (${escapeHtml(ctxDetail)}) · ${t('5ч', '5h')}: <b>${fivePct}%</b> · ${t('Нед', 'Wk')}: <b>${weekPct}%</b></span>
          <div class="agy-sl-actions" style="opacity:0.85">
            <button class="agy-sl-icon-btn" id="agy-sl-expand" title="${t('Развернуть', 'Expand')}">▲</button>
          </div>
        </div>
      `;
      const expBtn = root.querySelector('#agy-sl-expand');
      if (expBtn) expBtn.onclick = () => postConfig({ collapsed: false });
      return;
    }

    const row1Html = `
      <div class="agy-sl-row">
        <div class="agy-sl-meter agy-sl-meter-context" title="${escapeHtml(ctxTooltip)}">
          <span class="agy-sl-label">${t('Контекст', 'Context')}</span>
          <div class="agy-sl-track">
            <div class="agy-sl-fill ${ctxColor}" style="width:${ctxPct}%"></div>
          </div>
          <span class="agy-sl-pct ${ctxColor}">${ctx ? `${ctxPct}%` : '—'}</span>
          <span class="agy-sl-detail">${escapeHtml(ctxDetail)}</span>
        </div>
        <div class="agy-sl-meta">${metaParts.join('')}</div>
        <div class="agy-sl-actions">
          <button class="agy-sl-icon-btn" id="agy-sl-refresh" title="${t('Обновить', 'Refresh')}">↻</button>
          <button class="agy-sl-icon-btn" id="agy-sl-collapse" title="${t('Свернуть', 'Collapse')}">▾</button>
          <button class="agy-sl-icon-btn" id="agy-sl-settings" title="${t('Настройки', 'Settings')}">⚙</button>
        </div>
      </div>
    `;

    const row2Html = cfg.showSecondRow !== false
      ? `
        <div class="agy-sl-row agy-sl-row-limits">
          <div class="agy-sl-meter agy-sl-meter-limit" title="${escapeHtml(fiveTooltip)}">
            <span class="agy-sl-label">${t('5 часов', '5 hours')}</span>
            <div class="agy-sl-track">
              <div class="agy-sl-fill ${barColorClass(fivePct)}" style="width:${fivePct}%"></div>
            </div>
            <span class="agy-sl-pct ${barColorClass(fivePct)}">${fivePct}%</span>
            ${fiveReset ? `<span class="agy-sl-detail">${escapeHtml(fiveReset)}</span>` : ''}
          </div>
          <div class="agy-sl-meter agy-sl-meter-limit agy-sl-meter-limit-right" title="${escapeHtml(weekTooltip)}">
            <span class="agy-sl-label">${t('Неделя', 'Weekly')}</span>
            <div class="agy-sl-track">
              <div class="agy-sl-fill ${barColorClass(weekPct)}" style="width:${weekPct}%"></div>
            </div>
            <span class="agy-sl-pct ${barColorClass(weekPct)}">${weekPct}%</span>
            ${weekReset ? `<span class="agy-sl-detail">${escapeHtml(weekReset)}</span>` : ''}
          </div>
        </div>
      `
      : '';

    root.innerHTML = `<div class="agy-sl-rows">${row1Html}${row2Html}</div>${popoverHtml}`;

    const refBtn = root.querySelector('#agy-sl-refresh');
    if (refBtn) refBtn.onclick = (e) => { e.stopPropagation(); fetchStatusAndRender(); };

    const colBtn = root.querySelector('#agy-sl-collapse');
    if (colBtn) colBtn.onclick = (e) => { e.stopPropagation(); popoverOpen = false; postConfig({ collapsed: true }); };

    const setBtn = root.querySelector('#agy-sl-settings');
    if (setBtn) {
      setBtn.onclick = (e) => {
        e.stopPropagation();
        popoverOpen = !popoverOpen;
        root.classList.toggle('has-popover', popoverOpen);
      };
    }

    const closePop = root.querySelector('#agy-sl-pop-close');
    if (closePop) {
      closePop.onclick = (e) => {
        e.stopPropagation();
        popoverOpen = false;
        root.classList.remove('has-popover');
      };
    }

    const popEl = root.querySelector('#agy-sl-popover');
    if (popEl) popEl.onclick = (e) => e.stopPropagation();

    const toggleRow2Btn = root.querySelector('#agy-sl-toggle-row2');
    if (toggleRow2Btn) {
      toggleRow2Btn.onclick = () => postConfig({ showSecondRow: cfg.showSecondRow === false });
    }

    const saveBudgetsBtn = root.querySelector('#agy-sl-save-budgets');
    if (saveBudgetsBtn) {
      saveBudgetsBtn.onclick = () => {
        const v5 = Number(root.querySelector('#agy-sl-b5h')?.value);
        const v7 = Number(root.querySelector('#agy-sl-b7d')?.value);
        const patch = {};
        if (Number.isFinite(v5) && v5 >= 50_000) patch.fiveHourBudgetTokens = v5;
        if (Number.isFinite(v7) && v7 >= 500_000) patch.weeklyBudgetTokens = v7;
        popoverOpen = false;
        postConfig(patch);
      };
    }

    const clearQuotasBtn = root.querySelector('#agy-sl-clear-quotas');
    if (clearQuotasBtn) {
      clearQuotasBtn.onclick = () => {
        popoverOpen = false;
        postConfig({ clearOfficialQuotas: true });
      };
    }
  }

  // Passive read-only observer for Settings -> Models quota cards (both EN and RU)
  function parseDurationToIso(text) {
    if (!text) return null;
    const dMatch = text.match(/(\d+)\s*(?:d|day|days|д|дн)/i);
    const hMatch = text.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ч|час)/i);
    const mMatch = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes|м|мин)/i);
    const totalMs =
      (dMatch ? Number(dMatch[1]) * 86400_000 : 0) +
      (hMatch ? Number(hMatch[1]) * 3600_000 : 0) +
      (mMatch ? Number(mMatch[1]) * 60_000 : 0);
    if (totalMs <= 0) return null;
    return new Date(Date.now() + totalMs).toISOString();
  }

  function scanSettingsDomForQuotas() {
    try {
      // Only scan when we appear to be on a Settings / Models view (composer absent or Settings heading visible)
      const bodyText = document.body ? document.body.innerText : '';
      if (!bodyText || bodyText.length < 40) return;
      const looksLikeModelsSettings =
        /(quota|квот|rate limit|лимит|остаток|refreshes in|resets in|сброс через|обновится через|восстановится через)/i.test(bodyText) &&
        /(weekly|недел|5[\s-]*(?:hour|час|h\b|ч\b))/i.test(bodyText);
      if (!looksLikeModelsSettings) return;

      const blocks = Array.from(document.querySelectorAll('section, article, div')).filter((el) => {
        if (el.closest(`#${ROOT_ID}`)) return false;
        const txt = el.innerText || '';
        return txt.length > 10 && txt.length < 400 && /\d{1,3}%/.test(txt);
      });

      let fiveHour = null;
      let weekly = null;

      for (const el of blocks) {
        const txt = (el.innerText || '').trim();
        const pctMatch = txt.match(/(\d{1,3})\s*%/);
        if (!pctMatch) continue;
        let pct = Math.max(0, Math.min(100, Number(pctMatch[1])));
        // AntiGravity Settings -> Models shows REMAINING % ("Remaining ... limit" / "Остаток ... лимита")
        // even though the subtitle says "You've used some of..." / "Вы использовали часть...".
        const isRemaining = /(remaining|left|остаток|остал|восстановится|refreshes)/i.test(txt);
        const isExplicitUsedHeader = /^(?:used|использовано)\b/i.test(txt);
        if (isRemaining && !isExplicitUsedHeader) {
          pct = 100 - pct;
        }
        const resetsAt = parseDurationToIso(txt);

        if (!fiveHour && /(5[\s-]*(?:hour|hr|час)|5h\b|5ч\b)/i.test(txt) && !/(weekly|недел)/i.test(txt)) {
          fiveHour = { percent: pct, resetsAt };
        } else if (!weekly && /(weekly|7[\s-]*day|недел)/i.test(txt) && !/(5[\s-]*(?:hour|hr|час))/i.test(txt)) {
          weekly = { percent: pct, resetsAt };
        }
      }

      if (!fiveHour && !weekly) return;
      const fp = JSON.stringify({ fiveHour, weekly });
      if (fp === lastQuotaFingerprint) return;
      lastQuotaFingerprint = fp;

      fetch(`${API_BASE}/api/quota-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiveHour, weekly, source: 'settings-ui' }),
      })
        .then((r) => (r.ok ? fetchStatusAndRender() : null))
        .catch(() => {});
    } catch {}
  }

  async function fetchStatusAndRender() {
    if (disposed) return;
    try {
      const convId = detectConversationId();
      const qs = convId ? `?conversationId=${encodeURIComponent(convId)}` : '';
      const resp = await fetch(`${API_BASE}/api/status${qs}`, { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      lastData = data;
      render(data);
    } catch {}
  }

  function onDocClick() {
    if (popoverOpen) {
      popoverOpen = false;
      const root = document.getElementById(ROOT_ID);
      if (root) root.classList.remove('has-popover');
    }
  }

  injectStyles();
  fetchStatusAndRender();

  pollTimer = setInterval(fetchStatusAndRender, 3000);
  mountTimer = setInterval(() => {
    if (lastData) {
      const existing = document.getElementById(ROOT_ID);
      if (!existing || !existing.isConnected) {
        render(lastData);
      } else {
        const composer = findComposerContainer();
        if (composer) syncWidthWithComposer(existing, composer);
      }
    }
  }, 1000);
  settingsScanTimer = setInterval(scanSettingsDomForQuotas, 2500);

  document.addEventListener('click', onDocClick);

  try {
    domObserver = new MutationObserver(() => {
      if (!lastData || disposed) return;
      const existing = document.getElementById(ROOT_ID);
      if (!existing || !existing.isConnected) {
        render(lastData);
      }
    });
    if (document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
  } catch {}

  window.__ag_statusline_dispose = () => {
    disposed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (mountTimer) clearInterval(mountTimer);
    if (settingsScanTimer) clearInterval(settingsScanTimer);
    if (domObserver) {
      try { domObserver.disconnect(); } catch {}
    }
    document.removeEventListener('click', onDocClick);
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };
})();
