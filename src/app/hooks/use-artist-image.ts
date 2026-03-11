/**
 * Хук для получения изображения артиста
 * Fallback цепочка: Navidrome → Fanart.tv → Apple Music → Yandex Music → Last.fm
 */

import { useEffect, useState } from 'react'
import { appleMusicService } from '@/service/apple-music-api'
import { yandexMusicService } from '@/service/yandex-music-api'
import { lastFmService } from '@/service/lastfm-api'
import { fanartService } from '@/service/fanart-api'
import { useExternalApi } from '@/store/external-api.store'
import { useYandexMusic } from '@/store/yandex-music.store'

interface UseArtistImage {
  imageUrl: string | null
  isLoading: boolean
  hasError: boolean
  source: 'appleMusic' | 'yandexMusic' | 'lastFm' | 'navidrome' | null
}

export function useArtistImage(
  artistName: string,
  navidromeCoverArtId?: string
): UseArtistImage {
  const { settings: externalSettings } = useExternalApi()
  const { settings: yandexSettings } = useYandexMusic()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [source, setSource] = useState<UseArtistImage['source']>(null)

  useEffect(() => {
    // Не загружаем если нет имени артиста
    if (!artistName) {
      return
    }

    // Получаем приоритет из localStorage
    const savedPriority = localStorage.getItem('coverArtPriority')
    const priority = savedPriority ? JSON.parse(savedPriority) : ['navidrome', 'fanart', 'appleMusic', 'yandex', 'lastfm']

    async function loadImage() {
      setIsLoading(true)
      setHasError(false)
      setSource(null)

      // Проходим по приоритету
      for (const sourceId of priority) {
        // 1. Navidrome (приоритет #1 - локальная библиотека)
        if (sourceId === 'navidrome' && navidromeCoverArtId) {
          console.log('[ArtistImage] Using Navidrome cover (priority #1):', navidromeCoverArtId)
          setImageUrl(null)
          setSource('navidrome')
          setIsLoading(false)
          return
        }

        // 2. Fanart.tv (приоритет #2 - HD изображения)
        if (sourceId === 'fanart' && externalSettings.fanartEnabled && fanartService.isInitialized()) {
          try {
            console.log('[ArtistImage] Trying Fanart.tv (priority #2) for:', artistName)
            const fanartImages = await fanartService.getArtistImages(artistName)
            
            if (fanartImages && fanartImages.backgrounds && fanartImages.backgrounds.length > 0) {
              const highResUrl = fanartImages.backgrounds[0]
              console.log('[ArtistImage] Fanart.tv found:', highResUrl)
              setImageUrl(highResUrl)
              setSource('fanart')
              setIsLoading(false)
              return
            }
          } catch (error) {
            console.warn('[ArtistImage] Fanart.tv error:', error)
          }
        }

        // 3. Apple Music (приоритет #3)
        if (sourceId === 'appleMusic' && externalSettings.appleMusicEnabled) {
          try {
            console.log('[ArtistImage] Trying Apple Music (priority #3) for:', artistName)
            const artists = await appleMusicService.searchArtist(artistName, 1)

            if (artists && artists.length > 0 && artists[0].artistLinkUrl) {
              const highResUrl = artists[0].artistLinkUrl
              console.log('[ArtistImage] Apple Music found:', highResUrl)
              setImageUrl(highResUrl)
              setSource('appleMusic')
              setIsLoading(false)
              return
            }
          } catch (error) {
            console.warn('[ArtistImage] Apple Music error:', error)
          }
        }

        // 4. Yandex Music (приоритет #4)
        if (sourceId === 'yandex' && yandexSettings?.yandexMusicEnabled && yandexSettings?.yandexMusicToken) {
          try {
            console.log('[ArtistImage] Trying Yandex Music (priority #4) for:', artistName)
            yandexMusicService.initialize(yandexSettings.yandexMusicToken)
            const artists = await yandexMusicService.searchArtists(artistName, 1)

            if (artists && artists.length > 0 && artists[0].cover?.uri) {
              const highResUrl = yandexMusicService.getArtistImageUrl(artists[0].id)
              console.log('[ArtistImage] Yandex Music found:', highResUrl)
              setImageUrl(highResUrl)
              setSource('yandexMusic')
              setIsLoading(false)
              return
            }
          } catch (error) {
            console.warn('[ArtistImage] Yandex Music error:', error)
          }
        }

        // 5. Last.fm (приоритет #5 - последний fallback)
        if (sourceId === 'lastfm' && externalSettings.lastFmEnabled && lastFmService.isInitialized()) {
          try {
            console.log('[ArtistImage] Trying Last.fm (priority #5) for:', artistName)
            const artistInfo = await lastFmService.getArtistInfo(artistName)

            if (artistInfo && artistInfo.image) {
              console.log('[ArtistImage] Last.fm found:', artistInfo.image)
              setImageUrl(artistInfo.image)
              setSource('lastFm')
              setIsLoading(false)
              return
            }
          } catch (error) {
            console.warn('[ArtistImage] Last.fm error:', error)
          }
        }
      }

      // Ничего не найдено
      console.warn('[ArtistImage] No image found for:', artistName)
      setHasError(true)
      setIsLoading(false)
    }

    loadImage()
  }, [artistName, navidromeCoverArtId, externalSettings.appleMusicEnabled, externalSettings.fanartEnabled, externalSettings.lastFmEnabled, yandexSettings?.yandexMusicEnabled, yandexSettings?.yandexMusicToken])

  return { imageUrl, isLoading, hasError, source }
}
