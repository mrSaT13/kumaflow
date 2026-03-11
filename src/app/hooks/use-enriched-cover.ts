/**
 * Хук для обогащения обложек через Apple Music
 * 
 * Используется когда в Navidrome нет обложки
 */

import { useEffect, useState } from 'react'
import { enrichWithCache, enrichAlbumMetadata, enrichTrackMetadata } from '@/service/metadata-enrichment'

interface UseEnrichedCoverArt {
  coverArtUrl: string | null
  isLoading: boolean
  hasError: boolean
}

/**
 * Получить обложку для альбома
 */
export function useEnrichedAlbumCover(
  artist: string,
  albumTitle: string,
  existingCoverArtId?: string,
  year?: number
): UseEnrichedCoverArt {
  const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // Если уже есть обложка — не обогащаем
    if (existingCoverArtId) {
      setCoverArtUrl(null)
      return
    }

    // Если нет артиста или названия альбома — не обогащаем
    if (!artist || !albumTitle) {
      setCoverArtUrl(null)
      return
    }

    async function enrich() {
      setIsLoading(true)
      setHasError(false)

      try {
        const cacheKey = `album:${artist}:${albumTitle}`
        const result = await enrichWithCache(
          'album',
          cacheKey,
          () => enrichAlbumMetadata(artist, albumTitle, year)
        )

        if (result?.coverArtUrl) {
          setCoverArtUrl(result.coverArtUrl)
        }
      } catch (error) {
        console.warn('[useEnrichedAlbumCover] Error:', error)
        setHasError(true)
      } finally {
        setIsLoading(false)
      }
    }

    enrich()
  }, [artist, albumTitle, existingCoverArtId, year])

  return { coverArtUrl, isLoading, hasError }
}

/**
 * Получить обложку для трека
 */
export function useEnrichedTrackCover(
  artist: string,
  title: string,
  album?: string,
  existingCoverArtId?: string
): UseEnrichedCoverArt {
  const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // Если уже есть обложка — не обогащаем
    if (existingCoverArtId) {
      setCoverArtUrl(null)
      return
    }

    // Если нет артиста или названия трека — не обогащаем
    if (!artist || !title) {
      setCoverArtUrl(null)
      return
    }

    async function enrich() {
      setIsLoading(true)
      setHasError(false)

      try {
        const cacheKey = `track:${artist}:${title}`
        const result = await enrichWithCache(
          'track',
          cacheKey,
          () => enrichTrackMetadata(artist, title, album)
        )

        if (result?.coverArtUrl) {
          setCoverArtUrl(result.coverArtUrl)
        }
      } catch (error) {
        console.warn('[useEnrichedTrackCover] Error:', error)
        setHasError(true)
      } finally {
        setIsLoading(false)
      }
    }

    enrich()
  }, [artist, title, album, existingCoverArtId])

  return { coverArtUrl, isLoading, hasError }
}
