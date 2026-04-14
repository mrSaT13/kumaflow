// KumaFlow Subsonic/Navidrome API client
// Использует готовый httpClient с авторизацией

import { httpClient } from '@/api/httpClient'

// Types
export interface SubsonicGenre {
  value: string
  songCount?: number
  albumCount?: number
}

export interface SubsonicArtist {
  id: string
  name: string
  songCount?: number
  albumCount?: number
  coverArt?: string
  artistImageUrl?: string
}

export interface SubsonicSong {
  id: string
  title: string
  artist: string
  artistId: string
  album: string
  albumId: string
  genre: string
  duration: number
  playCount?: number
  starred?: string
  userRating?: number
  coverArt?: string
}

export interface SubsonicArtistInfo {
  id: string
  name: string
  biography?: string
  musicBrainzId?: string
  lastFmUrl?: string
  similarArtist?: SubsonicArtist[]
}

// API Functions

/**
 * Получить все жанры
 */
export async function getGenres(): Promise<SubsonicGenre[]> {
  try {
    const response = await httpClient<{ genres?: { genre: SubsonicGenre[] } }>('getGenres', {})
    return response?.data?.genres?.genre || []
  } catch (error) {
    console.error('Failed to fetch genres:', error)
    return []
  }
}

/**
 * Получить всех артистов
 */
export async function getArtists(): Promise<SubsonicArtist[]> {
  try {
    const response = await httpClient<{ artists?: { index: { artist: SubsonicArtist[] }[] } }>('getArtists')

    const indexes = response?.data?.artists?.index || []
    const artists = indexes.flatMap(index => index.artist || [])

    console.log('[getArtists] Fetched', artists.length, 'artists')
    return artists
  } catch (error) {
    console.error('Failed to fetch artists:', error)
    return []
  }
}

/**
 * Получить лайкнутых артистов
 */
export async function getStarredArtists(): Promise<SubsonicArtist[]> {
  try {
    const response = await httpClient<{ starred2?: { artist: SubsonicArtist[] } }>('getStarred2', {})
    const artists = response?.data?.starred2?.artist || []
    console.log('[getStarredArtists] Fetched', artists.length, 'starred artists')
    return artists
  } catch (error) {
    console.error('Failed to fetch starred artists:', error)
    return []
  }
}

/**
 * Получить случайных артистов (быстрый способ)
 */
export async function getRandomArtists(count: number = 20): Promise<SubsonicArtist[]> {
  try {
    // Получаем случайные треки и извлекаем уникальных артистов
    const songsResponse = await httpClient<{ randomSongs?: { song: SubsonicArtist[] } }>('getRandom', {
      query: { size: count * 3 },
    })

    const songs = songsResponse?.data?.randomSongs?.song || []
    
    // Извлекаем уникальных артистов
    const artistMap = new Map<string, SubsonicArtist>()
    for (const song of songs) {
      if (song.artistId && !artistMap.has(song.artistId)) {
        artistMap.set(song.artistId, {
          id: song.artistId,
          name: song.artist || 'Unknown',
          coverArt: song.coverArt,
          artistImageUrl: undefined,
        } as SubsonicArtist)
      }
    }

    const artists = Array.from(artistMap.values()).slice(0, count)
    console.log('[getRandomArtists] Fetched', artists.length, 'artists from random songs')
    return artists
  } catch (error) {
    console.error('Failed to fetch random artists:', error)
    return []
  }
}

/**
 * Получить ограниченное количество артистов (для онбординга)
 */
export async function getLimitedArtists(limit: number = 50): Promise<SubsonicArtist[]> {
  try {
    const response = await httpClient<{ artists?: { index: { artist: SubsonicArtist[] }[] } }>('getArtists', {
      query: { offset: '0', limit: limit.toString() },
    })

    const indexes = response?.data?.artists?.index || []
    const artists = indexes.flatMap(index => index.artist || [])

    return artists.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to fetch limited artists:', error)
    return []
  }
}

/**
 * Получить информацию об артисте (включая похожих)
 */
export async function getArtistInfo(artistId: string): Promise<SubsonicArtistInfo | null> {
  try {
    const response = await httpClient<{ artistInfo2?: SubsonicArtistInfo }>('getArtistInfo2', {
      query: { id: artistId, count: 10 },
    })
    return response?.data?.artistInfo2 || null
  } catch (error) {
    console.error('Failed to fetch artist info:', error)
    return null
  }
}

/**
 * Получить лайкнутые треки
 */
export async function getStarredSongs(): Promise<SubsonicSong[]> {
  try {
    const response = await httpClient<{ starred2?: { song: SubsonicSong[] } }>('getStarred2', {})
    console.log('[getStarredSongs] Response:', response)
    console.log('[getStarredSongs] Starred songs:', response?.data?.starred2?.song || [])
    return response?.data?.starred2?.song || []
  } catch (error) {
    console.error('Failed to fetch starred songs:', error)
    return []
  }
}

/**
 * Получить лайкнутых артистов
 */
export async function getFavoriteArtists(): Promise<SubsonicArtist[]> {
  try {
    const response = await httpClient<{ starred2?: { artist: SubsonicArtist[] } }>('getStarred2', {})
    return response?.data?.starred2?.artist || []
  } catch (error) {
    console.error('Failed to fetch favorite artists:', error)
    return []
  }
}

/**
 * Получить случайные треки
 */
export async function getRandomSongs(size: number = 50): Promise<SubsonicSong[]> {
  try {
    const response = await httpClient<{ randomSongs?: { song: SubsonicSong[] } }>('getRandomSongs', {
      query: { size },
    })
    return response?.data?.randomSongs?.song || []
  } catch (error) {
    console.error('Failed to fetch random songs:', error)
    return []
  }
}

/**
 * Получить треки по жанру
 * С поддержкой похожих жанров если не найдено достаточно треков
 */
export async function getSongsByGenre(genre: string, size: number = 50): Promise<SubsonicSong[]> {
  try {
    // Нормализуем жанр (перевод с русского на английский)
    const normalizedGenre = normalizeGenre(genre)
    console.log(`[getSongsByGenre] Original: "${genre}" → Normalized: "${normalizedGenre}"`)
    
    // Пробуем точное совпадение
    const response = await httpClient<{ songsByGenre?: { song: SubsonicSong[] } }>('getSongsByGenre', {
      query: { genre: normalizedGenre, count: size * 2 }, // Берем с запасом
    })
    
    let songs = response?.data?.songsByGenre?.song || []
    
    // Если мало треков, пробуем похожие жанры
    if (songs.length < size) {
      console.log(`[getSongsByGenre] Found ${songs.length} for "${normalizedGenre}", trying similar genres...`)
      const similarGenres = findSimilarGenres(normalizedGenre)
      
      for (const similarGenre of similarGenres) {
        if (songs.length >= size) break
        
        try {
          const moreResponse = await httpClient<{ songsByGenre?: { song: SubsonicSong[] } }>('getSongsByGenre', {
            query: { genre: similarGenre, count: size },
          })
          const moreSongs = moreResponse?.data?.songsByGenre?.song || []
          songs = [...songs, ...moreSongs]
          console.log(`[getSongsByGenre] Added ${moreSongs.length} from "${similarGenre}"`)
        } catch (error) {
          console.warn(`Failed to get songs from similar genre "${similarGenre}":`, error)
        }
      }
    }
    
    // Убираем дубли
    const uniqueSongs = songs.filter((s, i, arr) => 
      arr.findIndex(x => x.id === s.id) === i
    )
    
    console.log(`[getSongsByGenre] "${genre}" → "${normalizedGenre}": ${uniqueSongs.length} total tracks`)
    return uniqueSongs.slice(0, size)
  } catch (error) {
    console.error('Failed to fetch songs by genre:', error)
    return []
  }
}

/**
 * Нормализовать жанр (перевод с русского на английский)
 */
function normalizeGenre(genre: string): string {
  const ruToEn: Record<string, string> = {
    // Основные жанры
    'рок': 'rock',
    'метал': 'metal',
    'хэви-метал': 'heavy-metal',
    'дэт-метал': 'deathmetal',
    'блэк-метал': 'blackmetal',
    'ню-метал': 'numetal',
    'классика': 'classical',
    'классическая': 'classical',
    'джаз': 'jazz',
    'блюз': 'blues',
    'соул': 'soul',
    'фанк': 'funk',
    'поп': 'pop',
    'попса': 'pop',
    'рэп': 'rap',
    'хип-хоп': 'hip-hop',
    'русский рэп': 'rusrap',
    'зарубежный рэп': 'foreignrap',
    'электронная': 'electronic',
    'электроника': 'electronic',
    'танцевальная': 'dance',
    'хаус': 'house',
    'техно': 'techno',
    'транс': 'trance',
    'дабстеп': 'dubstep',
    'драм-н-бейс': 'dnb',
    'брейкбит': 'breakbeatgenre',
    'инди': 'indie',
    'альтернатива': 'alternative',
    'панк': 'punk',
    'хардкор': 'hardcore',
    'кантри': 'country',
    'фолк': 'folk',
    'акустика': 'acoustic',
    'регги': 'reggae',
    'латина': 'latin',
    'реггетон': 'reggaeton',
    'кей-поп': 'kpop',
    'я-поп': 'j-pop',
    'саундтрек': 'soundtrack',
    'музыка из игр': 'videogame',
    'музыка из фильмов': 'films',
    'эмбиент': 'ambient',
    'чилл': 'chill',
    'лау-фай': 'lo-fi',
    'лоу-фай': 'lo-fi',
    'медитация': 'meditation',
    'нью-эйдж': 'newage',
    'синти-поп': 'synthpop',
    'диско': 'disco',
    'евродэнс': 'eurodance',
    'трэп': 'trap',
    'дэнсхолл': 'dancehall',
    'ска': 'ska',
    'даб': 'dub',
    'грув': 'groove',
    'свинг': 'swing',
    'боп': 'bop',
    'фьюжн': 'fusion',
    'прогрессив': 'progressive',
    'психоделик': 'psychedelic',
    'гранж': 'grunge',
    'брит-поп': 'britpop',
    'шугейз': 'shoegaze',
    'пост-панк': 'postpunk',
    'новой волны': 'newwave',
    'хард-рок': 'hardrock',
  }
  
  const normalized = genre.toLowerCase().trim()
  return ruToEn[normalized] || normalized
}

/**
 * Найти похожие жанры для расширения поиска
 */
function findSimilarGenres(genre: string): string[] {
  const normalizedGenre = genre.toLowerCase().trim()
  
  const similar: Record<string, string[]> = {
    // Rock family
    'rock': ['alternative', 'indie', 'hardrock', 'punk'],
    'alternative': ['rock', 'indie', 'grunge', 'britpop'],
    'indie': ['alternative', 'rock', 'indierock', 'indiepop'],
    'hardrock': ['rock', 'metal', 'classicmetal'],
    'punk': ['rock', 'hardcore', 'pop-punk'],
    
    // Metal family
    'metal': ['hardrock', 'heavy-metal', 'thrashmetal', 'deathmetal'],
    'heavy-metal': ['metal', 'hardrock', 'classicmetal'],
    'deathmetal': ['metal', 'blackmetal', 'metalcoregenre'],
    'blackmetal': ['metal', 'deathmetal'],
    'numetal': ['metal', 'alternativemetal', 'rap'],
    'alternativemetal': ['metal', 'numetal', 'alternative'],
    'metalcoregenre': ['metal', 'hardcore', 'deathmetal'],
    'classicmetal': ['metal', 'heavy-metal', 'hardrock'],
    
    // Rap/Hip-Hop family
    'rap': ['hip-hop', 'foreignrap', 'rusrap', 'trap'],
    'hip-hop': ['rap', 'rnb', 'soul'],
    'foreignrap': ['rap', 'hip-hop'],
    'rusrap': ['rap', 'foreignrap'],
    'trap': ['rap', 'hip-hop'],
    
    // Electronic family
    'electronic': ['edmgenre', 'house', 'techno', 'dance', 'trance'],
    'edmgenre': ['electronic', 'house', 'dance'],
    'house': ['electronic', 'edmgenre', 'techno', 'deephouse'],
    'techno': ['electronic', 'house', 'trance'],
    'dance': ['electronic', 'edmgenre', 'pop', 'eurodance'],
    'trance': ['electronic', 'techno', 'house'],
    'dubstep': ['electronic', 'edmgenre', 'dnb'],
    'dnb': ['electronic', 'dubstep', 'drumnbass'],
    'breakbeatgenre': ['electronic', 'dnb', 'bigbeat'],
    
    // Pop family
    'pop': ['dance', 'electronic', 'indiepop', 'synthpop'],
    'kpop': ['pop', 'j-pop'],
    'j-pop': ['pop', 'kpop'],
    'synthpop': ['pop', 'electronic', 'newwave'],
    
    // Jazz/Blues/Soul family
    'jazz': ['blues', 'soul', 'classical', 'vocaljazz'],
    'blues': ['jazz', 'rock', 'soul'],
    'soul': ['jazz', 'rnb', 'funk'],
    'funk': ['soul', 'rnb', 'disco'],
    'rnb': ['r&b', 'hip-hop', 'soul', 'pop'],
    
    // Classical family
    'classical': ['newage', 'soundtrack', 'jazz'],
    'newage': ['classical', 'ambient', 'meditation'],
    'soundtrack': ['classical', 'films', 'videogame'],
    
    // Chill/Relax family
    'chill': ['ambient', 'lo-fi', 'downtempo'],
    'ambient': ['chill', 'electronic', 'newage'],
    'lo-fi': ['chill', 'hip-hop', 'ambient'],
    'meditation': ['ambient', 'newage', 'classical'],
    
    // Other
    'folk': ['acoustic', 'country', 'singer-songwriter'],
    'acoustic': ['folk', 'singer-songwriter', 'unplugged'],
    'country': ['folk', 'rock', 'americana'],
    'reggae': ['dancehall', 'ska', 'dub'],
    'latin': ['latinfolk', 'reggaeton', 'salsa'],
    'reggaeton': ['latin', 'latinfolk'],
    'videogame': ['soundtrack', 'electronic', 'orchestral'],
    'films': ['soundtrack', 'classical'],
  }
  
  // Ищем точное совпадение
  if (similar[normalizedGenre]) {
    return similar[normalizedGenre]
  }
  
  // Ищем частичное совпадение
  for (const [key, genres] of Object.entries(similar)) {
    if (normalizedGenre.includes(key) || key.includes(normalizedGenre)) {
      return genres
    }
  }
  
  // Возвращаем пустой массив если не найдено
  return []
}

/**
 * Получить топ треков артиста
 */
export async function getTopSongs(artistName: string, size: number = 50): Promise<SubsonicSong[]> {
  try {
    const response = await httpClient<{ topSongs?: { song: SubsonicSong[] } }>('getTopSongs', {
      query: { artist: artistName, count: size },
    })
    return response?.data?.topSongs?.song || []
  } catch (error) {
    console.error('Failed to get top songs:', error)
    return []
  }
}

/**
 * Поиск по серверу (artist, album, song)
 */
export interface Search3Result {
  artists?: SubsonicArtist[]
  albums?: any[]
  songs?: SubsonicSong[]
}

export async function search3(
  query: string,
  options: {
    artistCount?: number
    artistOffset?: number
    albumCount?: number
    albumOffset?: number
    songCount?: number
    songOffset?: number
  } = {}
): Promise<Search3Result> {
  try {
    console.log('[search3] Searching for:', query, 'with options:', options)
    const response = await httpClient<{ searchResult3?: {
      artist?: SubsonicArtist[]
      album?: any[]
      song?: SubsonicSong[]
    } }>('search3', {
      query: {
        query,
        artistCount: options.artistCount || 20,
        artistOffset: options.artistOffset || 0,
        albumCount: options.albumCount || 0,
        albumOffset: options.albumOffset || 0,
        songCount: options.songCount || 0,
        songOffset: options.songOffset || 0,
      },
    })
    console.log('[search3] Response:', response?.data?.searchResult3)
    const result = response?.data?.searchResult3
    return {
      artists: result?.artist || [],
      albums: result?.album || [],
      songs: result?.song || [],
    }
  } catch (error) {
    console.error('Failed to search:', error)
    return {}
  }
}

/**
 * Получить информацию об артисте (с похожими)
 */
export async function getArtistInfo2(
  artistId: string,
  count: number = 10
): Promise<{ id: string; name: string; similarArtists?: SubsonicArtist[] } | null> {
  try {
    const response = await httpClient<{ artistInfo2?: {
      id: string
      name: string
      similarArtist?: SubsonicArtist[]
    } }>('getArtistInfo2', {
      query: { id: artistId, count },
    })
    const info = response?.data?.artistInfo2
    if (!info) return null
    return {
      ...info,
      similarArtists: info.similarArtist || [],
    }
  } catch (error) {
    console.error('Failed to get artist info:', error)
    return null
  }
}

/**
 * Получить похожие треки
 */
export async function getSimilarSongs(songId: string, size: number = 50): Promise<SubsonicSong[]> {
  try {
    const response = await httpClient<{ similarSongs?: { song: SubsonicSong[] } }>('getSimilarSongs', {
      query: { id: songId, count: size },
    })
    return response?.data?.similarSongs?.song || []
  } catch (error) {
    console.error('Failed to fetch similar songs:', error)
    return []
  }
}
