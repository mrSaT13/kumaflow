/**
 * ML Event Tracking - отслеживание событий для улучшения рекомендаций
 * Сохраняет события в localStorage для анализа и обучения ML
 */

export type MLEventType =
  // Onboarding
  | 'onboarding_started'
  | 'onboarding_completed'
  
  // Basic interactions
  | 'first_track_played'
  | 'first_like'
  | 'first_dislike'
  
  // Profile management
  | 'import_completed'
  | 'export_completed'
  
  // Playlist generation
  | 'playlist_generated'
  | 'radio_started'
  
  // Scrobbling
  | 'scrobble_sent'
  
  // Search
  | 'search_performed'
  
  // Artist interactions
  | 'artist_followed'
  | 'view_artist_page'
  | 'view_artist_images'
  
  // Track interactions
  | 'view_lyrics'
  | 'download_track'
  | 'add_to_playlist'
  | 'remove_from_playlist'
  
  // Player controls
  | 'sleep_timer_set'
  | 'repeat_mode_enabled'
  | 'seek_forward'
  | 'seek_backward'
  | 'mute_toggle'
  
  // Listening patterns
  | 'skip_after_half'
  | 'night_listening'
  | 'activity_selected'
  
  // Achievements
  | 'milestone_reached'

export interface MLEvent {
  type: MLEventType
  timestamp: string
  metadata?: Record<string, any>
}

const ML_EVENTS_KEY = 'kumaflow_ml_events'
const MAX_EVENTS = 1000 // Храним последние 1000 событий

/**
 * Отправить событие
 */
export function trackEvent(type: MLEventType, metadata?: Record<string, any>) {
  try {
    const event: MLEvent = {
      type,
      timestamp: new Date().toISOString(),
      metadata,
    }

    // Получаем существующие события
    const events = getEvents()
    
    // Добавляем новое
    events.push(event)
    
    // Оставляем только последние MAX_EVENTS
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS)
    }
    
    // Сохраняем
    localStorage.setItem(ML_EVENTS_KEY, JSON.stringify(events))
    
    // Логируем для отладки
    console.log(`📊 [ML Event] ${type}`, metadata || '')
    
    // Отправляем аналитику (если будет сервер)
    // sendToAnalytics(event)
  } catch (error) {
    console.error('Failed to track event:', error)
  }
}

/**
 * Получить все события
 */
export function getEvents(): MLEvent[] {
  try {
    const data = localStorage.getItem(ML_EVENTS_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Failed to get events:', error)
    return []
  }
}

/**
 * Получить события по типу
 */
export function getEventsByType(type: MLEventType): MLEvent[] {
  const events = getEvents()
  return events.filter(event => event.type === type)
}

/**
 * Получить последние события
 */
export function getLastEvents(count: number = 10): MLEvent[] {
  const events = getEvents()
  return events.slice(-count)
}

/**
 * Очистить все события
 */
export function clearEvents() {
  localStorage.removeItem(ML_EVENTS_KEY)
}

/**
 * Получить статистику событий
 */
export function getEventStats() {
  const events = getEvents()
  const stats: Record<string, number> = {}
  
  events.forEach(event => {
    stats[event.type] = (stats[event.type] || 0) + 1
  })
  
  return stats
}

/**
 * Проверить было ли событие
 */
export function hasEventOccurred(type: MLEventType): boolean {
  const events = getEventsByType(type)
  return events.length > 0
}

/**
 * Получить первое событие типа
 */
export function getFirstEventOfType(type: MLEventType): MLEvent | null {
  const events = getEventsByType(type)
  return events.length > 0 ? events[0] : null
}

/**
 * Получить последнее событие типа
 */
export function getLastEventOfType(type: MLEventType): MLEvent | null {
  const events = getEventsByType(type)
  return events.length > 0 ? events[events.length - 1] : null
}

/**
 * Специальные трекинг функции для новых паттернов
 */

// Artist interactions
export function trackViewArtistPage(artistId: string, artistName: string) {
  trackEvent('view_artist_page', { artistId, artistName })
}

export function trackViewArtistImages(artistId: string, imageCount: number) {
  trackEvent('view_artist_images', { artistId, imageCount })
}

// Track interactions
export function trackViewLyrics(songId: string, hasLyrics: boolean) {
  trackEvent('view_lyrics', { songId, hasLyrics })
}

export function trackDownloadTrack(songId: string, format?: string) {
  trackEvent('download_track', { songId, format })
}

export function trackAddToPlaylist(songId: string, playlistId: string, playlistName: string) {
  trackEvent('add_to_playlist', { songId, playlistId, playlistName })
}

export function trackRemoveFromPlaylist(songId: string, playlistId: string, playlistName: string) {
  trackEvent('remove_from_playlist', { songId, playlistId, playlistName })
}

// Player controls
export function trackSleepTimerSet(duration: number) {
  trackEvent('sleep_timer_set', { duration })
}

export function trackRepeatModeEnabled(mode: 'track' | 'playlist' | 'none') {
  trackEvent('repeat_mode_enabled', { mode })
}

export function trackSeekForward(seconds: number, trackProgress: number) {
  trackEvent('seek_forward', { seconds, trackProgress })
}

export function trackSeekBackward(seconds: number, trackProgress: number) {
  trackEvent('seek_backward', { seconds, trackProgress })
}

export function trackMuteToggle(isMuted: boolean, context?: string) {
  trackEvent('mute_toggle', { isMuted, context })
}

// Listening patterns
export function trackSkipAfterHalf(songId: string, progress: number) {
  trackEvent('skip_after_half', { songId, progress })
}

export function trackNightListening(hour: number) {
  trackEvent('night_listening', { hour })
}

export function trackActivitySelected(activity: string, playlistId?: string) {
  trackEvent('activity_selected', { activity, playlistId })
}

// Achievements
export function trackMilestoneReached(milestone: string, count: number) {
  trackEvent('milestone_reached', { milestone, count })
}

/**
 * Проверка достижений и автоматический трекинг
 */
export function checkAchievements(profile: any) {
  const achievements = [
    { id: 'first_like', check: () => profile.likedSongs?.length >= 1, count: 1 },
    { id: '10_likes', check: () => profile.likedSongs?.length >= 10, count: 10 },
    { id: '50_likes', check: () => profile.likedSongs?.length >= 50, count: 50 },
    { id: '100_likes', check: () => profile.likedSongs?.length >= 100, count: 100 },
    { id: '500_likes', check: () => profile.likedSongs?.length >= 500, count: 500 },
    
    { id: 'first_artist_follow', check: () => Object.keys(profile.preferredArtists || {}).length >= 1, count: 1 },
    { id: '10_artists', check: () => Object.keys(profile.preferredArtists || {}).length >= 10, count: 10 },
    { id: '50_artists', check: () => Object.keys(profile.preferredArtists || {}).length >= 50, count: 50 },
    
    { id: 'first_genre', check: () => Object.keys(profile.preferredGenres || {}).length >= 1, count: 1 },
    { id: '10_genres', check: () => Object.keys(profile.preferredGenres || {}).length >= 10, count: 10 },
    
    { id: 'playlist_master', check: () => profile.listeningHistory?.length >= 100, count: 100 },
    { id: 'playlist_legend', check: () => profile.listeningHistory?.length >= 500, count: 500 },
  ]

  achievements.forEach(achievement => {
    if (achievement.check()) {
      // Проверяем не было ли уже этого достижения
      const hasAchievement = hasEventOccurred(`achievement_${achievement.id}`)
      if (!hasAchievement) {
        trackMilestoneReached(achievement.id, achievement.count)
        trackEvent(`achievement_${achievement.id}` as any, { count: achievement.count })
        console.log(`🏆 Achievement unlocked: ${achievement.id} (${achievement.count})`)
      }
    }
  })
}
