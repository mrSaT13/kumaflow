# KumaFlow v1.5.0

**Современный музыкальный плеер для Navidrome/Subsonic с ML-рекомендациями, Vibe Similarity и улучшенным UI**

[![Release](https://img.shields.io/github/v/release/mrSaT13/kumaflow)](https://github.com/mrSaT13/kumaflow/releases/latest)
[![License](https://img.shields.io/github/license/mrSaT13/kumaflow)](LICENSE.txt)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://github.com/mrSaT13/kumaflow/releases)

---

## 📖 О проекте

**KumaFlow** — это форк [Aonsoku](https://github.com/victoralvesf/aonsoku) v0.13 с расширенными ML-рекомендациями, системой Vibe Similarity и полностью кастомизированным интерфейсом.

Приложение предоставляет продвинутые функции для меломанов: умные плейлисты, рекомендации на основе предпочтений, аудиоанализ треков и гибкую настройку внешнего вида.

---

## ✨ Ключевые возможности

### 🤖 ML Рекомендации
- **Обучение на лайках** — система анализирует ваши предпочтения и предлагает похожие треки
- **Vibe Similarity** — поиск треков по аудио-признакам (энергия, танцевальность, настроение)
- **Smart Auto-DJ 2.0** — умное продление плейлиста с учётом контекста
- **Оркестратор плейлистов** — сортировка треков для плавных переходов по энергии и BPM

### 🎨 Интерфейс и кастомизация
- **50+ тем оформления** — тёмные, светлые, цветные темы
- **Кастомизация прогресс-бара** — тип, цвет, форма, размер

### 🌐 Интеграции
- **Navidrome/Subsonic** — полная поддержка API
- **Audiobookshelf** — интеграция с аудиокнигами
- **Last.fm** — скробблинг, топ-чарты, рекомендации
- **Fanart.tv** — логотипы и баннеры артистов
- **Wikipedia** — биографии исполнителей
- **Discogs** — обложки артистов
- **Discord RPC** — отображение текущего трека в статусе

### 🎵 Музыкальные функции
- **Vibe Similarity** — аудиоанализ треков (BPM, энергия, танцевальность, валентность)
- **Harmonic Mixing** — плавные переходы между треками по музыкальному ключу
- **Energy Wave** — создание волны энергии в плейлисте
- **Activity Mix** — 10 миксов для активностей (спорт, работа, отдых)
- **Mood Mix** — 9 миксов по настроению
- **Time of Day Mix** — миксы по времени суток
- **Artist Subscriptions** — подписка на артистов и уведомления о новинках
- **Ban-лист артистов** — блокировка неугодных исполнителей
- **Геймифицированный холодный старт** — быстрая настройка предпочтений

### 📊 Аналитика
- **ML Stats** — статистика по обучению модели
- **Оркестратор Stats** — анализ плейлистов
- **Vibe Analysis** — аудиоанализ каждого трека
- **Listening History** — история прослушиваний

---

## 🚀 Установка

### Windows
1. Скачайте `.exe` установщик из [релизов](https://github.com/mrSaT13/kumaflow/releases/latest)
2. Запустите установщик
3. При первом запуске введите данные вашего Navidrome/Subsonic сервера

### macOS
1. Скачайте `.dmg` образ
2. Перетащите приложение в папку Applications
3. Запустите и настройте подключение к серверу

### Linux
1. Скачайте `.AppImage` или `.deb` пакет
2. Установите: `sudo dpkg -i kumaflow_1.5.0_amd64.deb` (для Debian/Ubuntu)
3. Или запустите AppImage: `chmod +x kumaflow_1.5.0_amd64.AppImage && ./kumaflow_1.5.0_amd64.AppImage`

### Docker
```bash
docker-compose up -d
```

---

## 🔧 Настройка

### Подключение к серверу

При первом запуске вам потребуется:
1. **URL сервера** — например, `http://192.168.1.1:4533`
2. **Имя пользователя** — ваш логин от Navidrome/Subsonic
3. **Пароль** — ваш пароль

### Типы аутентификации
- **Token-based** (рекомендуется) — MD5(пароль + соль)
- **Password-based** — HEX-кодированный пароль

---

## 📚 Руководство пользователя

### Smart Auto-DJ 2.0

**Smart Auto-DJ** — это умная система продления плейлиста, которая:

1. **Анализирует последние 5 треков** — определяет текущий вайб
2. **Запрашивает кандидатов у ML** — 20-30 треков на основе предпочтений
3. **Фильтрует по вайбу** — выбирает похожие по аудио-признакам
4. **Оркестрирует плейлист** — сортирует для плавных переходов
5. **Учитывает время суток** — утренняя/дневная/вечерняя музыка
6. **Блокирует артистов** — исключает неугодных исполнителей

#### Использование
1. Откройте любой плейлист
2. Включите **Auto-DJ** в настройках плеера
3. Когда плейлист закончится, он автоматически продлится

#### Оркестратор

**Оркестратор** сортирует треки для создания плавных переходов:

- **Energy sorting** — от энергичных к спокойным и наоборот
- **BPM matching** — треки с похожим темпом идут рядом
- **Harmonic mixing** — совместимые музыкальные ключи
- **Mood grouping** — группировка по настроению

#### Ban-лист артистов

**Заблокированные артисты** никогда не появятся в плейлистах:

1. Откройте настройки → ML → Ban-лист
2. Добавьте артиста в чёрный список
3. Система исключит все треки этого исполнителя

> ⚠️ **Важно:** Оркестратор и Auto-DJ автоматически фильтруют треки заблокированных артистов!

---

## 🛠️ Разработка

### Требования
- Node.js 18+
- pnpm 8+
- Electron 40+

### Установка зависимостей
```bash
pnpm install
```

### Запуск в режиме разработки
```bash
pnpm dev
```

### Сборка
```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### Тестирование
```bash
pnpm test
pnpm cy:open
```

### Линтинг
```bash
pnpm lint
pnpm lint:fix
```

---

## 📦 Технологии

- **Frontend:** React 18, TypeScript, Vite
- **UI:** Radix UI, Tailwind CSS, Recharts
- **State Management:** Zustand
- **Audio:** Web Audio API, AudioMotion Analyzer
- **ML:** Custom ML algorithms (Vibe Similarity, Wave Analysis)
- **Backend:** Electron, Node.js
- **API:** Navidrome/Subsonic REST API

---

## 📝 Changelog

### v1.5.0 (Март 2026)
- ✅ Исправлена фильтрация banned artists в Оркестраторе и Smart Auto-DJ
- ✅ Обновлена версия приложения
- ✅ Улучшена документация

### v1.4.0
- ✅ Smart Auto-DJ 2.0 с Оркестратором
- ✅ Vibe Similarity анализ треков
- ✅ Harmonic mixing
- ✅ Energy wave плейлисты

### v1.3.0
- ✅ 50+ тем оформления
- ✅ Кастомизация прогресс-бара
- ✅ Интеграция с Wikipedia

[Полный changelog](CHANGES.md)

---

## 🤝 Вклад в проект

Приветствуются issue и pull requests!

### Как помочь:
1. Fork проекта
2. Создайте ветку (`git checkout -b feature/AmazingFeature`)
3. Commit изменений (`git commit -m 'Add AmazingFeature'`)
4. Push в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

---

## 📄 Лицензия

Распространяется под лицензией [Apache-2.0](LICENSE.txt).

---

## 🙏 Благодарности

- [Aonsoku](https://github.com/victoralvesf/aonsoku) — оригинальный проект
- [Navidrome](https://www.navidrome.org/) — прекрасный музыкальный сервер
- [Subsonic](http://www.subsonic.org/) — API стандарт
- [Fanart.tv](https://fanart.tv/) — арт для артистов

---

## 📞 Контакты

- **GitHub:** [@mrSaT13](https://github.com/mrSaT13)
- **Issues:** [GitHub Issues](https://github.com/mrSaT13/kumaflow/issues)

---

## 📊 Статистика

![GitHub stars](https://img.shields.io/github/stars/mrSaT13/kumaflow?style=social)
![GitHub forks](https://img.shields.io/github/forks/mrSaT13/kumaflow?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/mrSaT13/kumaflow?style=social)

---

**KumaFlow** — ваш музыкальный поток с интеллектом 🎵
