import { subsonic } from '@/service/subsonic'
import { getSimilarSongs, getRandomSongs } from '@/service/subsonic-api'
import { createBannedArtistFilter } from '@/service/ml-recommendation-helpers'
import type { MyWaveSettings } from '@/service/ml-wave-service'
import {
  MY_WAVE_LOOKAHEAD,
  MY_WAVE_PLAYLIST_NAME,
} from '@/service/my-wave-utils'
import { clearMyWavePreload, preloadNextMyWaveTrack } from '@/service/my-wave-preload'
import { usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'

export { MY_WAVE_LOOKAHEAD, MY_WAVE_PLAYLIST_NAME } from '@/service/my-wave-utils'

export interface MyWaveStreamOptions {
  likedSongIds: string[]
  ratings: Record<string, any>
  settings?: MyWaveSettings
  playlistName?: string
}

export interface MyWaveStreamHandle {
  songs: ISong[]
  alreadyActive: boolean
  cancel: () => void
}

interface MyWaveSession {
  likedSongIds: string[]
  ratings: Record<string, any>
  settings?: MyWaveSettings
  usedIds: Set<string>
  prefetchPool: ISong[]
  seedIds: string[]
  seedIndex: number
  prefetchRunning: boolean
  apiInFlight: boolean
  cancelled: boolean
  isValid: (song: ISong | null | undefined) => song is ISong
}

let activeSession: MyWaveSession | null = null
let observerInitialized = false

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function buildExcludeSet(
  ratings: Record<string, any>,
  extra?: Iterable<string>,
): Set<string> {
  const exclude = new Set<string>()
  for (const [id, rating] of Object.entries(ratings)) {
    if (rating.like === false) exclude.add(id)
  }
  if (extra) {
    for (const id of extra) exclude.add(id)
  }
  return exclude
}

function getTracksAhead(): number {
  const { currentList, currentSongIndex } = usePlayerStore.getState().songlist
  return Math.max(0, currentList.length - currentSongIndex - 1)
}

function trimMyWaveQueue() {
  const store = usePlayerStore.getState()
  const { currentList, currentSongIndex, originalList } = store.songlist
  if (currentSongIndex <= 0) return

  const trimmed = currentList.slice(currentSongIndex)
  const trimmedOriginal =
    originalList.length === currentList.length
      ? originalList.slice(currentSongIndex)
      : trimmed

  usePlayerStore.setState((state) => {
    state.songlist.currentList = trimmed
    state.songlist.originalList = trimmedOriginal
    state.songlist.currentSongIndex = 0
    state.songlist.originalSongIndex = 0
  })
}

function firstResolvedTrack(tasks: Promise<ISong | null>[]): Promise<ISong | null> {
  return new Promise((resolve) => {
    let pending = tasks.length
    let resolved = false

    const finish = (song: ISong | null) => {
      if (resolved) return
      if (song) {
        resolved = true
        resolve(song)
        return
      }
      pending -= 1
      if (pending === 0) resolve(null)
    }

    for (const task of tasks) {
      task.then(finish).catch(() => finish(null))
    }
  })
}

async function getMyWaveTrackFilter(ratings: Record<string, any>) {
  const { useMLStore } = await import('@/store/ml.store')
  const bannedArtists = useMLStore.getState().profile.bannedArtists || []
  const isBannedArtist = createBannedArtistFilter(bannedArtists)
  const dislikedIds = new Set(
    Object.entries(ratings)
      .filter(([_, rating]) => rating.like === false)
      .map(([id]) => id),
  )

  const isValid = (song: ISong | null | undefined): song is ISong => {
    if (!song?.id || dislikedIds.has(song.id)) return false
    if (isBannedArtist(song)) return false
    if (ratings[song.id]?.songInfo?.mediaType === 'audiobook') return false
    return true
  }

  return { isValid, dislikedIds }
}

function getFilteredLikedIds(session: MyWaveSession): string[] {
  return session.likedSongIds.filter((id) => {
    if (session.usedIds.has(id)) return false
    if (session.ratings[id]?.like === false) return false
    if (session.ratings[id]?.songInfo?.mediaType === 'audiobook') return false
    return true
  })
}

function nextSeedId(session: MyWaveSession): string | undefined {
  if (session.seedIds.length === 0) return undefined
  const id = session.seedIds[session.seedIndex % session.seedIds.length]
  session.seedIndex += 1
  return id
}

function pickTracks(
  candidates: ISong[],
  limit: number,
  session: MyWaveSession,
  isValid: (song: ISong | null | undefined) => song is ISong,
): ISong[] {
  const picked: ISong[] = []
  const poolIds = new Set(session.prefetchPool.map((s) => s.id))

  for (const song of candidates) {
    if (picked.length >= limit) break
    if (!isValid(song) || session.usedIds.has(song.id) || poolIds.has(song.id)) continue
    picked.push(song)
    poolIds.add(song.id)
  }

  return picked
}

/** Один HTTP-запрос → до limit треков */
async function fetchTracksOneRequest(
  session: MyWaveSession,
  limit: number,
): Promise<ISong[]> {
  const { isValid } = session
  const fetchSize = Math.max(limit + 2, 6)
  const seedId = nextSeedId(session) ?? getFilteredLikedIds(session)[0]

  if (seedId) {
    const similar = await getSimilarSongs(seedId, fetchSize).catch(() => [] as ISong[])
    const picked = pickTracks(similar, limit, session, isValid)
    if (picked.length >= limit) return picked

    const random = await getRandomSongs(fetchSize).catch(() => [] as ISong[])
    return [...picked, ...pickTracks(random, limit - picked.length, session, isValid)]
  }

  const random = await getRandomSongs(fetchSize).catch(() => [] as ISong[])
  return pickTracks(random, limit, session, isValid)
}

/** Фоновый буфер — пока слушаешь, копим треки без блокировки skip */
async function runPrefetch(session: MyWaveSession): Promise<void> {
  if (session.cancelled || session.prefetchRunning) return
  if (session.prefetchPool.length >= MY_WAVE_LOOKAHEAD + 2) return

  session.prefetchRunning = true

  try {
    const { isValid } = session
    const need = MY_WAVE_LOOKAHEAD + 3 - session.prefetchPool.length
    const batch = await fetchTracksOneRequest(session, need)

    for (const song of batch) {
      if (session.cancelled) return
      if (!isValid(song) || session.usedIds.has(song.id)) continue
      if (session.prefetchPool.some((s) => s.id === song.id)) continue
      session.prefetchPool.push(song)
      if (session.prefetchPool.length >= MY_WAVE_LOOKAHEAD + 3) break
    }
  } catch (error) {
    console.warn('[MyWave] Prefetch failed:', error)
  } finally {
    session.prefetchRunning = false
    if (
      !session.cancelled &&
      session.prefetchPool.length < MY_WAVE_LOOKAHEAD + 2 &&
      !session.apiInFlight
    ) {
      void runPrefetch(session)
    }
  }
}

function takeFromPrefetch(session: MyWaveSession, count: number): ISong[] {
  const taken: ISong[] = []

  while (taken.length < count && session.prefetchPool.length > 0) {
    const song = session.prefetchPool.shift()!
    if (session.usedIds.has(song.id)) continue
    taken.push(song)
    session.usedIds.add(song.id)
  }

  return taken
}

async function pickFirstMyWaveTrack(
  likedSongIds: string[],
  ratings: Record<string, any>,
): Promise<ISong | null> {
  const { isValid, dislikedIds } = await getMyWaveTrackFilter(ratings)

  const filteredLiked = likedSongIds.filter(
    (id) => !dislikedIds.has(id) && ratings[id]?.songInfo?.mediaType !== 'audiobook',
  )

  const tasks: Promise<ISong | null>[] = [
    getRandomSongs(8)
      .then((songs) => songs.find(isValid) ?? null)
      .catch(() => null),
  ]

  if (filteredLiked.length > 0) {
    const seedId = filteredLiked[Math.floor(Math.random() * filteredLiked.length)]
    tasks.push(
      subsonic.songs.getSong(seedId).then((song) => (isValid(song) ? song : null)).catch(() => null),
    )
  }

  return firstResolvedTrack(tasks)
}

function createSession(
  options: MyWaveStreamOptions,
  isValid: (song: ISong | null | undefined) => song is ISong,
): MyWaveSession {
  const filtered = options.likedSongIds.filter(
    (id) =>
      options.ratings[id]?.like !== false &&
      options.ratings[id]?.songInfo?.mediaType !== 'audiobook',
  )

  return {
    likedSongIds: options.likedSongIds,
    ratings: options.ratings,
    settings: options.settings,
    usedIds: new Set<string>(),
    prefetchPool: [],
    seedIds: shuffle(filtered).slice(0, 8),
    seedIndex: 0,
    prefetchRunning: false,
    apiInFlight: false,
    cancelled: false,
    isValid,
  }
}

function afterMyWaveQueueUpdate() {
  preloadNextMyWaveTrack()
}

/**
 * Добирает ровно недостающие треки впереди. Сначала из prefetch (мгновенно), потом 1 API.
 */
export async function ensureMyWaveLookahead(): Promise<void> {
  const store = usePlayerStore.getState()
  const session = activeSession
  if (!store.playerState.isMyWaveActive || !session || session.cancelled) return

  trimMyWaveQueue()

  let tracksAhead = getTracksAhead()
  if (tracksAhead >= MY_WAVE_LOOKAHEAD) {
    void runPrefetch(session)
    return
  }

  let need = MY_WAVE_LOOKAHEAD - tracksAhead

  const instant = takeFromPrefetch(session, need)
  if (instant.length > 0) {
    store.actions.setLastOnQueue(instant)
    console.log(`[MyWave] +${instant.length} from cache (now ${getTracksAhead()}/${MY_WAVE_LOOKAHEAD})`)
    need -= instant.length
    afterMyWaveQueueUpdate()
    void runPrefetch(session)
  }

  if (need <= 0) return
  if (session.apiInFlight) {
    void runPrefetch(session)
    return
  }

  session.apiInFlight = true

  try {
    const batch = await fetchTracksOneRequest(session, need)
    if (session.cancelled || batch.length === 0) return

    for (const song of batch) session.usedIds.add(song.id)

    const aheadBeforeAppend = getTracksAhead()
    const toAppend = batch.slice(0, Math.max(0, MY_WAVE_LOOKAHEAD - aheadBeforeAppend))

    if (toAppend.length > 0) {
      store.actions.setLastOnQueue(toAppend)
      console.log(`[MyWave] +${toAppend.length} from API (now ${getTracksAhead()}/${MY_WAVE_LOOKAHEAD})`)
      afterMyWaveQueueUpdate()
    }
  } catch (error) {
    console.warn('[MyWave] Lookahead refill failed:', error)
  } finally {
    session.apiInFlight = false
    void runPrefetch(session)
  }
}

function stopMyWaveSession() {
  if (activeSession) activeSession.cancelled = true
  activeSession = null
  clearMyWavePreload()
}

export async function playMyWaveStream(
  options: MyWaveStreamOptions,
): Promise<MyWaveStreamHandle> {
  initMyWaveStreamObserver()

  const store = usePlayerStore.getState()
  const { setSongList, setPlayingState, togglePlayPause } = store.actions
  const playlistName = options.playlistName ?? MY_WAVE_PLAYLIST_NAME

  if (store.playerState.isMyWaveActive) {
    togglePlayPause()
    return {
      songs: store.songlist.currentList,
      alreadyActive: true,
      cancel: () => {},
    }
  }

  stopMyWaveSession()

  const { isValid } = await getMyWaveTrackFilter(options.ratings)
  const session = createSession(options, isValid)
  activeSession = session

  const firstTrack = await pickFirstMyWaveTrack(options.likedSongIds, options.ratings)

  if (firstTrack) {
    session.usedIds.add(firstTrack.id)
    setSongList([firstTrack], 0, false, undefined, playlistName)
    setPlayingState(true)
    console.log('[MyWave] Start: 1 track, prefetch in background')
    afterMyWaveQueueUpdate()
    void runPrefetch(session)
    void ensureMyWaveLookahead()
  } else {
    stopMyWaveSession()
  }

  return {
    songs: firstTrack ? [firstTrack] : [],
    alreadyActive: false,
    cancel: () => stopMyWaveSession(),
  }
}

export function initMyWaveStreamObserver(): void {
  if (observerInitialized) return
  observerInitialized = true

  usePlayerStore.subscribe(
    (state) => [
      state.playerState.isMyWaveActive,
      state.songlist.currentSongIndex,
      state.songlist.currentList[state.songlist.currentSongIndex + 1]?.id ?? null,
    ],
    ([isActive]) => {
      if (!isActive || !activeSession || activeSession.cancelled) return
      preloadNextMyWaveTrack()
      void ensureMyWaveLookahead()
    },
    { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] },
  )

  usePlayerStore.subscribe(
    (state) => state.playerState.isMyWaveActive,
    (isActive, wasActive) => {
      if (wasActive && !isActive) stopMyWaveSession()
    },
  )
}
