/**
 * Улучшения для Smart Auto-DJ и Оркестратора
 * 
 * ДОПОЛНЕНИЯ К existing функционалу:
 * 1. Dynamic BPM Shaping - автоматическая регулировка темпа
 * 2. Energy Peak Detection - предотвращение "энергетических ям"
 * 3. Genre Transition Scoring - плавные переходы между жанрами
 * 4. Artist Diversity Penalty - штраф за повтор артистов
 */

import { ISong } from '@/types/responses/song'
import { analyzeTrack, vibeSimilarity } from './vibe-similarity'

/**
 * 1. DYNAMIC BPM SHAPING
 * Автоматическая регулировка темпа в зависимости от времени суток
 * 
 * Утро (6-12): 90-120 BPM (плавный рост)
 * День (12-18): 120-140 BPM (активная фаза)
 * Вечер (18-24): 100-120 BPM (спад)
 * Ночь (0-6): 60-90 BPM (релакс)
 */
export function getTargetBPMForTimeOfDay(): { min: number; max: number; target: number } {
  const hour = new Date().getHours()
  
  if (hour >= 6 && hour < 12) {
    // Утро: плавный рост от 90 до 120
    const progress = (hour - 6) / 6
    const target = 90 + (progress * 30)
    return { min: 85, max: 125, target }
  }
  
  if (hour >= 12 && hour < 18) {
    // День: активная фаза 120-140
    return { min: 115, max: 145, target: 130 }
  }
  
  if (hour >= 18 && hour < 24) {
    // Вечер: спад от 120 до 100
    const progress = (hour - 18) / 6
    const target = 120 - (progress * 20)
    return { min: 95, max: 125, target }
  }
  
  // Ночь: релакс 60-90
  return { min: 55, max: 95, target: 75 }
}

/**
 * 2. ENERGY PEAK DETECTION
 * Проверяет последние N треков на наличие "энергетической ямы"
 * Возвращает рекомендацию: нужно ли повысить энергию
 */
export function detectEnergyDip(
  recentTracks: ISong[],
  windowSize = 5
): { hasDip: boolean; severity: number; recommendation: 'increase' | 'maintain' | 'decrease' } {
  if (recentTracks.length < windowSize) {
    return { hasDip: false, severity: 0, recommendation: 'maintain' }
  }
  
  // Анализируем энергию последних треков
  const energies = recentTracks.slice(-windowSize).map(track => {
    const vibe = analyzeTrack(track)
    return vibe.energy
  })
  
  // Вычисляем тренд
  const firstHalf = energies.slice(0, Math.floor(windowSize / 2))
  const secondHalf = energies.slice(Math.floor(windowSize / 2))
  
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
  
  const trend = avgSecond - avgFirst
  
  // Если энергия упала больше чем на 30%
  if (trend < -0.3) {
    return { hasDip: true, severity: Math.abs(trend), recommendation: 'increase' }
  }
  
  // Если энергия слишком высокая больше 5 треков подряд
  if (energies.every(e => e > 0.8)) {
    return { hasDip: false, severity: 0, recommendation: 'decrease' }
  }
  
  return { hasDip: false, severity: 0, recommendation: 'maintain' }
}

/**
 * 3. GENRE TRANSITION SCORING
 * Оценивает плавность перехода между жанрами (0-1)
 * 
 * 1.0 = одинаковые жанры
 * 0.7-0.9 = родственные жанры (rock -> alternative)
 * 0.4-0.6 = смежные жанры (rock -> pop)
 * 0.0-0.3 = контрастные жанры (classical -> metal)
 */
const GENRE_SIMILARITY: Record<string, string[]> = {
  'rock': ['alternative', 'indie', 'hard-rock', 'grunge', 'pop-rock'],
  'pop': ['dance-pop', 'synth-pop', 'indie-pop', 'rock', 'r&b'],
  'electronic': ['edm', 'house', 'techno', 'trance', 'ambient'],
  'hip-hop': ['rap', 'trap', 'r&b', 'soul'],
  'jazz': ['blues', 'soul', 'funk', 'classical'],
  'classical': ['jazz', 'ambient', 'soundtrack'],
  'ambient': ['classical', 'electronic', 'new-age'],
  'metal': ['hard-rock', 'rock', 'punk'],
  'indie': ['alternative', 'indie-pop', 'indie-rock', 'folk'],
  'r&b': ['soul', 'funk', 'hip-hop', 'pop'],
  'folk': ['indie', 'singer-songwriter', 'country'],
  'country': ['folk', 'rock', 'americana'],
}

export function calculateGenreTransitionScore(
  genre1: string | undefined,
  genre2: string | undefined
): number {
  if (!genre1 || !genre2) return 0.5 // Нейтрально если жанры не указаны
  
  const normalized1 = genre1.toLowerCase().split('-')[0]
  const normalized2 = genre2.toLowerCase().split('-')[0]
  
  // Одинаковые жанры
  if (normalized1 === normalized2) return 1.0
  
  // Проверяем родственные связи
  const relatedGenres = GENRE_SIMILARITY[normalized1] || []
  if (relatedGenres.includes(normalized2)) return 0.8
  
  // Проверяем обратные связи
  const reverseRelated = Object.entries(GENRE_SIMILARITY)
    .filter(([_, genres]) => genres.includes(normalized1))
    .map(([genre]) => genre)
  
  if (reverseRelated.includes(normalized2)) return 0.7
  
  // Очень разные жанры
  return 0.3
}

/**
 * 4. ARTIST DIVERSITY PENALTY
 * Штрафует плейлисты где один артист встречается слишком часто
 * 
 * @param tracks - Список треков для анализа
 * @param artistId - ID артиста для проверки
 * @returns Коэффициент штрафа (0-1), где 0 = очень плохо, 1 = отлично
 */
export function calculateArtistDiversityPenalty(
  tracks: ISong[],
  artistId: string | undefined
): number {
  if (!artistId || tracks.length === 0) return 1.0
  
  const artistTrackCount = tracks.filter(t => t.artistId === artistId).length
  const ratio = artistTrackCount / tracks.length
  
  // Если артист занимает больше 30% плейлиста - штраф
  if (ratio > 0.3) return 0.3
  if (ratio > 0.2) return 0.6
  if (ratio > 0.15) return 0.8
  
  return 1.0 // Нормально
}

/**
 * КОМБИНИРОВАННЫЙ СКОРИНГ ДЛЯ AUTO-DJ
 * Оценивает кандидата для добавления в плейлист
 */
export interface CandidateScore {
  song: ISong
  totalScore: number
  breakdown: {
    vibeSimilarity: number
    bpmFit: number
    genreTransition: number
    artistDiversity: number
    energyBalance: number
  }
}

export function scoreCandidateForAutoDJ(
  candidate: ISong,
  recentTracks: ISong[],
  lastTrack: ISong | null
): CandidateScore {
  const candidateVibe = analyzeTrack(candidate)
  
  // 1. Vibe Similarity с последним треком (40%)
  const vibeScore = lastTrack ? vibeSimilarity(candidateVibe, analyzeTrack(lastTrack)) : 0.5
  
  // 2. BPM Fit (20%)
  const targetBPM = getTargetBPMForTimeOfDay()
  const bpmDiff = Math.abs((candidate.bpm || 120) - targetBPM.target)
  const bpmScore = Math.max(0, 1 - (bpmDiff / 50)) // Штраф за отклонение >50 BPM
  
  // 3. Genre Transition (20%)
  const genreScore = lastTrack ? calculateGenreTransitionScore(lastTrack.genre, candidate.genre) : 0.5
  
  // 4. Artist Diversity (10%)
  const diversityScore = calculateArtistDiversityPenalty(recentTracks, candidate.artistId)
  
  // 5. Energy Balance (10%)
  const energyDip = detectEnergyDip(recentTracks)
  let energyScore = 0.5
  if (energyDip.recommendation === 'increase' && candidateVibe.energy > 0.7) {
    energyScore = 1.0 // Бонус за высокую энергию когда нужна
  } else if (energyDip.recommendation === 'decrease' && candidateVibe.energy < 0.4) {
    energyScore = 1.0 // Бонус за низкую энергию когда нужна
  } else if (!energyDip.hasDip) {
    energyScore = 0.8 // Нейтрально
  }
  
  // Взвешенная сумма
  const totalScore = 
    (vibeScore * 0.4) +
    (bpmScore * 0.2) +
    (genreScore * 0.2) +
    (diversityScore * 0.1) +
    (energyScore * 0.1)
  
  return {
    song: candidate,
    totalScore,
    breakdown: {
      vibeSimilarity: vibeScore,
      bpmFit: bpmScore,
      genreTransition: genreScore,
      artistDiversity: diversityScore,
      energyBalance: energyScore,
    }
  }
}

/**
 * УЛУЧШЕННАЯ ФУНКЦИЯ ВЫБОРА ЛУЧШИХ КАНДИДАТОВ
 * Сортирует кандидатов по комбинированному скорингу
 */
export function selectBestCandidates(
  candidates: ISong[],
  recentTracks: ISong[],
  count: number
): ISong[] {
  const lastTrack = recentTracks.length > 0 ? recentTracks[recentTracks.length - 1] : null
  
  // Скорим всех кандидатов
  const scored = candidates.map(candidate => 
    scoreCandidateForAutoDJ(candidate, recentTracks, lastTrack)
  )
  
  // Сортируем по убыванию scores
  scored.sort((a, b) => b.totalScore - a.totalScore)
  
  // Возвращаем топ-N
  return scored.slice(0, count).map(s => s.song)
}

/**
 * Пример использования в generateSmartAutoDJ:
 * 
 * // После получения кандидатов от ML
 * const bestCandidates = selectBestCandidates(
 *   mlCandidates,
 *   lastPlayedTracks,
 *   count
 * )
 * 
 * // Оркестрируем выбранные треки
 * const orchestrated = orchestratePlaylist(bestCandidates, {
 *   startWith: 'energetic',
 *   endWith: 'calm'
 * })
 * 
 * return orchestrated
 */
