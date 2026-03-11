/**
 * ML Enrichment Service - Импорт жанров артистов из Яндекс.Музыки
 * 
 * Работает по принципу YandexStation-master:
 * 1. Берём артистов из Navidrome
 * 2. Ищем в Яндекс.Музыке
 * 3. Получаем жанры
 * 4. Добавляем в ML профиль
 */

import { yandexMusicService } from '@/service/yandex-music-api'
import { useMLStore } from '@/store/ml.store'
import { useYandexMusicStore } from '@/store/yandex-music.store'
import { subsonic } from '@/service/subsonic'
import { toast } from 'react-toastify'

class MLEnrichmentService {
  /**
   * Импорт жанров артистов из Яндекс.Музыки
   */
  async importArtistGenresFromYandex(limit: number = 100): Promise<{
    artistsScanned: number
    artistsFound: number
    genresDiscovered: string[]
  }> {
    const { settings } = useYandexMusicStore.getState()
    
    if (!settings.yandexMusicEnabled || !settings.yandexMusicToken) {
      toast('❌ Яндекс.Музыка не подключена', { type: 'error' })
      return { artistsScanned: 0, artistsFound: 0, genresDiscovered: [] }
    }

    try {
      yandexMusicService.initialize(settings.yandexMusicToken)

      toast('🔄 Сканирование артистов в Яндекс.Музыке...', { type: 'info' })

      // Получаем всех артистов из Navidrome
      const { getArtists } = await import('@/service/subsonic-api')
      const allArtists = await getArtists()
      
      const artistsToScan = allArtists.slice(0, limit)
      const genresDiscovered = new Set<string>()
      const { getProfile } = useMLStore.getState()
      const profile = getProfile()

      let artistsFound = 0

      for (const artist of artistsToScan) {
        try {
          // Ищем артиста в Яндекс
          const yandexArtists = await yandexMusicService.searchArtists(artist.name, 1)
          
          if (yandexArtists && yandexArtists.length > 0) {
            const yandexArtist = yandexArtists[0]
            
            // Получаем информацию об артисте (жанры)
            const artistInfo = await yandexMusicService.getArtistInfo(yandexArtist.id)
            
            if (artistInfo && artistInfo.genres && artistInfo.genres.length > 0) {
              artistsFound++
              
              // Добавляем жанры в ML профиль
              artistInfo.genres.forEach(genre => {
                genresDiscovered.add(genre)
                profile.preferredGenres[genre] = (profile.preferredGenres[genre] || 0) + 1
              })
              
              console.log('[ML Enrichment] Found artist:', artist.name, {
                genres: artistInfo.genres,
              })
            }
          }
        } catch (error) {
          console.warn('[ML Enrichment] Failed to scan artist:', artist.name, error)
        }
      }

      // Сохраняем обновлённый профиль через Zustand
      useMLStore.setState({ profile })

      const genresArray = Array.from(genresDiscovered)
      toast(`✅ Отсканировано ${artistsToScan.length} артистов, найдено ${artistsFound}, обнаружено ${genresArray.length} жанров`, { type: 'success' })

      return { 
        artistsScanned: artistsToScan.length, 
        artistsFound, 
        genresDiscovered: genresArray 
      }
    } catch (error) {
      console.error('[ML Enrichment] Error:', error)
      toast('❌ Ошибка: ' + (error as Error).message, { type: 'error' })
      return { artistsScanned: 0, artistsFound: 0, genresDiscovered: [] }
    }
  }

  /**
   * Получить похожих артистов для рекомендаций
   */
  async getSimilarArtistsForRecommendations(artistId: string, limit: number = 10): Promise<string[]> {
    const { settings } = useYandexMusicStore.getState()
    
    if (!settings.yandexMusicEnabled || !settings.yandexMusicToken) {
      return []
    }

    try {
      yandexMusicService.initialize(settings.yandexMusicToken)

      // Получаем информацию об артисте из Navidrome
      const artist = await subsonic.artists.getOne(artistId)
      
      if (!artist) {
        return []
      }

      // Ищем артиста в Яндекс
      const yandexArtists = await yandexMusicService.searchArtists(artist.name, 1)
      
      if (!yandexArtists || yandexArtists.length === 0) {
        return []
      }

      // Получаем похожих артистов
      const similarArtists = await yandexMusicService.getSimilarArtists(yandexArtists[0].id, limit)
      
      return similarArtists.map(a => a.name)
    } catch (error) {
      console.warn('[ML Enrichment] Failed to get similar artists:', error)
      return []
    }
  }
}

// Синглтон
export const mlEnrichmentService = new MLEnrichmentService()
