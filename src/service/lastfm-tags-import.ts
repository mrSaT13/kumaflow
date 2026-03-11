/**
 * Last.fm Tags Import Service
 * 
 * Импорт жанров и настроений из Last.fm в ML профиль
 * 
 * Использование:
 * import { importArtistTagsFromLastFm, importTrackTagsFromLastFm } from '@/service/lastfm-tags-import'
 */

import { lastFmService } from '@/service/lastfm-api'
import { useMLStore } from '@/store/ml.store'
import { useExternalApiStore } from '@/store/external-api.store'

/**
 * Категоризация тегов Last.fm
 */
const MOOD_TAGS = new Set([
  // Энергия
  'energetic', 'energetic beat', 'upbeat', 'driving', 'powerful',
  'calm', 'calm vocal', 'mellow', 'soft', 'gentle', 'peaceful',
  'aggressive', 'heavy', 'intense', 'dark',
  
  // Настроение
  'happy', 'joyful', 'euphoric', 'uplifting', 'positive',
  'sad', 'melancholic', 'melancholy', 'emotional', 'moody', 'angst',
  'romantic', 'love', 'passionate', 'sensual',
  'angry', 'rebellious', 'protest',
  
  // Атмосфера
  'atmospheric', 'dreamy', 'ethereal', 'spacey', 'psychedelic',
  'dark', 'gothic', 'haunting', 'mysterious',
  'chill', 'chillout', 'laid back', 'relaxing', 'downtempo',
  'party', 'dance', 'club', 'festive',
  
  // Время суток
  'night', 'nightclub', 'evening',
  'morning', 'sunrise', 'day', 'summer',
  
  // Активность
  'workout', 'exercise', 'running', 'gym',
  'sleep', 'meditation', 'study', 'focus',
  'driving', 'road trip', 'travel',
])

const GENRE_BLACKLIST = new Set([
  'seen live', 'live', 'cover', 'tribute',
  'male vocalists', 'female vocalists', 'vocal', 'male vocalist', 'female vocalist',
  '2000s', '2010s', '1990s', '1980s', '90s', '80s', '00s', '10s',
  'american', 'british', 'uk', 'german', 'swedish', 'canadian',
  'english', 'spanish', 'french', 'japanese',
])

/**
 * Проверить является ли тег жанром
 */
function isGenreTag(tagName: string): boolean {
  const lower = tagName.toLowerCase()
  
  // Черный список
  if (GENRE_BLACKLIST.has(lower)) {
    return false
  }
  
  // Если это mood тег - не жанр
  if (MOOD_TAGS.has(lower)) {
    return false
  }
  
  // Остальное считаем жанром
  return true
}

/**
 * Проверить является ли тег настроением
 */
export function isMoodTag(tagName: string): boolean {
  const lower = tagName.toLowerCase()
  return MOOD_TAGS.has(lower)
}

/**
 * Нормализация названия жанра
 */
export function normalizeGenre(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Импорт жанров для лайкнутых артистов
 * 
 * @param artistIds - Массив ID артистов для импорта (опционально, если не указано - все лайкнутые)
 */
export async function importArtistTagsFromLastFm(artistIds?: string[]): Promise<{
  success: boolean
  artistsProcessed: number
  genresAdded: number
  error?: string
}> {
  const state = useExternalApiStore.getState()
  
  // Проверка что Last.fm авторизован
  if (!state.settings.lastFmEnabled || !lastFmService.isAuthorized()) {
    return {
      success: false,
      artistsProcessed: 0,
      genresAdded: 0,
      error: 'Last.fm не авторизован',
    }
  }

  const mlState = useMLStore.getState()
  
  // Получаем лайкнутые артисты из ML профиля
  const likedArtists = mlState.profile?.likedArtists || []
  
  if (likedArtists.length === 0) {
    return {
      success: false,
      artistsProcessed: 0,
      genresAdded: 0,
      error: 'Нет лайкнутых артистов',
    }
  }

  // Если переданы конкретные artistIds - фильтруем
  const artistsToProcess = artistIds 
    ? likedArtists.filter(a => artistIds.includes(a.id))
    : likedArtists

  console.log('[Last.fm Tags] Importing genres for', artistsToProcess.length, 'artists')

  let totalGenresAdded = 0
  let processedCount = 0

  for (const artist of artistsToProcess) {
    try {
      console.log('[Last.fm Tags] Getting tags for:', artist.name)
      
      const tags = await lastFmService.getArtistTags(artist.name, 50)
      
      if (tags.length === 0) {
        console.log('[Last.fm Tags] No tags found for', artist.name)
        continue
      }

      // Фильтруем и нормализуем жанры
      const genres = tags
        .filter(tag => isGenreTag(tag.name))
        .map(tag => ({
          name: normalizeGenre(tag.name),
          weight: tag.count,
        }))
        .slice(0, 20) // Берем топ 20 жанров

      if (genres.length > 0) {
        // Добавляем жанры в ML профиль напрямую через store
        useMLStore.getState().addArtistGenres(artist.id, artist.name, genres)
        totalGenresAdded += genres.length
        console.log('[Last.fm Tags] Added', genres.length, 'genres for', artist.name)
      }

      processedCount++
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error('[Last.fm Tags] Error processing', artist.name, error)
    }
  }

  console.log('[Last.fm Tags] Import complete:', {
    artistsProcessed: processedCount,
    genresAdded: totalGenresAdded,
  })

  return {
    success: true,
    artistsProcessed: processedCount,
    genresAdded: totalGenresAdded,
  }
}

/**
 * Импорт настроений для треков из истории прослушиваний
 * 
 * @param trackIds - Массив ID треков для импорта (опционально)
 */
export async function importTrackTagsFromLastFm(trackIds?: string[]): Promise<{
  success: boolean
  tracksProcessed: number
  moodsAdded: number
  error?: string
}> {
  const state = useExternalApiStore.getState()
  
  // Проверка что Last.fm авторизован
  if (!state.settings.lastFmEnabled || !lastFmService.isAuthorized()) {
    return {
      success: false,
      tracksProcessed: 0,
      moodsAdded: 0,
      error: 'Last.fm не авторизован',
    }
  }

  const mlState = useMLStore.getState()
  
  // Получаем историю прослушиваний из ML профиля
  const listeningHistory = mlState.profile?.listeningHistory || []
  
  if (listeningHistory.length === 0) {
    return {
      success: false,
      tracksProcessed: 0,
      moodsAdded: 0,
      error: 'Нет истории прослушиваний',
    }
  }

  // Берем последние 100 треков для импорта
  const tracksToProcess = trackIds
    ? listeningHistory.filter(t => trackIds.includes(t.songId))
    : listeningHistory.slice(-100)

  console.log('[Last.fm Tags] Importing moods for', tracksToProcess.length, 'tracks')

  let totalMoodsAdded = 0
  let processedCount = 0

  for (const track of tracksToProcess) {
    try {
      const artist = track.songInfo?.artist
      const title = track.songInfo?.title
      
      if (!artist || !title) {
        console.log('[Last.fm Tags] Skipping track without artist/title:', track.songId)
        continue
      }
      
      console.log('[Last.fm Tags] Getting tags for:', title, 'by', artist)
      
      const tags = await lastFmService.getTrackTags(artist, title, 20)
      
      if (tags.length === 0) {
        console.log('[Last.fm Tags] No tags found for', title)
        continue
      }

      // Фильтруем и нормализуем настроения
      const moods = tags
        .filter(tag => isMoodTag(tag.name))
        .map(tag => ({
          name: normalizeGenre(tag.name),
          weight: tag.count,
        }))
        .slice(0, 10) // Берем топ 10 настроений

      if (moods.length > 0) {
        // Добавляем настроения в ML профиль напрямую через store
        useMLStore.getState().addTrackMoods(track.songId, moods)
        totalMoodsAdded += moods.length
        console.log('[Last.fm Tags] Added', moods.length, 'moods for', title)
      }

      processedCount++
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error('[Last.fm Tags] Error processing track', track.songId, error)
    }
  }

  console.log('[Last.fm Tags] Import complete:', {
    tracksProcessed: processedCount,
    moodsAdded: totalMoodsAdded,
  })

  return {
    success: true,
    tracksProcessed: processedCount,
    moodsAdded: totalMoodsAdded,
  }
}

/**
 * Полный импорт тегов (жанры + настроения)
 */
export async function importAllTagsFromLastFm(): Promise<{
  success: boolean
  artistsProcessed: number
  tracksProcessed: number
  genresAdded: number
  moodsAdded: number
  error?: string
}> {
  console.log('[Last.fm Tags] Starting full import...')

  const artistResult = await importArtistTagsFromLastFm()
  const trackResult = await importTrackTagsFromLastFm()

  return {
    success: artistResult.success && trackResult.success,
    artistsProcessed: artistResult.artistsProcessed,
    tracksProcessed: trackResult.tracksProcessed,
    genresAdded: artistResult.genresAdded,
    moodsAdded: trackResult.moodsAdded,
    error: artistResult.error || trackResult.error,
  }
}

/**
 * Массовый импорт по всей библиотеке (жанры артистов + настроения всех треков)
 */
export async function importAllLibraryTagsFromLastFm(): Promise<{
  success: boolean
  artistsProcessed: number
  tracksProcessed: number
  genresAdded: number
  moodsAdded: number
  error?: string
}> {
  console.log('[Last.fm Tags] Starting library import...')
  
  const state = useExternalApiStore.getState()
  
  // Проверка что Last.fm авторизован
  if (!state.settings.lastFmEnabled || !lastFmService.isAuthorized()) {
    return {
      success: false,
      artistsProcessed: 0,
      tracksProcessed: 0,
      genresAdded: 0,
      moodsAdded: 0,
      error: 'Last.fm не авторизован',
    }
  }
  
  const mlState = useMLStore.getState()
  
  // 1. Импорт жанров для лайкнутых артистов
  const artistResult = await importArtistTagsFromLastFm()
  
  // 2. Импорт настроений для всех треков в библиотеке
  const allTracks = mlState.profile?.listeningHistory || []
  
  console.log('[Last.fm Tags] Importing moods for', allTracks.length, 'tracks in library')
  
  let totalMoodsAdded = 0
  let processedCount = 0
  
  for (const track of allTracks) {
    try {
      const artist = track.songInfo?.artist
      const title = track.songInfo?.title
      
      if (!artist || !title) {
        continue
      }
      
      const tags = await lastFmService.getTrackTags(artist, title, 20)
      
      if (tags.length === 0) {
        continue
      }
  
      // Фильтруем настроения
      const moods = tags
        .filter(tag => isMoodTag(tag.name))
        .map(tag => ({
          name: normalizeGenre(tag.name),
          weight: tag.count,
        }))
        .slice(0, 10)
  
      if (moods.length > 0) {
        useMLStore.getState().addTrackMoods(track.songId, moods)
        totalMoodsAdded += moods.length
        processedCount++
      }
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error('[Last.fm Tags] Error processing track', track.songId, error)
    }
  }
  
  console.log('[Last.fm Tags] Library import complete:', {
    artistsProcessed: artistResult.artistsProcessed,
    tracksProcessed: processedCount,
    genresAdded: artistResult.genresAdded,
    moodsAdded: totalMoodsAdded,
  })
  
  return {
    success: true,
    artistsProcessed: artistResult.artistsProcessed,
    tracksProcessed: processedCount,
    genresAdded: artistResult.genresAdded,
    moodsAdded: totalMoodsAdded,
  }
}
