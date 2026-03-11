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
 * Генерация плейлиста "Моя волна" на основе ML данных + Vibe Similarity
 */
export async function generateMyWavePlaylist(
  likedSongIds: string[],
  ratings: Record<string, any>,
  limit: number = 25,
  excludeDisliked: boolean = true,
  settings?: MyWaveSettings
): Promise<MLWavePlaylist> {
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

  // 1. СНАЧАЛА фильтруем лайкнутые по настройкам
  if (likedSongIds.length > 0 && myWaveSettings && Object.keys(myWaveSettings).length > 0) {
    console.log('[MyWave] Filtering liked songs by settings...')
    
    const { analyzeTrack } = await import('./vibe-similarity')
    
    // Получаем все лайкнутые треки
    const allLikedSongs = await Promise.all(
      likedSongIds.map(id => subsonic.songs.getSong(id).catch(() => null))
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
    }

    // Берем 3-5 случайных лайкнутых как seed
    const seedTracks = songs.slice(0, Math.min(5, songs.length))
    const allSongsForVibe: ISong[] = []
    const vibeUsedIds = new Set<string>()
    const maxVibeTracks = Math.floor(limit / 2)

    // Для каждого seed находим похожие треки ИЗ ОТФИЛЬТРОВАННЫХ!
    for (const seed of seedTracks) {
      const tracksPerSeed = Math.floor(maxVibeTracks / seedTracks.length)
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

  // 3. Если мало треков, добавляем по жанрам из лайкнутых
  if (songs.length < limit) {
    const genreCount: Record<string, number> = {}

    // Считаем жанры в лайкнутых
    songs.forEach(song => {
      if (song.genre) {
        genreCount[song.genre] = (genreCount[song.genre] || 0) + 1
      }
    })

    // Топ жанры + случайный выбор из топ-3
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre)

    // Для каждого топ жанра берем СЛУЧАЙНЫЕ треки
    for (const genre of topGenres) {
      if (songs.length >= limit) break

      const songsByGenre = await getSongsByGenre(genre, 20) // Берем больше для рандома
      // Перемешиваем и берем 5 случайных (копируем массив перед sort)
      const shuffled = [...songsByGenre].sort(() => Math.random() - 0.5).slice(0, 5)
      for (const song of shuffled) {
        if (songs.length >= limit) break
        if (!usedSongIds.has(song.id) && !isBannedArtist(song)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    }
  }

  // 4. Если всё ещё мало, добавляем случайные
  if (songs.length < limit) {
    const randomSongs = await getRandomSongs(limit - songs.length + 10)
    const shuffled = [...randomSongs].sort(() => Math.random() - 0.5)
    shuffled.forEach(song => {
      if (songs.length >= limit) return
      if (!usedSongIds.has(song.id) && !isBannedArtist(song)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  // 5. Финальное перемешивание плейлиста
  // Вместо случайного перемешивания используем оркестратор для плавных переходов
  // ВАЖНО: Если настройки "calm" или "sleep" - используем только calm сортировку!
  let orchestratedPlaylist: ISong[]
  
  if (myWaveSettings?.mood === 'calm' || myWaveSettings?.activity === 'sleep') {
    // Простая сортировка по возрастанию energy для спокойных плейлистов
    const { analyzeTrack } = await import('./vibe-similarity')
    
    // Сортируем ВСЕ треки по возрастанию energy (без жесткой фильтрации!)
    orchestratedPlaylist = [...songs].sort((a, b) => {
      const aFeatures = analyzeTrack(a)
      const bFeatures = analyzeTrack(b)
      return aFeatures.energy - bFeatures.energy
    })
    
    // Берем только первые N треков (самые спокойные)
    const maxTracks = orchestratedPlaylist.length
    orchestratedPlaylist = orchestratedPlaylist.slice(0, Math.min(maxTracks, limit))
    
    console.log('[MyWave] Using calm sorting (energy ascending, no hard filter)')
  } else {
    // Обычный оркестратор с нарастанием энергии
    orchestratedPlaylist = orchestratePlaylist(songs, {
      startWith: 'energetic',
      endWith: 'calm',
      excludedSongIds: dislikedSongIds,
    })
  }

  const finalSongs = orchestratedPlaylist.slice(0, limit)

  // Сохраняем в кэш
  playlistCache.set(cacheKey, finalSongs, usedSongIds, {
    source: 'mixed',
    vibeSimilarity: true,
    orchestrated: true,
    settings: myWaveSettings,
  })

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
  limit: number = 25
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  // Проверяем кэш
  const today = new Date().toISOString().split('T')[0]
  const cacheKey = `daily-mix-${today}`
  const cached = playlistCache.get(cacheKey)
  if (cached) {
    console.log('[DailyMix] Using cached playlist')
    const now = new Date()
    return {
      playlist: {
        songs: cached,
        source: 'cached',
      },
      metadata: {
        id: cacheKey,
        type: 'daily-mix',
        name: 'Ежедневный микс',
        description: `Персональный микс на ${now.toLocaleDateString('ru-RU')}`,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
    }
  }

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()

  // Получаем ratings из ML store
  const { ratings } = useMLStore.getState()

  // Исключаем дизлайкнутые треки
  const dislikedSongIds = new Set<string>(
    Object.entries(ratings)
      .filter(([_, rating]) => rating.like === false)
      .map(([id]) => id)
  )
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Исключаем треки из последних плейлистов
  const recentUsedIds = playlistCache.getRecentUsedSongIds(5)
  recentUsedIds.forEach(id => usedSongIds.add(id))
  console.log(`[DailyMix] Excluding ${recentUsedIds.size} recently played tracks`)

  // ============================================
  // 1. VIBE SIMILARITY: 50% плейлиста (знакомое + похожее)
  // ============================================
  let vibeTracksAdded = 0
  const maxVibeTracks = Math.floor(limit * 0.5) // 50% плейлиста

  if (likedSongIds.length > 0) {
    console.log('[DailyMix] 🎵 VIBE SIMILARITY: Loading seed tracks...')
    
    // Берем 5-7 случайных лайкнутых треков как seed
    const shuffledLiked = [...likedSongIds].sort(() => Math.random() - 0.5)
    const likedSongsResults = await Promise.all(
      shuffledLiked.slice(0, 7).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    const validLikedSongs = likedSongsResults.filter((song): song is ISong =>
      song != null && song.genre != null && song.genre !== ''
    )

    if (validLikedSongs.length > 0) {
      console.log(`[DailyMix] 🎵 VIBE SIMILARITY: Found ${validLikedSongs.length} seed tracks`)
      
      // Загружаем все треки для анализа
      const allSongs = await getRandomSongs(200)
      
      // Для каждого seed находим похожие треки
      const seedTracks = validLikedSongs.slice(0, 5)
      const vibeUsedIds = new Set<string>()
      
      for (const seed of seedTracks) {
        if (vibeTracksAdded >= maxVibeTracks) break
        
        const similar = findSimilarTracks(seed, allSongs, 5, 0.65)
        similar.forEach((track: ISong) => {
          if (track?.genre && !vibeUsedIds.has(track.id) && !usedSongIds.has(track.id) && vibeTracksAdded < maxVibeTracks) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
            vibeTracksAdded++
          }
        })
      }
      
      console.log(`[DailyMix] 🎵 VIBE SIMILARITY: Found ${vibeTracksAdded} tracks`)
    }
  }

  // ============================================
  // 2. НОВОЕ (Novelty): 20% плейлиста (открытия)
  // ============================================
  const noveltyCount = Math.floor(limit * 0.2)
  const topGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre)

  console.log(`[DailyMix] 🔍 NOVELTY: Adding ${noveltyCount} discovery tracks from top genres...`)
  
  for (const genre of topGenres) {
    if (songs.length >= limit * 0.7) break // 70% уже набрано
    
    const songsByGenre = await getSongsByGenre(genre, 10)
    // Берем треки которые НЕ в лайкнутых (новое!)
    const novelSongs = songsByGenre.filter(s => 
      !usedSongIds.has(s.id) && !likedSongIds.includes(s.id)
    )
    
    const shuffled = novelSongs.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 3)) {
      if (songs.length >= limit * 0.7) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  // ============================================
  // 3. Знакомые треки (якоря): 30% плейлиста
  // ============================================
  const anchorCount = Math.floor(limit * 0.3)
  if (likedSongIds.length > 0 && songs.length < limit) {
    console.log(`[DailyMix] ❤️ ANCHORS: Adding ${anchorCount} familiar tracks...`)
    
    const remainingLiked = likedSongIds.filter(id => !usedSongIds.has(id))
    const moreLikedSongs = await Promise.all(
      remainingLiked.slice(0, 15).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    moreLikedSongs.forEach(song => {
      if (song && !usedSongIds.has(song.id) && songs.length < limit * 0.7) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 часа

  // ============================================
  // 4. ОРКЕСТРАТОР: Energy Wave + плавные переходы
  // ============================================
  console.log('[DailyMix] 🎼 ORCHESTRATOR: Creating energy wave...')
  
  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'calm',      // Начинаем спокойно
    endWith: 'calm',        // Заканчиваем спокойно
    excludedSongIds: dislikedSongIds,
  })
  
  // Создаём "волну" энергии: спокойно → пик → спокойно
  const finalSongs = createEnergyWave(orchestratedSongs).slice(0, limit)

  // Логирование energy прогрессии
  console.log('[DailyMix] Energy progression (first 10 tracks):')
  finalSongs.slice(0, 10).forEach((song, i) => {
    const features = analyzeTrack(song)
    console.log(`  ${i+1}. ${song.title} - Energy: ${features.energy.toFixed(2)}, BPM: ${features.bpm}`)
  })

  // Сохраняем в кэш
  playlistCache.set(cacheKey, finalSongs, usedSongIds, {
    source: 'mixed',
    vibeSimilarity: true,
    orchestrated: true,
    formula: '70% familiar + 30% novelty',
  })

  return {
    playlist: {
      songs: finalSongs,
      source: 'mixed',
    },
    metadata: {
      id: cacheKey,
      type: 'daily-mix',
      name: 'Ежедневный микс',
      description: `Персональный микс на ${now.toLocaleDateString('ru-RU')}`,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  }
}

/**
 * Генерация "Открытия недели" - новые треки на основе предпочтений
 * ФОРМУЛА: 60% похожее на лайки (Vibe) + 40% новое (Novelty)
 */
export async function generateDiscoverWeekly(
  likedSongIds: string[],
  preferredGenres: Record<string, number>,
  limit: number = 20
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata }> {
  const songs: ISong[] = []
  const usedSongIds = new Set<string>(likedSongIds) // Исключаем лайкнутые

  // ============================================
  // 1. VIBE SIMILARITY: 60% плейлиста (похожее на лайки)
  // ============================================
  const vibeCount = Math.floor(limit * 0.6)
  
  if (likedSongIds.length > 0) {
    console.log('[DiscoverWeekly] 🎵 VIBE SIMILARITY: Finding similar to liked tracks...')
    
    // Берем 5 случайных лайкнутых как seed
    const shuffledLiked = [...likedSongIds].sort(() => Math.random() - 0.5)
    const likedSongsResults = await Promise.all(
      shuffledLiked.slice(0, 5).map(id => subsonic.songs.getSong(id).catch(() => null))
    )
    
    const validLikedSongs = likedSongsResults.filter((song): song is ISong =>
      song != null && song.genre != null && song.genre !== ''
    )
    
    if (validLikedSongs.length > 0) {
      const allSongs = await getRandomSongs(150)
      const vibeUsedIds = new Set<string>()
      
      for (const seed of validLikedSongs.slice(0, 3)) {
        const similar = findSimilarTracks(seed, allSongs, 5, 0.6)
        similar.forEach((track: ISong) => {
          // Берем ТОЛЬКО треки которых нет в лайкнутых (открытия!)
          if (track?.genre && !vibeUsedIds.has(track.id) && !likedSongIds.includes(track.id)) {
            songs.push(track)
            vibeUsedIds.add(track.id)
            usedSongIds.add(track.id)
          }
        })
        if (songs.length >= vibeCount) break
      }
      
      console.log(`[DiscoverWeekly] 🎵 VIBE SIMILARITY: Found ${songs.length} tracks`)
    }
  }

  // ============================================
  // 2. НОВОЕ (Novelty): 40% плейлиста (открытия из жанров)
  // ============================================
  const noveltyCount = Math.floor(limit * 0.4)
  const topGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre)

  console.log(`[DiscoverWeekly] 🔍 NOVELTY: Adding ${noveltyCount} discovery tracks...`)
  
  for (const genre of topGenres) {
    if (songs.length >= limit) break

    const songsByGenre = await getSongsByGenre(genre, 15)
    // Берем треки которые НЕ в лайкнутых (новое!)
    const novelSongs = songsByGenre.filter(s => 
      !usedSongIds.has(s.id) && !likedSongIds.includes(s.id)
    )
    
    const shuffled = novelSongs.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 5)) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 дней

  // ============================================
  // 3. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[DiscoverWeekly] 🎼 ORCHESTRATOR: Creating smooth transitions...')
  
  const orchestratedSongs = orchestratePlaylist(songs.slice(0, limit), {
    startWith: 'energetic',
    endWith: 'calm',
    excludedSongIds: new Set(likedSongIds), // Исключаем лайкнутые из оркестрации
  })

  return {
    playlist: {
      songs: orchestratedSongs,
      source: 'mixed',
    },
    metadata: {
      id: `discover-weekly-${now.toISOString().split('T')[0]}`,
      type: 'discover-weekly',
      name: 'Открытия недели',
      description: 'Новые треки на основе ваших предпочтений + Vibe Similarity',
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

  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings)
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))

  // Также исключаем недавно прослушанные (последние 10 из ratings)
  const recentlyPlayed = Object.entries(ratings)
    .filter(([_, rating]) => rating.lastPlayed)
    .sort((a, b) => new Date((b[1] as any).lastPlayed || 0).getTime() - new Date((a[1] as any).lastPlayed || 0).getTime())
    .slice(0, 10)
    .map(([id]) => id)
  recentlyPlayed.forEach(id => usedSongIds.add(id))

  // 🎵 1. SONIC FINGERPRINT рекомендации (20% плейлиста)
  const sonicCount = Math.floor(limit * 0.2)
  const allSongs = await getRandomSongs(100)
  const sonicRecommendations = getSonicFingerprintRecommendations(allSongs, sonicCount * 2)
  
  for (const song of sonicRecommendations) {
    if (songs.length >= sonicCount) break
    if (!usedSongIds.has(song.id)) {
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }
  console.log(`[ML Recommendations] Added ${songs.length} tracks from Sonic Fingerprint`)

  // 2. Берем треки из любимых жанров (40% плейлиста)
  const genreCount = Math.floor(limit * 0.4)
  const topGenres = Object.entries(preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre)

  for (const genre of topGenres) {
    if (songs.length >= genreCount) break
    
    const songsByGenre = await getSongsByGenre(genre, 15)
    // Фильтруем уже использованные
    const filtered = songsByGenre.filter(s => !usedSongIds.has(s.id))
    // Перемешиваем и берем случайные
    const shuffled = filtered.sort(() => Math.random() - 0.5)
    for (const song of shuffled.slice(0, 5)) {
      if (songs.length >= genreCount) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  }

  // 2. Добавляем треки похожих артистов (30% плейлиста)
  const topArtists = Object.entries(preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)

  for (const artistId of topArtists) {
    if (songs.length >= limit * 0.7) break

    try {
      const artist = await subsonic.artists.getOne(artistId)
      if (artist?.name) {
        // Пробуем получить похожих артистов из Navidrome
        let similarArtists: Array<{ name: string }> = []
        
        try {
          const artistInfo = await subsonic.artists.getInfo(artistId)
          if (artistInfo?.similarArtist && artistInfo.similarArtist.length > 0) {
            similarArtists = artistInfo.similarArtist.slice(0, 5)
            console.log(`[ML Recommendations] Got ${similarArtists.length} similar artists from Navidrome for ${artist.name}`)
          }
        } catch (navError) {
          console.warn(`[ML Recommendations] Navidrome similar artists failed for ${artist.name}`)
        }
        
        // Fallback: Last.fm если нет похожих из Navidrome
        if (similarArtists.length === 0) {
          const state = useExternalApiStore.getState()
          if (state.settings.lastFmEnabled && state.settings.lastFmApiKey) {
            const lastFmSimilar = await lastFmService.getSimilarArtists(artist.name, 5)
            if (lastFmSimilar.length > 0) {
              similarArtists = lastFmSimilar.map(a => ({ name: a.name }))
              console.log(`[ML Recommendations] Got ${similarArtists.length} similar artists from Last.fm for ${artist.name}`)
            }
          }
        }
        
        // Берем треки текущего артиста + похожих
        const topSongs = await getTopSongs(artist.name, 5)
        const filtered = topSongs.filter(s => !usedSongIds.has(s.id))
        const shuffled = filtered.sort(() => Math.random() - 0.5)
        for (const song of shuffled) {
          if (songs.length >= limit * 0.7) break
          if (!usedSongIds.has(song.id)) {
            songs.push(song)
            usedSongIds.add(song.id)
          }
        }
        
        // Добавляем треки похожих артистов
        for (const similarArtist of similarArtists) {
          if (songs.length >= limit * 0.7) break
          try {
            const similarTopSongs = await getTopSongs(similarArtist.name, 3)
            const filteredSimilar = similarTopSongs.filter(s => !usedSongIds.has(s.id))
            const shuffledSimilar = filteredSimilar.sort(() => Math.random() - 0.5)
            for (const song of shuffledSimilar.slice(0, 2)) {
              if (songs.length >= limit * 0.7) break
              if (!usedSongIds.has(song.id)) {
                songs.push(song)
                usedSongIds.add(song.id)
              }
            }
          } catch (err) {
            console.warn(`[ML Recommendations] Failed to get songs for ${similarArtist.name}`)
          }
        }
      }
    } catch (error) {
      console.error('Failed to get artist songs:', error)
    }
  }

  // 3. Добавляем случайные треки для открытий (30% плейлиста)
  const discoveryCount = Math.max(5, limit - songs.length)
  const randomSongs = await getRandomSongs(discoveryCount * 3)
  const filtered = randomSongs.filter(s => !usedSongIds.has(s.id))
  const shuffled = filtered.sort(() => Math.random() - 0.5)
  
  for (const song of shuffled) {
    if (songs.length >= limit) break
    if (!usedSongIds.has(song.id)) {
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }

  // 4. Финальное перемешивание
  const finalPlaylist = songs.sort(() => Math.random() - 0.5)

  return {
    songs: finalPlaylist.slice(0, limit),
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
  lastGenerated?: string,
  updateIntervalHours: number = 24
): Promise<{ playlist: MLWavePlaylist; metadata: MLPlaylistMetadata; updated: boolean } | null> {
  // Если нет последней генерации или прошло достаточно времени
  if (!lastGenerated) {
    // Первая генерация
    const result = type === 'daily-mix'
      ? await generateDailyMix(likedSongIds, preferredGenres)
      : await generateDiscoverWeekly(likedSongIds, preferredGenres)
    
    return { ...result, updated: true }
  }

  const last = new Date(lastGenerated)
  const now = new Date()
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  if (hoursSince >= updateIntervalHours) {
    // Пора обновлять
    const result = type === 'daily-mix'
      ? await generateDailyMix(likedSongIds, preferredGenres)
      : await generateDiscoverWeekly(likedSongIds, preferredGenres)
    
    return { ...result, updated: true }
  }

  // Ещё рано обновлять
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
 * Конфигурация энергии по времени суток
 */
const TIME_ENERGY_CURVE: Record<string, {
  start: number
  end: number
  curve: 'ascending' | 'descending' | 'peak' | 'flat'
  genres: string[]
  name: string
  description: string
}> = {
  morning: {
    start: 0.3,  // Начинаем спокойно
    end: 0.7,    // Заканчиваем энергично
    curve: 'ascending',
    genres: ['indie', 'soft rock', 'pop', 'folk', 'acoustic'],
    name: '☀️ Утренний микс',
    description: 'Спокойные треки для хорошего начала дня'
  },
  day: {
    start: 0.6,
    end: 0.8,
    curve: 'peak',  // Держим высокую энергию
    genres: ['pop', 'rock', 'dance', 'electronic', 'funk'],
    name: '☀️ Дневной микс',
    description: 'Энергичные треки для продуктивного дня'
  },
  evening: {
    start: 0.5,
    end: 0.3,
    curve: 'descending',  // Постепенно успокаиваем
    genres: ['chill', 'r&b', 'soul', 'jazz', 'lo-fi'],
    name: '🌅 Вечерний микс',
    description: 'Расслабленные треки для уютного вечера'
  },
  night: {
    start: 0.2,
    end: 0.1,
    curve: 'flat',  // Очень спокойно
    genres: ['ambient', 'classical', 'lo-fi', 'sleep', 'downtempo'],
    name: '🌙 Ночной микс',
    description: 'Атмосферные треки для поздней ночи'
  }
}

/**
 * Генерация плейлиста по времени суток
 * С Vibe Similarity + Energy Curve по времени + Оркестратором
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
  
  console.log(`[TimeOfDayMix] Generating for ${timeOfDay} (hour: ${hour}, curve: ${config.curve})`)
  
  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  
  // Исключаем дизлайкнутые
  const dislikedSongIds = Object.entries(ratings)
    .filter(([_, rating]) => rating.like === false)
    .map(([id]) => id)
  dislikedSongIds.forEach(id => usedSongIds.add(id))
  
  // ============================================
  // 1. VIBE SIMILARITY: Лайкнутые треки с подходящей энергией
  // ============================================
  const { analyzeTrack, vibeSimilarity } = await import('./vibe-similarity')

  let vibeSimilarTracks: ISong[] = []
  
  if (likedSongIds.length > 0) {
    console.log('[TimeOfDayMix] 🎵 Finding liked tracks with matching energy...')

    // Получаем лайкнутые треки
    const likedSongsResults = await Promise.all(
      likedSongIds.slice(0, 50).map(id =>
        subsonic.songs.getSong(id).catch(() => null)
      )
    )

    // Фильтруем по энергии (для текущего времени)
    const energyMatchedLiked = likedSongsResults.filter((song): song is ISong =>
      song != null &&
      song.energy !== undefined &&
      song.energy >= config.start * 0.8 &&  // Мягкий фильтр
      song.energy <= config.end * 1.2
    )

    console.log(`[TimeOfDayMix] Found ${energyMatchedLiked.length} liked tracks with matching energy`)

    // Если нашли — используем как seed для Vibe Similarity
    if (energyMatchedLiked.length > 0) {
      const allSongs = await getRandomSongs(200)
      const vibeUsedIds = new Set<string>()

      for (const seed of energyMatchedLiked.slice(0, 5)) {
        const seedFeatures = analyzeTrack(seed)

        const similar = allSongs
          .filter(song =>
            !usedSongIds.has(song.id) &&
            !vibeUsedIds.has(song.id) &&
            song.energy !== undefined &&
            song.energy >= config.start * 0.8 &&
            song.energy <= config.end * 1.2
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

      console.log(`[TimeOfDayMix] 🎵 VIBE SIMILARITY: Added ${vibeSimilarTracks.length} tracks`)
    }
  }

  // ============================================
  // 2. Добавляем треки из жанров времени суток (основа)
  // ============================================
  console.log('[TimeOfDayMix] 🎼 Getting tracks from time-of-day genres...')

  const timeOfDayGenres = config.genres
  const songsFromGenres: ISong[] = []
  const genreUsedIds = new Set<string>(usedSongIds)

  // Собираем треки из всех жанров времени суток
  for (const genre of timeOfDayGenres) {
    const songsByGenre = await getSongsByGenre(genre, 20)
    
    // Первый проход - треки с энергией
    const withEnergy = songsByGenre.filter(s =>
      !genreUsedIds.has(s.id) &&
      s.energy !== undefined &&
      s.energy >= config.start * 0.7 &&
      s.energy <= config.end * 1.3
    )
    
    // Второй проход - треки без энергии (если нужно)
    const withoutEnergy = songsByGenre.filter(s =>
      !genreUsedIds.has(s.id) &&
      s.energy === undefined
    )
    
    // Сначала добавляем с энергией, потом без (если мало)
    const combined = [...withEnergy, ...withoutEnergy]
    const shuffled = combined.sort(() => Math.random() - 0.5)
    
    for (const song of shuffled) {
      if (!genreUsedIds.has(song.id)) {
        songsFromGenres.push(song)
        genreUsedIds.add(song.id)
      }
    }
  }

  console.log(`[TimeOfDayMix] 🎼 Found ${songsFromGenres.length} tracks from genres`)

  // ============================================
  // 3. Формируем финальный плейлист
  // ============================================
  // Если есть треки из vibe similarity - используем их (до 40%)
  if (vibeSimilarTracks.length > 0) {
    for (const song of vibeSimilarTracks) {
      if (songs.length >= Math.floor(limit * 0.4)) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
    console.log(`[TimeOfDayMix] ✅ Added ${songs.length} vibe-similar tracks`)
  }
  
  // Дополняем треками из жанров до полного лимита
  for (const song of songsFromGenres) {
    if (songs.length >= limit) break
    if (!usedSongIds.has(song.id)) {
      songs.push(song)
      usedSongIds.add(song.id)
    }
  }
  
  console.log(`[TimeOfDayMix] ✅ Total tracks before sorting: ${songs.length}`)

  // ============================================
  // 4. Сортировка по Energy Curve
  // ============================================
  console.log(`[TimeOfDayMix] 📈 Sorting by ${config.curve} energy curve...`)
  
  if (config.curve === 'ascending') {
    // Утро: спокойные → энергичные
    songs.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))
  } else if (config.curve === 'descending') {
    // Вечер: энергичные → спокойные
    songs.sort((a, b) => (b.energy || 0.5) - (a.energy || 0.5))
  } else if (config.curve === 'peak') {
    // День: спокойные → энергичные → спокойные (волна)
    const midPoint = Math.floor(songs.length / 2)
    const firstHalf = songs.slice(0, midPoint)
    const secondHalf = songs.slice(midPoint)
    
    firstHalf.sort((a, b) => (a.energy || 0.5) - (b.energy || 0.5))
    secondHalf.sort((a, b) => (b.energy || 0.5) - (a.energy || 0.5))
    
    songs.splice(0, songs.length, ...firstHalf, ...secondHalf)
  }
  // flat: оставляем как есть

  // ============================================
  // 5. ОРКЕСТРАТОР: Плавные переходы
  // ============================================
  console.log('[TimeOfDayMix] 🎼 ORCHESTRATOR: Creating smooth transitions...')
  
  const orchestrated = orchestratePlaylist(songs.slice(0, limit), {
    startWith: config.curve === 'ascending' || config.curve === 'peak' ? 'energetic' : 'calm',
    endWith: config.curve === 'descending' || config.curve === 'flat' ? 'calm' : 'moderate',
    energyCurve: config.curve,
  })
  
  return {
    songs: orchestrated,
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

// Vibe Mix - заглушка (использует acoustic микс как базу)
export const generateVibeMix = async (seedTrackId: string, allSongs: any[], limit = 25) => {
  // Находим seed трек
  const seedTrack = allSongs.find(s => s.id === seedTrackId)
  if (!seedTrack) {
    return { songs: [], source: 'mixed' }
  }
  
  // Используем acoustic микс как базу
  return generateActivityMix('acoustic', [], {}, {}, limit)
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
