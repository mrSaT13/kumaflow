/**
 * AI Playlist Generator - Генерация плейлистов на основе кластеризации жанров
 * 
 * Анализирует лайкнутые треки пользователя, выявляет топ жанры
 * и создаёт персональные AI плейлисты по каждому жанру
 */

import { subsonic } from '@/service/subsonic'
import { getSongsByGenre, getRandomSongs, getTopSongs } from '@/service/subsonic-api'
import { orchestratePlaylist } from '@/service/playlist-orchestrator'
import { playlistCacheStorage } from '@/service/playlist-cache-storage'
import type { ISong } from '@/types/responses/song'

export interface GenreCluster {
  genre: string
  trackCount: number
  weight: number
  topArtists: string[]
  recentTracks: string[]  // ID треков которые были в прошлых плейлистах
}

export interface AIPlaylist {
  id: string
  type: 'genre-cluster' | 'k-pop-top' | 'discovery'
  genre?: string
  title: string
  description: string
  songs: ISong[]
  coverArt?: string
  gradient: string
  createdAt: number
  expiresAt: number  // Когда удалить карточку (24 часа)
  lastTracks: string[]  // ID треков для исключения повторов
  seed: number  // Seed для рандомизации
}

/**
 * Кластеризация лайкнутых треков по жанрам
 */
export async function analyzeLikedTracksAndCluster(
  likedSongIds: string[],
  ratings?: Record<string, { like?: boolean; skipCount?: number }>
): Promise<GenreCluster[]> {
  console.log('[AI Generator] Analyzing liked tracks for clustering...')

  const genreMap = new Map<string, { count: number; artists: Set<string>; trackIds: string[] }>()
  const artistMap = new Map<string, number>()

  // Получаем информацию о лайкнутых треках
  const likedSongs: ISong[] = []
  
  for (const songId of likedSongIds.slice(0, 200)) {  // Ограничим для производительности
    try {
      const song = await subsonic.songs.getSong(songId)
      if (song) {
        likedSongs.push(song)
        
        // Считаем жанры
        const genre = song.genre || 'Unknown'
        const current = genreMap.get(genre) || { count: 0, artists: new Set(), trackIds: [] }
        current.count++
        current.artists.add(song.artist)
        current.trackIds.push(song.id)
        genreMap.set(genre, current)

        // Считаем артистов
        const artistCount = artistMap.get(song.artist) || 0
        artistMap.set(song.artist, artistCount + 1)
      }
    } catch (error) {
      console.warn(`[AI Generator] Failed to load song ${songId}:`, error)
    }
  }

  console.log(`[AI Generator] Analyzed ${likedSongs.length} liked songs`)

  // Получаем топ артистов
  const topArtists = Array.from(artistMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name]) => name)

  // Формируем кластеры жанров
  const clusters: GenreCluster[] = []
  
  for (const [genre, data] of genreMap.entries()) {
    if (data.count < 3) continue  // Пропускаем жанры с < 3 треков

    const totalWeight = data.count * 1.0  // Базовый вес

    // Получаем последние треки из кэша для этого жанра
    const cachedPlaylist = await playlistCacheStorage.getPlaylist(`genre-${genre.toLowerCase()}`)
    const recentTracks = cachedPlaylist?.lastTracks || []

    clusters.push({
      genre,
      trackCount: data.count,
      weight: totalWeight,
      topArtists: Array.from(data.artists).slice(0, 10),
      recentTracks,
    })
  }

  // Сортируем по весу
  clusters.sort((a, b) => b.weight - a.weight)

  console.log(`[AI Generator] Found ${clusters.length} genre clusters`)
  console.log('[AI Generator] Top clusters:', clusters.slice(0, 5).map(c => `${c.genre}: ${c.trackCount} tracks`))

  return clusters
}

/**
 * Генерация AI плейлиста для конкретного жанра
 */
export async function generateGenreClusterPlaylist(
  cluster: GenreCluster,
  limit: number = 30
): Promise<AIPlaylist> {
  console.log(`[AI Generator] Generating playlist for ${cluster.genre}...`)

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const usedArtists = new Map<string, number>()

  // Генерируем seed на основе времени и истории
  const seed = generateSeed(cluster.genre, cluster.recentTracks)
  console.log(`[AI Generator] Using seed: ${seed}`)

  // ============================================
  // 1. Треки из жанра (50%) - меньше чтобы было разнообразнее
  // ============================================
  const genreTrackCount = Math.floor(limit * 0.5)
  
  try {
    // Берём больше треков для выбора
    const songsByGenre = await getSongsByGenre(cluster.genre, limit * 4)
    
    // Рандомизируем и исключаем повторные треки
    const shuffled = shuffleWithSeed(songsByGenre, seed)
    
    for (const song of shuffled) {
      if (songs.length >= genreTrackCount) break
      if (usedSongIds.has(song.id)) continue
      
      // Штраф за повтор трека из недавних плейлистов (но не блокируем!)
      if (cluster.recentTracks.includes(song.id)) {
        // Пропускаем только 50% повторных треков
        if (Math.random() > 0.5) {
          console.log(`[AI Generator] Skipping recent track: ${song.title}`)
          continue
        }
      }

      // Лимит артистов - не больше 2 треков от артиста (было 1)
      const artistCount = usedArtists.get(song.artist) || 0
      if (artistCount >= 2) continue

      songs.push(song)
      usedSongIds.add(song.id)
      usedArtists.set(song.artist, artistCount + 1)
    }
  } catch (error) {
    console.error(`[AI Generator] Failed to get songs by genre:`, error)
  }

  // ============================================
  // 2. Случайные треки для разнообразия (50%) - больше
  // ============================================
  const randomTrackCount = limit - songs.length
  
  try {
    // Берём ещё больше случайных треков
    const randomSongsList = await getRandomSongs(randomTrackCount * 5)
    const shuffled = shuffleWithSeed(randomSongsList, seed + 1000)
    
    for (const song of shuffled) {
      if (songs.length >= limit) break
      if (usedSongIds.has(song.id)) continue
      
      // Для случайных треков тоже проверяем recent но мягче
      if (cluster.recentTracks.includes(song.id)) {
        if (Math.random() > 0.3) continue  // 70% шанс пропустить
      }

      const artistCount = usedArtists.get(song.artist) || 0
      if (artistCount >= 2) continue

      songs.push(song)
      usedSongIds.add(song.id)
      usedArtists.set(song.artist, artistCount + 1)
    }
  } catch (error) {
    console.error(`[AI Generator] Failed to get random songs:`, error)
  }

  // ============================================
  // 3. Если всё ещё мало треков - берём что есть
  // ============================================
  if (songs.length < limit) {
    console.log(`[AI Generator] Only got ${songs.length} tracks, relaxing constraints...`)
    
    try {
      const moreSongs = await getRandomSongs(50)
      for (const song of moreSongs) {
        if (songs.length >= limit) break
        if (!usedSongIds.has(song.id)) {
          songs.push(song)
          usedSongIds.add(song.id)
        }
      }
    } catch (error) {
      console.error('[AI Generator] Failed to get more songs:', error)
    }
  }

  // ============================================
  // 4. Оркестрация - плавные переходы
  // ============================================
  console.log(`[AI Generator] Orchestrating ${songs.length} tracks...`)
  const orchestrated = orchestratePlaylist(songs, {
    startWith: 'energetic',
    endWith: 'calm',
  })

  // ============================================
  // 5. Генерируем название и описание
  // ============================================
  const { name, description, gradient } = generatePlaylistMetadata(cluster.genre, seed)

  // ============================================
  // 6. Сохраняем в кэш для исключения повторов
  // ============================================
  const playlistId = `genre-${cluster.genre.toLowerCase().replace(/\s+/g, '-')}`
  
  await playlistCacheStorage.savePlaylist(playlistId, orchestrated)

  return {
    id: playlistId,
    type: 'genre-cluster',
    genre: cluster.genre,
    title: name,
    description,
    songs: orchestrated,
    gradient,
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000),  // 24 часа
    lastTracks: orchestrated.map(s => s.id),
    seed,
  }
}

/**
 * Специальный генератор для K-Pop (топы + новинки)
 */
export async function generateKPopTopPlaylist(
  limit: number = 30
): Promise<AIPlaylist> {
  console.log('[AI Generator] Generating K-Pop Top playlist...')

  const songs: ISong[] = []
  const usedSongIds = new Set<string>()
  const seed = generateSeed('k-pop-top', [])

  // Получаем треки по жанру K-Pop
  try {
    const kpopSongs = await getSongsByGenre('K-Pop', limit * 2)
    const shuffled = shuffleWithSeed(kpopSongs, seed)

    // Берем топовые треки (по play count если есть)
    const sorted = shuffled.sort((a, b) => {
      const aCount = a.playCount || 0
      const bCount = b.playCount || 0
      return bCount - aCount
    })

    for (const song of sorted) {
      if (songs.length >= limit) break
      if (!usedSongIds.has(song.id)) {
        songs.push(song)
        usedSongIds.add(song.id)
      }
    }
  } catch (error) {
    console.error('[AI Generator] Failed to get K-Pop songs:', error)
  }

  const orchestrated = orchestratePlaylist(songs, {
    startWith: 'energetic',
    endWith: 'energetic',
  })

  return {
    id: 'k-pop-top-hits',
    type: 'k-pop-top',
    genre: 'K-Pop',
    title: '🇰🇷 K-Pop Топ Чарт',
    description: 'Самые горячие K-Pop хиты этой недели',
    songs: orchestrated,
    gradient: 'from-pink-500 via-purple-500 to-indigo-500',
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000),
    lastTracks: orchestrated.map(s => s.id),
    seed,
  }
}

/**
 * Генерация метаданных плейлиста (название, описание, градиент)
 * С большей вариативностью и креативностью
 */
function generatePlaylistMetadata(genre: string, seed: number): {
  name: string
  description: string
  gradient: string
} {
  // Большие массивы вариантов для разнообразия
  const nameVariants: Record<string, string[]> = {
    'K-Pop': [
      '🇰🇷 K-Pop Вайб', '🌸 Seoul Nights', '🎤 Korean Wave', 
      '✨ K-Pop Драйв', '🌙 Gangnam Vibes', '💜 K-Pop Energy',
      '🎵 Hallyu Mix', '🔥 K-Pop Хиты', '💫 K-Pop Fusion'
    ],
    'Rock': [
      '🎸 Rock Энергия', '⚡ Rock Мощность', '🔥 Rock Классика',
      '🤘 Rock Хиты', '💥 Rock Drive', '🌟 Rock Legends',
      '🎵 Rock Vibes', '⚡ Rock Nation', '🔥 Rock Revolution'
    ],
    'Pop': [
      '🎤 Pop Настроение', '✨ Pop Хиты', '🌟 Pop Вечеринка',
      '💫 Pop Топы', '🎵 Pop Vibes', '🔥 Pop Energy',
      '💖 Pop Love', '🌈 Pop Dreams', '⭐ Pop Stars'
    ],
    'Hip-Hop': [
      '🎧 Hip-Hop Flow', '🔥 Rap Game', '💎 Hip-Hop Бэнгеры',
      '🌃 Urban Vibes', '🎤 Rap Nation', '⚡ Hip-Hop Energy',
      '👑 Hip-Hop Kings', '🎵 Flow State', '🌟 Rap Stars'
    ],
    'Electronic': [
      '🎹 Electronic Pulse', '⚡ EDM Драйв', '🌃 Electronic Nights',
      '🔮 Synth Wave', '💫 Electronic Vibes', '🎵 Digital Dreams',
      '🌟 Electronic Energy', '⚡ Beat Drop', '🔥 Electronic Fusion'
    ],
    'Jazz': [
      '🎺 Jazz Mood', '🌙 Smooth Jazz', '🍷 Jazz Lounge',
      '🎵 Late Night Jazz', '💫 Jazz Vibes', '🌟 Jazz Classics',
      '🎷 Jazz Fusion', '⚡ Jazz Energy', '🔥 Jazz Nights'
    ],
    'Classical': [
      '🎻 Classical Harmony', '🌙 Classical Peace', '🎼 Symphony Mix',
      '🎵 Classical Focus', '💫 Classical Beauty', '🌟 Classical Masters',
      '⚡ Classical Power', '🔥 Classical Passion', '✨ Classical Dreams'
    ],
    'Rap': [
      '🎤 Rap Flow', '🔥 Rap Хиты', '💎 Rap Energy',
      '🌃 Urban Stories', '👑 Rap Kings', '⚡ Rap Nation',
      '🎵 Flow Master', '🌟 Rap Stars', '🔥 Rap Revolution'
    ],
    'RusRap': [
      '🎤 RusRap Вайб', '🔥 RusRap Хиты', '🌃 RusRap Stories',
      '💎 RusRap Flow', '👑 RusRap Kings', '⚡ RusRap Energy',
      '🎵 RusRap Nation', '🌟 RusRap Stars', '🔥 RusRap Revolution'
    ],
    'Numetal': [
      '🤘 Nu-Metal Мощь', '⚡ Nu-Metal Энергия', '🔥 Nu-Metal Хиты',
      '💥 Nu-Metal Drive', '🎸 Nu-Metal Revolution', '🌟 Nu-Metal Legends',
      '🔊 Nu-Metal Sound', '⚡ Nu-Metal Attack', '🔥 Nu-Metal Fury'
    ],
  }

  const descriptions = [
    'Идеальный микс для твоего настроения 🎵',
    'Свежие треки и проверенные хиты ✨',
    'Специально подобрано для тебя 💫',
    'Лучшее из жанра для максимального вайба 🔥',
    'Открой для себя новые звуки 🌟',
    'Энергия и драйв в каждом треке ⚡',
    'Твой персональный саундтрек 🎧',
    'Микс который зайдёт именно сейчас 💖',
    'Погружение в мир жанра 🌊',
    'Только хиты и ничего лишнего 🎯',
  ]

  const gradients = [
    'from-purple-600 via-pink-600 to-red-600',
    'from-blue-600 via-cyan-600 to-teal-600',
    'from-green-600 via-emerald-600 to-teal-600',
    'from-orange-600 via-amber-600 to-yellow-600',
    'from-indigo-600 via-purple-600 to-pink-600',
    'from-red-600 via-rose-600 to-pink-600',
    'from-slate-600 via-gray-600 to-zinc-700',
    'from-violet-600 via-fuchsia-600 to-pink-600',
    'from-teal-600 via-cyan-600 to-blue-600',
    'from-amber-600 via-orange-600 to-red-600',
  ]

  // Добавляем случайность чтобы каждый раз было разное название
  const timeBasedSeed = Math.floor(Date.now() / (5 * 60 * 1000)) % genreNames.length  // Меняется каждые 5 минут
  const randomSeed = Math.floor(Math.random() * genreNames.length)
  
  // Выбираем на основе seed + случайности для разнообразия
  const genreNames = nameVariants[genre] || nameVariants['Pop'] || ['🎵 Микс']
  const nameIndex = (seed + timeBasedSeed + randomSeed) % genreNames.length
  const descIndex = (seed + nameIndex) % descriptions.length
  const gradientIndex = (seed + descIndex) % gradients.length

  return {
    name: genreNames[nameIndex],
    description: descriptions[descIndex],
    gradient: gradients[gradientIndex],
  }
}

/**
 * Генерация уникального seed
 */
function generateSeed(patternId: string, recentTracks: string[]): number {
  const hour = Math.floor(Date.now() / (60 * 60 * 1000))
  const dayOfWeek = new Date().getDay()
  const minutes = Math.floor(Date.now() / (60 * 1000))  // Меняется каждую минуту
  
  // Добавляем больше энтропии
  const randomEntropy = Math.random() * 1000000  // Случайное число для разнообразия
  
  const recentStr = recentTracks.slice(0, 10).join(',')
  
  const seedStr = `${minutes}-${dayOfWeek}-${patternId}-${recentStr}-${randomEntropy}`
  
  // Простой хэш
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    const char = seedStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  
  return Math.abs(hash)
}

/**
 * Перемешивание с seed (детерминированный рандом)
 */
function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const shuffled = [...array]
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const random = seededRandom(seed + i)
    const j = Math.floor(random * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  
  return shuffled
}

/**
 * Детерминированный рандом на основе seed
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}
