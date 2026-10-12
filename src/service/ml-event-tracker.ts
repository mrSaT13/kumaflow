/**
 * ML Event Tracking - отслеживание событий для улучшения рекомендаций
 * Сохраняет события в localStorage для анализа и обучения ML
 */

import { useAchievementsStore } from '@/store/achievements.store'

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
 * Проверка достижений.
 *
 * Раньше здесь был свой список достижений с id вида 'first_like' / '10_likes'
 * и события с приведённым через `as any` типом. Эти id не совпадали с id в
 * achievements.store ('likes_1' и т.д.), поэтому награды из стора они не
 * открывали, а пользователь ничего не видел — был только console.log.
 *
 * Теперь единственный источник — стор: checkAll() сам обновляет прогресс и
 * открывает достижения, а разблокировка попадает в justUnlocked, откуда её
 * показывает AchievementObserver.
 */
export function checkAchievements(profile: any) {
  const likedSongs = Array.isArray(profile?.likedSongs) ? profile.likedSongs.length : 0
  const disliked = Array.isArray(profile?.dislikedSongs)
    ? profile.dislikedSongs.length
    : 0
  const history = Array.isArray(profile?.listeningHistory) ? profile.listeningHistory : []
  const artists = Object.keys(profile?.preferredArtists || {}).length
  const genres = Object.keys(profile?.preferredGenres || {}).length

  // Счётчик прослушиваний: история урезана, поэтому берём максимум
  // накопленного playCount, а не длину массива.
  const totalPlays = history.reduce((max, item) => {
    const plays = Number(item?.playCount ?? 0)
    return Math.max(max, plays)
  }, 0)

  const firstHeard = history
    .map((item) => (item as { firstHeard?: string })?.firstHeard)
    .filter((value): value is string => Boolean(value))
    .sort()[0]
  const daysSinceFirstListen = firstHeard
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(firstHeard).getTime()) / 86_400_000),
      )
    : 0

  useAchievementsStore.getState().checkAll({
    totalPlays,
    totalLikes: likedSongs,
    totalDislikes: disliked,
    totalSkips: 0,
    totalPlaylists: 0,
    totalGenres: genres,
    totalArtists: artists,
    daysSinceFirstListen,
  })
}
