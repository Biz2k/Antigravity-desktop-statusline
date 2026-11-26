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
      hideCache: 'Hide cache hit (%)',
      showCache: 'Show cache hit (%)',
      hideModel: 'Hide model',
      showModel: 'Show model',
      visibilityTitle: 'Show / Hide',
      visCompacts: 'Compacts',
      visCompactBtn: '/compact',
      visCache: 'Cache',
      visModel: 'Model',
      visPlan: 'Plan',
      resetThresholds: 'Reset thresholds',
      compactHintTip: 'Run /compact in chat to compress context',
      compactDraftTip: 'Copied /compact (input is not empty)',
      burnRateTip: (rate, eta) => eta ? `Rate: ~${rate}/h · ~${eta} to limit` : `Rate: ~${rate}/h`,
      subagentsTip: (n) => `${n} active parallel/subagent session(s)`,
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
    de: {
      context: 'Kontext',
      fiveHours: '5 Std.',
      weekly: 'Woche',
      short5h: '5h',
      shortWk: 'Wo',
      cache: 'Cache',
      cacheLabel: 'Cache (<)',
      compacts: 'Kompr.',
      waitingFirst: 'Warte auf erste Antwort',
      waitingTooltip: 'Warte auf erste Modellantwort',
      turns: 'Züge',
      inTok: 'Ein',
      outTok: 'Aus',
      settingsTitle: 'Statusleiste',
      language: 'Sprache:',
      thresholdsTitle: 'Schwellen (%)',
      warnCol: 'Gelb',
      dangerCol: 'Rot',
      close: 'Schließen',
      refresh: 'Aktualisieren',
      collapse: 'Einklappen',
      expand: 'Ausklappen',
      settings: 'Einstellungen',
      hideRow1: '1. Zeile ausblenden (Kontext)',
      showRow1: '1. Zeile anzeigen (Kontext)',
      hideCache: 'Cache aus',
      showCache: 'Cache an',
      hideModel: 'Modell aus',
      showModel: 'Modell an',
      visibilityTitle: 'Ein- / Ausblenden',
      visCompacts: 'Kompr.',
      visCompactBtn: '/compact',
      visCache: 'Cache',
      visModel: 'Modell',
      visPlan: 'Abo',
      resetThresholds: 'Schwellen zurücksetzen',
      compactHintTip: '/compact im Chat senden, um den Kontext zu komprimieren',
      compactDraftTip: '/compact kopiert (Eingabefeld nicht leer)',
      burnRateTip: (rate, eta) => eta ? `Rate: ~${rate}/h · ~${eta} bis Limit` : `Rate: ~${rate}/h`,
      subagentsTip: (n) => `${n} aktive parallele/Subagent-Sitzung(en)`,
      syncedNote: (ago) => `Kontingent vor ${ago} synchr.`,
      localNote: 'Lokale Token-Schätzung bis zur Synchronisierung.',
      official5hTip: (ago) => `5h-Kontingent (vor ${ago} synchr.)`,
      officialWkTip: (ago) => `Wochenkontingent (vor ${ago} synchr.)`,
      local5hTip: (eff, tot) => `Lokaler 5h-Verbrauch: ${eff} neue Token (${tot} inkl. Cache).`,
      localWkTip: (eff, tot) => `Lokaler 7T-Verbrauch: ${eff} neue Token (${tot} inkl. Cache).`,
      unitD: 'T',
      unitH: 'h',
      unitM: 'm',
      lt1m: '<1m',
    },
    fr: {
      context: 'Contexte',
      fiveHours: '5 heures',
      weekly: 'Semaine',
      short5h: '5h',
      shortWk: 'Sem',
      cache: 'cache',
      cacheLabel: 'Cache (<)',
      compacts: 'comp.',
      waitingFirst: 'En attente de réponse',
      waitingTooltip: 'En attente de la première réponse du modèle',
      turns: 'tours',
      inTok: 'ent.',
      outTok: 'sort.',
      settingsTitle: 'Paramètres',
      language: 'Langue :',
      thresholdsTitle: 'Seuils (%)',
      warnCol: 'Jaune',
      dangerCol: 'Rouge',
      close: 'Fermer',
      refresh: 'Actualiser',
      collapse: 'Réduire',
      expand: 'Déplier',
      settings: 'Paramètres',
      hideRow1: 'Masquer 1re ligne (Contexte)',
      showRow1: 'Afficher 1re ligne (Contexte)',
      hideCache: 'Masquer cache',
      showCache: 'Afficher cache',
      hideModel: 'Masquer modèle',
      showModel: 'Afficher modèle',
      visibilityTitle: 'Afficher / Masquer',
      visCompacts: 'Comp.',
      visCompactBtn: '/compact',
      visCache: 'Cache',
      visModel: 'Modèle',
      visPlan: 'Offre',
      resetThresholds: 'Réinitialiser les seuils',
      compactHintTip: 'Envoyer /compact dans le chat pour compresser le contexte',
      compactDraftTip: '/compact copié (champ de saisie non vide)',
      burnRateTip: (rate, eta) => eta ? `Rythme : ~${rate}/h · ~${eta} avant limite` : `Rythme : ~${rate}/h`,
      subagentsTip: (n) => `${n} session(s) parallèle(s)/sous-agent active(s)`,
      syncedNote: (ago) => `Quotas synchronisés il y a ${ago}.`,
      localNote: 'Estimation locale en attendant la synchronisation.',
      official5hTip: (ago) => `Quota 5h (synchr. il y a ${ago})`,
      officialWkTip: (ago) => `Quota hebdo (synchr. il y a ${ago})`,
      local5hTip: (eff, tot) => `Usage local 5h : ${eff} nouveaux tokens (${tot} avec cache).`,
      localWkTip: (eff, tot) => `Usage local 7j : ${eff} nouveaux tokens (${tot} avec cache).`,
      unitD: 'j',
      unitH: 'h',
      unitM: 'm',
      lt1m: '<1m',
    },
    zh: {
      context: '上下文',
      fiveHours: '5小时',
      weekly: '每周',
      short5h: '5h',
      shortWk: '周',
      cache: '缓存',
      cacheLabel: '缓存 (<)',
      compacts: '压缩',
      waitingFirst: '等待首次回复',
      waitingTooltip: '等待模型首次回复',
      turns: '轮次',
      inTok: '输入',
      outTok: '输出',
      settingsTitle: '状态栏设置',
      language: '语言：',
      thresholdsTitle: '阈值 (%)',
      warnCol: '黄色',
      dangerCol: '红色',
      close: '关闭',
      refresh: '刷新',
      collapse: '收起',
      expand: '展开',
      settings: '设置',
      hideRow1: '隐藏第1行 (上下文)',
      showRow1: '显示第1行 (上下文)',
      hideCache: '隐藏缓存 (%)',
      showCache: '显示缓存 (%)',
      hideModel: '隐藏模型',
      showModel: '显示模型',
      visibilityTitle: '显示 / 隐藏',
      visCompacts: '压缩次数',
      visCompactBtn: '/compact',
      visCache: '缓存',
      visModel: '模型',
      visPlan: '套餐',
      resetThresholds: '重置阈值',
      compactHintTip: '点击向聊天发送 /compact 以压缩上下文',
      compactDraftTip: '已复制 /compact（输入框非空）',
      burnRateTip: (rate, eta) => eta ? `速率: ~${rate}/时 · 约 ${eta} 达上限` : `速率: ~${rate}/时`,
      subagentsTip: (n) => `${n} 个活跃并行/子代理会话`,
      syncedNote: (ago) => `配额已于 ${ago} 前同步。`,
      localNote: '配额同步前使用本地估算。',
      official5hTip: (ago) => `5小时配额 (${ago} 前同步)`,
      officialWkTip: (ago) => `每周配额 (${ago} 前同步)`,
      local5hTip: (eff, tot) => `本地5小时用量: ${eff} 新令牌 (含缓存 ${tot})。`,
      localWkTip: (eff, tot) => `本地7天用量: ${eff} 新令牌 (含缓存 ${tot})。`,
      unitD: '天',
      unitH: '时',
      unitM: '分',
      lt1m: '<1分',
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
      hideCache: 'Скрыть кеш (%)',
      showCache: 'Показать кеш (%)',
      hideModel: 'Скрыть модель',
      showModel: 'Показать модель',
      visibilityTitle: 'Отображать / скрыть',
      visCompacts: 'Сжатия',
      visCompactBtn: '/compact',
      visCache: 'Кеш',
      visModel: 'Модель',
      visPlan: 'Подписка',
      resetThresholds: 'Сбросить пороги',
      compactHintTip: 'Отправить /compact в чат для сжатия контекста',
      compactDraftTip: 'Скопировано /compact (поле ввода не пустое)',
      burnRateTip: (rate, eta) => eta ? `Темп: ~${rate}/ч · ~${eta} до лимита` : `Темп: ~${rate}/ч`,
      subagentsTip: (n) => `Активных параллельных/субагент-сессий: ${n}`,
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
      hideCache: 'Приховати кеш (%)',
      showCache: 'Показати кеш (%)',
      hideModel: 'Приховати модель',
      showModel: 'Показати модель',
      visibilityTitle: 'Показати / приховати',
      visCompacts: 'Стиснення',
      visCompactBtn: '/compact',
      visCache: 'Кеш',
      visModel: 'Модель',
      visPlan: 'Підписка',
      resetThresholds: 'Скинути пороги',
      compactHintTip: 'Надіслати /compact у чат для стиснення контексту',
      compactDraftTip: 'Скопійовано /compact (поле введення не порожнє)',
      burnRateTip: (rate, eta) => eta ? `Темп: ~${rate}/г · ~${eta} до ліміту` : `Темп: ~${rate}/г`,
      subagentsTip: (n) => `Активних паралельних/субагент-сесій: ${n}`,
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
    .agy-sl-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 500;
      line-height: 1.3;
      background: var(--secondary, rgba(128, 128, 128, 0.16));
      color: var(--foreground, #e8eaed);
      border: 1px solid var(--border, rgba(128, 128, 128, 0.22));
      flex-shrink: 0;
    }
    .agy-sl-plan-badge {
      background: rgba(78, 142, 247, 0.14);
      color: #6ea8fe;
      border-color: rgba(78, 142, 247, 0.35);
      font-weight: 600;
    }
    .agy-sl-compact-btn {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 999px;
      font-family: inherit;
      font-size: 10.5px;
      font-weight: 500;
      line-height: 1.3;
      background: var(--secondary, rgba(128, 128, 128, 0.14));
      color: var(--muted-foreground, #9aa0a6);
      border: 1px solid var(--border, rgba(128, 128, 128, 0.24));
      cursor: pointer;
      flex-shrink: 0;
      transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
    }
    .agy-sl-compact-btn:hover {
      background: rgba(78, 142, 247, 0.2);
      color: var(--foreground, #ffffff);
      border-color: rgba(78, 142, 247, 0.5);
    }
    .agy-sl-compact-btn.is-warn {
      background: rgba(224, 160, 48, 0.16);
      color: #e0a030;
      border-color: rgba(224, 160, 48, 0.45);
      font-weight: 600;
    }
    .agy-sl-compact-btn.is-danger {
      background: rgba(229, 72, 77, 0.16);
      color: #e5484d;
      border-color: rgba(229, 72, 77, 0.5);
      font-weight: 600;
    }
    .agy-sl-compact-btn.is-sent {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.5);
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
      width: 264px;
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
      font-size: 10px;
      font-weight: 600;
      padding: 3px 5px;
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
    .agy-sl-vis-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border, rgba(128, 128, 128, 0.18));
    }
    .agy-sl-vis-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 6px;
    }
    .agy-sl-vis-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      width: 100%;
      box-sizing: border-box;
      padding: 4px 7px;
      border-radius: 6px;
      border: 1px solid var(--border, rgba(128, 128, 128, 0.2));
      background: transparent;
      color: var(--muted-foreground, #9aa0a6);
      font-family: inherit;
      font-size: 10.5px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    .agy-sl-vis-btn:hover {
      border-color: rgba(78, 142, 247, 0.45);
      color: var(--foreground, #e8eaed);
    }
    .agy-sl-vis-btn.is-on {
      background: rgba(78, 142, 247, 0.14);
      border-color: rgba(78, 142, 247, 0.42);
      color: var(--foreground, #e8eaed);
    }
    .agy-sl-vis-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid rgba(154, 160, 166, 0.55);
      background: transparent;
      box-sizing: border-box;
    }
    .agy-sl-vis-btn.is-on .agy-sl-vis-dot {
      border-color: #4e8ef7;
      background: #4e8ef7;
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
  let composerResizeObserver = null;
  let observedCard = null;
  let observedComposer = null;
  let cachedComposer = null;
  let remountTimer = null;
  let renderedLayoutKey = '';
  let lastMetaHtml = '';
  let lastLayoutMetricsKey = '';
  let popoverOpen = false;
  let lastQuotaFingerprint = '';
  let eventSource = null;
  let sseConnected = false;
  let sseConvId = '';

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

  function fmtMinutes(mins, s) {
    if (!Number.isFinite(mins) || mins <= 0) return '';
    const mTotal = Math.round(mins);
    if (mTotal < 60) return `${mTotal}${s.unitM}`;
    const h = Math.floor(mTotal / 60);
    const m = mTotal % 60;
    return m > 0 ? `${h}${s.unitH} ${m}${s.unitM}` : `${h}${s.unitH}`;
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

  function getComposerContainer() {
    if (cachedComposer && cachedComposer.isConnected) {
      return cachedComposer;
    }
    cachedComposer = findComposerContainer();
    return cachedComposer;
  }

  function observeComposerResize(composer) {
    if (typeof ResizeObserver === 'undefined' || !composer || composer === observedComposer) return;
    if (composerResizeObserver) {
      try { composerResizeObserver.disconnect(); } catch {}
    }
    observedComposer = composer;
    composerResizeObserver = new ResizeObserver(() => {
      const root = document.getElementById(ROOT_ID);
      if (root && composer.isConnected) {
        syncWidthWithComposer(root, composer);
      }
    });
    composerResizeObserver.observe(composer);
  }

  function ensureMounted() {
    if (disposed) return null;
    const composer = getComposerContainer();
    let existing = document.getElementById(ROOT_ID);

    if (existing && (!existing.shadowRoot || !existing.shadowRoot.querySelector('.agy-sl-rows-host'))) {
      existing.remove();
      existing = null;
      renderedLayoutKey = '';
    }

    if (!composer || !composer.parentElement) {
      if (existing) existing.remove();
      renderedLayoutKey = '';
      return null;
    }

    const parent = composer.parentElement;
    if (existing && existing.parentElement === parent && existing.nextElementSibling === composer) {
      observeComposerResize(composer);
      return existing;
    }

    const root = existing || createRootElement();
    if (!existing) renderedLayoutKey = '';
    try {
      parent.insertBefore(root, composer);
      syncWidthWithComposer(root, composer);
      observeComposerResize(composer);
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
    const availPx = card.clientWidth - 28; // 14px left + 14px right padding
    if (availPx <= 120) return;

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

    const MIN_BAR = 44;
    const MAX_BAR = 180;
    const METER_GAP = 18;
    const SAFETY_PX = 4;

    let limitBarPx = MAX_BAR;
    const rowLimits = card.querySelector('.agy-sl-row-limits');
    if (rowLimits) {
      const meters = Array.from(rowLimits.querySelectorAll('.agy-sl-meter-limit'));
      const row2Actions = rowLimits.querySelector(':scope > .agy-sl-actions');
      const actionsPx = row2Actions ? row2Actions.getBoundingClientRect().width + 14 : 0;

      if (meters.length >= 2) {
        const fixed0 = measureMeterFixed(meters[0]);
        const fixed1 = measureMeterFixed(meters[1]);
        const rawPerBar = Math.floor((availPx - fixed0 - fixed1 - METER_GAP - actionsPx - SAFETY_PX) / 2);
        if (rawPerBar >= MIN_BAR) {
          limitBarPx = Math.min(MAX_BAR, rawPerBar);
          rowLimits.classList.remove('is-stacked');
        } else {
          const maxSingle = Math.max(fixed0, fixed1) + actionsPx + SAFETY_PX;
          limitBarPx = Math.max(40, Math.min(MAX_BAR, Math.floor(availPx - maxSingle)));
          rowLimits.classList.add('is-stacked');
        }
      } else if (meters.length === 1) {
        const fixed0 = measureMeterFixed(meters[0]);
        limitBarPx = Math.max(40, Math.min(MAX_BAR, Math.floor(availPx - fixed0 - actionsPx - SAFETY_PX)));
        rowLimits.classList.remove('is-stacked');
      }
      card.style.setProperty('--agy-limit-bar-w', `${limitBarPx}px`);
    }

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
    const showCompacts = cfg.showCompacts !== false;
    const showCompactBtn = cfg.showCompactBtn !== false;
    const showCache = cfg.showCache !== false;
    const showModelBadge = cfg.showModelBadge === true;
    const showPlanBadge = cfg.showPlanBadge !== false;
    const showFiveHour = cfg.showFiveHour !== false;
    const showWeekly = cfg.showWeekly !== false;
    const visItems = [
      { key: 'showFirstRow', on: showFirstRow, label: s.context },
      { key: 'showCompacts', on: showCompacts, label: s.visCompacts },
      { key: 'showCompactBtn', on: showCompactBtn, label: s.visCompactBtn },
      { key: 'showCache', on: showCache, label: s.visCache },
      { key: 'showModelBadge', on: showModelBadge, label: s.visModel },
      { key: 'showPlanBadge', on: showPlanBadge, label: s.visPlan },
      { key: 'showFiveHour', on: showFiveHour, label: s.fiveHours },
      { key: 'showWeekly', on: showWeekly, label: s.weekly },
    ];
    const hasOfficial5h = !!(oq && oq.fiveHour);
    const hasOfficialWeek = !!(oq && oq.weekly);
    const syncedAgo = oq && oq.capturedAt ? fmtAgo(oq.capturedAt, nowMs, s) : '';
    const statusNote = (hasOfficial5h || hasOfficialWeek) && syncedAgo
      ? s.syncedNote(syncedAgo)
      : s.localNote;

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
            <button class="agy-sl-lang-btn ${lang === 'de' ? 'is-active' : ''}" data-lang="de">DE</button>
            <button class="agy-sl-lang-btn ${lang === 'fr' ? 'is-active' : ''}" data-lang="fr">FR</button>
            <button class="agy-sl-lang-btn ${lang === 'zh' ? 'is-active' : ''}" data-lang="zh">ZH</button>
            <button class="agy-sl-lang-btn ${lang === 'ru' ? 'is-active' : ''}" data-lang="ru">RU</button>
            <button class="agy-sl-lang-btn ${lang === 'uk' ? 'is-active' : ''}" data-lang="uk">UA</button>
          </div>
        </div>
        <div class="agy-sl-vis-section">
          <span class="agy-sl-thresh-head">${escapeHtml(s.visibilityTitle)}</span>
          <div class="agy-sl-vis-grid">
            ${visItems
              .map(
                (item) =>
                  `<button type="button" class="agy-sl-vis-btn ${item.on ? 'is-on' : ''}" data-vis-key="${item.key}"><span class="agy-sl-vis-dot"></span><span>${escapeHtml(item.label)}</span></button>`
              )
              .join('')}
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
          <button class="agy-sl-pop-btn" style="width:100%" id="agy-sl-reset-thresh">${escapeHtml(s.resetThresholds)}</button>
        </div>
        <div class="agy-sl-pop-note">${escapeHtml(statusNote)}</div>
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

    popHost.querySelectorAll('.agy-sl-vis-btn').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-vis-key');
        if (!key) return;
        const curOn = key === 'showModelBadge' ? cfg[key] === true : cfg[key] !== false;
        await postConfig({ [key]: !curOn }, true);
      };
    });

    const resetThreshBtn = popHost.querySelector('#agy-sl-reset-thresh');
    if (resetThreshBtn) {
      resetThreshBtn.onclick = async (e) => {
        e.stopPropagation();
        await postConfig({ thresholds: DEFAULT_THRESHOLDS }, true);
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

  function findEditorInComposer(composer) {
    if (!composer || !composer.isConnected) return null;
    return composer.querySelector(
      'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]'
    );
  }

  function findSendButtonInComposer(composer) {
    if (!composer || !composer.isConnected) return null;
    const selectors = [
      'button[type="submit"]:not(:disabled)',
      'button[data-testid*="send" i]:not(:disabled)',
      'button[aria-label*="send" i]:not(:disabled)',
      'button[aria-label*="submit" i]:not(:disabled)',
      'button[aria-label*="отправ" i]:not(:disabled)',
      'button[aria-label*="надісл" i]:not(:disabled)',
      'button[title*="send" i]:not(:disabled)',
      'button[title*="отправ" i]:not(:disabled)',
    ];
    for (const sel of selectors) {
      const btn = composer.querySelector(sel);
      if (btn && !btn.closest(`#${ROOT_ID}`)) return btn;
    }
    return null;
  }

  function dispatchEnterKey(el) {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function findSlashCompactOption() {
    const containers = document.querySelectorAll(
      '[role="listbox"], [role="menu"], [data-floating-ui-portal], [data-base-ui-portal]'
    );
    for (const c of containers) {
      if (!c || c.closest(`#${ROOT_ID}`)) continue;
      const items = c.querySelectorAll('[role="option"], [role="menuitem"], button, li, div');
      for (const item of items) {
        const txt = (item.textContent || '').trim();
        if (!txt || txt.length > 160) continue;
        if (/^\/compact\b/i.test(txt)) {
          const rect = item.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 12) return item;
        }
      }
    }
    return null;
  }

  async function triggerCompactInChat(btnEl) {
    const flash = (label) => {
      if (!btnEl || !btnEl.isConnected) return;
      const orig = btnEl.textContent;
      btnEl.classList.add('is-sent');
      btnEl.textContent = label;
      setTimeout(() => {
        if (btnEl && btnEl.isConnected) {
          btnEl.classList.remove('is-sent');
          btnEl.textContent = orig || '/compact';
        }
      }, 1200);
    };

    const copyFallback = async () => {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText('/compact');
        }
      } catch {}
      flash('✓');
    };

    try {
      const composer = getComposerContainer();
      const editor = findEditorInComposer(composer);
      if (!editor) {
        await copyFallback();
        return;
      }

      const existingText = (
        editor.tagName === 'TEXTAREA' ? editor.value : editor.textContent || ''
      ).trim();
      // Never clobber an unsent user draft — copy /compact instead
      if (existingText.length > 0 && existingText !== '/compact') {
        await copyFallback();
        return;
      }

      editor.focus();
      if (existingText !== '/compact') {
        if (editor.tagName === 'TEXTAREA') {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) setter.call(editor, '/compact');
          else editor.value = '/compact';
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const inserted = document.execCommand && document.execCommand('insertText', false, '/compact');
          if (!inserted) {
            editor.textContent = '/compact';
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '/compact' }));
          }
        }
      }

      flash('✓');

      // Step 1: Wait for the slash-command menu to appear and select /compact from it
      // (clicking Send directly would send literal "/compact" text instead of invoking the slash command)
      setTimeout(() => {
        try {
          const slashItem = findSlashCompactOption();
          if (slashItem) {
            slashItem.click();
          } else {
            dispatchEnterKey(editor);
          }

          // Step 2: If selecting the slash command inserted a chip/token that still needs submission, submit it
          setTimeout(() => {
            try {
              const cur = (editor.tagName === 'TEXTAREA' ? editor.value : editor.textContent || '').trim();
              if (cur.length > 0) {
                const sendBtn = findSendButtonInComposer(composer);
                if (sendBtn) sendBtn.click();
                else dispatchEnterKey(editor);
              }
            } catch {}
          }, 160);
        } catch {}
      }, 180);
    } catch {
      await copyFallback();
    }
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
    const showCompacts = cfg.showCompacts !== false;
    const showCompactBtn = cfg.showCompactBtn !== false;
    const showCache = cfg.showCache !== false;
    const showModelBadge = cfg.showModelBadge === true;
    const showPlanBadge = cfg.showPlanBadge !== false;
    const showFiveHour = cfg.showFiveHour !== false;
    const showWeekly = cfg.showWeekly !== false;

    const ctxPct = ctx ? ctx.percent : 0;
    const ctxWinStr = ctx ? `${ctx.windowEstimated ? '~' : ''}${fmtTokens(ctx.window)}` : '';
    const ctxDetail = ctx ? `${fmtTokens(ctx.tokens)} / ${ctxWinStr}` : s.waitingFirst;
    const ctxColor = barColorClass(ctxPct, th.context);

    const metaParts = [];
    if (showCompacts && ctx && ctx.compactions && ctx.compactions.count > 0) {
      metaParts.push(`<span class="agy-sl-detail">${s.compacts}: ${ctx.compactions.count}</span>`);
    }
    if (showCompactBtn) {
      const compactCls = ctx && ctxPct >= th.context.danger
        ? ' is-danger'
        : (ctx && ctxPct >= th.context.warn ? ' is-warn' : '');
      metaParts.push(
        `<button type="button" class="agy-sl-compact-btn${compactCls}" data-action="compact" title="${escapeHtml(s.compactHintTip)}">/compact</button>`
      );
    }
    if (showCache && ctx && ctx.cacheHit !== null && ctx.cacheHit !== undefined) {
      const cacheCls = cacheColorClass(ctx.cacheHit, th.cache);
      const prefix = metaParts.length > 0 ? '<span class="agy-sl-dot">·</span>' : '';
      metaParts.push(`${prefix}<span class="agy-sl-detail${cacheCls ? ' ' + cacheCls : ''}">${s.cache} ${ctx.cacheHit}%</span>`);
    }
    if (showModelBadge && ctx && ctx.modelShort) {
      metaParts.push(`<span class="agy-sl-badge" title="${escapeHtml(ctx.modelLabel || ctx.model || '')}">${escapeHtml(ctx.modelShort)}</span>`);
    }
    if (showPlanBadge && data.plan && data.plan.short) {
      metaParts.push(`<span class="agy-sl-badge agy-sl-plan-badge" title="${escapeHtml(data.plan.label || data.plan.short)}">${escapeHtml(data.plan.short)}</span>`);
    }
    const activeSubs = data.subagents && data.subagents.activeCount > 0 ? data.subagents.activeCount : 0;
    if (activeSubs > 0) {
      metaParts.push(
        `<span class="agy-sl-badge" title="${escapeHtml(s.subagentsTip(activeSubs))}">+${activeSubs}</span>`
      );
    }

    const hasOfficial5h = !!(oq && oq.fiveHour);
    const hasOfficialWeek = !!(oq && oq.weekly);

    const fivePct = hasOfficial5h ? oq.fiveHour.percent : (localU.fiveHour ? localU.fiveHour.percent : 0);
    const fivePctText = hasOfficial5h ? `${fivePct}%` : `~${fivePct}%`;
    const fiveColor = barColorClass(fivePct, th.fiveHour);
    const fiveReset = hasOfficial5h && oq.fiveHour.resetsAt
      ? `↻ ${fmtUntil(oq.fiveHour.resetsAt, nowMs, s)} (${fmtClock(oq.fiveHour.resetsAt)})`
      : (localU.fiveHour ? `${fmtTokens(localU.fiveHour.effectiveTokens)}` : '');

    const weekPct = hasOfficialWeek ? oq.weekly.percent : (localU.weekly ? localU.weekly.percent : 0);
    const weekPctText = hasOfficialWeek ? `${weekPct}%` : `~${weekPct}%`;
    const weekColor = barColorClass(weekPct, th.weekly);
    const weekReset = hasOfficialWeek && oq.weekly.resetsAt
      ? `↻ ${fmtUntil(oq.weekly.resetsAt, nowMs, s)}`
      : (localU.weekly ? `${fmtTokens(localU.weekly.effectiveTokens)}` : '');

    const syncedAgo = oq && oq.capturedAt ? fmtAgo(oq.capturedAt, nowMs, s) : '';

    const burnRate = localU.fiveHour && localU.fiveHour.burnRate;
    const burnNote = burnRate && burnRate.tokensPerHour > 0
      ? ` · ${s.burnRateTip(fmtTokens(burnRate.tokensPerHour), burnRate.minutesToLimit ? fmtMinutes(burnRate.minutesToLimit, s) : '')}`
      : '';

    const fiveTooltip = (hasOfficial5h
      ? s.official5hTip(syncedAgo)
      : s.local5hTip(fmtTokens(localU.fiveHour?.effectiveTokens || 0), fmtTokens(localU.fiveHour?.totalTokens || 0))) + burnNote;

    const weekTooltip = hasOfficialWeek
      ? s.officialWkTip(syncedAgo)
      : s.localWkTip(fmtTokens(localU.weekly?.effectiveTokens || 0), fmtTokens(localU.weekly?.totalTokens || 0));

    const ctxTooltip = ctx
      ? `${ctx.modelLabel || ctx.model || 'Model'} · ${s.turns}: ${ctx.turns} · ${s.inTok}: ${fmtTokens(ctx.inputTokens)} + ${s.cache}: ${fmtTokens(ctx.cacheReadTokens)} + ${s.outTok}: ${fmtTokens(ctx.outputTokens)}`
      : s.waitingTooltip;

    const setAttrIfChanged = (el, attr, val) => {
      if (el && el.getAttribute(attr) !== val) el.setAttribute(attr, val);
    };
    const setTextIfChanged = (el, val) => {
      if (el && el.textContent !== val) el.textContent = val;
    };

    const lang = getLang(cfg);
    const showSecondRow = showFiveHour || showWeekly || !showFirstRow;
    const layoutKey = `${cfg.collapsed ? 'c' : 'e'}:${showFirstRow ? '1' : '0'}:${showFiveHour ? '1' : '0'}:${showWeekly ? '1' : '0'}:${lang}`;
    const needsRebuild = renderedLayoutKey !== layoutKey || !rowsHost.firstElementChild;

    if (cfg.collapsed) {
      const cParts = [];
      if (showFirstRow) cParts.push(`${escapeHtml(s.context)}: <b>${ctxPct}%</b> (${escapeHtml(ctxDetail)})`);
      if (showFiveHour) cParts.push(`${escapeHtml(s.short5h)}: <b>${fivePctText}</b>`);
      if (showWeekly) cParts.push(`${escapeHtml(s.shortWk)}: <b>${weekPctText}</b>`);
      const collapsedSummary = cParts.length > 0 ? cParts.join(' · ') : escapeHtml(s.settingsTitle);
      if (needsRebuild) {
        rowsHost.innerHTML = `
          <div class="agy-sl-collapsed-row">
            <span data-role="collapsed-summary"></span>
            <div class="agy-sl-actions" style="opacity:0.85">
              <button class="agy-sl-icon-btn" id="agy-sl-expand" title="${escapeHtml(s.expand)}">▲</button>
            </div>
          </div>
        `;
        const expBtn = rowsHost.querySelector('#agy-sl-expand');
        if (expBtn) expBtn.onclick = () => postConfig({ collapsed: false });
        renderedLayoutKey = layoutKey;
        lastMetaHtml = '';
        lastLayoutMetricsKey = '';
      }
      const sumEl = rowsHost.querySelector('[data-role="collapsed-summary"]');
      if (sumEl && sumEl.innerHTML !== collapsedSummary) {
        sumEl.innerHTML = collapsedSummary;
      }
      return;
    }

    if (needsRebuild) {
      const actionsHtml = `
        <div class="agy-sl-actions">
          <button class="agy-sl-icon-btn" id="agy-sl-refresh" title="${escapeHtml(s.refresh)}">↻</button>
          <button class="agy-sl-icon-btn" id="agy-sl-collapse" title="${escapeHtml(s.collapse)}">▾</button>
          <button class="agy-sl-icon-btn" id="agy-sl-settings" title="${escapeHtml(s.settings)}">⚙</button>
        </div>
      `;

      const row1Html = showFirstRow
        ? `
          <div class="agy-sl-row agy-sl-row-context">
            <div class="agy-sl-meter agy-sl-meter-context" data-role="ctx-meter">
              <span class="agy-sl-label">${escapeHtml(s.context)}</span>
              <div class="agy-sl-track">
                <div class="agy-sl-fill" data-role="ctx-fill" style="width:0%"></div>
              </div>
              <span class="agy-sl-pct" data-role="ctx-pct">—</span>
              <span class="agy-sl-detail" data-role="ctx-detail"></span>
            </div>
            <div class="agy-sl-meta" data-role="ctx-meta"></div>
            ${actionsHtml}
          </div>
        `
        : '';

      const fiveMeterHtml = showFiveHour
        ? `
          <div class="agy-sl-meter agy-sl-meter-limit" data-role="five-meter">
            <span class="agy-sl-label">${escapeHtml(s.fiveHours)}</span>
            <div class="agy-sl-track">
              <div class="agy-sl-fill" data-role="five-fill" style="width:0%"></div>
            </div>
            <span class="agy-sl-pct" data-role="five-pct">0%</span>
            <span class="agy-sl-detail" data-role="five-detail" style="display:none"></span>
          </div>
        `
        : '';

      const weekMeterHtml = showWeekly
        ? `
          <div class="agy-sl-meter agy-sl-meter-limit${showFiveHour ? ' agy-sl-meter-limit-right' : ''}" data-role="week-meter">
            <span class="agy-sl-label">${escapeHtml(s.weekly)}</span>
            <div class="agy-sl-track">
              <div class="agy-sl-fill" data-role="week-fill" style="width:0%"></div>
            </div>
            <span class="agy-sl-pct" data-role="week-pct">0%</span>
            <span class="agy-sl-detail" data-role="week-detail" style="display:none"></span>
          </div>
        `
        : '';

      const row2Html = showSecondRow
        ? `
          <div class="agy-sl-row agy-sl-row-limits">
            ${fiveMeterHtml}
            ${weekMeterHtml}
            ${!showFirstRow ? actionsHtml : ''}
          </div>
        `
        : '';

      rowsHost.innerHTML = `<div class="agy-sl-rows">${row1Html}${row2Html}</div>`;
      renderedLayoutKey = layoutKey;
      lastMetaHtml = '';
      lastLayoutMetricsKey = '';

      const ctxMetaHost = rowsHost.querySelector('[data-role="ctx-meta"]');
      if (ctxMetaHost) {
        ctxMetaHost.onclick = (e) => {
          const btn = e.target && e.target.closest && e.target.closest('[data-action="compact"]');
          if (btn) {
            e.stopPropagation();
            triggerCompactInChat(btn);
          }
        };
      }

      const refBtn = rowsHost.querySelector('#agy-sl-refresh');
      if (refBtn) {
        refBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            await fetch(`${API_BASE}/api/quota-refresh`, { method: 'POST' });
          } catch {}
          fetchStatusAndRender();
        };
      }

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
    }

    const metaHtml = metaParts.join('');
    if (showFirstRow) {
      setAttrIfChanged(rowsHost.querySelector('[data-role="ctx-meter"]'), 'title', ctxTooltip);
      const ctxFill = rowsHost.querySelector('[data-role="ctx-fill"]');
      if (ctxFill) {
        const nextCls = `agy-sl-fill ${ctxColor}`;
        if (ctxFill.className !== nextCls) ctxFill.className = nextCls;
        const nextW = `${ctxPct}%`;
        if (ctxFill.style.width !== nextW) ctxFill.style.width = nextW;
      }
      const ctxPctEl = rowsHost.querySelector('[data-role="ctx-pct"]');
      if (ctxPctEl) {
        const nextCls = `agy-sl-pct ${ctxColor}`;
        if (ctxPctEl.className !== nextCls) ctxPctEl.className = nextCls;
        setTextIfChanged(ctxPctEl, ctx ? `${ctxPct}%` : '—');
      }
      setTextIfChanged(rowsHost.querySelector('[data-role="ctx-detail"]'), ctxDetail);
      const ctxMetaEl = rowsHost.querySelector('[data-role="ctx-meta"]');
      if (ctxMetaEl && metaHtml !== lastMetaHtml) {
        ctxMetaEl.innerHTML = metaHtml;
        lastMetaHtml = metaHtml;
      }
    }

    setAttrIfChanged(rowsHost.querySelector('[data-role="five-meter"]'), 'title', fiveTooltip);
    const fiveFill = rowsHost.querySelector('[data-role="five-fill"]');
    if (fiveFill) {
      const nextCls = `agy-sl-fill ${fiveColor}`;
      if (fiveFill.className !== nextCls) fiveFill.className = nextCls;
      const nextW = `${fivePct}%`;
      if (fiveFill.style.width !== nextW) fiveFill.style.width = nextW;
    }
    const fivePctEl = rowsHost.querySelector('[data-role="five-pct"]');
    if (fivePctEl) {
      const nextCls = `agy-sl-pct ${fiveColor}`;
      if (fivePctEl.className !== nextCls) fivePctEl.className = nextCls;
      setTextIfChanged(fivePctEl, fivePctText);
    }
    const fiveDetEl = rowsHost.querySelector('[data-role="five-detail"]');
    if (fiveDetEl) {
      setTextIfChanged(fiveDetEl, fiveReset);
      const nextDisp = fiveReset ? '' : 'none';
      if (fiveDetEl.style.display !== nextDisp) fiveDetEl.style.display = nextDisp;
    }

    setAttrIfChanged(rowsHost.querySelector('[data-role="week-meter"]'), 'title', weekTooltip);
    const weekFill = rowsHost.querySelector('[data-role="week-fill"]');
    if (weekFill) {
      const nextCls = `agy-sl-fill ${weekColor}`;
      if (weekFill.className !== nextCls) weekFill.className = nextCls;
      const nextW = `${weekPct}%`;
      if (weekFill.style.width !== nextW) weekFill.style.width = nextW;
    }
    const weekPctEl = rowsHost.querySelector('[data-role="week-pct"]');
    if (weekPctEl) {
      const nextCls = `agy-sl-pct ${weekColor}`;
      if (weekPctEl.className !== nextCls) weekPctEl.className = nextCls;
      setTextIfChanged(weekPctEl, weekPctText);
    }
    const weekDetEl = rowsHost.querySelector('[data-role="week-detail"]');
    if (weekDetEl) {
      setTextIfChanged(weekDetEl, weekReset);
      const nextDisp = weekReset ? '' : 'none';
      if (weekDetEl.style.display !== nextDisp) weekDetEl.style.display = nextDisp;
    }

    observeCardResize(card);
    const metricsKey = `${layoutKey}|${ctxDetail}|${metaHtml}|${fivePctText}|${fiveReset}|${weekPctText}|${weekReset}`;
    if (needsRebuild || metricsKey !== lastLayoutMetricsKey) {
      lastLayoutMetricsKey = metricsKey;
      updateDynamicBarWidths(card);
    }

    // Only rebuild the popover DOM when explicitly requested (e.g. language/row toggle) or when closed/empty.
    // Never clobber an open popover during background 3s polling!
    if (rebuildPopover || !popoverOpen || !popHost.firstElementChild) {
      renderPopover(card, popHost, data);
    }
  }

  function parseDurationInfo(text) {
    if (!text) return null;
    const dMatch = text.match(/(\d+)\s*(?:d|day|days|д|дн)/i);
    const hMatch = text.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ч|час|г|год)/i);
    const mMatch = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes|м|мин|хв)/i);
    const d = dMatch ? Number(dMatch[1]) : 0;
    const h = hMatch ? Number(hMatch[1]) : 0;
    const m = mMatch ? Number(mMatch[1]) : 0;
    const totalMs = d * 86400_000 + h * 3600_000 + m * 60_000;
    if (totalMs <= 0) return null;
    // Round to nearest minute so repeated scans don't drift by milliseconds
    const roundedMs = Math.round((Date.now() + totalMs) / 60_000) * 60_000;
    return {
      iso: new Date(roundedMs).toISOString(),
      key: `${d}d${h}h${m}m`,
    };
  }

  function findSettingsScanRoots() {
    const roots = [];
    const dialogs = document.querySelectorAll('[role="dialog"], [data-base-ui-portal], [data-floating-ui-portal]');
    for (const d of dialogs) {
      if (d && !d.closest(`#${ROOT_ID}`)) roots.push(d);
    }
    const href = (window.location && window.location.href) || '';
    const isSettingsRoute = /(?:settings|models|account|usage|billing|quota)/i.test(href);
    const hasActiveComposer = !!(cachedComposer && cachedComposer.isConnected);
    if (roots.length === 0 && (isSettingsRoute || !hasActiveComposer)) {
      const main = document.querySelector('main') || document.body;
      if (main) roots.push(main);
    }
    return roots;
  }

  function scanSettingsDomForQuotas() {
    if (disposed || document.hidden) return;
    // Skip DOM scanning when official quotas are freshly synced from the local IDE daemon
    if (lastData && lastData.officialQuotas && lastData.officialQuotas.source === 'ide-daemon' && lastData.officialQuotas.capturedAt) {
      const ageMs = Date.now() - Date.parse(lastData.officialQuotas.capturedAt);
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 5 * 60_000) return;
    }
    try {
      const roots = findSettingsScanRoots();
      if (roots.length === 0) return;

      const quotaRe = /(quota|квот|rate limit|лимит|ліміт|остаток|залишок|refreshes in|resets in|сброс через|обновится через|восстановится через|відновиться через)/i;
      const windowRe = /(weekly|недел|тижн|5[\s-]*(?:hour|час|год|h\b|ч\b|г\b))/i;

      let matchedRoot = null;
      for (const r of roots) {
        // Use textContent (no layout/reflow) for fast pre-check
        const txt = r.textContent || '';
        if (txt.length >= 40 && quotaRe.test(txt) && windowRe.test(txt)) {
          matchedRoot = r;
          break;
        }
      }
      if (!matchedRoot) return;

      const blocks = Array.from(matchedRoot.querySelectorAll('section, article, div')).filter((el) => {
        if (el.closest(`#${ROOT_ID}`)) return false;
        const txt = el.textContent || '';
        return txt.length > 10 && txt.length < 400 && /\d{1,3}%/.test(txt);
      });

      let fiveHour = null;
      let fiveKey = '';
      let weekly = null;
      let weekKey = '';

      for (const el of blocks) {
        const txt = (el.innerText || el.textContent || '').trim();
        const pctMatch = txt.match(/(\d{1,3})\s*%/);
        if (!pctMatch) continue;
        let pct = Math.max(0, Math.min(100, Number(pctMatch[1])));
        const isRemaining = /(remaining|left|остаток|остал|залиш|восстановится|відновиться|refreshes)/i.test(txt);
        const isExplicitUsedHeader = /^(?:used|использовано|використано)\b/i.test(txt);
        if (isRemaining && !isExplicitUsedHeader) {
          pct = 100 - pct;
        }
        const dur = parseDurationInfo(txt);
        const resetsAt = dur ? dur.iso : null;

        if (!fiveHour && /(5[\s-]*(?:hour|hr|час|год)|5h\b|5ч\b|5г\b)/i.test(txt) && !/(weekly|недел|тиж)/i.test(txt)) {
          fiveHour = { percent: pct, resetsAt };
          fiveKey = `${pct}:${dur ? dur.key : ''}`;
        } else if (!weekly && /(weekly|7[\s-]*day|недел|тиж)/i.test(txt) && !/(5[\s-]*(?:hour|hr|час|год))/i.test(txt)) {
          weekly = { percent: pct, resetsAt };
          weekKey = `${pct}:${dur ? dur.key : ''}`;
        }
      }

      if (!fiveHour && !weekly) return;
      const fp = `${fiveKey}|${weekKey}`;
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

  function disconnectEventStream() {
    sseConnected = false;
    sseConvId = '';
    if (eventSource) {
      try { eventSource.close(); } catch {}
      eventSource = null;
    }
  }

  function connectEventStream() {
    if (disposed || document.hidden || typeof EventSource === 'undefined') return;
    const convId = detectConversationId();
    if (eventSource && sseConvId === convId && eventSource.readyState !== 2) return;
    disconnectEventStream();
    sseConvId = convId;
    const qs = convId ? `?conversationId=${encodeURIComponent(convId)}` : '';
    try {
      const es = new EventSource(`${API_BASE}/api/events${qs}`);
      eventSource = es;
      es.addEventListener('open', () => {
        if (eventSource === es) sseConnected = true;
      });
      es.addEventListener('status', (ev) => {
        if (disposed || eventSource !== es) return;
        sseConnected = true;
        try {
          const data = JSON.parse(ev.data);
          lastData = data;
          render(data, false);
        } catch {}
      });
      es.onerror = () => {
        if (eventSource === es) sseConnected = false;
      };
    } catch {
      sseConnected = false;
    }
  }

  function scheduleRemount() {
    if (remountTimer || disposed || !lastData) return;
    remountTimer = setTimeout(() => {
      remountTimer = null;
      if (disposed || !lastData || document.hidden) return;
      const existing = document.getElementById(ROOT_ID);
      if (!existing || !existing.isConnected) {
        render(lastData);
      }
    }, 150);
  }

  function onVisibilityChange() {
    if (disposed) return;
    if (document.hidden) {
      disconnectEventStream();
    } else {
      connectEventStream();
      fetchStatusAndRender();
    }
  }

  injectHostStyle();
  fetchStatusAndRender();
  connectEventStream();

  pollTimer = setInterval(() => {
    if (document.hidden) return;
    const curConvId = detectConversationId();
    if (sseConnected) {
      if (curConvId !== sseConvId) {
        connectEventStream();
      }
      return;
    }
    fetchStatusAndRender();
    connectEventStream();
  }, 3000);
  mountTimer = setInterval(() => {
    if (document.hidden || !lastData) return;
    const existing = document.getElementById(ROOT_ID);
    if (!existing || !existing.isConnected) {
      render(lastData);
      return;
    }
    if (!cachedComposer || !cachedComposer.isConnected || existing.nextElementSibling !== cachedComposer) {
      cachedComposer = null;
      render(lastData);
    }
  }, 2000);
  settingsScanTimer = setInterval(scanSettingsDomForQuotas, 2500);

  document.addEventListener('click', onDocClick);
  document.addEventListener('visibilitychange', onVisibilityChange);

  try {
    domObserver = new MutationObserver(() => {
      if (!lastData || disposed || document.hidden) return;
      const existing = document.getElementById(ROOT_ID);
      if (!existing || !existing.isConnected) {
        scheduleRemount();
      }
    });
    if (document.body) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
  } catch {}

  window.__ag_statusline_dispose = () => {
    disposed = true;
    window.__ag_statusline_popover_open = false;
    disconnectEventStream();
    if (pollTimer) clearInterval(pollTimer);
    if (mountTimer) clearInterval(mountTimer);
    if (settingsScanTimer) clearInterval(settingsScanTimer);
    if (remountTimer) clearTimeout(remountTimer);
    if (domObserver) {
      try { domObserver.disconnect(); } catch {}
    }
    if (cardResizeObserver) {
      try { cardResizeObserver.disconnect(); } catch {}
    }
    if (composerResizeObserver) {
      try { composerResizeObserver.disconnect(); } catch {}
    }
    observedCard = null;
    observedComposer = null;
    cachedComposer = null;
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };
})();
