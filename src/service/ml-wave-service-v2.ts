/**
 * ML Wave Service - УЛУЧШЕННЫЕ ВЕРСИИ ФУНКЦИЙ
 * 
 * Этот файл содержит обновленные версии функций генерации плейлистов.
 * Импортируйте их напрямую из for-you-page.tsx
 */

import { subsonic } from '@/service/subsonic'
import { getTopSongs, getSongsByGenre, getRandomSongs } from '@/service/subsonic-api'
import { useMLStore } from '@/store/ml.store'
import type { ISong } from '@/types/responses/song'

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
 * Генерация плейлиста по десятилетиям (УЛУЧШЕННАЯ ВЕРСИЯ)
 * 
 * Алгоритм:
 * 1. Фильтрация по году + жанрам десятилетия
 * 2. Приоритизация: 0.7*match + 0.3*popularity
 * 3. Добавление якорных треков (хитов)
 * 4. Хронологическая сортировка
 * 5. Контроль разнообразия
 */
export async function generateDecadePlaylistV2(
  decade: string,
  limit: number = 30
): Promise<{ songs: ISong[]; source: string; name: string; description: string }> {
  const config = DECADE_CONFIG[decade]
  if (!config) {
    console.error(`[DecadePlaylist] Unknown decade: ${decade}`)
    return { songs: [], source: 'decade', name: 'Десятилетие', description: '' }
  }

  const [startYear, endYear] = config.years
  console.log(`[DecadePlaylist] Generating for ${decade} (${startYear}-${endYear})`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  // ============================================
  // 1. ЯКОРНЫЕ ТРЕКИ (Хиты десятилетия)
  // ============================================
  console.log(`[DecadePlaylist] 🎯 Adding anchor tracks...`)
  
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
          console.log(`[DecadePlaylist] ✅ Anchor: ${anchor.artist} - ${anchor.title}`)
        }
      }
    } catch (e) {
      console.warn(`[DecadePlaylist] Failed to find anchor: ${anchor.artist} - ${anchor.title}`)
    }
  }

  // ============================================
  // 2. ПОЛУЧЕНИЕ КАНДИДАТОВ (Случайные + Жанры)
  // ============================================
  const candidates: { track: ISong; matchScore: number; popularity: number }[] = []

  // 2a. Случайные треки с фильтрацией по году
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

  // 2b. Треки из жанров десятилетия
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

  // ============================================
  // 3. ПРИОРИТИЗАЦИЯ (0.7*match + 0.3*popularity)
  // ============================================
  const maxPopularity = Math.max(1, ...candidates.map(c => c.popularity))

  const scoredCandidates = candidates.map(c => ({
    ...c,
    priority: (0.7 * c.matchScore) + (0.3 * (c.popularity / maxPopularity))
  }))

  scoredCandidates.sort((a, b) => b.priority - a.priority)

  // ============================================
  // 4. ОТБОР ТРЕКОВ С ШТРАФАМИ ЗА ПОВТОРЫ
  // ============================================
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

  // ============================================
  // 5. FALLBACK
  // ============================================
  if (songs.length < limit) {
    const remaining = scoredCandidates.filter(c => !usedSongIds.has(c.track.id))
    for (const { track } of remaining) {
      if (songs.length >= limit) break
      songs.push(track)
      usedSongIds.add(track.id)
    }
  }

  // ============================================
  // 6. ХРОНОЛОГИЧЕСКАЯ СОРТИРОВКА
  // ============================================
  console.log(`[DecadePlaylist] 📅 Sorting: ${config.sort}...`)

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

  console.log(`[DecadePlaylist] ✅ Generated ${songs.length} tracks for ${decade}`)
  console.log(`[DecadePlaylist] 🎤 Artists: ${Object.keys(artistCounts).length}, Genres: ${Object.keys(genreCounts).length}`)

  return {
    songs: songs.slice(0, limit),
    source: 'decade',
    name: `${decade} Хиты`,
    description: `Лучшие треки ${decade.replace('s', '-x')}`
  }
}

/**
 * Генерация плейлиста "Новинки" (УЛУЧШЕННАЯ ВЕРСИЯ)
 */
export async function generateNewReleasesPlaylistV2(
  limit: number = 30,
  preferredGenres: Record<string, number> = {},
  preferredArtists: Record<string, number> = {}
): Promise<{ songs: ISong[]; source: string; name: string; description: string }> {
  console.log('[NewReleasesV2] ===== START =====')

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  const now = Date.now()
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)

  // 1. ПОЛУЧЕНИЕ КАНДИДАТОВ
  const candidates: {
    track: ISong
    matchScore: number
    popularity: number
    novelty: number
    userPref: number
  }[] = []

  const randomTracks = await getRandomSongs(1000)
  
  for (const track of randomTracks) {
    const createdDate = track.created ? new Date(track.created).getTime() : 0
    const year = track.year || 0
    const currentYear = new Date().getFullYear()
    
    const isRecent = createdDate >= ninetyDaysAgo || year >= currentYear - 1
    
    if (!isRecent) continue
    if (usedSongIds.has(track.id)) continue

    let noveltyBonus = 0.0
    if (createdDate >= thirtyDaysAgo) {
      noveltyBonus = 0.15
    } else if (createdDate >= ninetyDaysAgo) {
      noveltyBonus = 0.10
    } else if (year >= currentYear) {
      noveltyBonus = 0.10
    }

    const genreScore = preferredGenres[track.genre || ''] || 0
    const maxGenreScore = Math.max(1, ...Object.values(preferredGenres))
    const artistScore = preferredArtists[track.artistId || ''] || 0
    const maxArtistScore = Math.max(1, ...Object.values(preferredArtists))
    
    const matchScore = (genreScore / maxGenreScore) * 0.5 + (artistScore / maxArtistScore) * 0.5
    const popularity = track.playCount || 0

    candidates.push({
      track,
      matchScore: matchScore > 0 ? 0.8 + (matchScore * 0.2) : 0.5,
      popularity,
      novelty: noveltyBonus,
      userPref: (genreScore / maxGenreScore) * 0.1
    })
  }

  console.log(`[NewReleasesV2] 📥 Found ${candidates.length} recent tracks`)

  if (candidates.length === 0) {
    const fallback = await getRandomSongs(limit)
    return {
      songs: fallback.slice(0, limit),
      source: 'new-releases-fallback',
      name: '🆕 Новинки',
      description: 'Случайные треки (не найдено новинок за 90 дней)'
    }
  }

  // 2. ПРИОРИТИЗАЦИЯ
  const maxPopularity = Math.max(1, ...candidates.map(c => c.popularity))

  const scoredCandidates = candidates.map(c => ({
    ...c,
    priority: (0.5 * c.matchScore) + (0.2 * (c.popularity / maxPopularity)) + (0.2 * c.novelty) + c.userPref
  }))

  scoredCandidates.sort((a, b) => b.priority - a.priority)

  // 3. ОТБОР С ШТРАФАМИ
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

  // 4. FALLBACK
  if (songs.length < limit) {
    const remaining = scoredCandidates.filter(c => !usedSongIds.has(c.track.id))
    for (const { track } of remaining) {
      if (songs.length >= limit) break
      songs.push(track)
      usedSongIds.add(track.id)
    }
  }

  // 5. СОРТИРОВКА (Energy ascending)
  songs.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))

  console.log(`[NewReleasesV2] ✅ Generated ${songs.length} tracks`)

  return {
    songs: songs.slice(0, limit),
    source: 'new-releases',
    name: '🆕 Новинки',
    description: 'Свежие релизы за последние 90 дней'
  }
}

/**
 * Генерация плейлиста "Похожие исполнители" (УЛУЧШЕННАЯ ВЕРСИЯ)
 */
export async function generateSimilarArtistsPlaylistV2(
  artistId: string,
  limit: number = 25,
  preferredArtists: Record<string, number> = {}
): Promise<{ songs: ISong[]; source: string; name: string; description: string }> {
  console.log(`[SimilarArtistsV2] ===== START for artist: ${artistId} =====`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  const TARGET_MOODS = ['INTIMATE', 'REFLECTIVE', 'MELANCHOLIC', 'CALM']
  const MOOD_THRESHOLD = 0.4

  try {
    const { analyzeTrack, vibeSimilarity, detectMood } = await import('./vibe-similarity')

    const artist = await subsonic.artists.getOne(artistId)
    if (!artist) {
      throw new Error('Artist not found')
    }

    console.log(`[SimilarArtistsV2] 🎤 Seed artist: ${artist.name}`)

    const artistTopSongs = await getTopSongs(artist.name, 5)
    if (artistTopSongs.length === 0) {
      return { songs: [], source: 'similar-artists', name: 'Похожие исполнители', description: '' }
    }

    // VIBE SIMILARITY
    const allSongs = await getRandomSongs(500)
    const candidates: { track: ISong; similarity: number; isFamiliar: boolean }[] = []

    for (const seed of artistTopSongs.slice(0, 3)) {
      const seedFeatures = analyzeTrack(seed)

      for (const track of allSongs) {
        if (usedSongIds.has(track.id)) continue
        if (track.artist === artist.name) continue

        const similarity = vibeSimilarity(seedFeatures, analyzeTrack(track))
        if (similarity < 0.7) continue

        const moodResult = detectMood(analyzeTrack(track))
        const moodMatch = TARGET_MOODS.some(m => 
          moodResult.mood.toUpperCase().includes(m) || m.includes(moodResult.mood.toUpperCase())
        )
        
        if (!moodMatch && moodResult.confidence >= MOOD_THRESHOLD) continue

        const isFamiliar = preferredArtists[track.artistId || ''] > 0
        candidates.push({ track, similarity, isFamiliar })
      }
    }

    const uniqueCandidates = candidates.filter((c, i, self) => 
      i === self.findIndex(other => other.track.id === c.track.id)
    )

    uniqueCandidates.sort((a, b) => b.similarity - a.similarity)

    console.log(`[SimilarArtistsV2] 📥 Found ${uniqueCandidates.length} similar tracks`)

    // ЧЕРЕДОВАНИЕ: 80% знакомые / 20% новые
    const familiarTracks = uniqueCandidates.filter(c => c.isFamiliar)
    const newTracks = uniqueCandidates.filter(c => !c.isFamiliar)

    const familiarLimit = Math.floor(limit * 0.8)

    for (const { track } of familiarTracks) {
      if (songs.length >= familiarLimit) break
      
      const aCount = artistCounts[track.artist || ''] || 0
      const gCount = genreCounts[track.genre || ''] || 0

      if (aCount >= 2) continue
      if (gCount >= 4) continue

      songs.push(track)
      usedSongIds.add(track.id)
      artistCounts[track.artist || ''] = aCount + 1
      genreCounts[track.genre || ''] = gCount + 1
    }

    for (const { track } of newTracks) {
      if (songs.length >= limit) break
      
      const aCount = artistCounts[track.artist || ''] || 0
      const gCount = genreCounts[track.genre || ''] || 0

      if (aCount >= 2) continue
      if (gCount >= 4) continue

      songs.push(track)
      usedSongIds.add(track.id)
      artistCounts[track.artist || ''] = aCount + 1
      genreCounts[track.genre || ''] = gCount + 1
    }

    // FALLBACK
    if (songs.length < limit) {
      const remaining = uniqueCandidates.filter(c => !usedSongIds.has(c.track.id))
      for (const { track } of remaining) {
        if (songs.length >= limit) break
        songs.push(track)
        usedSongIds.add(track.id)
      }
    }

    // СОРТИРОВКА
    songs.sort((a, b) => {
      const energyA = a.energy || 0.5
      const energyB = b.energy || 0.5
      return energyB - energyA
    })

    console.log(`[SimilarArtistsV2] ✅ Generated ${songs.length} tracks`)

    return {
      songs: songs.slice(0, limit),
      source: 'similar-artists',
      name: `🎵 Похожие на ${artist.name}`,
      description: `Треки со схожим vibe и MOOD с ${artist.name}`
    }

  } catch (error) {
    console.error('[SimilarArtistsV2] Error:', error)
    const fallback = await getRandomSongs(limit)
    return {
      songs: fallback.slice(0, limit),
      source: 'similar-artists-fallback',
      name: '🎵 Похожие исполнители',
      description: 'Случайные треки (ошибка генерации)'
    }
  }
}
