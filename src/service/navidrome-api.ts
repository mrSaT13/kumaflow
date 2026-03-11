// KumaFlow Navidrome API client
// Использует Navidrome REST API (не Subsonic API!)

interface NavidromeApiClientArgs {
  serverUrl?: string
  token?: string
}

async function ndApiClient<T>(
  endpoint: string,
  args: NavidromeApiClientArgs,
  options?: RequestInit
): Promise<T> {
  const { serverUrl, token } = args
  
  if (!serverUrl) {
    throw new Error('Server URL is required')
  }
  
  // Убираем лишний слэш в начале endpoint
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  const url = `${serverUrl}/api/${cleanEndpoint}`
  
  console.log('Navidrome API Request:', url)
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'x-nd-authorization': `Bearer ${token}` }),
      ...options?.headers,
    },
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Navidrome API Error:', response.status, errorText.substring(0, 200))
    throw new Error(`Navidrome API error: ${response.status}`)
  }
  
  return await response.json()
}

// Types
export interface NavidromeGenre {
  id: string
  name: string
  songCount: number
  albumCount: number
}

export interface NavidromeArtist {
  id: string
  name: string
  songCount: number
  albumCount: number
  coverArt?: string
  musicBrainzId?: string
}

export interface NavidromeSong {
  id: string
  title: string
  artist: string
  artistId: string
  album: string
  albumId: string
  genre: string
  duration: number
  playCount: number
  starred?: string
  rating?: number
  coverArt?: string
}

export interface NavidromeArtistInfo {
  id: string
  name: string
  biography?: string
  musicBrainzId?: string
  lastFmUrl?: string
  similarArtist?: NavidromeArtist[]
}

// API Functions

/**
 * Получить все жанры
 */
export async function getGenres(serverUrl: string, token: string): Promise<NavidromeGenre[]> {
  try {
    const response = await ndApiClient<{ items: NavidromeGenre[] }>('genre', { serverUrl, token })
    return response.items || []
  } catch (error) {
    console.error('Failed to fetch genres:', error)
    return []
  }
}

/**
 * Получить всех артистов
 */
export async function getArtists(serverUrl: string, token: string): Promise<NavidromeArtist[]> {
  try {
    const response = await ndApiClient<{ items: NavidromeArtist[] }>('artist', { serverUrl, token })
    return response.items || []
  } catch (error) {
    console.error('Failed to fetch artists:', error)
    return []
  }
}

/**
 * Получить информацию об артисте (включая похожих)
 */
export async function getArtistInfo(
  serverUrl: string,
  token: string,
  artistId: string
): Promise<NavidromeArtistInfo | null> {
  try {
    const response = await ndApiClient<NavidromeArtistInfo>(`/artist/${artistId}`, { serverUrl, token })
    return response || null
  } catch (error) {
    console.error('Failed to fetch artist info:', error)
    return null
  }
}

/**
 * Получить лайкнутые треки (через Subsonic API)
 */
export async function getStarredSongs(serverUrl: string, token: string): Promise<NavidromeSong[]> {
  try {
    // Используем Subsonic API для совместимости
    const url = `${serverUrl}/rest/getStarred2?v=1.16.0&c=KumaFlow&f=json`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch starred songs: ${response.status}`)
    }
    
    const data = await response.json()
    return data.subsonic?.starred2?.song || []
  } catch (error) {
    console.error('Failed to fetch starred songs:', error)
    return []
  }
}

/**
 * Получить случайные треки
 */
export async function getRandomSongs(
  serverUrl: string,
  token: string,
  size: number = 50
): Promise<NavidromeSong[]> {
  try {
    const response = await ndApiClient<{ items: NavidromeSong[] }>(`/song?_limit=${size}&_filters=random`, { serverUrl, token })
    return response.items || []
  } catch (error) {
    console.error('Failed to fetch random songs:', error)
    return []
  }
}

/**
 * Получить треки по жанру
 */
export async function getSongsByGenre(
  serverUrl: string,
  token: string,
  genre: string,
  size: number = 50
): Promise<NavidromeSong[]> {
  try {
    const response = await ndApiClient<{ items: NavidromeSong[] }>(
      `/song?_limit=${size}&genre=${encodeURIComponent(genre)}`,
      { serverUrl, token }
    )
    return response.items || []
  } catch (error) {
    console.error('Failed to fetch songs by genre:', error)
    return []
  }
}

/**
 * Получить топ треков артиста
 */
export async function getTopSongs(
  serverUrl: string,
  token: string,
  artistId: string,
  size: number = 50
): Promise<NavidromeSong[]> {
  try {
    const response = await ndApiClient<{ items: NavidromeSong[] }>(
      `/song?_limit=${size}&artist_id=${artistId}&_sort=playCount:desc`,
      { serverUrl, token }
    )
    return response.items || []
  } catch (error) {
    console.error('Failed to fetch top songs:', error)
    return []
  }
}
