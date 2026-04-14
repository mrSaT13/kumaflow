import { subsonic } from '@/service/subsonic'
import { getSimilarSongs, getTopSongs, getSongsByGenre, getRandomSongs } from '@/service/subsonic-api'
import { lastFmService } from '@/service/lastfm-api'
import { discogsService } from '@/service/discogs-api'
import { useExternalApiStore } from '@/store/external-api.store'
import { useMLStore } from '@/store/ml.store'
import { analyzeTrack, findSimilarTracks, vibeSimilarity } from '@/service/vibe-similarity'
import { orchestratePlaylist, orchestratePlaylistWithBridges, createEnergyWave } from '@/service/playlist-orchestrator'
import { playlistCache } from '@/service/playlist-cache'
import { getSonicFingerprintRecommendations } from '@/service/sonic-fingerprint'
import { moodDriftDetector } from '@/service/mood-drift-detector'
import { trackScorer } from '@/service/track-scorer'
import { behaviorTracker } from '@/service/behavior-tracker'
import type { ISong } from '@/types/responses/song'
import type { IAlbum } from '@/types/responses/album'
import type { IArtist } from '@/types/responses/artist'

export interface MLWavePlaylist {
  songs: ISong[]
  source: 'liked' | 'similar' | 'genre' | 'mixed' | 'alchemy'
}

export interface MyWaveSettings {
  activity?: 'wakeup' | 'commute' | 'work' | 'workout' | 'sleep' | ''
  characteristic?: 'favorite' | 'unfamiliar' | 'popular' | ''
  mood?: 'energetic' | 'happy' | 'calm' | 'sad' | ''
  language?: 'russian' | 'foreign' | 'instrumental' | ''
}

export interface SongAlchemyParams {
  energy: number
  danceability: number
  valence: number
  acousticness: number
}

/**
 * Seed Rotation — выбирает seed-треки с ротацией
 * 
 * Ротация:
 * - 50% — топ треки (по ML score)
 * - 25% — недавно прослушанные
 * - 25% — случайные из лайкнутых
 * 
 * Это предотвращает использование одних и тех же 5 seed-треков
 */
async function selectSeedTracks(
  likedSongIds: string[],
  ratings: Record<string, any>,
  count: number = 5
): Promise<ISong[]> {
  if (likedSongIds.length === 0) return []

  const topCount = Math.ceil(count * 0.5)    // 50% топ
  const recentCount = Math.ceil(count * 0.25) // 25% недавно
  const randomCount = count - topCount - recentCount // 25% случайные

  console.log(`[SeedRotation] Selecting ${count} seeds: ${topCount} top, ${recentCount} recent, ${randomCount} random`)

  // 1. ТОП треки (по ML score)
  const topLiked = likedSongIds
    .map(id => ({
      id,
      score: ratings[id]?.score || 0,
      lastPlayed: ratings[id]?.lastPlayed ? new Date(ratings[id].lastPlayed).getTime() : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topCount)

  const topIds = topLiked.map(t => t.id)

  // 2. НЕДАВНО прослушанные
  const recentLiked = likedSongIds
    .map(id => ({
      id,
      lastPlayed: ratings[id]?.lastPlayed ? new Date(ratings[id].lastPlayed).getTime() : 0,
    }))
    .filter(t => t.lastPlayed > 0)
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, recentCount)

  const recentIds = recentLiked.map(t => t.id).filter(id => !topIds.includes(id))

  // 3. СЛУЧАЙНЫЕ из оставшихся
  const remaining = likedSongIds.filter(id => !topIds.includes(id) && !recentIds.includes(id))
  const shuffled = [...remaining].sort(() => Math.random() - 0.5)
  const randomIds = shuffled.slice(0, randomCount)

  // Собираем все seed IDs
  const allSeedIds = [...topIds, ...recentIds, ...randomIds]
  console.log(`[SeedRotation] Seed IDs: ${allSeedIds.join(', ')}`)

  // Загружаем треки
  const seedTracks = await Promise.all(
    allSeedIds.map(id => subsonic.songs.getSong(id).catch(() => null))
  )

  const validSeeds = seedTracks.filter((s): s is ISong => s !== null && !s.isAudiobook)
  console.log(`[SeedRotation] Loaded ${validSeeds.length} valid seeds (filtered ${seedTracks.length - validSeeds.length} audiobooks)`)

  return validSeeds
}

/**
 * Song Alchemy - генерация плейлиста по параметрам настроения
 */
export async function generateSongAlchemy(
  params: SongAlchemyParams,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[Song Alchemy] Generating with params:', params)

  // Получаем все треки
  const allSongs = await getRandomSongs(limit * 5)

  // Вычисляем сходство с целевыми параметрами
  const scored = allSongs
    .filter(song => song.energy !== undefined || song.danceability !== undefined)
    .map(song => {
      const energyDiff = Math.abs((song.energy || 0.5) - params.energy)
      const danceabilityDiff = Math.abs((song.danceability || 0.5) - params.danceability)
      const valenceDiff = Math.abs((song.valence || 0.5) - params.valence)
      const acousticnessDiff = Math.abs((song.acousticness || 0.5) - params.acousticness)

      // Меньше разница = выше score
      const similarity = 1 - (energyDiff * 0.3 + danceabilityDiff * 0.3 + valenceDiff * 0.2 + acousticnessDiff * 0.2)

      return { song, similarity }
    })
    .sort((a, b) => b.similarity - a.similarity)

  // Берем лучшие совпадения
  for (const { song } of scored) {
    if (songs.length >= limit) break
    if (!usedSongIds.has(song.id)) {
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  console.log(`[Song Alchemy] Generated ${songs.length} tracks`)

  return {
    songs,
    source: 'alchemy',
  }
}

/**
 * Получить жанры артиста из Discogs
 * Используется для ML рекомендаций
 */
export async function getArtistGenresFromDiscogs(
  artistName: string
): Promise<string[]> {
  const { settings } = useExternalApiStore.getState()
  
  if (!settings.discogsEnabled || !discogsService.isInitialized()) {
    return []
  }
  
  try {
    const artists = await discogsService.searchArtist(artistName, 5)
    
    if (artists.length === 0) {
      return []
    }
    
    const bestMatch = artists[0]
    const releases = await discogsService.getArtistReleases(bestMatch.id.toString(), 20)
    
    // Собираем все жанры из релизов
    const allGenres = new Set<string>()
    const allStyles = new Set<string>()
    
    for (const release of releases) {
      if (release.genres) {
        release.genres.forEach(g => allGenres.add(g))
      }
      if (release.styles) {
        release.styles.forEach(s => allStyles.add(s))
      }
    }
    
    // Комбинируем жанры и стили
    const combinedGenres = [
      ...Array.from(allGenres),
      ...Array.from(allStyles),
    ]
    
    console.log(`[ML] Discogs genres for "${artistName}":`, combinedGenres)
    return combinedGenres
  } catch (error) {
    console.warn('[ML] Discogs genres error:', error)
    return []
  }
}

export interface MLPlaylistMetadata {
  id: string
  type: 'daily-mix' | 'discover-weekly' | 'my-wave' | 'trends' | 'time-of-day' | 'activity' | 'mood'
  name: string
  description: string
  createdAt: string
  expiresAt?: string
}

/**
 * 🆕 Rediscovery Queue: найти забытый трек из топ-100 который не играл 3-6 месяцев
 */
async function getRediscoveryTrack(ratings: Record<string, any>): Promise<ISong | null> {
  const now = Date.now()
  const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000)
  const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000)

  // Находим треки с высоким score которые не играли 3-6 месяцев
  const forgottenCandidates = Object.entries(ratings)
    .filter(([_, rating]: [string, any]) => {
      const lastPlayed = rating.lastPlayed ? new Date(rating.lastPlayed).getTime() : 0
      const score = rating.score || 0
      return score > 50 && lastPlayed < threeMonthsAgo && lastPlayed > sixMonthsAgo
    })
    .sort((a: any, b: any) => (b[1].score || 0) - (a[1].score || 0))
    .slice(0, 10)

  if (forgottenCandidates.length === 0) {
    console.log('[MyWave] 🔄 Rediscovery: no forgotten tracks found')
    return null
  }

  // Берём случайный из топ-10 забытых
  const randomCandidate = forgottenCandidates[Math.floor(Math.random() * forgottenCandidates.length)]
  const trackId = randomCandidate[0]

  try {
    const track = await subsonic.songs.getSong(trackId)
    if (track) {
      console.log(`[MyWave] 🔄 Rediscovery: found "${track.title}" (score: ${randomCandidate[1].score})`)
    }
    return track
  } catch {
    return null
  }
}

/**
 * 🆕 Session Context: начало=знакомые, середина=новые, конец=коронки
 */
function applySessionContext(songs: ISong[], ratings: Record<string, any>): ISong[] {
  if (songs.length < 5) return songs

  const total = songs.length
  const familiarCount = Math.floor(total * 0.2)  // 20% в начале — знакомые
  const crownCount = Math.floor(total * 0.15)    // 15% в конце — коронки

  // Сортируем треки по familiarity (на основе playCount и score)
  const songsWithFamiliarity = songs.map(song => {
    const rating = ratings[song.id]
    const playCount = rating?.playCount || 0
    const score = rating?.score || 0
    const familiarity = playCount * 0.6 + (score / 100) * 0.4
    return { song, familiarity }
  })

  // Топ знакомые для начала сессии
  const familiar = songsWithFamiliarity
    .sort((a, b) => b.familiarity - a.familiarity)
    .slice(0, familiarCount)
    .map(x => x.song)

  // Топ коронки для конца сессии (высокий score)
  const crown = songsWithFamiliarity
    .sort((a, b) => b.familiarity - a.familiarity)
    .slice(familiarCount, familiarCount + crownCount)
    .map(x => x.song)

  // Остальные — середина (микс новых и знакомых)
  const remaining = songsWithFamiliarity
    .filter(x => !familiar.includes(x.song) && !crown.includes(x.song))
    .sort((a, b) => b.familiarity - a.familiarity)
    .map(x => x.song)

  // Собираем: знакомые → микс → коронки
  const result = [...familiar, ...remaining, ...crown]
  
  console.log(`[MyWave] 🎭 Session Context: ${familiarCount} familiar → ${remaining.length} mix → ${crownCount} crown`)
  
  return result
}

/**
 * Генерация плейлиста "Моя волна" на основе ML данных + Vibe Similarity
 */
export async function generateMyWavePlaylist(
  likedSongIds: string[],
  ratings: Record<string, any>,
  limit: number = 25,
  excludeDisliked: boolean = true,
  settings?: MyWaveSettings
): Promise<MLWavePlaylist> {
  // === MOOD DRIFT DETECTION ===
  // Проверяем есть ли сдвиг настроения от последовательных пропусков
  const moodAdjustments = moodDriftDetector.getPlaylistAdjustments()
  const currentMood = moodDriftDetector.getCurrentProfile()
  
  if (currentMood) {
    console.log(`[MyWave] Mood drift detected: ${currentMood.mood} (energy: ${currentMood.energy.toFixed(2)}, tempo: ${currentMood.tempo})`)
    console.log(`[MyWave] Excluding ${moodAdjustments.skipRecentTrackIds.length} recently skipped tracks`)
  }

  // Загружаем настройки из localStorage если не переданы
  const myWaveSettings: MyWaveSettings = settings || JSON.parse(localStorage.getItem('my-wave-settings') || '{}')
  
  console.log('[MyWave] Using settings:', myWaveSettings)
  
  // Создаем ключ кэша на основе настроек
  const hasSettings = myWaveSettings && Object.keys(myWaveSettings).length > 0
  const cacheKey = hasSettings
    ? `my-wave-${JSON.stringify(myWaveSettings)}`
    : 'my-wave'
  
  // Проверяем кэш ТОЛЬКО если есть настройки
  const cached = hasSettings ? playlistCache.get(cacheKey) : null
  if (cached) {
    console.log('[MyWave] Using cached playlist for key:', cacheKey)
    return {
      songs: cached,
      source: 'cached',
    }
  }

  let songs: ISong[] = []  // ИСПРАВЛЕНО: let вместо const
  const usedSongIds = new Set<string>()

  // Получаем забаненных артистов
  const { useMLStore } = await import('@/store/ml.store')
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []
  console.log('[MyWave] Banned artists:', bannedArtists)
  console.log('[MyWave] ML Profile:', mlState.profile)

  // Исключаем дизлайкнутые треки
  const dislikedSongIds = new Set<string>()
  if (excludeDisliked) {
    Object.entries(ratings)
      .filter(([_, rating]) => rating.like === false)
      .forEach(([id]) => dislikedSongIds.add(id))
    dislikedSongIds.forEach(id => usedSongIds.add(id))
  }

  // Фильтр для проверки banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[MyWave] ❌ BANNED artist ID: ${song.artist} (${song.artistId})`)
      return true
    }
    // Дополнительная проверка по имени артиста (если artistId не доступен)
    if (!song.artistId && bannedArtists.some(id => 
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[MyWave] ❌ BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[MyWave] Excluding ${recentUsedIds.size} recently played tracks`)

  // === MOOD DRIFT: Исключаем недавно пропущенные треки ===
  if (moodAdjustments.skipRecentTrackIds.length > 0) {
    moodAdjustments.skipRecentTrackIds.forEach(id => usedSongIds.add(id))
    console.log(`[MyWave] Mood Drift: Excluding ${moodAdjustments.skipRecentTrackIds.length} recently skipped tracks`)
  }

  // === AUDIOBOOKS EXCLUSION: Исключаем аудиокниги из ML ===
  const nonAudiobookLiked = likedSongIds.filter(async (id) => {
    const song = await subsonic.songs.getSong(id).catch(() => null)
    return song && !song.isAudiobook
  })
  
  // Фильтруем аудиокниги из likedSongIds (быстрая проверка через ratings)
  const filteredLikedIds = likedSongIds.filter(id => {
    const songInfo = ratings[id]?.songInfo
    // Если есть mediaType и это audiobook - исключаем
    if (songInfo?.mediaType === 'audiobook') return false
    return true
  })
  
  if (filteredLikedIds.length < likedSongIds.length) {
    console.log(`[MyWave] 📚 Filtered out ${likedSongIds.length - filteredLikedIds.length} audiobooks from liked songs`)
  }

  // === SEED ROTATION: Выбираем seed-треки с ротацией ===
  const seedTracks = await selectSeedTracks(filteredLikedIds, ratings, 5)
  console.log(`[MyWave] 🔄 Seed Rotation: ${seedTracks.length} seeds selected`)

  // Определяем vibeSeedTracks на верхнем уровне (чтобы было доступно везде)
  let vibeSeedTracks: ISong[] = seedTracks.length > 0 ? seedTracks : []

  // 1. СНАЧАЛА фильтруем лайкнутые по настройкам
  if (filteredLikedIds.length > 0 && myWaveSettings && Object.keys(myWaveSettings).length > 0) {
    console.log('[MyWave] Filtering liked songs by settings...')
    
    const { analyzeTrack } = await import('./vibe-similarity')
    
    // Получаем все лайкнутые треки (без аудиокниг)
    const allLikedSongs = await Promise.all(
      filteredLikedIds.map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    // Фильтруем по настройкам
    const filteredLiked = allLikedSongs.filter(song => {
      if (!song || !song.genre) return false

      // ПРОПУСКАЕМ забаненных артистов!
      if (isBannedArtist(song)) {
        return false
      }
      
      const features = analyzeTrack(song)
      const artist = (song.artist || '').toLowerCase()

      // ПРИОРИТЕТ: Артисты "relax/asmr" для calm/sleep
      const isCalmMode = myWaveSettings.mood === 'calm' || myWaveSettings.activity === 'sleep'
      const relaxArtists = ['relax', 'asmr', 'meditation', 'sleep', 'calm']
      
      // Если артист relax/asmr - мягкий фильтр
      if (isCalmMode && relaxArtists.some(a => artist.includes(a))) {
        return features.energy <= 0.6  // Мягкий фильтр для relax артистов
      }

      // Фильтр по настроению - МЯГКИЙ!
      if (myWaveSettings.mood === 'calm') {
        if (features.energy > 0.6) {  // Было 0.5
          return false
        }
      }

      // Фильтр по занятию - МЯГКИЙ!
      if (myWaveSettings.activity === 'sleep') {
        if (features.energy > 0.5 || features.bpm > 120) {  // Было 0.4 и 110
          return false
        }
      }

      // Фильтр по языку (instrumental = без слов) - МЯГКИЙ!
      if (myWaveSettings.language === 'instrumental') {
        if (features.instrumentalness < 0.5) {  // Было 0.7
          return false
        }
      }

      // === MOOD DRIFT: Дополнительная фильтрация по энергии ===
      if (moodAdjustments.energyMax !== undefined) {
        if (features.energy > moodAdjustments.energyMax) {
          return false
        }
      }

      return true
    })

    // Сортируем: СНАЧАЛА relax/asmr артисты, потом остальные
    if (isCalmMode) {
      filteredLiked.sort((a, b) => {
        const aArtist = (a.artist || '').toLowerCase()
        const bArtist = (b.artist || '').toLowerCase()
        const aIsRelax = relaxArtists.some(r => aArtist.includes(r)) ? 1 : 0
        const bIsRelax = relaxArtists.some(r => bArtist.includes(r)) ? 1 : 0
        return bIsRelax - aIsRelax  // Relax артисты первыми!
      })
    }

    console.log(`[MyWave] Filtered ${filteredLiked.length} liked songs by settings`)
    
    // Добавляем отфильтрованные лайкнутые
    filteredLiked.forEach(song => {
      if (song && !usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 2. Если настроек нет или мало треков - берем случайные лайкнутые
  if (songs.length === 0 && likedSongIds.length > 0) {
    const shuffledLiked = [...likedSongIds].sort(() => Math.random() - 0.5)
    const likedSongs = await Promise.all(
      shuffledLiked.slice(0, Math.min(10, likedSongIds.length)).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    likedSongs.forEach(song => {
      if (song && song.genre && !usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 2. VIBE SIMILARITY: Находим треки похожие на лайкнутые по аудио-признакам
  // ВАЖНО: Учитываем настройки при поиске похожих треков!
  if (songs.length > 0 && limit > songs.length) {
    console.log('[MyWave] Using Vibe Similarity to find similar tracks...')

    // Загружаем все треки для анализа
    console.log('[MyWave] Loading all songs for vibe analysis...')
    const allSongs = await getRandomSongs(200)
    
    // СНАЧАЛА фильтруем allSongs по настройкам!
    let filteredAllSongs = allSongs
    if (myWaveSettings && Object.keys(myWaveSettings).length > 0) {
      const { analyzeTrack } = await import('./vibe-similarity')
      
      filteredAllSongs = allSongs.filter(song => {
        const features = analyzeTrack(song)
        const artist = (song.artist || '').toLowerCase()

        // ПРОПУСКАЕМ забаненных артистов!
        if (isBannedArtist(song)) {
          return false
        }
        
        // ПРИОРИТЕТ: Артисты "relax/asmr" для calm/sleep
        const isCalmMode = myWaveSettings.mood === 'calm' || myWaveSettings.activity === 'sleep'
        const relaxArtists = ['relax', 'asmr', 'meditation', 'sleep', 'calm']
        
        // Если артист relax/asmr - пропускаем почти всё!
        if (isCalmMode && relaxArtists.some(a => artist.includes(a))) {
          return features.energy <= 0.6  // Мягкий фильтр
        }
        
        // Фильтр по настроению - ОЧЕНЬ МЯГКИЙ!
        if (myWaveSettings.mood === 'calm') {
          if (features.energy > 0.6) {  // Было 0.5
            return false
          }
        }
        
        // Фильтр по занятию - МЯГКИЙ!
        if (myWaveSettings.activity === 'sleep') {
          if (features.energy > 0.5 || features.bpm > 120) {  // Было 0.4 и 110
            return false
          }
        }
        
        // Фильтр по языку (instrumental = без слов)
        if (myWaveSettings.language === 'instrumental') {
          if (features.instrumentalness < 0.5) {  // Было 0.7
            return false
          }
        }
        
        return true
      })
      
      console.log(`[MyWave] Filtered allSongs from ${allSongs.length} to ${filteredAllSongs.length} by settings`)
      
      // Обновляем vibeSeedTracks если ещё не определены
      if (vibeSeedTracks.length === 0) {
        vibeSeedTracks = seedTracks.length > 0 ? seedTracks : songs.slice(0, Math.min(5, songs.length))
      }
    }

    // Используем seed tracks из Seed Rotation (вместо случайного выбора)
    if (vibeSeedTracks.length === 0) {
      vibeSeedTracks = songs.slice(0, Math.min(5, songs.length))
    }
    
    const allSongsForVibe: ISong[] = []
    const vibeUsedIds = new Set<string>()
    const maxVibeTracks = Math.floor(limit / 2)

    // Для каждого seed находим похожие треки ИЗ ОТФИЛЬТРОВАННЫХ!
    for (const seed of vibeSeedTracks) {
      const tracksPerSeed = Math.floor(maxVibeTracks / vibeSeedTracks.length)
      const similar = findSimilarTracks(seed, filteredAllSongs, tracksPerSeed, 0.6)  // Используем filteredAllSongs!
      similar.forEach(track => {
        if (!vibeUsedIds.has(track.id) && !usedSongIds.has(track.id)) {
          allSongsForVibe.push(track)
          vibeUsedIds.add(track.id)
          usedSongIds.add(track.id)
        }
      })
      if (allSongsForVibe.length >= maxVibeTracks) break
    }

    // Сортируем: СНАЧАЛА relax/asmr артисты!
    if (myWaveSettings?.mood === 'calm' || myWaveSettings?.activity === 'sleep') {
      const relaxArtists = ['relax', 'asmr', 'meditation', 'sleep', 'calm']
      allSongsForVibe.sort((a, b) => {
        const aArtist = (a.artist || '').toLowerCase()
        const bArtist = (b.artist || '').toLowerCase()
        const aIsRelax = relaxArtists.some(r => aArtist.includes(r)) ? 1 : 0
        const bIsRelax = relaxArtists.some(r => bArtist.includes(r)) ? 1 : 0
        return bIsRelax - aIsRelax
      })
    }

    songs.push(...allSongsForVibe.slice(0, maxVibeTracks))
    console.log(`[MyWave] Found ${allSongsForVibe.length} tracks via Vibe Similarity`)
  }

  // 3. === SCORING: Если мало треков, используем P(like|t) формулу вместо случайного выбора ===
  if (songs.length < limit) {
    console.log('[MyWave] Using P(like|t) Scoring to fill remaining tracks...')

    // Собираем кандидатов из жанров и случайных треков
    const candidatePool: ISong[] = []
    const candidateIds = new Set<string>(usedSongIds)

    // Получаем топ жанры из лайкнутых
    const genreCount: Record<string, number> = {}
    songs.forEach(song => {
      if (song.genre) {
        genreCount[song.genre] = (genreCount[song.genre] || 0) + 1
      }
    })

    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre)

    // Для каждого топ жанра берем кандидатов
    for (const genre of topGenres) {
      const songsByGenre = await getSongsByGenre(genre, 30)
      for (const song of songsByGenre) {
        if (!candidateIds.has(song.id) && !isBannedArtist(song)) {
          candidatePool.push(song)
          candidateIds.add(song.id)
        }
      }
    }

    // Добавляем случайных кандидатов для разнообразия
    const randomCandidates = await getRandomSongs(50)
    for (const song of randomCandidates) {
      if (!candidateIds.has(song.id) && !isBannedArtist(song)) {
        candidatePool.push(song)
        candidateIds.add(song.id)
      }
    }

    // Подготавливаем контекст для скоринга
    const currentHour = new Date().getHours()
    const usedArtists = new Map<string, number>()
    const usedGenres = new Map<string, number>()

    // Заполняем usedArtists и usedGenres из уже добавленных треков
    songs.forEach(song => {
      if (song.artistId) {
        usedArtists.set(song.artistId, (usedArtists.get(song.artistId) || 0) + 1)
      }
      if (song.genre) {
        usedGenres.set(song.genre, (usedGenres.get(song.genre) || 0) + 1)
      }
    })

    const scoringContext = {
      currentHour,
      activity: myWaveSettings?.activity || '',
      mood: myWaveSettings?.mood || '',
      usedArtists,
      usedGenres,
      seedTracks: vibeSeedTracks.slice(0, 5),  // Seed Rotation треки
    }

    // Скорим и ранжируем кандидатов
    const neededTracks = limit - songs.length
    const scoredCandidates = await trackScorer.scoreAndRankTracks(
      candidatePool,
      scoringContext,
      neededTracks
    )

    // Добавляем топ скоренные треки
    for (const scored of scoredCandidates) {
      if (songs.length >= limit) break
      if (scored.totalScore > 0.2) {  // Минимальный порог
        songs.push(scored.song)
        usedSongIds.add(scored.song.id)
        
        // Обновляем контекст после добавления трека
        trackScorer.updateContextAfterAdding(scoringContext, scored.song)
      }
    }

    // Логируем статистику скоринга
    const stats = trackScorer.getScoringStats(scoredCandidates)
    console.log(`[MyWave] Scoring stats: avg=${stats.avgScore.toFixed(2)}, max=${stats.maxScore.toFixed(2)}, diversity_penalty=${stats.avgDiversityPenalty.toFixed(2)}`)
    console.log(`[MyWave] Added ${scoredCandidates.filter(s => s.totalScore > 0.2).length} tracks via P(like|t) Scoring`)
  }

  // 5. === ENERGY CURVE PER MOOD: Умная сортировка по настроению ===
  let orchestratedPlaylist: ISong[]

  const { analyzeTrack } = await import('./vibe-similarity')
  const tracksWithFeatures = songs.map(song => ({
    song,
    energy: analyzeTrack(song).energy,
  }))

  if (myWaveSettings?.mood === 'calm' || myWaveSettings?.activity === 'sleep') {
    // Calm/Sleep: DESCENDING (0.6→0.2) — постепенно успокаиваем
    orchestratedPlaylist = [...tracksWithFeatures]
      .sort((a, b) => b.energy - a.energy)  // От высокой энергии к низкой
      .slice(0, limit)
      .map(t => t.song)

    console.log('[MyWave] 🌙 Using DESCENDING energy curve (calm→sleep)')
  } else if (myWaveSettings?.activity === 'workout') {
    // Workout: ASCENDING (0.5→0.9) — разгоняем энергию
    const midPoint = Math.floor(limit / 2)
    const lowEnergy = tracksWithFeatures.filter(t => t.energy < 0.6).sort((a, b) => a.energy - b.energy)
    const highEnergy = tracksWithFeatures.filter(t => t.energy >= 0.6).sort((a, b) => a.energy - b.energy)
    
    orchestratedPlaylist = [
      ...lowEnergy.slice(0, midPoint),
      ...highEnergy.slice(0, limit - midPoint)
    ].map(t => t.song)

    console.log('[MyWave] 🔥 Using ASCENDING energy curve (workout)')
  } else if (myWaveSettings?.activity === 'work') {
    // Work: PEAK (0.4→0.7→0.4) — пик в середине для продуктивности
    const sorted = [...tracksWithFeatures].sort((a, b) => a.energy - b.energy)
    const third = Math.floor(limit / 3)
    
    orchestratedPlaylist = [
      ...sorted.slice(0, third).map(t => t.song),              // Низкая энергия (начало)
      ...sorted.slice(third, third * 2).map(t => t.song),      // Средняя энергия (пик)
      ...sorted.slice(0, Math.min(third, limit - third * 2)).map(t => t.song),  // Снова низкая (конец)
    ].slice(0, limit)

    console.log('[MyWave] 💼 Using PEAK energy curve (work)')
  } else {
    // Default: оркестратор с нарастанием энергии
    orchestratedPlaylist = orchestratePlaylist(songs, {
      startWith: 'energetic',
      endWith: 'calm',
      excludedSongIds: dislikedSongIds,
    })

    console.log('[MyWave] 🎵 Using default orchestration (energetic→calm)')
  }

  let finalSongs = orchestratedPlaylist.slice(0, limit)

  // 🆕 Rediscovery Queue: каждую 3-ю сессию добавляем 1 забытый трек
  const sessionCount = parseInt(localStorage.getItem('kumaflow:session-count') || '0')
  if (sessionCount % 3 === 0 && finalSongs.length > 5) {
    console.log('[MyWave] 🔄 Rediscovery: 3rd session, adding forgotten track')
    const forgottenTrack = await getRediscoveryTrack(ratings)
    if (forgottenTrack && !usedSongIds.has(forgottenTrack.id)) {
      // Заменяем последний трек на rediscovery
      finalSongs[finalSongs.length - 1] = forgottenTrack
      console.log(`[MyWave] 🔄 Rediscovery track: ${forgottenTrack.title}`)
    }
  }
  
  // Увеличиваем счётчик сессий
  localStorage.setItem('kumaflow:session-count', String(sessionCount + 1))

  // 🆕 Session Context: адаптируем порядок в зависимости от позиции
  finalSongs = applySessionContext(finalSongs, ratings)

  // 🆕 Genre-Aware Curves: применяем жанровую сортировку
  finalSongs = trackScorer.applyGenreCurveSorting(finalSongs)

  // Сохраняем в кэш
  playlistCache.set(cacheKey, finalSongs, usedSongIds, {
    source: 'mixed',
    vibeSimilarity: true,
    orchestrated: true,
    settings: myWaveSettings,
  })

  // Генерируем умное название для My Wave
  const { generateNameFromSongs } = await import('@/service/playlist-naming')
  const myWaveNameResult = generateNameFromSongs('myWave', finalSongs)

  // Добавляем название к результату
  ;(finalSongs as any).playlistName = myWaveNameResult.name
  ;(finalSongs as any).playlistAlternatives = myWaveNameResult.alternatives

  console.log(`[MyWave] 🎵 Generated name: ${myWaveNameResult.name}`)

  return {
    songs: finalSongs,
    source: 'mixed',
  }
}

/**
 * Генерация плейлиста на основе выбранных артистов из холодного старта
 * С Vibe Similarity и Оркестратором!
 */
export async function generateArtistBasedPlaylist(
  selectedArtists: string[],
  limit: number = 50
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[ArtistBased] Generating playlist for', selectedArtists.length, 'artists')

  // 🔒 ЗАГРУЖАЕМ BANNED ARTISTS
  const { useMLStore } = await import('@/store/ml.store')
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []
  console.log('[ArtistBased] 🔒 Banned artists:', bannedArtists)

  // Функция фильтрации по banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[ArtistBased] ❌ BANNED artist: ${song.artist} (${song.artistId})`)
      return true
    }
    if (!song.artistId && bannedArtists.some(id =>
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[ArtistBased] ❌ BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  // 1. СНАЧАЛА берем по 2-3 трека от каждого артиста (чтобы не перегружать)
  for (const artistId of selectedArtists) {
    try {
      const artist = await subsonic.artists.getOne(artistId)
      if (artist?.name) {
        const topSongs = await getTopSongs(artist.name, 3)  // Только 3 трека!
        for (const song of topSongs) {
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      }
    } catch (error) {
      console.error('Failed to get artist songs:', error)
    }
  }

  console.log('[ArtistBased] Got', songs.length, 'seed tracks from artists')

  // 2. VIBE SIMILARITY: Находим похожие треки для каждого seed!
  if (songs.length > 0) {
    console.log('[ArtistBased] Using Vibe Similarity...')
    const allSongs = await getRandomSongs(200)
    
    const seedTracks = songs.slice(0, Math.min(10, songs.length))
    const vibeSimilar: ISong[] = []
    const vibeUsedIds = new Set<string>(usedSongIds)

    for (const seed of seedTracks) {
      const similar = findSimilarTracks(seed, allSongs, 5, 0.65)
      for (const track of similar) {
        // 🔒 ФИЛЬТР BANNED ARTISTS
        if (isBannedArtist(track)) continue
        if (!vibeUsedIds.has(track.id)) {
          vibeSimilar.push(track)
          vibeUsedIds.add(track.id)
        }
      }
    }

    console.log('[ArtistBased] Found', vibeSimilar.length, 'tracks via Vibe Similarity')
    songs.push(...vibeSimilar.slice(0, Math.floor(limit / 2)))
  }

  // 3. Если мало - добавляем по жанрам артистов
  if (songs.length < limit) {
    console.log('[ArtistBased] Adding genre-based tracks...')
    const genreSet = new Set<string>()
    
    for (const artistId of selectedArtists.slice(0, 5)) {
      try {
        const artist = await subsonic.artists.getOne(artistId)
        if (artist?.genres && artist.genres.length > 0) {
          artist.genres.forEach(g => genreSet.add(g))
        }
      } catch (error) {
        // Ignore
      }
    }

    for (const genre of Array.from(genreSet).slice(0, 5)) {
      if (songs.length >= limit) break
      
      const genreSongs = await getSongsByGenre(genre, 10)
      for (const song of genreSongs) {
        if (songs.length >= limit) break
        // 🔒 ФИЛЬТР BANNED ARTISTS
        if (isBannedArtist(song)) continue
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
  }

  // 4. ОРКЕСТРАТОР: Сортируем для плавных переходов!
  console.log('[ArtistBased] Orchestrating playlist...')
  const { orchestratePlaylist } = await import('./playlist-orchestrator')
  
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
  })

  console.log('[ArtistBased] Final playlist:', orchestrated.length, 'tracks')

  return {
    songs: orchestrated,
    source: 'mixed',
  }
}

/**
 * Генерация плейлиста на основе выбранных жанров из холодного старта
 */
export async function generateGenreBasedPlaylist(
  selectedGenres: string[],
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Для каждого выбранного жанра берем треки
  for (const genre of selectedGenres) {
    if (songs.length >= limit) break

    const songsByGenre = await getSongsByGenre(genre, 10)
    for (const song of songsByGenre) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  return {
    songs,
    source: 'genre',
  }
}

/**
 * Получить похожие треки на основе текущего
 */
export async function getSimilarTracks(
  currentSong: ISong,
  limit: number = 10
): Promise<ISong[]> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>([currentSong.id])

  // 1. Треки того же артиста
  if (currentSong.artistId) {
    const artistSongs = await getTopSongs(currentSong.artist, 5)
    artistSongs.forEach(song => {
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 2. Треки того же жанра
  if (songs.length < limit && currentSong.genre) {
    const genreSongs = await getSongsByGenre(currentSong.genre, 10)
    genreSongs.forEach(song => {
      if (songs.length >= limit) return
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 3. Случайные треки
  if (songs.length < limit) {
    const randomSongs = await getRandomSongs(limit - songs.length)
    randomSongs.forEach(song => {
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  return songs.slice(0, limit)
}

/**
 * Генерация "Ежедневного микса" на основе лайкнутых треков и жанров
 * ФОРМУЛА: 70% знакомое + 30% новое (Daily Mix как у Яндекс.Музыки)
 */
export async function generateDailyMix(
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  preferredArtists: Record<string, number>,
  ratings: Record<string, any>,
  limit: number = 25
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  // Проверяем кэш
  const today = new Date().toISOString().split('T')[0]
  const cacheKey = `daily-mix-${today}`
  const cached = playlistCache.get(cacheKey)
  if (cached) {
    console.log('[DailyMix v2] Using cached playlist')
    const now = new Date()
    return {
      playlist: { songs: cached, source: 'cached' },
      metadata: {
        id: cacheKey, type: 'daily-mix', name: 'Ежедневный микс',
        description: `Персональный микс на ${now.toLocaleDateString('ru-RU')}`,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
    }
  }

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Исключаем дизлайкнутые треки
  const dislikedSongIds = new Set<string>(
    Object.entries(ratings || {})
      .filter(([_, rating]) => rating.like === false)
      .map(([id]) => id)
  )
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[DailyMix v2] 🚫 Excluding ${recentUsedIds.size} recently played tracks`)

  // Импорт vibe-similarity
  const { analyzeTrack, findSimilarTracks, optimizeTrackSequence } = await import('./vibe-similarity')

  // ============================================
  // 🔒 ЗАГРУЖАЕМ BANNED ARTISTS
  // ============================================
  const { useMLStore } = await import('@/store/ml.store')
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []
  console.log('[DailyMix v2] 🔒 Banned artists:', bannedArtists)

  // Функция фильтрации по banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[DailyMix v2] ❌ BANNED artist: ${song.artist} (${song.artistId})`)
      return true
    }
    if (!song.artistId && bannedArtists.some(id =>
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[DailyMix v2] ❌ BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  // ============================================
  // 🔒 ЗАГРУЖАЕМ НАСТРОЙКИ ОТКРЫТИЙ
  // ============================================
  const { useMLPlaylistsStore: useMLPlaylistsStoreDaily } = await import('@/store/ml-playlists.store')
  const mlPlaylistsStateDaily = useMLPlaylistsStoreDaily.getState()
  const discoveryEnabledDaily = mlPlaylistsStateDaily.settings.discoveryEnabled ?? false
  const userNoveltyFactorDaily = mlPlaylistsStateDaily.settings.noveltyFactor ?? 0.2

  // Если discovery ВЫКЛ — novelty = 0
  const effectiveNoveltyDaily = discoveryEnabledDaily ? userNoveltyFactorDaily : 0.0

  console.log(`[DailyMix v2] 🔒 Discovery: ${discoveryEnabledDaily ? 'ON' : 'OFF'}, Novelty: ${effectiveNoveltyDaily.toFixed(2)}`)

  // ============================================
  // 1. "ЗАБЫТЫЕ" ТРЕКИ (60%): 5+ plays, 2+ months not played
  // ============================================
  const twoMonthsAgo = Date.now() - (60 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgoYear = new Date(ninetyDaysAgo).getFullYear()

  console.log('[DailyMix v2] 🕰️ FORGOTTEN: Finding tracks with 5+ plays, 2+ months not played...')

  const forgottenTrackIds = Object.entries(ratings || {})
    .filter(([id, rating]) => {
      if (!rating.playCount || rating.playCount < 5) return false
      if (!rating.lastPlayed) return false
      const lastPlayed = new Date(rating.lastPlayed).getTime()
      return lastPlayed <= twoMonthsAgo
    })
    .map(([id]) => id)

  console.log(`[DailyMix v2] 🕰️ Found ${forgottenTrackIds.length} forgotten tracks`)

  // Получаем забытые треки из библиотеки
  const forgottenSongs: ISong[] = []
  if (forgottenTrackIds.length > 0) {
    const forgottenResults = await Promise.all(
      forgottenTrackIds.slice(0, 50).map(id => subsonic.songs.getSong(id).catch(() => null))
    )

    // Фильтруем по BPM/MOOD профилю пользователя
    let userAvgEnergy = 0.5
    let userAvgBPM = 100
    const userMoodCounts: Record<string, number> = {}

    const likedResults = await Promise.all(
      likedSongIds.slice(0, 50).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    const validLiked = likedResults.filter((s): s is ISong => s != null)

    validLiked.forEach(song => {
      if (song.energy) { userAvgEnergy += song.energy; }
      if (song.bpm && song.bpm > 0) { userAvgBPM += song.bpm; }
      if (song.moods) {
        song.moods.forEach(m => { userMoodCounts[m.toUpperCase()] = (userMoodCounts[m.toUpperCase()] || 0) + 1 })
      }
    })

    if (validLiked.length > 0) {
      userAvgEnergy /= validLiked.length
      userAvgBPM /= validLiked.length
    }

    const energyMin = Math.max(0, userAvgEnergy - 0.3)
    const energyMax = Math.min(1, userAvgEnergy + 0.3)
    const bpmMin = userAvgBPM * 0.7
    const bpmMax = userAvgBPM * 1.3
    const userTopMoods = Object.entries(userMoodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([mood]) => mood)

    console.log(`[DailyMix v2] 🎵 User Audio Profile: Energy=${energyMin.toFixed(2)}-${energyMax.toFixed(2)}, BPM=${bpmMin.toFixed(0)}-${bpmMax.toFixed(0)}, Top Moods=${userTopMoods.join(', ')}`)

    for (const song of forgottenResults.filter((s): s is ISong => s != null)) {
      if (usedSongIds.has(song.id)) continue
      if (dislikedSongIds.has(song.id)) continue
      // 🔒 ФИЛЬТР BANNED ARTISTS
      if (isBannedArtist(song)) continue

      // BPM фильтр
      if (song.bpm && song.bpm > 0 && (song.bpm < bpmMin || song.bpm > bpmMax)) continue

      // Energy фильтр
      if (song.energy !== undefined && (song.energy < energyMin || song.energy > energyMax)) continue

      // MOOD фильтр (мягкий)
      if (song.moods && song.moods.length > 0 && userTopMoods.length > 0) {
        const hasMatchingMood = song.moods.some(m => userTopMoods.includes(m.toUpperCase()))
        if (!hasMatchingMood && Math.random() > 0.5) continue
      }

      forgottenSongs.push(song)
      usedSongIds.add(song.id)
    }

    console.log(`[DailyMix v2] 🕰️ Filtered to ${forgottenSongs.length} forgotten tracks (energy: ${energyMin.toFixed(2)}-${energyMax.toFixed(2)}, BPM: ${bpmMin.toFixed(0)}-${bpmMax.toFixed(0)})`)
  }

  // Добавляем забытые треки (50% от лимита)
  const forgottenCount = Math.floor(limit * 0.5)
  for (const song of forgottenSongs.slice(0, forgottenCount)) {
    if (songs.length >= forgottenCount) break
    songs.push(song)
  }
  console.log(`[DailyMix v2] 🕰️ FORGOTTEN: Added ${songs.length} tracks`)

  // ============================================
  // 2. VIBE SIMILARITY к "забытым" (10%)
  // ============================================
  const vibeCount = Math.floor(limit * 0.1)
  if (songs.length > 0 && vibeCount > 0) {
    console.log(`[DailyMix v2] 🎵 VIBE SIMILAR: Finding ${vibeCount} tracks similar to forgotten...`)

    const seedTracks = songs.slice(0, 3) // Первые 3 забытых
    const allSongs = await getRandomSongs(300)
    const vibeUsedIds = new Set<string>()

    for (const seed of seedTracks) {
      const similar = findSimilarTracks(seed, allSongs, 10, 0.65)
      for (const track of similar) {
        if (track?.genre && !vibeUsedIds.has(track.id) && !usedSongIds.has(track.id)) {
          // 🔒 ФИЛЬТР BANNED ARTISTS
          if (isBannedArtist(track)) continue

          // BPM/MOOD фильтр по профилю
          const energyOk = !track.energy || (track.energy >= energyMin && track.energy <= energyMax)
          const bpmOk = !track.bpm || track.bpm === 0 || (track.bpm >= bpmMin && track.bpm <= bpmMax)

          if (energyOk && bpmOk) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
          }
        }
        if (songs.length >= forgottenCount + vibeCount) break
      }
    }
    console.log(`[DailyMix v2] 🎵 VIBE SIMILAR: Total now ${songs.length} tracks`)
  }

  // ============================================
  // 🔒 НОВИНКИ: МНОГОРУКИЕ БАНДИТЫ — АККУРАТНОЕ ВНЕДРЕНИЕ
  // Используем effectiveNoveltyDaily из настроек
  // ============================================
  const totalPlays = Object.values(ratings || {}).reduce((sum: number, r: any) => sum + (r.playCount || 0), 0)
  const isNoviceUser = likedSongIds.length < 30 || totalPlays < 100

  // 🔒 ОГРАНИЧИВАЕМ novelty для новичков И используем effectiveNoveltyDaily!
  const maxNoveltyPercent = isNoviceUser
    ? Math.min(0.10, effectiveNoveltyDaily)  // Для новичков макс 10% ИЛИ меньше если noveltyFactor низкий
    : effectiveNoveltyDaily  // Для опытных — как настроено

  const noveltyCount = Math.min(
    limit - songs.length,  // Не больше чем осталось места
    Math.floor(limit * maxNoveltyPercent)  // И не больше чем положено по %
  )
  const artistNoveltyCount = Math.floor(noveltyCount * 0.5)
  const genreNoveltyCount = noveltyCount - artistNoveltyCount

  console.log(`[DailyMix v2] 👤 User type: ${isNoviceUser ? 'NOVICE' : 'EXPERIENCED'}`)
  console.log(`[DailyMix v2] 🔒 Novelty: ${effectiveNoveltyDaily.toFixed(2)}, maxNovelty: ${maxNoveltyPercent.toFixed(2)}, count: ${noveltyCount}`)
  console.log(`[DailyMix v2] 🆕 NOVELTY: Adding ${noveltyCount} new tracks (${artistNoveltyCount} artist + ${genreNoveltyCount} genre)`)

  // 3a. 🔒 НОВИНКИ АРТИСТОВ: НЕ "СВЕЖИЕ РЕЛИЗЫ", А "НЕПРОИГРАННЫЕ ТРЕКИ"
  // Это решает проблему классических артистов — у них нет свежих релизов,
  // но есть много треков которые пользователь ещё не слышал
  if (artistNoveltyCount > 0) {
    console.log(`[DailyMix v2] 🆕 ARTIST NOVELTY: Finding UNPLAYED tracks from top artists...`)

    const topArtists = Object.entries(preferredArtists || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    for (const [artistId] of topArtists) {
      if (songs.length >= forgottenCount + vibeCount + artistNoveltyCount) break

      try {
        const artist = await subsonic.artists.getOne(artistId).catch(() => null)
        if (!artist?.name) continue

        // Получаем ВСЕ треки артиста (не только свежие!)
        const artistSongs = await getTopSongs(artist.name, 30)

        // 🔒 Фильтруем: НЕplayed + НЕ banned + НЕ used
        const unplayedSongs = artistSongs.filter(s => {
          // 🔒 ФИЛЬТР BANNED ARTISTS
          if (isBannedArtist(s)) return false
          // НЕ played recently (или вообще не played)
          const rating = ratings?.[s.id]
          const isUnplayed = !rating || (rating.playCount || 0) === 0
          const notRecentlyUsed = !usedSongIds.has(s.id)
          return isUnplayed && notRecentlyUsed
        })

        // Если не набрали unplayed — берём просто редко played (< 2 раз)
        let fallbackSongs: ISong[] = []
        if (unplayedSongs.length < artistNoveltyCount) {
          fallbackSongs = artistSongs.filter(s => {
            if (isBannedArtist(s)) return false
            const rating = ratings?.[s.id]
            const isRare = !rating || (rating.playCount || 0) < 2
            return isRare && !usedSongIds.has(s.id)
          })
        }

        const noveltySongs = unplayedSongs.length > 0 ? unplayedSongs : fallbackSongs

        for (const song of noveltySongs) {
          if (songs.length >= forgottenCount + vibeCount + artistNoveltyCount) break
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      } catch (err) {
        console.warn(`[DailyMix v2] Failed to get artist ${artistId} songs`)
      }
    }
    console.log(`[DailyMix v2] 🆕 ARTIST NOVELTY: Total now ${songs.length} tracks`)
  }

  // 3b. Новые треки в любимых жанрах
  if (genreNoveltyCount > 0) {
    const topGenres = Object.entries(preferredGenres)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre]) => genre)

    console.log(`[DailyMix v2] 🆕 GENRE NOVELTY: From genres: ${topGenres.join(', ')}`)

    for (const genre of topGenres) {
      if (songs.length >= limit) break

      const songsByGenre = await getSongsByGenre(genre, 15)
      const recentInGenre = songsByGenre.filter(s => {
        const created = s.created ? new Date(s.created).getTime() : 0
        const year = s.year || 0
        // 🔒 ФИЛЬТР BANNED ARTISTS
        if (isBannedArtist(s)) return false
        return (created > ninetyDaysAgo || year >= ninetyDaysAgoYear) && !usedSongIds.has(s.id)
      })

      for (const song of recentInGenre.slice(0, 3)) {
        if (songs.length >= limit) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
    console.log(`[DailyMix v2] 🆕 NOVELTY: Total now ${songs.length} tracks`)
  }

  // 🔒 FALLBACK: Если всё ещё мало треков — добавляем из любимых артистов
  if (songs.length < Math.min(limit * 0.5, 10)) {
    console.log(`[DailyMix v2] 🔒 FALLBACK: Only ${songs.length} tracks, adding from preferred artists...`)
    const topArtists = Object.entries(preferredArtists || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    for (const [artistId] of topArtists) {
      if (songs.length >= limit) break
      try {
        const artist = await subsonic.artists.getOne(artistId).catch(() => null)
        if (!artist?.name) continue

        const artistSongs = await getTopSongs(artist.name, 20)
        for (const song of artistSongs) {
          if (songs.length >= limit) break
          if (isBannedArtist(song)) continue
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      } catch (err) { /* skip */ }
    }
    console.log(`[DailyMix v2] 🔒 FALLBACK: Total now ${songs.length} tracks`)
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // ============================================
  // 4. ОРКЕСТРАТОР: Energy descending (energetic → calm)
  // ============================================
  console.log('[DailyMix v2] 🎼 ORCHESTRATOR: Creating energy wave (energetic → calm)...')

  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',  // Начинаем энергично
    endWith: 'calm',         // Заканчиваем спокойно
    excludedSongIds: dislikedSongIds,
  })

  const finalSongs = createEnergyWave(orchestratedSongs).slice(0, limit)

  console.log('[DailyMix v2] Energy progression (first 10 tracks):')
  finalSongs.slice(0, 10).forEach((song, i) => {
    const features = analyzeTrack(song)
    console.log(`  ${i+1}. ${song.title} - Energy: ${features.energy.toFixed(2)}, BPM: ${features.bpm}`)
  })

  // Сохраняем в кэш
  playlistCache.set(cacheKey, finalSongs, usedSongIds, {
    source: 'mixed',
    vibeSimilarity: true,
    orchestrated: true,
    formula: '50% forgotten + 10% vibe + 40% novelty',
  })

  // Генерируем умное название
  const { generateNameFromSongs } = await import('@/service/playlist-naming')
  const playlistNameResult = generateNameFromSongs('dailyMix', finalSongs)

  return {
    playlist: { songs: finalSongs, source: 'mixed' },
    metadata: {
      id: cacheKey, type: 'daily-mix', name: playlistNameResult.name,
      description: `${playlistNameResult.name} • ${finalSongs.length} треков`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}

/**
 * Генерация "Открытия недели" УЛУЧШЕННАЯ v2
 * ФОРМУЛА: 70% niche (соседние жанры) + 10% vibe + 20% surprises
 */
export async function generateDiscoverWeekly(
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  limit: number = 20,
  ratings: Record<string, any> = {}  // Добавил ratings
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>(likedSongIds) // Исключаем лайкнутые

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[DiscoverWeekly v2] 🚫 Excluding ${recentUsedIds.size} recently played tracks`)

  // Импорт vibe-similarity
  const { analyzeTrack, findSimilarTracks, optimizeTrackSequence } = await import('./vibe-similarity')

  // ============================================
  // 🔒 ЗАГРУЖАЕМ BANNED ARTISTS
  // ============================================
  const { useMLStore } = await import('@/store/ml.store')
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []
  console.log('[DiscoverWeekly v2] 🔒 Banned artists:', bannedArtists)

  // Функция фильтрации по banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[DiscoverWeekly v2] ❌ BANNED artist: ${song.artist} (${song.artistId})`)
      return true
    }
    if (!song.artistId && bannedArtists.some(id =>
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[DiscoverWeekly v2] ❌ BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  // ============================================
  // 0. АНАЛИЗ АУДИО-ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
  // ============================================
  let userAvgEnergy = 0.5
  let userAvgBPM = 100
  const userMoodCounts: Record<string, number> = {}

  if (likedSongIds.length > 0) {
    const likedResults = await Promise.all(
      likedSongIds.slice(0, 50).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    const validLiked = likedResults.filter((s): s is ISong => s != null)

    let totalEnergy = 0, countEnergy = 0
    let totalBPM = 0, countBPM = 0

    validLiked.forEach(song => {
      if (song.energy !== undefined) { totalEnergy += song.energy; countEnergy++ }
      if (song.bpm && song.bpm > 0) { totalBPM += song.bpm; countBPM++ }
      if (song.moods) {
        song.moods.forEach(m => { userMoodCounts[m.toUpperCase()] = (userMoodCounts[m.toUpperCase()] || 0) + 1 })
      }
    })

    if (countEnergy > 0) userAvgEnergy = totalEnergy / countEnergy
    if (countBPM > 0) userAvgBPM = totalBPM / countBPM
  }

  const userTopMoods = Object.entries(userMoodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([mood]) => mood)

  const energyMin = Math.max(0, userAvgEnergy - 0.3)
  const energyMax = Math.min(1, userAvgEnergy + 0.3)
  const bpmMin = userAvgBPM * 0.7
  const bpmMax = userAvgBPM * 1.3

  console.log(`[DiscoverWeekly v2] 🎵 User Profile: Energy=${userAvgEnergy.toFixed(2)}, BPM=${userAvgBPM.toFixed(0)}, Top Moods=${userTopMoods.join(', ')}`)

  // Функция проверки соответствия трека профилю
  const matchesUserProfile = (song: ISong): boolean => {
    // 🔒 ФИЛЬТР BANNED ARTISTS
    if (isBannedArtist(song)) return false
    if (song.energy && (song.energy < energyMin || song.energy > energyMax)) return false
    if (song.bpm && song.bpm > 0 && (song.bpm < bpmMin || song.bpm > bpmMax)) return false
    if (song.moods && song.moods.length > 0 && userTopMoods.length > 0) {
      const hasMatchingMood = song.moods.some(m => userTopMoods.includes(m.toUpperCase()))
      if (!hasMatchingMood && Math.random() > 0.5) return false
    }
    return true
  }

  // ============================================
  // 1. NICHE ЖАНРЫ (70%): Соседние жанры/подстили
  // ============================================
  const nicheCount = Math.floor(limit * 0.7)

  console.log(`[DiscoverWeekly v2] 🎼 NICHE: Finding ${nicheCount} tracks from similar genres...`)

  // Мапа соседних жанров
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

  // Находим соседние жанры
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

  console.log(`[DiscoverWeekly v2] 🎼 Niche genres: ${Array.from(nicheGenres).join(', ')}`)

  for (const genre of nicheGenres) {
    if (songs.length >= nicheCount) break

    const songsByGenre = await getSongsByGenre(genre, 20)

    // Фильтруем: НЕ лайкнутые, низкая известность, MOOD/E совпадение
    const nicheTracks = songsByGenre.filter(s => {
      if (usedSongIds.has(s.id)) return false

      // Низкая известность: playCount < 1000 ИЛИ не последний год
      const isNotPopular = (s.playCount || 0) < 1000
      const isOlder = !s.year || s.year < new Date().getFullYear() - 1

      return (isNotPopular || isOlder) && matchesUserProfile(s)
    })

    for (const song of nicheTracks.slice(0, 5)) {
      if (songs.length >= nicheCount) break
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  console.log(`[DiscoverWeekly v2] 🎼 NICHE: Added ${songs.length} tracks`)

  // ============================================
  // 2. VIBE SIMILARITY К НИШЕВЫМ (10%)
  // ============================================
  const vibeCount = Math.floor(limit * 0.1)

  if (songs.length > 0 && vibeCount > 0) {
    console.log(`[DiscoverWeekly v2] 🎵 VIBE: Finding ${vibeCount} tracks similar to niche...`)

    const seedTracks = songs.slice(0, 3) // Первые 3 нишевых
    const allSongs = await getRandomSongs(300)
    const vibeUsedIds = new Set<string>()

    for (const seed of seedTracks) {
      const similar = findSimilarTracks(seed, allSongs, 10, 0.65)
      for (const track of similar) {
        if (track?.genre && !vibeUsedIds.has(track.id) && !usedSongIds.has(track.id) && matchesUserProfile(track)) {
          songs.push(track)
          vibeUsedIds.add(track.id)
          usedSongIds.add(track.id)
        }
        if (songs.length >= nicheCount + vibeCount) break
      }
    }
    console.log(`[DiscoverWeekly v2] 🎵 VIBE: Total now ${songs.length} tracks`)
  }

  // ============================================
  // 🔒 СЮРПРИЗЫ: ТОЛЬКО ДЛЯ ОПЫТНЫХ ПОЛЬЗОВАТЕЛЕЙ!
  // Для новичков — 0 сюрпризов, для опытных — 1-2
  // ============================================
  const totalPlaysDiscover = Object.entries(ratings || {}).reduce((sum: number, r: any) => sum + (r.playCount || 0), 0)
  const isNoviceUserDiscover = likedSongIds.length < 30 || totalPlaysDiscover < 100

  const surpriseCount = isNoviceUserDiscover
    ? 0  // 🔒 Новички — НУЛЬ сюрпризов!
    : Math.min(2, Math.max(1, Math.floor(limit * 0.20)))  // Опытные — 1-2 сюрприза

  if (!isNoviceUserDiscover) {
    console.log(`[DiscoverWeekly v2] 👤 User is EXPERIENCED, allowing ${surpriseCount} surprises`)
  } else {
    console.log(`[DiscoverWeekly v2] 🔒 User is NOVICE, blocking surprises (likes: ${likedSongIds.length}, plays: ${totalPlaysDiscover})`)
  }

  const allPossibleGenres = ['jazz', 'classical', 'world', 'folk', 'reggae', 'blues', 'country', 'soul', 'funk', 'gospel', 'latin', 'celtic']
  const distantGenres = allPossibleGenres.filter(g => !userGenres.has(g) && !nicheGenres.has(g))

  if (distantGenres.length > 0 && surpriseCount > 0) {
    console.log(`[DiscoverWeekly v2] 🎁 SURPRISE: Adding ${surpriseCount} surprise tracks...`)

    const surpriseGenres = distantGenres.sort(() => Math.random() - 0.5).slice(0, surpriseCount)
    console.log(`[DiscoverWeekly v2] 🎁 Surprise genres: ${surpriseGenres.join(', ')}`)

    for (const genre of surpriseGenres) {
      const songsByGenre = await getSongsByGenre(genre, 10)

      // Строгий MOOD/E фильтр для сюрпризов + 🔒 BANNED ARTISTS
      const surpriseTracks = songsByGenre.filter(s => {
        if (usedSongIds.has(s.id)) return false
        // 🔒 ФИЛЬТР BANNED ARTISTS
        if (isBannedArtist(s)) return false

        const energyOk = !s.energy || (s.energy >= energyMin && s.energy <= energyMax)
        const bpmOk = !s.bpm || s.bpm === 0 || (s.bpm >= bpmMin * 0.9 && s.bpm <= bpmMax * 1.1)

        return energyOk && bpmOk
      })

      if (surpriseTracks.length > 0) {
        const song = surpriseTracks[Math.floor(Math.random() * surpriseTracks.length)]
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
    console.log(`[DiscoverWeekly v2] 🎁 SURPRISE: Total now ${songs.length} tracks`)
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 дней

  // ============================================
  // 4. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[DiscoverWeekly v2] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
    excludedSongIds: new Set(likedSongIds),
  })

  console.log(`[DiscoverWeekly v2] ✅ Generated ${orchestratedSongs.length} tracks`)

  return {
    playlist: { songs: orchestratedSongs, source: 'mixed' },
    metadata: {
      id: `discover-weekly-${now.toISOString().split('T')[0]}`,
      type: 'discover-weekly',
      name: 'Открытия недели',
      description: 'Нишевые жанры + сюрпризы (70% niche + 10% vibe + 20% surprise)',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}

/**
 * Генерация плейлиста на основе похожих исполнителей
 * С Vibe Similarity вместо Last.fm
 */
export async function generateSimilarArtistsPlaylist(
  artistId: string,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  try {
    // Получаем информацию об артисте
    const artist = await subsonic.artists.getOne(artistId)
    if (!artist) {
      throw new Error('Artist not found')
    }
    
    console.log(`[SimilarArtists] Generating for ${artist.name}`)
    
    // ============================================
    // 1. VIBE SIMILARITY: Треки артиста как seed
    // ============================================
    const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')
    
    // Берем топ треки текущего артиста как seed
    const artistTopSongs = await getTopSongs(artist.name, 5)
    
    if (artistTopSongs.length > 0) {
      console.log(`[SimilarArtists] 🎵 Using ${artistTopSongs.length} tracks as seed`)
      
      const allSongs = await getRandomSongs(200)
      const vibeSimilarTracks: ISong[] = []
      const vibeUsedIds = new Set<string>()
      
      for (const seed of artistTopSongs) {
        const seedFeatures = analyzeTrack(seed)
        
        const similar = allSongs
          .filter(song => 
            !usedSongIds.has(song.id) &&
            !vibeUsedIds.has(song.id) &&
            song.artist !== artist.name  // Исключаем текущего артиста
          )
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= 0.7)  // Высокий порог
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)
          .map(({ song }) => song)
        
        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            vibeSimilarTracks.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }
      
      // Группируем по артистам
      const artistGroups = new Map<string, ISong[]>()
      vibeSimilarTracks.forEach(track => {
        const existing = artistGroups.get(track.artist) || []
        existing.push(track)
        artistGroups.set(track.artist, existing)
      })
      
      // Берем топ-5 похожих артистов
      const topSimilarArtists = Array.from(artistGroups.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5)
        .flatMap(([_, tracks]) => tracks)
      
      // Добавляем в плейлист (70%)
      for (const song of topSimilarArtists) {
        if (songs.length >= Math.floor(limit * 0.7)) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
      
      console.log(`[SimilarArtists] 🎵 VIBE SIMILARITY: Found ${topSimilarArtists.length} tracks from similar artists`)
    }
    
    // ============================================
    // 2. Добавляем треки текущего артиста (30%)
    // ============================================
    const artistCount = Math.floor(limit * 0.3)
    const moreArtistSongs = await getTopSongs(artist.name, artistCount)
    
    for (const song of moreArtistSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }

    // ============================================
    // 3. ОРКЕСТРАТОР: Плавные переходы между артистами
    // ============================================
    console.log('[SimilarArtists] 🎼 ORCHESTRATOR: Creating smooth transitions...')

    const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
      startWith: 'energetic',
      endWith: 'calm',
    })

    return {
      songs: orchestrated,
      source: 'similar',
    }
  } catch (error) {
    console.error('Failed to generate similar artists playlist:', error)
    // Возвращаем случайные треки при ошибке
    const randomSongs = await getRandomSongs(limit)
    return {
      songs: randomSongs,
      source: 'mixed',
    }
  }
}

/**
 * Генерация радио трека (Instant Mix)
 * Использует getSimilarSongs из Subsonic API + Vibe Similarity + Оркестратор
 */
export async function generateTrackRadio(
  songId: string,
  limit: number = 25,
  excludeRecentlyPlayed: string[] = []
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>(excludeRecentlyPlayed)

  try {
    // 1. Получаем текущий трек как seed
    const currentSong = await subsonic.songs.getSong(songId)
    if (!currentSong) {
      throw new Error('Track not found')
    }

    songs.push(currentSong)
    usedSongIds.add(songId)

    // 2. Запрашиваем похожие треки через Subsonic API
    const similarSongs = await getSimilarSongs(songId, limit * 2)

    // 3. VIBE SIMILARITY: Фильтруем по аудио-признакам
    console.log('[TrackRadio] 🎵 VIBE SIMILARITY: Filtering by audio features...')
    
    const targetFeatures = analyzeTrack(currentSong)
    const vibeSimilar = similarSongs
      .filter(song => !usedSongIds.has(song.id))
      .map(song => ({
        song,
        similarity: vibeSimilarity(targetFeatures, analyzeTrack(song)),
      }))
      .filter(({ similarity }) => similarity >= 0.65)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.floor(limit * 0.6)) // 60% похожие по вайбу

    for (const { song } of vibeSimilar) {
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }

    // 4. Добавляем остальные похожие треки
    for (const song of similarSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }

    // 5. Если мало треков, добавляем по жанру текущего трека
    if (songs.length < limit && currentSong?.genre) {
      const genreSongs = await getSongsByGenre(currentSong.genre, limit - songs.length + 5)
      const shuffled = genreSongs.sort(() => Math.random() - 0.5)
      for (const song of shuffled) {
        if (songs.length >= limit) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }

    // ============================================
    // 6. ОРКЕСТРАТОР: Плавные переходы + мосты
    // ============================================
    console.log('[TrackRadio] 🎼 ORCHESTRATOR: Creating smooth transitions...')
    
    const allSongsForBridges = await getRandomSongs(50)
    const orchestrated = orchestratePlaylistWithBridges(
      songs.slice(0, limit),
      allSongsForBridges,
      { addBridges: true, bridgeCount: 1 }
    )

    return {
      songs: orchestrated,
      source: 'similar',
    }
  } catch (error) {
    console.error('Failed to generate track radio:', error)
    // Возвращаем случайные треки при ошибке
    const randomSongs = await getRandomSongs(limit)
    return {
      songs: randomSongs,
      source: 'mixed',
    }
  }
}

/**
 * Генерация радио артиста (HYBRID: Last.fm + ML Fallback)
 * 
 * Приоритеты:
 * 1. Last.fm (похожие артисты + их топ треки)
 * 2. ML Fallback (оркестратор + vibe similarity) если Last.fm недоступен
 */
/**
 * Проверка новизны трека (Яндекс-подход)
 * 
 * @param songId - ID трека
 * @param recentSongIds - ID треков сыгранных недавно (последние 20)
 * @param artistHistory - Артисты сыгранные недавно (последние 5)
 * @returns Novelty multiplier (0.0 - 1.0)
 */
export function calculateNoveltyMultiplier(
  songId: string,
  recentSongIds: string[] = [],
  artistHistory: string[] = []
): number {
  const mlState = useMLStore.getState()
  const rating = mlState.ratings[songId]
  
  let multiplier = 1.0
  
  // 1. Трек недавно играл (последние 20 треков)
  if (recentSongIds.includes(songId)) {
    multiplier *= 0.3 // Сильно понижаем
    console.log('[Novelty] Track played recently:', songId)
  }
  
  // 2. Трек играл сегодня много раз
  if (rating?.playsToday && rating.playsToday >= 3) {
    multiplier *= 0.5 // Понижаем
    console.log('[Novelty] Track played', rating.playsToday, 'times today')
  }
  
  // 3. Артист играл недавно (последние 5 треков)
  if (rating?.songInfo?.artistId && artistHistory.includes(rating.songInfo.artistId)) {
    multiplier *= 0.6 // Понижаем чтобы не было 2 трека одного артиста подряд
    console.log('[Novelty] Artist played recently:', rating.songInfo.artist)
  }
  
  // 4. Novelty score из профиля
  if (rating?.noveltyScore) {
    multiplier *= (0.5 + rating.noveltyScore * 0.5) // 0.5 - 1.0
  }
  
  return Math.max(0.1, multiplier) // Минимум 0.1
}

export async function generateArtistRadio(
  artistId: string,
  limit: number = 50,
  excludeRecentlyPlayed: string[] = []
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>(excludeRecentlyPlayed)

  try {
    // Получаем информацию об артисте
    const artist = await subsonic.artists.getOne(artistId)
    if (!artist) {
      throw new Error('Artist not found')
    }

    // ============================================
    // 1. ПРОБУЕМ LAST.FM (приоритет)
    // ============================================
    const state = useExternalApiStore.getState()
    const mlState = useMLStore.getState()
    const bannedArtists = mlState.profile?.bannedArtists || []
    
    if (state.settings.lastFmEnabled && lastFmService.isAuthorized()) {
      try {
        console.log('[ArtistRadio] 🎵 Trying Last.fm for', artist.name)
        
        const lastFmTracks = await lastFmService.getArtistRadio(artist.name, limit)
        console.log('[ArtistRadio] Last.fm returned', lastFmTracks.length, 'tracks')

        if (lastFmTracks.length > 0) {
          // Ищем треки в Navidrome по названию и артисту
          for (const track of lastFmTracks) {
            if (songs.length >= limit) break
            
            // Пропускаем забаненных артистов
            if (bannedArtists.includes(track.artist)) {
              console.log('[ArtistRadio] Skipping banned artist:', track.artist)
              continue
            }
            
            try {
              // Ищем трек в библиотеке
              const searchResults = await subsonic.search2({
                query: `${track.artist} ${track.name}`,
                songCount: 1,
              })
              
              if (searchResults?.song?.[0]) {
                const song = searchResults.song[0]
                if (!usedSongIds.has(song.id)) {
                  songs.push(song)
                  usedSongIds.add(song.id)
                }
              }
            } catch (err) {
              // Трек не найден в библиотеке, пропускаем
            }
          }

          if (songs.length >= limit * 0.7) {
            // Нашли достаточно треков через Last.fm (70%+)
            console.log('[ArtistRadio] ✅ Last.fm success:', songs.length, 'tracks')
            
            // Оркестратор для плавных переходов
            const orchestrated = orchestratePlaylist(songs, {
              startWith: 'energetic',
              endWith: 'calm',
            })

            return {
              songs: orchestrated,
              source: 'lastfm',
            }
          }
        }
      } catch (lastFmError) {
        console.warn('[ArtistRadio] Last.fm failed, falling back to ML:', lastFmError)
        // Продолжаем с ML fallback
      }
    }

    // ============================================
    // 2. ML FALLBACK (если Last.fm не сработал)
    // ============================================
    console.log('[ArtistRadio] 🤖 Using ML fallback for', artist.name)

    const artistInfo = await subsonic.artists.getInfo(artistId)

    // 2.1. Топ треки текущего артиста (основа)
    const artistTopSongs = await getTopSongs(artist.name, 10)
    for (const song of artistTopSongs) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }

    // 2.2. Добавляем треки похожих артистов (из Navidrome)
    if (artistInfo?.similarArtist) {
      for (const similarArtist of artistInfo.similarArtist.slice(0, 8)) {
        if (songs.length >= limit) break
        
        // Пропускаем забаненных артистов
        if (bannedArtists.includes(similarArtist.name)) {
          console.log('[ArtistRadio] Skipping banned artist:', similarArtist.name)
          continue
        }

        const similarArtistTopSongs = await getTopSongs(similarArtist.name, 5)
        for (const song of similarArtistTopSongs) {
          if (songs.length >= limit) break
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
      }
    }

    // 2.3. Оркестратор: Плавные переходы между артистами
    console.log('[ArtistRadio] 🎼 ORCHESTRATOR: Creating smooth transitions...')

    const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
      startWith: 'energetic',
      endWith: 'calm',
    })

    return {
      songs: orchestrated,
      source: 'similar',
    }
  } catch (error) {
    console.error('[ArtistRadio] Failed to generate:', error)
    const randomSongs = await getRandomSongs(limit)
    return {
      songs: randomSongs,
      source: 'mixed',
    }
  }
}

/**
 * ML Recommendations - попытка угадать что понравится пользователю
 * Использует комбинированный подход:
 * 1. Анализ предпочтений (жанры, артисты)
 * 2. История прослушиваний
 * 3. Время суток
 * 4. Случайные открытия
 */
export async function generateMLRecommendations(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  preferredArtists: Record<string, number>,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  console.log('[ML Recommendations v2] ===== START =====')

  // ============================================
  // 🔒 ЗАГРУЖАЕМ BANNED ARTISTS
  // ============================================
  const { useMLStore } = await import('@/store/ml.store')
  const mlState = useMLStore.getState()
  const bannedArtists = mlState.profile.bannedArtists || []
  console.log('[ML Recommendations v2] 🔒 Banned artists:', bannedArtists)

  // Функция фильтрации по banned artists
  const isBannedArtist = (song: ISong): boolean => {
    if (!song.artistId && !song.artist) return false
    if (song.artistId && bannedArtists.includes(song.artistId)) {
      console.log(`[ML Recommendations v2] ❌ BANNED artist ID: ${song.artist} (${song.artistId})`)
      return true
    }
    // Дополнительная проверка по имени артиста (если artistId не доступен)
    if (!song.artistId && bannedArtists.some(id =>
      song.artist && song.artist.toLowerCase().includes(id.toLowerCase())
    )) {
      console.log(`[ML Recommendations v2] ❌ BANNED artist name: ${song.artist}`)
      return true
    }
    return false
  }

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings || {})
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Мягкое исключение: только 30 дней (не все прослушанные!)
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
  const recentlyPlayedIds = Object.entries(ratings || {})
    .filter(([_, rating]) => {
      if (!rating.playCount || rating.playCount === 0) return false
      if (rating.lastPlayed) {
        const lastPlayed = new Date(rating.lastPlayed).getTime()
        return lastPlayed >= thirtyDaysAgo
      }
      return false
    })
    .map(([id]) => id)
  recentlyPlayedIds.forEach(id => usedSongIds.add(id))

  console.log(`[ML Recommendations v2] Excluding ${dislikedSongIds.size} disliked, ${recentlyPlayedIds.size} recently played (30 days)`)

  // Импорт vibe-similarity
  const { analyzeTrack, vibeSimilarity, detectMood } = await import('./vibe-similarity')

  // ============================================
  // 0. АУДИО-ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (СКОЛЬЗЯЩЕЕ ОКНО)
  // ============================================
  console.log('[ML Recommendations v2] 🎵 Building user audio profile with sliding window...')

  let totalEnergy = 0, countEnergy = 0, totalWeightEnergy = 0
  let totalBPM = 0, countBPM = 0, totalWeightBPM = 0
  const userMoodCounts: Record<string, number> = {}
  const validLikedSongs: { song: ISong; weight: number }[] = []

  if (likedSongIds.length > 0) {
    const recentLikedIds = likedSongIds.slice(0, 50)
    const mediumLikedIds = likedSongIds.slice(50, 100)
    const oldLikedIds = likedSongIds.slice(100)

    const allLikedIds = [
      ...recentLikedIds.map(id => ({ id, weight: 1.0 })),
      ...mediumLikedIds.map(id => ({ id, weight: 0.7 })),
      ...oldLikedIds.slice(0, 50).map(id => ({ id, weight: 0.3 }))
    ]

    const likedResults = await Promise.all(
      allLikedIds.map(({ id }) => subsonic.songs.getSong(id).catch(() => null))
    )

    likedResults.forEach((song, idx) => {
      if (!song) return
      const weight = allLikedIds[idx]?.weight || 1.0
      validLikedSongs.push({ song, weight })

      if (song.energy !== undefined) {
        totalEnergy += song.energy * weight
        totalWeightEnergy += weight
        countEnergy++
      }
      if (song.bpm && song.bpm > 0) {
        totalBPM += song.bpm * weight
        totalWeightBPM += weight
        countBPM++
      }
      if (song.moods) {
        song.moods.forEach(m => { userMoodCounts[m.toUpperCase()] = (userMoodCounts[m.toUpperCase()] || 0) + 1 })
      }
    })
  }

  const userAudioProfile = {
    avgBPM: totalWeightBPM > 0 ? totalBPM / totalWeightBPM : 100,
    avgEnergy: totalWeightEnergy > 0 ? totalEnergy / totalWeightEnergy : 0.5,
    avgValence: 0.6,
    topMoods: Object.entries(userMoodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([mood]) => mood),
    recentRatio: validLikedSongs.length > 0
      ? validLikedSongs.filter(({ weight }) => weight >= 1.0).length / validLikedSongs.length
      : 0
  }

  console.log(`[ML Recommendations v2] 🎵 User Audio Profile (weighted): avgBPM='${userAudioProfile.avgBPM.toFixed(0)}', avgEnergy='${userAudioProfile.avgEnergy.toFixed(2)}', topMoods=[${userAudioProfile.topMoods.join(', ')}], recentRatio='${userAudioProfile.recentRatio.toFixed(2)}'`)

  // ============================================
  // 🔒 ТИП ПОЛЬЗОВАТЕЛЯ (нужно ДО discovery настроек!)
  // ============================================
  const totalLikes = likedSongIds.length
  const totalPlays = Object.values(ratings || {}).reduce((sum: number, r: any) => sum + (r.playCount || 0), 0)
  const isCompleteNovice = totalLikes < 20 || totalPlays < 50
  const isExperiencedUser = totalLikes > 50 || totalPlays > 200

  // ============================================
  // 🔒 ЗАГРУЖАЕМ НАСТРОЙКИ ОТКРЫТИЙ (ПОСЛЕ типа пользователя!)
  // ============================================
  const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
  const mlPlaylistsState = useMLPlaylistsStore.getState()
  const discoveryEnabled = mlPlaylistsState.settings.discoveryEnabled ?? false
  const userNoveltyFactor = mlPlaylistsState.settings.noveltyFactor ?? 0.2

  // Если discovery ВЫКЛ — novelty = 0, collaborative = 0
  const effectiveNovelty = discoveryEnabled ? userNoveltyFactor : 0.0
  const allowCollaborative = discoveryEnabled && !isCompleteNovice

  console.log(`[ML Recommendations v2] 🔒 Discovery: ${discoveryEnabled ? 'ON' : 'OFF'}, Novelty: ${effectiveNovelty.toFixed(2)}, Collaborative: ${allowCollaborative}`)

  // ============================================
  // 🔒 АДАПТИВНЫЕ ВЕСА: новички vs опытные
  // ============================================
  let weights
  if (isCompleteNovice) {
    // 🔒 НОВИЧКИ: 60% артисты, 40% жанры, НОЛЬ collaborative/novelty!
    weights = { audio: 0.0, genre: 0.40, artist: 0.60, behavior: 0.0, collab: 0.0, novelty: 0.0 }
    console.log(`[ML Recommendations v2] 🔒 COMPLETE NOVICE (likes: ${totalLikes}, plays: ${totalPlays}) — ONLY preferred artists/genres!`)
  } else if (isExperiencedUser) {
    // Опытные: используем discovery настройки
    const noveltyWeight = effectiveNovelty * 0.1  // noveltyFactor влияет на novelty weight
    const collabWeight = allowCollaborative ? 0.05 : 0.0
    const remaining = 1.0 - noveltyWeight - collabWeight
    weights = {
      audio: 0.40 * remaining,
      genre: 0.20 * remaining,
      artist: 0.10 * remaining,
      behavior: 0.20 * remaining,
      collab: collabWeight,
      novelty: noveltyWeight,
    }
  } else {
    // Средние пользователи
    const noveltyWeight = effectiveNovelty * 0.1
    const collabWeight = allowCollaborative ? 0.05 : 0.0
    const remaining = 1.0 - noveltyWeight - collabWeight
    weights = {
      audio: 0.20 * remaining,
      genre: 0.30 * remaining,
      artist: 0.30 * remaining,
      behavior: 0.10 * remaining,
      collab: collabWeight,
      novelty: noveltyWeight,
    }
  }

  console.log(`[ML Recommendations v2] 👤 User type: ${isCompleteNovice ? 'COMPLETE NOVICE' : isExperiencedUser ? 'experienced' : 'intermediate'} (likes: ${totalLikes}, plays: ${totalPlays})`)
  console.log(`[ML Recommendations v2] ⚖️ Adaptive weights:`, weights)

  // ============================================
  // 🔒 COLLABORATIVE SIGNAL: ТОЛЬКО ДЛЯ ОПЫТНЫХ И ТОЛЬКО ЕСЛИ DISCOVERY ВКЛ!
  // ============================================
  let collaborativeTrackIds: string[] = []

  if (allowCollaborative) {
    console.log('[ML Recommendations v2] 👥 Building collaborative signal...')

    try {
      const { loadSharedAccounts, generateSharedPlaylist } = await import('@/service/shared-listens')
      const sharedAccounts = loadSharedAccounts()
      const enabledAccounts = sharedAccounts.filter((a: any) => a.enabled)

      if (enabledAccounts.length > 0) {
        const sharedResult = await generateSharedPlaylist(enabledAccounts, 30)
        collaborativeTrackIds = sharedResult.tracks.map((t: any) => t.song.id)
        console.log(`[ML Recommendations v2] 👥 Got ${collaborativeTrackIds.length} tracks from shared accounts`)
      }
    } catch (err) {
      console.warn('[ML Recommendations v2] 👥 Shared accounts not available')
    }

    // Global trends fallback — только для опытных
    if (collaborativeTrackIds.length < 10) {
      console.log('[ML Recommendations v2] 👥 Using global trends fallback...')
      const topGenres = Object.entries(preferredGenres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

      for (const [genre] of topGenres) {
        try {
          const trending = await getTopSongs('', 10)
          const genreTrending = trending.filter(s => s.genre?.toLowerCase() === genre.toLowerCase())
          collaborativeTrackIds.push(...genreTrending.slice(0, 5).map(s => s.id))
        } catch (err) { /* skip */ }
      }
      console.log(`[ML Recommendations v2] 👥 Got ${collaborativeTrackIds.length} global trends tracks`)
    }
  } else {
    console.log('[ML Recommendations v2] 🔒 Collaborative signal DISABLED for complete novices')
  }

  // ============================================
  // ФИЛЬТРАЦИЯ КАНДИДАТОВ
  // ============================================
  const bpmMin = userAudioProfile.avgBPM * 0.7
  const bpmMax = userAudioProfile.avgBPM * 1.3
  const energyMin = Math.max(0, userAudioProfile.avgEnergy - 0.3)
  const energyMax = Math.min(1, userAudioProfile.avgEnergy + 0.3)

  console.log(`[ML Recommendations v2] Filters: BPM ${bpmMin.toFixed(0)}-${bpmMax.toFixed(0)}, Energy ${energyMin.toFixed(2)}-${energyMax.toFixed(2)}`)

  const allSongs = await getRandomSongs(500)
  console.log(`[ML Recommendations v2] Available songs: ${allSongs.length} total`)

  const filteredSongs = allSongs.filter(s => {
    if (usedSongIds.has(s.id)) return false
    // 🔒 ФИЛЬТР BANNED ARTISTS — КРИТИЧНО!
    if (isBannedArtist(s)) {
      return false
    }
    if (s.bpm && s.bpm > 0 && (s.bpm < bpmMin || s.bpm > bpmMax)) return false
    if (s.energy !== undefined && (s.energy < energyMin || s.energy > energyMax)) return false
    if (s.moods && s.moods.length > 0 && userAudioProfile.topMoods.length > 0) {
      const hasMatchingMood = s.moods.some(m => userAudioProfile.topMoods.includes(m.toUpperCase()))
      if (!hasMatchingMood && Math.random() > 0.5) return false
    }
    return true
  })

  console.log(`[ML Recommendations v2] ✅ Filtered to ${filteredSongs.length} candidates`)

  // ============================================
  // 🎰 MAB: Загружаем данные ДО scoring (чтобы не использовать await внутри map)
  // ============================================
  let mabEnabled = false
  let mabTopArms: any[] = []
  try {
    const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
    const mlPlaylistsState = useMLPlaylistsStore.getState()
    mabEnabled = mlPlaylistsState.settings.mabEnabled ?? false
    
    if (mabEnabled) {
      const { multiArmedBandit } = await import('@/service/multi-armed-bandit')
      mabTopArms = multiArmedBandit.getTopArms(50)
      console.log(`[MAB] Enabled, loaded ${mabTopArms.length} top arms`)
    }
  } catch (err) {
    console.log('[MAB] Not available, skipping boost')
  }

  // ============================================
  // SCORING: P(like|t) формула
  // ============================================
  console.log('[ML Recommendations v2] 🎯 Scoring all candidates...')

  const maxGenreWeight = Math.max(...Object.values(preferredGenres), 1)
  const maxArtistWeight = Math.max(...Object.values(preferredArtists), 1)
  const likedSongsForAudio = validLikedSongs.slice(0, 20).map(({ song }) => song)

  const scoredSongs = filteredSongs.map(song => {
    const features = analyzeTrack(song)

    let audioSimilarity = 0.5
    if (likedSongsForAudio.length > 0) {
      const likedFeatures = likedSongsForAudio.map(ls => analyzeTrack(ls))
      const avgLiked = {
        energy: likedFeatures.reduce((s, f) => s + f.energy, 0) / likedFeatures.length,
        valence: likedFeatures.reduce((s, f) => s + f.valence, 0) / likedFeatures.length,
        danceability: likedFeatures.reduce((s, f) => s + f.danceability, 0) / likedFeatures.length,
        bpm: likedFeatures.reduce((s, f) => s + f.bpm, 0) / likedFeatures.length,
        acousticness: likedFeatures.reduce((s, f) => s + f.acousticness, 0) / likedFeatures.length,
      }
      audioSimilarity = vibeSimilarity(features, avgLiked)
    }

    const genreWeight = preferredGenres[song.genre?.toLowerCase()] || 0
    const genreScore = genreWeight / maxGenreWeight

    const artistWeight = preferredArtists[song.artistId] || 0
    const artistScore = artistWeight / maxArtistWeight

    const rating = ratings?.[song.id]
    let behaviorScore = 0
    if (rating) {
      if (rating.like === true) behaviorScore = 10
      else if (rating.like === false) behaviorScore = -10
      else if (rating.playCount) behaviorScore = Math.min(20, rating.playCount * 2)
    }
    const normalizedBehavior = Math.max(0, Math.min(1, (behaviorScore + 20) / 40))

    const collaborativeScore = collaborativeTrackIds.includes(song.id) ? 1.0 : 0.0

    const releaseDate = song.created ? new Date(song.created).getTime() : (song.year ? new Date(song.year, 0, 1).getTime() : 0)
    const sevenDaysAgoMs = Date.now() - (7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000)

    // 🔒 НОВИНКИ: Используем effectiveNovelty из настроек
    // Если discovery ВЫКЛ — noveltyBonus = 0
    let noveltyBonus = 0.0
    if (effectiveNovelty > 0) {
      // Новинки только если discovery включен
      if (releaseDate > sevenDaysAgoMs) noveltyBonus = effectiveNovelty * 0.3  // 30% от noveltyFactor
      else if (releaseDate > thirtyDaysAgoMs) noveltyBonus = effectiveNovelty * 0.15  // 15% от noveltyFactor
    }

    // Context bonus
    const hour = new Date().getHours()
    let contextBonus = 0.0
    if (hour >= 9 && hour < 18) {
      if (song.energy >= 0.3 && song.energy <= 0.6) contextBonus = 0.1
    } else if (hour >= 6 && hour < 9) {
      if (song.bpm > 110) contextBonus += 0.1
      if (song.energy > 0.7) contextBonus += 0.1
    } else if (hour >= 18 && hour < 22) {
      if (song.moods?.some(m => ['RELAXED', 'CALM', 'CHILL'].includes(m.toUpperCase()))) contextBonus = 0.1
    }

    // 🎰 MAB BOOST: Используем предзагруженные данные (без await!)
    let mabBoost = 0.0
    if (mabEnabled) {
      const artistArm = mabTopArms.find((arm: any) => arm.id === song.artistId)
      if (artistArm && artistArm.totalPlays > 0) {
        mabBoost = Math.max(0, Math.min(0.2, artistArm.avgReward / 50))
      }
    }

    const finalScore =
      weights.audio * audioSimilarity +
      weights.genre * genreScore +
      weights.artist * artistScore +
      weights.behavior * normalizedBehavior +
      weights.collab * collaborativeScore +
      weights.novelty * noveltyBonus +
      contextBonus +
      mabBoost  // 🎰 MAB influence

    return { song, finalScore }
  })

  // ============================================
  // ВЫБОР С ДИНАМИЧЕСКИМИ ШТРАФАМИ
  // ============================================
  console.log('[ML Recommendations v2] 🎵 Selecting with dynamic diversity control...')

  const artistCounts: Record<string, number> = {}
  const genreCounts: Record<string, number> = {}

  for (const scored of scoredSongs.sort((a, b) => b.finalScore - a.finalScore)) {
    if (songs.length >= limit) break
    if (usedSongIds.has(scored.song.id)) continue

    const artist = scored.song.artist || 'Unknown'
    const genre = scored.song.genre?.toLowerCase() || 'Unknown'
    const currentArtistCount = artistCounts[artist] || 0
    const currentGenreCount = genreCounts[genre] || 0

    if (currentArtistCount >= 3) continue
    if (currentGenreCount >= 4) continue

    songs.push(scored.song)
    usedSongIds.add(scored.song.id)
    artistCounts[artist] = currentArtistCount + 1
    genreCounts[genre] = currentGenreCount + 1
  }

  const uniqueArtists = Object.keys(artistCounts).length
  const avgTracksPerArtist = songs.length > 0 ? songs.length / uniqueArtists : 0
  console.log(`[ML Recommendations v2] ✅ Selected ${songs.length} tracks`)
  console.log(`[ML Recommendations v2] 👥 Artists: ${uniqueArtists} unique, avg ${avgTracksPerArtist.toFixed(1)} tracks`)
  console.log(`[ML Recommendations v2] 🎼 Genres: ${Object.keys(genreCounts).length} unique`)
  console.log('[ML Recommendations v2] ===== END =====')

  return {
    songs: songs.slice(0, limit),
    source: 'mixed',
  }
}

/**
 * Получить популярные треки десятилетия
 * Используется как seed для Vibe Similarity
 */
async function getPopularTracksFromDecade(
  decade: string,
  limit: number = 5
): Promise<ISong[]> {
  // Популярные треки по десятилетиям (можно расширить)
  const popularTracksByDecade: Record<string, string[]> = {
    '80s': [
      'Queen Bohemian Rhapsody',
      'Michael Jackson Billie Jean',
      'AC/DC Back In Black',
      'Guns N Roses Sweet Child O Mine',
      'Bon Jovi Livin On A Prayer'
    ],
    '90s': [
      'Nirvana Smells Like Teen Spirit',
      'Oasis Wonderwall',
      'Radiohead Creep',
      'Red Hot Chili Peppers Under The Bridge',
      'R.E.M. Losing My Religion'
    ],
    '2000s': [
      'Linkin Park In The End',
      'The Killers Mr. Brightside',
      'Coldplay Yellow',
      'OutKast Hey Ya!',
      'Beyoncé Crazy In Love'
    ],
    '2010s': [
      'Adele Rolling in the Deep',
      'Daft Punk Get Lucky',
      'Pharrell Williams Happy',
      'The Weeknd Blinding Lights',
      'Ed Sheeran Shape of You'
    ],
    '2020s': [
      'Dua Lipa Levitating',
      'Harry Styles As It Was',
      'The Weeknd Save Your Tears',
      'Olivia Rodrigo drivers license',
      'Glass Animals Heat Waves'
    ]
  }
  
  const popularTracks = popularTracksByDecade[decade] || []
  
  if (popularTracks.length === 0) {
    return []
  }
  
  // Ищем эти треки в библиотеке
  const foundTracks: ISong[] = []
  
  for (const trackName of popularTracks) {
    if (foundTracks.length >= limit) break
    
    try {
      const searchResults = await subsonic.search2({
        query: trackName,
        songCount: 1,
      })
      
      if (searchResults?.song?.[0]) {
        foundTracks.push(searchResults.song[0])
      }
    } catch (err) {
      console.warn(`[DecadePlaylist] Track not found: ${trackName}`)
    }
  }
  
  return foundTracks
}

/**
 * Генерация плейлиста по десятилетиям
 * С Vibe Similarity + Оркестратором
 */
export async function generateDecadePlaylist(
  decade: string, // '80s', '90s', '2000s', '2010s', '2020s'
  limit: number = 30
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Определяем диапазон лет
  const yearRanges: Record<string, [number, number]> = {
    '80s': [1980, 1989],
    '90s': [1990, 1999],
    '2000s': [2000, 2009],
    '2010s': [2010, 2019],
    '2020s': [2020, 2029],
  }

  const [startYear, endYear] = yearRanges[decade] || [2000, 2009]
  
  console.log(`[DecadePlaylist] Generating for ${decade} (${startYear}-${endYear})`)

  try {
    // ============================================
    // 1. VIBE SIMILARITY: Популярные треки десятилетия как seed
    // ============================================
    const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')
    
    // Получаем популярные треки десятилетия (как seed)
    const seedTracks = await getPopularTracksFromDecade(decade, 5)
    console.log(`[DecadePlaylist] 🎵 Using ${seedTracks.length} popular tracks as seed`)
    
    if (seedTracks.length > 0) {
      const allSongs = await getRandomSongs(200)
      const vibeSimilarTracks: ISong[] = []
      const vibeUsedIds = new Set<string>()
      
      for (const seed of seedTracks) {
        const seedFeatures = analyzeTrack(seed)
        
        const similar = allSongs
          .filter(song => {
            const year = parseInt(song.year?.toString() || '0')
            return (
              !usedSongIds.has(song.id) &&
              year >= startYear &&
              year <= endYear
            )
          })
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= 0.65)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 8)
          .map(({ song }) => song)
        
        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            vibeSimilarTracks.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }
      
      // Добавляем в плейлист (70% от лимита)
      for (const song of vibeSimilarTracks) {
        if (songs.length >= Math.floor(limit * 0.7)) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
      
      console.log(`[DecadePlaylist] 🎵 VIBE SIMILARITY: Added ${vibeSimilarTracks.length} tracks`)
    }
    
    // ============================================
    // 2. Добавляем остальные треки десятилетия (30%)
    // ============================================
    const remainingCount = Math.floor(limit * 0.3)
    const allSongsFromDecade = await getRandomSongs(remainingCount * 3)
    
    for (const song of allSongsFromDecade) {
      if (songs.length >= limit) break
      
      const year = parseInt(song.year?.toString() || '0')
      if (year >= startYear && year <= endYear) {
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }

    // ============================================
    // 3. ОРКЕСТРАТОР: Плавные переходы внутри десятилетия
    // ============================================
    console.log(`[DecadePlaylist] 🎼 ORCHESTRATOR: Creating smooth transitions for ${decade}...`)

    const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
      startWith: 'energetic',
      endWith: 'calm',
    })

    return {
      songs: orchestrated,
      source: 'decade',
    }
  } catch (error) {
    console.error('Failed to generate decade playlist:', error)
    const randomSongs = await getRandomSongs(limit)
    return {
      songs: randomSongs,
      source: 'mixed',
    }
  }
}

/**
 * Генерация плейлиста по жанру
 * С Vibe Similarity + Оркестратором
 */
export async function generateGenrePlaylist(
  genre: string,
  limit: number = 30
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  try {
    const songsByGenre = await getSongsByGenre(genre, limit * 2)

    // ============================================
    // VIBE SIMILARITY: Ищем похожие треки внутри жанра
    // ============================================
    if (songsByGenre.length > 5) {
      // Берем первые 3 трека как seed
      const seedTracks = songsByGenre.slice(0, 3)
      const allSongs = await getRandomSongs(100)
      const vibeUsedIds = new Set<string>()
      
      console.log(`[GenrePlaylist] 🎵 VIBE SIMILARITY: Finding similar tracks for "${genre}"...`)
      
      for (const seed of seedTracks) {
        const similar = findSimilarTracks(seed, allSongs, 10, 0.65)
        similar.forEach((track: ISong) => {
          if (!vibeUsedIds.has(track.id) && !usedSongIds.has(track.id)) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
          }
        })
      }
    }

    // Добавляем оригинальные треки жанра
    for (const song of songsByGenre) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }

    // ============================================
    // ОРКЕСТРАТОР: Плавные переходы
    // ============================================
    console.log(`[GenrePlaylist] 🎼 ORCHESTRATOR: Creating smooth transitions for "${genre}"...`)
    
    const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
      startWith: 'energetic',
      endWith: 'calm',
    })

    return {
      songs: orchestrated,
      source: 'genre',
    }
  } catch (error) {
    console.error('Failed to generate genre playlist:', error)
    const randomSongs = await getRandomSongs(limit)
    return {
      songs: randomSongs,
      source: 'mixed',
    }
  }
}

/**
 * Проверка и автообновление плейлиста
 */
export async function checkAndUpdatePlaylist(
  type: 'daily-mix' | 'discover-weekly',
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  preferredArtists: Record<string, number>,
  ratings: Record<string, any>,
  lastGenerated?: string,
  updateIntervalHours: number = 24
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata; updated: boolean } | null> {
  if (!lastGenerated) {
    const result = type === 'daily-mix'
      ? await generateDailyMix(likedSongIds, preferredGenres, preferredArtists, ratings)
      : await generateDiscoverWeekly(likedSongIds, preferredGenres, 20, ratings)

    return { ...result, updated: true }
  }

  const last = new Date(lastGenerated)
  const now = new Date()
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  if (hoursSince >= updateIntervalHours) {
    const result = type === 'daily-mix'
      ? await generateDailyMix(likedSongIds, preferredGenres, preferredArtists, ratings)
      : await generateDiscoverWeekly(likedSongIds, preferredGenres, 20, ratings)

    return { ...result, updated: true }
  }

  return null
}

/**
 * Генерация плейлистов по времени суток
 */

export interface TimeOfDayMix {
  songs: ISong[]
  timeOfDay: 'morning' | 'day' | 'evening' | 'night'
  name: string
  description: string
}

/**
 * Получить текущее время суток
 */
function getTimeOfDay(): 'morning' | 'day' | 'evening' | 'night' {
  const hour = new Date().getHours()
  
  if (hour >= 5 && hour < 12) return 'morning'    // 5:00 - 12:00
  if (hour >= 12 && hour < 17) return 'day'       // 12:00 - 17:00
  if (hour >= 17 && hour < 22) return 'evening'   // 17:00 - 22:00
  return 'night'                                   // 22:00 - 5:00
}

/**
 * Конфигурация энергии по времени суток (УЛУЧШЕННАЯ v2)
 * Включает MOOD, BPM диапазоны, и жанры с весами
 */
const TIME_ENERGY_CURVE: Record<string, {
  start: number
  end: number
  curve: 'ascending' | 'descending' | 'peak' | 'flat'
  bpmMin: number
  bpmMax: number
  mood: string[]
  genres: string[]
  name: string
  description: string
}> = {
  morning: {
    start: 0.3,
    end: 0.7,
    curve: 'ascending',
    bpmMin: 90,
    bpmMax: 120,
    mood: ['UPLIFTING', 'ENERGETIC', 'WARM', 'HAPPY', 'BRIGHT'],
    genres: ['indie', 'soft rock', 'pop', 'folk', 'acoustic', 'synth-pop', 'dance'],
    name: '☀️ Утренний микс',
    description: 'Спокойные треки для хорошего начала дня'
  },
  day: {
    start: 0.6,
    end: 0.8,
    curve: 'peak',
    bpmMin: 100,
    bpmMax: 130,
    mood: ['FOCUSED', 'NEUTRAL', 'CALM', 'RELAXED', 'ENERGETIC'],
    genres: ['pop', 'rock', 'dance', 'electronic', 'funk', 'indie', 'alternative'],
    name: '☀️ Дневной микс',
    description: 'Энергичные треки для продуктивного дня'
  },
  evening: {
    start: 0.5,
    end: 0.3,
    curve: 'descending',
    bpmMin: 70,
    bpmMax: 95,
    mood: ['RELAXED', 'CHILL', 'WARM', 'ROMANTIC', 'CALM'],
    genres: ['chill', 'r&b', 'soul', 'jazz', 'lo-fi', 'downtempo', 'trip-hop'],
    name: '🌅 Вечерний микс',
    description: 'Расслабленные треки для уютного вечера'
  },
  night: {
    start: 0.2,
    end: 0.1,
    curve: 'flat',
    bpmMin: 60,
    bpmMax: 80,
    mood: ['CALM', 'INTIMATE', 'PEACEFUL', 'DARK', 'MELANCHOLIC'],
    genres: ['ambient', 'classical', 'lo-fi', 'sleep', 'downtempo', 'neoclassical'],
    name: '🌙 Ночной микс',
    description: 'Атмосферные треки для поздней ночи'
  }
}

/**
 * Мапа соседних жанров для расширения поиска
 */
const SIMILAR_GENRE_MAP: Record<string, string[]> = {
  'pop': ['synth-pop', 'indie pop', 'electropop', 'dream pop', 'chamber pop'],
  'rock': ['indie rock', 'alternative', 'post-rock', 'shoegaze', 'garage rock'],
  'electronic': ['ambient', 'IDM', 'downtempo', 'trip-hop', 'house', 'techno'],
  'r&b': ['neo soul', 'contemporary r&b', 'funk', 'motown'],
  'jazz': ['smooth jazz', 'bebop', 'fusion', 'acid jazz'],
  'hip-hop': ['lo-fi hip hop', 'boom bap', 'jazz rap', 'trap'],
  'folk': ['indie folk', 'folk rock', 'americana', 'acoustic'],
  'indie': ['indie rock', 'indie pop', 'shoegaze', 'post-punk'],
  'classical': ['neoclassical', 'contemporary classical', 'romantic', 'minimal'],
  'ambient': ['drone', 'dark ambient', 'space ambient', 'healing'],
}

/**
 * Генерация плейлиста по времени суток УЛУЧШЕННАЯ v2
 * С MOOD фильтрацией, 15 seeds, динамическим threshold, весами жанров,
 * smoothness, балансом артистов, бонусом новизны, scoring формулой
 */
export async function generateTimeOfDayMix(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  limit: number = 25
): Promise<TimeOfDayMix> {
  const hour = new Date().getHours()
  let timeOfDay: 'morning' | 'day' | 'evening' | 'night'

  if (hour >= 6 && hour < 12) timeOfDay = 'morning'
  else if (hour >= 12 && hour < 18) timeOfDay = 'day'
  else if (hour >= 18 && hour < 23) timeOfDay = 'evening'
  else timeOfDay = 'night'

  const config = TIME_ENERGY_CURVE[timeOfDay]

  console.log(`[TimeOfDayMix v2] Generating for ${timeOfDay} (hour: ${hour}, BPM: ${config.bpmMin}-${config.bpmMax}, energy: ${config.start}-${config.end})`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const trackBonus: Record<string, number> = {}

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings)
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[TimeOfDayMix v2] 🚫 Excluding ${recentUsedIds.size} recently played tracks`)

  // ============================================
  // Импорт vibe-similarity
  // ============================================
  const {
    analyzeTrack,
    vibeSimilarity,
    detectMood,
    areMoodsCompatible,
    optimizeTrackSequence,
    findSimilarTracksWithVibe
  } = await import('./vibe-similarity')

  // ============================================
  // Динамический threshold similarity по времени суток
  // ============================================
  const similarityThreshold: Record<string, number> = {
    morning: 0.70,   // Строже утром
    day: 0.65,       // Средне днём
    evening: 0.60,   // Мягче вечером
    night: 0.55      // Самый мягкий ночью
  }
  const threshold = similarityThreshold[timeOfDay] || 0.65

  // ============================================
  // User Time History - анализируем когда слушал треки
  // ============================================
  console.log('[TimeOfDayMix v2] 📅 Calculating dynamic time history bonus...')
  const userTimeHistory: Record<string, Set<string>> = { morning: new Set(), day: new Set(), evening: new Set(), night: new Set() }

  Object.entries(ratings).forEach(([songId, rating]) => {
    if (rating.playCount && rating.playCount > 0 && rating.lastPlayed) {
      const playedHour = new Date(rating.lastPlayed).getHours()
      const playedTod = getTimeOfDay(playedHour)
      if (!userTimeHistory[playedTod]) userTimeHistory[playedTod] = new Set()
      userTimeHistory[playedTod].add(songId)
    }
  })

  const historyTrackIds = userTimeHistory[timeOfDay] || new Set<string>()
  console.log(`[TimeOfDayMix v2] 📅 History tracks for ${timeOfDay}: ${historyTrackIds.size}`)

  // ============================================
  // 1. VIBE SIMILARITY: 15 diverse seeds (5 top + 5 recent + 5 random)
  // ============================================
  let vibeSimilarTracks: ISong[] = []

  if (likedSongIds.length > 0) {
    console.log(`[TimeOfDayMix v2] 🎵 Finding liked tracks with 15 diverse seeds (threshold: ${threshold})...`)

    // Получаем лайкнутые треки
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 100).map(id =>
        subsonic.songs.getSong(id).catch(() => null)
      )
    )

    const validLikedSongs = likedSongsResults.filter((song): song is ISong =>
      song != null && song.genre != null && song.genre !== ''
    )

    // Фильтруем по энергии и MOOD
    const energyMatchedLiked = validLikedSongs.filter((song) => {
      const energyOk = song.energy === undefined || (
        song.energy >= config.start * 0.8 &&
        song.energy <= config.end * 1.2
      )

      // MOOD фильтр (мягкий)
      let moodOk = true
      if (song.moods && song.moods.length > 0 && config.mood && config.mood.length > 0) {
        moodOk = song.moods.some(m => config.mood.includes(m.toUpperCase()))
      }

      return energyOk && moodOk
    })

    console.log(`[TimeOfDayMix v2] Found ${energyMatchedLiked.length} liked tracks with matching energy and MOOD`)

    if (energyMatchedLiked.length > 0) {
      // 15 diverse seeds: 5 top + 5 recent + 5 random
      const topLiked = energyMatchedLiked.slice(0, 5)

      const recentlyPlayed = energyMatchedLiked
        .filter(song => ratings[song.id]?.lastPlayed)
        .sort((a, b) => new Date(ratings[b.id]?.lastPlayed || 0).getTime() - new Date(ratings[a.id]?.lastPlayed || 0).getTime())
        .slice(0, 5)

      const remaining = energyMatchedLiked.filter(song =>
        !topLiked.find(t => t.id === song.id) &&
        !recentlyPlayed.find(t => t.id === song.id)
      )
      const randomSeeds = remaining.sort(() => Math.random() - 0.5).slice(0, 5)

      const uniqueSeeds = [...topLiked, ...recentlyPlayed, ...randomSeeds].slice(0, 15)
      console.log(`[TimeOfDayMix v2] 🌱 Using ${uniqueSeeds.length} diverse seeds (5 top + ${recentlyPlayed.length} recent + ${randomSeeds.length} random)`)

      // Загружаем все треки для анализа (400 вместо 200)
      const allSongs = await getRandomSongs(400)
      const vibeUsedIds = new Set<string>()

      for (const seed of uniqueSeeds) {
        const seedFeatures = analyzeTrack(seed)

        // Используем findSimilarTracksWithVibe с MOOD/BPM фильтрами
        const similar = findSimilarTracksWithVibe(seed, allSongs, 4, threshold, {
          enableMoodFilter: true,
          enableBpmFilter: true,
          enableKeyFilter: true,
          maxBpmDiff: 20,
          minMoodConfidence: 0.4
        }).filter((track: ISong) =>
          !usedSongIds.has(track.id) &&
          !vibeUsedIds.has(track.id) &&
          track.bpm >= config.bpmMin * 0.85 &&
          track.bpm <= config.bpmMax * 1.15
        )

        similar.forEach((track: ISong) => {
          if (!vibeUsedIds.has(track.id)) {
            vibeSimilarTracks.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }

      console.log(`[TimeOfDayMix v2] 🎵 VIBE SIMILARITY: Added ${vibeSimilarTracks.length} tracks`)
    }
  }

  // ============================================
  // 2. Жанры с весами (основные/смежные/экспериментальные)
  // ============================================
  console.log('[TimeOfDayMix v2] 🎼 Getting tracks from time-of-day genres with weights...')

  const songsFromGenres: ISong[] = []
  const genreUsedIds = new Set<string>(usedSongIds)
  const genreWeights: Record<string, number> = {}

  // Назначаем веса жанрам
  config.genres.forEach((genre, index) => {
    if (index < 3) genreWeights[genre] = 1.0      // Основные
    else if (index < 6) genreWeights[genre] = 0.7  // Смежные
    else genreWeights[genre] = 0.3                  // Экспериментальные
  })

  // Добавляем смежные жанры из SIMILAR_GENRE_MAP
  const nicheGenres = new Set<string>()
  for (const genre of config.genres.slice(0, 3)) {
    const similar = SIMILAR_GENRE_MAP[genre.toLowerCase()] || []
    similar.forEach(g => {
      if (!config.genres.includes(g)) {
        nicheGenres.add(g)
        genreWeights[g] = 0.5  // Средний вес для смежных
      }
    })
  }

  const allGenres = [...config.genres, ...Array.from(nicheGenres)]
  console.log(`[TimeOfDayMix v2] 🎼 Total genres: ${allGenres.length} (${config.genres.length} main + ${nicheGenres.size} niche)`)

  for (const genre of allGenres) {
    const weight = genreWeights[genre] || 0.5
    const fetchCount = Math.ceil(20 * weight)
    const maxFromGenre = Math.ceil((limit * 0.6) * weight)

    const songsByGenre = await getSongsByGenre(genre, fetchCount)

    let added = 0
    for (const song of songsByGenre) {
      if (added >= maxFromGenre) break
      if (genreUsedIds.has(song.id)) continue

      // BPM фильтр
      const bpmOk = !song.bpm || song.bpm === 0 || (
        song.bpm >= config.bpmMin * 0.85 &&
        song.bpm <= config.bpmMax * 1.15
      )
      if (!bpmOk) continue

      // Energy фильтр
      const energyOk = song.energy === undefined || (
        song.energy >= config.start * 0.7 &&
        song.energy <= config.end * 1.3
      )
      if (!energyOk) continue

      // MOOD фильтр (мягкий)
      let moodOk = true
      if (song.moods && song.moods.length > 0 && config.mood && config.mood.length > 0) {
        moodOk = song.moods.some(m => config.mood.includes(m.toUpperCase()))
      }
      if (!moodOk) continue

      songsFromGenres.push(song)
      genreUsedIds.add(song.id)
      added++
    }

    console.log(`[TimeOfDayMix v2] 🎼 Genre "${genre}" (weight: ${weight.toFixed(1)}): added ${added}/${maxFromGenre}`)
  }

  console.log(`[TimeOfDayMix v2] 🎼 Total from genres: ${songsFromGenres.length} tracks`)

  // ============================================
  // 3. Применяем динамический бонус истории
  // ============================================
  const now = Date.now()
  console.log('[TimeOfDayMix v2] 📅 Applying dynamic time history bonus...')

  // Проверяем все треки из жанров
  songsFromGenres.forEach(song => {
    if (historyTrackIds.has(song.id)) {
      const rating = ratings[song.id]
      if (rating) {
        const playCount = rating.playCount || 0
        const lastPlayed = rating.lastPlayed ? new Date(rating.lastPlayed).getTime() : 0
        const daysSincePlayed = lastPlayed > 0 ? (now - lastPlayed) / (1000 * 60 * 60 * 24) : 999

        // Recency factor
        let recencyFactor = 0.5
        if (daysSincePlayed <= 7) recencyFactor = 1.0
        else if (daysSincePlayed <= 30) recencyFactor = 0.8

        const bonus = 10 * (1 + playCount / 5) * recencyFactor
        trackBonus[song.id] = (trackBonus[song.id] || 0) + bonus
      }
    }
  })

  // Бонус новизны
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)

  songsFromGenres.forEach(song => {
    const releaseDate = song.created ? new Date(song.created).getTime() : (song.year ? new Date(song.year, 0, 1).getTime() : 0)
    const isNewRelease = releaseDate > thirtyDaysAgo

    if (isNewRelease) {
      const daysOld = (now - releaseDate) / (1000 * 60 * 60 * 24)
      let noveltyBonus = daysOld <= 7 ? 5 : 3
      trackBonus[song.id] = (trackBonus[song.id] || 0) + noveltyBonus
    }
  })

  console.log(`[TimeOfDayMix v2] 📅 Time history bonus applied to ${Object.keys(trackBonus).length} tracks`)

  // ============================================
  // 4. Формируем финальный плейлист с smoothness и artist limit
  // ============================================
  const MAX_TRACKS_PER_ARTIST = 2
  const artistCount: Record<string, number> = {}
  const canAddTrack = (song: ISong): boolean => {
    if (usedSongIds.has(song.id)) return false

    // Banned artists check
    const mlState = useMLStore.getState()
    const bannedArtists = mlState.profile?.bannedArtists || []
    if (song.artistId && bannedArtists.includes(song.artistId)) return false

    const artist = song.artist || 'Unknown'
    const currentCount = artistCount[artist] || 0
    if (currentCount >= MAX_TRACKS_PER_ARTIST) return false

    return true
  }

  const addTrackWithSmoothness = (song: ISong, lastTrack?: ISong): boolean => {
    if (!canAddTrack(song)) return false

    if (lastTrack) {
      const bpmDiff = Math.abs((song.bpm || 0) - (lastTrack.bpm || 0))
      const energyDiff = Math.abs((song.energy || 0.5) - (lastTrack.energy || 0.5))
      const bpmSmoothness = bpmDiff / 140
      const smoothness = 0.5 * bpmSmoothness + 0.5 * energyDiff
      if (smoothness > 0.3) {
        console.log(`[TimeOfDayMix v2] 🔀 Skipping smooth transition: ${smoothness.toFixed(2)} > 0.3`)
        return false
      }
    }

    songs.push(song)
    usedSongIds.add(song.id)
    const artist = song.artist || 'Unknown'
    artistCount[artist] = (artistCount[artist] || 0) + 1
    return true
  }

  // Сначала добавляем vibe-similar треки
  let lastTrack: ISong | undefined
  for (const song of vibeSimilarTracks) {
    if (songs.length >= Math.floor(limit * 0.4)) break
    if (addTrackWithSmoothness(song, lastTrack)) {
      lastTrack = song
    }
  }
  console.log(`[TimeOfDayMix v2] ✅ Added ${songs.length} vibe-similar tracks`)

  // Сортируем треки из жанров по бонусу
  const sortedGenres = [...songsFromGenres].sort((a, b) => {
    const bonusA = trackBonus[a.id] || 0
    const bonusB = trackBonus[b.id] || 0
    return bonusB - bonusA
  })

  // Добавляем треки из жанров с проверкой smoothness
  let deficitCount = limit - songs.length
  for (const song of sortedGenres) {
    if (songs.length >= limit) break
    if (addTrackWithSmoothness(song, lastTrack)) {
      lastTrack = song
    }
  }

  // Если не набрали - добавляем без smoothness (fallback)
  if (songs.length < limit) {
    console.log(`[TimeOfDayMix v2] ⚠️ Deficit: need ${limit - songs.length} more tracks (relaxing smoothness)`)
    for (const song of sortedGenres) {
      if (songs.length >= limit) break
      if (canAddTrack(song) && !usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
        const artist = song.artist || 'Unknown'
        artistCount[artist] = (artistCount[artist] || 0) + 1
      }
    }
  }

  // Статистика артистов
  const uniqueArtists = new Set(Object.keys(artistCount))
  const avgTracksPerArtist = songs.length > 0 ? songs.length / uniqueArtists.size : 0
  console.log(`[TimeOfDayMix v2] 👥 Artists: ${uniqueArtists.size} unique, ${avgTracksPerArtist.toFixed(1)} avg tracks`)

  // Новинки статистика
  const noveltyTracks = songs.filter(song => {
    const releaseDate = song.created ? new Date(song.created).getTime() : (song.year ? new Date(song.year, 0, 1).getTime() : 0)
    return releaseDate > thirtyDaysAgo
  })
  console.log(`[TimeOfDayMix v2] 🆕 Novelty tracks: ${noveltyTracks.length}`)

  console.log(`[TimeOfDayMix v2] ✅ Final track count: ${songs.length}/${limit}`)

  // ============================================
  // 5. Оптимизация последовательности с глобальной оптимизацией
  // ============================================
  console.log('[TimeOfDayMix v2] 🎼 ORCHESTRATOR: Creating smooth transitions...')

  let energyTrend = 0.0
  if (config.curve === 'ascending') energyTrend = 0.1
  else if (config.curve === 'descending') energyTrend = -0.1
  else if (config.curve === 'peak') energyTrend = 0.0

  const orchestratedSongs = optimizeTrackSequence(songs.slice(0, limit), undefined, {
    energyWeight: 0.6,
    bpmWeight: 0.4,
    segmentSize: 5,
    energyTrendPerSegment: energyTrend
  })

  return {
    songs: orchestratedSongs,
    timeOfDay,
    name: config.name,
    description: config.description,
  }
}

/**
 * Генерация плейлистов по активности (10 типов)
 */

// Конфигурация для каждого типа активности (10 типов как в файле)
const ACTIVITY_CONFIG: Record<string, { genres: string[]; features: Record<string, any>; name: string; description: string; useOrchestrator?: boolean }> = {
  meditation: {
    genres: ['ambient', 'meditation', 'new age', 'tibetan', 'nature sounds', 'drone', 'healing', 'binaural'],
    features: { bpm: { min: 50, max: 70 }, instrumentalness: { min: 0.8 }, energy: { max: 0.25 } },
    name: '🧘 Утренняя медитация',
    description: 'Тибетские чаши, nature sounds, эмбиент (BPM 50-70)'
  },
  deepwork: {
    genres: ['lo-fi', 'classical', 'post-rock', 'ambient', 'jazz', 'neoclassical', 'minimal', 'piano solo'],
    features: { bpm: { min: 70, max: 90 }, speechiness: { max: 0.03 }, energy: { min: 0.3, max: 0.5 }, instrumentalness: { min: 0.6 } },
    name: '📚 Глубокая работа',
    description: 'Lo-fi hip-hop, минималистичная классика (BPM 70-90, без вокала)'
  },
  running: {
    genres: ['electronic', 'house', 'drum and bass', 'pop', 'rock', 'techno', 'trance', 'progressive house'],
    features: { bpm: { min: 160, max: 180 }, energy: { min: 0.85 }, danceability: { min: 0.75 } },
    name: '🏃 Бег (Running Flow)',
    description: 'Прогрессивный хаус, драм-н-бейс (180 BPM для шага 180 spm)'
  },
  workout: {
    genres: ['metal', 'hard rock', 'rap', 'trap', 'hardcore', 'punk', 'alternative metal', 'nu metal'],
    features: { bpm: { min: 130, max: 150 }, energy: { min: 0.9 }, loudness: { min: -5 } },
    name: '🏋️ Силовая тренировка',
    description: 'Метал, хард-рок, агрессивный трэп (BPM 130-150, loudness > -4dB)'
  },
  cycling: {
    genres: ['indie pop', 'funk', 'disco', 'house', 'pop', 'new wave', 'synthpop', 'dance'],
    features: { bpm: { min: 120, max: 140 }, valence: { min: 0.65 }, energy: { min: 0.65 } },
    name: '🚴 Велопрогулка',
    description: 'Инди-поп, фанк, диско-хаус (BPM 120-140, uplifting)'
  },
  creativity: {
    genres: ['jazz', 'neoclassical', 'experimental', 'ambient', 'world', 'blues', 'soul', 'fusion'],
    features: { bpm: { min: 60, max: 100 }, instrumentalness: { min: 0.5 }, energy: { min: 0.3, max: 0.6 } },
    name: '🎨 Творчество',
    description: 'Джаз, неоклассика, экспериментальный эмбиент (BPM 60-100)'
  },
  cooking: {
    genres: ['funk', 'soul', 'latin', 'pop', 'bossa nova', 'jazz', 'samba', 'reggae', 'disco'],
    features: { bpm: { min: 100, max: 120 }, danceability: { min: 0.6, max: 0.8 }, energy: { min: 0.5, max: 0.7 } },
    name: '🍳 Кулинария',
    description: 'Фанк, соул, латин (BPM 100-120, ритмичный фон)'
  },
  reading: {
    genres: ['neo-soul', 'acoustic folk', 'soundtrack', 'classical', 'ambient', 'piano', 'chamber music', 'soft rock'],
    features: { bpm: { min: 60, max: 85 }, energy: { max: 0.35 }, instrumentalness: { min: 0.3 } },
    name: '🌙 Вечернее чтение',
    description: 'Нео-соул, акустический фолк (BPM 60-85, мягкая динамика)'
  },
  gaming: {
    genres: ['synthwave', 'electronic', 'orchestral', 'lo-fi', 'soundtrack', 'cyberpunk', 'epic', 'trailer music'],
    features: { bpm: { min: 90, max: 130 }, energy: { min: 0.55, max: 0.8 } },
    name: '🎮 Гейминг',
    description: 'Синтвейв, электро, эпик-оркестр (BPM 90-130, адаптивная энергия)'
  },
  sleep: {
    genres: ['ambient', 'neoclassical', 'binaural', 'sleep', 'drone', 'white noise', 'calm', 'delta waves'],
    features: { bpm: { min: 40, max: 60 }, energy: { max: 0.15 }, instrumentalness: { min: 0.9 } },
    name: '🛁 Ритуал перед сном',
    description: 'Эмбиент, неоклассика, бинауральные ритмы (BPM 40-60, затухание)'
  },
  chill: {
    genres: ['chill', 'lo-fi', 'ambient', 'downtempo', 'jazz', 'neo-soul', 'trip-hop', 'chillout', 'liquid drum and bass'],
    features: { energy: { max: 0.45 }, bpm: { min: 60, max: 95 }, valence: { min: 0.35, max: 0.65 } },
    name: '😌 Расслабление',
    description: 'Lo-fi, эмбиент, даунтемпо (BPM 60-95)'
  },
  acoustic: {
    genres: ['acoustic', 'folk', 'singer-songwriter', 'unplugged', 'americana', 'neo-folk', 'indie folk', 'chamber pop', 'baroque pop', 'soft rock'],
    features: { acousticness: { min: 0.65 }, energy: { max: 0.55 }, instrumentalness: { min: 0.15 } },
    name: '🎸 Акустика',
    description: 'Акустическая музыка, фолк, unplugged (acousticness > 0.65)'
  },
  romantic: {
    genres: ['r&b', 'soul', 'jazz', 'soft rock', 'ballad', 'love songs'],
    features: { energy: { max: 0.5 }, valence: { min: 0.4, max: 0.8 }, bpm: { min: 60, max: 100 } },
    name: '💕 Романтика',
    description: 'R&B, соул, джаз (BPM 60-100, valence 0.4-0.8)'
  },
  nostalgic: {
    genres: ['80s', '90s', '2000s', 'retro', 'classic rock', 'oldies'],
    features: { energy: { min: 0.3, max: 0.7 }, valence: { min: 0.3, max: 0.7 } },
    name: '📼 Ностальгия',
    description: 'Хиты прошлых десятилетий'
  },
  energetic: {
    genres: ['electronic', 'dance', 'pop', 'rock', 'house', 'edm', 'electro'],
    features: { bpm: { min: 120, max: 140 }, energy: { min: 0.7 }, valence: { min: 0.6 } },
    name: '⚡ Энергичное',
    description: 'Заряд бодрости на весь день'
  },
  wakeup: {
    genres: ['pop', 'indie', 'acoustic', 'folk', 'soft rock', 'morning'],
    features: { bpm: { min: 80, max: 110 }, energy: { min: 0.4, max: 0.7 }, valence: { min: 0.5 } },
    name: '☀️ Просыпаюсь',
    description: 'Мягкое пробуждение'
  },
  focus: {
    genres: ['classical', 'ambient', 'lo-fi', 'post-rock', 'minimal', 'piano'],
    features: { bpm: { min: 60, max: 90 }, energy: { max: 0.5 }, instrumentalness: { min: 0.5 } },
    name: '🎯 Фокус',
    description: 'Для работы и учёбы'
  },
}

export async function generateActivityMix(
  activity: string,
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const config = ACTIVITY_CONFIG[activity]
  
  if (!config) {
    console.error(`[ActivityMix] Unknown activity: ${activity}`)
    return { songs: [], source: 'mixed' }
  }

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings)
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  console.log(`[ActivityMix] Generating for ${activity}:`, config.name)

  // Фильтрация трека по audio features
  const matchesFeatures = (song: ISong): boolean => {
    if (!song) return false

    for (const [feature, range] of Object.entries(config.features)) {
      const value = (song as any)[feature]
      if (value === undefined || value === null) continue
      if (range.min !== undefined && value < range.min) return false
      if (range.max !== undefined && value > range.max) return false
    }
    return true
  }

  // ============================================
  // 0.5 VIBE SIMILARITY: Фильтрация по аудио-признакам
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')
  
  // Получаем seed треки из лайкнутых в этом жанре/активности
  let vibeFilteredTracks: ISong[] = []
  
  if (likedSongIds.length > 0) {
    console.log(`[ActivityMix] 🎵 VIBE SIMILARITY: Finding similar tracks for ${activity}...`)
    
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 30).map(id => 
        subsonic.songs.getSong(id).catch(() => null)
      )
    )
    
    // Фильтруем лайкнутые по жанрам активности
    const seedTracksFromLiked = likedSongsResults.filter((song): song is ISong => 
      song != null && 
      song.genre && 
      config.genres.some(g => song.genre.toLowerCase().includes(g.toLowerCase()))
    )
    
    console.log(`[ActivityMix] Found ${seedTracksFromLiked.length} liked tracks in activity genres`)
    
    // Если нашли seed треки — ищем похожие по Vibe
    if (seedTracksFromLiked.length > 0) {
      const allSongsForVibe = await getRandomSongs(200)
      const vibeUsedIds = new Set<string>()
      
      // Для каждого seed находим похожие треки
      for (const seed of seedTracksFromLiked.slice(0, 5)) {
        const seedFeatures = analyzeTrack(seed)
        
        const similar = allSongsForVibe
          .filter(song => 
            !usedSongIds.has(song.id) &&
            !vibeUsedIds.has(song.id) &&
            matchesFeatures(song) &&  // BPM, energy и т.д.
            song.genre && config.genres.some(g => 
              song.genre.toLowerCase().includes(g.toLowerCase())
            )
          )
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= 0.65)  // Порог сходства
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)  // Топ-5 похожих на каждый seed
          .map(({ song }) => song)
        
        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            vibeFilteredTracks.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }
      
      console.log(`[ActivityMix] 🎵 VIBE SIMILARITY: Found ${vibeFilteredTracks.length} similar tracks`)
    }
  }

  // 1. Берем треки из жанров активности (60%) - основа микса
  // ПРИОРИТЕТ 1: Vibe Similarity треки (если есть)
  const genreCount = Math.floor(limit * 0.6)
  
  if (vibeFilteredTracks.length > 0) {
    console.log(`[ActivityMix] Using ${vibeFilteredTracks.length} vibe-similar tracks (priority)`)
    
    for (const song of vibeFilteredTracks) {
      if (songs.length >= genreCount) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }
  
  // ПРИОРИТЕТ 2: Обычные жанр-треки (добиваем остаток)
  for (const genre of config.genres) {
    if (songs.length >= genreCount) break

    const songsByGenre = await getSongsByGenre(genre, 25)
    const filtered = songsByGenre.filter(s =>
      !usedSongIds.has(s.id) && matchesFeatures(s)
    )
    const shuffled = filtered.sort(() => Math.random() - 0.5)

    for (const song of shuffled.slice(0, 8)) {
      if (songs.length >= genreCount) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  // 2. ML Store - немного знакомых треков для якорей (15%)
  const mlCount = Math.floor(limit * 0.15)
  if (likedSongIds.length > 0) {
    console.log(`[ActivityMix] Searching ${likedSongIds.length} liked songs for anchors...`)
    
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 30).map(id => 
        subsonic.songs.getSong(id).catch(() => null)
      )
    )
    
    const validLikedSongs = likedSongsResults.filter((song): song is ISong =>
      song != null && !usedSongIds.has(song.id) && matchesFeatures(song)
    )
    
    console.log(`[ActivityMix] Found ${validLikedSongs.length} matching liked songs (anchors)`)
    
    const shuffled = validLikedSongs.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, mlCount)) {
      if (songs.length >= limit * 0.75) break
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  // 3. Новые треки из жанров (novelty/discovery) - 25%
  const noveltyCount = Math.floor(limit * 0.25)
  const noveltyGenres = config.genres.slice(0, 4) // Берем топ-4 жанра
  
  for (const genre of noveltyGenres) {
    if (songs.length >= limit * 1.0) break

    const songsByGenre = await getSongsByGenre(genre, 35)
    // Берем ТОЛЬКО те что НЕ были в лайкнутых и НЕ слушали
    const novelSongs = songsByGenre.filter(s => 
      !usedSongIds.has(s.id) && 
      !likedSongIds.includes(s.id) &&
      matchesFeatures(s)
    )
    const shuffled = novelSongs.sort(() => Math.random() - 0.5)

    for (const song of shuffled.slice(0, 6)) {
      if (songs.length >= limit) break
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  // 4. ОРКЕСТРАТОР - плавные переходы по energy + мосты
  console.log(`[ActivityMix] Orchestrating ${songs.length} tracks...`)

  // Сортируем по energy для плавных переходов
  const calmActivities = ['acoustic', 'chill', 'meditation', 'sleep', 'reading']

  if (calmActivities.includes(activity)) {
    // Плавное затухание: энергичные → спокойные
    songs.sort((a, b) => {
      const energyA = a.energy || 0.5
      const energyB = b.energy || 0.5

      // Группируем по 0.1 диапазонам для плавности
      const groupA = Math.floor(energyA * 10)
      const groupB = Math.floor(energyB * 10)

      if (groupA !== groupB) return groupB - groupA
      // Внутри группы сортируем по BPM для плавности
      return (b.bpm || 100) - (a.bpm || 100)
    })
    console.log('[ActivityMix] Sorted: energetic → calm (smooth fade)')
  } else {
    // Активные: спокойные → энергичные → спокойные (волна)
    const midPoint = Math.floor(songs.length / 2)
    const firstHalf = songs.slice(0, midPoint)
    const secondHalf = songs.slice(midPoint)

    firstHalf.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))
    secondHalf.sort((a, b) => (b.energy || 0.5) - (a.energy || 0.5))

    songs.splice(0, songs.length, ...firstHalf, ...secondHalf)
    console.log('[ActivityMix] Sorted: energy wave (calm → energetic → calm)')
  }

  // 🎵 ДОБАВЛЯЕМ МOSTЫ для плавных переходов
  const allSongsForBridges = await getRandomSongs(100)
  const orchestrated = orchestratePlaylistWithBridges(songs, allSongsForBridges, {
    addBridges: true,
    bridgeCount: 1,
  })

  // Логирование для отладки
  console.log('[ActivityMix] Energy progression:')
  orchestrated.slice(0, 5).forEach((song, i) => {
    const features = analyzeTrack(song)
    console.log(`  ${i+1}. ${song.title} - Energy: ${features.energy.toFixed(2)}, BPM: ${features.bpm}`)
  })

  console.log(`[ActivityMix] Generated ${orchestrated.length} tracks for ${activity}`)

  return {
    songs: orchestrated,
    source: 'activity',
  }
}

// Алиасы для совместимости
export const generateWorkoutMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('workout', likedSongIds, ratings, preferredGenres, limit)

export const generateFocusMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('focus', likedSongIds, ratings, preferredGenres, limit)

export const generateRunningMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('running', likedSongIds, ratings, preferredGenres, limit)

export const generateMeditationMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('meditation', likedSongIds, ratings, preferredGenres, limit)

export const generateCyclingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('cycling', likedSongIds, ratings, preferredGenres, limit)

export const generateCreativityMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('creativity', likedSongIds, ratings, preferredGenres, limit)

export const generateCookingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('cooking', likedSongIds, ratings, preferredGenres, limit)

export const generateReadingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('reading', likedSongIds, ratings, preferredGenres, limit)

export const generateGamingMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('gaming', likedSongIds, ratings, preferredGenres, limit)

export const generateSleepMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('sleep', likedSongIds, ratings, preferredGenres, limit)

export const generateAcousticMix = (likedSongIds, ratings, preferredGenres, limit = 25) =>
  generateActivityMix('acoustic', likedSongIds, ratings, preferredGenres, limit)

// Vibe Mix - на основе аудио-признаков трека (vibe similarity)
export const generateVibeMix = async (seedTrackId: string, allSongs: any[], limit = 25) => {
  console.log(`[VibeMix] Generating for seed: ${seedTrackId}, total songs: ${allSongs.length}`)

  // Находим seed трек
  const seedTrack = allSongs.find(s => s.id === seedTrackId)
  if (!seedTrack) {
    console.warn(`[VibeMix] Seed track ${seedTrackId} not found`)
    return { songs: [], source: 'vibe' }
  }

  console.log(`[VibeMix] Seed track: ${seedTrack.artist} - ${seedTrack.title}`)

  // Импортируем vibe similarity
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')

  // Анализируем seed трек
  const seedFeatures = analyzeTrack(seedTrack)
  console.log('[VibeMix] Seed features:', seedFeatures)

  // Исключаем недавно прослушанные из кэша
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  console.log(`[VibeMix] Excluding ${recentUsedIds.size} recently played tracks`)

  // Считаем similarity для всех треков
  const scoredTracks = allSongs
    .filter(song => 
      song.id !== seedTrackId && 
      !recentUsedIds.has(song.id) &&
      !song.isAudiobook
    )
    .map(song => {
      const features = analyzeTrack(song)
      const similarity = vibeSimilarity(seedFeatures, features)
      return { song, similarity }
    })

  // Сортируем по убыванию similarity и берём top
  const topTracks = scoredTracks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  console.log(`[VibeMix] ✅ Found ${topTracks.length} similar tracks`)

  return {
    songs: topTracks.map(t => t.song),
    source: 'vibe',
  }
}

/**
 * Конфигурация настроений для Mood Mix
 */
const MOOD_CONFIG: Record<string, {
  valence: { min: number; max: number }
  energy: { min: number; max: number }
  genres: string[]
  orchestration: { startWith: 'energetic' | 'calm'; endWith: 'energetic' | 'calm' }
}> = {
  happy: {
    valence: { min: 0.7, max: 1.0 },
    energy: { min: 0.6, max: 1.0 },
    genres: ['pop', 'dance', 'disco', 'funk', 'happy'],
    orchestration: { startWith: 'energetic', endWith: 'energetic' }
  },
  sad: {
    valence: { min: 0.0, max: 0.3 },
    energy: { min: 0.0, max: 0.5 },
    genres: ['blues', 'slowcore', 'sad core', 'melancholic'],
    orchestration: { startWith: 'calm', endWith: 'calm' }
  },
  calm: {
    valence: { min: 0.3, max: 0.6 },
    energy: { min: 0.0, max: 0.4 },
    genres: ['ambient', 'classical', 'lo-fi', 'chillout'],
    orchestration: { startWith: 'calm', endWith: 'calm' }
  },
  energetic: {
    valence: { min: 0.5, max: 1.0 },
    energy: { min: 0.8, max: 1.0 },
    genres: ['rock', 'edm', 'drum and bass', 'hardstyle'],
    orchestration: { startWith: 'energetic', endWith: 'energetic' }
  },
  melancholic: {
    valence: { min: 0.2, max: 0.4 },
    energy: { min: 0.2, max: 0.6 },
    genres: ['indie', 'post-rock', 'shoegaze', 'dream pop'],
    orchestration: { startWith: 'calm', endWith: 'calm' }
  },
  relaxed: {
    valence: { min: 0.4, max: 0.7 },
    energy: { min: 0.1, max: 0.5 },
    genres: ['chill', 'downtempo', 'trip-hop', 'lounge'],
    orchestration: { startWith: 'calm', endWith: 'calm' }
  },
  focused: {
    valence: { min: 0.3, max: 0.6 },
    energy: { min: 0.4, max: 0.7 },
    genres: ['classical', 'ambient', 'lo-fi', 'minimal'],
    orchestration: { startWith: 'calm', endWith: 'calm' }
  },
  angry: {
    valence: { min: 0.0, max: 0.4 },
    energy: { min: 0.7, max: 1.0 },
    genres: ['metal', 'hardcore', 'punk', 'trap metal'],
    orchestration: { startWith: 'energetic', endWith: 'energetic' }
  },
  peaceful: {
    valence: { min: 0.5, max: 0.8 },
    energy: { min: 0.0, max: 0.3 },
    genres: ['ambient', 'new age', 'meditation', 'nature sounds'],
    orchestration: { startWith: 'calm', endWith: 'calm' }
  }
}

/**
 * Генерация плейлиста по настроению
 * С Vibe Similarity + valence фильтром + Оркестратором
 */
export async function generateMoodMix(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredGenres: Record<string, number>,
  mood: string,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const moodConfig = MOOD_CONFIG[mood]
  
  if (!moodConfig) {
    console.error(`[MoodMix] Unknown mood: ${mood}, using 'calm' as fallback`)
    return generateActivityMix('calm', likedSongIds, ratings, preferredGenres, limit)
  }
  
  console.log(`[MoodMix] Generating for ${mood}:`, moodConfig)
  
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  
  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings)
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))
  
  // ============================================
  // 1. VIBE SIMILARITY: Берем лайкнутые с нужным настроением
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')
  
  if (likedSongIds.length > 0) {
    console.log('[MoodMix] 🎵 Finding liked tracks with matching valence...')
    
    // Получаем лайкнутые треки
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 50).map(id => 
        subsonic.songs.getSong(id).catch(() => null)
      )
    )
    
    // Фильтруем по valence (настроению) и energy
    const moodMatchedLiked = likedSongsResults.filter((song): song is ISong => 
      song != null && 
      song.valence !== undefined &&
      song.valence >= moodConfig.valence.min &&
      song.valence <= moodConfig.valence.max &&
      song.energy !== undefined &&
      song.energy >= moodConfig.energy.min &&
      song.energy <= moodConfig.energy.max
    )
    
    console.log(`[MoodMix] Found ${moodMatchedLiked.length} liked tracks with matching valence/energy`)
    
    // Если нашли — используем как seed для Vibe Similarity
    if (moodMatchedLiked.length > 0) {
      const allSongs = await getRandomSongs(200)
      const vibeSimilarTracks: ISong[] = []
      const vibeUsedIds = new Set<string>()
      
      for (const seed of moodMatchedLiked.slice(0, 5)) {
        const seedFeatures = analyzeTrack(seed)
        
        const similar = allSongs
          .filter(song => 
            !usedSongIds.has(song.id) &&
            !vibeUsedIds.has(song.id) &&
            song.valence !== undefined &&
            song.valence >= moodConfig.valence.min * 0.9 &&  // Мягкий фильтр
            song.valence <= moodConfig.valence.max * 1.1 &&
            song.energy !== undefined &&
            song.energy >= moodConfig.energy.min * 0.9 &&
            song.energy <= moodConfig.energy.max * 1.1
          )
          .map(song => ({
            song,
            similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
          }))
          .filter(({ similarity }) => similarity >= 0.65)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)
          .map(({ song }) => song)
        
        similar.forEach(track => {
          if (!vibeUsedIds.has(track.id)) {
            vibeSimilarTracks.push(track)
            vibeUsedIds.add(track.id)
          }
        })
      }
      
      // Добавляем в плейлист (70% от лимита)
      for (const song of vibeSimilarTracks) {
        if (songs.length >= Math.floor(limit * 0.7)) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
      
      console.log(`[MoodMix] 🎵 VIBE SIMILARITY: Added ${vibeSimilarTracks.length} tracks`)
    }
  }
  
  // ============================================
  // 2. Добавляем треки из жанров настроения (30%)
  // ============================================
  const genreCount = Math.floor(limit * 0.3)
  
  for (const genre of moodConfig.genres) {
    if (songs.length >= limit * 0.7) break
    
    const songsByGenre = await getSongsByGenre(genre, 20)
    const filtered = songsByGenre.filter(s => 
      !usedSongIds.has(s.id) &&
      s.valence !== undefined &&
      s.valence >= moodConfig.valence.min * 0.9 &&
      s.valence <= moodConfig.valence.max * 1.1
    )
    
    const shuffled = filtered.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 5)) {
      if (songs.length >= limit * 0.7) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }
  
  // ============================================
  // 3. ОРКЕСТРАТОР: Плавные переходы с учетом настроения
  // ============================================
  console.log(`[MoodMix] 🎼 ORCHESTRATOR: Creating smooth transitions for ${mood}...`)
  
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), moodConfig.orchestration)
  
  return {
    songs: orchestrated,
    source: 'mood',
  }
}

/**
 * Генерация плейлиста "Потому что вы слушали..."
 * На основе недавно прослушанных артистов
 * С Vibe Similarity + Оркестратором
 */
export async function generateBecauseYouListened(
  likedSongIds: string[],
  ratings: Record<string, any>,
  preferredArtists: Record<string, number>,
  limit: number = 25
): Promise<MLWavePlaylist> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  
  console.log('[BecauseYouListened] Generating playlist...')

  // Берем топ артистов из preferredArtists
  const topArtists = Object.entries(preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)
  
  // ============================================
  // 1. VIBE SIMILARITY: Недавно прослушанные как seed
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')
  
  // Получаем недавно прослушанные треки (из preferredArtists)
  const recentlyPlayedTracks: ISong[] = []
  
  for (const artistId of topArtists) {
    const artist = await subsonic.artists.getOne(artistId)
    if (artist?.name) {
      const artistTopSongs = await getTopSongs(artist.name, 3)
      recentlyPlayedTracks.push(...artistTopSongs)
    }
  }
  
  if (recentlyPlayedTracks.length > 0) {
    console.log(`[BecauseYouListened] 🎵 Using ${recentlyPlayedTracks.length} recently played as seed`)
    
    const allSongs = await getRandomSongs(200)
    const vibeSimilarTracks: ISong[] = []
    const vibeUsedIds = new Set<string>()
    
    for (const seed of recentlyPlayedTracks) {
      const seedFeatures = analyzeTrack(seed)
      
      const similar = allSongs
        .filter(song => 
          !usedSongIds.has(song.id) &&
          !vibeUsedIds.has(song.id) &&
          !recentlyPlayedTracks.find(t => t.id === song.id)  // Исключаем уже прослушанные
        )
        .map(song => ({
          song,
          similarity: vibeSimilarity(seedFeatures, analyzeTrack(song))
        }))
        .filter(({ similarity }) => similarity >= 0.65)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(({ song }) => song)
      
      similar.forEach(track => {
        if (!vibeUsedIds.has(track.id)) {
          vibeSimilarTracks.push(track)
          vibeUsedIds.add(track.id)
        }
      })
    }
    
    // Добавляем в плейлист (60%)
    for (const song of vibeSimilarTracks) {
      if (songs.length >= Math.floor(limit * 0.6)) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
    
    console.log(`[BecauseYouListened] 🎵 VIBE SIMILARITY: Added ${vibeSimilarTracks.length} similar tracks`)
  }
  
  // ============================================
  // 2. Добавляем треки тех же артистов (40%)
  // ============================================
  const artistCount = Math.floor(limit * 0.4)
  
  for (const artistId of topArtists) {
    if (songs.length >= limit * 0.6) break
    
    const artist = await subsonic.artists.getOne(artistId)
    if (artist?.name) {
      const artistTopSongs = await getTopSongs(artist.name, 3)
      
      for (const song of artistTopSongs) {
        if (songs.length >= limit * 0.6) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
  }
  
  // ============================================
  // 3. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[BecauseYouListened] 🎼 ORCHESTRATOR: Creating smooth transitions...')
  
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
  })
  
  return {
    songs: orchestrated,
    source: 'similar',
  }
}

/**
 * Генерация плейлиста "Новинки подписок"
 * Использует Apple Music для поиска новых треков подписанных артистов
 */
export async function generateNewReleasesPlaylist(
  limit: number = 50
): Promise<MLWavePlaylist> {
  const { useArtistSubscriptionsStore } = await import('@/store/artist-subscriptions.store')
  const { appleMusicService } = await import('@/service/apple-music-api')
  const { useExternalApiStore } = await import('@/store/external-api.store')
  
  const subscriptions = useArtistSubscriptionsStore.getState().subscriptions
  const { settings } = useExternalApiStore.getState()
  
  const songs: ISong[] = []
  const usedTrackNames = new Set<string>()

  if (subscriptions.length === 0) {
    console.log('[NewReleases] Нет подписок')
    return { songs: [], source: 'mixed' }
  }

  // Для каждого подписанного артиста ищем новые релизы
  for (const subscription of subscriptions) {
    if (songs.length >= limit) break

    try {
      if (settings.appleMusicEnabled) {
        // Apple Music — новые альбомы
        const newAlbums = await appleMusicService.getNewReleases(subscription.artistName, 3)
        
        for (const album of newAlbums) {
          if (songs.length >= limit) break
          
          // Получаем треки из альбома
          const albumTracks = await appleMusicService.getAlbumTracks(album.collectionId)
          
          for (const track of albumTracks.slice(0, 2)) {
            if (songs.length >= limit) break
            
            const trackKey = `${track.artistName}-${track.trackName}`
            if (!usedTrackNames.has(trackKey)) {
              // Ищем трек в библиотеке
              const libraryTrack = await findTrackInLibrary(track.artistName, track.trackName)
              
              if (libraryTrack) {
                songs.push(libraryTrack)
                usedTrackNames.add(trackKey)
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[NewReleases] Error for ${subscription.artistName}:`, error)
    }
  }

  console.log(`[NewReleases] Сгенерировано ${songs.length} треков`)
  
  return {
    songs,
    source: 'mixed',
  }
}

// Вспомогательная функция для поиска трека в библиотеке
async function findTrackInLibrary(artist: string, title: string): Promise<ISong | null> {
  try {
    const { httpClient } = await import('@/api/httpClient')
    
    const searchResponse = await httpClient<{
      searchResult3?: {
        song?: { song: any[] }
      }
    }>('search3', {
      query: {
        query: `${artist} ${title}`,
        songCount: '5',
        artistCount: '0',
        albumCount: '0',
      },
    })

    const foundSongs = searchResponse?.data?.searchResult3?.song?.song || []
    
    if (foundSongs.length > 0) {
      const matchedSong = foundSongs.find(s =>
        s.title.toLowerCase().includes(title.toLowerCase()) ||
        title.toLowerCase().includes(s.title.toLowerCase())
      )
      
      if (matchedSong) {
        const { subsonic } = await import('@/service/subsonic')
        return await subsonic.songs.getSong(matchedSong.id).catch(() => null)
      }
    }
    
    return null
  } catch (error) {
    console.warn('[findTrackInLibrary] Error:', error)
    return null
  }
}
