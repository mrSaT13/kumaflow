import { subsonic } from '@/service/subsonic'
import { getSimilarSongs, getTopSongs, getSongsByGenre, getRandomSongs } from '@/service/subsonic-api'
import { lastFmService } from '@/service/lastfm-api'
import { discogsService } from '@/service/discogs-api'
import { useExternalApiStore } from '@/store/external-api.store'
import { useMLStore } from '@/store/ml.store'
import { analyzeTrack, findSimilarTracks, vibeSimilarity } from '@/service/vibe-similarity'
import { orchestratePlaylist, orchestratePlaylistWithBridges, createEnergyWave } from '@/service/playlist-orchestrator'
import { playlistCache } from '@/service/playlist-cache'
import { getSonicFingerprintRecommendations } from '@/service/sonic-fingerprint'
import type { ISong } from '@/types/responses/song'
import type { IAlbum } from '@/types/responses/album'
import type { IArtist } from '@/types/responses/artist'

export interface MLWavePlaylist {
  songs: ISong[]
  source: 'liked' | 'similar' | 'genre' | 'mixed' | 'alchemy'
}

export interface MyWaveSettings {
  activity?: 'wakeup' | 'commute' | 'work' | 'workout' | 'sleep' | ''
  characteristic?: 'favorite' | 'unfamiliar' | 'popular' | ''
  mood?: 'energetic' | 'happy' | 'calm' | 'sad' | ''
  language?: 'russian' | 'foreign' | 'instrumental' | ''
}

export interface SongAlchemyParams {
  energy: number
  danceability: number
  valence: number
  acousticness: number
}

/**
 * Song Alchemy - генерация плейлиста по параметрам настроения
 */
export async function generateSongAlchemy(
  params: SongAlchemyParams,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[Song Alchemy] Generating with params:', params)

  // Получаем все треки
  const allSongs = await getRandomSongs(limit * 5)
  
  if (allSongs.length === 0) {
    console.error('[Song Alchemy] No tracks available')
    throw new Error('Нет треков для анализа')
  }

  // Вычисляем сходство с целевыми параметрами
  let scored = allSongs
    .filter(song => song.energy !== undefined || song.danceability !== undefined)
    .map(song => {
      const energyDiff = Math.abs((song.energy || 0.5) - params.energy)
      const danceabilityDiff = Math.abs((song.danceability || 0.5) - params.danceability)
      const valenceDiff = Math.abs((song.valence || 0.5) - params.valence)
      const acousticnessDiff = Math.abs((song.acousticness || 0.5) - params.acousticness)

      // Меньше разница = выше score
      const similarity = 1 - (energyDiff * 0.3 + danceabilityDiff * 0.3 + valenceDiff * 0.2 + acousticnessDiff * 0.2)

      return { song, similarity }
    })
    .sort((a, b) => b.similarity - a.similarity)

  // Если треки без атрибутов - используем все треки с дефолтными значениями
  if (scored.length === 0) {
    console.warn('[Song Alchemy] No tracks with audio features, using fallback')
    scored = allSongs.map(song => {
      // Используем дефолтные значения для треков без атрибутов
      const energyDiff = Math.abs(0.5 - params.energy)
      const danceabilityDiff = Math.abs(0.5 - params.danceability)
      const valenceDiff = Math.abs(0.5 - params.valence)
      const acousticnessDiff = Math.abs(0.5 - params.acousticness)

      const similarity = 1 - (energyDiff * 0.3 + danceabilityDiff * 0.3 + valenceDiff * 0.2 + acousticnessDiff * 0.2)

      return { song, similarity }
    }).sort((a, b) => b.similarity - a.similarity)
  }

  // Берем лучшие совпадения
  for (const { song } of scored) {
    if (songs.length >= limit) break
    if (!usedSongIds.has(song.id)) {
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  console.log(`[Song Alchemy] Generated ${songs.length} tracks`)

  if (songs.length === 0) {
    throw new Error('Не удалось сгенерировать плейлист')
  }

  return {
    songs,
    source: 'alchemy',
  }
}

/**
 * Получить жанры артиста из Discogs
 * Используется для ML рекомендаций
 */
export async function getArtistGenresFromDiscogs(
  artistName: string
): Promise<string[]> {
  const { settings } = useExternalApiStore.getState()
  
  if (!settings.discogsEnabled || !discogsService.isInitialized()) {
    return []
  }
  
  try {
    const artists = await discogsService.searchArtist(artistName, 5)
    
    if (artists.length === 0) {
      return []
    }
    
    const bestMatch = artists[0]
    const releases = await discogsService.getArtistReleases(bestMatch.id.toString(), 20)
    
    // Собираем все жанры из релизов
    const allGenres = new Set<string>()
    const allStyles = new Set<string>()
    
    for (const release of releases) {
      if (release.genres) {
        release.genres.forEach(g => allGenres.add(g))
      }
      if (release.styles) {
        release.styles.forEach(s => allStyles.add(s))
      }
    }
    
    // Комбинируем жанры и стили
    const combinedGenres = [
      ...Array.from(allGenres),
      ...Array.from(allStyles),
    ]
    
    console.log(`[ML] Discogs genres for "${artistName}":`, combinedGenres)
    return combinedGenres
  } catch (error) {
    console.warn('[ML] Discogs genres error:', error)
    return []
  }
}

export interface MLPlaylistMetadata {
  id: string
  type: 'daily-mix' | 'discover-weekly' | 'my-wave' | 'trends' | 'time-of-day' | 'activity' | 'mood'
  name: string
  description: string
  createdAt: string
  expiresAt?: string
}

/**
 * Определить время суток и вернуть предпочтения для генерации
 */
function getTimeOfDayPreferences() {
  const hour = new Date().getHours()
  
  // Утро (6:00 - 12:00) → энергичная музыка для начала дня
  if (hour >= 6 && hour < 12) {
    return {
      timeOfDay: 'morning' as const,
      targetEnergy: { min: 0.5, max: 0.9 },  // Энергичная
      targetBpm: { min: 100, max: 140 },
      description: 'Утренний заряд энергии',
    }
  }
  
  // День (12:00 - 18:00) → сбалансированная музыка
  if (hour >= 12 && hour < 18) {
    return {
      timeOfDay: 'day' as const,
      targetEnergy: { min: 0.4, max: 0.8 },  // Сбалансированная
      targetBpm: { min: 90, max: 130 },
      description: 'Дневной ритм',
    }
  }
  
  // Вечер (18:00 - 23:00) → спокойная музыка для отдыха
  if (hour >= 18 && hour < 23) {
    return {
      timeOfDay: 'evening' as const,
      targetEnergy: { min: 0.2, max: 0.6 },  // Спокойная
      targetBpm: { min: 70, max: 110 },
      description: 'Вечерний расслабон',
    }
  }

  // Ночь (23:00 - 6:00) → очень спокойная, медитативная
  return {
    timeOfDay: 'night' as const,
    targetEnergy: { min: 0.1, max: 0.4 },  // Очень спокойная
    targetBpm: { min: 60, max: 90 },
    description: 'Ночная медитация',
  }
}

/**
 * Универсальная функция для расчета behavior scores
 * Используется во всех плейлистах для учета поведения пользователя
 */
export async function calculateBehaviorScores(): Promise<Record<string, number>> {
  const { BehaviorTracker } = await import('./behavior-tracker')
  const behaviorTracker = new BehaviorTracker()
  const behaviorEvents = await behaviorTracker.getEvents(500)
  
  const behaviorScores: Record<string, number> = {}
  
  behaviorEvents.forEach(event => {
    const songId = event.trackId
    if (!behaviorScores[songId]) behaviorScores[songId] = 0
    
    switch (event.action) {
      case 'complete':
        behaviorScores[songId] += 5  // Дослушал до конца
        break
      case 'like':
        behaviorScores[songId] += 10  // Лайк
        break
      case 'repeat':
        behaviorScores[songId] += 15  // Повтор (сильный сигнал!)
        break
      case 'skip':
        if (event.position < 30) {
          behaviorScores[songId] -= 8  // Пропуск в первые 30 сек
        } else if (event.position < 60) {
          behaviorScores[songId] -= 4  // Пропуск в первые 60 сек
        }
        break
      case 'dislike':
        behaviorScores[songId] -= 15  // Дизлайк
        break
    }
  })

  console.log(`[BehaviorTracker] 📊 Scores calculated for ${Object.keys(behaviorScores).length} tracks`)
  return behaviorScores
}

/**
 * Универсальная функция для сортировки треков по behavior scores
 */
export function sortTracksByBehavior(tracks: ISong[], behaviorScores: Record<string, number>): ISong[] {
  return [...tracks].sort((a, b) => {
    const aScore = behaviorScores[a.id] || 0
    const bScore = behaviorScores[b.id] || 0
    
    if (aScore !== 0 || bScore !== 0) {
      return bScore - aScore  // Выше скоринг = выше в списке
    }
    
    return 0  // Если нет данных - случайный порядок
  })
}

/**
 * Генерация плейлиста "Моя волна" на основе ML данных + Vibe Similarity
 */
export async function generateMyWavePlaylist(
  likedSongIds: string[],
  ratings: Record<string, any>,
  limit: number = 25,
  excludeDisliked: boolean = true,
  settings?: MyWaveSettings
): Promise<MLWavePlaylist> {
  // Загружаем настройки из localStorage если не переданы
  const myWaveSettings: MyWaveSettings = settings || JSON.parse(localStorage.getItem('my-wave-settings') || '{}')

  console.log('[MyWave] Using settings:', myWaveSettings)

  // ============================================
  // ИНТЕГРАЦИЯ BEHAVIOR TRACKER
  // ============================================
  const { BehaviorTracker } = await import('./behavior-tracker')
  const behaviorTracker = new BehaviorTracker()
  const behaviorEvents = await behaviorTracker.getEvents(500)
  
  // Анализируем поведение пользователя
  const behaviorScores: Record<string, number> = {}
  
  behaviorEvents.forEach(event => {
    const songId = event.trackId
    if (!behaviorScores[songId]) behaviorScores[songId] = 0
    
    switch (event.action) {
      case 'complete':
        behaviorScores[songId] += 5  // Дослушал до конца
        break
      case 'like':
        behaviorScores[songId] += 10  // Лайк
        break
      case 'repeat':
        behaviorScores[songId] += 15  // Повтор (сильный сигнал!)
        break
      case 'skip':
        if (event.position < 30) {
          behaviorScores[songId] -= 8  // Пропуск в первые 30 сек
        } else if (event.position < 60) {
          behaviorScores[songId] -= 4  // Пропуск в первые 60 сек
        }
        break
      case 'dislike':
        behaviorScores[songId] -= 15  // Дизлайк
        break
    }
  })

  console.log(`[MyWave] 📊 Behavior scores calculated for ${Object.keys(behaviorScores).length} tracks`)

  // ВАЖНО: Получаем настройку новизны из настроек!
  const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
  const mlPlaylistsState = useMLPlaylistsStore.getState()
  const noveltyFactor = mlPlaylistsState.settings.noveltyFactor ?? 0.2
  
  // Исправлено: noveltyFactor теперь реально влияет на процент НОВЫХ треков
  // noveltyFactor = 0.0 → 100% знакомых, 0% новых
  // noveltyFactor = 0.2 → 80% знакомых, 20% новых  
  // noveltyFactor = 0.5 → 50% знакомых, 50% новых
  // noveltyFactor = 1.0 → 0% знакомых, 100% новых
  const noveltyTrackCount = Math.floor(limit * noveltyFactor)
  const familiarTrackCount = limit - noveltyTrackCount
  
  const onlyPreferences = noveltyFactor === 0

  console.log('[MyWave] ===== START =====')
  console.log('[MyWave] Novelty factor:', noveltyFactor)
  console.log('[MyWave] Target: limit=', limit, ', familiar=', familiarTrackCount, ', new=', noveltyTrackCount)
  console.log('[MyWave] Only preferences:', onlyPreferences)
  console.log('[MyWave] Settings from store:', mlPlaylistsState.settings)
  console.log('[MyWave] localStorage my-wave-settings:', localStorage.getItem('my-wave-settings'))

  // WARNING для отладки
  if (onlyPreferences) {
    console.warn('⚠️⚠️⚠️ ONLY PREFERENCES MODE ENABLED ⚠️⚠️⚠️')
    console.warn('NO VIBE SIMILARITY, NO RANDOM SONGS, NO GENRE SONGS!')
  }

  // Создаем ключ кэша на основе настроек
  const hasSettings = myWaveSettings && Object.keys(myWaveSettings).length > 0
  const cacheKey = hasSettings
    ? `my-wave-${JSON.stringify(myWaveSettings)}`
    : 'my-wave'

  // Проверяем кэш ТОЛЬКО если есть настройки
  const cached = hasSettings ? playlistCache.get(cacheKey) : null
  if (cached) {
    console.log('[MyWave] Using cached playlist for key:', cacheKey)
    return {
      songs: cached,
      source: 'cached',
    }
  }

  let songs: ISong[] = []  // ИСПРАВЛЕНО: let вместо const
  const usedSongIds = new Set<string>()

  // Получаем забаненных артистов и профиль
  const { useMLStore } = await import('@/store')
  const mlState = useMLStore.getState()

  const bannedArtists = mlState.profile.bannedArtists || []
  const preferredArtists = mlState.profile.preferredArtists || {}
  const preferredGenres = mlState.profile.preferredGenres || {}

  // Проверяем настройку адаптивности по времени суток (используем уже созданную переменную)
  const timeAdaptivityEnabled = mlPlaylistsState.settings.timeAdaptivity !== false  // По умолчанию true
  const timePreferences = getTimeOfDayPreferences()
  
  console.log('[MyWave] Banned artists:', bannedArtists)
  console.log('[MyWave] ML Profile:', mlState.profile)
  console.log('[MyWave] Preferred artists:', Object.keys(preferredArtists).length)
  console.log('[MyWave] Preferred genres:', Object.keys(preferredGenres).length)
  console.log('[MyWave] Time adaptivity:', timeAdaptivityEnabled ? `✅ ${timePreferences.description}` : '❌ Отключена')
  console.log('[MyWave] Time preferences:', timePreferences)

  // ИСПРАВЛЕНИЕ: Если likedSongIds пустой, используем preferredArtists и preferredGenres
  // Это основной сценарий для пользователей прошедших холодный старт
  let effectiveLikedSongIds = likedSongIds
  if (likedSongIds.length === 0 && (Object.keys(preferredArtists).length > 0 || Object.keys(preferredGenres).length > 0)) {
    console.log('[MyWave] ⚠️ likedSongIds пустой! Используем preferredArtists и preferredGenres для генерации...')
    console.log('[MyWave] 🎯 Это нормальная ситуация — генерируем на основе лайкнутых артистов и жанров')

    effectiveLikedSongIds = []

    // 1. Берем треки от preferred артистов (приоритет!)
    if (Object.keys(preferredArtists).length > 0) {
      const artistIds = Object.keys(preferredArtists)
      console.log('[MyWave] 🎤 Loading tracks from preferred artists:', artistIds.length)

      // Берем топ-30 артистов по весу (было 15)
      const sortedArtists = Object.entries(preferredArtists)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([id]) => id)

      for (const artistId of sortedArtists) {  // Было artistIds.slice(0, 15)
        try {
          const artist = await subsonic.artists.getOne(artistId)
          if (artist?.name) {
            // Берем 5 треков от каждого (было 2)
            const topSongs = await getTopSongs(artist.name, 5)
            topSongs.forEach(song => {
              if (!bannedArtists.includes(artistId)) {
                effectiveLikedSongIds.push(song.id)
              }
            })
          }
        } catch (error) {
          console.warn(`[MyWave] Failed to get songs for artist ${artistId}:`, error)
        }
      }
      console.log('[MyWave] ✅ Got', effectiveLikedSongIds.length, 'tracks from preferred artists')
    }

    // 2. Добавляем треки из preferred жанров (для разнообразия)
    if (Object.keys(preferredGenres).length > 0) {
      const topGenres = Object.entries(preferredGenres)
        .sort((a, b) => b[1] - a[1])  // Сортируем по весу
        .slice(0, 5)  // Берем топ-5 жанров
        .map(([genre]) => genre)

      console.log('[MyWave] 🎵 Loading tracks from preferred genres:', topGenres)

      for (const genre of topGenres) {
        try {
          const genreSongs = await getSongsByGenre(genre, 5)  // По 5 треков от каждого жанра
          genreSongs.forEach(song => {
            if (song.artistId && !bannedArtists.includes(song.artistId)) {
              effectiveLikedSongIds.push(song.id)
            }
          })
        } catch (error) {
          console.warn(`[MyWave] Failed to get songs for genre ${genre}:`, error)
        }
      }
      console.log('[MyWave] ✅ Total tracks after genres:', effectiveLikedSongIds.length)
    }

    console.log('[MyWave] 🎯 Generated effectiveLikedSongIds:', effectiveLikedSongIds.length, 'tracks')
  } else if (likedSongIds.length > 0) {
    console.log('[MyWave] ✅ Using likedSongIds:', likedSongIds.length, 'tracks')
  } else {
    console.warn('[MyWave] ⚠️ likedSongIds пустой И preferredArtists/Genres пустые! Будут случайные треки.')
  }

  // Исключаем дизлайкнутые треки
  const dislikedSongIds = new Set<string>()
  if (excludeDisliked) {
    Object.entries(ratings)
      .filter(([_, rating]) => rating.like === false)
      .forEach(([id]) => dislikedSongIds.add(id))
    dislikedSongIds.forEach(id => usedSongIds.add(id))
  }

  // Фильтр для проверки banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[MyWave] ❌ BANNED artist ID: ${song.artist} (${song.artistId})`)
      return true
    }
    // Дополнительная проверка по имени артиста (если artistId не доступен)
    if (!song.artistId && bannedArtists.some(id => 
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[MyWave] ❌ BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[MyWave] Excluding ${recentUsedIds.size} recently played tracks`)

  // 1. СНАЧАЛА фильтруем лайкнутые по настройкам
  if (effectiveLikedSongIds.length > 0 && myWaveSettings && Object.keys(myWaveSettings).length > 0) {
    console.log('[MyWave] Filtering liked songs by settings...')

    const { analyzeTrack } = await import('./vibe-similarity')

    // Получаем все лайкнутые треки
    const allLikedSongs = await Promise.all(
      effectiveLikedSongIds.map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    // Фильтруем по настройкам
    const filteredLiked = allLikedSongs.filter(song => {
      if (!song || !song.genre) return false

      // ПРОПУСКАЕМ забаненных артистов!
      if (isBannedArtist(song)) {
        return false
      }
      
      const features = analyzeTrack(song)
      const artist = (song.artist || '').toLowerCase()

      // ПРИОРИТЕТ: Артисты "relax/asmr" для calm/sleep
      const isCalmMode = myWaveSettings.mood === 'calm' || myWaveSettings.activity === 'sleep'
      const relaxArtists = ['relax', 'asmr', 'meditation', 'sleep', 'calm']
      
      // Если артист relax/asmr - мягкий фильтр
      if (isCalmMode && relaxArtists.some(a => artist.includes(a))) {
        return features.energy <= 0.6  // Мягкий фильтр для relax артистов
      }

      // Фильтр по настроению - МЯГКИЙ!
      if (myWaveSettings.mood === 'calm') {
        if (features.energy > 0.6) {  // Было 0.5
          return false
        }
      }

      // Фильтр по занятию - МЯГКИЙ!
      if (myWaveSettings.activity === 'sleep') {
        if (features.energy > 0.5 || features.bpm > 120) {  // Было 0.4 и 110
          return false
        }
      }

      // Фильтр по языку (instrumental = без слов) - МЯГКИЙ!
      if (myWaveSettings.language === 'instrumental') {
        if (features.instrumentalness < 0.5) {  // Было 0.7
          return false
        }
      }

      return true
    })

    // Сортируем: СНАЧАЛА relax/asmr артисты, потом остальные
    if (isCalmMode) {
      filteredLiked.sort((a, b) => {
        const aArtist = (a.artist || '').toLowerCase()
        const bArtist = (b.artist || '').toLowerCase()
        const aIsRelax = relaxArtists.some(r => aArtist.includes(r)) ? 1 : 0
        const bIsRelax = relaxArtists.some(r => bArtist.includes(r)) ? 1 : 0
        return bIsRelax - aIsRelax  // Relax артисты первыми!
      })
    }

    console.log(`[MyWave] Filtered ${filteredLiked.length} liked songs by settings`)
    
    // Добавляем отфильтрованные лайкнутые
    filteredLiked.forEach(song => {
      if (song && !usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 2. Если настроек нет или мало треков - берем случайные лайкнутые
  if (songs.length === 0 && effectiveLikedSongIds.length > 0) {
    const shuffledLiked = [...effectiveLikedSongIds].sort(() => Math.random() - 0.5)
    const likedSongs = await Promise.all(
      shuffledLiked.slice(0, Math.min(10, effectiveLikedSongIds.length)).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    likedSongs.forEach(song => {
      if (song && song.genre && !usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 2. VIBE SIMILARITY: Находим треки похожие на лайкнутые по аудио-признакам
  // ИСПРАВЛЕНО: Используем noveltyTrackCount для ограничения количества НОВЫХ треков
  if (songs.length > 0 && limit > songs.length && !onlyPreferences) {
    console.log('[MyWave] Using Vibe Similarity to find similar tracks...')
    console.log(`[MyWave] Target: max ${noveltyTrackCount} new tracks via Vibe Similarity`)

    // Загружаем все треки для анализа
    console.log('[MyWave] Loading all songs for vibe analysis...')
    const allSongs = await getRandomSongs(200)

    // СНАЧАЛА фильтруем allSongs по настройкам!
    let filteredAllSongs = allSongs
    if (myWaveSettings && Object.keys(myWaveSettings).length > 0) {
      const { analyzeTrack } = await import('./vibe-similarity')

      filteredAllSongs = allSongs.filter(song => {
        const features = analyzeTrack(song)
        const artist = (song.artist || '').toLowerCase()

        // ПРОПУСКАЕМ забаненных артистов!
        if (isBannedArtist(song)) {
          return false
        }

        // ПРИОРИТЕТ: Артисты "relax/asmr" для calm/sleep
        const isCalmMode = myWaveSettings.mood === 'calm' || myWaveSettings.activity === 'sleep'
        const relaxArtists = ['relax', 'asmr', 'meditation', 'sleep', 'calm']

        // Если артист relax/asmr - пропускаем почти всё!
        if (isCalmMode && relaxArtists.some(a => artist.includes(a))) {
          return features.energy <= 0.6  // Мягкий фильтр
        }

        // Фильтр по настроению - ОЧЕНЬ МЯГКИЙ!
        if (myWaveSettings.mood === 'calm') {
          if (features.energy > 0.6) {  // Было 0.5
            return false
          }
        }

        // Фильтр по занятию - МЯГКИЙ!
        if (myWaveSettings.activity === 'sleep') {
          if (features.energy > 0.5 || features.bpm > 120) {  // Было 0.4 и 110
            return false
          }
        }

        // Фильтр по языку (instrumental = без слов)
        if (myWaveSettings.language === 'instrumental') {
          if (features.instrumentalness < 0.5) {  // Было 0.7
            return false
          }
        }

        return true
      })

      console.log(`[MyWave] Filtered allSongs from ${allSongs.length} to ${filteredAllSongs.length} by settings`)
    }

    // Берем 3-5 случайных лайкнутых как seed
    const seedTracks = songs.slice(0, Math.min(5, songs.length))
    const allSongsForVibe: ISong[] = []
    const vibeUsedIds = new Set<string>()
    // ИСПРАВЛЕНО: Ограничиваем количество НОВЫХ треков через noveltyTrackCount
    const maxVibeTracks = Math.min(Math.floor(limit / 2), noveltyTrackCount)

    // Для каждого seed находим похожие треки ИЗ ОТФИЛЬТРОВАННЫХ!
    for (const seed of seedTracks) {
      const tracksPerSeed = Math.floor(maxVibeTracks / seedTracks.length)
      const similar = findSimilarTracks(seed, filteredAllSongs, tracksPerSeed, 0.6)  // Используем filteredAllSongs!
      similar.forEach(track => {
        if (!vibeUsedIds.has(track.id) && !usedSongIds.has(track.id)) {
          allSongsForVibe.push(track)
          vibeUsedIds.add(track.id)
          usedSongIds.add(track.id)
        }
      })
      if (allSongsForVibe.length >= maxVibeTracks) break
    }

    // Сортируем: СНАЧАЛА relax/asmr артисты!
    if (myWaveSettings?.mood === 'calm' || myWaveSettings?.activity === 'sleep') {
      const relaxArtists = ['relax', 'asmr', 'meditation', 'sleep', 'calm']
      allSongsForVibe.sort((a, b) => {
        const aArtist = (a.artist || '').toLowerCase()
        const bArtist = (b.artist || '').toLowerCase()
        const aIsRelax = relaxArtists.some(r => aArtist.includes(r)) ? 1 : 0
        const bIsRelax = relaxArtists.some(r => bArtist.includes(r)) ? 1 : 0
        return bIsRelax - aIsRelax
      })
    }

    songs.push(...allSongsForVibe.slice(0, maxVibeTracks))
    console.log(`[MyWave] Found ${allSongsForVibe.length} tracks via Vibe Similarity (limit: ${maxVibeTracks})`)
  }

  // 3. Если мало треков, добавляем по жанрам из лайкнутых
  // ИСПРАВЛЕНО: Учитываем noveltyTrackCount для ограничения НОВЫХ треков
  const currentNewTracks = songs.filter(s => !usedSongIds.has(s.id) || !effectiveLikedSongIds.includes(s.id)).length
  
  if (songs.length < limit && !onlyPreferences && currentNewTracks < noveltyTrackCount) {
    const genreCount: Record<string, number> = {}
    const remainingNovelty = noveltyTrackCount - currentNewTracks
    
    console.log(`[MyWave] Adding genre songs: need up to ${remainingNovelty} more new tracks`)

    // Считаем жанры в лайкнутых
    songs.forEach(song => {
      if (song.genre) {
        genreCount[song.genre] = (genreCount[song.genre] || 0) + 1
      }
    })

    // Топ жанры + случайный выбор из топ-3
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre)

    // Для каждого топ жанра берем СЛУЧАЙНЫЕ треки
    for (const genre of topGenres) {
      if (songs.length >= limit || currentNewTracks >= noveltyTrackCount) break

      const songsByGenre = await getSongsByGenre(genre, 20) // Берем больше для рандома
      // Перемешиваем и берем 5 случайных (копируем массив перед sort)
      const shuffled = [...songsByGenre].sort(() => Math.random() - 0.5).slice(0, 5)
      for (const song of shuffled) {
        if (songs.length >= limit) break
        if (!usedSongIds.has(song.id) && !isBannedArtist(song)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
  } else if (onlyPreferences && songs.length < limit) {
    console.log('[MyWave] Skipping genre songs - onlyPreferences mode enabled')
  }

  // 4. Если всё ещё мало, добавляем случайные
  // ИСПРАВЛЕНО: Учитываем noveltyTrackCount для ограничения НОВЫХ треков
  const currentNewCount = songs.filter(s => !effectiveLikedSongIds.includes(s.id)).length
  const remainingNoveltySlots = noveltyTrackCount - currentNewCount
  
  if (songs.length < limit && !onlyPreferences && remainingNoveltySlots > 0) {
    // Берем только столько случайных треков, сколько осталось по novelty
    const randomCount = Math.min(limit - songs.length, remainingNoveltySlots + 5) // +5 для запаса
    const randomSongs = await getRandomSongs(randomCount + 10)
    const shuffled = [...randomSongs].sort(() => Math.random() - 0.5)
    
    let addedNewTracks = 0
    shuffled.forEach(song => {
      if (songs.length >= limit || addedNewTracks >= remainingNoveltySlots) return
      if (!usedSongIds.has(song.id) && !isBannedArtist(song)) {
        songs.push(song)
        usedSongIds.add(song.id)
        addedNewTracks++
      }
    })
    
    console.log(`[MyWave] Added ${addedNewTracks} random tracks (novelty slots: ${remainingNoveltySlots})`)
  } else if (onlyPreferences && songs.length < limit) {
    console.log('[MyWave] Skipping random songs - onlyPreferences mode enabled')
  }

  // 4.5. ПРИНУДИТЕЛЬНОЕ ДОБИРАНИЕ: Если всё ещё меньше limit - добавляем любые треки
  if (songs.length < limit) {
    const deficit = limit - songs.length
    console.log(`[MyWave] ⚠️ Deficit: need ${deficit} more tracks to reach limit ${limit}`)
    
    // Загружаем ещё случайных и добавляем БЕЗ ограничений novelty
    const extraSongs = await getRandomSongs(deficit * 2) // Берём с запасом
    let addedExtra = 0
    
    for (const song of extraSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id) && !isBannedArtist(song)) {
        songs.push(song)
        usedSongIds.add(song.id)
        addedExtra++
      }
    }
    
    console.log(`[MyWave] ✅ Added ${addedExtra} extra tracks to reach limit. Total: ${songs.length}/${limit}`)
  }

  console.log(`[MyWave] ===== BEFORE ORCHESTRATION: ${songs.length} tracks (target: ${limit}) =====`)

  // ============================================
  // 4.6. РАЗБИВАЕМ ПАЧКИ ОДИНАКОВЫХ АРТИСТОВ
  // ============================================
  console.log('[MyWave] 🔀 Breaking up artist clusters...')
  
  const artistGroupsMW = new Map<string, ISong[]>()
  songs.forEach(song => {
    const artist = song.artist || 'Unknown'
    if (!artistGroupsMW.has(artist)) {
      artistGroupsMW.set(artist, [])
    }
    artistGroupsMW.get(artist)!.push(song)
  })
  
  artistGroupsMW.forEach(group => {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[group[i], group[j]] = [group[j], group[i]]
    }
  })
  
  const shuffledSongsMW: ISong[] = []
  const usedIdsMW = new Set<string>()
  
  let hasMoreMW = true
  while (hasMoreMW) {
    hasMoreMW = false
    artistGroupsMW.forEach((group) => {
      for (const song of group) {
        if (!usedIdsMW.has(song.id)) {
          shuffledSongsMW.push(song)
          usedIdsMW.add(song.id)
          hasMoreMW = true
          break
        }
      }
    })
  }
  
  console.log(`[MyWave] ✅ Shuffled: ${artistGroupsMW.size} artists, ${shuffledSongsMW.length} tracks`)
  
  songs.length = 0
  songs.push(...shuffledSongsMW)

  // 5. Финальное перемешивание плейлиста
  // Вместо случайного перемешивания используем оркестратор для плавных переходов
  // ВАЖНО: Если настройки "calm" или "sleep" - используем только calm сортировку!
  // ВАЖНО: Если включена timeAdaptivity - фильтруем и сортируем по времени суток
  
  let orchestratedPlaylist: ISong[]
  const { analyzeTrack } = await import('./vibe-similarity')

  // АДАПТИВНОСТЬ ПО ВРЕМЕНИ СУТОК
  // ВАЖНО: В режиме onlyPreferences НЕ фильтруем треки по времени! Только сортируем.
  if (timeAdaptivityEnabled && !myWaveSettings?.mood && !myWaveSettings?.activity) {
    // Если нет явных настроек настроения/занятия - используем время суток
    console.log(`[MyWave] 🕐 Applying time adaptivity: ${timePreferences.description}`)
    console.log(`[MyWave] Target energy: ${timePreferences.targetEnergy.min} - ${timePreferences.targetEnergy.max}`)
    console.log(`[MyWave] Target BPM: ${timePreferences.targetBpm.min} - ${timePreferences.targetBpm.max}`)

    // В режиме onlyPreferences НЕ фильтруем треки, только сортируем!
    let playlistForOrchestration = songs
    
    if (!onlyPreferences) {
      // Фильтруем треки по параметрам времени суток (МЯГКИЙ фильтр!)
      const filteredByTime = songs.filter(song => {
        const features = analyzeTrack(song)

        // Мягкий фильтр по энергии (пропускаем 80% треков)
        const energyMatch = features.energy >= timePreferences.targetEnergy.min - 0.1 &&
                           features.energy <= timePreferences.targetEnergy.max + 0.1

        // Мягкий фильтр по BPM (пропускаем 70% треков)
        const bpmMatch = features.bpm >= timePreferences.targetBpm.min - 20 &&
                        features.bpm <= timePreferences.targetBpm.max + 20

        // Пропускаем если хотя бы один параметр подходит
        return energyMatch || bpmMatch
      })

      console.log(`[MyWave] Filtered from ${songs.length} to ${filteredByTime.length} tracks by time`)

      // Если после фильтрации осталось мало треков - используем все
      playlistForOrchestration = filteredByTime.length >= 10 ? filteredByTime : songs
    } else {
      console.log('[MyWave] Skipping time filtering - onlyPreferences mode enabled')
    }

    // Сортируем по соответствию времени суток
    orchestratedPlaylist = [...playlistForOrchestration].sort((a, b) => {
      const aFeatures = analyzeTrack(a)
      const bFeatures = analyzeTrack(b)
      
      // Считаем "score" соответствия времени суток
      const aEnergyScore = Math.abs(aFeatures.energy - (timePreferences.targetEnergy.min + timePreferences.targetEnergy.max) / 2)
      const bEnergyScore = Math.abs(bFeatures.energy - (timePreferences.targetEnergy.min + timePreferences.targetEnergy.max) / 2)
      
      return aEnergyScore - bEnergyScore  // Ближе к целевому значению = выше в списке
    })

    // Оркестратор с учётом времени суток
    if (timePreferences.timeOfDay === 'morning') {
      // Утро: нарастание энергии
      orchestratedPlaylist = orchestratePlaylist(orchestratedPlaylist, {
        startWith: 'calm',
        endWith: 'energetic',
        excludedSongIds: dislikedSongIds,
        bannedArtists,
      })
    } else if (timePreferences.timeOfDay === 'evening' || timePreferences.timeOfDay === 'night') {
      // Вечер/ночь: спад энергии
      orchestratedPlaylist = orchestratePlaylist(orchestratedPlaylist, {
        startWith: 'energetic',
        endWith: 'calm',
        excludedSongIds: dislikedSongIds,
        bannedArtists,
      })
    } else {
      // День: сбалансированный
      orchestratedPlaylist = orchestratePlaylist(orchestratedPlaylist, {
        startWith: 'balanced',
        endWith: 'balanced',
        excludedSongIds: dislikedSongIds,
        bannedArtists,
      })
    }

    console.log(`[MyWave] ✅ Time-adaptive playlist: ${orchestratedPlaylist.length} tracks`)
  } else if (myWaveSettings?.mood === 'calm' || myWaveSettings?.activity === 'sleep') {
    // Простая сортировка по возрастанию energy для спокойных плейлистов
    console.log('[MyWave] Using calm sorting (energy ascending, no hard filter)')

    // Сортируем ВСЕ треки по возрастанию energy (без жесткой фильтрации!)
    orchestratedPlaylist = [...songs].sort((a, b) => {
      const aFeatures = analyzeTrack(a)
      const bFeatures = analyzeTrack(b)
      return aFeatures.energy - bFeatures.energy
    })

    // Берем только первые N треков (самые спокойные)
    const maxTracks = orchestratedPlaylist.length
    orchestratedPlaylist = orchestratedPlaylist.slice(0, Math.min(maxTracks, limit))
  } else if (onlyPreferences) {
    // ВАЖНО: В режиме onlyPreferences НЕ используем оркестратор!
    // Оркестратор отбрасывает треки которые не подходят по энергии
    // В режиме onlyPreferences мы хотим ВСЕ треки от preferred артистов
    console.log('[MyWave] Using simple shuffle - onlyPreferences mode (no orchestrator)')
    
    // Сортируем с учетом behavior scores
    orchestratedPlaylist = [...songs].sort((a, b) => {
      const aBehaviorScore = behaviorScores[a.id] || 0
      const bBehaviorScore = behaviorScores[b.id] || 0
      
      // Если есть behavior scores - используем их
      if (aBehaviorScore !== 0 || bBehaviorScore !== 0) {
        return bBehaviorScore - aBehaviorScore  // Выше скоринг = выше в списке
      }
      
      // Иначе случайная сортировка
      return Math.random() - 0.5
    })
    
    console.log(`[MyWave] 📊 Sorted by behavior scores: ${Object.keys(behaviorScores).length} tracks scored`)
  } else {
    // Обычный оркестратор с нарастанием энергии
    // СНАЧАЛА сортируем по behavior scores, потом оркестрируем
    const scoredSongs = [...songs].sort((a, b) => {
      const aBehaviorScore = behaviorScores[a.id] || 0
      const bBehaviorScore = behaviorScores[b.id] || 0
      
      // Если есть behavior scores - используем их (30% веса)
      if (aBehaviorScore !== 0 || bBehaviorScore !== 0) {
        return bBehaviorScore - aBehaviorScore
      }
      
      return 0
    })
    
    orchestratedPlaylist = orchestratePlaylist(scoredSongs, {
      startWith: 'energetic',
      endWith: 'calm',
      excludedSongIds: dislikedSongIds,
      bannedArtists,
    })
    
    console.log(`[MyWave] 📊 Orchestrated with behavior scores: ${Object.keys(behaviorScores).length} tracks scored`)
  }

  const finalSongs = orchestratedPlaylist.slice(0, limit)

  // Сохраняем в кэш
  playlistCache.set(cacheKey, finalSongs, usedSongIds, {
    source: 'mixed',
    vibeSimilarity: true,
    orchestrated: true,
    settings: myWaveSettings,
  })

  return {
    songs: finalSongs,
    source: 'mixed',
  }
}

/**
 * Генерация плейлиста на основе выбранных артистов из холодного старта
 * С Vibe Similarity и Оркестратором!
 */
export async function generateArtistBasedPlaylist(
  selectedArtists: string[],
  limit: number = 50
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[ArtistBased] Generating playlist for', selectedArtists.length, 'artists')

  // 1. СНАЧАЛА берем по 2-3 трека от каждого артиста (чтобы не перегружать)
  for (const artistId of selectedArtists) {
    try {
      const artist = await subsonic.artists.getOne(artistId)
      if (artist?.name) {
        const topSongs = await getTopSongs(artist.name, 3)  // Только 3 трека!
        for (const song of topSongs) {
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      }
    } catch (error) {
      console.error('Failed to get artist songs:', error)
    }
  }

  console.log('[ArtistBased] Got', songs.length, 'seed tracks from artists')

  // 2. VIBE SIMILARITY: Находим похожие треки для каждого seed!
  if (songs.length > 0) {
    console.log('[ArtistBased] Using Vibe Similarity...')
    const allSongs = await getRandomSongs(200)
    
    const seedTracks = songs.slice(0, Math.min(10, songs.length))
    const vibeSimilar: ISong[] = []
    const vibeUsedIds = new Set<string>(usedSongIds)

    for (const seed of seedTracks) {
      const similar = findSimilarTracks(seed, allSongs, 5, 0.65)
      for (const track of similar) {
        if (!vibeUsedIds.has(track.id)) {
          vibeSimilar.push(track)
          vibeUsedIds.add(track.id)
        }
      }
    }

    console.log('[ArtistBased] Found', vibeSimilar.length, 'tracks via Vibe Similarity')
    songs.push(...vibeSimilar.slice(0, Math.floor(limit / 2)))
  }

  // 3. Если мало - добавляем по жанрам артистов
  if (songs.length < limit) {
    console.log('[ArtistBased] Adding genre-based tracks...')
    const genreSet = new Set<string>()
    
    for (const artistId of selectedArtists.slice(0, 5)) {
      try {
        const artist = await subsonic.artists.getOne(artistId)
        if (artist?.genres && artist.genres.length > 0) {
          artist.genres.forEach(g => genreSet.add(g))
        }
      } catch (error) {
        // Ignore
      }
    }

    for (const genre of Array.from(genreSet).slice(0, 5)) {
      if (songs.length >= limit) break
      
      const genreSongs = await getSongsByGenre(genre, 10)
      for (const song of genreSongs) {
        if (songs.length >= limit) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
  }

  // 4. ОРКЕСТРАТОР: Сортируем для плавных переходов!
  console.log('[ArtistBased] Orchestrating playlist...')
  const { orchestratePlaylist } = await import('./playlist-orchestrator')
  
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
  })

  console.log('[ArtistBased] Final playlist:', orchestrated.length, 'tracks')

  return {
    songs: orchestrated,
    source: 'mixed',
  }
}

/**
 * Генерация плейлиста на основе выбранных жанров из холодного старта
 */
export async function generateGenreBasedPlaylist(
  selectedGenres: string[],
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Для каждого выбранного жанра берем треки
  for (const genre of selectedGenres) {
    if (songs.length >= limit) break

    const songsByGenre = await getSongsByGenre(genre, 10)
    for (const song of songsByGenre) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  return {
    songs,
    source: 'genre',
  }
}

/**
 * Получить похожие треки на основе текущего
 */
export async function getSimilarTracks(
  currentSong: ISong,
  limit: number = 10
): Promise<ISong[]> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>([currentSong.id])

  // 1. Треки того же артиста
  if (currentSong.artistId) {
    const artistSongs = await getTopSongs(currentSong.artist, 5)
    artistSongs.forEach(song => {
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 2. Треки того же жанра
  if (songs.length < limit && currentSong.genre) {
    const genreSongs = await getSongsByGenre(currentSong.genre, 10)
    genreSongs.forEach(song => {
      if (songs.length >= limit) return
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 3. Случайные треки
  if (songs.length < limit) {
    const randomSongs = await getRandomSongs(limit - songs.length)
    randomSongs.forEach(song => {
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  return songs.slice(0, limit)
}

/**
 * Генерация "Ежедневного микса" на основе лайкнутых треков и жанров
 * ФОРМУЛА: 60-70% любимое + 20-30% похожее + 10-20% новое
 */
export async function generateDailyMix(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  preferredArtists: Record<string, number>,
  limit: number = 30
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Получаем banned artists из ML store
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []

  // Исключаем дизлайкнутые треки
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  const now = new Date()
  const twoMonthsAgo = Date.now() - (60 * 24 * 60 * 60 * 1000)  // 2 месяца
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)  // 90 дней

  console.log(`[DailyMix] ===== START: Generating ${limit} tracks =====`)
  console.log(`[DailyMix] ❤️ Liked: ${likedSongIds.length}, Genres: ${Object.keys(preferredGenres || {}).length}`)

  // ============================================
  // 1. "ЗАБЫТЫЕ" ТРЕКИ (60%): 5+ прослушиваний, 2+ месяца не слушали
  // ============================================
  const forgottenCount = Math.floor(limit * 0.50)  // 50% забытые
  const vibeSimilarCount = Math.floor(limit * 0.10)  // 10% похожие на забытые
  
  console.log(`[DailyMix] 🕰️ FORGOTTEN: Finding tracks with 5+ plays, 2+ months not played...`)

  // Находим "забытые" треки
  const forgottenTrackIds = Object.entries(ratings || {})
    .filter(([id, rating]: [string, any]) => {
      // 5+ прослушиваний
      if (!rating.playCount || rating.playCount < 5) return false
      
      // 2+ месяца не слушали
      if (!rating.lastPlayed) return false
      const lastPlayed = new Date(rating.lastPlayed).getTime()
      return lastPlayed <= twoMonthsAgo
    })
    .map(([id]) => id)

  console.log(`[DailyMix] 🕰️ Found ${forgottenTrackIds.length} forgotten tracks`)

  // Загружаем забытые треки и фильтруем по BPM/MOOD
  if (forgottenTrackIds.length > 0) {
    const { analyzeTrack } = await import('./vibe-similarity')
    
    // Берем случайные забытые треки
    const shuffledForgotten = forgottenTrackIds.sort(() => Math.random() - 0.5).slice(0, forgottenCount + 20)
    
    const forgottenSongsResults = await Promise.all(
      shuffledForgotten.map(id => subsonic.songs.getSong(id).catch(() => null))
    )

    const validForgottenSongs = forgottenSongsResults.filter((s): s is ISong => s != null && !usedSongIds.has(s.id))

    // Фильтруем по BPM/MOOD профилю (если есть данные)
    const userAvgEnergy = validForgottenSongs.reduce((sum, s) => sum + (s.energy || 0.5), 0) / validForgottenSongs.length
    const userAvgBPM = validForgottenSongs.reduce((sum, s) => sum + (s.bpm || 100), 0) / validForgottenSongs.length

    const energyMin = Math.max(0, userAvgEnergy - 0.3)
    const energyMax = Math.min(1, userAvgEnergy + 0.3)
    const bpmMin = userAvgBPM * 0.7
    const bpmMax = userAvgBPM * 1.3

    const filteredForgotten = validForgottenSongs.filter(s => {
      const energyOk = !s.energy || (s.energy >= energyMin && s.energy <= energyMax)
      const bpmOk = !s.bpm || s.bpm === 0 || (s.bpm >= bpmMin && s.bpm <= bpmMax)
      return energyOk && bpmOk
    })

    console.log(`[DailyMix] 🕰️ Filtered to ${filteredForgotten.length} forgotten tracks (energy: ${energyMin.toFixed(2)}-${energyMax.toFixed(2)}, BPM: ${bpmMin.toFixed(0)}-${bpmMax.toFixed(0)})`)

    for (const song of filteredForgotten.slice(0, forgottenCount)) {
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[DailyMix] 🕰️ FORGOTTEN: Added ${songs.length} tracks`)

  // ============================================
  // 2. VIBE SIMILARITY К "ЗАБЫТЫМ" (10%)
  // ============================================
  if (songs.length > 0 && vibeSimilarCount > 0) {
    console.log(`[DailyMix] 🎵 VIBE SIMILAR: Finding ${vibeSimilarCount} tracks similar to forgotten...`)
    const { findSimilarTracks } = await import('./vibe-similarity')

    const seedTracks = songs.slice(0, 3)
    const allSongs = await getRandomSongs(300)

    for (const seed of seedTracks) {
      if (songs.length >= forgottenCount + vibeSimilarCount) break

      const similar = findSimilarTracks(seed, allSongs, 10, 0.65)
      for (const track of similar) {
        if (songs.length >= forgottenCount + vibeSimilarCount) break
        if (track?.genre && !usedSongIds.has(track.id)) {
          songs.push(track)
          usedSongIds.add(track.id)
        }
      }
    }

    console.log(`[DailyMix] 🎵 VIBE SIMILAR: Total now ${songs.length} tracks`)
  }

  // ============================================
  // 3. НОВИНКИ (40%): Новые релизы артистов + жанров
  // ============================================
  const noveltyCount = limit - songs.length
  const artistNewCount = Math.floor(noveltyCount * 0.50)  // 20% от общего = 50% новинок
  const genreNewCount = noveltyCount - artistNewCount
  
  console.log(`[DailyMix] 🆕 NOVELTY: Adding ${noveltyCount} new tracks (${artistNewCount} artist + ${genreNewCount} genre)`)

  // 3a. Новые релизы любимых артистов
  if (artistNewCount > 0) {
    const topArtists = Object.entries(preferredArtists || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id)

    console.log(`[DailyMix] 🆕 ARTIST NOVELTY: Checking ${topArtists.length} top artists for new releases...`)

    for (const artistId of topArtists) {
      if (songs.length >= limit) break

      try {
        const artist = await subsonic.artists.getOne(artistId)
        if (artist?.name) {
          // Получаем треки артиста и фильтруем по дате
          const artistSongs = await getTopSongs(artist.name, 20)
          
          const recentSongs = artistSongs.filter(s => {
            if (usedSongIds.has(s.id)) return false
            
            // Проверяем год выпуска
            const year = s.year || 0
            const created = s.created ? new Date(s.created).getTime() : 0
            const ninetyDaysAgoYear = new Date().getFullYear() - 1  // Приблизительно 90 дней
            
            return year >= ninetyDaysAgoYear || created > ninetyDaysAgo
          })

          for (const song of recentSongs.slice(0, 3)) {
            if (songs.length >= limit) break
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      } catch (error) {
        console.warn(`[DailyMix] Failed to get new releases for artist ${artistId}:`, error)
      }
    }
  }

  console.log(`[DailyMix] 🆕 ARTIST NOVELTY: Total now ${songs.length} tracks`)

  // 3b. Новые треки в любимых жанрах
  if (genreNewCount > 0) {
    const allGenreEntries = Object.entries(preferredGenres || {})
    const realGenres = allGenreEntries.filter(([genre]) => {
      const isRealGenre = genre.length <= 15 && !/[0-9]/.test(genre) && genre === genre.toLowerCase()
      return isRealGenre
    })

    const topGenres = realGenres.length > 0
      ? realGenres.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre]) => genre)
      : ['rock', 'pop', 'electronic', 'indie', 'alternative']

    console.log(`[DailyMix] 🆕 GENRE NOVELTY: From genres: ${topGenres.join(', ')}`)

    for (const genre of topGenres) {
      if (songs.length >= limit) break

      const songsByGenre = await getSongsByGenre(genre, 15)
      
      // Фильтруем недавно добавленные/созданные треки
      const recentInGenre = songsByGenre.filter(s => {
        if (usedSongIds.has(s.id)) return false
        
        const created = s.created ? new Date(s.created).getTime() : 0
        const year = s.year || 0
        const ninetyDaysAgoYear = new Date().getFullYear() - 1
        
        return created > ninetyDaysAgo || year >= ninetyDaysAgoYear
      })

      const shuffled = recentInGenre.length > 0 
        ? recentInGenre.sort(() => Math.random() - 0.5) 
        : songsByGenre.filter(s => !usedSongIds.has(s.id)).sort(() => Math.random() - 0.5)

      for (const song of shuffled.slice(0, 3)) {
        if (songs.length >= limit) break
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[DailyMix] 🆕 NOVELTY: Total now ${songs.length} tracks`)

  // ============================================
  // 4. FALLBACK: Если всё ещё мало треков
  // ============================================
  if (songs.length < limit) {
    console.log(`[DailyMix] ⚠️ Only ${songs.length} tracks, adding random fallback...`)
    const randomSongs = await getRandomSongs(50)

    for (const song of randomSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[DailyMix] ===== END: ${songs.length} tracks =====`)

  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // ============================================
  // 5. ОРКЕСТРАТОР: Плавные переходы energetic → calm
  // ============================================
  console.log('[DailyMix] 🎼 ORCHESTRATOR: Creating energy wave...')

  const { orchestratePlaylist } = await import('./playlist-orchestrator')
  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
    excludedSongIds: new Set(),
    bannedArtists,
  })

  console.log(`[DailyMix] ✅ Generated ${orchestratedSongs.length} tracks`)

  return {
    playlist: {
      songs: orchestratedSongs,
      source: 'daily-mix',
    },
    metadata: {
      id: `daily-mix-${now.toISOString().split('T')[0]}`,
      type: 'daily-mix',
      name: 'Ежедневный микс',
      description: `Персональный микс на ${now.toLocaleDateString('ru-RU')}`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}


  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[DailyMix] Excluding ${recentUsedIds.size} recently played tracks`)

  // ИСКЛЮЧАЕМ ВСЕ прослушанные треки (не только из последних плейлистов!)
  const allPlayedIds = Object.entries(ratings)
    .filter(([_, rating]) => rating.playCount && rating.playCount > 0)
    .map(([id]) => id)
  allPlayedIds.forEach(id => usedSongIds.add(id))
  console.log(`[DailyMix] Excluding ${allPlayedIds.length} played tracks from ratings`)
  console.log(`[DailyMix] Total usedSongIds: ${usedSongIds.size}`)

  // ============================================
  // 1. VIBE SIMILARITY: 50% плейлиста (знакомое + похожее)
  // ============================================
  let vibeTracksAdded = 0
  const maxVibeTracks = Math.floor(limit * 0.5) // 50% плейлиста

  if (likedSongIds.length > 0) {
    console.log('[DailyMix] 🎵 VIBE SIMILARITY: Loading seed tracks...')
    
    // Берем 5-7 случайных лайкнутых треков как seed
    const shuffledLiked = [...likedSongIds].sort(() => Math.random() - 0.5)
    const likedSongsResults = await Promise.all(
      shuffledLiked.slice(0, 7).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    const validLikedSongs = likedSongsResults.filter((song): song is ISong =>
      song != null && song.genre != null && song.genre !== ''
    )

    if (validLikedSongs.length > 0) {
      console.log(`[DailyMix] 🎵 VIBE SIMILARITY: Found ${validLikedSongs.length} seed tracks`)
      
      // Загружаем все треки для анализа
      const allSongs = await getRandomSongs(200)
      
      // Для каждого seed находим похожие треки
      const seedTracks = validLikedSongs.slice(0, 5)
      const vibeUsedIds = new Set<string>()
      
      for (const seed of seedTracks) {
        if (vibeTracksAdded >= maxVibeTracks) break
        
        const similar = findSimilarTracks(seed, allSongs, 5, 0.65)
        similar.forEach((track: ISong) => {
          if (track?.genre && !vibeUsedIds.has(track.id) && !usedSongIds.has(track.id) && vibeTracksAdded < maxVibeTracks) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
            vibeTracksAdded++
          }
        })
      }
      
      console.log(`[DailyMix] 🎵 VIBE SIMILARITY: Found ${vibeTracksAdded} tracks`)
    }
  }

  // ============================================
  // 2. НОВОЕ (Novelty): 20% плейлиста (открытия)
  // ============================================
  const noveltyCount = Math.floor(limit * 0.2)
  
  // ФИЛЬТРУЕМ: Берём только настоящие жанры, НЕ artist IDs
  const allGenreEntries = Object.entries(preferredGenres || {})
  const realGenres = allGenreEntries.filter(([genre]) => {
    // Настоящие жанры: короткие слова без цифр
    const isArtistId = genre.length > 15
    const hasNumbers = /[0-9]/.test(genre)
    const hasUpperCase = /[A-Z]/.test(genre) // Navidrome artist IDs обычно с заглавными
    
    // Настоящий жанр: короткий, без цифр, обычно lowercase
    const isRealGenre = genre.length <= 15 && !hasNumbers && genre === genre.toLowerCase()
    
    return isRealGenre && !isArtistId
  })
  
  const topGenres = realGenres.length > 0
    ? realGenres
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => genre)
    : ['rock', 'pop', 'electronic', 'indie', 'alternative'] // Fallback

  console.log(`[DailyMix] 🔍 NOVELTY: Adding ${noveltyCount} discovery tracks from genres: ${topGenres.join(', ')}`)
  console.log(`[DailyMix] 📊 Filtered genres from ${allGenreEntries.length} to ${realGenres.length} real genres`)

  for (const genre of topGenres) {
    if (songs.length >= limit * 0.7) break // 70% уже набрано

    const songsByGenre = await getSongsByGenre(genre, 10)
    // Берем треки которые НЕ в лайкнутых (новое!)
    const novelSongs = songsByGenre.filter(s =>
      !usedSongIds.has(s.id) && !likedSongIds.includes(s.id)
    )

    const shuffled = novelSongs.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 3)) {
      if (songs.length >= limit * 0.7) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  // ============================================
  // 3. Знакомые треки (якоря): 30% плейлиста
  // ============================================
  const anchorCount = Math.floor(limit * 0.3)
  if (likedSongIds.length > 0 && songs.length < limit) {
    console.log(`[DailyMix] ❤️ ANCHORS: Adding ${anchorCount} familiar tracks...`)
    
    const remainingLiked = likedSongIds.filter(id => !usedSongIds.has(id))
    const moreLikedSongs = await Promise.all(
      remainingLiked.slice(0, 15).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    moreLikedSongs.forEach(song => {
      if (song && !usedSongIds.has(song.id) && songs.length < limit * 0.7) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 часа

  // ============================================
  // ФИНАЛЬНАЯ ПРОВЕРКА: исключение лайкнутых и прослушанных
  // ============================================
  const likedInPlaylist = songs.filter(s => likedSongIds.includes(s.id))
  const playedInPlaylist = songs.filter(s => ratings[s.id]?.playCount > 0)
  
  if (likedInPlaylist.length > 0) {
    console.error(`[DailyMix] ⚠️ FOUND ${likedInPlaylist.length} LIKED tracks in playlist!`)
    likedInPlaylist.forEach(s => console.error(`  - ${s.title} by ${s.artist}`))
  } else {
    console.log(`[DailyMix] ✅ No liked tracks in playlist`)
  }
  
  if (playedInPlaylist.length > 0) {
    console.error(`[DailyMix] ⚠️ FOUND ${playedInPlaylist.length} PLAYED tracks in playlist!`)
    playedInPlaylist.forEach(s => console.error(`  - ${s.title} by ${s.artist} (played ${ratings[s.id]?.playCount}x)`))
  } else {
    console.log(`[DailyMix] ✅ No played tracks in playlist`)
  }
  
  console.log(`[DailyMix] ===== END: ${songs.length} tracks =====`)

  // ============================================
  // 4. ОРКЕСТРАТОР: Energy Wave + плавные переходы
  // ============================================
  console.log('[DailyMix] 🎼 ORCHESTRATOR: Creating energy wave...')
  
  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'calm',      // Начинаем спокойно
    endWith: 'calm',        // Заканчиваем спокойно
    excludedSongIds: dislikedSongIds,
    bannedArtists,          // ← Добавлено!
  })
  
  // Создаём "волну" энергии: спокойно → пик → спокойно
  const finalSongs = createEnergyWave(orchestratedSongs).slice(0, limit)

  // Логирование energy прогрессии
  console.log('[DailyMix] Energy progression (first 10 tracks):')
  finalSongs.slice(0, 10).forEach((song, i) => {
    const features = analyzeTrack(song)
    console.log(`  ${i+1}. ${song.title} - Energy: ${features.energy.toFixed(2)}, BPM: ${features.bpm}`)
  })

  console.log(`[DailyMix] ✅ Generated ${finalSongs.length} tracks`)

  return {
    playlist: {
      songs: finalSongs,
      source: 'mixed',
    },
    metadata: {
      id: `daily-mix-${now.toISOString().split('T')[0]}`,
      type: 'daily-mix',
      name: 'Ежедневный микс',
      description: `Персональный микс на ${now.toLocaleDateString('ru-RU')}`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}

/**
 * Генерация "Открытия недели" - новые треки на основе предпочтений
 * ФОРМУЛА: 60% похожее на лайки (Vibe) + 40% новое (Novelty)
 */
export async function generateDiscoverWeekly(
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  limit: number = 20
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  console.log(`[DiscoverWeekly] ===== START: Generating ${limit} tracks =====`)
  console.log(`[DiscoverWeekly] Liked songs: ${likedSongIds.length}, Genres: ${Object.keys(preferredGenres).length}`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>(likedSongIds)  // ИСКЛЮЧАЕМ лайкнутые!

  // Получаем banned artists
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[DiscoverWeekly] 🚫 Excluding ${recentUsedIds.size} recently played tracks`)

  const now = new Date()

  // ============================================
  // 0. АНАЛИЗ АУДИО-ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
  // ============================================
  console.log(`[DiscoverWeekly] 🎵 Building user audio profile...`)
  const { analyzeTrack, findSimilarTracks } = await import('./vibe-similarity')

  let userAvgEnergy = 0.5
  let userAvgBPM = 100
  const userMoodCounts: Record<string, number> = {}

  if (likedSongIds.length > 0) {
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 50).map(id => subsonic.songs.getSong(id).catch(() => null))
    )

    const validLikedSongs = likedSongsResults.filter((s): s is ISong => s != null)

    if (validLikedSongs.length > 0) {
      let totalEnergy = 0, totalBPM = 0, countEnergy = 0, countBPM = 0

      validLikedSongs.forEach(song => {
        if (song.energy) { totalEnergy += song.energy; countEnergy++ }
        if (song.bpm) { totalBPM += song.bpm; countBPM++ }
        if (song.moods) {
          song.moods.forEach(mood => {
            const m = mood.toUpperCase()
            userMoodCounts[m] = (userMoodCounts[m] || 0) + 1
          })
        }
      })

      userAvgEnergy = countEnergy > 0 ? totalEnergy / countEnergy : 0.5
      userAvgBPM = countBPM > 0 ? totalBPM / countBPM : 100
    }
  }

  const userTopMoods = Object.entries(userMoodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mood]) => mood)

  console.log(`[DiscoverWeekly] 🎵 User Profile: Energy=${userAvgEnergy.toFixed(2)}, BPM=${userAvgBPM.toFixed(0)}, Top Moods=${userTopMoods.join(', ')}`)

  // ============================================
  // 1. СОСЕДНИЕ ЖАНРЫ (NICHE) - 70%
  // ============================================
  const nicheCount = Math.floor(limit * 0.70)
  console.log(`[DiscoverWeekly] 🎼 NICHE: Finding ${nicheCount} tracks from similar genres...`)

  // Мапа соседних жанров
  const similarGenreMap: Record<string, string[]> = {
    'rock': ['post-rock', 'shoegaze', 'math rock', 'indie rock', 'alternative', 'grunge'],
    'pop': ['synthpop', 'dream pop', 'indie pop', 'electropop', 'chamber pop'],
    'electronic': ['ambient', 'IDM', 'glitch', 'downtempo', 'trip-hop', 'house'],
    'hip-hop': ['lo-fi hip hop', 'boom bap', 'jazz rap', 'conscious hip hop', 'trap'],
    'jazz': ['smooth jazz', 'bebop', 'fusion', 'acid jazz', 'free jazz'],
    'classical': ['neoclassical', 'contemporary classical', 'romantic', 'baroque'],
    'metal': ['progressive metal', 'post-metal', 'black metal', 'doom metal'],
    'folk': ['indie folk', 'folk rock', 'americana', 'celtic'],
    'r&b': ['neo soul', 'contemporary r&b', 'funk', 'motown'],
    'indie': ['indie rock', 'indie pop', 'shoegaze', 'post-punk'],
  }

  // Находим соседние жанры
  const userGenres = new Set(Object.keys(preferredGenres))
  const nicheGenres = new Set<string>()

  for (const genre of userGenres) {
    const similar = similarGenreMap[genre.toLowerCase()] || []
    similar.forEach(g => {
      if (!userGenres.has(g)) {
        nicheGenres.add(g)
      }
    })
  }

  const nicheGenresArray = Array.from(nicheGenres)
  console.log(`[DiscoverWeekly] 🎼 Niche genres: ${nicheGenresArray.slice(0, 10).join(', ')}`)

  // Фильтр по MOOD/E
  const energyMin = Math.max(0, userAvgEnergy - 0.3)
  const energyMax = Math.min(1, userAvgEnergy + 0.3)
  const bpmMin = userAvgBPM * 0.7
  const bpmMax = userAvgBPM * 1.3

  const matchesUserProfile = (song: ISong): boolean => {
    // Energy фильтр
    if (song.energy && (song.energy < energyMin || song.energy > energyMax)) return false
    
    // BPM фильтр
    if (song.bpm && song.bpm > 0 && (song.bpm < bpmMin || song.bpm > bpmMax)) return false
    
    // MOOD фильтр (50% шанс если нет совпадения)
    if (song.moods && song.moods.length > 0 && userTopMoods.length > 0) {
      const hasMatchingMood = song.moods.some(m => userTopMoods.includes(m.toUpperCase()))
      if (!hasMatchingMood && Math.random() > 0.5) return false
    }
    
    return true
  }

  // Собираем треки из соседних жанров
  for (const genre of nicheGenresArray) {
    if (songs.length >= nicheCount) break

    const songsByGenre = await getSongsByGenre(genre, 20)
    
    // Фильтруем: НЕ лайкнутые, низкая известность, MOOD/E совпадение
    const nicheTracks = songsByGenre.filter(s => {
      if (usedSongIds.has(s.id)) return false
      if (bannedArtists.includes(s.artistId || '')) return false
      
      // Низкая известность: playCount < 1000 ИЛИ не последний год
      const isNotPopular = (s.playCount || 0) < 1000
      const isOlder = !s.year || s.year < now.getFullYear() - 1
      
      return (isNotPopular || isOlder) && matchesUserProfile(s)
    })

    const shuffled = nicheTracks.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 5)) {
      if (songs.length >= nicheCount) break
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  console.log(`[DiscoverWeekly] 🎼 NICHE: Added ${songs.length} tracks`)

  // ============================================
  // 2. VIBE SIMILARITY К НИШЕВЫМ (10%)
  // ============================================
  const vibeCount = Math.floor(limit * 0.10)
  
  if (songs.length > 0 && vibeCount > 0) {
    console.log(`[DiscoverWeekly] 🎵 VIBE: Finding ${vibeCount} tracks similar to niche...`)
    
    const seedTracks = songs.slice(0, 3)
    const allSongs = await getRandomSongs(300)

    for (const seed of seedTracks) {
      if (songs.length >= nicheCount + vibeCount) break

      const similar = findSimilarTracks(seed, allSongs, 10, 0.65)
      for (const track of similar) {
        if (songs.length >= nicheCount + vibeCount) break
        if (track?.genre && !usedSongIds.has(track.id) && matchesUserProfile(track)) {
          songs.push(track)
          usedSongIds.add(track.id)
        }
      }
    }
  }

  console.log(`[DiscoverWeekly] 🎵 VIBE: Total now ${songs.length} tracks`)

  // ============================================
  // 3. СЮРПРИЗЫ (30%): 1-2 трека из далеких жанров
  // ============================================
  const surpriseCount = Math.min(2, Math.max(1, Math.floor(limit * 0.20)))
  console.log(`[DiscoverWeekly] 🎁 SURPRISE: Adding ${surpriseCount} surprise tracks...`)

  const allPossibleGenres = ['jazz', 'classical', 'world', 'folk', 'reggae', 'blues', 'country', 'soul', 'funk', 'gospel', 'latin', 'celtic']
  const distantGenres = allPossibleGenres.filter(g => !userGenres.has(g) && !nicheGenres.has(g))
  
  if (distantGenres.length > 0) {
    const surpriseGenres = distantGenres.sort(() => Math.random() - 0.5).slice(0, surpriseCount)
    console.log(`[DiscoverWeekly] 🎁 Surprise genres: ${surpriseGenres.join(', ')}`)

    for (const genre of surpriseGenres) {
      if (songs.length >= limit) break

      const songsByGenre = await getSongsByGenre(genre, 10)
      
      // Фильтруем по MOOD/E (строже для сюрпризов)
      const surpriseTracks = songsByGenre.filter(s => {
        if (usedSongIds.has(s.id)) return false
        if (bannedArtists.includes(s.artistId || '')) return false
        
        // Строгий MOOD/E фильтр для сюрпризов
        const energyOk = !s.energy || (s.energy >= energyMin && s.energy <= energyMax)
        const bpmOk = !s.bpm || s.bpm === 0 || (s.bpm >= bpmMin * 0.9 && s.bpm <= bpmMax * 1.1)
        
        return energyOk && bpmOk
      })

      if (surpriseTracks.length > 0) {
        const song = surpriseTracks[Math.floor(Math.random() * surpriseTracks.length)]
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[DiscoverWeekly] 🎁 SURPRISE: Total now ${songs.length} tracks`)

  // ============================================
  // 4. FALLBACK: Если мало треков
  // ============================================
  if (songs.length < limit) {
    console.log(`[DiscoverWeekly] ⚠️ Only ${songs.length} tracks, adding fallback...`)
    
    // Добавляем еще из нишевых жанров
    for (const genre of nicheGenresArray) {
      if (songs.length >= limit) break
      
      const songsByGenre = await getSongsByGenre(genre, 10)
      const fallbackTracks = songsByGenre.filter(s => !usedSongIds.has(s.id) && matchesUserProfile(s))
      
      for (const song of fallbackTracks.sort(() => Math.random() - 0.5).slice(0, 3)) {
        if (songs.length >= limit) break
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[DiscoverWeekly] ===== END: ${songs.length} tracks =====`)

  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)  // 7 дней

  // ============================================
  // 5. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[DiscoverWeekly] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  const { orchestratePlaylist } = await import('./playlist-orchestrator')
  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
    excludedSongIds: new Set(),
    bannedArtists,
  })

  console.log(`[DiscoverWeekly] ✅ Generated ${orchestratedSongs.length} tracks`)

  return {
    playlist: {
      songs: orchestratedSongs,
      source: 'discover-weekly',
    },
    metadata: {
      id: `discover-weekly-${now.toISOString().split('T')[0]}`,
      type: 'discover-weekly',
      name: 'Открытия недели',
      description: `Новые артисты и нишевые треки на ${now.toLocaleDateString('ru-RU')}`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}

/**
 * Генерация радио трека (Instant Mix)
 * Использует getSimilarSongs из Subsonic API + Vibe Similarity + Оркестратор
 */
/**
 * Генерация радио артиста (HYBRID: Last.fm + ML Fallback)
 * 
 * Приоритеты:
 * 1. Last.fm (похожие артисты + их топ треки)
 * 2. ML Fallback (оркестратор + vibe similarity) если Last.fm недоступен
 */
/**
 * Проверка новизны трека (Яндекс-подход)
 * 
 * @param songId - ID трека
 * @param recentSongIds - ID треков сыгранных недавно (последние 20)
 * @param artistHistory - Артисты сыгранные недавно (последние 5)
 * @returns Novelty multiplier (0.0 - 1.0)
 */
export function calculateNoveltyMultiplier(
  songId: string,
  recentSongIds: string[] = [],
  artistHistory: string[] = []
): number {
  const mlState = useMLStore.getState()
  const rating = mlState.ratings[songId]
  
  let multiplier = 1.0
  
  // 1. Трек недавно играл (последние 20 треков)
  if (recentSongIds.includes(songId)) {
    multiplier *= 0.3 // Сильно понижаем
    console.log('[Novelty] Track played recently:', songId)
  }
  
  // 2. Трек играл сегодня много раз
  if (rating?.playsToday && rating.playsToday >= 3) {
    multiplier *= 0.5 // Понижаем
    console.log('[Novelty] Track played', rating.playsToday, 'times today')
  }
  
  // 3. Артист играл недавно (последние 5 треков)
  if (rating?.songInfo?.artistId && artistHistory.includes(rating.songInfo.artistId)) {
    multiplier *= 0.6 // Понижаем чтобы не было 2 трека одного артиста подряд
    console.log('[Novelty] Artist played recently:', rating.songInfo.artist)
  }
  
  // 4. Novelty score из профиля
  if (rating?.noveltyScore) {
    multiplier *= (0.5 + rating.noveltyScore * 0.5) // 0.5 - 1.0
  }

  return Math.max(0.1, multiplier) // Минимум 0.1
}

/**
 * РАДИО ПО АРТИСТУ
 * Алгоритм:
 * 1. Анализ профиля артиста (средние BPM, Energy, Жанры).
 * 2. Поиск треков в тех же жанрах.
 * 3. Расчет artistRadioScore.
 * 4. Чередование: 70% другие артисты, 30% этот артист.
 */
export async function generateArtistRadio(
  artistId: string,
  limit: number = 30
): Promise<MLWavePlaylist> {
  console.log(`[ArtistRadio] ===== START for artist: ${artistId} =====`)

  // 1. Получаем данные об артисте
  let artistName = ''
  try {
    const artistInfo = await subsonic.artists.getOne(artistId)
    artistName = artistInfo?.name || ''
    if (!artistName) throw new Error('Artist not found')
  } catch (e) {
    console.error('[ArtistRadio] Failed to load artist:', e)
    return { songs: [], source: 'artist-radio-error' }
  }

  console.log(`[ArtistRadio] 🎤 Seed Artist: ${artistName}`)

  // Получаем топ треки артиста для анализа профиля
  const artistTopSongs = await getTopSongs(artistName, 10)
  if (artistTopSongs.length === 0) {
    return { songs: [], source: 'artist-radio-empty' }
  }

  const { analyzeTrack, detectMood } = await import('./vibe-similarity')
  
  // Вычисляем средний профиль
  let totalEnergy = 0, totalBPM = 0, countEnergy = 0, countBPM = 0
  const genreCounts: Record<string, number> = {}
  const moodCounts: Record<string, number> = {}

  for (const song of artistTopSongs) {
    if (song.energy !== undefined) { totalEnergy += song.energy; countEnergy++ }
    if (song.bpm) { totalBPM += song.bpm; countBPM++ }
    if (song.genre) genreCounts[song.genre] = (genreCounts[song.genre] || 0) + 1
    
    const mood = detectMood(analyzeTrack(song))
    moodCounts[mood.mood] = (moodCounts[mood.mood] || 0) + 1
  }

  const avgBPM = countBPM > 0 ? totalBPM / countBPM : 100
  const avgEnergy = countEnergy > 0 ? totalEnergy / countEnergy : 0.5
  // Топ жанр
  const topGenre = Object.entries(genreCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || ''
  // Топ настроение
  const topMood = Object.entries(moodCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || ''

  console.log(`[ArtistRadio] 📊 Profile: BPM=${avgBPM.toFixed(0)}, E=${avgEnergy.toFixed(2)}, Genre=${topGenre}, Mood=${topMood}`)

  // 2. Поиск кандидатов
  const candidates: ISong[] = []
  const usedIds = new Set<string>()

  // 2a. Треки из топ-жанра (основа)
  if (topGenre) {
    const genreTracks = await getSongsByGenre(topGenre, 300)
    genreTracks.forEach(t => {
      if (t.artist !== artistName && !usedIds.has(t.id)) {
        candidates.push(t)
        usedIds.add(t.id)
      }
    })
  }
  
  // 2b. Еще треки того же артиста (для чередования 30%)
  const moreArtistTracks = await getTopSongs(artistName, 20)
  moreArtistTracks.forEach(t => {
     if (!usedIds.has(t.id)) {
       // Помечаем как "родной" трек для логики чередования
       (t as any).isSeedArtistTrack = true 
       candidates.push(t)
       usedIds.add(t.id)
     }
  })

  console.log(`[ArtistRadio] 📥 Candidates: ${candidates.length}`)

  // 3. Скоринг
  const scoredCandidates = candidates.map(track => {
    const features = analyzeTrack(track)
    const mood = detectMood(features)
    const isSeedTrack = (track as any).isSeedArtistTrack

    // A. Genre Similarity (0.4)
    const genreScore = (track.genre === topGenre) ? 1.0 : 0.5

    // B. Audio Profile Match (0.3)
    const bpmDiff = Math.abs((track.bpm || 100) - avgBPM)
    const eDiff = Math.abs((track.energy || 0.5) - avgEnergy)
    
    const bpmMatch = Math.max(0, 1 - (bpmDiff / (avgBPM * 0.3)))
    const eMatch = Math.max(0, 1 - (eDiff / 0.3))
    
    const audioScore = (bpmMatch + eMatch) / 2

    // C. Popularity (0.2)
    const popularityScore = Math.min(1, (track.playCount || 0) / 500)

    // D. User Pref (0.1)
    const userPref = 0.5

    // Бонус за "родные" треки артиста
    const seedBonus = isSeedTrack ? 0.2 : 0 

    // Итого
    let totalScore = 
      (0.4 * genreScore) + 
      (0.3 * audioScore) + 
      (0.2 * popularityScore) + 
      (0.1 * userPref) +
      seedBonus

    return { track, score: totalScore, isSeed: isSeedTrack }
  })

  // Сортировка
  scoredCandidates.sort((a, b) => b.score - a.score)

  // 4. Сборка плейлиста с чередованием
  const playlist: ISong[] = []
  const others = scoredCandidates.filter(c => !c.isSeed)
  const seeds = scoredCandidates.filter(c => c.isSeed)
  
  const finalOthers = others.slice(0, Math.floor(limit * 0.75))
  const finalSeeds = seeds.slice(0, Math.ceil(limit * 0.25))

  // Микшируем
  let otherIdx = 0
  let seedIdx = 0
  
  while (playlist.length < limit) {
    if (otherIdx < finalOthers.length) {
      playlist.push(finalOthers[otherIdx].track)
      otherIdx++
    }
    if (playlist.length % 4 === 0 && seedIdx < finalSeeds.length) {
      playlist.push(finalSeeds[seedIdx].track)
      seedIdx++
    }
    if (otherIdx >= finalOthers.length && seedIdx >= finalSeeds.length) break
  }

  console.log(`[ArtistRadio] ✅ Generated ${playlist.length} tracks`)

  return {
    songs: playlist.slice(0, limit),
    source: 'artist-radio',
    name: `📻 Радио: ${artistName}`,
    description: `Похожая музыка и хиты ${artistName}`
  }
}

/**
 * ML Recommendations - попытка угадать что понравится пользователю
  else if (hour >= 18 && hour < 22) contextMode = 'rest'
  else contextMode = 'rest'  // Ночь - отдых

  console.log(`[ML Recommendations] 🎭 Context mode: ${contextMode} (hour: ${hour})`)

  // ============================================
  // 3. АДАПТИВНЫЕ ВЕСА (новое!)
  // ============================================
  const weights = isExperiencedUser
    ? { audio: 0.40, genre: 0.20, artist: 0.10, behavior: 0.20, collab: 0.05, novelty: 0.05 }
    : { audio: 0.20, genre: 0.30, artist: 0.10, behavior: 0.10, collab: 0.25, novelty: 0.05 }

  console.log(`[ML Recommendations] ⚖️ Adaptive weights (${isExperiencedUser ? 'experienced' : 'new'}):`, weights)

  // ============================================
  // 4. SCORING С NOVELTY + DYNAMIC PENALTY + CONTEXT (новое!)
  // ============================================
  console.log(`[ML Recommendations] 🎯 Scoring all candidates...`)

  const { vibeSimilarity } = await import('./vibe-similarity')
  const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgoMs = Date.now() - (7 * 24 * 60 * 60 * 1000)

  // Популярные жанры для novelty weighting
  const popularGenres = new Set(['pop', 'rock', 'hip-hop', 'rap', 'electronic', 'dance', 'r&b'])
  
  // Отслеживаем разнообразие при добавлении
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  const scoredSongs = filteredSongs.map(song => {
    const features = analyzeTrack(song)

    // 1. Audio similarity
    const audioProfileFeatures = {
      energy: userAudioProfile.avgEnergy,
      valence: userAudioProfile.avgValence,
      danceability: userAudioProfile.avgDanceability,
      bpm: userAudioProfile.avgBPM,
      acousticness: userAudioProfile.avgAcousticness
    }
    const audioSimilarity = vibeSimilarity(features, audioProfileFeatures)

    // 2. Genre match
    const genreWeight = preferredGenres[song.genre || ''] || 0
    const maxGenreWeight = Math.max(1, ...Object.values(preferredGenres))
    const genreScore = genreWeight / maxGenreWeight

    // 3. Artist match
    const artistWeight = preferredArtists[song.artistId || ''] || 0
    const maxArtistWeight = Math.max(1, ...Object.values(preferredArtists))
    const artistScore = artistWeight / maxArtistWeight

    // 4. Behavior score
    const behaviorScoreVal = behaviorScores[song.id] || 0
    const normalizedBehavior = Math.max(0, Math.min(1, (behaviorScoreVal + 20) / 40))

    // 5. Collaborative signal
    const collaborativeScore = collaborativeTrackIds.includes(song.id) ? 1.0 : 0.0

    // 6. ✅ CONTEXT-AWARE NOVELTY BONUS (новое!)
    const releaseDate = song.created ? new Date(song.created).getTime() : (song.year ? new Date(song.year, 0, 1).getTime() : 0)
    let baseNovelty = 0.0
    if (releaseDate > sevenDaysAgoMs) baseNovelty = 0.1
    else if (releaseDate > thirtyDaysAgoMs) baseNovelty = 0.05

    // genre_weight: 1.2 для популярных, 0.8 для нишевых
    const genreWeight2 = popularGenres.has(song.genre?.toLowerCase() || '') ? 1.2 : 0.8
    
    // popularity_factor: 1.1 если >10k plays
    const popularityFactor = (song.playCount || 0) > 10000 ? 1.1 : 1.0
    
    const noveltyBonus = baseNovelty * genreWeight2 * popularityFactor

    // 7. ✅ CONTEXT BONUS (новое!)
    let contextBonus = 0.0
    
    if (contextMode === 'work') {
      // Работа: +0.1 к energy 0.3-0.6, -0.1 к energy >0.8
      const energy = song.energy || 0.5
      if (energy >= 0.3 && energy <= 0.6) contextBonus += 0.1
      else if (energy > 0.8) contextBonus -= 0.1
    } else if (contextMode === 'sport') {
      // Спорт: +0.1 к BPM >110, +0.1 к energy >0.7
      const bpm = song.bpm || 0
      const energy = song.energy || 0.5
      if (bpm > 110) contextBonus += 0.1
      if (energy > 0.7) contextBonus += 0.1
    } else if (contextMode === 'rest') {
      // Отдых: +0.1 к mood RELAXED/CALM
      if (song.moods) {
        const hasRelaxedMood = song.moods.some(m => 
          ['RELAXED', 'CALM', 'CHILL', 'PEACEFUL'].includes(m.toUpperCase())
        )
        if (hasRelaxedMood) contextBonus += 0.1
      }
    }

    // Итоговая формула с адаптивными весами + context
    let finalScore =
      weights.audio * audioSimilarity +
      weights.genre * genreScore +
      weights.artist * artistScore +
      weights.behavior * normalizedBehavior +
      weights.collab * collaborativeScore +
      weights.novelty * noveltyBonus +
      contextBonus

    return {
      song,
      finalScore,
      noveltyBonus,
      contextBonus,
      artist: song.artist || 'Unknown',
      genre: song.genre || 'Unknown',
      breakdown: {
        audioSimilarity,
        genreScore,
        artistScore,
        behaviorScore: normalizedBehavior,
        collaborativeScore,
        noveltyBonus,
        contextBonus
      }
    }
  })

  // Сортируем по итоговому score
  scoredSongs.sort((a, b) => b.finalScore - a.finalScore)

  console.log(`[ML Recommendations] 🎯 Top 3 candidates:`, scoredSongs.slice(0, 3).map(s => ({
    title: s.song.title,
    artist: s.song.artist,
    score: s.finalScore.toFixed(2),
    audio: s.breakdown.audioSimilarity.toFixed(2),
    novelty: s.noveltyBonus.toFixed(3),
    context: s.contextBonus.toFixed(2)
  })))

  // ============================================
  // 5. WEIGHTED SELECTION С DYNAMIC PENALTY (новое!)
  // ============================================
  console.log(`[ML Recommendations] 🎵 Selecting top-${limit} tracks with dynamic diversity control...`)

  const noveltyCount = Math.floor(limit * effectiveNoveltyFactor)
  const similarCount = limit - noveltyCount

  let selectedCount = 0

  // Берем топ похожих с ДИНАМИЧЕСКИМИ штрафами
  for (const scored of scoredSongs) {
    if (selectedCount >= similarCount) break

    const artist = scored.artist
    const genre = scored.genre
    const currentArtistCount = artistCounts[artist] || 0
    const currentGenreCount = genreCounts[genre] || 0

    // ✅ DYNAMIC PENALTIES (новое!)
    // -0.05 за 2-го трека артиста, -0.10 за 3-го
    const artistPenalty = currentArtistCount === 1 ? -0.05 : currentArtistCount >= 2 ? -0.10 : 0
    // -0.03 за 2-й трек жанра, -0.07 за 3-й
    const genrePenalty = currentGenreCount === 1 ? -0.03 : currentGenreCount >= 2 ? -0.07 : 0

    const adjustedScore = scored.finalScore + artistPenalty + genrePenalty

    // ✅ Мягкие лимиты вместо жёстких:
    // Пропускаем только если >=3 треков артиста ИЛИ >=4 треков жанра
    if (currentArtistCount >= 3) {
      console.log(`[ML Recommendations] 🚫 Skipping ${artist} - already ${currentArtistCount} tracks`)
      continue
    }
    if (currentGenreCount >= 4) {
      console.log(`[ML Recommendations] 🚫 Skipping genre ${genre} - already ${currentGenreCount} tracks`)
      continue
    }

    // Добавляем трек (даже с штрафом если score высокий)
    if (adjustedScore > 0.3) {  // Минимальный порог
      songs.push(scored.song)
      usedSongIds.add(scored.song.id)
      artistCounts[artist] = currentArtistCount + 1
      genreCounts[genre] = currentGenreCount + 1
      selectedCount++
    }
  }

  // Добавляем новинки
  const noveltyCandidates = scoredSongs
    .filter(s => !usedSongIds.has(s.song.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, noveltyCount)

  for (const scored of noveltyCandidates) {
    const artist = scored.artist
    const genre = scored.genre
    const currentArtistCount = artistCounts[artist] || 0
    const currentGenreCount = genreCounts[genre] || 0

    if (currentArtistCount >= 3 || currentGenreCount >= 4) continue

    songs.push(scored.song)
    usedSongIds.add(scored.song.id)
    artistCounts[artist] = currentArtistCount + 1
    genreCounts[genre] = currentGenreCount + 1
  }

  console.log(`[ML Recommendations] ✅ Selected ${songs.length} tracks (${selectedCount} similar + ${noveltyCandidates.length} novelty)`)
  console.log(`[ML Recommendations] 👥 Artists: ${Object.keys(artistCounts).length} unique, avg ${(songs.length / Object.keys(artistCounts).length).toFixed(1)} tracks`)
  console.log(`[ML Recommendations] 🎼 Genres: ${Object.keys(genreCounts).length} unique`)

  // ============================================
  // 6. ФИНАЛЬНАЯ ПРОВЕРКА
  // ============================================
  const finalPlaylist = songs.slice(0, limit)

  const likedInPlaylist = finalPlaylist.filter(s => likedSongIds.includes(s.id))
  if (likedInPlaylist.length > 0) {
    console.error(`[ML Recommendations] ⚠️ FOUND ${likedInPlaylist.length} LIKED tracks!`)
  } else {
    console.log(`[ML Recommendations] ✅ No liked tracks in playlist`)
  }

  console.log(`[ML Recommendations] ===== END: ${finalPlaylist.length} tracks =====`)

  return {
    songs: finalPlaylist,
    source: 'ml-adaptive-context-scoring',
  }
}

/**
 * Получить похожие жанры для данного жанра
 */
function getSimilarGenres(genre: string): string[] {
  const similarGenreMap: Record<string, string[]> = {
    'rock': ['alternative', 'indie', 'classic rock', 'hard rock'],
    'pop': ['dance pop', 'electropop', 'indie pop'],
    'electronic': ['house', 'techno', 'trance', 'ambient'],
    'hip-hop': ['rap', 'trap', 'conscious hip hop'],
    'jazz': ['blues', 'soul', 'funk'],
    'classical': ['romantic', 'baroque', 'modern classical'],
    'metal': ['hard rock', 'alternative metal', 'nu metal'],
    'indie': ['alternative', 'indie rock', 'indie pop'],
    'alternative': ['grunge', 'indie', 'rock'],
    'r&b': ['soul', 'funk', 'neo soul'],
    'country': ['folk', 'americana', 'bluegrass'],
    'funk': ['soul', 'r&b', 'disco'],
    'disco': ['funk', 'dance', 'house'],
    'ambient': ['electronic', 'new age', 'classical'],
    'blues': ['jazz', 'rock', 'soul'],
    'soul': ['r&b', 'funk', 'jazz'],
  }
  
  const lowerGenre = genre.toLowerCase()
  return similarGenreMap[lowerGenre] || []
}

/**
 * Конфигурация десятилетий
 * Жанры, характерные для каждой эпохи
 */
const DECADE_CONFIG: Record<string, {
  years: [number, number]
  genres: string[]
  anchorTracks?: { artist: string; title: string }[]  // Якорные хиты
  sort: 'chronological' | 'popularity'
}> = {
  '80s': {
    years: [1980, 1989],
    genres: ['synth-pop', 'new-wave', 'disco', 'hard-rock', 'pop', 'rock'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'a-ha', title: 'Take On Me' },
      { artist: 'Depeche Mode', title: 'Personal Jesus' },
    ]
  },
  '90s': {
    years: [1990, 1999],
    genres: ['grunge', 'britpop', 'hip-hop', 'eurodance', 'alternative', 'r&b'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'Nirvana', title: 'Smells Like Teen Spirit' },
      { artist: 'Oasis', title: 'Wonderwall' },
    ]
  },
  '2000s': {
    years: [2000, 2009],
    genres: ['pop-rock', 'r&b', 'electro-house', 'hip-hop', 'pop', 'rock'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'Linkin Park', title: 'In The End' },
      { artist: 'OutKast', title: 'Hey Ya!' },
    ]
  },
  '2010s': {
    years: [2010, 2019],
    genres: ['edm', 'trap', 'indie-pop', 'k-pop', 'pop', 'hip-hop'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'The Weeknd', title: 'Blinding Lights' },
      { artist: 'Dua Lipa', title: 'New Rules' },
    ]
  },
  '2020s': {
    years: [2020, 2029],
    genres: ['modern-pop', 'hyperpop', 'lo-fi', 'pop', 'hip-hop', 'indie'],
    sort: 'chronological',
    anchorTracks: []
  }
}

/**
 * Генерация плейлиста по десятилетиям (улучшенная версия)
 * 
 * Алгоритм:
 * 1. Фильтрация по году + жанрам десятилетия
 * 2. Приоритизация: 0.7*match + 0.3*popularity
 * 3. Добавление якорных треков (хитов)
 * 4. Хронологическая сортировка
 * 5. Контроль разнообразия
 */
export async function generateDecadePlaylist(
  decade: string, // '80s', '90s', '2000s', '2010s', '2020s'
  limit: number = 30
): Promise<MLWavePlaylist> {
  const config = DECADE_CONFIG[decade]
  if (!config) {
    console.error(`[DecadePlaylist] Unknown decade: ${decade}`)
    return { songs: [], source: 'decade' }
  }

  const [startYear, endYear] = config.years
  console.log(`[DecadePlaylist] Generating for ${decade} (${startYear}-${endYear})`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  // ============================================
  // 1. ЯКОРНЫЕ ТРЕКИ (Хиты десятилетия)
  // ============================================
  console.log(`[DecadePlaylist] 🎯 Adding anchor tracks...`)
  
  for (const anchor of config.anchorTracks || []) {
    try {
      // Ищем трек по артисту и названию
      const searchResult = await subsonic.search2({
        query: `${anchor.artist} ${anchor.title}`,
        songCount: 1,
        albumCount: 0,
        artistCount: 0
      })

      const track = searchResult?.song?.[0]
      if (track && !usedSongIds.has(track.id)) {
        const year = parseInt(track.year?.toString() || '0')
        if (year >= startYear && year <= endYear) {
          songs.push(track)
          usedSongIds.add(track.id)
          artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 1
          console.log(`[DecadePlaylist] ✅ Anchor: ${anchor.artist} - ${anchor.title}`)
        }
      }
    } catch (e) {
      console.warn(`[DecadePlaylist] Failed to find anchor: ${anchor.artist} - ${anchor.title}`)
    }
  }

  // ============================================
  // 2. ПОЛУЧЕНИЕ КАНДИДАТОВ (Случайные + Жанры)
  // ============================================
  const candidates: { track: ISong; matchScore: number; popularity: number }[] = []

  // 2a. Случайные треки с фильтрацией по году
  const randomTracks = await getRandomSongs(500)
  for (const track of randomTracks) {
    const year = parseInt(track.year?.toString() || '0')
    if (year < startYear || year > endYear) continue
    if (usedSongIds.has(track.id)) continue

    // Проверка жанра (мягкая - если есть)
    const genreMatch = track.genre && config.genres.some(g => 
      track.genre?.toLowerCase().includes(g.toLowerCase())
    )

    candidates.push({
      track,
      matchScore: genreMatch ? 0.9 : 0.7,  // 0.9 если жанр совпадает, 0.7 если только год
      popularity: track.playCount || 0
    })
  }

  // 2b. Треки из жанров десятилетия
  for (const genre of config.genres) {
    const genreTracks = await getSongsByGenre(genre, 50)
    for (const track of genreTracks) {
      const year = parseInt(track.year?.toString() || '0')
      if (year < startYear || year > endYear) continue
      if (usedSongIds.has(track.id)) continue
      if (candidates.find(c => c.track.id === track.id)) continue

      candidates.push({
        track,
        matchScore: 1.0,  // Точное совпадение жанра
        popularity: track.playCount || 0
      })
    }
  }

  // ============================================
  // 3. ПРИОРИТИЗАЦИЯ (0.7*match + 0.3*popularity)
  // ============================================
  const maxPopularity = Math.max(1, ...candidates.map(c => c.popularity))

  const scoredCandidates = candidates.map(c => ({
    ...c,
    priority: (0.7 * c.matchScore) + (0.3 * (c.popularity / maxPopularity))
  }))

  // Сортировка по приоритету
  scoredCandidates.sort((a, b) => b.priority - a.priority)

  // ============================================
  // 4. ОТБОР ТРЕКОВ С ШТРАФАМИ ЗА ПОВТОРЫ
  // ============================================
  for (const { track } of scoredCandidates) {
    if (songs.length >= limit) break

    const artist = track.artist || ''
    const genre = track.genre || ''
    const aCount = artistCounts[artist] || 0
    const gCount = genreCounts[genre] || 0

    // Штрафы за повторяемость
    if (aCount >= 2) continue  // Макс 2 трека артиста
    if (gCount >= 4) continue  // Макс 4 трека жанра

    songs.push(track)
    usedSongIds.add(track.id)
    artistCounts[artist] = aCount + 1
    genreCounts[genre] = gCount + 1
  }

  // ============================================
  // 5. FALLBACK (если мало треков)
  // ============================================
  if (songs.length < limit) {
    console.warn(`[DecadePlaylist] Only ${songs.length} tracks. Adding relaxed fallback...`)
    
    const remaining = scoredCandidates.filter(c => !usedSongIds.has(c.track.id))
    for (const { track } of remaining) {
      if (songs.length >= limit) break
      // Без штрафов - просто заполняем
      songs.push(track)
      usedSongIds.add(track.id)
    }
  }

  // ============================================
  // 6. СОРТИРОВКА (Хронологическая)
  // ============================================
  console.log(`[DecadePlaylist] 📅 Sorting: ${config.sort}...`)

  if (config.sort === 'chronological') {
    // Сортировка по году (от раннего к позднему)
    songs.sort((a, b) => {
      const yearA = parseInt(a.year?.toString() || '0')
      const yearB = parseInt(b.year?.toString() || '0')
      
      if (yearA !== yearB) return yearA - yearB
      
      // Внутри одного года - по популярности
      return (b.playCount || 0) - (a.playCount || 0)
    })
  } else {
    // Сортировка по популярности
    songs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
  }

  console.log(`[DecadePlaylist] ✅ Generated ${songs.length} tracks for ${decade}`)
  console.log(`[DecadePlaylist] 🎤 Artists: ${Object.keys(artistCounts).length}, Genres: ${Object.keys(genreCounts).length}`)

  // Логирование первых треков
  songs.slice(0, 5).forEach((s, i) => {
    console.log(`  ${i+1}. ${s.artist} - ${s.title} (${s.year}) [${s.genre}]`)
  })

  return {
    songs: songs.slice(0, limit),
    source: 'decade',
    name: `${decade} Хиты`,
    description: `Лучшие треки ${decade.replace('s', '-x')}`
  }
}

/**
 * Генерация плейлиста по жанру
 * С Vibe Similarity + Оркестратором
 */
export async function generateGenrePlaylist(
  genre: string,
  limit: number = 30
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  try {
    const songsByGenre = await getSongsByGenre(genre, limit * 2)

    // ============================================
    // VIBE SIMILARITY: Ищем похожие треки внутри жанра
    // ============================================
    if (songsByGenre.length > 5) {
      // Берем первые 3 трека как seed
      const seedTracks = songsByGenre.slice(0, 3)
      const allSongs = await getRandomSongs(100)
      const vibeUsedIds = new Set<string>()
      
      console.log(`[GenrePlaylist] 🎵 VIBE SIMILARITY: Finding similar tracks for "${genre}"...`)
      
      for (const seed of seedTracks) {
        const similar = findSimilarTracks(seed, allSongs, 10, 0.65)
        similar.forEach((track: ISong) => {
          if (!vibeUsedIds.has(track.id) && !usedSongIds.has(track.id)) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
          }
        })
      }
    }

    // Добавляем оригинальные треки жанра
    for (const song of songsByGenre) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }

    // ============================================
    // ОРКЕСТРАТОР: Плавные переходы
    // ============================================
    console.log(`[GenrePlaylist] 🎼 ORCHESTRATOR: Creating smooth transitions for "${genre}"...`)
    
    const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
      startWith: 'energetic',
      endWith: 'calm',
    })

    return {
      songs: orchestrated,
      source: 'genre',
    }
  } catch (error) {
    console.error('Failed to generate genre playlist:', error)
    const randomSongs = await getRandomSongs(limit)
    return {
      songs: randomSongs,
      source: 'mixed',
    }
  }
}

/**
 * Проверка и автообновление плейлиста
 */
export async function checkAndUpdatePlaylist(
  type: 'daily-mix' | 'discover-weekly',
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  lastGenerated?: string,
  updateIntervalHours: number = 24
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata; updated: boolean } | null> {
  // Если нет последней генерации или прошло достаточно времени
  if (!lastGenerated) {
    // Первая генерация
    const result = type === 'daily-mix'
      ? await generateDailyMix(likedSongIds, preferredGenres)
      : await generateDiscoverWeekly(likedSongIds, preferredGenres)
    
    return { ...result, updated: true }
  }

  const last = new Date(lastGenerated)
  const now = new Date()
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  if (hoursSince >= updateIntervalHours) {
    // Пора обновлять
    const result = type === 'daily-mix'
      ? await generateDailyMix(likedSongIds, preferredGenres)
      : await generateDiscoverWeekly(likedSongIds, preferredGenres)
    
    return { ...result, updated: true }
  }

  // Ещё рано обновлять
  return null
}

/**
 * Генерация плейлистов по времени суток
 */

export interface TimeOfDayMix {
  songs: ISong[]
  timeOfDay: 'morning' | 'day' | 'evening' | 'night'
  name: string
  description: string
}

/**
 * Получить текущее время суток (или указанное)
 */
function getTimeOfDay(hour?: number): 'morning' | 'day' | 'evening' | 'night' {
  const h = hour ?? new Date().getHours()

  if (h >= 6 && h < 11) return 'morning'    // 6:00 - 11:00
  if (h >= 11 && h < 17) return 'day'       // 11:00 - 17:00
  if (h >= 17 && h < 22) return 'evening'   // 17:00 - 22:00
  return 'night'                             // 22:00 - 6:00
}

/**
 * Конфигурация энергии по времени суток
 */
const TIME_ENERGY_CURVE: Record<string, {
  start: number
  end: number
  curve: 'ascending' | 'descending' | 'peak' | 'flat'
  genres: string[]
  bpmMin: number
  bpmMax: number
  mood?: string[]  // Допустимые настроения
  name: string
  description: string
}> = {
  morning: {
    start: 0.6,
    end: 0.8,
    curve: 'ascending',
    genres: ['pop', 'synth-pop', 'house', 'deep house', 'tropical house', 'indie pop', 'funk', 'disco', 'acoustic pop'],
    bpmMin: 100,
    bpmMax: 125,
    mood: ['UPLIFTING', 'ENERGETIC', 'WARM', 'HAPPY', 'BRIGHT'],  // ✅ Добавлено
    name: '☀️ Утренний микс',
    description: 'Бодрые треки для продуктивного начала дня'
  },
  day: {
    start: 0.3,
    end: 0.5,
    curve: 'flat',
    genres: ['lo-fi', 'chillwave', 'chillout', 'indie rock', 'smooth jazz', 'bossa nova', 'instrumental', 'ambient piano', 'acoustic folk', 'neoclassical'],
    bpmMin: 80,
    bpmMax: 100,
    mood: ['FOCUSED', 'NEUTRAL', 'CALM', 'RELAXED'],  // ✅ Добавлено
    name: '🌤 Дневной микс',
    description: 'Фоновая музыка для работы и концентрации'
  },
  evening: {
    start: 0.4,
    end: 0.2,
    curve: 'descending',
    genres: ['r&b', 'neo soul', 'downtempo', 'trip-hop', 'ambient house', 'lounge', 'nu jazz', 'soft rock', 'adult contemporary', 'acoustic'],
    bpmMin: 70,
    bpmMax: 95,
    mood: ['RELAXED', 'CHILL', 'WARM', 'ROMANTIC', 'CALM'],  // ✅ Добавлено
    name: '🌅 Вечерний микс',
    description: 'Расслабленные треки для уютного вечера'
  },
  night: {
    start: 0.2,
    end: 0.0,
    curve: 'flat',
    genres: ['ambient', 'drone', 'lo-fi', 'classical', 'minimal', 'sleep', 'nature sounds', 'piano', 'lullaby'],
    bpmMin: 60,
    bpmMax: 80,
    mood: ['CALM', 'INTIMATE', 'PEACEFUL', 'DARK', 'MELANCHOLIC'],  // ✅ Добавлено
    name: '🌙 Ночной микс',
    description: 'Медленные треки для глубокой релаксации'
  }
}

/**
 * Генерация плейлиста по времени суток
 * С Vibe Similarity + Energy Curve по времени + Оркестратором
 */
export async function generateTimeOfDayMix(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  limit: number = 25
): Promise<TimeOfDayMix> {
  // ============================================
  // BEHAVIOR TRACKER: Учитываем поведение пользователя
  // ============================================
  const behaviorScores = await calculateBehaviorScores()

  const hour = new Date().getHours()
  let timeOfDay: 'morning' | 'day' | 'evening' | 'night'

  // Обновлённые временные интервалы
  if (hour >= 6 && hour < 11) timeOfDay = 'morning'
  else if (hour >= 11 && hour < 17) timeOfDay = 'day'
  else if (hour >= 17 && hour < 22) timeOfDay = 'evening'
  else timeOfDay = 'night'

  const config = TIME_ENERGY_CURVE[timeOfDay]

  console.log(`[TimeOfDayMix] Generating for ${timeOfDay} (hour: ${hour}, BPM: ${config.bpmMin}-${config.bpmMax}, energy: ${config.start}-${config.end})`)

  let songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(3)
  recentUsedIds.forEach(id => usedSongIds.add(id))

  // ✅ ИСКЛЮЧАЕМ заблокированных артистов
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []
  console.log(`[TimeOfDayMix] 🚫 Banned artists: ${bannedArtists.length}`)

  // Функция проверки забаненного артиста
  const isBannedArtist = (song: ISong): boolean => {
    if (song.artistId && bannedArtists.includes(song.artistId)) return true
    if (!song.artistId && bannedArtists.some(id => 
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) return true
    return false
  }

  // ============================================
  // АНАЛИЗ ПОВЕДЕНИЯ: Какие треки хорошо работают в это время
  // ============================================
  const timeAwareRatings: Record<string, number> = {}
  const userTimeHistory: Record<string, string[]> = {}

  Object.entries(ratings || {}).forEach(([songId, rating]: [string, any]) => {
    if (!rating.playCount || rating.playCount === 0) return

    // Проверяем когда слушал этот трек (если есть lastPlayed)
    if (rating.lastPlayed) {
      const playedHour = new Date(rating.lastPlayed).getHours()
      const playedTimeOfDay = getTimeOfDay(playedHour)
      
      // Сохраняем в историю
      if (!userTimeHistory[playedTimeOfDay]) userTimeHistory[playedTimeOfDay] = []
      userTimeHistory[playedTimeOfDay].push(songId)

      const sameTimeOfDay = playedTimeOfDay === timeOfDay

      // Если трек хорошо играл в это же время - повышаем рейтинг
      if (sameTimeOfDay) {
        timeAwareRatings[songId] = (timeAwareRatings[songId] || 0) + rating.playCount * 2
      }
    }
  })

  console.log(`[TimeOfDayMix] 📊 Time-aware ratings: ${Object.keys(timeAwareRatings).length} tracks`)
  console.log(`[TimeOfDayMix] 📅 User time history: ${Object.keys(userTimeHistory).length} periods`)

  // ИСКЛЮЧАЕМ только недавно сыгранные (не все прослушанные!)
  // const allPlayedIds = Object.entries(ratings)
  //   .filter(([_, rating]) => rating.playCount && rating.playCount > 0)
  //   .map(([id]) => id)
  // allPlayedIds.forEach(id => usedSongIds.add(id))

  // ============================================
  // 1. VIBE SIMILARITY: Улучшенная с динамическим threshold
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')

  let vibeSimilarTracks: ISong[] = []

  // Динамический threshold по времени суток
  const similarityThreshold = {
    morning: 0.70,   // Утром строже - более точные совпадения
    day: 0.65,       // Днем средне
    evening: 0.60,   // Вечером мягче - больше разнообразия
    night: 0.55      // Ночью самый мягкий - для релакса
  }[timeOfDay] || 0.65

  if (likedSongIds.length > 0) {
    console.log(`[TimeOfDayMix] 🎵 Finding liked tracks (threshold: ${similarityThreshold})...`)

    // ✅ УВЕЛИЧЕНО: 100 треков вместо 50
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 100).map(id =>
        subsonic.songs.getSong(id).catch(() => null)
      )
    )

    // Фильтруем по энергии, BPM, MOOD И banned artists
    const energyMatchedLiked = likedSongsResults.filter((song): song is ISong => {
      if (song == null) return false
      
      // ✅ Пропускаем забаненных артистов
      if (isBannedArtist(song)) return false

      const energyMatch = song.energy === undefined ||
        (song.energy >= config.start * 0.6 && song.energy <= config.end * 1.4)

      const bpm = song.bpm || 0
      const bpmMatch = bpm === 0 || (bpm >= config.bpmMin * 0.8 && bpm <= config.bpmMax * 1.2)

      const moods = song.moods || []
      const moodMatch = moods.length === 0 || !config.mood ||
        moods.some(m => config.mood!.includes(m.toUpperCase()))

      return energyMatch && bpmMatch && moodMatch
    })

    console.log(`[TimeOfDayMix] Found ${energyMatchedLiked.length} liked tracks matching criteria (banned artists filtered)`)

    if (energyMatchedLiked.length > 0) {
      // ✅ УВЕЛИЧЕНО: 400 треков вместо 200 для большего разнообразия
      const allSongs = await getRandomSongs(400)
      const vibeUsedIds = new Set<string>()

      // ✅ РАЗНООБРАЗИЕ SEEDS: 15 треков вместо 5
      // 5 топ-лайков + 5 недавно прослушанных + 5 случайных
      const topLiked = energyMatchedLiked.slice(0, 5)
      
      // Недавно прослушанные (с lastPlayed)
      const recentlyPlayed = energyMatchedLiked
        .filter(song => ratings[song.id]?.lastPlayed)
        .sort((a, b) => new Date(ratings[b.id]?.lastPlayed || 0).getTime() - 
                        new Date(ratings[a.id]?.lastPlayed || 0).getTime())
        .slice(0, 5)
      
      // Случайные из оставшихся
      const remaining = energyMatchedLiked.slice(10)
      const random = remaining.sort(() => Math.random() - 0.5).slice(0, 5)
      
      // Объединяем и убираем дубликаты
      const allSeeds = [...topLiked, ...recentlyPlayed, ...random]
      const uniqueSeeds = allSeeds.filter((song, i, self) => 
        i === self.findIndex(s => s.id === song.id)
      ).slice(0, 15)

      console.log(`[TimeOfDayMix] 🌱 Using ${uniqueSeeds.length} diverse seeds (5 top + ${recentlyPlayed.length} recent + ${random.length} random)`)

      for (const seed of uniqueSeeds) {
        const seedFeatures = analyzeTrack(seed)

        const similar = allSongs
          .filter(song => {
            if (usedSongIds.has(song.id) || vibeUsedIds.has(song.id)) return false

            const bpm = song.bpm || 0
            const energy = song.energy || 0

            const energyMatch = energy === 0 || (energy >= config.start * 0.6 && energy <= config.end * 1.4)
            const bpmMatch = bpm === 0 || (bpm >= config.bpmMin * 0.8 && bpm <= config.bpmMax * 1.2)

            return song.genre && energyMatch && bpmMatch
          })
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= similarityThreshold)  // ✅ ДИНАМИЧЕСКИЙ THRESHOLD
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 4)  // ✅ УМЕНЬШЕНО: 4 вместо 5 (больше разнообразия от разных seeds)
          .map(({ song }) => song)

        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            vibeSimilarTracks.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }

      console.log(`[TimeOfDayMix] 🎵 VIBE SIMILARITY: Added ${vibeSimilarTracks.length} tracks (threshold: ${similarityThreshold})`)
    }
  }

  // ============================================
  // 2. ЖАНРЫ ВРЕМЕНИ СУТОК С ВЕСАМИ
  // ============================================
  console.log('[TimeOfDayMix] 🎼 Getting tracks from time-of-day genres with weights...')

  const timeOfDayGenres = config.genres
  
  // ✅ ВЕСА ЖАНРОВ: основные (1.0), смежные (0.7), экспериментальные (0.3)
  const genreWeights: Record<string, number> = {}
  
  // Определяем веса на основе позиции в списке
  timeOfDayGenres.forEach((genre, index) => {
    if (index < 3) genreWeights[genre] = 1.0      // Основные (первые 3)
    else if (index < 6) genreWeights[genre] = 0.7  // Смежные (следующие 3)
    else genreWeights[genre] = 0.3                  // Экспериментальные (остальные)
  })

  const songsFromGenres: ISong[] = []
  const genreUsedIds = new Set<string>(usedSongIds)

  // Собираем треки из всех жанров с учетом весов
  for (const genre of timeOfDayGenres) {
    const weight = genreWeights[genre] || 0.5
    const fetchCount = Math.ceil(20 * weight)  // Основные: 20, Смежные: 14, Экспериментальные: 6
    
    const songsByGenre = await getSongsByGenre(genre, fetchCount)
    let addedFromGenre = 0

    // Первый проход - треки с метаданными (BPM + Energy + MOOD)
    const withMetadata = songsByGenre.filter(s => {
      if (genreUsedIds.has(s.id)) return false

      const energy = s.energy || 0
      const bpm = s.bpm || 0
      const moods = s.moods || []

      const energyMatch = energy === 0 || (energy >= config.start * 0.6 && energy <= config.end * 1.4)
      const bpmMatch = bpm === 0 || (bpm >= config.bpmMin * 0.8 && bpm <= config.bpmMax * 1.2)
      const moodMatch = moods.length === 0 || !config.mood || 
        moods.some(m => config.mood!.includes(m.toUpperCase()))

      return energyMatch && bpmMatch && moodMatch
    })

    // Второй проход - треки без метаданных (fallback)
    const withoutMetadata = songsByGenre.filter(s =>
      !genreUsedIds.has(s.id) &&
      s.energy === undefined &&
      s.bpm === undefined &&
      (!s.moods || s.moods.length === 0)
    )

    // Сначала добавляем с метаданными, потом без (если мало)
    const combined = [...withMetadata, ...withoutMetadata]
    const shuffled = combined.sort(() => Math.random() - 0.5)
    
    const maxFromGenre = Math.ceil((limit * 0.6) * weight)  // Пропорционально весу

    for (const song of shuffled) {
      if (songsFromGenres.length >= maxFromGenre) break
      if (!genreUsedIds.has(song.id)) {
        songsFromGenres.push(song)
        genreUsedIds.add(song.id)
        addedFromGenre++
      }
    }
    
    console.log(`[TimeOfDayMix] 🎼 Genre "${genre}" (weight: ${weight}): added ${addedFromGenre}/${maxFromGenre}`)
  }

  console.log(`[TimeOfDayMix] 🎼 Total from genres: ${songsFromGenres.length} tracks`)

  // ============================================
  // 2.5. ДИНАМИЧЕСКИЙ БОНУС ИСТОРИИ + НОВИЗНА
  // ============================================
  const trackBonus: Record<string, number> = {}
  
  // ✅ ДИНАМИЧЕСКИЙ БОНУС за прослушивание в это время
  if (userTimeHistory[timeOfDay] && userTimeHistory[timeOfDay].length > 0) {
    console.log(`[TimeOfDayMix] 📅 Calculating dynamic time history bonus...`)
    
    const historyTrackIds = userTimeHistory[timeOfDay]
    const now = Date.now()
    
    historyTrackIds.forEach(songId => {
      const rating = ratings[songId]
      if (!rating) return
      
      const playCount = rating.playCount || 0
      const lastPlayed = rating.lastPlayed ? new Date(rating.lastPlayed).getTime() : 0
      
      // Recency factor: 1.0 (0-7 дней), 0.8 (8-30 дней), 0.5 (30+ дней)
      const daysSincePlayed = lastPlayed ? (now - lastPlayed) / (1000 * 60 * 60 * 24) : 999
      let recencyFactor = 0.5
      if (daysSincePlayed <= 7) recencyFactor = 1.0
      else if (daysSincePlayed <= 30) recencyFactor = 0.8
      
      // ✅ ФОРМУЛА: bonus = 10 × (1 + playCount/5) × recencyFactor
      const bonus = 10 * (1 + playCount / 5) * recencyFactor
      
      if (!trackBonus[songId]) trackBonus[songId] = 0
      trackBonus[songId] += bonus
    })
    
    console.log(`[TimeOfDayMix] 📅 Time history bonus applied to ${Object.keys(trackBonus).length} tracks`)
  }
  
  // ✅ БОНУС ЗА НОВИЗНУ (релизы <30 дней)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
  
  songsFromGenres.forEach(song => {
    // Проверяем год выпуска
    const releaseYear = song.year || 0
    const releaseDate = song.created ? new Date(song.created).getTime() : 0
    
    // Если трек выпущен за последние 30 дней
    const isNewRelease = releaseDate > thirtyDaysAgo || releaseYear >= new Date().getFullYear()
    
    if (isNewRelease) {
      const daysOld = releaseDate ? (Date.now() - releaseDate) / (1000 * 60 * 60 * 24) : 30
      let noveltyBonus = daysOld <= 7 ? 5 : 3  // 5 если <7 дней, 3 если 7-30
      
      if (!trackBonus[song.id]) trackBonus[song.id] = 0
      trackBonus[song.id] += noveltyBonus
    }
  })
  
  console.log(`[TimeOfDayMix] 🆕 Novelty bonus applied to ${Object.values(trackBonus).filter(b => b >= 3).length} tracks`)

  // ============================================
  // 3. ФОРМИРУЕМ ФИНАЛЬНЫЙ ПЛЕЙЛИСТ С SMOOTHNESS + ARTIST LIMIT
  // ============================================
  
  // ✅ ОГРАНИЧЕНИЕ АРТИСТОВ: макс 2 трека от одного артиста
  const MAX_TRACKS_PER_ARTIST = 2
  const artistCount: Record<string, number> = {}
  
  // Функция проверки можно ли добавить трек
  const canAddTrack = (song: ISong): boolean => {
    if (usedSongIds.has(song.id)) return false
    
    // ✅ Пропускаем забаненных артистов
    if (isBannedArtist(song)) return false
    
    const artist = song.artist || 'Unknown'
    const currentCount = artistCount[artist] || 0
    
    if (currentCount >= MAX_TRACKS_PER_ARTIST) {
      return false  // Превышен лимит артиста
    }
    
    return true
  }
  
  // Функция добавления трека с проверкой smoothness
  const addTrackWithSmoothness = (song: ISong, lastTrack?: ISong): boolean => {
    if (!canAddTrack(song)) return false
    
    // ✅ SMOOTHNESS ПРОВЕРКА: резкие скачки BPM/Energy
    if (lastTrack) {
      const bpmDiff = Math.abs((song.bpm || 0) - (lastTrack.bpm || 0))
      const energyDiff = Math.abs((song.energy || 0.5) - (lastTrack.energy || 0.5))
      
      // Нормализуем BPM (0-140 → 0-1)
      const bpmSmoothness = bpmDiff / 140
      const energySmoothness = energyDiff
      
      // Формула: smoothness = 0.5 * |bpm_diff| + 0.5 * |energy_diff|
      const smoothness = 0.5 * bpmSmoothness + 0.5 * energySmoothness
      
      // Если слишком резкий переход (>0.3) - пропускаем
      if (smoothness > 0.3) {
        console.log(`[TimeOfDayMix] 🔀 Skipping smooth transition: ${smoothness.toFixed(2)} > 0.3`)
        return false
      }
    }
    
    // Добавляем трек
    songs.push(song)
    usedSongIds.add(song.id)
    
    const artist = song.artist || 'Unknown'
    artistCount[artist] = (artistCount[artist] || 0) + 1
    
    return true
  }
  
  // Добавляем vibe similarity треки (до 40%)
  if (vibeSimilarTracks.length > 0) {
    let lastAdded: ISong | undefined
    
    for (const song of vibeSimilarTracks) {
      if (songs.length >= Math.floor(limit * 0.4)) break
      
      if (addTrackWithSmoothness(song, lastAdded)) {
        lastAdded = song
      }
    }
    console.log(`[TimeOfDayMix] ✅ Added ${songs.length} vibe-similar tracks`)
  }

  // Дополняем жанровыми треками с учетом бонусов
  // Сначала сортируем по бонусам (time history + novelty)
  const sortedGenres = [...songsFromGenres].sort((a, b) => {
    const bonusA = trackBonus[a.id] || 0
    const bonusB = trackBonus[b.id] || 0
    return bonusB - bonusA  // Треки с бонусом выше
  })
  
  let lastAdded: ISong | undefined
  if (songs.length > 0) {
    lastAdded = songs[songs.length - 1]
  }
  
  for (const song of sortedGenres) {
    if (songs.length >= limit) break
    
    if (addTrackWithSmoothness(song, lastAdded)) {
      lastAdded = song
    }
  }

  // ✅ ПРИНУДИТЕЛЬНОЕ ДОБИРАНИЕ если меньше limit
  if (songs.length < limit) {
    const deficit = limit - songs.length
    console.log(`[TimeOfDayMix] ⚠️ Deficit: need ${deficit} more tracks (relaxing smoothness)`)

    const extraSongs = await getRandomSongs(deficit * 3)
    let addedExtra = 0
    
    // Сначала пробуем с smoothness, потом без
    for (const song of extraSongs) {
      if (songs.length >= limit) break
      
      // ✅ Пропускаем забаненных артистов
      if (isBannedArtist(song)) continue
      
      // Первая попытка - с smoothness
      if (addTrackWithSmoothness(song, lastAdded)) {
        lastAdded = song
        addedExtra++
      } else if (canAddTrack(song)) {
        // Вторая попытка - без smoothness (fallback)
        songs.push(song)
        usedSongIds.add(song.id)
        const artist = song.artist || 'Unknown'
        artistCount[artist] = (artistCount[artist] || 0) + 1
        lastAdded = song
        addedExtra++
      }
    }

    console.log(`[TimeOfDayMix] ✅ Added ${addedExtra} extra tracks. Total: ${songs.length}/${limit}`)
  }
  
  // Статистика по артистам
  const uniqueArtists = Object.keys(artistCount).length
  const avgTracksPerArtist = songs.length / uniqueArtists
  
  console.log(`[TimeOfDayMix] 📊 Final track count: ${songs.length}/${limit}`)
  console.log(`[TimeOfDayMix] 👥 Artists: ${uniqueArtists} unique, ${avgTracksPerArtist.toFixed(1)} avg tracks`)
  console.log(`[TimeOfDayMix] 🆕 Novelty tracks: ${Object.values(trackBonus).filter(b => b >= 3).length}`)
  console.log(`[TimeOfDayMix] 🚫 Banned artists filtered: ${bannedArtists.length} artists excluded`)

  console.log(`[TimeOfDayMix] ✅ Total tracks before sorting: ${songs.length}`)

  // ============================================
  // 4. Сортировка по Energy Curve
  // ============================================
  console.log(`[TimeOfDayMix] 📈 Sorting by ${config.curve} energy curve...`)
  
  if (config.curve === 'ascending') {
    // Утро: спокойные → энергичные
    songs.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))
  } else if (config.curve === 'descending') {
    // Вечер: энергичные → спокойные
    songs.sort((a, b) => (b.energy || 0.5) - (a.energy || 0.5))
  } else if (config.curve === 'peak') {
    // День: спокойные → энергичные → спокойные (волна)
    const midPoint = Math.floor(songs.length / 2)
    const firstHalf = songs.slice(0, midPoint)
    const secondHalf = songs.slice(midPoint)
    
    firstHalf.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))
    secondHalf.sort((a, b) => (b.energy || 0.5) - (a.energy || 0.5))
    
    songs.splice(0, songs.length, ...firstHalf, ...secondHalf)
  }
  // flat: оставляем как есть

  // ============================================
  // 4.5. СОРТИРОВКА ПО BEHAVIOR SCORES
  // ============================================
  if (Object.keys(behaviorScores).length > 0) {
    console.log('[TimeOfDayMix] 📊 Sorting by behavior scores before orchestration...')
    songs = sortTracksByBehavior(songs, behaviorScores)
  }
  
  // ============================================
  // 4.6. ПРИНУДИТЕЛЬНОЕ ДОБИРАНИЕ ПЕРЕД ОРКЕСТРАЦИЕЙ
  // ============================================
  if (songs.length < limit) {
    const deficit = limit - songs.length
    console.log(`[TimeOfDayMix] ⚠️ Before orchestration: need ${deficit} more tracks`)

    const { getRandomSongs } = await import('./subsonic-api')
    const extraSongs = await getRandomSongs(deficit * 2)
    let addedExtra = 0

    for (const song of extraSongs) {
      if (songs.length >= limit) break
      if (canAddTrack(song)) {
        songs.push(song)
        usedSongIds.add(song.id)
        addedExtra++
      }
    }

    console.log(`[TimeOfDayMix] ✅ Added ${addedExtra} extra before orchestration. Total: ${songs.length}/${limit}`)
  }

  // ============================================
  // 4.7. РАЗБИВАЕМ ПАЧКИ ОДИНАКОВЫХ АРТИСТОВ
  // ============================================
  console.log('[TimeOfDayMix] 🔀 Breaking up artist clusters...')
  
  const artistGroups = new Map<string, ISong[]>()
  songs.forEach(song => {
    const artist = song.artist || 'Unknown'
    if (!artistGroups.has(artist)) {
      artistGroups.set(artist, [])
    }
    artistGroups.get(artist)!.push(song)
  })
  
  // Перемешиваем внутри каждой группы
  artistGroups.forEach(group => {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[group[i], group[j]] = [group[j], group[i]]
    }
  })
  
  // Собираем обратно: берём по одному треку от каждого артиста по кругу
  const shuffledSongs: ISong[] = []
  const usedIds = new Set<string>()
  
  let hasMore = true
  while (hasMore) {
    hasMore = false
    artistGroups.forEach((group, artist) => {
      for (const song of group) {
        if (!usedIds.has(song.id)) {
          shuffledSongs.push(song)
          usedIds.add(song.id)
          hasMore = true
          break
        }
      }
    })
  }
  
  console.log(`[TimeOfDayMix] ✅ Shuffled: ${artistGroups.size} artists, ${shuffledSongs.length} tracks`)
  
  // Используем перемешанный массив для оркестрации
  songs.length = 0
  songs.push(...shuffledSongs)

  // ============================================
  // 5. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[TimeOfDayMix] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: config.curve === 'ascending' || config.curve === 'peak' ? 'energetic' : 'calm',
    endWith: config.curve === 'descending' || config.curve === 'flat' ? 'calm' : 'moderate',
    energyCurve: config.curve,
  })
  
  return {
    songs: orchestrated,
    timeOfDay,
    name: config.name,
    description: config.description,
  }
}

/**
 * Генерация плейлистов по активности (11 типов)
 * ОБНОВЛЕНО: + точные BPM, + энергия, + жанры, + fallback
 */

// Конфигурация для каждого типа активности (Новая версия)
const ACTIVITY_CONFIG: Record<string, {
  moods: string[]
  energy: { min: number; max: number }
  bpm: { min: number; max: number }
  genres: string[]
  structure: 'standard' | 'descending' | 'ascending' | 'phases'
  phases?: {
    warmup: { bpm: [number, number], energy: [number, number] }
    main: { bpm: [number, number], energy: [number, number] }
    cooldown: { bpm: [number, number], energy: [number, number] }
  }
  name: string
  description: string
}> = {
  meditation: {
    moods: ['CALM', 'TRANQUIL', 'INTIMATE'],
    energy: { min: 0.1, max: 0.3 },
    bpm: { min: 60, max: 80 },
    genres: ['ambient', 'meditation', 'nature-sounds', 'neoclassical', 'drone'],
    structure: 'descending',
    name: '🧘 Медитация',
    description: 'Эмбиент, звуки природы (BPM 60-80)'
  },
  deepwork: {
    moods: ['FOCUSED', 'INTIMATE', 'REFLECTIVE'],
    energy: { min: 0.4, max: 0.6 },
    bpm: { min: 80, max: 100 },
    genres: ['lo-fi', 'chillout', 'instrumental-jazz', 'ambient', 'piano-solo'],
    structure: 'standard',
    name: '📚 Глубокая работа',
    description: 'Lo-fi, инструментальный джаз (BPM 80-100)'
  },
  running: {
    moods: ['ENERGETIC', 'UPLIFTING', 'POWERFUL'],
    energy: { min: 0.7, max: 0.95 },
    bpm: { min: 110, max: 180 },
    genres: ['edm', 'pop', 'hip-hop', 'dance', 'electronic', 'house'],
    structure: 'phases',
    phases: {
      warmup: { bpm: [120, 130], energy: [0.6, 0.75] },
      main: { bpm: [150, 170], energy: [0.85, 1.0] },
      cooldown: { bpm: [100, 120], energy: [0.4, 0.6] }
    },
    name: '🏃 Бег',
    description: 'Разминка -> Темп -> Заминка'
  },
  workout: {
    moods: ['AGGRESSIVE', 'POWERFUL', 'INTENSE'],
    energy: { min: 0.8, max: 1.0 },
    bpm: { min: 130, max: 160 },
    genres: ['rock', 'metal', 'aggressive-hip-hop', 'dubstep', 'hardcore'],
    structure: 'phases',
    phases: {
      warmup: { bpm: [120, 130], energy: [0.7, 0.8] },
      main: { bpm: [140, 160], energy: [0.9, 1.0] },
      cooldown: { bpm: [100, 120], energy: [0.5, 0.7] }
    },
    name: '🏋️ Силовая',
    description: 'Мощные басы, мотивирующие треки'
  },
  cycling: {
    moods: ['ENERGETIC', 'UPLIFTING', 'HAPPY'],
    energy: { min: 0.6, max: 0.85 },
    bpm: { min: 120, max: 145 },
    genres: ['house', 'disco', 'funk', 'synth-pop', 'pop'],
    structure: 'ascending',
    name: '🚴 Вело',
    description: 'Диско, фанк, хаус (BPM 120-145)'
  },
  creativity: {
    moods: ['INSPIRING', 'CREATIVE', 'HAPPY', 'INTIMATE'],
    energy: { min: 0.5, max: 0.7 },
    bpm: { min: 90, max: 110 },
    genres: ['indie', 'neoclassical', 'jazz', 'world', 'blues', 'soul'],
    structure: 'standard',
    name: '🎨 Творчество',
    description: 'Инди, соул, джаз (BPM 90-110)'
  },
  cooking: {
    moods: ['HAPPY', 'WARM', 'UPLIFTING'],
    energy: { min: 0.4, max: 0.6 },
    bpm: { min: 100, max: 120 },
    genres: ['bossa-nova', 'lounge', 'soul', 'reggae', 'light-jazz'],
    structure: 'standard',
    name: '🍳 Кулинария',
    description: 'Босса-нова, соул, регги (BPM 100-120)'
  },
  reading: {
    moods: ['CALM', 'INTIMATE', 'NOSTALGIC'],
    energy: { min: 0.2, max: 0.4 },
    bpm: { min: 70, max: 90 },
    genres: ['neoclassical', 'ambient', 'acoustic-jazz', 'piano'],
    structure: 'standard',
    name: '📖 Чтение',
    description: 'Неоклассика, эмбиент (BPM 70-90)'
  },
  gaming: {
    moods: ['INTENSE', 'FOCUSED', 'AGGRESSIVE'],
    energy: { min: 0.7, max: 0.9 },
    bpm: { min: 120, max: 150 },
    genres: ['synthwave', 'dubstep', 'dnb', 'epic-orchestral', 'cyberpunk'],
    structure: 'ascending',
    name: '🎮 Гейминг',
    description: 'Синтвейв, драм-н-бейс (BPM 120-150)'
  },
  sleep: {
    moods: ['SLEEP', 'CALM', 'TRANQUIL'],
    energy: { min: 0.0, max: 0.2 },
    bpm: { min: 50, max: 70 },
    genres: ['ambient', 'nature-sounds', 'lullaby', 'delta-waves', 'calm'],
    structure: 'descending',
    name: '💤 Сон',
    description: 'Эмбиент, белый шум (BPM 50-70)'
  },
  acoustic: {
    moods: ['INTIMATE', 'WARM', 'MELANCHOLIC'],
    energy: { min: 0.3, max: 0.6 },
    bpm: { min: 80, max: 110 },
    genres: ['acoustic-folk', 'singer-songwriter', 'blues', 'acoustic-jazz'],
    structure: 'standard',
    name: '🎸 Акустика',
    description: 'Акустический фолк, блюз (BPM 80-110)'
  }
}

export async function generateActivityMix(
  activity: string,
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const config = ACTIVITY_CONFIG[activity]

  if (!config) {
    console.error(`[ActivityMix] Unknown activity: ${activity}`)
    return { songs: [], source: 'mixed' }
  }

  console.log(`[ActivityMix] Generating for ${activity}:`, config.name)

  // 1. Получить кандидатов (Лайкнутые + Случайные)
  const candidates: ISong[] = []
  const usedIds = new Set<string>()

  // 1a. Лайкнутые треки (приоритет)
  if (likedSongIds.length > 0) {
    const likedResults = await Promise.all(
      likedSongIds.slice(0, 100).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    likedResults.forEach(song => {
      if (song && !usedIds.has(song.id)) {
        candidates.push(song)
        usedIds.add(song.id)
      }
    })
  }

  // 1b. Случайные треки для наполнения
  const randomTracks = await getRandomSongs(500)
  randomTracks.forEach(song => {
    if (!usedIds.has(song.id)) {
      candidates.push(song)
      usedIds.add(song.id)
    }
  })

  // 2. Фильтрация и Оценка (Scoring)
  const { detectMood, analyzeTrack } = await import('./vibe-similarity')
  
  const scoredTracks: { track: ISong; score: number; phase?: 'warmup' | 'main' | 'cooldown' }[] = []
  
  const targetEnergy = (config.energy.min + config.energy.max) / 2
  const targetBPM = (config.bpm.min + config.bpm.max) / 2
  const energyRange = config.energy.max - config.energy.min
  const bpmRange = config.bpm.max - config.bpm.min

  for (const track of candidates) {
    // --- Строгая фильтрация ---
    // Energy
    const e = track.energy ?? 0.5
    if (e < config.energy.min || e > config.energy.max) continue

    // BPM
    const bpm = track.bpm ?? 100
    if (bpm < config.bpm.min || bpm > config.bpm.max) continue

    // MOOD
    const moodResult = detectMood(analyzeTrack(track))
    const moodMatches = config.moods.some(m => moodResult.mood.toUpperCase() === m || moodResult.mood.toUpperCase().includes(m))
    if (!moodMatches) continue

    // Instrumentalness (для Deep Work, Reading, Meditation, Sleep)
    if (activity === 'deepwork' || activity === 'reading' || activity === 'meditation' || activity === 'sleep') {
      const inst = track.instrumentalness ?? 0.5
      if (inst < 0.6) continue // Требование высокой инструментальности
    }

    // --- Расчет приоритета (Priority Score) ---
    // Формула: 0.4*Energy + 0.3*BPM + 0.2*Mood + 0.1*UserPref
    
    // 0.4 * Energy Match (близость к центру диапазона)
    const energyDist = Math.abs(e - targetEnergy)
    const energyMatch = 1 - (energyDist / (energyRange / 2 || 1))

    // 0.3 * BPM Match (близость к центру диапазона)
    const bpmDist = Math.abs(bpm - targetBPM)
    const bpmMatch = 1 - (bpmDist / (bpmRange / 2 || 1))

    // 0.2 * Mood Match (уже отфильтровано, но даем бонус за точное совпадение)
    const moodMatch = moodMatches ? 1.0 : 0.0

    // 0.1 * User Preference
    let userPref = 0.0
    // Бонус за любимый жанр
    const genreScore = preferredGenres[track.genre || ''] || 0
    const maxGenreScore = Math.max(1, ...Object.values(preferredGenres))
    userPref += 0.1 * (genreScore / maxGenreScore)
    
    // Бонус за поведение (лайки/дослушивания)
    // Упрощенно: если трек лайкнут, добавляем бонус
    if (likedSongIds.includes(track.id)) {
      userPref += 0.05
    }

    const totalScore = (0.4 * energyMatch) + (0.3 * bpmMatch) + (0.2 * moodMatch) + (0.1 * userPref) // userPref нормализуется внутри

    scoredTracks.push({ track, score: totalScore })
  }

  // 3. Сборка плейлиста (Sequence Optimization)
  let finalPlaylist: ISong[] = []

  if (config.structure === 'phases' && config.phases) {
    // --- ФАЗОВАЯ СТРУКТУРА (Бег, Силовая) ---
    console.log(`[ActivityMix] Using phases structure for ${activity}`)
    
    // Определяем лимиты для фаз (20% / 60% / 20%)
    const warmupLimit = Math.ceil(limit * 0.2)
    const mainLimit = Math.ceil(limit * 0.6)
    const cooldownLimit = limit - warmupLimit - mainLimit

    // Вспомогательная функция для выбора треков под фазу
    const pickForPhase = (phaseConfig: { bpm: [number, number], energy: [number, number] }, count: number, phaseName: string) => {
      const [minBpm, maxBpm] = phaseConfig.bpm
      const [minE, maxE] = phaseConfig.energy

      const phaseTracks = scoredTracks.filter(({ track }) => {
        const bpm = track.bpm ?? 100
        const e = track.energy ?? 0.5
        return bpm >= minBpm && bpm <= maxBpm && e >= minE && e <= maxE
      })
      
      // Сортируем по скорингу внутри фазы
      phaseTracks.sort((a, b) => b.score - a.score)
      
      // Применяем штрафы за разнообразие (простая эвристика)
      const selected: ISong[] = []
      const usedArtists = new Set<string>()
      const usedGenres = new Set<string>()

      for (const { track } of phaseTracks) {
        if (selected.length >= count) break
        if (usedArtists.has(track.artist || '')) continue // Жесткий фильтр артиста для разнообразия
        if (usedGenres.has(track.genre || '')) continue // Жесткий фильтр жанра (опционально, можно ослабить)
        
        selected.push(track)
        usedArtists.add(track.artist || '')
        // usedGenres.add(track.genre || '') // Убрал строгий фильтр жанра, оставил артиста
      }
      
      console.log(`[ActivityMix] Phase ${phaseName}: Selected ${selected.length}/${count} tracks`)
      return selected
    }

    const warmup = pickForPhase(config.phases.warmup, warmupLimit, 'warmup')
    const main = pickForPhase(config.phases.main, mainLimit, 'main')
    const cooldown = pickForPhase(config.phases.cooldown, cooldownLimit, 'cooldown')

    finalPlaylist = [...warmup, ...main, ...cooldown]

    // Оптимизация переходов внутри фаз (если нужно, но фазы уже задают порядок)
    // Для фазной структуры порядок жесткий, внутри фазы можно сгладить
    // Но обычно для бега лучше жесткий порядок BPM.

  } else {
    // --- СТАНДАРТНАЯ СТРУКТУРА ---
    console.log(`[ActivityMix] Using standard structure for ${activity}`)
    
    // Сортировка по скорингу
    scoredTracks.sort((a, b) => b.score - a.score)

    // Отбор топ-N с учетом разнообразия
    const selected: ISong[] = []
    const usedArtists = new Set<string>()
    
    // Штрафы за повторяемость: -0.1 за второго артиста
    // Реализуем через пропуск, если лимит артистов превышен
    const artistCounts: Record<string, number> = {}
    const genreCounts: Record<string, number> = {}

    for (const { track, score } of scoredTracks) {
      if (selected.length >= limit) break

      const artist = track.artist || ''
      const genre = track.genre || ''
      const aCount = artistCounts[artist] || 0
      const gCount = genreCounts[genre] || 0

      // Штрафы
      if (aCount >= 2) continue // Макс 2 трека артиста
      if (gCount >= 3) continue // Макс 3 трека жанра

      selected.push(track)
      artistCounts[artist] = aCount + 1
      genreCounts[genre] = gCount + 1
    }

    // Оптимизация последовательности
    if (config.structure === 'descending') {
      // Медитация, Сон: Снижение энергии
      selected.sort((a, b) => (b.energy || 0.5) - (a.energy || 0.5))
    } else if (config.structure === 'ascending') {
      // Гейминг, Вело: Рост энергии
      selected.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))
    } else {
      // Стандарт: Плавные переходы (Deep Work, Кулинария)
      const { optimizeTrackSequence } = await import('./vibe-similarity')
      // Для стабильной энергии (Deep Work) сортируем по BPM стабильно
      if (activity === 'deepwork' || activity === 'reading') {
        selected.sort((a, b) => (a.bpm || 100) - (b.bpm || 100))
      } else {
        // Иначе используем оптимизатор
        const optimized = optimizeTrackSequence(selected, undefined, { energyWeight: 0.6, bpmWeight: 0.4 })
        selected.length = 0
        selected.push(...optimized.slice(0, limit))
      }
    }

    finalPlaylist = selected
  }

  // 4. Fallback (если треков мало)
  if (finalPlaylist.length < limit) {
    console.warn(`[ActivityMix] Only ${finalPlaylist.length} tracks found. Adding random fallback.`)
    // Можно добавить любые треки, подходящие по настроению, даже если BPM/Energy не идеальны
    // Для простоты добавим оставшиеся из scoredTracks без строгих фильтров
    const remaining = scoredTracks.filter(t => !finalPlaylist.includes(t.track))
    remaining.forEach(t => {
      if (finalPlaylist.length >= limit) return
      finalPlaylist.push(t.track)
    })
  }

  return {
    songs: finalPlaylist.slice(0, limit),
    source: 'activity-mix',
    name: config.name,
    description: config.description
  }
}

// Алиасы для совместимости
export const generateWorkoutMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('workout', likedSongIds, ratings, preferredGenres, limit)

export const generateFocusMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('focus', likedSongIds, ratings, preferredGenres, limit)

export const generateRunningMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('running', likedSongIds, ratings, preferredGenres, limit)

export const generateMeditationMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('meditation', likedSongIds, ratings, preferredGenres, limit)

export const generateCyclingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('cycling', likedSongIds, ratings, preferredGenres, limit)

export const generateCreativityMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('creativity', likedSongIds, ratings, preferredGenres, limit)

export const generateCookingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('cooking', likedSongIds, ratings, preferredGenres, limit)

export const generateReadingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('reading', likedSongIds, ratings, preferredGenres, limit)

export const generateGamingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('gaming', likedSongIds, ratings, preferredGenres, limit)

export const generateSleepMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('sleep', likedSongIds, ratings, preferredGenres, limit)

export const generateAcousticMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('acoustic', likedSongIds, ratings, preferredGenres, limit)

// Vibe Mix - заглушка (использует acoustic микс как базу)
export const generateVibeMix = async (seedTrackId: string, allSongs: any[], limit = 25) => {
  console.log(`[VibeMix] Generating for seed: ${seedTrackId}, total songs: ${allSongs.length}`)
  
  // ============================================
  // BEHAVIOR TRACKER: Учитываем поведение пользователя
  // ============================================
  const behaviorScores = await calculateBehaviorScores()
  
  // Находим seed трек
  const seedTrack = allSongs.find(s => s.id === seedTrackId)
  if (!seedTrack) {
    console.warn(`[VibeMix] Seed track ${seedTrackId} not found, using random fallback`)
    // FALLBACK: Если seed не найден, берём случайные треки
    const randomSongs = await getRandomSongs(limit)
    return { songs: randomSongs.slice(0, limit), source: 'random-fallback' }
  }

  console.log(`[VibeMix] Seed track: ${seedTrack.artist} - ${seedTrack.title}`)

  // Исключаем треки из последних плейлистов для разнообразия
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  console.log(`[VibeMix] Excluding ${recentUsedIds.size} recently played tracks`)

  // ============================================
  // VIBE SIMILARITY: Ищем похожие треки
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')
  
  console.log('[VibeMix] 🎵 Analyzing seed track...')
  const seedFeatures = analyzeTrack(seedTrack)
  
  if (!seedFeatures) {
    console.warn('[VibeMix] Failed to analyze seed track, using activity mix fallback')
    return generateActivityMix('acoustic', [], {}, {}, limit)
  }

  console.log('[VibeMix] 🔍 Finding similar tracks...')
  
  const similarTracks = allSongs
    .filter(song => 
      !recentUsedIds.has(song.id) && 
      song.id !== seedTrackId &&
      song.genre // Только треки с жанром
    )
    .map(song => ({
      song,
      similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
    }))
    .filter(({ similarity }) => similarity >= 0.6) // Порог похожести
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ song }) => song)

  console.log(`[VibeMix] ✅ Found ${similarTracks.length} similar tracks`)

  if (similarTracks.length === 0) {
    console.warn('[VibeMix] No similar tracks found, using activity mix fallback')
    return generateActivityMix('acoustic', [], {}, {}, limit)
  }

  // ============================================
  // СОРТИРОВКА ПО BEHAVIOR SCORES
  // ============================================
  if (Object.keys(behaviorScores).length > 0 && similarTracks.length > 0) {
    console.log('[VibeMix] 📊 Sorting by behavior scores...')
    similarTracks = sortTracksByBehavior(similarTracks, behaviorScores)
  }

  return { songs: similarTracks, source: 'vibe-similarity' }
}

/**
 * Конфигурация настроений для Mood Mix
 * ОБНОВЛЕНО: + BPM, + Key, + точные жанры, + fallback на Vibe Similarity
 */
const MOOD_CONFIG: Record<string, {
  moods: string[]  // Допустимые MOOD теги
  energy: { min: number; max: number }
  bpm: { min: number; max: number }
  genres: string[]
  curve: 'ascending' | 'descending' | 'peak'  // Energy curve для оркестрации
  description: string
}> = {
  happy: {
    moods: ['HAPPY', 'UPLIFTING', 'WARM'],
    energy: { min: 0.6, max: 0.9 },
    bpm: { min: 110, max: 140 },
    genres: ['pop', 'disco', 'funk', 'reggae'],
    curve: 'ascending',  // От умеренно радостного к эйфоричному
    description: 'Счастливое настроение'
  },
  sad: {
    moods: ['SAD', 'MELANCHOLIC', 'NOSTALGIC'],
    energy: { min: 0.2, max: 0.5 },
    bpm: { min: 70, max: 100 },
    genres: ['indie', 'soul', 'country', 'ballad'],
    curve: 'descending',  // От лёгкой грусти к глубокой рефлексии
    description: 'Грустное настроение'
  },
  energetic: {
    moods: ['ENERGETIC', 'INTENSE', 'POWERFUL'],
    energy: { min: 0.8, max: 1.0 },
    bpm: { min: 120, max: 160 },
    genres: ['edm', 'electronic', 'hip-hop', 'rock'],
    curve: 'peak',  // Нарастание к пику и плавное снижение
    description: 'Энергичное настроение'
  },
  melancholic: {
    moods: ['MELANCHOLIC', 'INTIMATE', 'REFLECTIVE'],
    energy: { min: 0.3, max: 0.6 },
    bpm: { min: 60, max: 90 },
    genres: ['ambient', 'neoclassical', 'lo-fi', 'trip-hop'],
    curve: 'descending',  // От задумчивости к глубокой меланхолии
    description: 'Меланхоличное настроение'
  },
  angry: {
    moods: ['AGGRESSIVE', 'ANGRY', 'INTENSE'],
    energy: { min: 0.7, max: 1.0 },
    bpm: { min: 90, max: 150 },
    genres: ['metal', 'hardcore', 'hip-hop', 'industrial'],
    curve: 'peak',  // Нарастание агрессии к пику
    description: 'Агрессивное настроение'
  },
  celebratory: {
    moods: ['CELEBRATORY', 'UPLIFTING', 'JOYFUL'],
    energy: { min: 0.7, max: 0.9 },
    bpm: { min: 100, max: 130 },
    genres: ['disco', 'pop-funk', 'house', 'reggae'],
    curve: 'ascending',  // От умеренного праздника к эйфории
    description: 'Праздничное настроение'
  }
}

/**
 * Генерация плейлиста по настроению
 * 
 * Алгоритм:
 * 1. Фильтрация по MOOD/Energy/BPM
 * 2. Приоритизация: 0.4*mood + 0.3*energy + 0.2*bpm + 0.1*user_pref
 * 3. Оптимизация последовательности по energy curve
 * 4. Контроль разнообразия (штрафы за повторы артистов/жанров)
 * 5. Финальная сборка
 */
export async function generateMoodMix(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  mood: string,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const moodConfig = MOOD_CONFIG[mood]

  if (!moodConfig) {
    console.error(`[MoodMix] Unknown mood: ${mood}, using 'calm' as fallback`)
    return generateMoodMix(likedSongIds, ratings, preferredGenres, 'melancholic', limit)
  }

  console.log(`[MoodMix] Generating for ${mood}:`, moodConfig)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))

  console.log(`[MoodMix] Excluding ${recentUsedIds.size} recently played tracks`)

  const { detectMood, analyzeTrack } = await import('./vibe-similarity')

  // ============================================
  // 1. ФИЛЬТРАЦИЯ ТРЕКОВ по MOOD/Energy/BPM
  // ============================================
  console.log(`[MoodMix] 🔍 Filtering tracks by mood/energy/BPM...`)

  // Получаем кандидатов (лайкнутые + жанры настроения)
  const candidateTracks: { track: ISong; source: string }[] = []

  // 1a. Лайкнутые треки
  if (likedSongIds.length > 0) {
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 100).map(id =>
        subsonic.songs.getSong(id).catch(() => null)
      )
    )

    for (const song of likedSongsResults.filter((s): s is ISong => s != null)) {
      if (!usedSongIds.has(song.id)) {
        candidateTracks.push({ track: song, source: 'liked' })
      }
    }
  }

  // 1b. Треки из жанров настроения
  for (const genre of moodConfig.genres) {
    const songsByGenre = await getSongsByGenre(genre, 30)
    for (const song of songsByGenre) {
      if (!usedSongIds.has(song.id) && !candidateTracks.find(c => c.track.id === song.id)) {
        candidateTracks.push({ track: song, source: `genre:${genre}` })
      }
    }
  }

  console.log(`[MoodMix] 🔍 Total candidates: ${candidateTracks.length}`)

  // ============================================
  // 2. ПРИОРИТИЗАЦИЯ ПО ПРОФИЛЮ ПОЛЬЗОВАТЕЛЯ
  // ============================================
  const targetEnergy = (moodConfig.energy.min + moodConfig.energy.max) / 2
  const targetBPM = (moodConfig.bpm.min + moodConfig.bpm.max) / 2
  const energyRange = moodConfig.energy.max - moodConfig.energy.min
  const bpmRange = moodConfig.bpm.max - moodConfig.bpm.min

  // Рассчитываем priority для каждого трека
  const scoredTracks = candidateTracks.map(({ track, source }) => {
    const features = analyzeTrack(track)
    const trackMood = detectMood(features)

    // mood_match: 1.0 если MOOD совпадает, 0.0 если нет
    const moodMatch = track.moods && track.moods.some(m => 
      moodConfig.moods.includes(m.toUpperCase())
    ) ? 1.0 : 0.0

    // energy_match: 1 - |E_track - E_target|
    const energyDiff = track.energy !== undefined ? Math.abs(track.energy - targetEnergy) : 0.5
    const energyMatch = 1 - Math.min(1, energyDiff / (energyRange / 2))

    // bpm_match: 1 - |BPM_track - BPM_target| / range
    const bpmDiff = track.bpm > 0 ? Math.abs(track.bpm - targetBPM) : 50
    const bpmMatch = 1 - Math.min(1, bpmDiff / bpmRange)

    // user_pref: бонус +0.1 за треки из любимых жанров
    const genreWeight = preferredGenres[track.genre || ''] || 0
    const maxGenreWeight = Math.max(1, ...Object.values(preferredGenres))
    const userPref = genreWeight / maxGenreWeight

    // Формула: priority = 0.4*mood + 0.3*energy + 0.2*bpm + 0.1*user_pref
    const priority = 
      0.4 * moodMatch +
      0.3 * energyMatch +
      0.2 * bpmMatch +
      0.1 * userPref

    return {
      track,
      priority,
      source,
      breakdown: { moodMatch, energyMatch, bpmMatch, userPref }
    }
  })

  // Сортируем по приоритету
  scoredTracks.sort((a, b) => b.priority - a.priority)

  console.log(`[MoodMix] 🎯 Scored ${scoredTracks.length} tracks`)
  if (scoredTracks.length > 0) {
    const top = scoredTracks[0]
    console.log(`[MoodMix] 🏆 Top track: priority=${top.priority.toFixed(2)}, mood=${top.breakdown.moodMatch.toFixed(1)}, energy=${top.breakdown.energyMatch.toFixed(2)}`)
  }

  // ============================================
  // 3. ФИНАЛЬНАЯ СБОРКА С ШТРАФАМИ ЗА ПОВТОРЫ
  // ============================================
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  for (const { track } of scoredTracks) {
    if (songs.length >= limit) break
    if (usedSongIds.has(track.id)) continue

    const artist = track.artist || 'Unknown'
    const genre = track.genre || 'Unknown'
    const currentArtistCount = artistCounts[artist] || 0
    const currentGenreCount = genreCounts[genre] || 0

    // Штрафы за повторяемость
    if (currentArtistCount >= 2) continue  // Макс 2 трека от артиста
    if (currentGenreCount >= 3) continue   // Макс 3 трека жанра

    songs.push(track)
    usedSongIds.add(track.id)
    artistCounts[artist] = currentArtistCount + 1
    genreCounts[genre] = currentGenreCount + 1
  }

  console.log(`[MoodMix] ✅ Selected ${songs.length} tracks (${Object.keys(artistCounts).length} artists, ${Object.keys(genreCounts).length} genres)`)

  // ============================================
  // 4. FALLBACK: Если мало треков - добираем случайными из MOOD
  // ============================================
  if (songs.length < limit) {
    console.log(`[MoodMix] ⚠️ Only ${songs.length} tracks, adding random mood fallback...`)
    
    const randomSongs = await getRandomSongs(100)
    
    for (const song of randomSongs) {
      if (songs.length >= limit) break
      if (usedSongIds.has(song.id)) continue

      // Проверяем MOOD
      const hasMatchingMood = song.moods && song.moods.some(m => 
        moodConfig.moods.includes(m.toUpperCase())
      )

      // Проверяем Energy/BPM
      const energyOk = song.energy === undefined || (song.energy >= moodConfig.energy.min * 0.8 && song.energy <= moodConfig.energy.max * 1.2)
      const bpmOk = song.bpm === 0 || (song.bpm >= moodConfig.bpm.min * 0.85 && song.bpm <= moodConfig.bpm.max * 1.15)

      if (hasMatchingMood && energyOk && bpmOk) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[MoodMix] ===== END: ${songs.length} tracks =====`)

  // ============================================
  // 5. ОРКЕСТРАЦИЯ: Energy curve по настроению
  // ============================================
  console.log(`[MoodMix] 🎼 ORCHESTRATOR: ${moodConfig.curve} energy curve...`)

  const { optimizeTrackSequence } = await import('./vibe-similarity')
  
  // Определяем trend энергии для сегментов
  let energyTrend = 0.0
  if (moodConfig.curve === 'ascending') energyTrend = 0.1  // Рост энергии
  else if (moodConfig.curve === 'descending') energyTrend = -0.1  // Снижение
  else if (moodConfig.curve === 'peak') energyTrend = 0.0  // Пик в середине

  const orchestratedSongs = optimizeTrackSequence(songs, undefined, {
    energyWeight: 0.6,
    bpmWeight: 0.4,
    segmentSize: 5,
    energyTrendPerSegment: energyTrend
  })

  return {
    songs: orchestratedSongs.slice(0, limit),
    source: 'mood-mix',
  }
}

/**
 * Генерация плейлиста "Потому что вы слушали..."
 * На основе недавно прослушанных артистов
 * С Vibe Similarity + Оркестратором
 */
/**
 * Генерация плейлиста "Потому что вы слушали"
 * 
 * Принцип работы:
 * 1. Находит треки которые слушал много раз (playCount > 3)
 * 2. Находит артистов которых часто слушал
 * 3. Для каждого "якорного" трека/артиста создаёт секцию похожих
 * 4. Тематические секции: "Похожи на Radiohead", "В духе Queen"
 */
export async function generateBecauseYouListened(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredArtists: Record<string, number>,
  limit: number = 25
): Promise<MLWavePlaylist> {
  // ============================================
  // BEHAVIOR TRACKER: Учитываем поведение пользователя
  // ============================================
  const behaviorScores = await calculateBehaviorScores()

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[BecauseYouListened] ===== START =====')

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))

  // ============================================
  // 1. НАХОДИМ ТРЕКИ КОТОРЫЕ СЛУШАЛ МНОГО РАЗ
  // ============================================
  console.log('[BecauseYouListened] 🔍 Finding frequently played tracks...')
  
  const frequentlyPlayed = Object.entries(ratings || {})
    .filter(([_, rating]: [string, any]) => 
      rating.playCount && rating.playCount >= 3 && rating.like !== false
    )
    .sort((a: [string, any], b: [string, any]) => b[1].playCount - a[1].playCount)
    .slice(0, 5) // Топ 5 часто слушаемых
    .map(([id]) => id)

  console.log(`[BecauseYouListened] ❤️ Frequently played: ${frequentlyPlayed.length} tracks`)

  // ============================================
  // 2. НАХОДИМ АРТИСТОВ КОТОРЫХ ЧАСТО СЛУШАЛ
  // ============================================
  const topArtists = Object.entries(preferredArtists || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)

  console.log(`[BecauseYouListened] 🎤 Top artists: ${topArtists.length}`)

  // ============================================
  // 3. VIBE SIMILARITY: Для каждого часто слушаемого трека
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')

  if (frequentlyPlayed.length > 0) {
    console.log('[BecauseYouListened] 🎵 Finding similar to frequently played...')

    // Загружаем часто слушаемые треки
    const frequentSongs = await Promise.all(
      frequentlyPlayed.map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    const validFrequentSongs = frequentSongs.filter((s): s is ISong => s != null && s.genre != null)

    if (validFrequentSongs.length > 0) {
      const allSongs = await getRandomSongs(200)
      const vibeUsedIds = new Set<string>()

      // Для каждого часто слушаемого трека находим 3-4 похожих
      for (const seed of validFrequentSongs.slice(0, 3)) {
        const seedFeatures = analyzeTrack(seed)
        
        const similar = allSongs
          .filter(song =>
            !usedSongIds.has(song.id) &&
            !vibeUsedIds.has(song.id) &&
            song.genre &&
            validFrequentSongs.find(s => s.id === song.id) == null // Исключаем сами seed треки
          )
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= 0.6)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 4) // 4 похожих на каждый seed
          .map(({ song }) => song)

        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
          }
        })

        console.log(`[BecauseYouListened] 🎵 Similar to "${seed.artist} - ${seed.title}": ${similar.length} tracks`)
      }
    }
  }

  // ============================================
  // 4. ПОХОЖИЕ АРТИСТЫ: Для каждого топ артиста
  // ============================================
  console.log('[BecauseYouListened] 🎤 Finding similar artists...')

  for (const artistId of topArtists.slice(0, 3)) { // Топ 3 артиста
    if (songs.length >= limit * 0.7) break // 70% уже набрано

    const artist = await subsonic.artists.getOne(artistId)
    if (!artist?.name) continue

    console.log(`[BecauseYouListened] 🎤 Finding similar to ${artist.name}...`)

    // Находим треки этого артиста
    const artistSongs = await getTopSongs(artist.name, 5)
    if (artistSongs.length === 0) continue

    // Используем первый трек как seed для поиска похожих
    const seedSong = artistSongs[0]
    const seedFeatures = analyzeTrack(seedSong)
    
    const allSongs = await getRandomSongs(150)
    const similarFromArtist = allSongs
      .filter(song =>
        !usedSongIds.has(song.id) &&
        song.genre &&
        song.artist !== artist.name // НЕ треки того же артиста
      )
      .map(song => ({
        song,
        similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
      }))
      .filter(({ similarity }) => similarity >= 0.55)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3) // 3 похожих на артиста
      .map(({ song }) => song)

    similarFromArtist.forEach(track => {
      if (!usedSongIds.has(track.id)) {
        songs.push(track)
        usedSongIds.add(track.id)
      }
    })

    console.log(`[BecauseYouListened] 🎤 Similar to ${artist.name}: ${similarFromArtist.length} tracks`)
  }

  // ============================================
  // 5. ДОБИВАЕМ: Треки тех же артистов (если мало)
  // ============================================
  if (songs.length < limit) {
    console.log(`[BecauseYouListened] 🎵 Filling with artist tracks: ${songs.length}/${limit}`)

    for (const artistId of topArtists) {
      if (songs.length >= limit) break

      const artist = await subsonic.artists.getOne(artistId)
      if (artist?.name) {
        const artistTopSongs = await getTopSongs(artist.name, 3)

        for (const song of artistTopSongs) {
          if (songs.length >= limit) break
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      }
    }
  }

  console.log(`[BecauseYouListened] ===== END: ${songs.length} tracks =====`)

  // ============================================
  // 5.5. СОРТИРОВКА ПО BEHAVIOR SCORES
  // ============================================
  if (Object.keys(behaviorScores).length > 0 && songs.length > 0) {
    console.log('[BecauseYouListened] 📊 Sorting by behavior scores before orchestration...')
    const sortedSongs = sortTracksByBehavior(songs, behaviorScores)
    songs.length = 0
    songs.push(...sortedSongs)
  }

  // ============================================
  // 6. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[BecauseYouListened] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
  })

  return {
    songs: orchestrated,
    source: 'because-you-listened',
  }
}

/**
 * Генерация плейлиста "Новинки" (улучшенная версия)
 * 
 * Алгоритм:
 * 1. Фильтр по дате релиза (30-90 дней)
 * 2. Приоритизация: 0.5*match + 0.2*popularity + 0.2*novelty + 0.1*user
 * 3. Energy curve ascending (0.7 → 0.9)
 * 4. Штрафы за повторы
 */
export async function generateNewReleasesPlaylist(
  limit: number = 30,
  ratings: Record<string, any> = {},
  preferredGenres: Record<string, number> = {},
  preferredArtists: Record<string, number> = {}
): Promise<MLWavePlaylist> {
  console.log('[NewReleases] ===== START =====')

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  // Дата релиза: последние 90 дней
  const now = Date.now()
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)

  // ============================================
  // 1. ПОЛУЧЕНИЕ КАНДИДАТОВ
  // ============================================
  console.log('[NewReleases] 🔍 Finding recent releases (last 90 days)...')

  const candidates: {
    track: ISong
    matchScore: number
    popularity: number
    novelty: number
    userPref: number
  }[] = []

  // 1a. Случайные треки с фильтрацией по дате
  const randomTracks = await getRandomSongs(1000)
  
  for (const track of randomTracks) {
    // Проверяем дату релиза
    const createdDate = track.created ? new Date(track.created).getTime() : 0
    const year = track.year || 0
    const currentYear = new Date().getFullYear()
    
    // Трек считается "новым" если:
    // - Создан за последние 90 дней ИЛИ
    // - Год выпуска = текущий или прошлый
    const isRecent = createdDate >= ninetyDaysAgo || year >= currentYear - 1
    
    if (!isRecent) continue
    if (usedSongIds.has(track.id)) continue

    // Расчет novelty бонуса
    // +0.15 для треков <30 дней, +0.1 для треков 30-90 дней
    let noveltyBonus = 0.0
    if (createdDate >= thirtyDaysAgo) {
      noveltyBonus = 0.15
    } else if (createdDate >= ninetyDaysAgo) {
      noveltyBonus = 0.10
    } else if (year >= currentYear) {
      noveltyBonus = 0.10
    }

    // Расчет match score (совпадение с предпочтениями)
    const genreScore = preferredGenres[track.genre || ''] || 0
    const maxGenreScore = Math.max(1, ...Object.values(preferredGenres))
    const artistScore = preferredArtists[track.artistId || ''] || 0
    const maxArtistScore = Math.max(1, ...Object.values(preferredArtists))
    
    const matchScore = (genreScore / maxGenreScore) * 0.5 + (artistScore / maxArtistScore) * 0.5

    // Popularity score (нормализованный playCount)
    const popularity = track.playCount || 0

    candidates.push({
      track,
      matchScore: matchScore > 0 ? 0.8 + (matchScore * 0.2) : 0.5,  // 0.5-1.0
      popularity,
      novelty: noveltyBonus,
      userPref: (genreScore / maxGenreScore) * 0.1  // 0-0.1
    })
  }

  console.log(`[NewReleases] 📥 Found ${candidates.length} recent tracks`)

  if (candidates.length === 0) {
    console.warn('[NewReleases] No recent tracks found. Using fallback...')
    // Fallback: берем случайные треки
    const fallback = await getRandomSongs(limit)
    return {
      songs: fallback.slice(0, limit),
      source: 'new-releases-fallback',
      name: 'Новинки',
      description: 'Случайные треки (не найдено новинок за 90 дней)'
    }
  }

  // ============================================
  // 2. ПРИОРИТИЗАЦИЯ (0.5*match + 0.2*popularity + 0.2*novelty + 0.1*user)
  // ============================================
  const maxPopularity = Math.max(1, ...candidates.map(c => c.popularity))

  const scoredCandidates = candidates.map(c => ({
    ...c,
    priority: 
      (0.5 * c.matchScore) + 
      (0.2 * (c.popularity / maxPopularity)) + 
      (0.2 * c.novelty) + 
      c.userPref
  }))

  // Сортировка по приоритету
  scoredCandidates.sort((a, b) => b.priority - a.priority)

  console.log(`[NewReleases] 🎯 Top priority: ${scoredCandidates[0]?.priority.toFixed(2)}`)

  // ============================================
  // 3. ОТБОР ТРЕКОВ С ШТРАФАМИ ЗА ПОВТОРЫ
  // ============================================
  for (const { track, priority } of scoredCandidates) {
    if (songs.length >= limit) break

    const artist = track.artist || ''
    const genre = track.genre || ''
    const aCount = artistCounts[artist] || 0
    const gCount = genreCounts[genre] || 0

    // Штрафы за повторяемость
    if (aCount >= 2) continue  // Макс 2 трека артиста
    if (gCount >= 4) continue  // Макс 4 трека жанра

    songs.push(track)
    usedSongIds.add(track.id)
    artistCounts[artist] = aCount + 1
    genreCounts[genre] = gCount + 1
  }

  // ============================================
  // 4. FALLBACK (если мало треков)
  // ============================================
  if (songs.length < limit) {
    console.warn(`[NewReleases] Only ${songs.length} tracks. Adding relaxed fallback...`)
    
    const remaining = scoredCandidates.filter(c => !usedSongIds.has(c.track.id))
    for (const { track } of remaining) {
      if (songs.length >= limit) break
      songs.push(track)
      usedSongIds.add(track.id)
    }
  }

  // ============================================
  // 5. СОРТИРОВКА (Energy ascending: 0.7 → 0.9)
  // ============================================
  console.log('[NewReleases] ⚡ Sorting: energy ascending (growing popularity)...')
  
  songs.sort((a, b) => {
    const energyA = a.energy || 0.5
    const energyB = b.energy || 0.5
    return energyA - energyB  // От низкой к высокой
  })

  console.log(`[NewReleases] ✅ Generated ${songs.length} tracks`)
  console.log(`[NewReleases] 🎤 Artists: ${Object.keys(artistCounts).length}, Genres: ${Object.keys(genreCounts).length}`)

  // Логирование первых треков
  songs.slice(0, 5).forEach((s, i) => {
    console.log(`  ${i+1}. ${s.artist} - ${s.title} (E:${(s.energy || 0.5).toFixed(2)}, BPM:${s.bpm || '?'}) [${s.genre}]`)
  })

  return {
    songs: songs.slice(0, limit),
    source: 'new-releases',
    name: '🆕 Новинки',
    description: 'Свежие релизы за последние 90 дней'
  }
}

/**
 * Генерация плейлиста "Похожие исполнители" (улучшенная версия)
 * 
 * Алгоритм:
 * 1. Vibe Similarity ≥ 0.7 к seed-артисту
 * 2. MOOD фильтр (INTIMATE, REFLECTIVE, MELANCHOLIC)
 * 3. Чередование: 80% знакомые / 20% новые
 * 4. Штрафы за повторы
 */
/**
 * РАДИО ПО ТРЕКУ
 * Алгоритм:
 * 1. Анализ seed-трека (BPM, Energy, Key, MOOD).
 * 2. Фильтрация кандидатов (BPM ±15, Energy ±0.2).
 * 3. Расчет trackRadioScore по формуле.
 * 4. Оптимизация последовательности.
 */
export async function generateTrackRadio(
  songId: string,
  limit: number = 30
): Promise<MLWavePlaylist> {
  console.log(`[TrackRadio] ===== START for track: ${songId} =====`)

  // 1. Получаем Seed-трек
  let seedTrack: ISong | null = null
  try {
    seedTrack = await subsonic.songs.getSong(songId)
  } catch (e) {
    console.error('[TrackRadio] Failed to load seed track:', e)
    return { songs: [], source: 'track-radio-error' }
  }

  if (!seedTrack) {
    return { songs: [], source: 'track-radio-error' }
  }

  console.log(`[TrackRadio] 🎵 Seed: ${seedTrack.artist} - ${seedTrack.title}`)
  
  const { analyzeTrack, vibeSimilarity, detectMood } = await import('./vibe-similarity')
  const seedFeatures = analyzeTrack(seedTrack)
  const seedMood = detectMood(seedFeatures)

  // 2. Получаем кандидатов (смесь жанра и случайных)
  const candidates: ISong[] = []
  const usedIds = new Set<string>([songId]) // Исключаем сам сид

  // 2a. Треки того же жанра (наиболее вероятно похожие)
  if (seedTrack.genre) {
    const genreTracks = await getSongsByGenre(seedTrack.genre, 200)
    genreTracks.forEach(t => {
      if (!usedIds.has(t.id)) {
        candidates.push(t)
        usedIds.add(t.id)
      }
    })
  }

  // 2b. Случайные треки для разнообразия
  const randomTracks = await getRandomSongs(300)
  randomTracks.forEach(t => {
    if (!usedIds.has(t.id)) {
      candidates.push(t)
      usedIds.add(t.id)
    }
  })

  console.log(`[TrackRadio] 📥 Candidates: ${candidates.length}`)

  // 3. Скоринг
  const scoredCandidates = candidates.map(track => {
    const features = analyzeTrack(track)
    const mood = detectMood(features)

    // A. Vector Similarity (0.5)
    const vectorSim = vibeSimilarity(seedFeatures, features)

    // B. Key Compatibility (0.2)
    let keyScore = 0.5 // Нейтрально, если нет данных
    if (seedTrack.key !== undefined && track.key !== undefined) {
      // Упрощенная логика: совпадение или квинта/кварта
      const diff = Math.abs((seedTrack.key || 0) - (track.key || 0))
      if (diff === 0 || diff === 7 || diff === 5) keyScore = 1.0 // Унисон, Квинта, Кварта
      else if (diff === 4 || diff === 3 || diff === 8 || diff === 9) keyScore = 0.7 // Терции
      else if ((seedTrack.keyScale === 'Major' && track.keyScale === 'Major') || 
               (seedTrack.keyScale === 'Minor' && track.keyScale === 'Minor')) keyScore = 0.8
      else keyScore = 0.2
    }

    // C. BPM Match (0.15) - формула из заметки: 1 - |diff|/10
    let bpmScore = 0
    if (seedFeatures.bpm > 0 && features.bpm > 0) {
      const diff = Math.abs(features.bpm - seedFeatures.bpm)
      bpmScore = Math.max(0, 1 - (diff / 15)) // Чуть мягче порог (15 вместо 10 для большего выбора)
    } else {
      bpmScore = 0.5
    }

    // D. MOOD Match (0.1)
    const moodScore = (seedMood.mood === mood.mood) ? 1.0 : 0.5 // 1.0 если точно, 0.5 если примерно

    // E. User Pref (0.05) - пока 0.5 заглушка, если нет данных о лайках
    const userPref = 0.5 // Можно улучшить, проверяя ratings

    // Итоговый скор
    const totalScore = 
      (0.5 * vectorSim) + 
      (0.2 * keyScore) + 
      (0.15 * bpmScore) + 
      (0.1 * moodScore) + 
      (0.05 * userPref)

    return { track, score: totalScore }
  })

  // Сортировка
  scoredCandidates.sort((a, b) => b.score - a.score)

  // 4. Отбор с штрафами за артистов (не более 2 треков подряд)
  const playlist: ISong[] = []
  const artistCounts: Record<string, number> = {}

  // Добавляем Seed-трек первым!
  playlist.push(seedTrack)
  artistCounts[seedTrack.artist] = 1

  for (const { track } of scoredCandidates) {
    if (playlist.length >= limit) break

    const artist = track.artist || ''
    const count = artistCounts[artist] || 0

    if (count >= 2) continue // Штраф: макс 2 трека артиста

    playlist.push(track)
    artistCounts[artist] = count + 1
  }

  // 5. Финальная сортировка (плавная энергия)
  // Seed (1-й трек) -> Похожие по убыванию энергии или плавный спад
  const rest = playlist.slice(1)
  rest.sort((a, b) => {
    // Сначала ближайшие по вайбу, потом чуть разнообразнее
    const eA = a.energy || 0.5
    const eB = b.energy || 0.5
    return Math.abs(eA - (seedTrack?.energy || 0.5)) - Math.abs(eB - (seedTrack?.energy || 0.5))
  })
  
  // Вставляем обратно
  playlist.length = 0
  playlist.push(seedTrack)
  playlist.push(...rest)

  console.log(`[TrackRadio] ✅ Generated ${playlist.length} tracks`)

  return {
    songs: playlist.slice(0, limit),
    source: 'track-radio',
    name: `📻 Радио: ${seedTrack.artist} - ${seedTrack.title}`,
    description: `Похожие треки на основе аудио-профиля`
  }
}

/**
 * Генерация плейлиста "Потому что вы слушали"
 * На основе недавно прослушанных артистов
 */
export async function generateBecauseYouListened(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredArtists: Record<string, number>,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const behaviorScores = await calculateBehaviorScores()

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[BecauseYouListened] ===== START =====')

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))

  console.log(`[BecauseYouListened] Excluding ${recentUsedIds.size} recently played tracks`)
  console.log(`[BecauseYouListened] Total usedSongIds: ${usedSongIds.size}`)

  // ============================================
  // 1. НАХОДИМ ТРЕКИ КОТОРЫЕ СЛУШАЛ МНОГО РАЗ
  // ============================================
  console.log('[BecauseYouListened] 🔍 Finding frequently played tracks...')

  const frequentlyPlayed = Object.entries(ratings || {})
    .filter(([_, rating]: [string, any]) =>
      rating.playCount && rating.playCount >= 3 && rating.like !== false
    )
    .sort((a: [string, any], b: [string, any]) => b[1].playCount - a[1].playCount)
    .slice(0, 5) // Топ 5 часто слушаемых
    .map(([id]) => id)

  console.log(`[BecauseYouListened] ❤️ Frequently played: ${frequentlyPlayed.length} tracks`)

  // ============================================
  // 2. НАХОДИМ АРТИСТОВ КОТОРЫХ ЧАСТО СЛУШАЛ
  // ============================================
  const topArtists = Object.entries(preferredArtists || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)

  console.log(`[BecauseYouListened] 🎤 Top artists: ${topArtists.length}`)

  // ============================================
  // 3. VIBE SIMILARITY: Для каждого часто слушаемого трека
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')

  if (frequentlyPlayed.length > 0) {
    console.log('[BecauseYouListened] 🎵 Finding similar to frequently played...')

    // Загружаем часто слушаемые треки
    const frequentSongsResults = await Promise.all(
      frequentlyPlayed.map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    const validFrequentSongs = frequentSongsResults.filter((s): s is ISong => s != null && s.genre != null)

    if (validFrequentSongs.length > 0) {
      const allSongs = await getRandomSongs(200)
      const vibeUsedIds = new Set<string>()

      // Для каждого часто слушаемого трека находим 3-4 похожих
      for (const seed of validFrequentSongs.slice(0, 3)) {
        const seedFeatures = analyzeTrack(seed)

        const similar = allSongs
          .filter(song => {
            if (usedSongIds.has(song.id) || vibeUsedIds.has(song.id)) return false

            const energy = song.energy || 0
            const bpm = song.bpm || 0

            // Мягкие фильтры
            const energyMatch = energy === 0 || (energy >= 0.3 && energy <= 1.0)
            const bpmMatch = bpm === 0 || (bpm >= 60 && bpm <= 180)

            return song.genre && energyMatch && bpmMatch
          })
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= 0.65)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 4)
          .map(({ song }) => song)

        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            songs.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }

      console.log(`[BecauseYouListened] 🎵 Added ${songsToAdd.length} vibe-similar tracks`)
    }
  }

  // ============================================
  // 4. ПОХОЖИЕ АРТИСТЫ: Для каждого топ артиста
  // ============================================
  console.log('[BecauseYouListened] 🎤 Finding similar artists...')

  for (const artistId of topArtists.slice(0, 3)) {
    if (songsToAdd.length >= limit * 0.7) break

    try {
      const artist = await subsonic.artists.getOne(artistId)
      if (!artist?.name) continue

      console.log(`[BecauseYouListened] 🎤 Finding similar to ${artist.name}...`)

      // Находим треки этого артиста
      const artistSongs = await getTopSongs(artist.name, 5)
      if (artistSongs.length === 0) continue

      // Используем первый трек как seed для поиска похожих
      const seedSong = artistSongs[0]
      const seedFeatures = analyzeTrack(seedSong)

      const allSongs = await getRandomSongs(150)
      const similarFromArtist = allSongs
        .filter(song =>
          !usedSongIds.has(song.id) &&
          song.genre &&
          song.artist !== artist.name
        )
        .map(song => ({
          song,
          similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
        }))
        .filter(({ similarity }) => similarity >= 0.55)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
        .map(({ song }) => song)

      similarFromArtist.forEach(track => {
        if (!usedSongIds.has(track.id)) {
          songs.push(track)
          usedSongIds.add(track.id)
        }
      })

      console.log(`[BecauseYouListened] 🎤 Similar to ${artist.name}: ${similarFromArtist.length} tracks`)
    } catch (error) {
      console.warn(`[BecauseYouListened] Failed to get similar for artist ${artistId}:`, error)
    }
  }

  // ============================================
  // 5. ДОБИВАЕМ: Треки тех же артистов (если мало)
  // ============================================
  if (songs.length < limit) {
    console.log(`[BecauseYouListened] 🎵 Filling with artist tracks: ${songs.length}/${limit}`)

    for (const artistId of topArtists) {
      if (songs.length >= limit) break

      try {
        const artist = await subsonic.artists.getOne(artistId)
        if (artist?.name) {
          const artistSongs = await getTopSongs(artist.name, 5)
          for (const song of artistSongs) {
            if (songs.length >= limit) break
            if (!usedSongIds.has(song.id)) {
              songs.push(song)
              usedSongIds.add(song.id)
            }
          }
        }
      } catch (error) {
        console.warn(`[BecauseYouListened] Failed to get songs for artist ${artistId}:`, error)
      }
    }
  }

  // ============================================
  // 6. СЛУЧАЙНЫЕ ТРЕКИ (если всё ещё мало)
  // ============================================
  if (songs.length < limit) {
    const randomSongs = await getRandomSongs(50)
    for (const song of randomSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  console.log(`[BecauseYouListened] ===== END: ${songs.length} tracks =====`)

  // ============================================
  // 7. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[BecauseYouListened] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
  })

  return {
    songs: orchestrated,
    source: 'because-you-listened',
  }
}

/**
 * Генерация плейлиста по жанру
    
    const mood = detectMood(analyzeTrack(song))
    moodCounts[mood.mood] = (moodCounts[mood.mood] || 0) + 1
  }

  const avgBPM = countBPM > 0 ? totalBPM / countBPM : 100
  const avgEnergy = countEnergy > 0 ? totalEnergy / countEnergy : 0.5
  // Топ жанр
  const topGenre = Object.entries(genreCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || ''
  // Топ настроение
  const topMood = Object.entries(moodCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || ''

  console.log(`[ArtistRadio] 📊 Profile: BPM=${avgBPM.toFixed(0)}, E=${avgEnergy.toFixed(2)}, Genre=${topGenre}, Mood=${topMood}`)

  // 2. Поиск кандидатов
  const candidates: ISong[] = []
  const usedIds = new Set<string>()

  // 2a. Треки из топ-жанра (основа)
  if (topGenre) {
    const genreTracks = await getSongsByGenre(topGenre, 300)
    genreTracks.forEach(t => {
      if (t.artist !== artistName && !usedIds.has(t.id)) {
        candidates.push(t)
        usedIds.add(t.id)
      }
    })
  }
  
  // 2b. Еще треки того же артиста (для чередования 30%)
  const moreArtistTracks = await getTopSongs(artistName, 20)
  moreArtistTracks.forEach(t => {
     if (!usedIds.has(t.id)) {
       // Помечаем как "родной" трек для логики чередования
       (t as any).isSeedArtistTrack = true 
       candidates.push(t)
       usedIds.add(t.id)
     }
  })

  console.log(`[ArtistRadio] 📥 Candidates: ${candidates.length}`)

  // 3. Скоринг
  const scoredCandidates = candidates.map(track => {
    const features = analyzeTrack(track)
    const mood = detectMood(features)
    const isSeedTrack = (track as any).isSeedArtistTrack

    // A. Genre Similarity (0.4)
    const genreScore = (track.genre === topGenre) ? 1.0 : 0.5

    // B. Audio Profile Match (0.3)
    // Формула: 1 - (|BPM_diff|/150 + |E_diff|/0.2) -> нормализуем
    const bpmDiff = Math.abs((track.bpm || 100) - avgBPM)
    const eDiff = Math.abs((track.energy || 0.5) - avgEnergy)
    
    // Нормализуем отклонения к 0..1 (1 - идеально, 0 - плохо)
    const bpmMatch = Math.max(0, 1 - (bpmDiff / (avgBPM * 0.3))) // Допуск 30% от BPM
    const eMatch = Math.max(0, 1 - (eDiff / 0.3)) // Допуск 0.3 по энергии
    
    const audioScore = (bpmMatch + eMatch) / 2

    // C. Shared Listeners -> Заменяем на Popularity (PlayCount) (0.2)
    // Нормализуем playCount относительно среднего по больнице (допустим, макс 1000 для простоты)
    const popularityScore = Math.min(1, (track.playCount || 0) / 500)

    // D. User Pref (0.1)
    const userPref = 0.5

    // Бонус за "родные" треки артиста
    const seedBonus = isSeedTrack ? 0.2 : 0 

    // Итого
    let totalScore = 
      (0.4 * genreScore) + 
      (0.3 * audioScore) + 
      (0.2 * popularityScore) + 
      (0.1 * userPref) +
      seedBonus

    return { track, score: totalScore, isSeed: isSeedTrack }
  })

  // Сортировка
  scoredCandidates.sort((a, b) => b.score - a.score)

  // 4. Сборка плейлиста с чередованием
  // Хотим: Seed Track -> 2-3 других -> Seed Track -> ...
  // Или просто: 70% других, 30% этого артиста
  
  const playlist: ISong[] = []
  const others = scoredCandidates.filter(c => !c.isSeed)
  const seeds = scoredCandidates.filter(c => c.isSeed)
  
  // Берем топ种子-трек (самый популярный или первый)
  // Если seeds есть, добавляем их равномерно
  // Но проще: собрать базу из others, и вставить seeds через каждые 3 трека

  const finalOthers = others.slice(0, Math.floor(limit * 0.75))
  const finalSeeds = seeds.slice(0, Math.ceil(limit * 0.25))

  // Микшируем
  let otherIdx = 0
  let seedIdx = 0
  
  while (playlist.length < limit) {
    // Добавляем чужой трек
    if (otherIdx < finalOthers.length) {
      playlist.push(finalOthers[otherIdx].track)
      otherIdx++
    }
    // Добавляем трек сида (каждый 4-й)
    if (playlist.length % 4 === 0 && seedIdx < finalSeeds.length) {
      playlist.push(finalSeeds[seedIdx].track)
      seedIdx++
    }
    
    // Защита от зацикливания
    if (otherIdx >= finalOthers.length && seedIdx >= finalSeeds.length) break
  }

  console.log(`[ArtistRadio] ✅ Generated ${playlist.length} tracks`)

  return {
    songs: playlist.slice(0, limit),
    source: 'artist-radio',
    name: `📻 Радио: ${artistName}`,
    description: `Похожая музыка и хиты ${artistName}`
  }
}

export async function generateSimilarArtistsPlaylist(
  artistId: string,
  limit: number = 25,
  preferredArtists: Record<string, number> = {},
  ratings: Record<string, any> = {}
): Promise<MLWavePlaylist> {
  console.log(`[SimilarArtists] ===== START for artist: ${artistId} =====`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  // MOOD фильтр для похожих исполнителей
  const TARGET_MOODS = ['INTIMATE', 'REFLECTIVE', 'MELANCHOLIC', 'CALM']
  const MOOD_THRESHOLD = 0.4  // Минимальный confidence

  try {
    // ============================================
    // 1. ПОЛУЧАЕМ SEED-АРТИСТА
    // ============================================
    const artist = await subsonic.artists.getOne(artistId)
    if (!artist) {
      throw new Error('Artist not found')
    }

    console.log(`[SimilarArtists] 🎤 Seed artist: ${artist.name}`)

    // Получаем топ треки артиста как seed
    const artistTopSongs = await getTopSongs(artist.name, 5)
    if (artistTopSongs.length === 0) {
      console.warn('[SimilarArtists] No tracks found for seed artist')
      return { songs: [], source: 'similar-artists' }
    }

    // ============================================
    // 2. VIBE SIMILARITY (≥ 0.7)
    // ============================================
    const { analyzeTrack, vibeSimilarity, detectMood } = await import('./vibe-similarity')

    console.log('[SimilarArtists] 🔍 Finding similar tracks by vibe...')

    const allSongs = await getRandomSongs(500)
    const candidates: { track: ISong; similarity: number; isFamiliar: boolean }[] = []

    for (const seed of artistTopSongs.slice(0, 3)) {
      const seedFeatures = analyzeTrack(seed)

      for (const track of allSongs) {
        if (usedSongIds.has(track.id)) continue
        if (track.artist === artist.name) continue  // Исключаем самого артиста

        const similarity = vibeSimilarity(seedFeatures, analyzeTrack(track))
        if (similarity < 0.7) continue  // Порог сходства

        // MOOD фильтр
        const moodResult = detectMood(analyzeTrack(track))
        const moodMatch = TARGET_MOODS.some(m => 
          moodResult.mood.toUpperCase().includes(m) || m.includes(moodResult.mood.toUpperCase())
        )
        
        if (!moodMatch && moodResult.confidence >= MOOD_THRESHOLD) continue

        // Проверяем является ли трек "знакомым" (из предпочтений пользователя)
        const isFamiliar = preferredArtists[track.artistId || ''] > 0

        candidates.push({ track, similarity, isFamiliar })
      }
    }

    // Убираем дубликаты
    const uniqueCandidates = candidates.filter((c, i, self) => 
      i === self.findIndex(other => other.track.id === c.track.id)
    )

    // Сортируем по similarity
    uniqueCandidates.sort((a, b) => b.similarity - a.similarity)

    console.log(`[SimilarArtists] 📥 Found ${uniqueCandidates.length} similar tracks (similarity ≥ 0.7)`)

    // ============================================
    // 3. ЧЕРЕДОВАНИЕ: 80% знакомые / 20% новые
    // ============================================
    const familiarTracks = uniqueCandidates.filter(c => c.isFamiliar)
    const newTracks = uniqueCandidates.filter(c => !c.isFamiliar)

    const familiarLimit = Math.floor(limit * 0.8)
    const newLimit = limit - familiarLimit

    // Берем знакомые треки
    for (const { track } of familiarTracks) {
      if (songs.length >= familiarLimit) break
      
      const aCount = artistCounts[track.artist || ''] || 0
      const gCount = genreCounts[track.genre || ''] || 0

      if (aCount >= 2) continue
      if (gCount >= 4) continue

      songs.push(track)
      usedSongIds.add(track.id)
      artistCounts[track.artist || ''] = aCount + 1
      genreCounts[track.genre || ''] = gCount + 1
    }

    // Берем новые треки
    for (const { track } of newTracks) {
      if (songs.length >= limit) break
      
      const aCount = artistCounts[track.artist || ''] || 0
      const gCount = genreCounts[track.genre || ''] || 0

      if (aCount >= 2) continue
      if (gCount >= 4) continue

      songs.push(track)
      usedSongIds.add(track.id)
      artistCounts[track.artist || ''] = aCount + 1
      genreCounts[track.genre || ''] = gCount + 1
    }

    // ============================================
    // 4. FALLBACK (если мало треков)
    // ============================================
    if (songs.length < limit) {
      console.warn(`[SimilarArtists] Only ${songs.length} tracks. Adding relaxed fallback...`)
      
      const remaining = uniqueCandidates.filter(c => !usedSongIds.has(c.track.id))
      for (const { track } of remaining) {
        if (songs.length >= limit) break
        songs.push(track)
        usedSongIds.add(track.id)
      }
    }

    // ============================================
    // 5. СОРТИРОВКА (чередование энергии для разнообразия)
    // ============================================
    console.log('[SimilarArtists] 🎼 Sorting: alternating energy pattern...')
    
    // Чередование: энергичный → спокойный → энергичный
    songs.sort((a, b) => {
      const energyA = a.energy || 0.5
      const energyB = b.energy || 0.5
      
      // Сначала энергичные, потом спокойные (волна)
      return energyB - energyA
    })

    console.log(`[SimilarArtists] ✅ Generated ${songs.length} tracks`)
    console.log(`[SimilarArtists] 🎤 Artists: ${Object.keys(artistCounts).length}, Genres: ${Object.keys(genreCounts).length}`)

    // Логирование первых треков
    songs.slice(0, 5).forEach((s, i) => {
      const mood = detectMood(analyzeTrack(s))
      console.log(`  ${i+1}. ${s.artist} - ${s.title} (E:${(s.energy || 0.5).toFixed(2)}, MOOD:${mood.mood})`)
    })

    return {
      songs: songs.slice(0, limit),
      source: 'similar-artists',
      name: `🎵 Похожие на ${artist.name}`,
      description: `Треки со схожим vibe и MOOD с ${artist.name}`
    }

  } catch (error) {
    console.error('[SimilarArtists] Error:', error)
    // Fallback: случайные треки
    const fallback = await getRandomSongs(limit)
    return {
      songs: fallback.slice(0, limit),
      source: 'similar-artists-fallback',
      name: '🎵 Похожие исполнители',
      description: 'Случайные треки (ошибка генерации)'
    }
  }
}
