/**
 * Shared Listens - "Что слушают другие"
 * 
 * АЛГОРИТМ ИЗ harmonybox_v2.py:
 * 1. Есть несколько аккаунтов Navidrome (друзья/семья)
 * 2. Подключаемся к КАЖДОМУ аккаунту
 * 3. Берём лайкнутые треки (getStarred2)
 * 4. Анализируем предпочтения (жанры, артисты)
 * 5. Генерируем общий плейлист:
 *    - 50% основной жанр
 *    - 30% похожие жанры
 *    - 20% другие жанры
 * 6. Исключаем повторы артистов (макс 2 на артиста)
 */

import CryptoJS from 'crypto-js'
import { saveGeneratedPlaylist } from '@/store/generated-playlists.store'
import type { ISong } from '@/types/responses/song'

export interface SharedAccount {
  id: string
  name: string
  url: string
  username: string
  password: string
  enabled: boolean
  serverType?: 'navidrome' | 'subsonic' | 'jellyfin' | 'lms'  // Тип сервера (автоопределение)
}

export interface SharedTrack {
  song: ISong
  fromAccount: string  // От какого аккаунта
  playCount: number
  isStarred: boolean
}

export interface SharedListensResult {
  tracks: SharedTrack[]
  total: number
  accountsCount: number
  lastUpdated: number
  playlistId?: string  // ID сохранённого плейлиста
}

/**
 * Получить лайкнутые треки с аккаунта
 */
async function getStarredTracks(
  url: string,
  username: string,
  password: string
): Promise<ISong[]> {
  try {
    // Генерируем соль как в Python коде (timestamp в миллисекундах)
    const salt = Date.now().toString()
    
    // MD5 хеш как в Python: md5(password + salt)
    const token = CryptoJS.MD5(password + salt).toString()

    console.log('[SharedListens] Auth:', {
      url,
      username,
      salt,
      token,
    })

    const params = new URLSearchParams({
      u: username,
      t: token,
      s: salt,
      v: '1.16.1',
      c: 'KumaFlow',
      f: 'json',
    })

    const fullUrl = `${url}/rest/getStarred2?${params}`
    console.log('[SharedListens] Request URL:', fullUrl)

    const response = await fetch(fullUrl)

    console.log('[SharedListens] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[SharedListens] HTTP error:', response.status, errorText)
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    console.log('[SharedListens] Response:', JSON.stringify(data, null, 2).substring(0, 1000))

    if (data['subsonic-response']?.status === 'ok') {
      const starred = data['subsonic-response'].starred2?.song || []
      console.log('[SharedListens] ✅ Got', starred.length, 'starred tracks')

      return starred.map((songData: any) => ({
        id: songData.id,
        title: songData.title,
        artist: songData.artist,
        artistId: songData.artistId,
        album: songData.album,
        albumId: songData.albumId,
        duration: songData.duration || 0,
        genre: songData.genre,
        coverArtUrl: songData.coverArt
          ? `${url}/rest/getCoverArt?id=${songData.coverArt}&v=1.16.1&c=KumaFlow&f=json`
          : undefined,
        playCount: songData.playCount || 0,
        isLocal: true,
        starred: true,
        year: songData.year,
      } as ISong))
    }

    console.warn('[SharedListens] Response status not ok:', data['subsonic-response']?.status)
    return []
  } catch (error) {
    console.error(`[SharedListens] Error fetching from ${username}:`, error)
    return []
  }
}

/**
 * Анализ жанров
 */
function analyzeGenres(starred: ISong[]): Record<string, number> {
  const genreCount: Record<string, number> = {}
  
  starred.forEach(song => {
    const genre = (song.genre || 'Unknown').toLowerCase()
    genreCount[genre] = (genreCount[genre] || 0) + 1
  })
  
  return genreCount
}

/**
 * Похожие жанры (из harmonybox_v2.py)
 */
const SIMILAR_GENRES: Record<string, string[]> = {
  'rap': ['rusrap', 'hiphop', 'trap', 'dance'],
  'pop': ['dance', 'edm', 'vocaljazz', 'electronics', 'rnb', 'soul'],
  'rock': ['hardrock', 'folk', 'country', 'alternative', 'indie', 'grunge'],
  'relax': ['newage', 'soundtrack', 'trance', 'ambient', 'chillout', 'meditation'],
  'edm': ['trance', 'dance', 'electronics', 'techno', 'house', 'drumandbass'],
  'rusrap': ['rap', 'hiphop', 'trap'],
  'classical': ['soundtrack', 'opera', 'instrumental', 'acoustic'],
  'jazz': ['vocaljazz', 'blues', 'soul', 'funk'],
  'metal': ['hardrock', 'punk', 'alternative'],
  'ambient': ['newage', 'chillout', 'meditation'],
  'kpop': ['pop', 'dance', 'jpop'],
}

/**
 * Расширить жанры похожими
 */
function expandGenres(genres: string[]): string[] {
  const expanded = new Set<string>(genres.map(g => g.toLowerCase()))
  
  genres.forEach(g => {
    const similar = SIMILAR_GENRES[g.toLowerCase()]
    if (similar) {
      similar.forEach(s => expanded.add(s))
    }
  })
  
  return Array.from(expanded)
}

/**
 * ГЕНЕРАЦИЯ ПЛЕЙЛИСТА (алгоритм из harmonybox_v2.py)
 */
export async function generateSharedPlaylist(
  accounts: SharedAccount[],
  count = 30
): Promise<SharedListensResult> {
  console.log('[SharedListens] 🎵 Starting playlist generation...')
  console.log('[SharedListens] Accounts:', accounts.length)

  // Фильтруем только аккаунты с Subsonic API
  const compatibleTypes = ['navidrome', 'subsonic', 'jellyfin']
  const enabledAccounts = accounts.filter(a =>
    a.enabled && (!a.serverType || compatibleTypes.includes(a.serverType))
  )

  // Предупреждение если есть несовместимые
  const incompatibleAccounts = accounts.filter(a =>
    a.enabled && a.serverType === 'lms'
  )
  if (incompatibleAccounts.length > 0) {
    console.warn('[SharedListens] ⚠️ Skipping incompatible accounts:', incompatibleAccounts.map(a => a.name).join(', '))
  }

  if (enabledAccounts.length === 0) {
    console.log('[SharedListens] ⚠️ No enabled accounts')
    return { tracks: [], total: 0, accountsCount: 0, lastUpdated: Date.now() }
  }
  
  // 1. Собираем ВСЕ лайкнутые треки со всех аккаунтов
  const allStarred: SharedTrack[] = []
  
  for (const account of enabledAccounts) {
    console.log(`[SharedListens] 📡 Fetching from ${account.name}...`)
    
    const starred = await getStarredTracks(
      account.url,
      account.username,
      account.password
    )
    
    console.log(`[SharedListens] ✅ Got ${starred.length} from ${account.name}`)
    
    starred.forEach(song => {
      allStarred.push({
        song,
        fromAccount: account.name,
        playCount: song.playCount || 0,
        isStarred: true,
      })
    })
  }
  
  if (allStarred.length === 0) {
    console.log('[SharedListens] ⚠️ No starred tracks found')
    return { tracks: [], total: 0, accountsCount: enabledAccounts.length, lastUpdated: Date.now() }
  }
  
  // 2. Анализируем жанры ВСЕХ лайкнутых треков
  const genreCount = analyzeGenres(allStarred.map(t => t.song))
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  
  console.log('[SharedListens] 📊 Top genres:', topGenres)
  
  const mainGenre = topGenres[0]?.[0] || 'pop'
  const similarGenres = expandGenres([mainGenre, ...(topGenres[1]?.[0] ? [topGenres[1][0]] : [])])
  
  console.log('[SharedListens] 🎭 Main genre:', mainGenre)
  console.log('[SharedListens] 🔀 Similar genres:', similarGenres)
  
  // 3. Фильтруем по жанрам
  const mainGenreSongs = allStarred.filter(t => 
    t.song.genre?.toLowerCase() === mainGenre.toLowerCase()
  )
  
  const similarGenreSongs = allStarred.filter(t => 
    similarGenres.includes(t.song.genre?.toLowerCase()) && 
    t.song.genre?.toLowerCase() !== mainGenre.toLowerCase()
  )
  
  const otherSongs = allStarred.filter(t => 
    !similarGenres.includes(t.song.genre?.toLowerCase())
  )
  
  // 4. Формируем плейлист (50% / 30% / 20%)
  const mainCount = Math.floor(count * 0.5)
  const similarCount = Math.floor(count * 0.3)
  const otherCount = count - mainCount - similarCount
  
  console.log(`[SharedListens] 📊 Distribution: ${mainCount} main, ${similarCount} similar, ${otherCount} other`)
  
  // Перемешиваем и берём нужное количество
  const shuffle = (arr: any[]) => arr.sort(() => Math.random() - 0.5)
  
  const selectedSongs = [
    ...shuffle(mainGenreSongs).slice(0, mainCount),
    ...shuffle(similarGenreSongs).slice(0, similarCount),
    ...shuffle(otherSongs).slice(0, otherCount),
  ]
  
  // 5. Исключаем повторы артистов (макс 2 трека на артиста)
  const artistCount: Record<string, number> = {}
  const filteredSongs = selectedSongs.filter(track => {
    const artist = track.song.artist.toLowerCase()
    const trackCount = artistCount[artist] || 0
    if (trackCount >= 2) return false
    artistCount[artist] = trackCount + 1
    return true
  })
  
  // 6. Финальное перемешивание
  const finalSongs = shuffle(filteredSongs).slice(0, count)
  
  console.log(`[SharedListens] ✅ Generated playlist: ${finalSongs.length} tracks from ${enabledAccounts.length} accounts`)
  
  // Сохраняем плейлист в хранилище
  const savedPlaylist = saveGeneratedPlaylist({
    type: 'shared-listens',
    name: '🌍 Что слушают другие',
    description: `Плейлист из ${enabledAccounts.length} аккаунтов: ${enabledAccounts.map(a => a.name).join(', ')}`,
    songs: finalSongs.map(t => t.song),
    metadata: {
      accountsCount: enabledAccounts.length,
      genres: Array.from(new Set(finalSongs.map(t => t.song.genre).filter(Boolean))),
    },
  })
  
  console.log('[SharedListens] 💾 Saved playlist with ID:', savedPlaylist.id)
  
  return {
    tracks: finalSongs,
    total: finalSongs.length,
    accountsCount: enabledAccounts.length,
    lastUpdated: Date.now(),
    playlistId: savedPlaylist.id,  // Добавляем ID сохранённого плейлиста
  }
}

/**
 * Кэширование (на 30 минут)
 */
let cachedResult: SharedListensResult | null = null
let cacheTime = 0

export async function getCachedSharedListens(
  accounts: SharedAccount[],
  count = 30,
  forceRefresh = false
): Promise<SharedListensResult> {
  const now = Date.now()
  
  if (cachedResult && (now - cacheTime) < 30 * 60 * 1000 && !forceRefresh) {
    console.log('[SharedListens] 📦 Returning cached result')
    return cachedResult
  }
  
  const result = await generateSharedPlaylist(accounts, count)
  
  if (result.tracks.length > 0) {
    cachedResult = result
    cacheTime = now
  }
  
  return result
}

export function clearSharedListensCache() {
  cachedResult = null
  cacheTime = 0
}

/**
 * Сохранение аккаунтов в localStorage
 */
export function saveSharedAccounts(accounts: SharedAccount[]) {
  localStorage.setItem('shared-accounts', JSON.stringify(accounts))
  console.log('[SharedListens] Accounts saved:', accounts.length)
}

/**
 * Загрузка аккаунтов из localStorage
 */
export function loadSharedAccounts(): SharedAccount[] {
  const saved = localStorage.getItem('shared-accounts')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      console.error('[SharedListens] Error loading accounts:', e)
    }
  }
  return []
}
