/**
 * Сервис обогащения метаданных
 * 
 * Использует Apple Music и Discogs для улучшения метаданных:
 * - Обложки альбомов/треков
 * - Жанры
 * - Даты релизов
 * - Лейблы
 */

import { appleMusicService } from '@/service/apple-music-api'
import { discogsService } from '@/service/discogs-api'
import { useExternalApi } from '@/store/external-api.store'

export interface EnrichedMetadata {
  coverArtUrl?: string
  genre?: string
  releaseDate?: string
  year?: number
  label?: string
  discogsId?: number
}

/**
 * Обогатить метаданные трека
 */
export async function enrichTrackMetadata(
  artist: string,
  title: string,
  album?: string
): Promise<EnrichedMetadata | null> {
  const { settings } = useExternalApi.getState()
  
  // 1. Пробуем Apple Music (быстрее, больше покрытие)
  if (settings.appleMusicEnabled) {
    try {
      const query = album ? `${artist} ${album} ${title}` : `${artist} ${title}`
      const iTunesTracks = await appleMusicService.searchTracks(query, 5)
      
      if (iTunesTracks.length > 0) {
        // Ищем наилучшее совпадение
        const bestMatch = iTunesTracks.find(t => 
          t.artistName.toLowerCase().includes(artist.toLowerCase()) &&
          t.trackName.toLowerCase().includes(title.toLowerCase())
        ) || iTunesTracks[0]
        
        return {
          coverArtUrl: bestMatch.artworkUrl100?.replace('100x100bb', '1000x1000bb'),
          genre: bestMatch.primaryGenreName,
          releaseDate: bestMatch.releaseDate,
        }
      }
    } catch (error) {
      console.warn('[MetadataEnrichment] Apple Music error:', error)
    }
  }
  
  // 2. Если Apple Music не помог — ничего не нашли
  return null
}

/**
 * Обогатить метаданные альбома
 */
export async function enrichAlbumMetadata(
  artist: string,
  albumTitle: string,
  year?: number
): Promise<EnrichedMetadata | null> {
  const { settings } = useExternalApi.getState()
  const result: EnrichedMetadata = {}
  
  // 1. Discogs — точнее для редких релизов
  if (settings.discogsEnabled && discogsService.isInitialized()) {
    try {
      const discogsReleases = await discogsService.searchReleases(
        `${artist} ${albumTitle}`,
        5
      )
      
      if (discogsReleases.length > 0) {
        const bestMatch = discogsReleases.find(r => 
          r.title.toLowerCase().includes(albumTitle.toLowerCase())
        ) || discogsReleases[0]
        
        result.discogsId = bestMatch.id
        result.year = bestMatch.year
        result.label = bestMatch.labels?.[0]?.name
        result.genre = bestMatch.genres?.[0]
      }
    } catch (error) {
      console.warn('[MetadataEnrichment] Discogs error:', error)
    }
  }
  
  // 2. Apple Music — для обложки (лучшее качество)
  if (settings.appleMusicEnabled) {
    try {
      const iTunesAlbums = await appleMusicService.searchAlbums(
        `${artist} ${albumTitle}`,
        5
      )
      
      if (iTunesAlbums.length > 0) {
        const bestMatch = iTunesAlbums.find(a => 
          a.artistName.toLowerCase().includes(artist.toLowerCase()) &&
          a.collectionName.toLowerCase().includes(albumTitle.toLowerCase())
        ) || iTunesAlbums[0]
        
        result.coverArtUrl = bestMatch.artworkUrl100?.replace('100x100bb', '1000x1000bb')
        
        if (!result.year && bestMatch.releaseDate) {
          result.year = new Date(bestMatch.releaseDate).getFullYear()
        }
        
        if (!result.genre && bestMatch.primaryGenreName) {
          result.genre = bestMatch.primaryGenreName
        }
      }
    } catch (error) {
      console.warn('[MetadataEnrichment] Apple Music error:', error)
    }
  }
  
  // Возвращаем если что-то нашли
  return Object.keys(result).length > 0 ? result : null
}

/**
 * Обогатить метаданные артиста
 */
export async function enrichArtistMetadata(
  artistName: string
): Promise<{ biography?: string; genres?: string[]; discogsId?: number } | null> {
  const { settings } = useExternalApi.getState()
  const result: { biography?: string; genres?: string[]; discogsId?: number } = {}
  
  // Discogs — биография и жанры
  if (settings.discogsEnabled && discogsService.isInitialized()) {
    try {
      const discogsArtists = await discogsService.searchArtist(artistName, 5)
      
      if (discogsArtists.length > 0) {
        const bestMatch = discogsArtists[0]
        result.discogsId = bestMatch.id
        result.biography = bestMatch.profile
      }
    } catch (error) {
      console.warn('[MetadataEnrichment] Discogs error:', error)
    }
  }
  
  return Object.keys(result).length > 0 ? result : null
}

/**
 * Получить все версии трека (каверы, ремиксы, live)
 */
export async function getTrackVersions(
  trackName: string,
  artistName?: string
): Promise<Array<{
  title: string
  artist: string
  album: string
  year?: string
  previewUrl?: string
  artworkUrl?: string
}>> {
  const { settings } = useExternalApi.getState()
  const versions: Array<any> = []
  
  if (settings.appleMusicEnabled) {
    try {
      const query = artistName ? `${artistName} ${trackName}` : trackName
      const iTunesTracks = await appleMusicService.searchTracks(query, 50)
      
      // Группируем по названию трека
      const uniqueVersions = new Map<string, any>()
      
      for (const track of iTunesTracks) {
        // Пропускаем оригинал (если есть artistName)
        if (artistName && track.artistName === artistName && track.trackName === trackName) {
          continue
        }
        
        const key = `${track.artistName}-${track.trackName}-${track.collectionName}`
        
        if (!uniqueVersions.has(key)) {
          uniqueVersions.set(key, {
            title: track.trackName,
            artist: track.artistName,
            album: track.collectionName,
            year: track.releaseDate ? new Date(track.releaseDate).getFullYear() : undefined,
            previewUrl: track.previewUrl,
            artworkUrl: track.artworkUrl100,
          })
        }
      }
      
      versions.push(...uniqueVersions.values())
    } catch (error) {
      console.warn('[MetadataEnrichment] Get versions error:', error)
    }
  }
  
  return versions
}

/**
 * Кэш для обогащённых метаданных
 */
const metadataCache = new Map<string, { data: EnrichedMetadata; expires: number }>()
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 дней

/**
 * Обогатить с кэшированием
 */
export async function enrichWithCache(
  type: 'track' | 'album' | 'artist',
  key: string,
  enrichFn: () => Promise<EnrichedMetadata | null>
): Promise<EnrichedMetadata | null> {
  // Проверка кэша
  const cached = metadataCache.get(key)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }
  
  // Обогащение
  const result = await enrichFn()
  
  if (result) {
    metadataCache.set(key, {
      data: result,
      expires: Date.now() + CACHE_TTL,
    })
  }
  
  return result
}
