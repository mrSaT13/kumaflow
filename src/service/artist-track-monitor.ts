/**
 * Сервис отслеживания новых треков подписанных артистов
 *
 * Проверяет подписанных артистов через:
 * - Last.fm API (популярные треки)
 * - Apple Music API (новые релизы)
 *
 * Сравнивает с последним известным треком
 * Отправляет уведомление о новом треке
 */

import { useArtistSubscriptionsStore } from '@/store/artist-subscriptions.store'
import { lastFmService } from '@/service/lastfm-api'
import { appleMusicService } from '@/service/apple-music-api'
import { subsonic } from '@/service/subsonic'
import { toast } from 'react-toastify'
import { useExternalApiStore } from '@/store/external-api.store'
import { httpClient } from '@/api/httpClient'

interface NewTrackNotification {
  artistId: string
  artistName: string
  trackName: string
  trackId?: string
  detectedAt: number
  source: 'lastfm' | 'appleMusic'
}

class ArtistTrackMonitorService {
  private checkInterval: number = 6 * 60 * 60 * 1000 // 6 часов (консервативно для rate limit)
  private intervalId: NodeJS.Timeout | null = null
  private readonly MIN_CHECK_INTERVAL = 2 * 60 * 60 * 1000 // Минимум 2 часа

  /**
   * Запуск мониторинга
   */
  startMonitoring(): void {
    if (this.intervalId) {
      console.log('[ArtistTrackMonitor] Monitoring already running')
      return
    }

    console.log('[ArtistTrackMonitor] Starting monitoring...')
    this.checkForNewTracks() // Первая проверка сразу
    
    this.intervalId = setInterval(() => {
      this.checkForNewTracks()
    }, this.checkInterval)
  }

  /**
   * Остановка мониторинга
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[ArtistTrackMonitor] Monitoring stopped')
    }
  }

  /**
   * Проверка новых треков у всех подписанных артистов
   */
  async checkForNewTracks(): Promise<void> {
    const { subscriptions, updateLastCheck, notificationsEnabled } = useArtistSubscriptionsStore.getState()
    
    if (subscriptions.length === 0) {
      console.log('[ArtistTrackMonitor] Нет подписок')
      return
    }

    if (!notificationsEnabled) {
      console.log('[ArtistTrackMonitor] Уведомления отключены')
      return
    }

    if (!lastFmService.isInitialized()) {
      console.warn('[ArtistTrackMonitor] Last.fm не инициализирован')
      return
    }

    console.log(`[ArtistTrackMonitor] Проверка ${subscriptions.length} артистов...`)

    for (const subscription of subscriptions) {
      try {
        await this.checkArtist(subscription, updateLastCheck)
        
        // Rate limiting - ждём между запросами
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`[ArtistTrackMonitor] Error checking ${subscription.artistName}:`, error)
      }
    }

    console.log('[ArtistTrackMonitor] Проверка завершена')
  }

  /**
   * Проверка конкретного артиста по всем источникам
   */
  private async checkArtist(
    subscription: any,
    updateLastCheck: (artistId: string, trackId?: string, trackName?: string) => void
  ): Promise<void> {
    const { artistId, artistName, lastKnownTrackId } = subscription
    const { settings } = useExternalApiStore.getState()
    
    const newTracks: NewTrackNotification[] = []

    // 1. Last.fm — популярные треки
    if (settings.lastFmEnabled && lastFmService.isInitialized()) {
      try {
        const topTracks = await lastFmService.getArtistTopTracks(artistName, 10)

        if (topTracks.length > 0) {
          const currentTopTrack = topTracks[0]

          if (!lastKnownTrackId || currentTopTrack.mbid !== lastKnownTrackId) {
            if (lastKnownTrackId) {
              console.log(`[ArtistTrackMonitor] 🎵 Last.fm: ${artistName} - "${currentTopTrack.name}"`)
              const trackInLibrary = await this.findTrackInLibrary(currentTopTrack.name, artistName)

              newTracks.push({
                artistId,
                artistName,
                trackName: currentTopTrack.name,
                trackId: trackInLibrary?.id,
                detectedAt: Date.now(),
                source: 'lastfm',
              })
            }
            updateLastCheck(artistId, currentTopTrack.mbid, currentTopTrack.name)
          }
        }
      } catch (error) {
        console.warn(`[ArtistTrackMonitor] Last.fm error for ${artistName}:`, error)
      }
    }

    // 2. Apple Music — новые релизы
    if (settings.appleMusicEnabled) {
      try {
        const newAlbums = await appleMusicService.getNewReleases(artistName)

        for (const album of newAlbums.slice(0, 3)) { // Максимум 3 альбома
          console.log(`[ArtistTrackMonitor] 🍎 Apple Music: ${artistName} - "${album.collectionName}"`)

          // Получаем треки из альбома
          const albumTracks = await appleMusicService.getAlbumTracks(album.collectionId)

          for (const track of albumTracks.slice(0, 2)) { // Максимум 2 трека
            const trackInLibrary = await this.findTrackInLibrary(track.trackName, artistName)

            newTracks.push({
              artistId,
              artistName,
              trackName: `${track.trackName} (из ${album.collectionName})`,
              trackId: trackInLibrary?.id,
              detectedAt: Date.now(),
              source: 'appleMusic',
            })
          }
        }
      } catch (error) {
        console.warn(`[ArtistTrackMonitor] Apple Music error for ${artistName}:`, error)
      }
    }

    // Отправляем уведомления о всех найденных треках
    for (const notification of newTracks) {
      this.sendNotification(notification)
    }

    if (newTracks.length === 0) {
      console.log(`[ArtistTrackMonitor] ${artistName}: без новых треков`)
    } else {
      console.log(`[ArtistTrackMonitor] ${artistName}: найдено ${newTracks.length} новых треков`)
    }
  }

  /**
   * Поиск трека в библиотеке Navidrome
   */
  private async findTrackInLibrary(trackName: string, artistName: string): Promise<ISong | null> {
    try {
      const searchResponse = await httpClient<{
        searchResult3?: {
          song?: { song: any[] }
        }
      }>('/search3', {
        method: 'GET',
        query: {
          query: trackName,
          songCount: '20',
          songOffset: '0',
          artistCount: '0',
          albumCount: '0',
        },
      })

      const foundSongs = searchResponse?.data?.searchResult3?.song?.song || []

      if (foundSongs.length > 0) {
        // Ищем совпадение по названию и артисту
        for (const song of foundSongs) {
          const libraryTitle = song.title.toLowerCase()
          const libraryArtist = song.artist?.toLowerCase() || ''
          const searchTitle = trackName.toLowerCase()
          const searchArtist = artistName.toLowerCase()

          const titleMatch = libraryTitle === searchTitle ||
            libraryTitle.includes(searchTitle) ||
            searchTitle.includes(libraryTitle)

          if (titleMatch) {
            const artistMatch = libraryArtist.includes(searchArtist) ||
              searchArtist.includes(libraryArtist)

            if (artistMatch || libraryTitle === searchTitle) {
              const songDetails = await subsonic.songs.getSong(song.id).catch(() => null)
              return songDetails
            }
          }
        }
      }

      return null
    } catch (error) {
      console.warn(`[ArtistTrackMonitor] Search error for "${artistName} - ${trackName}":`, error)
      return null
    }
  }

  /**
   * Отправка уведомления о новом треке
   */
  private sendNotification(notification: NewTrackNotification): void {
    const { subscriptions } = useArtistSubscriptionsStore.getState()

    if (!subscriptions.find(s => s.artistId === notification.artistId)?.notificationsEnabled) {
      return
    }

    // Иконка источника
    const sourceIcons = {
      lastfm: '🎵',
      appleMusic: '🍎',
    }

    const sourceNames = {
      lastfm: 'Last.fm',
      appleMusic: 'Apple Music',
    }

    const sourceIcon = sourceIcons[notification.source]
    const sourceName = sourceNames[notification.source]

    const message = notification.trackId
      ? `${sourceIcon} ${notification.artistName} - "${notification.trackName}" (в библиотеке!)`
      : `${sourceIcon} ${notification.artistName}: "${notification.trackName}" (${sourceName})`

    toast(message, {
      type: 'info',
      autoClose: 10000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    })

    if (notification.trackId) {
      console.log(`[ArtistTrackMonitor] Трек доступен: ${notification.trackId}`)
    }
  }

  /**
   * Ручная проверка артиста (по кнопке)
   */
  async checkArtistNow(artistId: string): Promise<void> {
    const { subscriptions, updateLastCheck } = useArtistSubscriptionsStore.getState()
    const subscription = subscriptions.find(s => s.artistId === artistId)
    
    if (!subscription) {
      console.warn('[ArtistTrackMonitor] Артист не найден в подписках')
      return
    }

    toast(`🔍 Проверка ${subscription.artistName}...`, { type: 'info', autoClose: 3000 })
    await this.checkArtist(subscription, updateLastCheck)
  }

  /**
   * Получить статус мониторинга
   */
  getMonitoringStatus(): { running: boolean; nextCheck?: number } {
    if (!this.intervalId) {
      return { running: false }
    }
    
    return {
      running: true,
      nextCheck: Date.now() + this.checkInterval,
    }
  }
}

// Синглтон
export const artistTrackMonitor = new ArtistTrackMonitorService()
