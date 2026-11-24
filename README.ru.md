# Antigravity Desktop Statusline

🌐 [🇬🇧 English](README.md) | **🇷🇺 Русский** | [🇺🇦 Українська](README.uk.md)

[![Version](https://img.shields.io/badge/version-v1.1.0-2f7de1.svg)](https://github.com/Biz2k/Antigravity-desktop-statusline/releases/tag/v1.1.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6.svg)](https://github.com/Biz2k/Antigravity-desktop-statusline)
[![Target](https://img.shields.io/badge/Google%20AntiGravity-2.0%2B-orange.svg)](https://antigravity.google)
[![Zero Dependencies](https://img.shields.io/badge/npm%20dependencies-0-10b981.svg)](package.json)

**Компактная панель статуса прямо над полем ввода чата в Google AntiGravity 2.0 Desktop** — вдохновлённая плагином `desktop-statusline` для Claude Code, без единой внешней npm-зависимости.

![Превью Antigravity Desktop Statusline — Русский интерфейс](assets/preview-ru.png)

---

## ✨ Возможности

1. **Индикатор контекстного окна в реальном времени (`Контекст`)**
   - Читает локальный транскрипт активного диалога (`~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`) с кешированием по `mtime` + `size`.
   - Показывает точное количество использованных токенов и размер окна активной модели (`512k` для Gemini 4 Neon, `1M` для Gemini 4 Carbon / Argon / Hydrogen / Gemini 3.x / Claude 5.5, `200k` для Claude 4.6, `128k` для GPT-OSS).
   - Отображает **процент попадания в кеш промпта** (`кеш 99%`) и счётчик **сжатий контекста**.
   - Можно **скрыть 1-ю строку (`Контекст`)**, оставив только строку лимитов `5 часов` и `Неделя`.

2. **Индикаторы 5-часового и недельного лимитов (`5 часов` / `Неделя`)**
   - Автоматически синхронизирует квоты плана (`5 часов` и `Неделя`), переводит остаток `%` в расход `%` и ведёт живой обратный отсчёт до сброса (`↻ 3ч 42м (04:08)`, `↻ 6д 22ч`).
   - **Динамические полоски одинаковой ширины**: раскладка на `ResizeObserver` держит полоски `5 часов` и `Неделя` строго одинаковой длины, плавно подстраивая их под ширину окна (перенос на 2 строки происходит только на очень узких окнах).
   - Индивидуальные **пороги смены цвета (Жёлтый / Красный)** для каждого показателя (**Контекст**, **Кеш (`<`)**, **5 часов**, **Неделя**).

3. **Ноль зависимостей, Shadow DOM и Hot-Reload**
   - Чистый Node.js ESM (`>= 18`) — **не требует `npm install`**.
   - Работает как лёгкий фоновый MCP-сервер (`antigravity-statusline` с инструментом `get_statusline_metrics`) + локальный HTTP-сервер на `127.0.0.1:39229`.
   - Изолирован внутри **Shadow DOM** — внешние переводчики (например, `antigravity-features-v2`) не подменяют подписи внутри статус-бара, при этом все переменные тёмной/светлой темы AntiGravity наследуются автоматически.
   - Встроенный переключатель языков **`EN | RU | UA`** (по умолчанию — **английский**) и мгновенное применение настроек.
   - При наведении справа появляются мини-кнопки: **Обновить (`↻`)**, **Свернуть (`▾`)** и **Настройки (`⚙`)**.

---

## ⚙️ Окно настроек (`⚙`)

Нажмите иконку **`⚙`** при наведении на правый край плашки, чтобы переключить язык (`EN | RU | UA`), задать индивидуальные пороги цвета (**Жёлтый / Красный** — применяются сразу при редактировании) или скрыть/показать 1-ю строку (`Контекст`):

![Окно настроек Antigravity Desktop Statusline (RU)](assets/settings-ru.png)

Все параметры автоматически сохраняются в `~/.antigravity-statusline/config.json`:

| Параметр | По умолчанию | Описание |
| :--- | :--- | :--- |
| `enabled` | `true` | Включить / скрыть панель статуса |
| `lang` | `"en"` | Язык интерфейса: `"en"` (по умолчанию), `"ru"` или `"uk"` (`EN \| RU \| UA`) |
| `collapsed` | `false` | Компактный однострочный режим |
| `showCache` | `true` | Показывать процент попадания в кеш (`кеш XX%`) |
| `showFirstRow` | `true` | Показывать или скрывать 1-ю строку (`Контекст`) |
| `thresholds` | `80/95`, кеш `50/20` | Пороги смены цвета (жёлтый / красный, %) для `context`, `cache` (`<`), `fiveHour` и `weekly` |

---

## ⚡ Быстрая установка

### Требования
- **Node.js 18+** ([nodejs.org](https://nodejs.org/))
- **Google AntiGravity 2.0 Desktop**
- Рекомендуется установленный [`antigravity-features-v2`](https://github.com/WiseYaroslav28/antigravity-features-v2) (обеспечивает инъекцию в Electron DOM и hot-reload; загрузчик статус-бара автоматически восстанавливается после обновлений `antigravity-features-v2`).

### Windows (PowerShell — в одну строку)
```powershell
irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.ps1 | iex
```

### macOS / Linux (Bash — в одну строку)
```bash
curl -fsSL https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/install.sh | bash
```

### Ручная установка (`git clone`)
```bash
git clone https://github.com/Biz2k/Antigravity-desktop-statusline.git ~/.antigravity-statusline
node ~/.antigravity-statusline/install.cjs
```

После установки **полностью перезапустите AntiGravity** (включая выход из системного трея).

---

## 🗂️ Архитектура проекта

| Файл | Назначение |
| :--- | :--- |
| [`server.mjs`](server.mjs) | MCP-сервер (`get_statusline_metrics`) + локальный HTTP API (`http://127.0.0.1:39229`) + парсер транскриптов + автовосстановление загрузчика |
| [`widget.js`](widget.js) | Shadow DOM виджет с hot-reload над полем ввода чата + адаптивные полоски `ResizeObserver` + поповер настроек с мгновенным применением |
| [`loader.js`](loader.js) | Лёгкий загрузчик для оболочки AntiGravity с проверкой `widgetHash` через `/health` (не перезагружается, пока открыты настройки) |
| [`install.cjs`](install.cjs) | Кроссплатформенный установщик (MCP + подключение загрузчика) |
| [`install.ps1`](install.ps1) / [`install.sh`](install.sh) | Однострочные установщики для Windows и macOS/Linux |
| [`uninstall.cjs`](uninstall.cjs) / [`uninstall.ps1`](uninstall.ps1) | Чистое удаление (убирает MCP-запись, загрузчик и папку проекта) |

---

## 🔒 Приватность и локальная работа

- **Никаких внешних сетевых запросов** — всё работает локально на `127.0.0.1:39229` и читает только ваши локальные транскрипты (`~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl`).
- **Не читает пароли, ключи и токены авторизации** — квоты считываются пассивно из интерфейса AntiGravity.
- **Изолирован от сторонних вкладок** — никогда не внедряется в веб-вкладки встроенного браузера.

---

## 🗑️ Удаление

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Biz2k/Antigravity-desktop-statusline/main/uninstall.ps1 | iex
```

**Любая ОС (Node.js):**
```bash
node ~/.antigravity-statusline/uninstall.cjs
```

---

## 📜 Лицензия

Лицензия MIT — подробнее в файле [`LICENSE`](LICENSE).
