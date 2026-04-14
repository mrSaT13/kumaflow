/**
 * Library Analyzer — Фоновый анализ библиотеки по артистам
 *
 * Постепенно анализирует все треки в библиотеке:
 * - Извлекает Vibe Features (energy, bpm, danceability, и т.д.)
 * - Определяет настроение (mood)
 * - Сохраняет в кэш для использования в рекомендациях
 *
 * Особенности:
 * - Анализирует по артистам (не все треки сразу)
 * - Сохраняет прогресс (можно прервать)
 * - Повторный запуск → пропускает обработанных
 */

import { subsonic } from '@/service/subsonic'
import { getLimitedArtists, getTopSongs } from '@/service/subsonic-api'
import { analyzeTrack, detectMood } from '@/service/vibe-similarity'

const ANALYSIS_STATE_KEY = 'library_analysis_state'
const TRACK_ANALYSIS_CACHE_KEY = 'track_analysis_cache'
const MAX_CACHE_SIZE = 50000  // Максимум 50K треков в кэше

export interface AnalysisState {
  totalArtists: number
  processedArtists: number
  currentArtistIndex: number
  analyzedArtistIds: string[]
  totalTracksAnalyzed: number
  isScanning: boolean
  lastScanDate: string | null
  lastArtistName: string | null
}

export interface TrackAnalysis {
  songId: string
  features: {
    energy: number
    valence: number
    danceability: number
    bpm: number
    acousticness: number
    instrumentalness: number
    key?: string        // Тональность: "C", "D#", "A"
    scale?: 'major' | 'minor'  // Мажор/минор
    keyConfidence?: number  // Уверенность 0-1
  }
  mood: {
    mood: string
    confidence: number
  }
  analyzedAt: string
}

/**
 * Загрузить состояние анализа
 */
export function loadAnalysisState(): AnalysisState {
  try {
    const data = localStorage.getItem(ANALYSIS_STATE_KEY)
    return data ? JSON.parse(data) : {
      totalArtists: 0,
      processedArtists: 0,
      currentArtistIndex: 0,
      analyzedArtistIds: [],
      totalTracksAnalyzed: 0,
      isScanning: false,
      lastScanDate: null,
      lastArtistName: null,
    }
  } catch (error) {
    console.error('[LibraryAnalyzer] Error loading state:', error)
    return {
      totalArtists: 0,
      processedArtists: 0,
      currentArtistIndex: 0,
      analyzedArtistIds: [],
      totalTracksAnalyzed: 0,
      isScanning: false,
      lastScanDate: null,
      lastArtistName: null,
    }
  }
}

/**
 * Сохранить состояние анализа
 */
export function saveAnalysisState(state: AnalysisState): void {
  try {
    localStorage.setItem(ANALYSIS_STATE_KEY, JSON.stringify(state))
    console.log('[LibraryAnalyzer] State saved:', state)
  } catch (error) {
    console.error('[LibraryAnalyzer] Error saving state:', error)
  }
}

/**
 * Сохранить анализ трека в кэш
 */
export async function saveTrackAnalysis(
  songId: string,
  analysis: TrackAnalysis
): Promise<void> {
  try {
    // Получаем текущий кэш
    const cacheData = localStorage.getItem(TRACK_ANALYSIS_CACHE_KEY)
    const cache = cacheData ? JSON.parse(cacheData) : {}
    
    // Проверяем размер кэша
    const cacheSize = Object.keys(cache).length
    if (cacheSize >= MAX_CACHE_SIZE) {
      // Удаляем oldest 10% кэша
      const keysToDelete = Object.keys(cache).slice(0, Math.floor(MAX_CACHE_SIZE * 0.1))
      keysToDelete.forEach(key => delete cache[key])
      console.log(`[LibraryAnalyzer] Cache cleanup: removed ${keysToDelete.length} old entries`)
    }
    
    // Сохраняем анализ
    cache[songId] = analysis
    
    // Сохраняем обратно
    localStorage.setItem(TRACK_ANALYSIS_CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.error('[LibraryAnalyzer] Error saving track analysis:', error)
    
    // Если память переполнена — очищаем 50% кэша
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[LibraryAnalyzer] Storage quota exceeded, cleaning up 50%...')
      const cacheData = localStorage.getItem(TRACK_ANALYSIS_CACHE_KEY)
      if (cacheData) {
        const cache = JSON.parse(cacheData)
        const keys = Object.keys(cache)
        const keysToDelete = keys.slice(0, Math.floor(keys.length * 0.5))
        keysToDelete.forEach(key => delete cache[key])
        localStorage.setItem(TRACK_ANALYSIS_CACHE_KEY, JSON.stringify(cache))
      }
    }
  }
}

/**
 * Получить анализ трека из кэша
 */
export function getTrackAnalysis(songId: string): TrackAnalysis | null {
  try {
    const cacheData = localStorage.getItem(TRACK_ANALYSIS_CACHE_KEY)
    if (!cacheData) return null
    
    const cache = JSON.parse(cacheData)
    return cache[songId] || null
  } catch (error) {
    console.error('[LibraryAnalyzer] Error getting track analysis:', error)
    return null
  }
}

/**
 * Начать анализ библиотеки
 */
export async function startLibraryAnalysis(
  onProgress?: (state: AnalysisState) => void,
  onComplete?: (state: AnalysisState) => void
): Promise<void> {
  console.log('[LibraryAnalyzer] Starting analysis...')
  
  // Получаем всех артистов (с лимитом 10000 чтобы не было дублей)
  console.log('[LibraryAnalyzer] Fetching all artists...')
  const allArtists = await getLimitedArtists(10000)
  
  if (allArtists.length === 0) {
    console.log('[LibraryAnalyzer] No artists found')
    return
  }
  
  console.log('[LibraryAnalyzer] Total artists:', allArtists.length)
  
  // Загружаем состояние
  let state = loadAnalysisState()
  
  // Если уже сканируем — выходим
  if (state.isScanning) {
    console.log('[LibraryAnalyzer] Already scanning')
    return
  }
  
  // Обновляем состояние
  state.totalArtists = allArtists.length
  state.isScanning = true
  
  // Если индекс больше общего количества — сбрасываем
  if (state.currentArtistIndex >= allArtists.length) {
    state.currentArtistIndex = 0
    state.processedArtists = 0
    state.analyzedArtistIds = []
    state.totalTracksAnalyzed = 0
  }
  
  saveAnalysisState(state)
  
  // Идём по артистам
  for (let i = state.currentArtistIndex; i < allArtists.length; i++) {
    const artist = allArtists[i]
    
    // Проверяем не обработан ли уже
    if (state.analyzedArtistIds.includes(artist.id)) {
      console.log('[LibraryAnalyzer] Skipping artist:', artist.name)
      continue
    }
    
    console.log(`[LibraryAnalyzer] Processing artist ${i + 1}/${allArtists.length}: ${artist.name}`)
    
    try {
      // Получаем топ-треки артиста (УМЕНЬШЕНО до 20 для экономии ресурсов)
      const artistSongs = await getTopSongs(artist.name, 20)

      console.log(`[LibraryAnalyzer] Found ${artistSongs.length} tracks for ${artist.name}`)

      // Анализируем каждый трек
      for (const song of artistSongs) {
        const features = analyzeTrack({
          ...song,
          playCount: song.playCount || 0,
        })

        const mood = detectMood(features)

        const analysis: TrackAnalysis = {
          songId: song.id,
          features,
          mood,
          analyzedAt: new Date().toISOString(),
        }

        // Сохраняем в кэш
        await saveTrackAnalysis(song.id, analysis)
        state.totalTracksAnalyzed++
      }

      // Обновляем прогресс
      state.processedArtists++
      state.currentArtistIndex = i + 1
      state.analyzedArtistIds.push(artist.id)
      state.lastArtistName = artist.name

      saveAnalysisState(state)

      // Вызываем callback прогресса
      if (onProgress) {
        onProgress(state)
      }

      // УВЕЛИЧЕНА задержка для экономии ресурсов (50ms вместо 10ms)
      await new Promise(resolve => setTimeout(resolve, 50))
      
    } catch (error) {
      console.error(`[LibraryAnalyzer] Error processing artist ${artist.name}:`, error)
    }
  }
  
  // Завершено!
  state.isScanning = false
  state.lastScanDate = new Date().toISOString()
  saveAnalysisState(state)
  
  console.log('[LibraryAnalyzer] Analysis complete!')
  console.log(`[LibraryAnalyzer] Total tracks analyzed: ${state.totalTracksAnalyzed}`)
  
  if (onComplete) {
    onComplete(state)
  }
}

/**
 * Остановить анализ
 */
export function stopLibraryAnalysis(): void {
  const state = loadAnalysisState()
  state.isScanning = false
  saveAnalysisState(state)
  console.log('[LibraryAnalyzer] Analysis stopped')
}

/**
 * Сбросить прогресс анализа
 */
export function resetAnalysisProgress(): void {
  const state: AnalysisState = {
    totalArtists: 0,
    processedArtists: 0,
    currentArtistIndex: 0,
    analyzedArtistIds: [],
    totalTracksAnalyzed: 0,
    isScanning: false,
    lastScanDate: null,
    lastArtistName: null,
  }
  saveAnalysisState(state)
  localStorage.removeItem(TRACK_ANALYSIS_CACHE_KEY)
  console.log('[LibraryAnalyzer] Analysis progress reset')
}

/**
 * Получить статистику анализа
 */
export function getAnalysisStats(): AnalysisState & { percentComplete: number } {
  const state = loadAnalysisState()
  const percentComplete = state.totalArtists > 0
    ? Math.round((state.processedArtists / state.totalArtists) * 100)
    : 0
  
  return {
    ...state,
    percentComplete,
  }
}
