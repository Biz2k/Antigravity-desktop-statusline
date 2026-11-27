# Antigravity Desktop Statusline

🌐 [🇬🇧 English](README.md) | [🇷🇺 Русский](README.ru.md) | **🇺🇦 Українська**

[![Version](https://img.shields.io/badge/version-v1.5.0-2f7de1.svg)](https://github.com/Biz2k/Antigravity-desktop-statusline/releases/tag/v1.5.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6.svg)](https://github.com/Biz2k/Antigravity-desktop-statusline)
[![Target](https://img.shields.io/badge/Google%20AntiGravity-2.0%2B-orange.svg)](https://antigravity.google)
[![Zero Dependencies](https://img.shields.io/badge/npm%20dependencies-0-10b981.svg)](package.json)

**Компактна панель статусу безпосередньо над полем введення чату в Google AntiGravity 2.0 Desktop** — натхненна плагіном `desktop-statusline` для Claude Code, без жодної зовнішньої npm-залежності.

![Прев'ю Antigravity Desktop Statusline — Український інтерфейс](assets/preview-ua.png)

---

## ✨ Основні можливості

1. **Індикатор контекстного вікна в реальному часі (`Контекст`)**
   - Читає локальний транскрипт активного діалогу (`~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`) із кешуванням за `mtime` + `size`.
   - Показує точну кількість використаних токенів і розмір вікна активної моделі (`512k` для Gemini 4 Neon, `1M` для Gemini 4 Carbon / Argon / Hydrogen / Gemini 3.x / Claude 5.5, `200k` для Claude 4.6, `128k` для GPT-OSS).
   - Відображає лічильник **стиснень контексту** (з миттєвим скиданням смужки за подією `CHECKPOINT`), клікабельну кнопку **`/compact`** (одразу запускає команду `/compact` у чаті або безпечно копіює її, якщо в полі є чернетка), **відсоток влучань у кеш** (`кеш 99%`), опціональний **бейдж моделі** (прихований за замовчуванням), **бейдж підписки** (`Pro` / `Ultra` / `Free`, без читання і збереження email) та індикатор активних **субагентів** (`+N`).
   - Будь-який елемент в обох рядках можна індивідуально показати або приховати в налаштуваннях.

2. **Індикатори 5-годинного та тижневого лімітів (`5 годин` / `Тиждень`)**
   - Автоматично синхронізує квоти плану (`5 годин` і `Тиждень`) напряму з локального демона AntiGravity (`~/.gemini/antigravity/daemon/hub_*.json`) кожні 90 с та за кнопкою `↻` — **без потреби відкривати «Налаштування → Моделі»** — веде живий зворотний відлік до скидання (`↻ 3г 42хв (04:08)`, `↻ 6д 22г`) і показує **темп витрат (burn rate) та прогноз** у підказці 5-годинного ліміту.
   - **Динамічні смужки однакової ширини**: верстка на `ResizeObserver` тримає смужки `5 годин` і `Тиждень` строго однакової довжини та плавно масштабує їх разом із шириною вікна (перенесення на 2 рядки відбувається лише на дуже вузьких вікнах).
   - Індивідуальні **пороги зміни кольору (Жовтий / Червоний)** для кожного показника (**Контекст**, **Кеш (`<`)**, **5 годин**, **Тиждень**).

3. **Нуль залежностей, автономна ін'єкція, SSE і Shadow DOM**
   - Чистий Node.js (`>= 18`) — **не потребує `npm install` і сторонніх модів** (вбудований zero-dependency патчер `app.asar` із резервною копією та перерахунком SHA-256 `integrity`; за наявності `antigravity-features-v2` працює через нього без конфліктів).
   - Працює як легкий фоновий MCP-сервер (`antigravity-statusline` з інструментами `get_statusline_metrics` і `get_usage_summary`) + локальний HTTP/SSE-сервер на `127.0.0.1:39229` із миттєвим пушем через `fs.watch`.
   - Ізольований всередині **Shadow DOM** — сторонні перекладачі (наприклад, `antigravity-features-v2`) не підміняють підписи всередині статус-бару, водночас усі змінні темної/світлої теми AntiGravity успадковуються автоматично.
   - Вбудований перемикач мов **`EN | DE | FR | ZH | RU | UA`** (за замовчуванням — **англійська**) та миттєве застосування налаштувань.
   - При наведенні праворуч з'являються міні-кнопки: **Оновити (`↻`)**, **Згорнути (`▾`)** та **Налаштування (`⚙`)**.

---

## ⚙️ Вікно налаштувань (`⚙`)

Натисніть іконку **`⚙`** при наведенні на правий край панелі, щоб перемкнути мову (`EN | DE | FR | ZH | RU | UA`), увімкнути/приховати будь-який елемент у розділі **«Показати / приховати»** (`Контекст`, `Стиснення`, `/compact`, `Кеш`, `Модель`, `Підписка`, `5 годин`, `Тиждень`), задати індивідуальні пороги кольору (**Жовтий / Червоний** — застосовуються одразу під час редагування), скинути пороги до стандартних та переглянути статус синхронізації квот:

![Вікно налаштувань Antigravity Desktop Statusline (UA)](assets/settings-ua.png)

Усі параметри автоматично зберігаються у `~/.antigravity-statusline/config.json`:

| Параметр | За замовчуванням | Опис |
| :--- | :--- | :--- |
| `enabled` | `true` | Увімкнути / приховати панель статусу |
| `lang` | `"en"` | Мова інтерфейсу: `"en"`, `"de"`, `"fr"`, `"zh"`, `"ru"` або `"uk"` (`EN \| DE \| FR \| ZH \| RU \| UA`) |
| `collapsed` | `false` | Компактний однорядковий режим |
| `showFirstRow` | `true` | Показувати або приховувати 1-й рядок (`Контекст`) |
| `showCompacts` | `true` | Показувати або приховувати лічильник стиснень |
| `showCompactBtn` | `true` | Показувати або приховувати клікабельну кнопку `/compact` |
| `showCache` | `true` | Показувати відсоток влучань у кеш (`кеш XX%`) |
| `showModelBadge` | `false` | Показувати або приховувати компактний бейдж моделі (`Neon`, `Opus 4.6` тощо) |
| `showPlanBadge` | `true` | Показувати або приховувати бейдж підписки (`Pro`, `Ultra`, `Free`) |
| `showFiveHour` | `true` | Показувати або приховувати індикатор `5 годин` |
| `showWeekly` | `true` | Показувати або приховувати індикатор `Тиждень` |
| `autoUpdate` | `true` | Автоматично перевіряти та встановлювати нові релізи з GitHub |
| `thresholds` | `80/95`, кеш `50/20` | Пороги зміни кольору (жовтий / червоний, %) для `context`, `cache` (`<`), `fiveHour` і `weekly` |

---

## ⚡ Швидке встановлення

### Вимоги
- **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- **Google AntiGravity 2.0 Desktop**
- **Сторонні моди не потрібні:** `install.cjs` сам патчить `app.asar` AntiGravity напряму (з резервною копією `app.asar.bak` і перерахунком SHA-256 `integrity`). Якщо [`antigravity-features-v2`](https://github.com/WiseYaroslav28/antigravity-features-v2) вже встановлено, завантажувач підключається через `localization_injected.js` без конфліктів (прапорець `--standalone` примусово вмикає прямий патч `app.asar`).

### Windows (PowerShell — одним рядком)
```powershell
irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.ps1 | iex
```

### macOS / Linux (Bash — одним рядком)
```bash
curl -fsSL https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.sh | bash
```

### Ручне встановлення (`git clone`)
```bash
git clone https://github.com/Biz2k/Antigravity-desktop-statusline.git ~/.antigravity-statusline
node ~/.antigravity-statusline/install.cjs
```

Після встановлення **повністю перезапустіть AntiGravity** (включно з виходом із системного трею).

---

## 🗂️ Архітектура проєкту

| Файл | Призначення |
| :--- | :--- |
| [`server.mjs`](server.mjs) | MCP-сервер (`get_statusline_metrics`, `get_usage_summary`) + локальний HTTP/SSE API (`http://127.0.0.1:39229`) + інкрементальний парсер транскриптів |
| [`widget.js`](widget.js) | Shadow DOM віджет із hot-reload над полем введення чату + SSE-оновлення + адаптивні смужки `ResizeObserver` + вікно налаштувань |
| [`loader.js`](loader.js) | Легкий завантажувач для оболонки AntiGravity з перевіркою `widgetHash` через `/health` (не перезавантажується, поки відкриті налаштування) |
| [`asar-patcher.cjs`](asar-patcher.cjs) | Автономний zero-dependency патчер `app.asar` (SHA-256 `integrity` + бэкап + чистий відкат + macOS codesign) |
| [`install.cjs`](install.cjs) | Кросплатформений інсталятор (MCP + автономний патч `app.asar` або підключення до `antigravity-features-v2`) |
| [`install.ps1`](install.ps1) / [`install.sh`](install.sh) | Однорядкові інсталятори для Windows і macOS/Linux |
| [`uninstall.cjs`](uninstall.cjs) / [`uninstall.ps1`](uninstall.ps1) / [`uninstall.sh`](uninstall.sh) | Чисте видалення (прибирає MCP-запис, завантажувач і теку проєкту) |

---

## 🔒 Приватність і локальна робота

- **Жодних зовнішніх мережевих запитів** — усе працює локально на `127.0.0.1:39229` і читає лише ваші локальні транскрипти (`~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl`).
- **Не читає паролі, ключі чи токени авторизації** — квоти зчитуються пасивно з інтерфейсу AntiGravity.
- **Ізольований від сторонніх вкладок** — ніколи не втручається у веб-вкладки вбудованого браузера.

---

## 🗑️ Видалення

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/uninstall.ps1 | iex
```

**macOS / Linux (Bash):**
```bash
curl -fsSL https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/uninstall.sh | bash
```

**Будь-яка ОС (Node.js):**
```bash
node ~/.antigravity-statusline/uninstall.cjs
```

---

## 📜 Ліцензія

Ліцензія MIT — деталі у файлі [`LICENSE`](LICENSE).
