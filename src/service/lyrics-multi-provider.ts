/**
 * Multi-Provider Lyrics Service
 * Провайдеры: LRCLIB, Genius, NetEase (163.com), SimpMusic
 * Вдохновлено Feishin lyrics implementation
 */

interface LyricsResult {
  syncedLyrics?: string
  plainLyrics?: string
  source: 'lrclib' | 'genius' | 'netease' | 'simpmusic'
}

interface SearchParams {
  artist: string
  title: string
  album?: string
  duration?: number
}

// ==================== LRCLIB ====================

async function searchLRCLib(params: SearchParams): Promise<LyricsResult | null> {
  try {
    const searchParams = new URLSearchParams({
      artist_name: params.artist,
      track_name: params.title,
    })

    if (params.duration) searchParams.append('duration', params.duration.toString())
    if (params.album) searchParams.append('album_name', params.album)

    const url = `https://lrclib.net/api/get?${searchParams.toString()}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KumaFlow/1.0.0',
      },
    })

    if (!response.ok) return null

    const data = await response.json()

    return {
      syncedLyrics: data.syncedLyrics || undefined,
      plainLyrics: data.plainLyrics || undefined,
      source: 'lrclib',
    }
  } catch (error) {
    console.warn('[Lyrics] LRCLIB error:', error)
    return null
  }
}

// ==================== GENIUS ====================

async function searchGenius(params: SearchParams): Promise<LyricsResult | null> {
  try {
    // Genius не имеет официального публичного API для lyrics без ключа
    // Используем поиск через веб-скрейпинг
    const query = `${params.artist} ${params.title} lyrics`
    const searchUrl = `https://genius.com/api/search/song?q=${encodeURIComponent(query)}&per_page=5`

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) return null

    const data = await response.json()

    if (!data.response?.hits?.length) return null

    // Берём первый результат
    const hit = data.response.hits[0].result
    const songUrl = hit.url

    if (!songUrl) return null

    // Для получения текста нужно парсить страницу (ограничено CORS)
    // Возвращаем URL для отображения в UI
    return {
      plainLyrics: undefined,
      syncedLyrics: undefined,
      source: 'genius',
    } as any
  } catch (error) {
    console.warn('[Lyrics] Genius error:', error)
    return null
  }
}

export function getGeniusSearchUrl(artist: string, title: string): string {
  return `https://genius.com/search?q=${encodeURIComponent(`${artist} ${title} lyrics`)}`
}

// ==================== NETEASE (163.com) ====================

async function searchNetEase(params: SearchParams): Promise<LyricsResult | null> {
  try {
    // Ищем песню через NetEase API
    const searchUrl = `https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(
      `${params.artist} ${params.title}`
    )}&type=1&limit=5&offset=0`

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Referer': 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!searchResponse.ok) return null

    const searchData = await searchResponse.json()

    if (!searchData.result?.songs?.length) return null

    const songId = searchData.result.songs[0].id

    // Получаем lyrics
    const lyricsUrl = `https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`

    const lyricsResponse = await fetch(lyricsUrl, {
      headers: {
        'Referer': 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!lyricsResponse.ok) return null

    const lyricsData = await lyricsResponse.json()

    if (!lyricsData.lrc?.lyric) return null

    const lrcText = lyricsData.lrc.lyric
    const isSynced = lrcText.includes('[') && lrcText.includes(']')

    return {
      syncedLyrics: isSynced ? lrcText : undefined,
      plainLyrics: !isSynced ? lrcText : undefined,
      source: 'netease',
    }
  } catch (error) {
    console.warn('[Lyrics] NetEase error:', error)
    return null
  }
}

// ==================== SIMPMUSIC ====================

async function searchSimpMusic(params: SearchParams): Promise<LyricsResult | null> {
  try {
    // SimpMusic — дополнительный провайдер
    // Используем аналогичный подход
    const response = await fetch(
      `https://api.simpmusic.net/api/lyrics?artist=${encodeURIComponent(params.artist)}&title=${encodeURIComponent(params.title)}`,
      {
        headers: {
          'User-Agent': 'KumaFlow/1.0.0',
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()

    if (!data?.lyrics) return null

    return {
      syncedLyrics: data.synced || undefined,
      plainLyrics: data.plain || data.lyrics || undefined,
      source: 'simpmusic',
    }
  } catch (error) {
    console.warn('[Lyrics] SimpMusic error:', error)
    return null
  }
}

// ==================== MAIN SEARCH ====================

/**
 * Поиск lyrics по всем провайдерам с приоритетом:
 * 1. LRCLIB (лучший для синхронизированных)
 * 2. NetEase (хорош для азиатской музыки)
 * 3. SimpMusic (fallback)
 * 4. Genius (только ссылка для поиска)
 */
export async function searchLyrics(
  params: SearchParams,
  options?: { preferSynced?: boolean; sources?: string[] }
): Promise<LyricsResult | null> {
  const preferSynced = options?.preferSynced ?? false
  const enabledSources = options?.sources ?? ['lrclib', 'netease', 'simpmusic', 'genius']

  console.log('[Lyrics] Searching for:', params.artist, '-', params.title)

  // 1. LRCLIB — приоритет для синхронизированных lyrics
  if (enabledSources.includes('lrclib')) {
    console.log('[Lyrics] Trying LRCLIB...')
    const lrclibResult = await searchLRCLib(params)
    if (lrclibResult && (preferSynced ? lrclibResult.syncedLyrics : lrclibResult.plainLyrics)) {
      console.log('[Lyrics] Found on LRCLIB')
      return lrclibResult
    }
  }

  // 2. NetEase — хорошо для азиатской музыки
  if (enabledSources.includes('netease')) {
    console.log('[Lyrics] Trying NetEase...')
    const neteaseResult = await searchNetEase(params)
    if (neteaseResult) {
      console.log('[Lyrics] Found on NetEase')
      return neteaseResult
    }
  }

  // 3. SimpMusic — fallback
  if (enabledSources.includes('simpmusic')) {
    console.log('[Lyrics] Trying SimpMusic...')
    const simpResult = await searchSimpMusic(params)
    if (simpResult) {
      console.log('[Lyrics] Found on SimpMusic')
      return simpResult
    }
  }

  // 4. Genius — только ссылка
  if (enabledSources.includes('genius')) {
    console.log('[Lyrics] No lyrics found, suggesting Genius search')
    return {
      source: 'genius',
      plainLyrics: undefined,
      syncedLyrics: undefined,
    }
  }

  console.log('[Lyrics] Not found in any provider')
  return null
}

// ==================== EXPORTS ====================

export const lyricsMultiProvider = {
  search: searchLyrics,
  lrclib: searchLRCLib,
  netease: searchNetEase,
  simpmusic: searchSimpMusic,
  genius: {
    searchUrl: getGeniusSearchUrl,
  },
}
