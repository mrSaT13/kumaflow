/**
 * ML Wave Service - IMPROVED VERSIONS
 * 
 * Этот файл содержит все улучшенные версии функций из старой версии (ml-wave-service(old).ts).
 * Они включают все исправления которые мы делали до ошибок.
 */

import { subsonic } from '@/service/subsonic'
import { getTopSongs, getSongsByGenre, getRandomSongs } from '@/service/subsonic-api'
import { useMLStore } from '@/store/ml.store'
import { playlistCache } from '@/service/playlist-cache'
import type { ISong } from '@/types/responses/song'

export interface MLWavePlaylist {
  songs: ISong[]
  source: string
}

export interface MLPlaylistMetadata {
  id: string
  type: string
  name: string
  description: string
  createdAt: string
  expiresAt?: string
}

// ===========================
// КОНФИГУРАЦИЯ ДЕСЯТИЛЕТИЙ
// ===========================
const DECADE_CONFIG: Record<string, {
  years: [number, number]
  genres: string[]
  anchorTracks?: { artist: string; title: string }[]
  sort: 'chronological' | 'popularity'
}> = {
  '80s': {
    years: [1980, 1989],
    genres: ['synth-pop', 'new-wave', 'disco', 'hard-rock', 'pop', 'rock'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'a-ha', title: 'Take On Me' },
      { artist: 'Depeche Mode', title: 'Personal Jesus' },
    ]
  },
  '90s': {
    years: [1990, 1999],
    genres: ['grunge', 'britpop', 'hip-hop', 'eurodance', 'alternative', 'r&b'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'Nirvana', title: 'Smells Like Teen Spirit' },
      { artist: 'Oasis', title: 'Wonderwall' },
    ]
  },
  '2000s': {
    years: [2000, 2009],
    genres: ['pop-rock', 'r&b', 'electro-house', 'hip-hop', 'pop', 'rock'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'Linkin Park', title: 'In The End' },
      { artist: 'OutKast', title: 'Hey Ya!' },
    ]
  },
  '2010s': {
    years: [2010, 2019],
    genres: ['edm', 'trap', 'indie-pop', 'k-pop', 'pop', 'hip-hop'],
    sort: 'chronological',
    anchorTracks: [
      { artist: 'The Weeknd', title: 'Blinding Lights' },
      { artist: 'Dua Lipa', title: 'New Rules' },
    ]
  },
  '2020s': {
    years: [2020, 2029],
    genres: ['modern-pop', 'hyperpop', 'lo-fi', 'pop', 'hip-hop', 'indie'],
    sort: 'chronological',
    anchorTracks: []
  }
}

/**
 * Daily Mix V2 - "Забытые" треки + Vibe Similarity
 * 
 * ИЗ СТАРОЙ ВЕРСИИ (ml-wave-service(old).ts):
 * - 50% забытые треки (5+ plays, 2+ months not played)
 * - 10% похожие на забытые
 * - BPM/MOOD фильтр
 */
export async function generateDailyMixV2(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  preferredArtists: Record<string, number>,
  limit: number = 30
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  const now = new Date()
  const twoMonthsAgo = Date.now() - (60 * 24 * 60 * 60 * 1000)

  console.log(`[DailyMixV2] ===== START: Generating ${limit} tracks =====`)

  // ============================================
  // 1. "ЗАБЫТЫЕ" ТРЕКИ (50%)
  // ============================================
  const forgottenCount = Math.floor(limit * 0.50)

  const forgottenTrackIds = Object.entries(ratings || {})
    .filter(([id, rating]: [string, any]) => {
      if (!rating.playCount || rating.playCount < 5) return false
      if (!rating.lastPlayed) return false
      const lastPlayed = new Date(rating.lastPlayed).getTime()
      return lastPlayed <= twoMonthsAgo
    })
    .map(([id]) => id)

  console.log(`[DailyMixV2] 🕰️ Found ${forgottenTrackIds.length} forgotten tracks`)

  if (forgottenTrackIds.length > 0) {
    const { analyzeTrack } = await import('./vibe-similarity')

    const shuffledForgotten = forgottenTrackIds.sort(() => Math.random() - 0.5).slice(0, forgottenCount + 20)
    const forgottenSongsResults = await Promise.all(
      shuffledForgotten.map(id => subsonic.songs.getSong(id).catch(() => null))
    )

    const validForgottenSongs = forgottenSongsResults.filter((s): s is ISong => s != null && !usedSongIds.has(s.id))

    if (validForgottenSongs.length > 0) {
      const userAvgEnergy = validForgottenSongs.reduce((sum, s) => sum + (s.energy || 0.5), 0) / validForgottenSongs.length
      const userAvgBPM = validForgottenSongs.reduce((sum, s) => sum + (s.bpm || 100), 0) / validForgottenSongs.length

      const energyMin = Math.max(0, userAvgEnergy - 0.3)
      const energyMax = Math.min(1, userAvgEnergy + 0.3)
      const bpmMin = userAvgBPM * 0.7
      const bpmMax = userAvgBPM * 1.3

      const filteredForgotten = validForgottenSongs.filter(s => {
        const energyOk = !s.energy || (s.energy >= energyMin && s.energy <= energyMax)
        const bpmOk = !s.bpm || s.bpm === 0 || (s.bpm >= bpmMin && s.bpm <= bpmMax)
        return energyOk && bpmOk
      })

      console.log(`[DailyMixV2] 🕰️ Filtered to ${filteredForgotten.length} forgotten tracks`)

      for (const song of filteredForgotten.slice(0, forgottenCount)) {
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
  }

  console.log(`[DailyMixV2] 🕰️ FORGOTTEN: Added ${songs.length} tracks`)

  // ============================================
  // 2. VIBE SIMILARITY К "ЗАБЫТЫМ" (10%)
  // ============================================
  const vibeSimilarCount = Math.floor(limit * 0.10)

  if (songs.length > 0 && vibeSimilarCount > 0) {
    console.log(`[DailyMixV2] 🎵 VIBE SIMILAR: Finding ${vibeSimilarCount} tracks similar to forgotten...`)
    const { findSimilarTracks } = await import('./vibe-similarity')

    const seedTracks = songs.slice(0, 3)
    const allSongs = await getRandomSongs(300)

    for (const seed of seedTracks) {
      if (songs.length >= forgottenCount + vibeSimilarCount) break

      const similar = findSimilarTracks(seed, allSongs, 8, 0.6)
      for (const track of similar) {
        if (songs.length >= forgottenCount + vibeSimilarCount) break
        if (track?.genre && !usedSongIds.has(track.id)) {
          songs.push(track)
          usedSongIds.add(track.id)
        }
      }
    }
  }

  // ============================================
  // 3. ДОБИВАЕМ СЛУЧАЙНЫМИ (40%)
  // ============================================
  if (songs.length < limit) {
    const randomSongs = await getRandomSongs(limit - songs.length + 50)
    for (const song of randomSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  // ============================================
  // 4. ОРКЕСТРАТОР
  // ============================================
  console.log(`[DailyMixV2] 🎼 ORCHESTRATOR: Creating smooth transitions...`)

  const { orchestratePlaylist } = await import('./playlist-orchestrator')
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
    bannedArtists,
  })

  console.log(`[DailyMixV2] ✅ Generated ${orchestrated.length} tracks`)

  return {
    playlist: {
      songs: orchestrated,
      source: 'daily-mix-v2',
    },
    metadata: {
      id: `daily-mix-${now.toISOString().split('T')[0]}`,
      type: 'daily-mix',
      name: 'Ежедневный микс',
      description: `Персональный микс на ${now.toLocaleDateString('ru-RU')}`,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
  }
}

/**
 * Discover Weekly V2 - Соседние жанры + Аудио-профиль
 * 
 * ИЗ СТАРОЙ ВЕРСИИ (ml-wave-service(old).ts):
 * - Аудио-профиль пользователя (avgBPM, avgEnergy, TopMoods)
 * - 70% соседние жанры (niche), 30% случайные
 * - MOOD/E фильтр
 */
export async function generateDiscoverWeeklyV2(
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  limit: number = 20
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  console.log(`[DiscoverWeeklyV2] ===== START: Generating ${limit} tracks =====`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>(likedSongIds)

  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []

  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))

  const now = new Date()

  // ============================================
  // 0. АНАЛИЗ АУДИО-ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
  // ============================================
  console.log(`[DiscoverWeeklyV2] 🎵 Building user audio profile...`)
  const { analyzeTrack } = await import('./vibe-similarity')

  let userAvgEnergy = 0.5
  let userAvgBPM = 100
  const userMoodCounts: Record<string, number> = {}

  if (likedSongIds.length > 0) {
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 50).map(id => subsonic.songs.getSong(id).catch(() => null))
    )

    const validLikedSongs = likedSongsResults.filter((s): s is ISong => s != null)

    if (validLikedSongs.length > 0) {
      let totalEnergy = 0, totalBPM = 0, countEnergy = 0, countBPM = 0

      validLikedSongs.forEach(song => {
        if (song.energy) { totalEnergy += song.energy; countEnergy++ }
        if (song.bpm) { totalBPM += song.bpm; countBPM++ }
        if (song.moods) {
          song.moods.forEach(mood => {
            const m = mood.toUpperCase()
            userMoodCounts[m] = (userMoodCounts[m] || 0) + 1
          })
        }
      })

      userAvgEnergy = countEnergy > 0 ? totalEnergy / countEnergy : 0.5
      userAvgBPM = countBPM > 0 ? totalBPM / countBPM : 100
    }
  }

  const userTopMoods = Object.entries(userMoodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mood]) => mood)

  console.log(`[DiscoverWeeklyV2] 🎵 User Profile: Energy=${userAvgEnergy.toFixed(2)}, BPM=${userAvgBPM.toFixed(0)}, Top Moods=${userTopMoods.join(', ')}`)

  // ============================================
  // 1. СОСЕДНИЕ ЖАНРЫ (NICHE) - 70%
  // ============================================
  const nicheCount = Math.floor(limit * 0.70)
  console.log(`[DiscoverWeeklyV2] 🎼 NICHE: Finding ${nicheCount} tracks from similar genres...`)

  const similarGenreMap: Record<string, string[]> = {
    'rock': ['post-rock', 'shoegaze', 'math rock', 'indie rock', 'alternative', 'grunge'],
    'pop': ['synthpop', 'dream pop', 'indie pop', 'electropop', 'chamber pop'],
    'electronic': ['ambient', 'IDM', 'glitch', 'downtempo', 'trip-hop', 'house'],
    'hip-hop': ['lo-fi hip hop', 'boom bap', 'jazz rap', 'conscious hip hop', 'trap'],
    'jazz': ['smooth jazz', 'bebop', 'fusion', 'acid jazz', 'free jazz'],
    'classical': ['neoclassical', 'contemporary classical', 'romantic', 'baroque'],
    'metal': ['progressive metal', 'post-metal', 'black metal', 'doom metal'],
    'folk': ['indie folk', 'folk rock', 'americana', 'celtic'],
    'r&b': ['neo soul', 'contemporary r&b', 'funk', 'motown'],
    'indie': ['indie rock', 'indie pop', 'shoegaze', 'post-punk'],
  }

  const userGenres = new Set(Object.keys(preferredGenres))
  const nicheGenres = new Set<string>()

  for (const genre of userGenres) {
    const similar = similarGenreMap[genre.toLowerCase()] || []
    similar.forEach(g => {
      if (!userGenres.has(g)) {
        nicheGenres.add(g)
      }
    })
  }

  const nicheGenresArray = Array.from(nicheGenres)
  console.log(`[DiscoverWeeklyV2] 🎼 Niche genres: ${nicheGenresArray.slice(0, 10).join(', ')}`)

  const energyMin = Math.max(0, userAvgEnergy - 0.3)
  const energyMax = Math.min(1, userAvgEnergy + 0.3)
  const bpmMin = userAvgBPM * 0.7
  const bpmMax = userAvgBPM * 1.3

  const matchesUserProfile = (song: ISong): boolean => {
    if (song.energy && (song.energy < energyMin || song.energy > energyMax)) return false
    if (song.bpm && song.bpm > 0 && (song.bpm < bpmMin || song.bpm > bpmMax)) return false

    if (song.moods && song.moods.length > 0 && userTopMoods.length > 0) {
      const hasMatchingMood = song.moods.some(m => userTopMoods.includes(m.toUpperCase()))
      if (!hasMatchingMood && Math.random() > 0.5) return false
    }

    return true
  }

  for (const genre of nicheGenresArray) {
    if (songs.length >= nicheCount) break

    const songsByGenre = await getSongsByGenre(genre, 20)

    const nicheTracks = songsByGenre.filter(s => {
      if (usedSongIds.has(s.id)) return false
      if (bannedArtists.includes(s.artistId || '')) return false

      const isNotPopular = (s.playCount || 0) < 1000
      const isOlder = !s.year || s.year < now.getFullYear() - 1

      return (isNotPopular || isOlder) && matchesUserProfile(s)
    })

    const shuffled = nicheTracks.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 5)) {
      if (songs.length >= nicheCount) break
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  console.log(`[DiscoverWeeklyV2] 🎼 NICHE: Added ${songs.length} tracks`)

  // ============================================
  // 2. СЛУЧАЙНЫЕ ТРЕКИ (30%)
  // ============================================
  if (songs.length < limit) {
    const randomSongs = await getRandomSongs(limit - songs.length + 50)
    for (const song of randomSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  // ============================================
  // 3. ОРКЕСТРАТОР
  // ============================================
  console.log('[DiscoverWeeklyV2] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  const { orchestratePlaylist } = await import('./playlist-orchestrator')
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
    bannedArtists,
  })

  console.log(`[DiscoverWeeklyV2] ✅ Generated ${orchestrated.length} tracks`)

  return {
    playlist: {
      songs: orchestrated,
      source: 'discover-weekly-v2',
    },
    metadata: {
      id: `discover-weekly-${now.toISOString().split('T')[0]}`,
      type: 'discover-weekly',
      name: 'Открытия недели',
      description: `Новые треки на ${now.toLocaleDateString('ru-RU')}`,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  }
}

/**
 * Генерация плейлиста по десятилетиям (V2)
 */
export async function generateDecadePlaylistV2(
  decade: string,
  limit: number = 30
): Promise<{ songs: ISong[]; source: string; name: string; description: string }> {
  const config = DECADE_CONFIG[decade]
  if (!config) {
    return { songs: [], source: 'decade', name: 'Десятилетие', description: '' }
  }

  const [startYear, endYear] = config.years
  console.log(`[DecadePlaylistV2] Generating for ${decade} (${startYear}-${endYear})`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  // 1. ЯКОРНЫЕ ТРЕКИ
  console.log(`[DecadePlaylistV2] 🎯 Adding anchor tracks...`)
  
  for (const anchor of config.anchorTracks || []) {
    try {
      const searchResult = await subsonic.search2({
        query: `${anchor.artist} ${anchor.title}`,
        songCount: 1,
        albumCount: 0,
        artistCount: 0
      })

      const track = searchResult?.song?.[0]
      if (track && !usedSongIds.has(track.id)) {
        const year = parseInt(track.year?.toString() || '0')
        if (year >= startYear && year <= endYear) {
          songs.push(track)
          usedSongIds.add(track.id)
          artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 1
          console.log(`[DecadePlaylistV2] ✅ Anchor: ${anchor.artist} - ${anchor.title}`)
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // 2. КАНДИДАТЫ
  const candidates: { track: ISong; matchScore: number; popularity: number }[] = []

  const randomTracks = await getRandomSongs(500)
  for (const track of randomTracks) {
    const year = parseInt(track.year?.toString() || '0')
    if (year < startYear || year > endYear) continue
    if (usedSongIds.has(track.id)) continue

    const genreMatch = track.genre && config.genres.some(g => 
      track.genre?.toLowerCase().includes(g.toLowerCase())
    )

    candidates.push({
      track,
      matchScore: genreMatch ? 0.9 : 0.7,
      popularity: track.playCount || 0
    })
  }

  for (const genre of config.genres) {
    const genreTracks = await getSongsByGenre(genre, 50)
    for (const track of genreTracks) {
      const year = parseInt(track.year?.toString() || '0')
      if (year < startYear || year > endYear) continue
      if (usedSongIds.has(track.id)) continue
      if (candidates.find(c => c.track.id === track.id)) continue

      candidates.push({
        track,
        matchScore: 1.0,
        popularity: track.playCount || 0
      })
    }
  }

  // 3. ПРИОРИТИЗАЦИЯ
  const maxPopularity = Math.max(1, ...candidates.map(c => c.popularity))

  const scoredCandidates = candidates.map(c => ({
    ...c,
    priority: (0.7 * c.matchScore) + (0.3 * (c.popularity / maxPopularity))
  }))

  scoredCandidates.sort((a, b) => b.priority - a.priority)

  // 4. ОТБОР
  for (const { track } of scoredCandidates) {
    if (songs.length >= limit) break

    const artist = track.artist || ''
    const genre = track.genre || ''
    const aCount = artistCounts[artist] || 0
    const gCount = genreCounts[genre] || 0

    if (aCount >= 2) continue
    if (gCount >= 4) continue

    songs.push(track)
    usedSongIds.add(track.id)
    artistCounts[artist] = aCount + 1
    genreCounts[genre] = gCount + 1
  }

  // 5. FALLBACK
  if (songs.length < limit) {
    const remaining = scoredCandidates.filter(c => !usedSongIds.has(c.track.id))
    for (const { track } of remaining) {
      if (songs.length >= limit) break
      songs.push(track)
      usedSongIds.add(track.id)
    }
  }

  // 6. СОРТИРОВКА
  if (config.sort === 'chronological') {
    songs.sort((a, b) => {
      const yearA = parseInt(a.year?.toString() || '0')
      const yearB = parseInt(b.year?.toString() || '0')
      if (yearA !== yearB) return yearA - yearB
      return (b.playCount || 0) - (a.playCount || 0)
    })
  } else {
    songs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
  }

  console.log(`[DecadePlaylistV2] ✅ Generated ${songs.length} tracks for ${decade}`)

  return {
    songs: songs.slice(0, limit),
    source: 'decade',
    name: `${decade} Хиты`,
    description: `Лучшие треки ${decade.replace('s', '-x')}`
  }
}
