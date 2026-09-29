<p align="center">
  <img width="160" height="160" alt="KumaFlow" src="https://github.com/user-attachments/assets/c926b19d-e610-435b-84f0-90973c206c19" />
</p>

<h1 align="center">KumaFlow</h1>

<p align="center">
  <strong>Умный музыкальный плеер для Navidrome / Subsonic</strong><br>
  ML-рекомендации · Vibe Similarity · сервер KumaFlow Brain · аудиокниги
</p>

<p align="center">
  <a href="https://github.com/mrSaT13/kumaflow/releases/latest"><img src="https://img.shields.io/github/v/release/mrSaT13/kumaflow" alt="Release"></a>
  <a href="LICENSE.txt"><img src="https://img.shields.io/github/license/mrSaT13/kumaflow" alt="License"></a>
  <a href="https://github.com/mrSaT13/kumaflow/releases"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform"></a>
  <a href="https://github.com/mrSaT13/kumaflow/releases"><img src="https://img.shields.io/github/downloads/mrSaT13/kumaflow/total" alt="Downloads"></a>
</p>

---

## О проекте

KumaFlow — глубоко переработанный форк [Aonsoku](https://github.com/victoralvesf/aonsoku):
собственный рекомендательный движок, уникальная система **Vibe Similarity**,
сервер **KumaFlow Brain** для синхронизации между устройствами
и полноценная поддержка **Audiobookshelf**.

> Не просто плеер, а музыкальный компаньон, который понимает ваш вкус.

---

## Скриншоты

| Моя волна | Жанры |
|---|---|
| <img width="600" alt="Моя волна" src="https://github.com/user-attachments/assets/f5c81f88-0743-4782-a82d-72b4963221f3" /> | <img width="600" alt="Жанры" src="https://github.com/user-attachments/assets/31d0b4e9-799c-4e4c-a1d5-43de9242391b" /> |

| Секции | Книги | ML-статистика |
|---|---|---|
| <img width="400" alt="Секции" src="https://github.com/user-attachments/assets/3420b70c-f677-4acf-808a-2f548e42b1c2" /> | <img width="400" alt="Книги" src="https://github.com/user-attachments/assets/6ec31055-a52c-4f69-98b1-527a4aa61d68" /> | <img width="400" alt="ML-статистика" src="https://github.com/user-attachments/assets/e89b83e6-90ac-4d43-9347-a62b1c90ea41" /> |

---

## Возможности

### Рекомендации и воспроизведение
| | |
|---|---|
| ML-рекомендации | Обучаются на лайках, скипах и истории |
| Vibe Similarity | Подбор по BPM, энергии, танцевальности, валентности |
| Smart Auto-DJ 2.0 | Контекст, оркестратор плавных переходов, ban-лист |
| Оркестратор | Energy-сортировка, BPM-мэтчинг, гармонический миксинг |
| KumaFlow Brain 🆕 | Серверная волна, радио, синхронизация (см. ниже) |
| Ban-лист | Полное исключение артистов отовсюду |
| Подписки на артистов | Релизы, уведомления |

### Библиотека и миксы
| | |
|---|---|
| Жанровые карточки | 16 топ-жанров, радио жанра в клик |
| Настраиваемые секции | Порядок перетаскиванием |
| Activity / Mood / Time Mix | Готовые подборки под занятие, настроение, время суток |
| История и аналитика | Топы, активность, точность рекомендаций, Vibe-анализ трека |

<details>
<summary>Состав миксов</summary>

**Activity (10):** Running, Cycling, Workout, Yoga, Work, Study, Party, Driving, Morning, Night.
**Mood (9):** Happy, Sad, Calm, Energetic, Melancholic, Excited, Relaxed, Passionate, Inspired.
**Time of Day:** утро / день / вечер / ночь — автоматически.
</details>

### Оформление
| | |
|---|---|
| Тема по умолчанию | **Default Dark** из коробки (+ светлая пара) |
| 50+ тем | Dark, light, цветные, сезонные |
| Прогресс-бар | Тип, цвет, форма, анимация |
| Адаптивность | 4K, Ultrawide 21:9, ноутбуки |

### Интеграции
Last.fm (скробблинг, чарты) · Fanart.tv · Wikipedia · Apple Music / Discogs · Discord RPC · Горячие клавиши (глобальные, медиа, кастомные)

### Аудиокниги (Audiobookshelf)
Библиотека с прогрессом · главы в плейлисте · продолжение с последней главы ·
автосохранение прогресса · книги исключены из музыкальных рекомендаций.

---

## 🆕 KumaFlow Brain — сервер и синхронизация (1.6.6)

- **Волна с контекстом** — настроение, занятие, язык, шаффл и loop уходят в мозг при каждой добивке
- **Негативы до выдачи** — дизлайки, баны и недавно игранное учитывает сервер
- **Радио с мозга** — по треку и артисту, капсула «Волна по X» на главной
- **Продолжить с телефона** — живая очередь и позиция между устройствами
- **Настроения из библиотеки** — в окне волны, у каждого свой цвет; «Почему этот трек» в тултипе
- **Языковой фильтр** — русское / иностранное / без слов
- **Автосинк вкусов** — фоном каждые 30 минут; честная проверка токена

Подключение: **Настройки → Brain** → URL + Bearer-токен → «Проверить».
Порядок обновления: сначала backend, затем плеер.

---

## Установка

### Windows
Скачайте `KumaFlow Setup 1.6.6.exe` из [релизов](https://github.com/mrSaT13/kumaflow/releases/latest)
и запустите. Автообновление — через `latest.yml` того же релиза.

### macOS
Скачайте `.dmg`, перетащите в Applications.

### Linux
```bash
# Debian/Ubuntu
sudo dpkg -i kumaflow_1.6.6_amd64.deb

# AppImage
chmod +x kumaflow_1.6.6_amd64.AppImage
./kumaflow_1.6.6_amd64.AppImage
```

---

## Быстрый старт

1. **Сервер:** URL + логин + пароль Navidrome/Subsonic.
2. **ML:** Настройки → ML → включите рекомендации, лайкните несколько треков.
3. **Волна:** главная → «Моя волна», настройте пилюли под себя.
4. **Мозг (опционально):** поднимите backend, подключите в Настройки → Brain.

---

## Разработка

Требования: Node.js 22, pnpm 9+, Electron 40.

```bash
git clone https://github.com/mrSaT13/kumaflow.git
cd kumaflow
pnpm install
pnpm run electron:dev     # запуск
pnpm run build:win        # сборка Windows (x64 + arm64)
```

---

## Вклад

Приветствуются issue и pull requests: fork → ветка → commit → push → PR.

---

## Лицензия

Apache-2.0 — см. [LICENSE.txt](LICENSE.txt).

## Благодарности

[Aonsoku](https://github.com/victoralvesf/aonsoku) · [Navidrome](https://www.navidrome.org/) ·
[Subsonic](http://www.subsonic.org/) · [Audiobookshelf](https://audiobookshelf.org/)

---

<p align="center"><strong>KumaFlow</strong> — ваш умный музыкальный поток 🎵</p>
