/**
 * Vibe Similarity - Анализ аудио и поиск похожих треков
 * 
 * Анализирует треки по признакам:
 * - Energy (энергия) - по playCount и жанру
 * - Valence (позитивность) - по жанру
 * - Danceability (танцевальность) - по жанру
 * - BPM (темпы) - по жанру
 * - Acousticness (акустичность) - по жанру
 */

export interface VibeFeatures {
  energy: number        // 0-1
  valence: number       // 0-1 (позитивность)
  danceability: number  // 0-1
  bpm: number           // 60-200
  acousticness: number  // 0-1
  instrumentalness: number  // 0-1 (1 = инструментал, 0 = вокал)
}

export type MoodType = 
  | 'energetic'      // Высокая энергия, высокая позитивность
  | 'happy'         // Высокая позитивность
  | 'calm'          // Низкая энергия, высокая позитивность
  | 'sad'           // Низкая энергия, низкая позитивность
  | 'angry'         // Высокая энергия, низкая позитивность
  | 'melancholic'   // Средняя энергия, низкая позитивность
  | 'relaxed'       // Очень низкая энергия
  | 'focused'       // Средняя энергия, инструментал
  | 'romantic'      // Средняя энергия, высокая акустичность
  | 'dramatic'      // Высокая энергия, низкая акустичность

export interface MoodDetection {
  mood: MoodType
  confidence: number  // 0-1
  features: {
    energy: number
    valence: number
    arousal: number   // возбуждение (energy + danceability) / 2
    dominance: number // доминирование (1 - acousticness)
  }
}

export interface VibeTrack {
  id: string
  title: string
  artist: string
  genre: string
  playCount: number
  features: VibeFeatures
}

// Характеристики жанров (приблизительные)
const GENRE_PROFILES: Record<string, Partial<VibeFeatures>> = {
  // Высокая энергия
  'metal': { energy: 0.9, valence: 0.4, danceability: 0.5, bpm: 140, acousticness: 0.1, instrumentalness: 0.2 },
  'rock': { energy: 0.8, valence: 0.5, danceability: 0.5, bpm: 120, acousticness: 0.2, instrumentalness: 0.2 },
  'punk': { energy: 0.95, valence: 0.6, danceability: 0.6, bpm: 160, acousticness: 0.1, instrumentalness: 0.1 },
  'electronic': { energy: 0.85, valence: 0.7, danceability: 0.9, bpm: 128, acousticness: 0.05, instrumentalness: 0.6 },
  'dance': { energy: 0.8, valence: 0.8, danceability: 0.95, bpm: 125, acousticness: 0.05, instrumentalness: 0.3 },
  'hip-hop': { energy: 0.7, valence: 0.6, danceability: 0.8, bpm: 95, acousticness: 0.1, instrumentalness: 0.1 },
  'rap': { energy: 0.75, valence: 0.5, danceability: 0.7, bpm: 90, acousticness: 0.1, instrumentalness: 0.1 },

  // Средняя энергия
  'pop': { energy: 0.6, valence: 0.7, danceability: 0.7, bpm: 110, acousticness: 0.2, instrumentalness: 0.1 },
  'indie': { energy: 0.5, valence: 0.6, danceability: 0.5, bpm: 100, acousticness: 0.4, instrumentalness: 0.3 },
  'alternative': { energy: 0.6, valence: 0.5, danceability: 0.5, bpm: 110, acousticness: 0.3, instrumentalness: 0.2 },
  'r&b': { energy: 0.5, valence: 0.6, danceability: 0.7, bpm: 85, acousticness: 0.2, instrumentalness: 0.2 },
  'soul': { energy: 0.5, valence: 0.6, danceability: 0.6, bpm: 90, acousticness: 0.3, instrumentalness: 0.2 },

  // Низкая энергия - инструменталы
  'jazz': { energy: 0.4, valence: 0.6, danceability: 0.4, bpm: 80, acousticness: 0.7, instrumentalness: 0.6 },
  'classical': { energy: 0.3, valence: 0.5, danceability: 0.2, bpm: 70, acousticness: 0.95, instrumentalness: 0.95 },
  'ambient': { energy: 0.2, valence: 0.5, danceability: 0.2, bpm: 60, acousticness: 0.8, instrumentalness: 0.95 },
  'lo-fi': { energy: 0.3, valence: 0.4, danceability: 0.4, bpm: 75, acousticness: 0.6, instrumentalness: 0.7 },
  'chill': { energy: 0.3, valence: 0.5, danceability: 0.4, bpm: 70, acousticness: 0.6, instrumentalness: 0.5 },
  'acoustic': { energy: 0.3, valence: 0.5, danceability: 0.3, bpm: 80, acousticness: 0.9, instrumentalness: 0.4 },
  'folk': { energy: 0.4, valence: 0.6, danceability: 0.4, bpm: 90, acousticness: 0.8, instrumentalness: 0.3 },
  'ballad': { energy: 0.3, valence: 0.4, danceability: 0.3, bpm: 70, acousticness: 0.7, instrumentalness: 0.2 },
  
  // Инструментальные жанры
  'newage': { energy: 0.3, valence: 0.5, danceability: 0.2, bpm: 70, acousticness: 0.7, instrumentalness: 0.9 },
  'videogame': { energy: 0.5, valence: 0.6, danceability: 0.4, bpm: 100, acousticness: 0.3, instrumentalness: 0.8 },
  'films': { energy: 0.4, valence: 0.5, danceability: 0.3, bpm: 90, acousticness: 0.5, instrumentalness: 0.85 },
  'soundtrack': { energy: 0.4, valence: 0.5, danceability: 0.3, bpm: 90, acousticness: 0.5, instrumentalness: 0.85 },
}

// Значения по умолчанию
const DEFAULT_FEATURES: VibeFeatures = {
  energy: 0.5,
  valence: 0.5,
  danceability: 0.5,
  bpm: 100,
  acousticness: 0.5,
  instrumentalness: 0.5,  // По умолчанию неизвестно
}

/**
 * Получить признаки для жанра
 */
function getGenreFeatures(genre: string): VibeFeatures {
  const normalizedGenre = genre.toLowerCase().trim()
  
  // Ищем точное совпадение
  if (GENRE_PROFILES[normalizedGenre]) {
    return { ...DEFAULT_FEATURES, ...GENRE_PROFILES[normalizedGenre] }
  }
  
  // Ищем частичное совпадение
  for (const [key, features] of Object.entries(GENRE_PROFILES)) {
    if (normalizedGenre.includes(key) || key.includes(normalizedGenre)) {
      return { ...DEFAULT_FEATURES, ...features }
    }
  }
  
  // Возвращаем дефолт
  return DEFAULT_FEATURES
}

/**
 * Анализировать трек и получить признаки
 *
 * Приоритет источников (универсальная проверка):
 * 1. MusicBrainz теги (AcousticBrainz) - если есть в треке
 * 2. Navidrome теги - если есть BPM, energy и т.д.
 * 3. Вычисление по жанру - резервный вариант
 *
 * Использует:
 * - BPM из тегов (если есть) или из жанра
 * - Energy на основе playCount и жанра
 * - Instrumentalness на основе названия (feat, instrumental) и жанра
 */
export function analyzeTrack(track: any): VibeFeatures {
  // Если это аудиокнига - возвращаем нулевые значения (ML не должен учитывать)
  if (track.isAudiobook) {
    return {
      energy: 0,
      valence: 0,
      danceability: 0,
      bpm: 0,
      acousticness: 0,
      instrumentalness: 0,
    }
  }

  const genreFeatures = getGenreFeatures(track.genre || '')

  // Корректируем на основе playCount
  const playCountFactor = Math.min(1, (track.playCount || 0) / 100)

  // ============================================
  // 1. ПРОВЕРЯЕМ MUSICBRAINZ / ACOUSTICBRAZIN ТЕГИ (приоритет)
  // ============================================
  // MusicBrainz Picard добавляет расширенные теги через AcousticBrainz:
  // - acousticness: 0-1
  // - danceability: 0-1
  // - energy: 0-1
  // - valence: 0-1 (позитивность)
  // - instrumentalness: 0-1
  // - bpm: точное значение
  
  const hasMusicBrainzTags = 
    track.acousticness !== undefined ||
    track.danceability !== undefined ||
    track.energy !== undefined ||
    track.valence !== undefined ||
    track.instrumentalness !== undefined

  if (hasMusicBrainzTags) {
    // Парсим BPM из строки вида "140 (теги)" или используем число
    let bpm: number
    if (typeof track.bpm === 'string') {
      const bpmMatch = track.bpm.match(/^(\d+)/)
      bpm = bpmMatch ? parseInt(bpmMatch[1]) : genreFeatures.bpm
    } else if (track.bpm && track.bpm > 0) {
      bpm = track.bpm
    } else {
      bpm = genreFeatures.bpm
    }

    const features: VibeFeatures = {
      energy: track.energy !== undefined ? Math.min(1, Math.max(0, track.energy)) : genreFeatures.energy,
      valence: track.valence !== undefined ? Math.min(1, Math.max(0, track.valence)) : genreFeatures.valence,
      danceability: track.danceability !== undefined ? Math.min(1, Math.max(0, track.danceability)) : genreFeatures.danceability,
      bpm: bpm,
      acousticness: track.acousticness !== undefined ? Math.min(1, Math.max(0, track.acousticness)) : genreFeatures.acousticness,
      instrumentalness: track.instrumentalness !== undefined ? Math.min(1, Math.max(0, track.instrumentalness)) : genreFeatures.instrumentalness,
    }

    console.log('[Vibe] 🎵 MusicBrainz теги найдены:', {
      title: track.title,
      energy: track.energy?.toFixed(2),
      valence: track.valence?.toFixed(2),
      danceability: track.danceability?.toFixed(2),
      acousticness: track.acousticness?.toFixed(2),
      instrumentalness: track.instrumentalness?.toFixed(2),
    })

    return features
  }

  // ============================================
  // 2. ПРОВЕРЯЕМ NAVIDROME ТЕГИ (резерв)
  // ============================================
  // Navidrome может содержать BPM из тегов файла
  
  let bpm: number
  if (typeof track.bpm === 'string') {
    // Парсим строку "140 (теги)" → 140
    const bpmMatch = track.bpm.match(/^(\d+)/)
    bpm = bpmMatch ? parseInt(bpmMatch[1]) : genreFeatures.bpm
  } else if (track.bpm && track.bpm > 0) {
    bpm = track.bpm
  } else {
    bpm = genreFeatures.bpm
  }

  // Определяем instrumentalness
  let instrumentalness = genreFeatures.instrumentalness || 0.5

  // Проверяем название на признаки инструментала
  const title = (track.title || '').toLowerCase()
  if (title.includes('instrumental') ||
      title.includes('theme') ||
      title.includes('soundtrack') ||
      title.includes('ost') ||
      title.includes('score')) {
    instrumentalness = 0.9  // Высокая вероятность инструментала
  }

  // Проверяем на признаки вокала (feat, featuring, vocal)
  if (title.includes('feat') ||
      title.includes('featuring') ||
      title.includes('vocal') ||
      title.includes('ft.')) {
    instrumentalness = 0.1  // Высокая вероятность вокала
  }

  // Жанры с высокой вероятностью инструменталов
  const instrumentalGenres = ['classical', 'ambient', 'newage', 'videogame', 'films', 'soundtrack']
  if (instrumentalGenres.some(g => (track.genre || '').toLowerCase().includes(g))) {
    instrumentalness = Math.max(instrumentalness, 0.7)
  }

  const features: VibeFeatures = {
    energy: Math.min(1, genreFeatures.energy + playCountFactor * 0.1),
    valence: genreFeatures.valence,
    danceability: genreFeatures.danceability,
    bpm: bpm,
    acousticness: genreFeatures.acousticness,
    instrumentalness: instrumentalness,
  }

  console.log('[Vibe] 📀 Navidrome теги (по жанру):', {
    title: track.title,
    genre: track.genre || 'unknown',
    bpm: `${bpm}`,
    energy: features.energy.toFixed(2),
    instrumentalness: features.instrumentalness.toFixed(2),
  })

  return features
}

/**
 * Вычислить расстояние между двумя векторами признаков
 */
export function vibeDistance(a: VibeFeatures, b: VibeFeatures): number {
  const weights = {
    energy: 1.0,
    valence: 0.8,
    danceability: 0.9,
    bpm: 0.7,
    acousticness: 0.6,
  }
  
  const energyDiff = Math.abs(a.energy - b.energy) * weights.energy
  const valenceDiff = Math.abs(a.valence - b.valence) * weights.valence
  const danceabilityDiff = Math.abs(a.danceability - b.danceability) * weights.danceability
  const bpmDiff = Math.abs(a.bpm - b.bpm) / 140 * weights.bpm // Нормализуем BPM
  const acousticnessDiff = Math.abs(a.acousticness - b.acousticness) * weights.acousticness
  
  return (energyDiff + valenceDiff + danceabilityDiff + bpmDiff + acousticnessDiff) / 
         (weights.energy + weights.valence + weights.danceability + weights.bpm + weights.acousticness)
}

/**
 * Вычислить сходство (0-1, где 1 - идентичные)
 */
export function vibeSimilarity(a: VibeFeatures, b: VibeFeatures): number {
  return 1 - vibeDistance(a, b)
}

/**
 * Найти похожие треки по признакам
 */
export function findSimilarTracks(
  targetTrack: any,
  allTracks: any[],
  limit: number = 10,
  minSimilarity: number = 0.7
): any[] {
  const targetFeatures = analyzeTrack(targetTrack)

  const tracksWithSimilarity = allTracks
    .filter(track => track.id !== targetTrack.id && track.genre) // Фильтруем треки без жанра
    .map(track => ({
      track,
      similarity: vibeSimilarity(targetFeatures, analyzeTrack(track)),
    }))
    .filter(({ similarity }) => similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return tracksWithSimilarity.map(({ track }) => track)
}

/**
 * Сгруппировать треки по настроению
 */
export function groupTracksByMood(tracks: any[]): Record<string, any[]> {
  const moodGroups: Record<string, any[]> = {
    energetic: [],
    chill: [],
    happy: [],
    sad: [],
    focused: [],
    party: [],
  }
  
  tracks.forEach(track => {
    const features = analyzeTrack(track)
    
    if (features.energy > 0.7 && features.danceability > 0.7) {
      moodGroups.party.push(track)
    } else if (features.energy > 0.7) {
      moodGroups.energetic.push(track)
    } else if (features.energy < 0.4) {
      moodGroups.chill.push(track)
    } else if (features.valence > 0.7) {
      moodGroups.happy.push(track)
    } else if (features.valence < 0.4) {
      moodGroups.sad.push(track)
    } else if (features.acousticness > 0.6) {
      moodGroups.focused.push(track)
    } else {
      // Распределяем равномерно
      const keys = Object.keys(moodGroups)
      const randomKey = keys[Math.floor(Math.random() * keys.length)]
      moodGroups[randomKey].push(track)
    }
  })
  
  return moodGroups
}

/**
 * Определить настроение трека по аудио-признакам
 * Использует модель Valence-Arousal-Dominance
 */
export function detectMood(features: VibeFeatures): MoodDetection {
  const { energy, valence, danceability, acousticness, instrumentalness } = features

  // Вычисляем производные параметры
  const arousal = (energy + danceability) / 2  // Возбуждение
  const dominance = 1 - acousticness  // Доминирование (1 = электронное, 0 = акустическое)

  // Определяем настроение по комбинации факторов
  let mood: MoodType
  let confidence = 0.5

  // === ВЫСОКАЯ ЭНЕРГИЯ ===
  if (energy > 0.7) {
    if (valence > 0.7) {
      mood = 'energetic'  // Энергичное + позитивное
      confidence = 0.8 + (arousal - 0.7) * 0.2
    } else if (valence < 0.4) {
      mood = 'angry'  // Энергичное + негативное
      confidence = 0.75 + (energy - 0.7) * 0.25
    } else {
      mood = 'dramatic'  // Энергичное + среднее
      confidence = 0.7
    }
  }
  // === НИЗКАЯ ЭНЕРГИЯ ===
  else if (energy < 0.4) {
    if (valence > 0.7) {
      mood = 'calm'  // Спокойное + позитивное
      confidence = 0.8
    } else if (valence < 0.4) {
      mood = 'sad'  // Спокойное + негативное
      confidence = 0.75
    } else {
      mood = 'relaxed'  // Очень спокойное
      confidence = 0.7
    }
  }
  // === СРЕДНЯЯ ЭНЕРГИЯ ===
  else {
    if (instrumentalness > 0.7) {
      mood = 'focused'  // Инструментал для концентрации
      confidence = 0.75 + (instrumentalness - 0.7) * 0.25
    } else if (acousticness > 0.7 && valence > 0.5) {
      mood = 'romantic'  // Акустическое + позитивное
      confidence = 0.7
    } else if (valence < 0.4) {
      mood = 'melancholic'  // Среднее + негативное
      confidence = 0.65
    } else if (valence > 0.7) {
      mood = 'happy'  // Позитивное
      confidence = 0.7
    } else {
      mood = 'calm'  // По умолчанию
      confidence = 0.6
    }
  }

  // Округляем confidence
  confidence = Math.min(1.0, Math.round(confidence * 100) / 100)

  console.log('[Mood Detection]', {
    mood,
    confidence,
    energy: energy.toFixed(2),
    valence: valence.toFixed(2),
    arousal: arousal.toFixed(2),
    dominance: dominance.toFixed(2),
  })

  return {
    mood,
    confidence,
    features: {
      energy,
      valence,
      arousal,
      dominance,
    },
  }
}

/**
 * Получить треки по настроению
 */
export function getTracksByMood(
  tracks: any[],
  targetMood: MoodType,
  limit: number = 25
): any[] {
  const tracksWithMood = tracks
    .map(track => ({
      track,
      moodDetection: detectMood(analyzeTrack(track)),
    }))
    .filter(({ moodDetection }) => moodDetection.mood === targetMood)
    .sort((a, b) => b.moodDetection.confidence - a.moodDetection.confidence)
    .slice(0, limit)

  return tracksWithMood.map(({ track }) => track)
}
