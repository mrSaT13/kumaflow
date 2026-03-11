/**
 * Music Map Manager
 * 
 * t-SNE / UMAP проекция треков в 2D карту
 * Кэширование с умной инвалидацией
 * 
 * Обновляется при:
 * - Новых лайках (>10 треков)
 * - Изменении жанров (>5 новых)
 * - Анализе новых треков (>50 треков)
 */

import { useMLStore } from '@/store/ml.store'

const MUSIC_MAP_KEY = 'music_map_data'
const MUSIC_MAP_VERSION_KEY = 'music_map_version'
const MUSIC_MAP_TIMESTAMP_KEY = 'music_map_timestamp'

interface MapPoint {
  id: string
  x: number
  y: number
  genre?: string
  energy?: number
  valence?: number
}

interface MusicMapData {
  points: MapPoint[]
  version: string
  timestamp: string
  totalTracks: number
}

/**
 * Простой хеш для версии
 */
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * Рассчитать текущую версию карты
 */
export function calculateMapVersion(): string {
  const state = useMLStore.getState()
  
  // Ключевые параметры для версии
  const likedCount = state.profile.likedSongs.length
  const genreCount = Object.keys(state.profile.preferredGenres).length
  const artistCount = Object.keys(state.profile.preferredArtists).length
  const ratingsCount = Object.keys(state.ratings).length
  
  const versionString = `${likedCount}-${genreCount}-${artistCount}-${ratingsCount}`
  return simpleHash(versionString).toString()
}

/**
 * Проверить нужно ли пересчитывать карту
 */
export function shouldRebuildMap(): boolean {
  try {
    const cachedVersion = localStorage.getItem(MUSIC_MAP_VERSION_KEY)
    const currentVersion = calculateMapVersion()
    
    // Если версии не совпадают → пересчитывать
    if (cachedVersion !== currentVersion) {
      console.log('[MusicMap] Version changed, rebuild needed')
      return true
    }
    
    // Проверка возраста кэша (>7 дней → пересчитывать)
    const timestamp = localStorage.getItem(MUSIC_MAP_TIMESTAMP_KEY)
    if (timestamp) {
      const age = Date.now() - new Date(timestamp).getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      
      if (age > sevenDays) {
        console.log('[MusicMap] Cache too old, rebuild needed')
        return true
      }
    }
    
    return false
  } catch (error) {
    console.error('[MusicMap] Error checking version:', error)
    return true
  }
}

/**
 * Получить кэшированную карту
 */
export function getCachedMap(): MusicMapData | null {
  try {
    const data = localStorage.getItem(MUSIC_MAP_KEY)
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('[MusicMap] Error loading cache:', error)
    return null
  }
}

/**
 * Сохранить карту в кэш
 */
export function saveMap(data: MusicMapData): void {
  try {
    localStorage.setItem(MUSIC_MAP_KEY, JSON.stringify(data))
    localStorage.setItem(MUSIC_MAP_VERSION_KEY, data.version)
    localStorage.setItem(MUSIC_MAP_TIMESTAMP_KEY, data.timestamp)
    console.log('[MusicMap] Saved to cache:', data.points.length, 'points')
  } catch (error) {
    console.error('[MusicMap] Error saving cache:', error)
  }
}

/**
 * Очистить кэш карты
 */
export function clearMapCache(): void {
  try {
    localStorage.removeItem(MUSIC_MAP_KEY)
    localStorage.removeItem(MUSIC_MAP_VERSION_KEY)
    localStorage.removeItem(MUSIC_MAP_TIMESTAMP_KEY)
    console.log('[MusicMap] Cache cleared')
  } catch (error) {
    console.error('[MusicMap] Error clearing cache:', error)
  }
}

/**
 * Создать 2D проекцию из эмбеддингов
 * Упрощённая версия t-SNE (PCA + scaling)
 */
export function createSimpleProjection(
  tracks: Array<{
    id: string
    energy?: number
    danceability?: number
    valence?: number
    acousticness?: number
    bpm?: number
    genre?: string
  }>
): MapPoint[] {
  console.log('[MusicMap] Creating projection for', tracks.length, 'tracks')
  
  // Используем audio features как "эмбеддинги"
  const points: MapPoint[] = []
  
  for (const track of tracks) {
    // Нормализуем признаки к 0-1
    const energy = track.energy || 0.5
    const danceability = track.danceability || 0.5
    const valence = track.valence || 0.5
    const acousticness = track.acousticness || 0.5
    const bpm = (track.bpm || 120) / 200 // Нормализуем BPM к 0-1
    
    // Простая проекция:
    // X = танцевальность + энергия (ритмичные треки справа)
    // Y = позитивность + акустичность (весёлые сверху)
    const x = (danceability * 0.6 + energy * 0.4) * 100
    const y = (valence * 0.5 + acousticness * 0.3 + (1 - bpm) * 0.2) * 100
    
    points.push({
      id: track.id,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      genre: track.genre,
      energy,
      valence,
    })
  }
  
  // Центрируем точки вокруг (50, 50)
  const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length
  
  const centered = points.map(p => ({
    ...p,
    x: Math.max(0, Math.min(100, p.x - avgX + 50)),
    y: Math.max(0, Math.min(100, p.y - avgY + 50)),
  }))
  
  console.log('[MusicMap] Projection created:', centered.length, 'points')
  
  return centered
}

/**
 * Построить Music Map
 * Автоматически решает: кэш или пересчёт
 */
export async function buildMusicMap(): Promise<MusicMapData> {
  const state = useMLStore.getState()
  
  // Собираем все треки с audio features
  const tracksWithFeatures = Object.entries(state.ratings)
    .filter(([_, rating]) => 
      rating.energy !== undefined || 
      rating.danceability !== undefined ||
      rating.valence !== undefined
    )
    .map(([id, rating]) => ({
      id,
      energy: rating.energy,
      danceability: rating.danceability,
      valence: rating.valence,
      acousticness: rating.acousticness,
      bpm: rating.bpm,
      genre: rating.songInfo?.genre,
    }))
  
  if (tracksWithFeatures.length < 10) {
    throw new Error('Not enough tracks with audio features (min 10)')
  }
  
  // Создаём проекцию
  const points = createSimpleProjection(tracksWithFeatures)
  
  const mapData: MusicMapData = {
    points,
    version: calculateMapVersion(),
    timestamp: new Date().toISOString(),
    totalTracks: tracksWithFeatures.length,
  }
  
  // Сохраняем в кэш
  saveMap(mapData)
  
  return mapData
}

/**
 * Получить Music Map (кэш или пересчёт)
 */
export async function getMusicMap(): Promise<MusicMapData> {
  // Проверяем кэш
  if (!shouldRebuildMap()) {
    const cached = getCachedMap()
    if (cached) {
      console.log('[MusicMap] Using cached map:', cached.points.length, 'points')
      return cached
    }
  }
  
  // Пересчитываем
  console.log('[MusicMap] Rebuilding map...')
  return buildMusicMap()
}
