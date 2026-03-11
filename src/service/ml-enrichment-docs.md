/**
 * ML Enrichment из Яндекс.Музыки - Документация
 * 
 * Этап 3: ML обогащение данными из Яндекс.Музыки
 */

## 📊 ЧТО СДЕЛАНО:

### 1. API Методы (yandex-music-api.ts)
- [x] `getArtistInfo()` - информация об артисте (жанры, описание)
- [x] `getTrackInfo()` - информация о треке (BPM, энергия, настроение)
- [x] `getLikedTracks()` - лайкнутые треки пользователя
- [x] `getLikedArtists()` - лайкнутые артисты пользователя
- [x] `getArtistGenres()` - жанры артиста

### 2. ML Enrichment Service (ml-enrichment.ts)
- [x] `importYandexLikes()` - импорт лайков в ML модель
- [x] `enrichTracksWithYandexData()` - обогащение треков BPM/настроением
- [x] `getYandexMLData()` - получение ML данных для кэширования

### 3. UI Компонент (yandex-ml-import.tsx)
- [x] Карточка импорта в ML настройках
- [x] Прогресс бар импорта
- [x] Отображение результатов (артисты, жанры)

---

## 🔧 КАК ИСПОЛЬЗОВАТЬ:

### 1. Подключение Яндекс.Музыки
```
Настройки → Учётки → Яндекс.Музыка
├─ Ввести токен (или быстрая авторизация)
├─ Включить переключатель
└─ Сохранить
```

### 2. Импорт лайков
```
ML Статистика
├─ Кнопка "🎵 Импорт из Яндекс.Музыки" (рядом с импортом из Navidrome)
├─ Нажать → прокрутка к карточке импорта
├─ Нажать "Импортировать лайки"
├─ Дождаться завершения
└─ Получить результат:
   ├─ Артистов импортировано: X
   ├─ Жанров обнаружено: Y
   └─ ML модель обновлена! ✅
```

### 3. Автоматическое обновление ML
- ✅ После импорта ML статистика обновляется автоматически
- ✅ Веса артистов увеличиваются на +5
- ✅ Жанры добавляются в preferredGenres
- ✅ Статистика пересчитывается

### 3. Обогащение треков
```typescript
// В ML генерации плейлистов
import { mlEnrichmentService } from '@/service/ml-enrichment'

// Обогатить треки данными из Яндекс
const enrichedData = await mlEnrichmentService.enrichTracksWithYandexData(trackIds)

// Использовать BPM, энергию, настроение
enrichedData.forEach((data, trackId) => {
  console.log(`Track ${trackId}:`)
  console.log(`  BPM: ${data.bpm}`)
  console.log(`  Energy: ${data.energy}`)
  console.log(`  Mood: ${data.mood}`)
  console.log(`  Genres: ${data.genres?.join(', ')}`)
})
```

---

## 📊 ИНТЕГРАЦИЯ В ML МОДЕЛЬ:

### 1. Дообучение на лайках
```typescript
// При импорте лайков:
for (const artistId of likedArtistIds) {
  // Находим артиста в Navidrome
  const navidromeArtist = await findArtistInNavidrome(artistName)
  
  // Добавляем +5 к весу (как при лайке)
  const currentWeight = profile.preferredArtists[navidromeArtist.id] || 0
  profile.preferredArtists[navidromeArtist.id] = currentWeight + 5
}
```

### 2. Обогащение жанрами
```typescript
// Получаем жанры из лайкнутых артистов
for (const artistId of likedArtistIds) {
  const genres = await yandexMusicService.getArtistGenres(artistId)
  genres.forEach(genre => {
    profile.preferredGenres[genre] = (profile.preferredGenres[genre] || 0) + 1
  })
}
```

### 3. BPM и настроение для Vibe Similarity
```typescript
// При анализе трека для Vibe Similarity
const trackInfo = await yandexMusicService.getTrackInfo(trackId)

if (trackInfo) {
  // Используем данные из Яндекс
  vibeData.bpm = trackInfo.bpm || genreFeatures.bpm
  vibeData.energy = trackInfo.energy || genreFeatures.energy
  vibeData.mood = trackInfo.mood || genreFeatures.valence
}
```

---

## 🎯 СЛЕДУЮЩИЕ ШАГИ:

### 1. Интеграция в Vibe Similarity
- [ ] Использовать BPM из Яндекс вместо жанра
- [ ] Использовать энергию из Яндекс
- [ ] Использовать настроение из Яндекс

### 2. Интеграция в ML Recommendations
- [ ] Учитывать жанры из Яндекс
- [ ] Учитывать лайки из Яндекс при генерации

### 3. Интеграция в NewReleases
- [ ] Использовать поиск из Яндекс
- [ ] Приоритет: Navidrome → Yandex → Apple Music → Discogs

---

## 📝 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ:

### Пример 1: Импорт лайков
```typescript
import { mlEnrichmentService } from '@/service/ml-enrichment'

const result = await mlEnrichmentService.importYandexLikes()
console.log(`Импортировано ${result.artistsImported} артистов`)
console.log(`Обнаружено ${result.genresDiscovered.length} жанров`)
```

### Пример 2: Обогащение треков
```typescript
const trackIds = ['track1', 'track2', 'track3']
const enriched = await mlEnrichmentService.enrichTracksWithYandexData(trackIds)

enriched.forEach((data, trackId) => {
  if (data.bpm) {
    console.log(`Track ${trackId} BPM: ${data.bpm}`)
  }
})
```

### Пример 3: Получение ML данных
```typescript
const mlData = await mlEnrichmentService.getYandexMLData()

console.log(`Лайкнутых треков: ${mlData.likedTrackIds.length}`)
console.log(`Лайкнутых артистов: ${mlData.likedArtistIds.length}`)
console.log(`Features для треков: ${mlData.trackFeatures.size}`)
```

---

*Последнее обновление: 28 февраля 2026*
*Статус: ✅ Готово к интеграции*
