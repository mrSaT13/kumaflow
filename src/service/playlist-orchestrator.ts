/**
 * Playlist Orchestrator - Упорядочивание треков по вайбу
 *
 * Использует спектральный анализ для создания плавных переходов
 * между треками в плейлисте.
 *
 * Алгоритм:
 * 1. Анализируем каждый трек (VibeFeatures)
 * 2. Начинаем с самого энергичного трека
 * 3. Каждый следующий = самый похожий на предыдущий (алгоритм ближайшего соседа)
 * 4. Harmonic mixing: учитываем музыкальный ключ для плавных переходов
 */

import { VibeFeatures, analyzeTrack, vibeSimilarity, detectMood } from './vibe-similarity'
import { ISong } from '@/types/responses/song'

// Camelot wheel для harmonic mixing
const CAMELOT_WHEEL: Record<string, string[]> = {
  '1': ['1B', '12B', '2B', '1A', '12A', '2A'], // C major / A minor
  '2': ['2B', '1B', '3B', '2A', '1A', '3A'], // G major / E minor
  '3': ['3B', '2B', '4B', '3A', '2A', '4A'], // D major / B minor
  '4': ['4B', '3B', '5B', '4A', '3A', '5A'], // A major / F# minor
  '5': ['5B', '4B', '6B', '5A', '4A', '6A'], // E major / C# minor
  '6': ['6B', '5B', '7B', '6A', '5A', '7A'], // B major / G# minor
  '7': ['7B', '6B', '8B', '7A', '6A', '8A'], // F# major / D# minor
  '8': ['8B', '7B', '9B', '8A', '7A', '9A'], // Db major / Bb minor
  '9': ['9B', '8B', '10B', '9A', '8A', '10A'], // Ab major / F minor
  '10': ['10B', '9B', '11B', '10A', '9A', '11A'], // Eb major / C minor
  '11': ['11B', '10B', '12B', '11A', '10A', '12A'], // Bb major / G minor
  '12': ['12B', '11B', '1B', '12A', '11A', '1A'], // F major / D minor
}

// Маппинг ключей в Camelot wheel
const KEY_TO_CAMELOT: Record<string, string> = {
  'C': '8B', 'Cm': '3A',
  'C#': '1B', 'C#m': '6A',
  'Db': '8B', 'Dbm': '3A',
  'D': '2B', 'Dm': '7A',
  'D#': '4B', 'D#m': '9A',
  'Eb': '3B', 'Ebm': '8A',
  'E': '12B', 'Em': '5A',
  'F': '7B', 'Fm': '10A',
  'F#': '2B', 'F#m': '11A',
  'Gb': '2B', 'Gbm': '11A',
  'G': '9B', 'Gm': '4A',
  'G#': '11B', 'G#m': '1A',
  'Ab': '4B', 'Abm': '9A',
  'A': '6B', 'Am': '12A',
  'A#': '8B', 'A#m': '2A',
  'Bb': '10B', 'Bbm': '5A',
  'B': '5B', 'Bm': '10A',
}

export interface OrchestratedTrack {
  track: ISong
  features: VibeFeatures
  position: number
}

export interface OrchestrationOptions {
  startWith?: 'energetic' | 'calm' | 'random'
  endWith?: 'energetic' | 'calm' | 'random'
  groupByMood?: boolean
}

/**
 * Упорядочить плейлист по вайбу (спектральное сходство)
 */
export function orchestratePlaylist(
  tracks: ISong[],
  options: OrchestrationOptions & { excludedSongIds?: Set<string>; bannedArtists?: string[] } = {}
): ISong[] {
  const { excludedSongIds, bannedArtists, ...orchestrationOptions } = options

  // Исключаем дизлайкнутые треки
  let filteredTracks = excludedSongIds
    ? tracks.filter(track => !excludedSongIds.has(track.id))
    : tracks

  // Исключаем заблокированных артистов
  if (bannedArtists && bannedArtists.length > 0) {
    const beforeCount = filteredTracks.length
    filteredTracks = filteredTracks.filter(track => {
      if (track.artistId && bannedArtists.includes(track.artistId)) {
        console.log(`[Orchestrator] 🚫 Skipping banned artist: ${track.artist} (${track.artistId})`)
        return false
      }
      // Проверка по имени артиста
      if (!track.artistId && bannedArtists.some(id => 
        track.artist && track.artist.toLowerCase().includes(id.toLowerCase())
      )) {
        console.log(`[Orchestrator] 🚫 Skipping banned artist: ${track.artist}`)
        return false
      }
      return true
    })
    console.log(`[Orchestrator] Filtered out ${beforeCount - filteredTracks.length} tracks from banned artists`)
  }

  if (filteredTracks.length <= 1) return [...filteredTracks]

  const {
    startWith = 'energetic',
    endWith = 'random',
    groupByMood = false,
  } = orchestrationOptions

  console.log('[Orchestrator] Starting playlist orchestration...', {
    trackCount: filteredTracks.length,
    options: orchestrationOptions,
  })

  // 1. Анализируем каждый трек (создаём копию массива)
  const tracksWithFeatures: OrchestratedTrack[] = [...filteredTracks].map((track, index) => ({
    track,
    features: analyzeTrack(track),
    position: index,
  }))

  // 2. Выбираем первый трек
  let firstTrack: OrchestratedTrack
  if (startWith === 'energetic') {
    // Самый энергичный
    firstTrack = tracksWithFeatures.reduce((max, track) =>
      track.features.energy > max.features.energy ? track : max
    )
  } else if (startWith === 'calm') {
    // Самый спокойный
    firstTrack = tracksWithFeatures.reduce((min, track) =>
      track.features.energy < min.features.energy ? track : min
    )
  } else {
    // Случайный
    firstTrack = tracksWithFeatures[Math.floor(Math.random() * tracksWithFeatures.length)]
  }

  console.log('[Orchestrator] First track:', firstTrack.track.title, {
    energy: firstTrack.features.energy,
    bpm: firstTrack.features.bpm,
  })

  // 3. Алгоритм ближайшего соседа С ЗАЩИТОЙ ОТ ПОВТОРА АРТИСТОВ
  const result: OrchestratedTrack[] = [firstTrack]
  const remaining = tracksWithFeatures.filter(t => t !== firstTrack)

  while (remaining.length > 0) {
    const lastTrack = result[result.length - 1]
    const lastArtist = lastTrack.track.artist || ''

    // Находим самый похожий трек НО НЕ того же артиста
    let mostSimilar: OrchestratedTrack | null = null
    let highestSimilarity = -1
    
    // Сначала ищем похожие с ДРУГИМ артистом
    for (const track of remaining) {
      const trackArtist = track.track.artist || ''
      
      // ПРОПУСКАЕМ если тот же артист подряд
      if (trackArtist === lastArtist && trackArtist !== '') {
        continue
      }
      
      const similarity = vibeSimilarity(lastTrack.features, track.features)
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity
        mostSimilar = track
      }
    }
    
    // Если не нашли с другим артистом - берём любой (fallback)
    if (!mostSimilar && remaining.length > 0) {
      for (const track of remaining) {
        const similarity = vibeSimilarity(lastTrack.features, track.features)
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity
          mostSimilar = track
        }
      }
    }

    if (mostSimilar) {
      result.push(mostSimilar)
      remaining.splice(remaining.indexOf(mostSimilar), 1)
    }
  }
  
  // Проверка на повторы артистов
  const artistRepeats = result.filter((t, i) => 
    i > 0 && t.track.artist === result[i-1].track.artist && t.track.artist !== ''
  ).length
  
  if (artistRepeats > 0) {
    console.log(`[Orchestrator] ⚠️ ${artistRepeats} artist repeats detected (out of ${result.length} tracks)`)
  } else {
    console.log(`[Orchestrator] ✅ No artist repeats!`)
  }

  console.log('[Orchestrator] Orchestration complete!')
  console.log('[Orchestrator] First 5 tracks energy:', result.slice(0, 5).map(t => t.features.energy.toFixed(2)))

  return result.map(t => t.track)
}

/**
 * Сгруппировать треки по настроению внутри плейлиста
 * (для создания "волн" энергии)
 */
export function groupByMood(tracks: ISong[]): ISong[] {
  const tracksWithFeatures = [...tracks].map(track => ({
    track,
    features: analyzeTrack(track),
  }))

  // Сортируем по энергии
  const sorted = tracksWithFeatures.sort((a, b) => {
    // Сначала спокойные, потом энергичные, потом снова спокойные
    const energyA = a.features.energy
    const energyB = b.features.energy

    // Создаём "арку" энергии
    const arcA = Math.abs(energyA - 0.5)
    const arcB = Math.abs(energyB - 0.5)

    return arcA - arcB
  })

  return sorted.map(t => t.track)
}

/**
 * Создать "волну" энергии в плейлисте
 * Начинаем спокойно → нарастание → пик → спад
 */
export function createEnergyWave(tracks: ISong[]): ISong[] {
  const tracksWithFeatures = [...tracks].map(track => ({
    track,
    features: analyzeTrack(track),
  }))

  // Сортируем по энергии
  const sortedByEnergy = tracksWithFeatures.sort((a, b) =>
    a.features.energy - b.features.energy
  )

  // Разделяем на 4 части
  const quarter = Math.floor(sortedByEnergy.length / 4)
  const calm = sortedByEnergy.slice(0, quarter)
  const medium = sortedByEnergy.slice(quarter, quarter * 2)
  const energetic = sortedByEnergy.slice(quarter * 2, quarter * 3)
  const veryEnergetic = sortedByEnergy.slice(quarter * 3)

  // Создаём волну: спокойно → средне → энергично → очень энергично → средне → спокойно
  const wave = [
    ...calm,
    ...medium,
    ...energetic,
    ...veryEnergetic,
    ...medium.slice(0, Math.floor(medium.length / 2)),
    ...calm.slice(0, Math.floor(calm.length / 2)),
  ]

  // Перемешиваем внутри каждой секции для разнообразия
  return wave.map(t => t.track)
}

/**
 * Оптимизировать плейлист для конкретного времени суток
 */
export function optimizeForTimeOfDay(
  tracks: ISong[],
  hour: number
): ISong[] {
  const tracksWithFeatures = [...tracks].map(track => ({
    track,
    features: analyzeTrack(track),
  }))

  // Утро (6-12) - постепенное нарастание энергии
  if (hour >= 6 && hour < 12) {
    return tracksWithFeatures
      .sort((a, b) => a.features.energy - b.features.energy)
      .map(t => t.track)
  }

  // День (12-18) - высокая энергия
  if (hour >= 12 && hour < 18) {
    return tracksWithFeatures
      .sort((a, b) => b.features.energy - a.features.energy)
      .map(t => t.track)
  }

  // Вечер (18-22) - спад энергии
  if (hour >= 18 && hour < 22) {
    return tracksWithFeatures
      .sort((a, b) => a.features.valence - b.features.valence)
      .map(t => t.track)
  }

  // Ночь (22-6) - спокойная музыка
  return tracksWithFeatures
    .sort((a, b) => {
      const scoreA = a.features.energy + a.features.acousticness
      const scoreB = b.features.energy + b.features.acousticness
      return scoreA - scoreB
    })
    .map(t => t.track)
}

/**
 * Экспорт данных анализа для обучения оркестратора
 * Собирает статистику по всем трекам с анализом
 */
export interface OrchestrationTrainingData {
  trackId: string
  title: string
  artist: string
  bpm: number
  energy: number
  danceability: number
  valence: number
  acousticness: number
  genre?: string
  playCount?: number
}

export function collectTrainingData(tracks: ISong[]): OrchestrationTrainingData[] {
  const trainingData: OrchestrationTrainingData[] = []

  for (const track of tracks) {
    const features = analyzeTrack(track)

    // Пропускаем треки без данных анализа
    if (!features || features.energy === undefined) continue

    trainingData.push({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      bpm: features.bpm,
      energy: features.energy,
      danceability: features.danceability,
      valence: features.valence,
      acousticness: features.acousticness,
      genre: track.genre,
      playCount: track.playCount,
    })
  }

  console.log(`[Orchestrator] Collected training data for ${trainingData.length} tracks`)
  return trainingData
}

/**
 * Экспорт данных в JSON для внешнего обучения
 */
export function exportTrainingData(tracks: ISong[]): string {
  const data = collectTrainingData(tracks)
  return JSON.stringify(data, null, 2)
}

/**
 * Получить статистику по плейлисту
 */
export function getPlaylistStats(tracks: ISong[]): {
  avgBpm: number
  avgEnergy: number
  avgDanceability: number
  avgValence: number
  avgAcousticness: number
  trackCount: number
} {
  if (tracks.length === 0) {
    return {
      avgBpm: 0,
      avgEnergy: 0,
      avgDanceability: 0,
      avgValence: 0,
      avgAcousticness: 0,
      trackCount: 0,
    }
  }

  const tracksWithFeatures = tracks.map(track => ({
    track,
    features: analyzeTrack(track),
  }))

  const total = tracksWithFeatures.length
  const sumBpm = tracksWithFeatures.reduce((sum, t) => sum + t.features.bpm, 0)
  const sumEnergy = tracksWithFeatures.reduce((sum, t) => sum + t.features.energy, 0)
  const sumDanceability = tracksWithFeatures.reduce((sum, t) => sum + t.features.danceability, 0)
  const sumValence = tracksWithFeatures.reduce((sum, t) => sum + t.features.valence, 0)
  const sumAcousticness = tracksWithFeatures.reduce((sum, t) => sum + t.features.acousticness, 0)

  return {
    avgBpm: Math.round(sumBpm / total),
    avgEnergy: Math.round((sumEnergy / total) * 100) / 100,
    avgDanceability: Math.round((sumDanceability / total) * 100) / 100,
    avgValence: Math.round((sumValence / total) * 100) / 100,
    avgAcousticness: Math.round((sumAcousticness / total) * 100) / 100,
    trackCount: total,
  }
}

/**
 * Проверка совместимости ключей (harmonic mixing)
 * Возвращает true если ключи совместимы для плавного перехода
 */
export function areKeysCompatible(key1?: string, key2?: string): boolean {
  if (!key1 || !key2) return true // Если ключи не указаны, считаем совместимыми

  const camelot1 = KEY_TO_CAMELOT[key1]
  const camelot2 = KEY_TO_CAMELOT[key2]

  if (!camelot1 || !camelot2) return true // Если ключи не распознаны, считаем совместимыми

  // Извлекаем номер из Camelot кода (например, "12B" → "12")
  const number1 = camelot1.replace(/[AB]$/, '')
  const compatibleKeys = CAMELOT_WHEEL[number1] || []

  return compatibleKeys.includes(camelot2)
}

/**
 * Рассчитать совместимость треков для перехода
 * Учитывает energy, bpm, key и настроение
 */
export function calculateTransitionScore(track1: ISong, track2: ISong): number {
  const features1 = analyzeTrack(track1)
  const features2 = analyzeTrack(track2)

  // Определяем настроения треков
  const mood1 = detectMood(features1)
  const mood2 = detectMood(features2)

  let score = 100

  // Энергия: разница не больше 0.3
  const energyDiff = Math.abs(features1.energy - features2.energy)
  if (energyDiff > 0.3) score -= 20
  if (energyDiff > 0.5) score -= 15  // Дополнительный штраф за большую разницу

  // BPM: разница не больше 20
  const bpmDiff = Math.abs(features1.bpm - features2.bpm)
  if (bpmDiff > 20) score -= 20
  if (bpmDiff > 40) score -= 15  // Дополнительный штраф за большую разницу

  // Настроение: одинаковое или соседнее = хорошо
  if (mood1.mood !== mood2.mood) {
    // Проверяем совместимость настроений
    const compatibleMoods: Record<string, string[]> = {
      'energetic': ['happy', 'dramatic', 'angry'],
      'happy': ['energetic', 'calm', 'romantic'],
      'calm': ['happy', 'relaxed', 'sad', 'romantic'],
      'sad': ['calm', 'melancholic', 'relaxed'],
      'angry': ['energetic', 'dramatic'],
      'melancholic': ['sad', 'focused', 'relaxed'],
      'relaxed': ['calm', 'sad', 'romantic'],
      'focused': ['melancholic', 'romantic'],
      'romantic': ['calm', 'happy', 'relaxed', 'focused'],
      'dramatic': ['energetic', 'angry'],
    }

    if (!compatibleMoods[mood1.mood]?.includes(mood2.mood)) {
      score -= 25  // Несовместимые настроения
    }
  }

  // Ключ: совместимость
  if (!areKeysCompatible(track1.key, track2.key)) {
    score -= 30
  }

  return Math.max(0, score)
}

/**
 * Найти "мост" между двумя треками
 * Возвращает трек который плавно соединяет start и end
 * Учитывает настроение для более плавных переходов
 */
export function findBridgeTrack(
  startTrack: ISong,
  endTrack: ISong,
  allSongs: ISong[],
  excludedIds: Set<string> = new Set()
): ISong | null {
  const startFeatures = analyzeTrack(startTrack)
  const endFeatures = analyzeTrack(endTrack)

  // Определяем настроения
  const startMood = detectMood(startFeatures)
  const endMood = detectMood(endFeatures)

  // Целевые特征 (среднее между start и end)
  const targetFeatures = {
    energy: (startFeatures.energy + endFeatures.energy) / 2,
    danceability: (startFeatures.danceability + endFeatures.danceability) / 2,
    valence: (startFeatures.valence + endFeatures.valence) / 2,
    bpm: (startFeatures.bpm + endFeatures.bpm) / 2,
  }

  // Ищем трек который ближе всего к целевым特征
  let bestTrack: ISong | null = null
  let bestScore = Infinity

  for (const song of allSongs) {
    // Пропускаем исключённые треки
    if (excludedIds.has(song.id)) continue
    if (song.id === startTrack.id || song.id === endTrack.id) continue

    const songFeatures = analyzeTrack(song)
    const songMood = detectMood(songFeatures)

    // Расстояние до целевых特征
    const distance =
      Math.abs(songFeatures.energy - targetFeatures.energy) +
      Math.abs(songFeatures.danceability - targetFeatures.danceability) +
      Math.abs(songFeatures.valence - targetFeatures.valence) +
      Math.abs(songFeatures.bpm - targetFeatures.bpm) / 100 // Нормализуем BPM

    // Бонус за совместимое настроение
    const moodBonus = (songMood.mood === startMood.mood || 
                       songMood.mood === endMood.mood ||
                       songMood.mood === 'calm' || 
                       songMood.mood === 'relaxed') ? -0.2 : 0

    const finalScore = distance + moodBonus

    if (finalScore < bestScore) {
      bestScore = finalScore
      bestTrack = song
    }
  }

  if (bestTrack) {
    console.log(`[Orchestrator] Found bridge: "${bestTrack.title}" (${bestTrack.artist})`)
  }

  return bestTrack
}

/**
 * Добавить плавные переходы между треками
 * Вставляет "мосты" между каждой парой треков
 */
export function orchestratePlaylistWithBridges(
  tracks: ISong[],
  allSongs: ISong[],
  options: { addBridges?: boolean; bridgeCount?: number; bannedArtists?: string[] } = {}
): ISong[] {
  const { addBridges = true, bridgeCount = 1, bannedArtists } = options

  if (!addBridges || tracks.length < 2) {
    return orchestratePlaylist(tracks, { bannedArtists })
  }

  console.log('[Orchestrator] Adding bridges between tracks...')

  // Сначала оркестрируем основные треки с учётом banned artists
  const orchestrated = orchestratePlaylist(tracks, { bannedArtists })
  const result: ISong[] = []
  const usedIds = new Set<string>(orchestrated.map(t => t.id))

  for (let i = 0; i < orchestrated.length; i++) {
    result.push(orchestrated[i])

    // Добавляем мост между треками (кроме последнего)
    if (i < orchestrated.length - 1) {
      const current = orchestrated[i]
      const next = orchestrated[i + 1]

      // Проверяем нужен ли мост (если переход резкий)
      const transitionScore = calculateTransitionScore(current, next)

      if (transitionScore < 70) {
        // Переход резкий → ищем мост
        for (let b = 0; b < bridgeCount; b++) {
          const bridge = findBridgeTrack(current, next, allSongs, usedIds)

          if (bridge) {
            result.push(bridge)
            usedIds.add(bridge.id)
            console.log(`[Orchestrator] Bridge added: ${bridge.title}`)
          }
        }
      }
    }
  }

  console.log(`[Orchestrator] Final playlist: ${result.length} tracks (${orchestrated.length} main + ${result.length - orchestrated.length} bridges)`)

  return result
}
