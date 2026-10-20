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
import { tryBrainAutoDJ } from './brain-autodj'
import { readLocalWaveSettings } from './wave-settings-local'
import { isArtistBanned } from './ban-filter'
import { useMLStore } from '@/store/ml.store'
import type { ISong } from '@/types/responses/song'
import type { GenerationSource, BrainSkipReason } from '@/types/generation'

export interface SmartAutoDJOptions {
  /** Сколько треков добавить */
  count: number
  
  /** Сколько кандидатов запросить у ML (по умолчанию count * 3) */
  candidateCount?: number
  
  /** Использовать мосты для плавных переходов */
  addBridges?: boolean
  
  /** Тип энергии: 'wave' | 'ascending' | 'descending' | 'stable' */
  energyCurve?: 'wave' | 'ascending' | 'descending' | 'stable'
  
  /** Индекс текущего трека в songlist. Нужен, чтобы считать остаток очереди. */
  currentIndex?: number

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

  /**
   * Кто на самом деле собрал выдачу. Без этого «мозг отдал 25 треков» и
   * «мозг не ответил, отработал локальный ML» выглядели одинаково —
   * очередь в обоих случаях одного размера.
   */
  source: GenerationSource
  /** Почему мозг не дал треков (null — дал). Только для source !== 'brain'. */
  brainReason: BrainSkipReason | null
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
    currentIndex,
    excludeRecentlyPlayed = [],
    respectTimeOfDay = true,
  } = options

  console.log('[SmartAutoDJ] 🎵 Starting Smart Auto-DJ 2.0...')
  console.log('[SmartAutoDJ] Options:', { count, candidateCount, addBridges, energyCurve })

  // Индекс текущего: без него «последние треки» брались с хвоста массива,
  // а остаток очереди считался как полная длина — из-за чего мозг не
  // дозапрашивался. Если не передан, считаем что играем на конце.
  const idx = typeof currentIndex === 'number' ? currentIndex : songlist.length - 1
  const remainingAfterCurrent = Math.max(0, songlist.length - idx - 1)

  // ============================================
  // 0. BRAIN — ЕДИНСТВЕННЫЙ ИСТОЧНИК ИСТИНЫ
  // ============================================
  // Мозг ранжирует по CLAP, librosa, skip-модели, бандиту, времени суток.
  // Локальный ML ниже построен на хардкод-профилях жанров и в вайб
  // проигрывает мозгу. Раньше треки мозга подставлялись в начало пула, но
  // шаг 3 (VIBE) пересортировывал весь пул заново по локальной
  // vibeSimilarity и резал до top-60% — то есть ранжирование мозга
  // отменялось. Теперь при достаточной выдаче мозга возвращаем её сразу,
  // не трогая локальными фильтрами.
  const poolByExternalId = new Map<string, ISong>()
  for (const s of [...songlist]) poolByExternalId.set(s.id, s)

  let brainSongs: ISong[] = []
  let brainReason: BrainSkipReason | null = null
  let brainPartial = 0

  const brain = await tryBrainAutoDJ({
    queue: songlist,
    current: currentSong,
    count,
    poolByExternalId,
    remainingAfterCurrent,
    // Пилюли волны (настроение/занятие/характер/язык). Без них автопродление
    // спрашивало мозг вообще без контекста: мозг отдавал «просто микс», и
    // выбранное настроение было слышно только в первой пачке, а дальше
    // волна скатывалась в обычную. Общие пилюли живут на сервере, но
    // локальный выбор (my-wave-settings) тоже надо передать.
    waveSettings: readLocalWaveSettings(),
  })
  // reason заполняется всегда: null — мозг дал треки, иначе — почему не дал.
  brainReason = brain.reason

  if (brain.fromBrain && brain.songs.length > 0) {
    const { profile } = useMLStore.getState()
    const bannedArtists = profile.bannedArtists || []
    const fresh = brain.songs.filter(s => !isArtistBanned(s.artistId, s.artist, bannedArtists))
    brainSongs = fresh

    // Мозга хватило на всю пачку — отдаём как есть.
    if (fresh.length >= count) {
      console.log(`[SmartAutoDJ] 🧠 Brain authoritative: ${fresh.length} tracks, local ML skipped`)
      const picks = fresh.slice(0, count)
      return {
        songs: picks,
        candidateCount: picks.length,
        addedCount: picks.length,
        avgEnergy: avgOf(picks, 'energy'),
        avgBpm: avgOf(picks, 'bpm'),
        source: 'brain',
        brainReason: null,
      }
    }

    // Мозг дал меньше, чем просили — локальный ML докладывает хвост.
    console.log(`[SmartAutoDJ] 🧠 Brain partial: ${fresh.length}/${count}, topping up locally`)
    brainPartial = fresh.length
  }

  // ============================================
  // 1. АНАЛИЗ ПОСЛЕДНИХ ТРЕКОВ (контекст)
  // ============================================
  const lastPlayedTracks = songlist.slice(Math.max(0, idx - 4), idx + 1)
  
  console.log(`[SmartAutoDJ] 📊 Analyzing last ${lastPlayedTracks.length} tracks...`)
  
  // Вычисляем средний вайб последних треков
  const lastVibeProfile = lastPlayedTracks.length > 0
    ? lastPlayedTracks.map(t => analyzeTrack(t)).reduce((acc, vibe, _i, arr) => ({
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
  
  // ВАЖНО: Получаем настройку новизны для AutoDJ!
  const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
  const mlPlaylistsState = useMLPlaylistsStore.getState()
  const noveltyFactor = mlPlaylistsState.settings.noveltyFactor ?? 0.2
  const onlyPreferences = noveltyFactor === 0
  
  console.log('[SmartAutoDJ] Novelty factor:', noveltyFactor, 'Only preferences:', onlyPreferences)
  if (onlyPreferences) {
    console.log('[SmartAutoDJ] ⚠️ ONLY PREFERENCES MODE - adding tracks from preferred artists/genres only!')
  }

  // Генерируем кандидатов через ML Recommendations.
  // Новизну функция читает из стора сама — шестой аргумент тут ничего
  // не делал и просто отбрасывался.
  const mlPlaylist = await generateMLRecommendations(
    profile.likedSongs || [],
    ratings,
    profile.preferredGenres,
    profile.preferredArtists,
    candidateCount,
  )

  // Исключаем уже сыгранные и заблокированных артистов
  const playedIds = new Set([
    ...songlist.map(s => s.id),
    ...excludeRecentlyPlayed,
  ])

  // Фильтр для проверки banned artists (ID или имя — см. ban-filter)
  const isBannedArtist = (song: ISong): boolean => {
    const hit = isArtistBanned(song.artistId, song.artist, bannedArtists)
    if (hit) console.log(`[SmartAutoDJ] 🚫 BANNED artist: ${song.artist} (${song.artistId})`)
    return hit
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
  // 2.6. ДОДОПИСЫВАЕМ НЕДОБОР МОЗГА
  // ============================================
  // Мозг уже вызван в шаге 0. Если он дал меньше, чем просили, его треки
  // идут в начало пула, а локальный VIBE-фильтр ниже их пересортирует —
  // это осознанный компромисс ради полного размера пачки. Пересортировка
  // не трогает случай «мозга хватило», он уходит с шага 0.
  if (brainSongs.length > 0) {
    const seen = new Set(candidates.map((s) => s.id))
    const fresh = brainSongs.filter(
      (s) => !playedIds.has(s.id) && !isBannedArtist(s) && !seen.has(s.id),
    )
    if (fresh.length > 0) {
      console.log(`[SmartAutoDJ] 🧠 Brain: ${fresh.length} tracks merged into candidate pool`)
      candidates = [...fresh, ...candidates]
    }
  }

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
  // 4. ВРЕМЯ СУТОК — ДО ОРКЕСТРАЦИИ
  // ============================================
  // Раньше фильтр стоял шагом 6, ПОСЛЕ createEnergyWave. Он вырезал треки
  // из середины волны, ломая дугу, и добор «остальными» заново разрушал
  // порядок. Отбирать по времени суток надо из кандидатов, тогда оркестрация
  // и энергетическая кривая строятся уже по подходящим трекам.
  if (respectTimeOfDay) {
    const hour = new Date().getHours()
    const targetEnergy = getTimeOfDayTargetEnergy(hour)
    console.log(`[SmartAutoDJ] 🕐 Time of day: ${hour}:00, target energy: ${targetEnergy}`)

    const before = candidates.length
    const byTime = candidates.filter(song => Math.abs((song.energy || 0.5) - targetEnergy) < 0.3)

    // Мягкий пол: если фильтр съел больше, чем нужно, лучше взять часть
    // «неподходящих», чем отдать очередь короче count.
    const candidates2 = byTime.length >= Math.min(count, before)
      ? byTime
      : candidates
    if (candidates2.length !== byTime.length) {
      console.log(`[SmartAutoDJ] 🕐 Time filter left ${byTime.length}/${before} — too few, keeping all`)
    } else {
      console.log(`[SmartAutoDJ] 🕐 Time filter: ${byTime.length}/${before} candidates`)
    }
    candidates = candidates2
  }

  // ============================================
  // 5. ОРКЕСТРАТОР: СОРТИРОВКА КАНДИДАТОВ
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
  // 6. ENERGY CURVE: ФИНАЛЬНАЯ СОРТИРОВКА
  // ============================================
  if (energyCurve === 'wave') {
    console.log('[SmartAutoDJ] 📈 ENERGY: Creating energy wave...')
    orchestrated = createEnergyWave(orchestrated)
  }

  // ============================================
  // 7. СТАТИСТИКА
  // ============================================
  const avgEnergy = orchestrated.reduce((sum, s) => sum + (s.energy || 0.5), 0) / orchestrated.length
  const avgBpm = orchestrated.reduce((sum, s) => sum + (s.bpm || 100), 0) / orchestrated.length

  // brainPartial > 0 — мозг дал часть пачки, локальный ML докладывал хвост.
  const source: GenerationSource =
    brainPartial > 0 ? 'mixed' : brainSongs.length > 0 ? 'mixed' : 'local'

  console.log('[SmartAutoDJ] ✅ Complete!')
  console.log('[SmartAutoDJ] Statistics:', {
    addedCount: orchestrated.length,
    avgEnergy: avgEnergy.toFixed(2),
    avgBpm: Math.round(avgBpm),
    source,
    brainReason: brainReason ?? 'brain-answered',
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
    source,
    brainReason,
  }
}

/**
 * Среднее по числовому полю с фолбеком. Поля у brain-треков часто пустые.
 */
function avgOf(songs: ISong[], key: 'energy' | 'bpm', fallback = 0): number {
  if (songs.length === 0) return fallback
  let sum = 0
  for (const s of songs) {
    const v = (s as unknown as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) sum += v
  }
  return sum / songs.length
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
