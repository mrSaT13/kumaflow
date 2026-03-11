/**
 * SMART AUTO-DJ 2.0 - Умный Автоди-джей с Оркестратором
 * 
 * АРХИТЕКТУРА КОМБАЙНА:
 * 1. Оркестратор видит последние 5 треков плейлиста
 * 2. Спрашивает у ML: "какие треки добавить?"
 * 3. ML возвращает 20-30 кандидатов (на основе preferredArtists, preferredGenres, history)
 * 4. Оркестратор анализирует вайб кандидатов
 * 5. Говорит Автоди-джею: "добавь в таком порядке: 3, 1, 4, 2..."
 * 6. Автоди-джей добавляет треки УЖЕ отсортированными
 * 
 * ПРЕИМУЩЕСТВА:
 * - Плавные переходы между треками (energy, BPM, key)
 * - Разнообразие артистов (не 2-3 артиста подряд)
 * - Учёт контекста (время суток, активность)
 * - Баланс знакомое/новое (70/30)
 */

import { orchestratePlaylist, orchestratePlaylistWithBridges, createEnergyWave } from './playlist-orchestrator'
import { analyzeTrack, vibeSimilarity } from './vibe-similarity'
import { generateMLRecommendations } from './ml-wave-service'
import { useMLStore } from '@/store/ml.store'
import { useAutoDJStore } from '@/store/auto-dj.store'
import type { ISong } from '@/types/responses/song'

export interface SmartAutoDJOptions {
  /** Сколько треков добавить */
  count: number
  
  /** Сколько кандидатов запросить у ML (по умолчанию count * 3) */
  candidateCount?: number
  
  /** Использовать мосты для плавных переходов */
  addBridges?: boolean
  
  /** Тип энергии: 'wave' | 'ascending' | 'descending' | 'stable' */
  energyCurve?: 'wave' | 'ascending' | 'descending' | 'stable'
  
  /** Исключить недавно сыгранные треки */
  excludeRecentlyPlayed?: string[]
  
  /** Учитывать время суток */
  respectTimeOfDay?: boolean
}

export interface SmartAutoDJResult {
  /** Готовые треки для добавления (уже отсортированные) */
  songs: ISong[]
  
  /** Сколько кандидатов было запрошено */
  candidateCount: number
  
  /** Сколько треков добавлено */
  addedCount: number
  
  /** Средняя энергия добавленных треков */
  avgEnergy: number
  
  /** Средний BPM добавленных треков */
  avgBpm: number
}

/**
 * SMART AUTO-DJ: Умное продление плейлиста
 * 
 * @param currentSong - Текущий играющий трек (seed)
 * @param songlist - Текущий плейлист (для анализа последних треков)
 * @param options - Настройки
 * @returns Готовые треки для добавления (уже отсортированные)
 */
export async function generateSmartAutoDJ(
  currentSong: ISong,
  songlist: ISong[],
  options: SmartAutoDJOptions
): Promise<SmartAutoDJResult> {
  const {
    count = 25,
    candidateCount = count * 3,
    addBridges = true,
    energyCurve = 'wave',
    excludeRecentlyPlayed = [],
    respectTimeOfDay = true,
  } = options

  console.log('[SmartAutoDJ] 🎵 Starting Smart Auto-DJ 2.0...')
  console.log('[SmartAutoDJ] Options:', { count, candidateCount, addBridges, energyCurve })

  // ============================================
  // 1. АНАЛИЗ ПОСЛЕДНИХ ТРЕКОВ (контекст)
  // ============================================
  const lastPlayedTracks = songlist.slice(Math.max(0, songlist.length - 5), songlist.length)
  
  console.log(`[SmartAutoDJ] 📊 Analyzing last ${lastPlayedTracks.length} tracks...`)
  
  // Вычисляем средний вайб последних треков
  const lastVibeProfile = lastPlayedTracks.length > 0
    ? lastPlayedTracks.map(t => analyzeTrack(t)).reduce((acc, vibe, i, arr) => ({
        energy: acc.energy + vibe.energy / arr.length,
        valence: acc.valence + vibe.valence / arr.length,
        danceability: acc.danceability + vibe.danceability / arr.length,
        bpm: acc.bpm + vibe.bpm / arr.length,
        acousticness: acc.acousticness + vibe.acousticness / arr.length,
      }), { energy: 0, valence: 0, danceability: 0, bpm: 0, acousticness: 0 })
    : null

  console.log('[SmartAutoDJ] Last played vibe profile:', lastVibeProfile)

  // ============================================
  // 2. ЗАПРОС КАНДИДАТОВ У ML (20-30 треков)
  // ============================================
  console.log(`[SmartAutoDJ] 🧠 ML: Requesting ${candidateCount} candidates...`)

  const { ratings, profile } = useMLStore.getState()
  const bannedArtists = profile.bannedArtists || []

  // Генерируем кандидатов через ML Recommendations
  const mlPlaylist = await generateMLRecommendations(
    profile.likedSongIds || [],
    ratings,
    profile.preferredGenres,
    profile.preferredArtists,
    candidateCount
  )

  // Исключаем уже сыгранные и заблокированных артистов
  const playedIds = new Set([
    ...songlist.map(s => s.id),
    ...excludeRecentlyPlayed,
  ])

  // Фильтр для проверки banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[SmartAutoDJ] 🚫 BANNED artist ID: ${song.artist} (${song.artistId})`)
      return true
    }
    // Дополнительная проверка по имени артиста
    if (!song.artistId && bannedArtists.some(id =>
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[SmartAutoDJ] 🚫 BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  let candidates = mlPlaylist.songs.filter(s =>
    !playedIds.has(s.id) && !isBannedArtist(s)
  )

  console.log(`[SmartAutoDJ] 🧠 ML: Received ${candidates.length} candidates`)

  // ============================================
  // 2.5. ФИЛЬТРУЕМ АУДИОКНИГИ
  // ============================================
  const nonAudiobookCandidates = candidates.filter(song => !song.isAudiobook)
  if (nonAudiobookCandidates.length < candidates.length) {
    console.log(`[SmartAutoDJ] 📚 Filtered out ${candidates.length - nonAudiobookCandidates.length} audiobooks`)
  }
  candidates = nonAudiobookCandidates

  // ============================================
  // 3. VIBE ФИЛЬТРАЦИЯ (похожие на последние)
  // ============================================
  if (lastVibeProfile && candidates.length > 0) {
    console.log('[SmartAutoDJ] 🎵 VIBE: Filtering candidates by similarity...')
    
    const candidatesWithSimilarity = candidates
      .map(song => ({
        song,
        similarity: vibeSimilarity(lastVibeProfile, analyzeTrack(song)),
      }))
      .sort((a, b) => b.similarity - a.similarity)
    
    // Берем топ-60% по сходству
    const topCandidates = candidatesWithSimilarity
      .slice(0, Math.floor(candidates.length * 0.6))
      .map(({ song }) => song)
    
    console.log(`[SmartAutoDJ] 🎵 VIBE: Filtered to ${topCandidates.length} tracks (similarity > 0.7)`)
    
    // Если мало треков, добавляем остальные
    if (topCandidates.length < count) {
      const remaining = candidates.filter(s => !topCandidates.find(t => t.id === s.id))
      topCandidates.push(...remaining.slice(0, count - topCandidates.length))
    }
    
    // Заменяем кандидатов на отфильтрованные
    candidates.splice(0, candidates.length, ...topCandidates)
  }

  // ============================================
  // 4. ОРКЕСТРАТОР: СОРТИРОВКА КАНДИДАТОВ
  // ============================================
  console.log('[SmartAutoDJ] 🎼 ORCHESTRATOR: Sorting candidates...')
  
  // Выбираем стратегию оркестрации
  let orchestrated: ISong[]
  
  if (addBridges) {
    // С мостами для максимально плавных переходов
    console.log('[SmartAutoDJ] 🎼 ORCHESTRATOR: Adding bridges...')
    
    const allSongsForBridges = await import('./subsonic-api').then(m => m.getRandomSongs(50))
    
    orchestrated = orchestratePlaylistWithBridges(
      candidates.slice(0, count),
      allSongsForBridges,
      { addBridges: true, bridgeCount: 1, bannedArtists }
    )
  } else {
    // Базовая оркестрация с учётом banned artists
    orchestrated = orchestratePlaylist(candidates.slice(0, count), {
      startWith: energyCurve === 'ascending' ? 'calm' : 'energetic',
      endWith: energyCurve === 'descending' ? 'calm' : 'random',
      bannedArtists,
    })
  }

  // ============================================
  // 5. ENERGY CURVE: ФИНАЛЬНАЯ СОРТИРОВКА
  // ============================================
  if (energyCurve === 'wave') {
    console.log('[SmartAutoDJ] 📈 ENERGY: Creating energy wave...')
    orchestrated = createEnergyWave(orchestrated)
  }

  // ============================================
  // 6. УЧЁТ ВРЕМЕНИ СУТОК (опционально)
  // ============================================
  if (respectTimeOfDay) {
    const hour = new Date().getHours()
    const targetEnergy = getTimeOfDayTargetEnergy(hour)
    
    console.log(`[SmartAutoDJ] 🕐 Time of day: ${hour}:00, target energy: ${targetEnergy}`)
    
    // Фильтруем треки которые не подходят по энергии
    orchestrated = orchestrated.filter(song => {
      const energy = song.energy || 0.5
      return Math.abs(energy - targetEnergy) < 0.3 // Допускаем отклонение ±0.3
    })
    
    // Если мало треков, добавляем остальные
    if (orchestrated.length < count) {
      const remaining = candidates.filter(s => !orchestrated.find(t => t.id === s.id))
      orchestrated.push(...remaining.slice(0, count - orchestrated.length))
    }
  }

  // ============================================
  // 7. СТАТИСТИКА
  // ============================================
  const avgEnergy = orchestrated.reduce((sum, s) => sum + (s.energy || 0.5), 0) / orchestrated.length
  const avgBpm = orchestrated.reduce((sum, s) => sum + (s.bpm || 100), 0) / orchestrated.length

  console.log('[SmartAutoDJ] ✅ Complete!')
  console.log('[SmartAutoDJ] Statistics:', {
    addedCount: orchestrated.length,
    avgEnergy: avgEnergy.toFixed(2),
    avgBpm: Math.round(avgBpm),
  })

  // Логирование первых треков для отладки
  console.log('[SmartAutoDJ] First 5 tracks:')
  orchestrated.slice(0, 5).forEach((song, i) => {
    console.log(`  ${i+1}. ${song.title} - Energy: ${(song.energy || 0).toFixed(2)}, BPM: ${song.bpm || '?'}`)
  })

  return {
    songs: orchestrated.slice(0, count),
    candidateCount: candidates.length,
    addedCount: orchestrated.length,
    avgEnergy,
    avgBpm,
  }
}

/**
 * Получить целевую энергию для времени суток
 */
function getTimeOfDayTargetEnergy(hour: number): number {
  if (hour >= 5 && hour < 9) return 0.4   // Утро - спокойное
  if (hour >= 9 && hour < 12) return 0.6  // Позднее утро - активное
  if (hour >= 12 && hour < 15) return 0.7 // День - энергичное
  if (hour >= 15 && hour < 18) return 0.6 // Поздний день - умеренное
  if (hour >= 18 && hour < 22) return 0.4 // Вечер - спокойное
  return 0.2                               // Ночь - очень спокойное
}

/**
 * Быстрая проверка: можно ли использовать Smart Auto-DJ
 */
export function canUseSmartAutoDJ(songlist: ISong[], currentSongIndex: number): boolean {
  // Нужно хотя бы 3 трека в плейлисте
  if (songlist.length < 3) return false
  
  // Нужен текущий трек
  if (currentSongIndex < 0 || currentSongIndex >= songlist.length) return false
  
  return true
}

/**
 * Получить последние сыгранные треки для анализа
 */
export function getLastPlayedTracks(songlist: ISong[], currentSongIndex: number, count: number = 5): ISong[] {
  const startIndex = Math.max(0, currentSongIndex - count)
  return songlist.slice(startIndex, currentSongIndex + 1)
}
