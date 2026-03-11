/**
 * Sonic Fingerprint Manager
 * 
 * Автоматически создаёт "сонный отпечаток" вкусов пользователя
 * на основе последних 50-100 прослушанных треков
 * 
 * Интеграция:
 * - Вызывается после каждого scrobble (когда трек прослушан)
 * - Обновляет sonic fingerprint в ML Store
 * - Используется для более точных рекомендаций
 */

import { useMLStore } from '@/store/ml.store'

interface SonicFingerprint {
  avgEnergy: number
  avgDanceability: number
  avgValence: number
  avgAcousticness: number
  avgBpm: number
  topGenres: string[]
  recentTrackIds: string[]
  lastUpdated: string
}

const SONIC_FINGERPRINT_KEY = 'sonic_fingerprint'
const MAX_RECENT_TRACKS = 100
const MIN_TRACKS_FOR_FINGERPRINT = 10

/**
 * Получить текущий sonic fingerprint
 */
export function getSonicFingerprint(): SonicFingerprint | null {
  try {
    const data = localStorage.getItem(SONIC_FINGERPRINT_KEY)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('[SonicFingerprint] Error loading:', error)
    return null
  }
}

/**
 * Сохранить sonic fingerprint
 */
function saveSonicFingerprint(fingerprint: SonicFingerprint): void {
  try {
    localStorage.setItem(SONIC_FINGERPRINT_KEY, JSON.stringify(fingerprint))
    console.log('[SonicFingerprint] Saved:', fingerprint)
  } catch (error) {
    console.error('[SonicFingerprint] Error saving:', error)
  }
}

/**
 * Обновить sonic fingerprint после прослушивания трека
 * Вызывается автоматически из use-auto-scrobble
 */
export async function updateSonicFingerprint(
  trackId: string,
  trackFeatures: {
    energy?: number
    danceability?: number
    valence?: number
    acousticness?: number
    bpm?: number
    genre?: string
  }
): Promise<SonicFingerprint | null> {
  const { getState } = useMLStore
  const state = getState()
  
  // Получаем последние треки из ratings
  const recentTracks = Object.entries(state.ratings)
    .filter(([_, rating]) => rating.playCount > 0)
    .sort((a, b) => {
      const dateA = a[1].lastPlayed ? new Date(a[1].lastPlayed).getTime() : 0
      const dateB = b[1].lastPlayed ? new Date(b[1].lastPlayed).getTime() : 0
      return dateB - dateA
    })
    .slice(0, MAX_RECENT_TRACKS)
    .map(([id]) => id)

  // Нужно минимум треков для fingerprint
  if (recentTracks.length < MIN_TRACKS_FOR_FINGERPRINT) {
    console.log('[SonicFingerprint] Not enough tracks:', recentTracks.length)
    return null
  }

  // Собираем фичи всех треков
  const features: Array<{
    energy: number
    danceability: number
    valence: number
    acousticness: number
    bpm: number
    genre: string
  }> = []

  const genreCount: Record<string, number> = {}

  recentTracks.forEach(id => {
    const rating = state.ratings[id]
    if (rating.bpm !== undefined || rating.energy !== undefined) {
      features.push({
        energy: rating.energy || 0.5,
        danceability: rating.danceability || 0.5,
        valence: rating.valence || 0.5,
        acousticness: rating.acousticness || 0.5,
        bpm: rating.bpm || 120,
        genre: rating.songInfo?.genre || 'unknown',
      })

      // Считаем жанры
      const genre = rating.songInfo?.genre || 'unknown'
      genreCount[genre] = (genreCount[genre] || 0) + 1
    }
  })

  if (features.length < MIN_TRACKS_FOR_FINGERPRINT) {
    return null
  }

  // Вычисляем средние значения
  const avgEnergy = features.reduce((sum, f) => sum + f.energy, 0) / features.length
  const avgDanceability = features.reduce((sum, f) => sum + f.danceability, 0) / features.length
  const avgValence = features.reduce((sum, f) => sum + f.valence, 0) / features.length
  const avgAcousticness = features.reduce((sum, f) => sum + f.acousticness, 0) / features.length
  const avgBpm = features.reduce((sum, f) => sum + f.bpm, 0) / features.length

  // Топ жанров
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre)

  const fingerprint: SonicFingerprint = {
    avgEnergy: Math.round(avgEnergy * 100) / 100,
    avgDanceability: Math.round(avgDanceability * 100) / 100,
    avgValence: Math.round(avgValence * 100) / 100,
    avgAcousticness: Math.round(avgAcousticness * 100) / 100,
    avgBpm: Math.round(avgBpm),
    topGenres,
    recentTrackIds: recentTracks,
    lastUpdated: new Date().toISOString(),
  }

  saveSonicFingerprint(fingerprint)
  console.log('[SonicFingerprint] Updated:', fingerprint)

  return fingerprint
}

/**
 * Получить рекомендации на основе sonic fingerprint
 * Используется в generateMLRecommendations
 */
export function getSonicFingerprintRecommendations(allSongs: any[], limit: number = 25): any[] {
  const fingerprint = getSonicFingerprint()
  
  if (!fingerprint) {
    return []
  }

  // Вычисляем сходство каждого трека с fingerprint
  const scored = allSongs
    .filter(song => song.energy !== undefined || song.bpm !== undefined)
    .map(song => {
      const energyDiff = Math.abs((song.energy || 0.5) - fingerprint.avgEnergy)
      const danceabilityDiff = Math.abs((song.danceability || 0.5) - fingerprint.avgDanceability)
      const valenceDiff = Math.abs((song.valence || 0.5) - fingerprint.avgValence)
      const acousticnessDiff = Math.abs((song.acousticness || 0.5) - fingerprint.avgAcousticness)
      const bpmDiff = Math.abs((song.bpm || 120) - fingerprint.avgBpm) / 100 // Нормализуем BPM

      // Меньше разница = выше score
      const similarity = 1 - (energyDiff * 0.3 + danceabilityDiff * 0.2 + valenceDiff * 0.2 + acousticnessDiff * 0.15 + bpmDiff * 0.15)

      return { song, similarity }
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ song }) => song)

  console.log(`[SonicFingerprint] Found ${scored.length} recommendations`)

  return scored
}
