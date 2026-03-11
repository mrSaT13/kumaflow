/**
 * Хук для получения изображения артиста из Apple Music
 * Используется как FALLBACK если нет обложки в Navidrome
 */

import { useEffect, useState } from 'react'
import { appleMusicService } from '@/service/apple-music-api'
import { useExternalApi } from '@/store/external-api.store'

interface UseAppleMusicArtistImage {
  imageUrl: string | null
  isLoading: boolean
  hasError: boolean
}

export function useAppleMusicArtistImage(
  artistName: string
): UseAppleMusicArtistImage {
  const { settings } = useExternalApi()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // Не загружаем если нет имени артиста
    if (!artistName) {
      return
    }

    // Загружаем только если Apple Music включён
    if (!settings.appleMusicEnabled) {
      console.log('[AppleMusicArtistImage] Disabled')
      return
    }

    async function loadImage() {
      setIsLoading(true)
      setHasError(false)

      try {
        console.log('[AppleMusicArtistImage] Loading for:', artistName)
        const artists = await appleMusicService.searchArtist(artistName, 1)
        console.log('[AppleMusicArtistImage] Result:', artists)

        if (artists.length > 0 && artists[0].artistLinkUrl) {
          // Получаем изображение в высоком качестве из artistLinkUrl
          // Формат: https://music.apple.com/ru/artist/...
          // Изображение берётся из metadata
          const highResUrl = artists[0].artistLinkUrl
          
          console.log('[AppleMusicArtistImage] Found image:', highResUrl)
          setImageUrl(highResUrl)
        } else {
          console.warn('[AppleMusicArtistImage] No image found')
          setHasError(true)
        }
      } catch (error) {
        console.warn('[AppleMusicArtistImage] Error:', error)
        setHasError(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadImage()
  }, [artistName, settings.appleMusicEnabled])

  return { imageUrl, isLoading, hasError }
}
