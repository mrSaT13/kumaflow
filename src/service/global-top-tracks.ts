/**
 * Global Top Tracks - "Что слушают другие"
 * 
 * УПРОЩЁННАЯ ВЕРСИЯ: Просто берём топ треков с ТЕКУЩЕГО сервера
 */

import { subsonic } from '@/service/subsonic'
import { fetchWithCorsProxy } from '@/utils/cors-proxy'
import type { ISong } from '@/types/responses/song'

export interface GlobalTrack {
  song: ISong
  playCount: number
  rank?: number
}

export interface GlobalTopTracksResult {
  tracks: GlobalTrack[]
  total: number
  lastUpdated: number
}

/**
 * Получить глобальные топ треки с текущего Navidrome сервера
 */
export async function getGlobalTopTracks(limit = 50): Promise<GlobalTopTracksResult> {
  console.log('[GlobalTop] 🌍 Fetching global top tracks...')
  
  try {
    // Используем search3 для поиска популярных треков
    const url = `${subsonic.baseUrl}/rest/search3?v=${subsonic.version}&c=${subsonic.client}&f=json&songCount=${limit}`
    
    const response = await fetchWithCorsProxy(url, {
      headers: subsonic.headers,
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data['subsonic-response']?.status === 'ok' && data['subsonic-response']?.searchResult3) {
      const songs = data['subsonic-response'].searchResult3.song || []
      
      console.log(`[GlobalTop] ✅ Got ${songs.length} songs`)
      
      return {
        tracks: songs.map((songData: any, index: number) => ({
          song: {
            id: songData.id,
            title: songData.title,
            artist: songData.artist,
            artistId: songData.artistId,
            album: songData.album,
            albumId: songData.albumId,
            duration: songData.duration || 0,
            genre: songData.genre,
            coverArtUrl: songData.coverArt 
              ? `${subsonic.baseUrl}/rest/getCoverArt?id=${songData.coverArt}&v=${subsonic.version}&c=${subsonic.client}&f=json`
              : undefined,
            playCount: songData.playCount || 0,
            isLocal: true,
            year: songData.year,
          } as ISong,
          playCount: songData.playCount || 0,
          rank: index + 1,
        })),
        total: songs.length,
        lastUpdated: Date.now(),
      }
    }
    
    return { tracks: [], total: 0, lastUpdated: Date.now() }
  } catch (error) {
    console.error('[GlobalTop] ❌ Error:', error)
    return { tracks: [], total: 0, lastUpdated: Date.now() }
  }
}

/**
 * Кэширование (на 30 минут)
 */
let cachedResult: GlobalTopTracksResult | null = null
let cacheTime = 0

export async function getCachedGlobalTopTracks(
  limit = 50,
  forceRefresh = false
): Promise<GlobalTopTracksResult> {
  const now = Date.now()
  
  if (cachedResult && (now - cacheTime) < 30 * 60 * 1000 && !forceRefresh) {
    console.log('[GlobalTop] 📦 Returning cached result')
    return cachedResult
  }
  
  const result = await getGlobalTopTracks(limit)
  
  if (result.tracks.length > 0) {
    cachedResult = result
    cacheTime = now
  }
  
  return result
}

export function clearGlobalTopCache() {
  cachedResult = null
  cacheTime = 0
}
