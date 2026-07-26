import { subsonic } from '@/service/subsonic'
import { getSimilarSongs, getTopSongs, getSongsByGenre, getRandomSongs } from '@/service/subsonic-api'
import { analyzeTrack } from '@/service/vibe-similarity'
import type { ISong } from '@/types/responses/song'

export const ML_SIMILAR_GENRE_MAP: Record<string, string[]> = {
  rock: ['post-rock', 'shoegaze', 'math rock', 'indie rock', 'alternative', 'grunge'],
  pop: ['synthpop', 'dream pop', 'indie pop', 'electropop', 'chamber pop'],
  electronic: ['ambient', 'IDM', 'glitch', 'downtempo', 'trip-hop', 'house'],
  'hip-hop': ['lo-fi hip hop', 'boom bap', 'jazz rap', 'conscious hip hop', 'trap'],
  jazz: ['smooth jazz', 'bebop', 'fusion', 'acid jazz', 'free jazz'],
  classical: ['neoclassical', 'contemporary classical', 'romantic', 'baroque'],
  metal: ['progressive metal', 'post-metal', 'black metal', 'doom metal'],
  folk: ['indie folk', 'folk rock', 'americana', 'celtic'],
  'r&b': ['neo soul', 'contemporary r&b', 'funk', 'motown'],
  indie: ['indie rock', 'indie pop', 'shoegaze', 'post-punk'],
}

export interface WeightedLikedSong {
  song: ISong
  weight: number
}

export interface UserAudioProfile {
  avgBPM: number
  avgEnergy: number
  avgValence: number
  avgDanceability: number
  topMoods: string[]
  recentRatio: number
  validLikedSongs: WeightedLikedSong[]
}

export interface AudioProfileRanges {
  bpmMin: number
  bpmMax: number
  energyMin: number
  energyMax: number
}

export interface CandidatePoolOptions {
  preferredGenres: Record<string, number>
  preferredArtists: Record<string, number>
  likedSongIds: string[]
  validLikedSongs: WeightedLikedSong[]
  collaborativeTrackIds: string[]
  discoveryEnabled: boolean
  effectiveNovelty: number
  excludeIds: Set<string>
  isBannedArtist: (song: ISong) => boolean
  targetSize?: number
  cacheKey?: string
}

const candidateCache = new Map<string, { songs: ISong[]; expiresAt: number }>()
const CANDIDATE_CACHE_TTL_MS = 2 * 60 * 60 * 1000

export function createBannedArtistFilter(bannedArtists: string[]) {
  return (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) return true
    if (
      !song.artistId &&
      bannedArtists.some((id) => song.artist && song.artist.toLowerCase().includes(id.toLowerCase()))
    ) {
      return true
    }
    return false
  }
}

export async function buildUserAudioProfile(
  likedSongIds: string[],
  maxSongs = 50,
): Promise<UserAudioProfile> {
  let totalEnergy = 0
  let totalWeightEnergy = 0
  let totalBPM = 0
  let totalWeightBPM = 0
  let totalValence = 0
  let totalWeightValence = 0
  let totalDanceability = 0
  let totalWeightDanceability = 0
  const userMoodCounts: Record<string, number> = {}
  const validLikedSongs: WeightedLikedSong[] = []

  if (likedSongIds.length === 0) {
    return {
      avgBPM: 100,
      avgEnergy: 0.5,
      avgValence: 0.5,
      avgDanceability: 0.5,
      topMoods: [],
      recentRatio: 0,
      validLikedSongs: [],
    }
  }

  const recentLikedIds = likedSongIds.slice(0, Math.min(50, maxSongs))
  const mediumLikedIds = likedSongIds.slice(50, Math.min(100, maxSongs))
  const oldLikedIds = likedSongIds.slice(100, maxSongs)

  const allLikedIds = [
    ...recentLikedIds.map((id) => ({ id, weight: 1.0 })),
    ...mediumLikedIds.map((id) => ({ id, weight: 0.7 })),
    ...oldLikedIds.slice(0, 50).map((id) => ({ id, weight: 0.3 })),
  ]

  const likedResults = await Promise.all(
    allLikedIds.map(({ id }) => subsonic.songs.getSong(id).catch(() => null)),
  )

  likedResults.forEach((song, idx) => {
    if (!song) return
    const weight = allLikedIds[idx]?.weight || 1.0
    validLikedSongs.push({ song, weight })
    const features = analyzeTrack(song)

    totalEnergy += features.energy * weight
    totalWeightEnergy += weight
    if (song.bpm && song.bpm > 0) {
      totalBPM += song.bpm * weight
      totalWeightBPM += weight
    }
    totalValence += features.valence * weight
    totalWeightValence += weight
    totalDanceability += features.danceability * weight
    totalWeightDanceability += weight

    if (song.moods) {
      song.moods.forEach((m) => {
        userMoodCounts[m.toUpperCase()] = (userMoodCounts[m.toUpperCase()] || 0) + 1
      })
    }
  })

  return {
    avgBPM: totalWeightBPM > 0 ? totalBPM / totalWeightBPM : 100,
    avgEnergy: totalWeightEnergy > 0 ? totalEnergy / totalWeightEnergy : 0.5,
    avgValence: totalWeightValence > 0 ? totalValence / totalWeightValence : 0.5,
    avgDanceability: totalWeightDanceability > 0 ? totalDanceability / totalWeightDanceability : 0.5,
    topMoods: Object.entries(userMoodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([mood]) => mood),
    recentRatio:
      validLikedSongs.length > 0
        ? validLikedSongs.filter(({ weight }) => weight >= 1.0).length / validLikedSongs.length
        : 0,
    validLikedSongs,
  }
}

function getTimeAdaptivityTargets(hour: number) {
  if (hour >= 6 && hour < 12) return { targetEnergy: 0.55, targetBpm: 105 }
  if (hour >= 12 && hour < 18) return { targetEnergy: 0.65, targetBpm: 115 }
  if (hour >= 18 && hour < 23) return { targetEnergy: 0.45, targetBpm: 95 }
  return { targetEnergy: 0.25, targetBpm: 80 }
}

export function getAudioProfileRanges(
  profile: UserAudioProfile,
  options?: { timeAdaptivityEnabled?: boolean; hour?: number },
): AudioProfileRanges {
  const hour = options?.hour ?? new Date().getHours()
  let avgBPM = profile.avgBPM
  let avgEnergy = profile.avgEnergy

  if (options?.timeAdaptivityEnabled) {
    const timeTargets = getTimeAdaptivityTargets(hour)
    avgEnergy = avgEnergy * 0.6 + timeTargets.targetEnergy * 0.4
    avgBPM = avgBPM * 0.6 + timeTargets.targetBpm * 0.4
  }

  return {
    bpmMin: avgBPM * 0.7,
    bpmMax: avgBPM * 1.3,
    energyMin: Math.max(0, avgEnergy - 0.3),
    energyMax: Math.min(1, avgEnergy + 0.3),
  }
}

export function songMatchesAudioRanges(song: ISong, ranges: AudioProfileRanges): boolean {
  if (song.bpm && song.bpm > 0 && (song.bpm < ranges.bpmMin || song.bpm > ranges.bpmMax)) return false
  if (song.energy !== undefined && (song.energy < ranges.energyMin || song.energy > ranges.energyMax)) {
    return false
  }
  return true
}

export function getGenreWeight(preferredGenres: Record<string, number>, genre?: string): number {
  if (!genre) return 0
  return preferredGenres[genre.toLowerCase()] || preferredGenres[genre] || 0
}

export async function buildMLRecommendationCandidatePool(
  options: CandidatePoolOptions,
): Promise<ISong[]> {
  const {
    preferredGenres,
    preferredArtists,
    likedSongIds,
    validLikedSongs,
    collaborativeTrackIds,
    discoveryEnabled,
    effectiveNovelty,
    excludeIds,
    isBannedArtist,
    targetSize = 600,
    cacheKey,
  } = options

  if (cacheKey) {
    const cached = candidateCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[ML Candidate Pool] Cache hit: ${cached.songs.length} tracks`)
      return cached.songs
    }
  }

  const pool: ISong[] = []
  const poolIds = new Set<string>()

  const addSong = (song: ISong | null | undefined) => {
    if (!song?.id) return
    if (excludeIds.has(song.id) || poolIds.has(song.id)) return
    if (isBannedArtist(song)) return
    pool.push(song)
    poolIds.add(song.id)
  }

  const addSongs = (songs: ISong[]) => {
    for (const song of songs) addSong(song)
  }

  const topGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre)

  for (const genre of topGenres) {
    try {
      addSongs(await getSongsByGenre(genre, 50))
      const lowerGenre = genre.toLowerCase()
      if (lowerGenre !== genre) {
        addSongs(await getSongsByGenre(lowerGenre, 30))
      }
    } catch {
      /* skip genre */
    }
  }

  const artistIdToName = new Map<string, string>()
  for (const { song } of validLikedSongs) {
    if (song.artistId && song.artist) {
      artistIdToName.set(song.artistId, song.artist)
    }
  }

  const topArtistIds = Object.entries(preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artistId]) => artistId)

  for (const artistId of topArtistIds) {
    let artistName = artistIdToName.get(artistId)
    if (!artistName) {
      const artist = await subsonic.artists.getOne(artistId).catch(() => null)
      artistName = artist?.name
    }
    if (!artistName) continue
    try {
      addSongs(await getTopSongs(artistName, 25))
    } catch {
      /* skip artist */
    }
  }

  const seedIds = likedSongIds.slice(0, 12)
  for (const seedId of seedIds) {
    try {
      addSongs(await getSimilarSongs(seedId, 25))
    } catch {
      /* skip seed */
    }
  }

  if (discoveryEnabled && effectiveNovelty > 0) {
    const userGenresLower = new Set(topGenres.map((genre) => genre.toLowerCase()))
    const adjacentGenres = new Set<string>()

    for (const genre of userGenresLower) {
      for (const similarGenre of ML_SIMILAR_GENRE_MAP[genre] || []) {
        if (!userGenresLower.has(similarGenre.toLowerCase())) {
          adjacentGenres.add(similarGenre)
        }
      }
    }

    for (const genre of Array.from(adjacentGenres).slice(0, 8)) {
      try {
        addSongs(await getSongsByGenre(genre, 25))
      } catch {
        /* skip adjacent genre */
      }
    }
  }

  if (collaborativeTrackIds.length > 0) {
    const collabResults = await Promise.all(
      collaborativeTrackIds.slice(0, 40).map((id) => subsonic.songs.getSong(id).catch(() => null)),
    )
    for (const song of collabResults) addSong(song)
  }

  if (pool.length < targetSize * 0.5) {
    try {
      addSongs(await getRandomSongs(Math.min(250, targetSize - pool.length)))
    } catch {
      /* skip random fill */
    }
  } else if (pool.length < targetSize) {
    try {
      addSongs(await getRandomSongs(Math.min(80, targetSize - pool.length)))
    } catch {
      /* skip random top-up */
    }
  }

  console.log(
    `[ML Candidate Pool] ${pool.length} tracks ` +
    `(genres: ${topGenres.length}, artists: ${topArtistIds.length}, seeds: ${seedIds.length})`,
  )

  if (cacheKey) {
    candidateCache.set(cacheKey, {
      songs: pool,
      expiresAt: Date.now() + CANDIDATE_CACHE_TTL_MS,
    })
  }

  return pool
}

export function buildCandidateCacheKey(
  prefix: string,
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  preferredArtists: Record<string, number>,
): string {
  const topGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre.toLowerCase())
    .join('|')
  const topArtists = Object.entries(preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)
    .join('|')

  return `${prefix}:${likedSongIds.length}:${topGenres}:${topArtists}`
}

/**
 * Discover Weekly: item-item similarity — главный источник «открытий»
 */
export async function collectDiscoverSimilarTracks(
  likedSongIds: string[],
  excludeIds: Set<string>,
  isBannedArtist: (song: ISong) => boolean,
  maxCandidates: number,
  matchesProfile: (song: ISong) => boolean,
): Promise<ISong[]> {
  const results: ISong[] = []
  const seen = new Set<string>(excludeIds)
  const seedIds = likedSongIds.slice(0, 15)

  for (const seedId of seedIds) {
    if (results.length >= maxCandidates) break
    try {
      const similar = await getSimilarSongs(seedId, 20)
      for (const song of similar) {
        if (results.length >= maxCandidates) break
        if (seen.has(song.id)) continue
        if (isBannedArtist(song)) continue
        if (!matchesProfile(song)) continue
        results.push(song)
        seen.add(song.id)
      }
    } catch {
      /* skip seed */
    }
  }

  console.log(`[ML Discover Similar] Collected ${results.length} item-item candidates`)
  return results
}

/**
 * Быстрый пул для «Моя волна» — параллельные запросы, без тяжёлого full pool
 */
export async function buildFastMyWaveCandidatePool(options: {
  likedSongIds: string[]
  seedSongIds: string[]
  preferredGenres: Record<string, number>
  preferredArtists: Record<string, number>
  excludeIds: Set<string>
  isBannedArtist: (song: ISong) => boolean
  targetSize?: number
}): Promise<ISong[]> {
  const {
    likedSongIds,
    seedSongIds,
    preferredGenres,
    preferredArtists,
    excludeIds,
    isBannedArtist,
    targetSize = 120,
  } = options

  const pool: ISong[] = []
  const poolIds = new Set<string>()

  const addSong = (song: ISong | null | undefined) => {
    if (!song?.id) return
    if (excludeIds.has(song.id) || poolIds.has(song.id)) return
    if (isBannedArtist(song)) return
    pool.push(song)
    poolIds.add(song.id)
  }

  const similarSeedIds = [...new Set([...seedSongIds, ...likedSongIds.slice(0, 4)])].slice(0, 4)
  const topGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([genre]) => genre)

  const [similarBatches, ...genreBatches] = await Promise.all([
    Promise.all(similarSeedIds.map((id) => getSimilarSongs(id, 12).catch(() => [] as ISong[]))),
    ...topGenres.map((genre) => getSongsByGenre(genre, 25).catch(() => [] as ISong[])),
  ])

  for (const batch of similarBatches) {
    for (const song of batch) addSong(song)
  }
  for (const batch of genreBatches) {
    for (const song of batch) addSong(song)
  }

  const topArtistIds = Object.entries(preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)

  await Promise.all(
    topArtistIds.map(async (artistId) => {
      const artist = await subsonic.artists.getOne(artistId).catch(() => null)
      if (!artist?.name) return
      const tracks = await getTopSongs(artist.name, 10).catch(() => [] as ISong[])
      for (const song of tracks) addSong(song)
    }),
  )

  if (pool.length < 40) {
    const random = await getRandomSongs(Math.min(60, targetSize - pool.length)).catch(() => [] as ISong[])
    for (const song of random) addSong(song)
  }

  console.log(`[MyWave Fast Pool] ${pool.length} tracks (seeds: ${similarSeedIds.length}, genres: ${topGenres.length})`)
  return pool
}
