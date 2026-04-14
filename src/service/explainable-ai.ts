/**
 * Explainable AI — Объяснение рекомендаций
 *
 * Генерирует понятные объяснения почему рекомендован тот или иной трек
 */

import type { ISong } from '@/types/responses/song'
import type { MLProfile, TrackRating } from '@/store/ml.store'
import { analyzeTrack, vibeSimilarity } from './vibe-similarity'

export interface Explanation {
  type: 
    | 'similar-track'      // Похож на трек X
    | 'similar-artist'     // Любимый артист
    | 'genre-match'        // Любимый жанр
    | 'bpm-match'          // BPM совпадает с предпочтениями
    | 'energy-match'       // Energy совпадает
    | 'time-of-day'        // Подходит для текущего времени суток
    | 'new-discovery'      // Новая музыка
  text: string
  priority: number  // 1 = самый важный, 5 = наименее важный
  details?: {
    similarity?: number
    trackId?: string
    trackTitle?: string
    artistName?: string
    genre?: string
    genreRank?: number
    bpm?: number
    targetBpm?: { min: number; max: number }
    energy?: number
    targetEnergy?: { min: number; max: number }
    timeOfDay?: 'morning' | 'day' | 'evening' | 'night'
    audioFeatures?: {
      bpm?: number
      energy?: number
      danceability?: number
      valence?: number
      acousticness?: number
      instrumentalness?: number
    }
    matchDetails?: {
      bpmMatch?: boolean
      energyMatch?: boolean
      danceabilityMatch?: boolean
      valenceMatch?: boolean
    }
  }
}

/**
 * Получить объяснение почему рекомендован этот трек
 * С подробной информацией о совпадениях
 */
export function explainRecommendation(
  track: ISong,
  profile: MLProfile,
  ratings: Record<string, TrackRating>,
  listeningHistory?: TrackRating[],
  timeAdaptivityEnabled?: boolean  // Новая переменная
): Explanation[] {
  const explanations: Explanation[] = []
  const audioFeatures = analyzeTrack(track)

  // 1. Ищем похожие треки (Vibe Similarity) — самое важное объяснение
  const similarTrack = findMostSimilarTrack(track, profile, ratings)
  if (similarTrack && similarTrack.similarity > 0.85) {
    explanations.push({
      type: 'similar-track',
      text: `Похоже на "${similarTrack.title}" (${Math.round(similarTrack.similarity * 100)}% совпадение)`,
      priority: 1,
      details: {
        similarity: similarTrack.similarity,
        trackId: similarTrack.id,
        trackTitle: similarTrack.title,
      },
    })
  }

  // 2. Проверяем артиста (лайкнутый?)
  if (track.artistId && profile.preferredArtists[track.artistId]) {
    const weight = profile.preferredArtists[track.artistId]
    if (weight >= 5) {
      explanations.push({
        type: 'similar-artist',
        text: `Любимый артист: ${track.artist} (вес ${weight})`,
        priority: 2,
        details: {
          artistName: track.artist,
        },
      })
    }
  }

  // 3. Проверяем жанр (в топ-3?)
  if (track.genre) {
    const genreRank = getGenreRank(track.genre, profile.preferredGenres)
    if (genreRank <= 3 && genreRank !== 999) {
      explanations.push({
        type: 'genre-match',
        text: `${track.genre} (твой топ-${genreRank} жанр)`,
        priority: 3,
        details: {
          genre: track.genre,
          genreRank,
        },
      })
    }
  }

  // 4. Проверяем время суток (адаптивность) — ТЕПЕРЬ С ПРОВЕРКОЙ НАСТРОЙКИ!
  const timeExplanation = getTimeOfDayExplanation(audioFeatures, timeAdaptivityEnabled)
  if (timeExplanation) {
    explanations.push(timeExplanation)
  }

  // 5. Подробные совпадения по аудио-признакам
  const targetBpm = getTargetBpm(profile)
  const targetEnergy = getTargetEnergy(profile)
  
  const matchDetails: Explanation['details']['matchDetails'] = {}
  
  // BPM совпадение
  if (targetBpm && track.bpm) {
    const bpmMatch = Math.abs(track.bpm - targetBpm.mid) <= targetBpm.range
    if (bpmMatch) {
      matchDetails.bpmMatch = true
      explanations.push({
        type: 'bpm-match',
        text: `Темп: ${track.bpm} BPM (твой диапазон: ${targetBpm.min}-${targetBpm.max})`,
        priority: 4,
        details: {
          bpm: track.bpm,
          targetBpm: { min: targetBpm.min, max: targetBpm.max },
        },
      })
    }
  }

  // Energy совпадение
  if (targetEnergy && track.energy !== undefined) {
    const energyMatch = Math.abs(track.energy - targetEnergy.mid) <= targetEnergy.range
    if (energyMatch) {
      matchDetails.energyMatch = true
      explanations.push({
        type: 'energy-match',
        text: `Энергия: ${track.energy.toFixed(2)} (твой диапазон: ${targetEnergy.min.toFixed(2)}-${targetEnergy.max.toFixed(2)})`,
        priority: 5,
        details: {
          energy: track.energy,
          targetEnergy: { min: targetEnergy.min, max: targetEnergy.max },
        },
      })
    }
  }

  // 6. Добавляем детали аудио-признаков для полноты
  if (explanations.length > 0) {
    // Добавляем аудио-признаки к первому объяснению
    explanations[0].details = {
      ...explanations[0].details,
      audioFeatures: {
        bpm: track.bpm,
        energy: track.energy,
        danceability: audioFeatures.danceability,
        valence: audioFeatures.valence,
        acousticness: audioFeatures.acousticness,
        instrumentalness: audioFeatures.instrumentalness,
      },
      matchDetails,
    }
  }

  // 7. Если ничего не подошло — новое открытие
  if (explanations.length === 0) {
    explanations.push({
      type: 'new-discovery',
      text: 'Новая музыка для тебя',
      priority: 6,
      details: {
        audioFeatures: {
          bpm: track.bpm,
          energy: track.energy,
          danceability: audioFeatures.danceability,
          valence: audioFeatures.valence,
        },
      },
    })
  }

  // Сортируем по приоритету (1 = самый важный)
  return explanations.sort((a, b) => a.priority - b.priority)
}

/**
 * Получить объяснение на основе времени суток
 * ВАЖНО: Проверяет настройку timeAdaptivity!
 */
function getTimeOfDayExplanation(
  features: ReturnType<typeof analyzeTrack>,
  timeAdaptivityEnabled?: boolean
): Explanation | null {
  // Если адаптивность выключена — НЕ показываем объяснения по времени!
  if (timeAdaptivityEnabled === false) {
    return null
  }

  const hour = new Date().getHours()
  
  // Утро (6:00 - 12:00)
  if (hour >= 6 && hour < 12) {
    if (features.energy >= 0.6 && features.bpm >= 100) {
      return {
        type: 'time-of-day',
        text: '☀️ Утро: энергичная музыка для начала дня',
        priority: 3,
        details: {
          timeOfDay: 'morning',
          audioFeatures: {
            energy: features.energy,
            bpm: features.bpm,
          },
        },
      }
    }
  }
  
  // День (12:00 - 18:00)
  if (hour >= 12 && hour < 18) {
    if (features.energy >= 0.4 && features.energy <= 0.8) {
      return {
        type: 'time-of-day',
        text: '🌤️ День: сбалансированная музыка',
        priority: 3,
        details: {
          timeOfDay: 'day',
          audioFeatures: {
            energy: features.energy,
          },
        },
      }
    }
  }
  
  // Вечер (18:00 - 23:00)
  if (hour >= 18 && hour < 23) {
    if (features.energy <= 0.6 && features.bpm <= 110) {
      return {
        type: 'time-of-day',
        text: '🌆 Вечер: спокойная музыка для отдыха',
        priority: 3,
        details: {
          timeOfDay: 'evening',
          audioFeatures: {
            energy: features.energy,
            bpm: features.bpm,
          },
        },
      }
    }
  }
  
  // Ночь (23:00 - 6:00)
  if (hour >= 23 || hour < 6) {
    if (features.energy <= 0.4 && features.bpm <= 90) {
      return {
        type: 'time-of-day',
        text: '🌙 Ночь: медитативная музыка',
        priority: 3,
        details: {
          timeOfDay: 'night',
          audioFeatures: {
            energy: features.energy,
            bpm: features.bpm,
          },
        },
      }
    }
  }
  
  return null
}

/**
 * Найти самый похожий трек из истории прослушиваний
 */
function findMostSimilarTrack(
  track: ISong,
  profile: MLProfile,
  ratings: Record<string, TrackRating>
): { id: string; title: string; similarity: number } | null {
  const targetFeatures = analyzeTrack(track)

  let mostSimilar: { id: string; title: string; similarity: number } | null = null
  let maxSimilarity = 0
  
  let totalCandidates = 0
  let skippedBySkipRatio = 0
  let skippedByPlayCount = 0
  let skippedBySimilarity = 0

  // Ищем среди ХОРОШО прослушанных треков (не просто playCount > 0)
  for (const [songId, rating] of Object.entries(ratings)) {
    if (!rating.songInfo) continue
    
    totalCandidates++
    
    // Пропускаем треки которые пользователь скипал
    const skipRatio = rating.skipCount && rating.playCount ? rating.skipCount / rating.playCount : 0
    if (skipRatio > 0.3) {
      skippedBySkipRatio++
      continue  // Если скипал чаще 30% случаев — не используем
    }
    
    // Трек должен быть либо лайкнут, либо прослушан много раз
    const isLiked = rating.userFavorite || false
    const isWellPlayed = rating.playCount >= 3
    const isHighReplay = rating.replayCount && rating.replayCount > 0
    
    if (!isLiked && !isWellPlayed && !isHighReplay) {
      skippedByPlayCount++
      continue
    }

    const candidateFeatures = analyzeTrack({
      ...rating.songInfo,
      playCount: rating.playCount,
      genre: rating.songInfo.genre || '',
    })

    const similarity = vibeSimilarity(targetFeatures, candidateFeatures)

    // Повышенный порог + проверяем что это действительно похоже
    if (similarity > maxSimilarity && similarity > 0.92) {  // 92% вместо 85%
      maxSimilarity = similarity
      mostSimilar = {
        id: songId,
        title: rating.songInfo.title || 'Unknown',
        similarity,
      }
    } else {
      skippedBySimilarity++
    }
  }
  
  // Лог для отладки
  if (totalCandidates > 0) {
    console.log('[ExplainableAI] findMostSimilarTrack:', {
      targetTrack: track.title,
      totalCandidates,
      skippedBySkipRatio,
      skippedByPlayCount,
      skippedBySimilarity,
      found: mostSimilar ? mostSimilar.title : null,
      similarity: mostSimilar?.similarity,
    })
  }

  return mostSimilar
}

/**
 * Получить ранг жанра в предпочтениях
 */
function getGenreRank(genre: string, preferredGenres: Record<string, number>): number {
  const sortedGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g.toLowerCase())
  
  const rank = sortedGenres.findIndex(g => g === genre.toLowerCase()) + 1
  return rank === 0 ? 999 : rank
}

/**
 * Получить целевой BPM из профиля
 * На основе анализа истории прослушиваний
 */
function getTargetBpm(profile: MLProfile): { min: number; max: number; mid: number; range: number } | null {
  // TODO: Вычислить на основе истории прослушиваний
  // Пока используем дефолтные значения
  // В будущем можно анализировать preferredArtists и их треки
  
  // Дефолтный диапазон: 90-130 BPM (средний темп)
  const min = 90
  const max = 130
  const mid = (min + max) / 2
  const range = (max - min) / 2
  
  return { min, max, mid, range }
}

/**
 * Получить целевую Energy из профиля
 * На основе анализа истории прослушиваний
 */
function getTargetEnergy(profile: MLProfile): { min: number; max: number; mid: number; range: number } | null {
  // TODO: Вычислить на основе истории прослушиваний
  // Пока используем дефолтные значения
  
  // Дефолтный диапазон: 0.4-0.8 (средняя энергия)
  const min = 0.4
  const max = 0.8
  const mid = (min + max) / 2
  const range = (max - min) / 2
  
  return { min, max, mid, range }
}
