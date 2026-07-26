import { subsonic } from '@/service/subsonic'
import { getSimilarSongs, getSongsByGenre, getRandomSongs } from '@/service/subsonic-api'
import { usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import type { MLWavePlaylist } from '@/service/ml-wave-service'

export async function fetchTrackRadioSimilar(
  seedId: string,
  limit: number,
  excludeIds: Set<string> = new Set(),
): Promise<ISong[]> {
  excludeIds.add(seedId)

  const seed = await subsonic.songs.getSong(seedId).catch(() => null)
  const songs: ISong[] = []

  const similar = await getSimilarSongs(seedId, Math.max(limit + 5, 15)).catch(() => [] as ISong[])
  for (const track of similar) {
    if (songs.length >= limit) break
    if (excludeIds.has(track.id)) continue
    songs.push(track)
    excludeIds.add(track.id)
  }

  if (songs.length < limit && seed?.genre) {
    const genreTracks = await getSongsByGenre(seed.genre, limit - songs.length + 5).catch(() => [] as ISong[])
    for (const track of genreTracks) {
      if (songs.length >= limit) break
      if (excludeIds.has(track.id)) continue
      songs.push(track)
      excludeIds.add(track.id)
    }
  }

  return songs
}

export async function generateTrackRadioPlaylist(
  songId: string,
  limit: number = 25,
  excludeRecentlyPlayed: string[] = [],
): Promise<MLWavePlaylist> {
  const exclude = new Set<string>(excludeRecentlyPlayed)
  const seed = await subsonic.songs.getSong(songId).catch(() => null)

  if (!seed) {
    const random = await getRandomSongs(limit).catch(() => [] as ISong[])
    return { songs: random, source: 'mixed' }
  }

  const similar = await fetchTrackRadioSimilar(songId, Math.max(0, limit - 1), exclude)
  return {
    songs: [seed, ...similar].slice(0, limit),
    source: 'similar',
  }
}

/** Сразу играет seed, похожие — в фоне */
export async function playTrackRadio(seed: ISong, limit = 25): Promise<boolean> {
  if (!seed?.id) return false

  const { setSongList, setLastOnQueue, setPlayingState } = usePlayerStore.getState().actions
  const playlistName = `Радио: ${seed.title}`

  setSongList([seed], 0, false, undefined, playlistName)
  setPlayingState(true)

  void fetchTrackRadioSimilar(seed.id, limit - 1, new Set([seed.id]))
    .then((similar) => {
      if (similar.length > 0) {
        setLastOnQueue(similar)
      }
    })
    .catch((error) => {
      console.warn('[TrackRadio] Background fill failed:', error)
    })

  return true
}

export function isTrackRadioPlaylistName(name?: string): boolean {
  if (!name) return false
  return name.toLowerCase().startsWith('радио:')
}
