import { httpClient } from '@/api/httpClient'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import { lastFmService } from '@/service/lastfm-api'
import { listenBrainzApi } from '@/service/listenbrainz-api'
import { useExternalApiStore } from '@/store/external-api.store'
import { useMLStore } from '@/store/ml.store'
import { useListenBrainzStore } from '@/store/listenbrainz.store'
import dateTime from '@/utils/dateTime'
import { isMoodTag, normalizeGenre } from '@/service/lastfm-tags-import'

interface ScrobbleOptions {
  id: string
  artist?: string
  title?: string
  album?: string
  duration?: number
  event?: 'start' | 'pause' | 'unpause' | 'timeupdate'
  submission?: boolean
}

/**
 * Отправить Now Playing / Scrobble в Navidrome и Last.fm
 * 
 * Navidrome OpenSubsonic API поддерживает:
 * - event: 'start' - трек начал играть (Now Playing)
 * - event: 'pause' - трек на паузе
 * - event: 'unpause' - трек продолжил играть
 * - event: 'timeupdate' - обновление позиции
 * - submission: true - трек прослушан (отправить в scrobbles)
 */
async function send(options: string | ScrobbleOptions) {
  const opts = typeof options === 'string' ? { id: options } : options

  // Отправляем в Navidrome (OpenSubsonic API)
  try {
    await httpClient<SubsonicResponse>('/scrobble', {
      method: 'GET',
      query: {
        id: opts.id,
        time: dateTime().valueOf().toString(),
        ...(opts.event && { event: opts.event }),
        ...(opts.submission !== undefined && { submission: opts.submission.toString() }),
      },
    })
    console.log('[Scrobble] Sent to Navidrome:', opts.id, opts.event || 'submission')
  } catch (error) {
    console.error('[Scrobble] Navidrome error:', error)
  }

  // Отправляем в Last.fm (если включено)
  const state = useExternalApiStore.getState()

  // Проверяем что Last.fm включен и авторизован
  const lastFmEnabled = state.settings.lastFmEnabled && state.settings.lastFmApiKey && state.settings.lastFmApiSecret
  const lastFmAuthorized = lastFmService.isAuthorized()
  const sessionKey = lastFmService.getSessionKey()
  const serviceApiKey = (lastFmService as any).apiKey

  console.log('[Scrobble] Last.fm settings:', {
    enabled: state.settings.lastFmEnabled,
    hasKey: !!state.settings.lastFmApiKey,
    hasSecret: !!state.settings.lastFmApiSecret,
    authorized: lastFmAuthorized,
    hasSessionKey: !!sessionKey,
    sessionKeyLength: sessionKey?.length,
    serviceApiKey: serviceApiKey ? '***' + serviceApiKey.slice(-8) : 'NONE',
  })

  // Отправляем в ListenBrainz (если включено)
  const lbState = useListenBrainzStore.getState()
  const listenBrainzEnabled = lbState.enabled && lbState.token

  if (listenBrainzEnabled && opts.artist && opts.title) {
    if (opts.event === 'start') {
      // Now Playing
      listenBrainzApi.updateNowPlaying({
        artist_name: opts.artist,
        track_name: opts.title,
        release_name: opts.album,
      }).then(success => {
        if (success) {
          console.log('[Scrobble] ✅ Now Playing sent to ListenBrainz:', opts.title)
        }
      })
    } else if (opts.submission) {
      // Scrobble
      listenBrainzApi.submitListen({
        artist_name: opts.artist,
        track_name: opts.title,
        release_name: opts.album,
        listened_at: opts.duration ? Math.floor(dateTime().valueOf() / 1000) - opts.duration : undefined,
      }).then(success => {
        if (success) {
          console.log('[Scrobble] ✅ Scrobble sent to ListenBrainz:', opts.title)
        }
      })
    }
  }

  if (lastFmEnabled && lastFmAuthorized && opts.artist && opts.title) {
    try {
      if (opts.event === 'start') {
        // Now Playing
        const success = await lastFmService.updateNowPlaying(
          opts.artist,
          opts.title,
          opts.album,
          opts.duration
        )
        if (success) {
          console.log('[Scrobble] ✅ Now Playing sent to Last.fm:', opts.title, opts.artist)
          
          // Автоматический импорт настроений для трека (в фоне)
          importTrackMoodsInBackground(opts.id, opts.artist, opts.title)
        } else {
          console.warn('[Scrobble] ❌ Last.fm Now Playing failed - требуется OAuth авторизация')
          console.warn('[Scrobble] ℹ️ Last.fm scrobbling требует полноценной OAuth авторизации.')
          console.warn('[Scrobble] ℹ️ Это будет реализовано в будущей версии.')
        }
      } else if (opts.submission) {
        // Scrobble
        const success = await lastFmService.scrobble(
          opts.artist,
          opts.title,
          Math.floor(dateTime().valueOf() / 1000),
          opts.album,
          opts.duration
        )
        if (success) {
          console.log('[Scrobble] ✅ Scrobble sent to Last.fm:', opts.title, opts.artist)
          
          // Автоматический импорт настроений для трека (в фоне)
          importTrackMoodsInBackground(opts.id, opts.artist, opts.title)
        } else {
          console.warn('[Scrobble] ❌ Last.fm Scrobble failed - требуется OAuth авторизация')
          console.warn('[Scrobble] ℹ️ Last.fm scrobbling требует полноценной OAuth авторизации.')
          console.warn('[Scrobble] ℹ️ Это будет реализовано в будущей версии.')
        }
      }
    } catch (error) {
      console.error('[Scrobble] Last.fm error:', error)
    }
  } else {
    console.log('[Scrobble] Last.fm disabled or no artist/title:', {
      enabled: state.settings.lastFmEnabled,
      hasKey: !!state.settings.lastFmApiKey,
      hasArtist: !!opts.artist,
      hasTitle: !!opts.title,
    })
  }
}

/**
 * Фоновый импорт настроений для трека (не блокирует скроббл)
 */
async function importTrackMoodsInBackground(
  songId: string,
  artist: string,
  title: string
): Promise<void> {
  // Запускаем в фоне без await чтобы не блокировать скроббл
  lastFmService.getTrackTags(artist, title, 20)
    .then(tags => {
      if (tags.length === 0) {
        console.log('[Scrobble Moods] No tags found for', title)
        return
      }

      // Фильтруем настроения
      const moods = tags
        .filter(tag => isMoodTag(tag.name))
        .map(tag => ({
          name: normalizeGenre(tag.name),
          weight: tag.count,
        }))
        .slice(0, 10)

      if (moods.length > 0) {
        // Сохраняем в ML профиль
        useMLStore.getState().addTrackMoods(songId, moods)
        console.log('[Scrobble Moods] 🎭 Added', moods.length, 'moods for', title)
      }
    })
    .catch(error => {
      console.error('[Scrobble Moods] Error:', error)
    })
}

export const scrobble = {
  send,
  /**
   * Отправить Now Playing (трек начал играть)
   */
  sendNowPlaying: (song: { id: string; artist?: string; title?: string; album?: string; duration?: number }) => {
    console.log('[Scrobble] sendNowPlaying called:', song)
    return send({
      ...song,
      event: 'start',
      submission: false,
    })
  },
  /**
   * Отправить Scrobble (трек прослушан)
   */
  sendSubmission: (song: { id: string; artist?: string; title?: string; album?: string; duration?: number }) => {
    console.log('[Scrobble] sendSubmission called:', song)
    return send({
      ...song,
      event: undefined,
      submission: true,
    })
  },
}
