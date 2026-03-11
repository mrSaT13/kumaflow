import { useQuery } from '@tanstack/react-query'
import { subsonic } from '@/service/subsonic'
import { queryKeys } from '@/utils/queryKeys'
import { appleMusicService, translateGenre } from '@/service/apple-music-api'
import { lastFmService } from '@/service/lastfm-api'
import { useExternalApi } from '@/store/external-api.store'

export interface ArtistBiography {
  biography: string
  genres: string[]
  imageUrl?: string
  source: 'appleMusic' | 'musicBrainz' | 'lastFm'
}

/**
 * Получить биографию артиста с приоритетом Apple Music (с переводом на русский)
 * Порядок:
 * 1. Apple Music (с переводом жанров на русский)
 * 2. MusicBrainz (через Navidrome, на английском)
 * 3. Last.fm (fallback)
 */
async function fetchArtistBiography(artistName: string): Promise<ArtistBiography | null> {
  const { settings } = useExternalApi.getState()
  
  // 1. Пробуем Apple Music (с переводом на русский)
  if (settings.appleMusicEnabled) {
    try {
      console.log('[ArtistBio] Trying Apple Music for:', artistName)
      const artists = await appleMusicService.searchArtist(artistName, 1)
      
      if (artists && artists.length > 0) {
        const appleArtist = artists[0]
        
        // Получаем жанры с переводом на русский
        const genres = appleArtist.primaryGenreName 
          ? [translateGenre(appleArtist.primaryGenreName, 'ru')]
          : []
        
        console.log('[ArtistBio] Apple Music found:', {
          name: appleArtist.artistName,
          genres,
        })
        
        return {
          biography: '', // Apple Music не предоставляет биографию в search API
          genres,
          imageUrl: appleArtist.artistLinkUrl,
          source: 'appleMusic',
        }
      }
    } catch (error) {
      console.warn('[ArtistBio] Apple Music error:', error)
    }
  }
  
  // 2. Пробуем MusicBrainz (через Navidrome)
  try {
    console.log('[ArtistBio] Trying MusicBrainz for:', artistName)
    const artistInfo = await subsonic.artists.getInfo(artistName)
    
    if (artistInfo && (artistInfo.biography || artistInfo.musicBrainzId)) {
      console.log('[ArtistBio] MusicBrainz found:', {
        biography: artistInfo.biography?.substring(0, 50) + '...',
      })
      
      return {
        biography: artistInfo.biography || '',
        genres: [],
        imageUrl: undefined,
        source: 'musicBrainz',
      }
    }
  } catch (error) {
    console.warn('[ArtistBio] MusicBrainz error:', error)
  }
  
  // 3. Пробуем Last.fm (fallback)
  if (settings.lastFmEnabled && lastFmService.isInitialized()) {
    try {
      console.log('[ArtistBio] Trying Last.fm for:', artistName)
      const lastFmInfo = await lastFmService.getArtistInfo(artistName, 'ru')
      
      if (lastFmInfo && lastFmInfo.bio) {
        console.log('[ArtistBio] Last.fm found:', {
          bio: lastFmInfo.bio.substring(0, 50) + '...',
        })
        
        return {
          biography: lastFmInfo.bio,
          genres: lastFmInfo.tags?.map(t => translateGenre(t.name, 'ru')) || [],
          imageUrl: lastFmInfo.image,
          source: 'lastFm',
        }
      }
    } catch (error) {
      console.warn('[ArtistBio] Last.fm error:', error)
    }
  }
  
  console.log('[ArtistBio] No biography found')
  return null
}

export const useGetArtist = (artistId: string) => {
  return useQuery({
    queryKey: [queryKeys.artist.single, artistId],
    queryFn: () => subsonic.artists.getOne(artistId),
    enabled: !!artistId,
  })
}

export const useGetArtistInfo = (artistId: string) => {
  return useQuery({
    queryKey: [queryKeys.artist.info, artistId],
    queryFn: () => subsonic.artists.getInfo(artistId),
    enabled: !!artistId,
  })
}

/**
 * Хук для получения биографии артиста с переводом
 */
export const useArtistBiography = (artistName: string) => {
  return useQuery<ArtistBiography | null>({
    queryKey: [queryKeys.artist.biography, artistName],
    queryFn: () => fetchArtistBiography(artistName),
    enabled: !!artistName,
    staleTime: 24 * 60 * 60 * 1000, // 24 часа
  })
}

export const useGetTopSongs = (artistName?: string) => {
  return useQuery({
    queryKey: [queryKeys.artist.topSongs, artistName],
    queryFn: () => subsonic.songs.getTopSongs(artistName ?? ''),
    enabled: !!artistName,
  })
}
