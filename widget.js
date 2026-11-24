(() => {
  'use strict';

  const API_BASE = 'http://127.0.0.1:39229';
  const ROOT_ID = 'agy-statusline-root';
  const STYLE_ID = 'agy-statusline-style';
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  const DEFAULT_THRESHOLDS = {
    context: { warn: 80, danger: 95 },
    cache: { warn: 50, danger: 20 },
    fiveHour: { warn: 80, danger: 95 },
    weekly: { warn: 80, danger: 95 },
  };

  const I18N = {
    en: {
      context: 'Context',
      fiveHours: '5 hours',
      weekly: 'Weekly',
      short5h: '5h',
      shortWk: 'Wk',
      cache: 'cache',
      cacheLabel: 'Cache (<)',
      compacts: 'compacts',
      waitingFirst: 'waiting for first response',
      waitingTooltip: 'Waiting for first model response',
      turns: 'turns',
      inTok: 'in',
      outTok: 'out',
      settingsTitle: 'Statusline Settings',
      language: 'Language:',
      thresholdsTitle: 'Thresholds (%)',
      warnCol: 'Yellow',
      dangerCol: 'Red',
      close: 'Close',
      refresh: 'Refresh',
      collapse: 'Collapse',
      expand: 'Expand',
      settings: 'Settings',
      hideRow1: 'Hide 1st row (Context)',
      showRow1: 'Show 1st row (Context)',
      syncedNote: (ago) => `Quotas synced ${ago} ago.`,
      localNote: 'Local token estimate active until quotas sync.',
      official5hTip: (ago) => `5h quota (synced ${ago} ago)`,
      officialWkTip: (ago) => `Weekly quota (synced ${ago} ago)`,
      local5hTip: (eff, tot) => `Local 5h usage: ${eff} new tokens (${tot} incl. cache).`,
      localWkTip: (eff, tot) => `Local 7d usage: ${eff} new tokens (${tot} incl. cache).`,
      unitD: 'd',
      unitH: 'h',
      unitM: 'm',
      lt1m: '<1m',
    },
    ru: {
      context: 'Контекст',
      fiveHours: '5 часов',
      weekly: 'Неделя',
      short5h: '5ч',
      shortWk: 'Нед',
      cache: 'кеш',
      cacheLabel: 'Кеш (<)',
      compacts: 'сжатий',
      waitingFirst: 'ожидание первого ответа',
      waitingTooltip: 'Ожидание первого ответа модели',
      turns: 'ходов',
      inTok: 'вход',
      outTok: 'выход',
      settingsTitle: 'Настройки статус-бара',
      language: 'Язык:',
      thresholdsTitle: 'Пороги (%)',
      warnCol: 'Жёлтый',
      dangerCol: 'Красный',
      close: 'Закрыть',
      refresh: 'Обновить',
      collapse: 'Свернуть',
      expand: 'Развернуть',
      settings: 'Настройки',
      hideRow1: 'Скрыть 1-ю строку (Контекст)',
      showRow1: 'Показать 1-ю строку (Контекст)',
      syncedNote: (ago) => `Квоты синхронизированы ${ago} назад.`,
      localNote: 'Локальный расчёт токенов до синхронизации квот.',
      official5hTip: (ago) => `5-часовая квота (синхр. ${ago} назад)`,
      officialWkTip: (ago) => `Недельная квота (синхр. ${ago} назад)`,
      local5hTip: (eff, tot) => `Локальный расход за 5ч: ${eff} новых токенов (с кешем: ${tot}).`,
      localWkTip: (eff, tot) => `Локальный расход за 7д: ${eff} новых токенов (с кешем: ${tot}).`,
      unitD: 'д',
      unitH: 'ч',
      unitM: 'м',
      lt1m: '<1м',
    },
    uk: {
      context: 'Контекст',
      fiveHours: '5 годин',
      weekly: 'Тиждень',
      short5h: '5г',
      shortWk: 'Тиж',
      cache: 'кеш',
      cacheLabel: 'Кеш (<)',
      compacts: 'стиснень',
      waitingFirst: 'очікування першої відповіді',
      waitingTooltip: 'Очікування першої відповіді моделі',
      turns: 'ходів',
      inTok: 'вхід',
      outTok: 'вихід',
      settingsTitle: 'Налаштування статус-бару',
      language: 'Мова:',
      thresholdsTitle: 'Пороги (%)',
      warnCol: 'Жовтий',
      dangerCol: 'Червоний',
      close: 'Закрити',
      refresh: 'Оновити',
      collapse: 'Згорнути',
      expand: 'Розгорнути',
      settings: 'Налаштування',
      hideRow1: 'Приховати 1-й рядок (Контекст)',
      showRow1: 'Показати 1-й рядок (Контекст)',
      syncedNote: (ago) => `Квоти синхронізовано ${ago} тому.`,
      localNote: 'Локальний підрахунок токенів до синхронізації квот.',
      official5hTip: (ago) => `5-годинна квота (синхр. ${ago} тому)`,
      officialWkTip: (ago) => `Тижнева квота (синхр. ${ago} тому)`,
      local5hTip: (eff, tot) => `Локальна витрата за 5г: ${eff} нових токенів (з кешем: ${tot}).`,
      localWkTip: (eff, tot) => `Локальна витрата за 7д: ${eff} нових токенів (з кешем: ${tot}).`,
      unitD: 'д',
      unitH: 'г',
      unitM: 'хв',
      lt1m: '<1хв',
    },
  };

  const SHADOW_CSS = `
    :host {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin: 0 auto 8px auto;
    }
    .agy-sl-card {
      position: relative;
      width: 100%;
      box-sizing: border-box;
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
    .agy-sl-card:hover {
      border-color: var(--glass-border, rgba(128, 128, 128, 0.28));
    }
    .agy-sl-card.is-collapsed {
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
      flex-wrap: nowrap;
    }
    .agy-sl-row-limits.is-stacked {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
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
      flex: 0 0 auto;
    }
    .agy-sl-label {
      flex: 0 0 auto;
      min-width: 64px;
      color: var(--foreground, #e8eaed);
      font-weight: 450;
      white-space: nowrap;
    }
    .agy-sl-meter-limit-right .agy-sl-label {
      min-width: 58px;
    }
    .agy-sl-row-limits.is-stacked .agy-sl-meter-limit-right .agy-sl-label {
      min-width: 64px;
    }
    .agy-sl-track {
      position: relative;
      flex: 0 0 var(--agy-ctx-bar-w, 150px);
      width: var(--agy-ctx-bar-w, 150px);
      height: 7px;
      border-radius: 999px;
      background: rgba(128, 128, 128, 0.28);
      overflow: hidden;
    }
    .agy-sl-meter-limit .agy-sl-track {
      flex: 0 0 var(--agy-limit-bar-w, 150px);
      width: var(--agy-limit-bar-w, 150px);
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
    .agy-sl-detail.is-danger {
      color: #e5484d;
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
    .agy-sl-actions {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      opacity: 0.25;
      transition: opacity 0.15s ease;
    }
    .agy-sl-card:hover .agy-sl-actions,
    .agy-sl-card.has-popover .agy-sl-actions {
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
      font-family: inherit;
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
      width: 248px;
      box-sizing: border-box;
      background: var(--card, #1e1f22);
      border: 1px solid var(--border, rgba(128, 128, 128, 0.28));
      border-radius: 10px;
      padding: 10px 11px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
      color: var(--foreground, #e8eaed);
      z-index: 9000;
      display: none;
      flex-direction: column;
      gap: 7px;
      font-size: 11.5px;
    }
    .agy-sl-card.has-popover .agy-sl-popover {
      display: flex;
    }
    .agy-sl-pop-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-weight: 600;
      font-size: 11.5px;
      white-space: nowrap;
    }
    .agy-sl-pop-note {
      font-size: 10.5px;
      line-height: 1.35;
      color: var(--muted-foreground, #9aa0a6);
    }
    .agy-sl-pop-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .agy-sl-lang-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px;
      border-radius: 8px;
      border: 1px solid var(--border, rgba(128, 128, 128, 0.25));
      background: var(--background, rgba(0, 0, 0, 0.2));
    }
    .agy-sl-lang-btn {
      background: transparent;
      border: none;
      color: var(--muted-foreground, #9aa0a6);
      font-family: inherit;
      font-size: 10.5px;
      font-weight: 600;
      padding: 3px 7px;
      border-radius: 6px;
      cursor: pointer;
      transition: background-color 0.12s ease, color 0.12s ease;
    }
    .agy-sl-lang-btn:hover:not(.is-active) {
      color: var(--foreground, #e8eaed);
      background: rgba(128, 128, 128, 0.14);
    }
    .agy-sl-lang-btn.is-active {
      background: #4e8ef7;
      color: #ffffff;
    }
    .agy-sl-thresh-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 62px 62px;
      gap: 5px 6px;
      align-items: center;
      padding-top: 4px;
      border-top: 1px solid var(--border, rgba(128, 128, 128, 0.18));
    }
    .agy-sl-thresh-grid > label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .agy-sl-thresh-head {
      font-size: 10px;
      color: var(--muted-foreground, #9aa0a6);
      font-weight: 500;
      white-space: nowrap;
    }
    .agy-sl-thresh-col {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      font-size: 10px;
      color: var(--muted-foreground, #9aa0a6);
      white-space: nowrap;
    }
    .agy-sl-swatch {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      display: inline-block;
    }
    .agy-sl-swatch.is-warn { background: #e0a030; }
    .agy-sl-swatch.is-danger { background: #e5484d; }
    .agy-sl-pop-input {
      width: 100%;
      box-sizing: border-box;
      padding: 3px 4px;
      border-radius: 6px;
      border: 1px solid var(--border, rgba(128, 128, 128, 0.28));
      background: var(--background, rgba(0, 0, 0, 0.2));
      color: var(--foreground, #e8eaed);
      font-family: inherit;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .agy-sl-pop-btn {
      background: var(--secondary, rgba(128, 128, 128, 0.16));
      border: 1px solid var(--border, rgba(128, 128, 128, 0.22));
      color: var(--foreground, #e8eaed);
      border-radius: 6px;
      padding: 5px 8px;
      font-family: inherit;
      font-size: 10.5px;
      cursor: pointer;
      font-weight: 500;
      white-space: nowrap;
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
  `;

  if (typeof window.__ag_statusline_dispose === 'function') {
    try { window.__ag_statusline_dispose(); } catch {}
  }

  let disposed = false;
  let lastData = null;
  let pollTimer = null;
  let mountTimer = null;
  let settingsScanTimer = null;
  let domObserver = null;
  let cardResizeObserver = null;
  let observedCard = null;
  let popoverOpen = false;
  let lastQuotaFingerprint = '';

  function setPopoverOpen(card, next) {
    popoverOpen = !!next;
    window.__ag_statusline_popover_open = popoverOpen;
    if (card) card.classList.toggle('has-popover', popoverOpen);
  }

  function getLang(cfg) {
    const c = cfg && cfg.lang;
    return I18N[c] ? c : 'en';
  }

  function getStrings(cfg) {
    return I18N[getLang(cfg)] || I18N.en;
  }

  function getThresholds(cfg) {
    const t = (cfg && cfg.thresholds) || {};
    return {
      context: { ...DEFAULT_THRESHOLDS.context, ...(t.context || {}) },
      cache: { ...DEFAULT_THRESHOLDS.cache, ...(t.cache || {}) },
      fiveHour: { ...DEFAULT_THRESHOLDS.fiveHour, ...(t.fiveHour || {}) },
      weekly: { ...DEFAULT_THRESHOLDS.weekly, ...(t.weekly || {}) },
    };
  }

  function barColorClass(pct, th) {
    const warn = th ? th.warn : 80;
    const danger = th ? th.danger : 95;
    if (pct >= danger) return 'is-danger';
    if (pct >= warn) return 'is-warn';
    return 'is-normal';
  }

  function cacheColorClass(hit, th) {
    const warn = th ? th.warn : 50;
    const danger = th ? th.danger : 20;
    if (hit <= danger) return 'is-danger';
    if (hit <= warn) return 'is-warn';
    return '';
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

  function fmtUntil(iso, nowMs, s) {
    if (!iso) return '';
    const target = Date.parse(iso);
    if (!Number.isFinite(target)) return '';
    const minutes = Math.max(0, Math.round((target - nowMs) / 60_000));
    if (minutes < 60) return `${minutes}${s.unitM}`;
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}${s.unitH} ${m}${s.unitM}`;
    }
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    return `${d}${s.unitD} ${h}${s.unitH}`;
  }

  function fmtClock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function fmtAgo(iso, nowMs, s) {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    const mins = Math.max(0, Math.floor((nowMs - ts) / 60_000));
    if (mins < 1) return s.lt1m;
    if (mins < 60) return `${mins}${s.unitM}`;
    const h = Math.floor(mins / 60);
    return `${h}${s.unitH}`;
  }

  function detectConversationId() {
    try {
      const href = window.location.href || '';
      const explicit = href.match(/(?:conversation|chat|session|thread)s?[\/=?&]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (explicit) return explicit[1];
      const all = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
      if (all && all.length > 0) {
        const projMatch = href.match(/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        const nonProj = all.filter((u) => !projMatch || u.toLowerCase() !== projMatch[1].toLowerCase());
        if (nonProj.length > 0) return nonProj[nonProj.length - 1];
      }
      const el = document.querySelector('[data-conversation-id], [data-session-id]');
      if (el) {
        const val = el.getAttribute('data-conversation-id') || el.getAttribute('data-session-id') || '';
        const m = val.match(UUID_RE);
        if (m) return m[0];
      }
    } catch {}
    return '';
  }

  function injectHostStyle() {
    let style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `#${ROOT_ID} { display: block; width: 100%; box-sizing: border-box; margin: 0 auto 8px auto; }`;
    document.head.appendChild(style);
  }

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
      if (rect.left < 180 && rect.width < 280) continue;

      const score = rect.bottom * 2 + rect.width;
      if (score > bestScore) {
        bestScore = score;
        bestEditor = el;
      }
    }

    if (!bestEditor) return null;

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

      if (r.height > Math.min(340, winH * 0.45)) break;

      if (radius >= 8 && hasBorder && r.width >= 260 && r.width <= winW - 40) {
        bestCard = node;
      }
      node = parent;
    }

    return bestCard || bestEditor.parentElement;
  }

  function createRootElement() {
    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.setAttribute('data-ag-no-translate', '1');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    const card = document.createElement('div');
    card.className = 'agy-sl-card';
    const rowsHost = document.createElement('div');
    rowsHost.className = 'agy-sl-rows-host';
    const popHost = document.createElement('div');
    popHost.className = 'agy-sl-popover-host';
    card.appendChild(rowsHost);
    card.appendChild(popHost);
    shadow.appendChild(style);
    shadow.appendChild(card);
    return host;
  }

  function ensureMounted() {
    if (disposed) return null;
    const composer = findComposerContainer();
    let existing = document.getElementById(ROOT_ID);

    if (existing && (!existing.shadowRoot || !existing.shadowRoot.querySelector('.agy-sl-rows-host'))) {
      existing.remove();
      existing = null;
    }

    if (!composer || !composer.parentElement) {
      if (existing) existing.remove();
      return null;
    }

    const parent = composer.parentElement;
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

  function updateDynamicBarWidths(card) {
    if (!card || !card.isConnected) return;
    const rowLimits = card.querySelector('.agy-sl-row-limits');
    if (!rowLimits) return;

    const availPx = card.clientWidth - 28; // 14px left + 14px right padding
    if (availPx <= 120) return;

    const meters = Array.from(rowLimits.querySelectorAll('.agy-sl-meter-limit'));
    if (meters.length < 2) return;

    const measureMeterFixed = (meter) => {
      let sum = 0;
      let count = 0;
      for (const ch of meter.children) {
        if (ch.classList.contains('agy-sl-track')) {
          count++;
          continue;
        }
        const w = ch.getBoundingClientRect().width;
        if (w > 0) {
          sum += w;
          count++;
        }
      }
      return sum + Math.max(0, count - 1) * 8;
    };

    const fixed0 = measureMeterFixed(meters[0]);
    const fixed1 = measureMeterFixed(meters[1]);
    const row2Actions = rowLimits.querySelector(':scope > .agy-sl-actions');
    const actionsPx = row2Actions ? row2Actions.getBoundingClientRect().width + 14 : 0;

    const MIN_BAR = 44;
    const MAX_BAR = 180;
    const METER_GAP = 18;
    const SAFETY_PX = 4;

    const rawPerBar = Math.floor((availPx - fixed0 - fixed1 - METER_GAP - actionsPx - SAFETY_PX) / 2);
    let limitBarPx;

    if (rawPerBar >= MIN_BAR) {
      limitBarPx = Math.min(MAX_BAR, rawPerBar);
      rowLimits.classList.remove('is-stacked');
    } else {
      const maxSingle = Math.max(fixed0, fixed1) + actionsPx + SAFETY_PX;
      limitBarPx = Math.max(40, Math.min(MAX_BAR, Math.floor(availPx - maxSingle)));
      rowLimits.classList.add('is-stacked');
    }

    card.style.setProperty('--agy-limit-bar-w', `${limitBarPx}px`);

    const rowCtx = card.querySelector('.agy-sl-row-context');
    if (rowCtx) {
      const ctxMeter = rowCtx.querySelector('.agy-sl-meter-context');
      let ctxFixed = ctxMeter ? measureMeterFixed(ctxMeter) : 0;
      const meta = rowCtx.querySelector('.agy-sl-meta');
      if (meta) ctxFixed += meta.getBoundingClientRect().width + 10;
      const acts = rowCtx.querySelector('.agy-sl-actions');
      if (acts) ctxFixed += acts.getBoundingClientRect().width + 10;
      const ctxBarPx = Math.max(40, Math.min(limitBarPx, Math.floor(availPx - ctxFixed - SAFETY_PX)));
      card.style.setProperty('--agy-ctx-bar-w', `${ctxBarPx}px`);
    }
  }

  function observeCardResize(card) {
    if (typeof ResizeObserver === 'undefined' || !card || card === observedCard) return;
    if (cardResizeObserver) {
      try { cardResizeObserver.disconnect(); } catch {}
    }
    observedCard = card;
    cardResizeObserver = new ResizeObserver(() => {
      updateDynamicBarWidths(card);
    });
    cardResizeObserver.observe(card);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPopover(card, popHost, data) {
    const cfg = data.config || {};
    const lang = getLang(cfg);
    const s = getStrings(cfg);
    const th = getThresholds(cfg);
    const nowMs = data.now || Date.now();
    const oq = data.officialQuotas || null;
    const showFirstRow = cfg.showFirstRow !== false;
    const hasOfficial5h = !!(oq && oq.fiveHour);
    const hasOfficialWeek = !!(oq && oq.weekly);
    const syncedAgo = oq && oq.capturedAt ? fmtAgo(oq.capturedAt, nowMs, s) : '';

    popHost.innerHTML = `
      <div class="agy-sl-popover" id="agy-sl-popover">
        <div class="agy-sl-pop-title">
          <span>${escapeHtml(s.settingsTitle)}</span>
          <button class="agy-sl-icon-btn" id="agy-sl-pop-close" title="${escapeHtml(s.close)}">✕</button>
        </div>
        <div class="agy-sl-pop-row">
          <span>${escapeHtml(s.language)}</span>
          <div class="agy-sl-lang-group">
            <button class="agy-sl-lang-btn ${lang === 'en' ? 'is-active' : ''}" data-lang="en">EN</button>
            <button class="agy-sl-lang-btn ${lang === 'ru' ? 'is-active' : ''}" data-lang="ru">RU</button>
            <button class="agy-sl-lang-btn ${lang === 'uk' ? 'is-active' : ''}" data-lang="uk">UA</button>
          </div>
        </div>
        <div class="agy-sl-thresh-grid">
          <span class="agy-sl-thresh-head">${escapeHtml(s.thresholdsTitle)}</span>
          <span class="agy-sl-thresh-col"><span class="agy-sl-swatch is-warn"></span>${escapeHtml(s.warnCol)}</span>
          <span class="agy-sl-thresh-col"><span class="agy-sl-swatch is-danger"></span>${escapeHtml(s.dangerCol)}</span>

          <label for="agy-sl-t-ctx-w">${escapeHtml(s.context)}</label>
          <input class="agy-sl-pop-input" id="agy-sl-t-ctx-w" type="text" inputmode="numeric" value="${th.context.warn}" />
          <input class="agy-sl-pop-input" id="agy-sl-t-ctx-d" type="text" inputmode="numeric" value="${th.context.danger}" />

          <label for="agy-sl-t-cache-w">${escapeHtml(s.cacheLabel)}</label>
          <input class="agy-sl-pop-input" id="agy-sl-t-cache-w" type="text" inputmode="numeric" value="${th.cache.warn}" />
          <input class="agy-sl-pop-input" id="agy-sl-t-cache-d" type="text" inputmode="numeric" value="${th.cache.danger}" />

          <label for="agy-sl-t-5h-w">${escapeHtml(s.fiveHours)}</label>
          <input class="agy-sl-pop-input" id="agy-sl-t-5h-w" type="text" inputmode="numeric" value="${th.fiveHour.warn}" />
          <input class="agy-sl-pop-input" id="agy-sl-t-5h-d" type="text" inputmode="numeric" value="${th.fiveHour.danger}" />

          <label for="agy-sl-t-wk-w">${escapeHtml(s.weekly)}</label>
          <input class="agy-sl-pop-input" id="agy-sl-t-wk-w" type="text" inputmode="numeric" value="${th.weekly.warn}" />
          <input class="agy-sl-pop-input" id="agy-sl-t-wk-d" type="text" inputmode="numeric" value="${th.weekly.danger}" />
        </div>
        <div class="agy-sl-pop-row">
          <button class="agy-sl-pop-btn" style="width:100%" id="agy-sl-toggle-row1">${escapeHtml(showFirstRow ? s.hideRow1 : s.showRow1)}</button>
        </div>
      </div>
    `;

    const closePop = popHost.querySelector('#agy-sl-pop-close');
    if (closePop) {
      closePop.onclick = (e) => {
        e.stopPropagation();
        setPopoverOpen(card, false);
      };
    }

    const popEl = popHost.querySelector('#agy-sl-popover');
    if (popEl) popEl.onclick = (e) => e.stopPropagation();

    popHost.querySelectorAll('.agy-sl-lang-btn').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const nextLang = btn.getAttribute('data-lang');
        if (nextLang && I18N[nextLang]) {
          await postConfig({ lang: nextLang }, true);
        }
      };
    });

    const toggleRow1Btn = popHost.querySelector('#agy-sl-toggle-row1');
    if (toggleRow1Btn) {
      toggleRow1Btn.onclick = async (e) => {
        e.stopPropagation();
        await postConfig({ showFirstRow: !showFirstRow }, true);
      };
    }

    let saveDebounce = null;
    const readPctOrNull = (sel) => {
      const raw = (popHost.querySelector(sel)?.value || '').trim().replace('%', '');
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
    };

    const applyThresholdsNow = async (syncInputsAfter = false) => {
      const curTh = getThresholds((lastData && lastData.config) || cfg);
      const val = (sel, fb) => {
        const parsed = readPctOrNull(sel);
        return parsed === null ? fb : parsed;
      };
      const thresholds = {
        context: { warn: val('#agy-sl-t-ctx-w', curTh.context.warn), danger: val('#agy-sl-t-ctx-d', curTh.context.danger) },
        cache: { warn: val('#agy-sl-t-cache-w', curTh.cache.warn), danger: val('#agy-sl-t-cache-d', curTh.cache.danger) },
        fiveHour: { warn: val('#agy-sl-t-5h-w', curTh.fiveHour.warn), danger: val('#agy-sl-t-5h-d', curTh.fiveHour.danger) },
        weekly: { warn: val('#agy-sl-t-wk-w', curTh.weekly.warn), danger: val('#agy-sl-t-wk-d', curTh.weekly.danger) },
      };
      // Update bars immediately without tearing down focused inputs
      await postConfig({ thresholds }, false);
      if (syncInputsAfter && lastData && lastData.config && lastData.config.thresholds) {
        const saved = lastData.config.thresholds;
        const setVal = (sel, v) => {
          const el = popHost.querySelector(sel);
          if (el && popHost.getRootNode().activeElement !== el) el.value = String(v);
        };
        setVal('#agy-sl-t-ctx-w', saved.context.warn);
        setVal('#agy-sl-t-ctx-d', saved.context.danger);
        setVal('#agy-sl-t-cache-w', saved.cache.warn);
        setVal('#agy-sl-t-cache-d', saved.cache.danger);
        setVal('#agy-sl-t-5h-w', saved.fiveHour.warn);
        setVal('#agy-sl-t-5h-d', saved.fiveHour.danger);
        setVal('#agy-sl-t-wk-w', saved.weekly.warn);
        setVal('#agy-sl-t-wk-d', saved.weekly.danger);
      }
    };

    popHost.querySelectorAll('.agy-sl-pop-input').forEach((inp) => {
      inp.oninput = () => {
        if (saveDebounce) clearTimeout(saveDebounce);
        // Only auto-apply when the edited field holds a valid number (don't clobber empty mid-edit state)
        const raw = inp.value.trim().replace('%', '');
        if (raw === '' || !Number.isFinite(Number(raw))) return;
        saveDebounce = setTimeout(() => {
          applyThresholdsNow(false);
        }, 300);
      };
      inp.onblur = () => {
        if (saveDebounce) { clearTimeout(saveDebounce); saveDebounce = null; }
        applyThresholdsNow(true);
      };
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (saveDebounce) { clearTimeout(saveDebounce); saveDebounce = null; }
          inp.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setPopoverOpen(card, false);
        }
      };
    });
  }

  async function postConfig(patch, rebuildPopover = false) {
    try {
      const resp = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (resp.ok) {
        await fetchStatusAndRender(rebuildPopover);
      }
    } catch {}
  }

  function render(data, rebuildPopover = false) {
    const root = ensureMounted();
    if (!root || !root.shadowRoot || !data) return;

    const shadow = root.shadowRoot;
    const card = shadow.querySelector('.agy-sl-card');
    const rowsHost = shadow.querySelector('.agy-sl-rows-host');
    const popHost = shadow.querySelector('.agy-sl-popover-host');
    if (!card || !rowsHost || !popHost) return;

    const cfg = data.config || {};
    if (cfg.enabled === false) {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';
    card.classList.toggle('is-collapsed', !!cfg.collapsed);
    card.classList.toggle('has-popover', popoverOpen);

    const s = getStrings(cfg);
    const th = getThresholds(cfg);
    const nowMs = data.now || Date.now();
    const ctx = data.context;
    const localU = data.localUsage || {};
    const oq = data.officialQuotas || null;
    const showFirstRow = cfg.showFirstRow !== false;

    const ctxPct = ctx ? ctx.percent : 0;
    const ctxDetail = ctx ? `${fmtTokens(ctx.tokens)} / ${fmtTokens(ctx.window)}` : s.waitingFirst;
    const ctxColor = barColorClass(ctxPct, th.context);

    const metaParts = [];
    if (ctx && cfg.showCache !== false && ctx.cacheHit !== null && ctx.cacheHit !== undefined) {
      const cacheCls = cacheColorClass(ctx.cacheHit, th.cache);
      metaParts.push(`<span class="agy-sl-dot">·</span><span class="agy-sl-detail${cacheCls ? ' ' + cacheCls : ''}">${s.cache} ${ctx.cacheHit}%</span>`);
    }
    if (ctx && ctx.compactions && ctx.compactions.count > 0) {
      metaParts.push(
        `<span class="agy-sl-dot">·</span><span class="agy-sl-detail">${s.compacts}: ${ctx.compactions.count}</span>`
      );
    }

    const hasOfficial5h = !!(oq && oq.fiveHour);
    const hasOfficialWeek = !!(oq && oq.weekly);

    const fivePct = hasOfficial5h ? oq.fiveHour.percent : (localU.fiveHour ? localU.fiveHour.percent : 0);
    const fiveColor = barColorClass(fivePct, th.fiveHour);
    const fiveReset = hasOfficial5h && oq.fiveHour.resetsAt
      ? `↻ ${fmtUntil(oq.fiveHour.resetsAt, nowMs, s)} (${fmtClock(oq.fiveHour.resetsAt)})`
      : (localU.fiveHour ? `${fmtTokens(localU.fiveHour.effectiveTokens)}` : '');

    const weekPct = hasOfficialWeek ? oq.weekly.percent : (localU.weekly ? localU.weekly.percent : 0);
    const weekColor = barColorClass(weekPct, th.weekly);
    const weekReset = hasOfficialWeek && oq.weekly.resetsAt
      ? `↻ ${fmtUntil(oq.weekly.resetsAt, nowMs, s)}`
      : (localU.weekly ? `${fmtTokens(localU.weekly.effectiveTokens)}` : '');

    const syncedAgo = oq && oq.capturedAt ? fmtAgo(oq.capturedAt, nowMs, s) : '';

    const fiveTooltip = hasOfficial5h
      ? s.official5hTip(syncedAgo)
      : s.local5hTip(fmtTokens(localU.fiveHour?.effectiveTokens || 0), fmtTokens(localU.fiveHour?.totalTokens || 0));

    const weekTooltip = hasOfficialWeek
      ? s.officialWkTip(syncedAgo)
      : s.localWkTip(fmtTokens(localU.weekly?.effectiveTokens || 0), fmtTokens(localU.weekly?.totalTokens || 0));

    const ctxTooltip = ctx
      ? `${ctx.modelLabel || ctx.model || 'Model'} · ${s.turns}: ${ctx.turns} · ${s.inTok}: ${fmtTokens(ctx.inputTokens)} + ${s.cache}: ${fmtTokens(ctx.cacheReadTokens)} + ${s.outTok}: ${fmtTokens(ctx.outputTokens)}`
      : s.waitingTooltip;

    const actionsHtml = `
      <div class="agy-sl-actions">
        <button class="agy-sl-icon-btn" id="agy-sl-refresh" title="${escapeHtml(s.refresh)}">↻</button>
        <button class="agy-sl-icon-btn" id="agy-sl-collapse" title="${escapeHtml(s.collapse)}">▾</button>
        <button class="agy-sl-icon-btn" id="agy-sl-settings" title="${escapeHtml(s.settings)}">⚙</button>
      </div>
    `;

    if (cfg.collapsed) {
      const collapsedSummary = showFirstRow
        ? `${escapeHtml(s.context)}: <b>${ctxPct}%</b> (${escapeHtml(ctxDetail)}) · ${escapeHtml(s.short5h)}: <b>${fivePct}%</b> · ${escapeHtml(s.shortWk)}: <b>${weekPct}%</b>`
        : `${escapeHtml(s.short5h)}: <b>${fivePct}%</b> · ${escapeHtml(s.shortWk)}: <b>${weekPct}%</b>`;
      rowsHost.innerHTML = `
        <div class="agy-sl-collapsed-row">
          <span>${collapsedSummary}</span>
          <div class="agy-sl-actions" style="opacity:0.85">
            <button class="agy-sl-icon-btn" id="agy-sl-expand" title="${escapeHtml(s.expand)}">▲</button>
          </div>
        </div>
      `;
      const expBtn = rowsHost.querySelector('#agy-sl-expand');
      if (expBtn) expBtn.onclick = () => postConfig({ collapsed: false });
      return;
    }

    const row1Html = showFirstRow
      ? `
        <div class="agy-sl-row agy-sl-row-context">
          <div class="agy-sl-meter agy-sl-meter-context" title="${escapeHtml(ctxTooltip)}">
            <span class="agy-sl-label">${escapeHtml(s.context)}</span>
            <div class="agy-sl-track">
              <div class="agy-sl-fill ${ctxColor}" style="width:${ctxPct}%"></div>
            </div>
            <span class="agy-sl-pct ${ctxColor}">${ctx ? `${ctxPct}%` : '—'}</span>
            <span class="agy-sl-detail">${escapeHtml(ctxDetail)}</span>
          </div>
          <div class="agy-sl-meta">${metaParts.join('')}</div>
          ${actionsHtml}
        </div>
      `
      : '';

    const row2Html = `
      <div class="agy-sl-row agy-sl-row-limits">
        <div class="agy-sl-meter agy-sl-meter-limit" title="${escapeHtml(fiveTooltip)}">
          <span class="agy-sl-label">${escapeHtml(s.fiveHours)}</span>
          <div class="agy-sl-track">
            <div class="agy-sl-fill ${fiveColor}" style="width:${fivePct}%"></div>
          </div>
          <span class="agy-sl-pct ${fiveColor}">${fivePct}%</span>
          ${fiveReset ? `<span class="agy-sl-detail">${escapeHtml(fiveReset)}</span>` : ''}
        </div>
        <div class="agy-sl-meter agy-sl-meter-limit agy-sl-meter-limit-right" title="${escapeHtml(weekTooltip)}">
          <span class="agy-sl-label">${escapeHtml(s.weekly)}</span>
          <div class="agy-sl-track">
            <div class="agy-sl-fill ${weekColor}" style="width:${weekPct}%"></div>
          </div>
          <span class="agy-sl-pct ${weekColor}">${weekPct}%</span>
          ${weekReset ? `<span class="agy-sl-detail">${escapeHtml(weekReset)}</span>` : ''}
        </div>
        ${!showFirstRow ? actionsHtml : ''}
      </div>
    `;

    rowsHost.innerHTML = `<div class="agy-sl-rows">${row1Html}${row2Html}</div>`;
    observeCardResize(card);
    updateDynamicBarWidths(card);

    const refBtn = rowsHost.querySelector('#agy-sl-refresh');
    if (refBtn) refBtn.onclick = (e) => { e.stopPropagation(); fetchStatusAndRender(); };

    const colBtn = rowsHost.querySelector('#agy-sl-collapse');
    if (colBtn) colBtn.onclick = (e) => { e.stopPropagation(); setPopoverOpen(card, false); postConfig({ collapsed: true }); };

    const setBtn = rowsHost.querySelector('#agy-sl-settings');
    if (setBtn) {
      setBtn.onclick = (e) => {
        e.stopPropagation();
        const next = !popoverOpen;
        if (next) {
          renderPopover(card, popHost, lastData || data);
        }
        setPopoverOpen(card, next);
      };
    }

    // Only rebuild the popover DOM when explicitly requested (e.g. language/row toggle) or when closed/empty.
    // Never clobber an open popover during background 3s polling!
    if (rebuildPopover || !popoverOpen || !popHost.firstElementChild) {
      renderPopover(card, popHost, data);
    }
  }

  function parseDurationToIso(text) {
    if (!text) return null;
    const dMatch = text.match(/(\d+)\s*(?:d|day|days|д|дн)/i);
    const hMatch = text.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ч|час|г|год)/i);
    const mMatch = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes|м|мин|хв)/i);
    const totalMs =
      (dMatch ? Number(dMatch[1]) * 86400_000 : 0) +
      (hMatch ? Number(hMatch[1]) * 3600_000 : 0) +
      (mMatch ? Number(mMatch[1]) * 60_000 : 0);
    if (totalMs <= 0) return null;
    return new Date(Date.now() + totalMs).toISOString();
  }

  function scanSettingsDomForQuotas() {
    try {
      const bodyText = document.body ? document.body.innerText : '';
      if (!bodyText || bodyText.length < 40) return;
      const looksLikeModelsSettings =
        /(quota|квот|rate limit|лимит|ліміт|остаток|залишок|refreshes in|resets in|сброс через|обновится через|восстановится через|відновиться через)/i.test(bodyText) &&
        /(weekly|недел|тижн|5[\s-]*(?:hour|час|год|h\b|ч\b|г\b))/i.test(bodyText);
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
        const isRemaining = /(remaining|left|остаток|остал|залиш|восстановится|відновиться|refreshes)/i.test(txt);
        const isExplicitUsedHeader = /^(?:used|использовано|використано)\b/i.test(txt);
        if (isRemaining && !isExplicitUsedHeader) {
          pct = 100 - pct;
        }
        const resetsAt = parseDurationToIso(txt);

        if (!fiveHour && /(5[\s-]*(?:hour|hr|час|год)|5h\b|5ч\b|5г\b)/i.test(txt) && !/(weekly|недел|тиж)/i.test(txt)) {
          fiveHour = { percent: pct, resetsAt };
        } else if (!weekly && /(weekly|7[\s-]*day|недел|тиж)/i.test(txt) && !/(5[\s-]*(?:hour|hr|час|год))/i.test(txt)) {
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

  async function fetchStatusAndRender(rebuildPopover = false) {
    if (disposed) return;
    try {
      const convId = detectConversationId();
      const qs = convId ? `?conversationId=${encodeURIComponent(convId)}` : '';
      const resp = await fetch(`${API_BASE}/api/status${qs}`, { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      lastData = data;
      render(data, rebuildPopover);
    } catch {}
  }

  function onDocClick(e) {
    if (!popoverOpen) return;
    const root = document.getElementById(ROOT_ID);
    const card = root && root.shadowRoot && root.shadowRoot.querySelector('.agy-sl-card');
    const popEl = root && root.shadowRoot && root.shadowRoot.querySelector('#agy-sl-popover');
    if (popEl && e && typeof e.composedPath === 'function' && e.composedPath().includes(popEl)) {
      return;
    }
    setPopoverOpen(card, false);
  }

  injectHostStyle();
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
    window.__ag_statusline_popover_open = false;
    if (pollTimer) clearInterval(pollTimer);
    if (mountTimer) clearInterval(mountTimer);
    if (settingsScanTimer) clearInterval(settingsScanTimer);
    if (domObserver) {
      try { domObserver.disconnect(); } catch {}
    }
    if (cardResizeObserver) {
      try { cardResizeObserver.disconnect(); } catch {}
    }
    observedCard = null;
    document.removeEventListener('click', onDocClick);
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };
})();
