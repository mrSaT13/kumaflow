/**
 * ML Playlist Auto-Update Service
 *
 * Автогенерация плейлистов по расписанию:
 * - daily-mix: каждый день после полночи (~8 ч, без повторов с прошлым днём)
 * - time-of-day: каждые 4 ч или при смене периода (утро/день/вечер/ночь)
 * - остальные: по настройке autoUpdateHours
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
import { playlistCache } from '@/service/playlist-cache'
import {
  calculateTrackCountForHours,
  DAILY_MIX_TARGET_HOURS,
  getTodayDateKey,
  shouldRegenerateDailyMix,
  shouldRegenerateTimeOfDay,
  TIME_OF_DAY_TARGET_HOURS,
} from '@/service/ml-playlist-schedule'

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const SERVICE_NAME = '[MLAutoUpdate]'

class MLPlaylistAutoUpdateService {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false

  start() {
    if (this.intervalId) {
      console.log(`${SERVICE_NAME} Already running`)
      return
    }

    console.log(`${SERVICE_NAME} Starting auto-update service`)
    this.checkAndUpdate()

    this.intervalId = setInterval(() => {
      this.checkAndUpdate()
    }, CHECK_INTERVAL_MS)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log(`${SERVICE_NAME} Stopped`)
    }
  }

  public async checkAndUpdate() {
    if (this.isRunning) {
      console.log(`${SERVICE_NAME} Already running, skipping`)
      return
    }

    const state = useMLPlaylistsState.getState()
    const { settings: mlSettings } = useMLPlaylistsStore.getState()
    const mlProfile = useMLStore.getState().profile

    if (!state.autoUpdateEnabled) {
      console.log(`${SERVICE_NAME} Auto-update disabled`)
      return
    }

    if (mlProfile.likedSongs.length === 0) {
      console.log(`${SERVICE_NAME} No liked songs, skipping`)
      return
    }

    this.isRunning = true

    try {
      const playlistsToUpdate: string[] = []

      if (shouldRegenerateDailyMix(state.lastGenerated['daily-mix'])) {
        playlistsToUpdate.push('daily-mix')
      }

      if (shouldRegenerateTimeOfDay(state.lastGenerated['time-of-day'])) {
        playlistsToUpdate.push('time-of-day')
      }

      const otherPlaylistTypes = [
        { type: 'discover-weekly', minHours: 168 },
        { type: 'ml-recommendations', minHours: mlSettings.autoUpdateHours },
        { type: 'because-you-listened', minHours: mlSettings.autoUpdateHours },
        { type: 'vibe-similarity', minHours: mlSettings.autoUpdateHours },
      ]

      for (const { type, minHours } of otherPlaylistTypes) {
        if (this.shouldRegenerateWithMinHours(type, minHours)) {
          playlistsToUpdate.push(type)
        }
      }

      if (playlistsToUpdate.length === 0) {
        console.log(`${SERVICE_NAME} No playlists need update`)
        return
      }

      console.log(`${SERVICE_NAME} Updating ${playlistsToUpdate.length} playlists:`, playlistsToUpdate)

      const updatedLabels: string[] = []

      for (const type of playlistsToUpdate) {
        const label = await this.regeneratePlaylist(type, mlSettings.autoUpdateHours)
        if (label) updatedLabels.push(label)
      }

      if (updatedLabels.length === 1) {
        toast.success(`🔄 ${updatedLabels[0]}`, { autoClose: 3000 })
      } else if (updatedLabels.length > 1) {
        toast.success(`🔄 Обновлено: ${updatedLabels.join(', ')}`, { autoClose: 4000 })
      }
    } catch (error) {
      console.error(`${SERVICE_NAME} Error:`, error)
      toast.error('Ошибка автообновления ML плейлистов', { autoClose: 5000 })
    } finally {
      this.isRunning = false
    }
  }

  private shouldRegenerateWithMinHours(type: string, minHours: number): boolean {
    const state = useMLPlaylistsState.getState()
    const lastGen = state.lastGenerated[type]

    if (!lastGen) return true

    const last = new Date(lastGen)
    const now = new Date()
    const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

    return hoursSince >= minHours
  }

  private async regeneratePlaylist(
    type: string,
    autoUpdateHours: number,
  ): Promise<string | null> {
    const mlProfile = useMLStore.getState().profile
    const { ratings } = useMLStore.getState()
    const { addPlaylist } = useMLPlaylistsState.getState()
    const { setSongList, currentSong } = usePlayerStore.getState()
    const { maxTracks } = useMLPlaylistsStore.getState().settings

    const likedSongIds = mlProfile.likedSongs
    const preferredGenres = mlProfile.preferredGenres
    const state = useMLPlaylistsState.getState()
    const existingPlaylist = state.playlists.find((p) => p.type === type)

    console.log(`${SERVICE_NAME} Regenerating ${type}...`)

    let playlist: any
    let displayLabel: string | null = null

    const {
      generateMLRecommendations,
      generateBecauseYouListened,
      generateTimeOfDayMix,
      generateVibeMix,
    } = await import('@/service/ml-wave-service')

    switch (type) {
      case 'daily-mix': {
        const trackCount = calculateTrackCountForHours(DAILY_MIX_TARGET_HOURS)
        const excludeSongIds = existingPlaylist?.songs.map((s) => s.id) ?? []
        const today = getTodayDateKey()
        playlistCache.clearType(`daily-mix-${today}`)

        playlist = await generateDailyMix(
          likedSongIds,
          preferredGenres,
          mlProfile.preferredArtists,
          ratings,
          trackCount,
          { force: true, excludeSongIds },
        )
        displayLabel = `Ежедневный микс (~${DAILY_MIX_TARGET_HOURS} ч)`
        break
      }

      case 'discover-weekly':
        playlist = await generateDiscoverWeekly(
          likedSongIds,
          preferredGenres,
          maxTracks,
        )
        break

      case 'ml-recommendations':
        playlist = await generateMLRecommendations(
          likedSongIds,
          ratings,
          preferredGenres,
          mlProfile.preferredArtists,
          maxTracks,
        )
        break

      case 'because-you-listened':
        playlist = await generateBecauseYouListened(
          likedSongIds,
          ratings,
          mlProfile.preferredArtists,
          maxTracks,
        )
        break

      case 'time-of-day': {
        const trackCount = calculateTrackCountForHours(TIME_OF_DAY_TARGET_HOURS)
        playlist = await generateTimeOfDayMix(
          likedSongIds,
          ratings,
          preferredGenres,
          trackCount,
        )
        displayLabel = playlist.name
        break
      }

      case 'vibe-similarity': {
        const allSongs = await getRandomSongs(100)
        const seedTrackId =
          likedSongIds.length > 0
            ? likedSongIds[Math.floor(Math.random() * likedSongIds.length)]
            : allSongs[0]?.id
        playlist = await generateVibeMix(seedTrackId, allSongs, maxTracks)
        break
      }

      default:
        console.warn(`${SERVICE_NAME} Unknown playlist type: ${type}`)
        return null
    }

    console.log(`${SERVICE_NAME} ${existingPlaylist ? 'Updating' : 'Creating'} ${type}`)

    const playlistSongs = playlist.playlist?.songs || playlist.songs || []

    const typeMapping: Record<string, string> = {
      'daily-mix': 'dailyMix',
      'discover-weekly': 'discoverWeekly',
      'ml-recommendations': 'mlrecommendations',
      'because-you-listened': 'becauseyoulistened',
      'time-of-day': 'timeofday',
      'vibe-similarity': 'vibesimilarity',
    }

    const namingType = (typeMapping[type] || type.replace(/-./g, (x) => x[1].toUpperCase())) as any
    const nameResult = generateNameFromSongs(namingType, playlistSongs)

    const resolvedName =
      playlist.name || playlist.metadata?.name || nameResult.name || `${type}`
    const resolvedDescription =
      playlist.description || playlist.metadata?.description || ''

    const newPlaylist = {
      id: `auto_${type}_${Date.now()}`,
      type: type as any,
      name: resolvedName,
      description: resolvedDescription,
      songs: playlistSongs,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      autoUpdateHours,
    }

    addPlaylist(newPlaylist)

    const newState = useMLPlaylistsState.getState()
    const savedPlaylist = newState.playlists.find((p) => p.type === type)

    const { saveGeneratedPlaylist } = await import('@/store/generated-playlists.store')
    saveGeneratedPlaylist({
      type: type as any,
      name: resolvedName,
      description: resolvedDescription || 'Автообновление',
      songs: playlistSongs,
      metadata: {
        genres: Array.from(new Set(playlistSongs.map((s) => s.genre).filter(Boolean))),
      },
    })

    console.log(
      `${SERVICE_NAME} ${type} regenerated with ${playlistSongs.length} tracks`,
    )

    if (currentSong && this.isPlaylistPlaying(type)) {
      console.log(`${SERVICE_NAME} ${type} is currently playing, updating queue`)
      setSongList(playlistSongs, 0)
    }

    window.dispatchEvent(
      new CustomEvent('ml-playlist-updated', {
        detail: { type, playlistId: savedPlaylist?.id },
      }),
    )

    return displayLabel || resolvedName
  }

  private isPlaylistPlaying(type: string): boolean {
    const { currentSong } = usePlayerStore.getState()
    if (!currentSong) return false

    const playlistName = type.toLowerCase().replace('-', ' ')
    const currentTitle = currentSong.title?.toLowerCase() || ''
    const currentArtist = currentSong.artist?.toLowerCase() || ''

    return currentTitle.includes(playlistName) || currentArtist.includes(playlistName)
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalId: this.intervalId,
    }
  }
}

export const mlPlaylistAutoUpdate = new MLPlaylistAutoUpdateService()

if (typeof window !== 'undefined') {
  ;(window as any).mlPlaylistAutoUpdate = mlPlaylistAutoUpdate
  console.log('[MLAutoUpdate] Service initialized (access via window.mlPlaylistAutoUpdate)')
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    console.log('[MLAutoUpdate] Initializing service')
    mlPlaylistAutoUpdate.checkAndUpdate()
    mlPlaylistAutoUpdate.start()
  }, 2000)
}
