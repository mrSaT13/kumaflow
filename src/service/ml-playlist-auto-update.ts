/**
 * ML Playlist Auto-Update Service
 * 
 * Автоматическое обновление ML плейлистов по таймеру
 * 
 * Особенности:
 * - Проверка каждые 5 минут
 * - Обновление если прошло больше autoUpdateHours
 * - Уведомление пользователя
 * - Работает только когда приложение активно
 */

import { toast } from 'react-toastify'
import { useMLPlaylistsState } from '@/store/ml-playlists-state.store'
import { useMLPlaylistsStore } from '@/store/ml-playlists.store'
import { useMLStore } from '@/store/ml.store'
import { usePlayerStore } from '@/store/player.store'
import {
  generateDailyMix,
  generateDiscoverWeekly,
} from '@/service/ml-wave-service'
import { getRandomSongs } from '@/service/subsonic-api'
import { generateNameFromSongs } from '@/service/playlist-naming'

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 минут
const SERVICE_NAME = '[MLAutoUpdate]'

class MLPlaylistAutoUpdateService {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false

  /**
   * Запустить сервис автообновления
   */
  start() {
    if (this.intervalId) {
      console.log(`${SERVICE_NAME} Already running`)
      return
    }

    console.log(`${SERVICE_NAME} Starting auto-update service`)
    
    // Проверяем сразу при старте
    this.checkAndUpdate()
    
    // Затем проверяем каждые 5 минут
    this.intervalId = setInterval(() => {
      this.checkAndUpdate()
    }, CHECK_INTERVAL_MS)
  }

  /**
   * Остановить сервис
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log(`${SERVICE_NAME} Stopped`)
    }
  }

  /**
   * Проверить и обновить плейлисты
   */
  public async checkAndUpdate() {
    if (this.isRunning) {
      console.log(`${SERVICE_NAME} Already running, skipping`)
      return
    }

    const state = useMLPlaylistsState.getState()
    const { settings: mlSettings } = useMLPlaylistsStore.getState()
    const mlProfile = useMLStore.getState().profile

    // Проверка включено ли автообновление
    if (!state.autoUpdateEnabled) {
      console.log(`${SERVICE_NAME} Auto-update disabled`)
      return
    }

    // Проверка есть ли данные для генерации
    if (mlProfile.likedSongs.length === 0) {
      console.log(`${SERVICE_NAME} No liked songs, skipping`)
      return
    }

    this.isRunning = true

    try {
      const playlistsToUpdate: string[] = []

      // Проверяем каждый тип плейлиста с учётом их интервалов
      const playlistTypes = [
        // Основные плейлисты с фиксированными интервалами
        { type: 'daily-mix', minHours: 24 },
        { type: 'discover-weekly', minHours: 168 }, // 7 дней

        // Персональные плейлисты - по настройке autoUpdateHours
        // ❌ my-wave НЕ обновляется автоматически - только по кнопке!
        { type: 'ml-recommendations', minHours: mlSettings.autoUpdateHours },
        { type: 'because-you-listened', minHours: mlSettings.autoUpdateHours },

        // Плейлисты по времени - по настройке autoUpdateHours
        { type: 'time-of-day', minHours: mlSettings.autoUpdateHours },

        // Остальные - по настройке autoUpdateHours
        { type: 'vibe-similarity', minHours: mlSettings.autoUpdateHours },
      ]

      for (const { type, minHours } of playlistTypes) {
        if (this.shouldRegenerateWithMinHours(type, minHours)) {
          playlistsToUpdate.push(type)
        }
      }

      if (playlistsToUpdate.length === 0) {
        console.log(`${SERVICE_NAME} No playlists need update`)
        return
      }

      console.log(`${SERVICE_NAME} Updating ${playlistsToUpdate.length} playlists:`, playlistsToUpdate)

      // Генерируем плейлисты
      for (const type of playlistsToUpdate) {
        await this.regeneratePlaylist(type, mlSettings.autoUpdateHours)
      }

      toast.success(`🔄 ML плейлисты обновлены (${playlistsToUpdate.length})`, {
        autoClose: 3000,
      })

    } catch (error) {
      console.error(`${SERVICE_NAME} Error:`, error)
      toast.error('Ошибка автообновления ML плейлистов', {
        autoClose: 5000,
      })
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Проверить нужно ли обновлять плейлист с учётом минимального интервала
   */
  private shouldRegenerateWithMinHours(type: string, minHours: number): boolean {
    const state = useMLPlaylistsState.getState()
    const lastGen = state.lastGenerated[type]

    if (!lastGen) return true

    const last = new Date(lastGen)
    const now = new Date()
    const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

    return hoursSince >= minHours
  }

  /**
   * Обновить конкретный плейлист
   */
  private async regeneratePlaylist(type: string, autoUpdateHours: number) {
    const mlProfile = useMLStore.getState().profile
    const { ratings } = useMLStore.getState()
    const { addPlaylist } = useMLPlaylistsState.getState()
    const { setSongList, currentSong } = usePlayerStore.getState()
    const { maxTracks } = useMLPlaylistsStore.getState().settings

    const likedSongIds = mlProfile.likedSongs
    const preferredGenres = mlProfile.preferredGenres

    console.log(`${SERVICE_NAME} Regenerating ${type}...`)

    let playlist: any

    // Импортируем функции один раз
    const {
      generateMLRecommendations,
      generateBecauseYouListened,
      generateTimeOfDayMix,
      generateVibeMix,
    } = await import('@/service/ml-wave-service')

    switch (type) {
      case 'daily-mix':
        playlist = await generateDailyMix(
          likedSongIds,
          preferredGenres,
          mlProfile.preferredArtists,
          ratings,
          maxTracks
        )
        break

      case 'discover-weekly':
        playlist = await generateDiscoverWeekly(
          likedSongIds,
          preferredGenres,
          maxTracks
        )
        break

      case 'ml-recommendations':
        playlist = await generateMLRecommendations(
          likedSongIds,
          ratings,
          preferredGenres,
          mlProfile.preferredArtists,
          maxTracks
        )
        break

      case 'because-you-listened':
        playlist = await generateBecauseYouListened(
          likedSongIds,
          ratings,
          mlProfile.preferredArtists,
          maxTracks
        )
        break

      case 'time-of-day':
        playlist = await generateTimeOfDayMix(
          likedSongIds,
          ratings,
          preferredGenres,
          maxTracks
        )
        break

      case 'vibe-similarity':
        const allSongs = await getRandomSongs(100)
        const seedTrackId = likedSongIds.length > 0 
          ? likedSongIds[Math.floor(Math.random() * likedSongIds.length)]
          : allSongs[0]?.id
        playlist = await generateVibeMix(seedTrackId, allSongs, maxTracks)
        break

      default:
        console.warn(`${SERVICE_NAME} Unknown playlist type: ${type}`)
        return
    }

    // Сохраняем плейлист в ml-playlists-state
    // addPlaylist автоматически сохранит ID существующего плейлиста
    const state = useMLPlaylistsState.getState()
    const existingPlaylist = state.playlists.find(p => p.type === type)

    console.log(`${SERVICE_NAME} ${existingPlaylist ? 'Updating' : 'Creating'} ${type}`)
    console.log(`${SERVICE_NAME} Existing playlist:`, existingPlaylist ? existingPlaylist.id : 'none')

    // Генерируем умное название на основе треков
    const playlistSongs = playlist.playlist?.songs || playlist.songs || []
    
    // Маппинг типов из kebab-case в camelCase для naming
    const typeMapping: Record<string, string> = {
      'daily-mix': 'dailyMix',
      'discover-weekly': 'discoverWeekly',
      'ml-recommendations': 'mlrecommendations',
      'because-you-listened': 'becauseyoulistened',
      'time-of-day': 'timeofday',
      'vibe-similarity': 'vibesimilarity',
    }
    
    const namingType = (typeMapping[type] || type.replace(/-./g, x => x[1].toUpperCase())) as any
    
    const nameResult = generateNameFromSongs(
      namingType,
      playlistSongs
    )

    console.log(`${SERVICE_NAME} 🎵 Generated name: ${nameResult.name}`)

    const newPlaylist = {
      id: `auto_${type}_${Date.now()}`,  // ID будет проигнорирован при обновлении
      type: type as any,
      name: playlist.metadata?.name || nameResult.name || `${type}`,
      description: playlist.metadata?.description || '',
      songs: playlistSongs,
      createdAt: new Date().toISOString(),  // Будет проигнорировано при обновлении
      lastUpdated: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      autoUpdateHours,
    }

    console.log(`${SERVICE_NAME} Calling addPlaylist with:`, newPlaylist)
    addPlaylist(newPlaylist)

    // Проверяем что сохранилось
    const newState = useMLPlaylistsState.getState()
    const savedPlaylist = newState.playlists.find(p => p.type === type)
    console.log(`${SERVICE_NAME} Saved playlist:`, savedPlaylist ? { id: savedPlaylist.id, type: savedPlaylist.type, name: savedPlaylist.name } : 'NOT SAVED')

    // Сохраняем плейлист в generated-playlists.store для страницы
    const { saveGeneratedPlaylist } = await import('@/store/generated-playlists.store')
    saveGeneratedPlaylist({
      type: type as any,
      name: nameResult.name || playlist.metadata?.name || `${type}`,
      description: playlist.metadata?.description || 'Автообновление',
      songs: playlistSongs,
      metadata: {
        genres: Array.from(new Set(playlistSongs.map(s => s.genre).filter(Boolean))),
      },
    })

    console.log(`${SERVICE_NAME} ${type} regenerated with ${playlist.playlist?.songs?.length || playlist.songs?.length} tracks`)

    // Если этот плейлист сейчас играет - обновляем очередь
    if (currentSong && this.isPlaylistPlaying(type)) {
      console.log(`${SERVICE_NAME} ${type} is currently playing, updating queue`)
      const songs = playlist.playlist?.songs || playlist.songs || []
      setSongList(songs, 0)
    }
    
    // Отправляем событие для обновления UI на странице
    window.dispatchEvent(new CustomEvent('ml-playlist-updated', {
      detail: { type, playlistId: savedPlaylist?.id }
    }))
  }

  /**
   * Проверить играет ли сейчас плейлист этого типа
   */
  private isPlaylistPlaying(type: string): boolean {
    const { currentSong } = usePlayerStore.getState()
    if (!currentSong) return false

    // Проверяем по названию или описанию
    const playlistName = type.toLowerCase().replace('-', ' ')
    const currentTitle = currentSong.title?.toLowerCase() || ''
    const currentArtist = currentSong.artist?.toLowerCase() || ''

    return currentTitle.includes(playlistName) || currentArtist.includes(playlistName)
  }

  /**
   * Получить статус сервиса
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalId: this.intervalId,
    }
  }
}

// Синглтон
export const mlPlaylistAutoUpdate = new MLPlaylistAutoUpdateService()

// Экспорт для доступа из консоли
if (typeof window !== 'undefined') {
  ;(window as any).mlPlaylistAutoUpdate = mlPlaylistAutoUpdate
  console.log('[MLAutoUpdate] Service initialized (access via window.mlPlaylistAutoUpdate)')
}

// Автозапуск при загрузке приложения
if (typeof window !== 'undefined') {
  // Ждём загрузки приложения
  setTimeout(() => {
    console.log('[MLAutoUpdate] Initializing service')
    
    // Проверяем нужно ли обновить плейлисты сразу после запуска
    // (если приложение было закрыто и пропустило обновление)
    mlPlaylistAutoUpdate.checkAndUpdate()
    
    // Затем запускаем регулярную проверку каждые 5 минут
    mlPlaylistAutoUpdate.start()
  }, 2000)
}
