import {
  ComponentPropsWithoutRef,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { useAudioContext } from '@/app/hooks/use-audio-context'
import { fadeIn } from '@/features/player/audio-graph'
import { crossfade } from '@/features/player/crossfade'
import { getSongStreamUrl } from '@/api/httpClient'
import { shallow } from 'zustand/shallow'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerMediaType,
  usePlayerVolume,
  useReplayGainState,
  usePlayerStore,
  selectCurrentSong,
} from '@/store/player.store'
import { LoopState } from '@/types/playerContext'
import { usePlaybackSettings } from '@/store/playback.store'
import { detectSeekBack, reportSeekBack } from '@/service/brain-events'
import { offlineService } from '@/service/offline-service'
import { dualUrlBackgroundService } from '@/service/dual-url-background-service'
import { cacheService } from '@/service/cache-service'
import { logger } from '@/utils/logger'
import { calculateReplayGain, ReplayGainParams } from '@/utils/replayGain'

type AudioPlayerProps = ComponentPropsWithoutRef<'audio'> & {
  audioRef: RefObject<HTMLAudioElement>
  replayGain?: ReplayGainParams
}

export function AudioPlayer({
  audioRef,
  replayGain,
  ...props
}: AudioPlayerProps) {
  const { t } = useTranslation()
  const { replayGainEnabled, replayGainError } = useReplayGainState()
  const { isSong, isRadio, isPodcast } = usePlayerMediaType()
  const { setPlayingState } = usePlayerActions()
  const { volume } = usePlayerVolume()
  const isPlaying = usePlayerIsPlaying()
  
  // Crossfade настройки
  const { settings: playbackSettings } = usePlaybackSettings()

  const gainValue = useMemo(() => {
    const audioVolume = volume / 100

    if (!replayGain || !replayGainEnabled) {
      return audioVolume * 1
    }
    const gain = calculateReplayGain(replayGain)

    return audioVolume * gain
  }, [replayGain, replayGainEnabled, volume])

  // Именно сам ref, а не audioRef.current: на рендере .current ещё не задан,
// и колбэки resumeContext/setupGain иначе остались бы no-op (тишина).
const { resumeContext, setupGain } = useAudioContext(audioRef)

  // Настоящий кроссфейд: следующий трек играет внахлёст с текущим.
  // Движок держит собственный второй элемент; этот эффект только передаёт
  // ему настройки и подписывается на основной элемент.
  useEffect(() => {
    if (!playbackSettings.crossfadeEnabled) {
      crossfade.detach()
      return
    }

    crossfade.configure(playbackSettings.crossfadeSeconds)

    const { playNextSong } = usePlayerStore.getState().actions

    crossfade.attach({
      main: () => audioRef.current,
      baseVolume: () => gainValue,
      nextSrc: () => {
        const st = usePlayerStore.getState()
        const { currentList, currentSongIndex } = st.songlist
        const next = currentList[currentSongIndex + 1]
        // repeat one: трек не доигрывает, накладываться не на что
        if (!next || st.playerState.loopState === LoopState.One) return null
        if (next.isAudiobook || next.isLocal) return null
        return getSongStreamUrl(next.id)
      },
      advance: () => playNextSong(),
      enabled: () => {
        const st = usePlayerStore.getState()
        return (
          st.playerState.isPlaying &&
          st.playerState.mediaType === 'song' &&
          st.playerState.loopState !== LoopState.One &&
          Boolean(st.actions.hasNextSong())
        )
      },
    })

    return () => crossfade.detach()
  }, [audioRef, playbackSettings.crossfadeEnabled, playbackSettings.crossfadeSeconds, gainValue])

  // Проверка офлайн-режима и переключение на закешированный URL
  useEffect(() => {
    if (!isSong || !audioRef.current || !props.src) return

    const currentSrc = props.src as string
    
    // Если это серверный URL (не local и не data:)
    if (currentSrc.includes('/rest/stream')) {
      const trackId = new URL(currentSrc, window.location.origin).searchParams.get('id')
      
      if (trackId) {
        // Проверяем наличие в кеше
        offlineService.isTrackCached(trackId).then((cached) => {
          if (cached && !offlineService.isOnlineNow()) {
            console.log('[Audio] Offline mode detected, loading cached audio...')
            offlineService.getCachedAudioUrl(trackId).then((cachedUrl) => {
              if (cachedUrl && audioRef.current) {
                console.log('[Audio] Using cached audio URL')
                audioRef.current.src = cachedUrl
                audioRef.current.load()
              }
            })
          }
        })
      }
    }
  }, [props.src, isSong])

  // Громкость идёт только через setupGain → applyGain. Раньше она
// применялась ещё и напрямую в элемент (player.tsx + volume.tsx),
// вместе с gain-узлом это давало v²: ползунок на 50% звучал как 25%.
useEffect(() => {
  if (!audioRef.current) return

  setupGain(gainValue, replayGain)
}, [audioRef, gainValue, replayGain, setupGain])

  const handleSongError = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    const error = audio.error
    const networkState = audio.networkState

    logger.error('Audio load error', {
      src: audio.src,
      networkState,
      readyState: audio.readyState,
      error: error,
    })

    // Проверяем тип ошибки - сеть или кеш
    const isNetworkError = error?.code === MediaError.MEDIA_ERR_NETWORK || 
                           networkState === 3 // NETWORK_STATE = 3 (NETWORK_NO_SOURCE)

    if (isNetworkError) {
      console.log('[Audio] Network error detected, attempting seamless URL switch...')
      handleNetworkError()
      return
    }

    // Ошибка загрузки трека не имеет отношения к ReplayGain и тем более не
    // повод перезагружать приложение. Раньше здесь стояло:
    //   setReplayGainEnabled(false); setReplayGainError(true); window.location.reload()
    // Условие `replayGainEnabled || !replayGainError` истинно всегда, когда
    // error ещё не выставлен, то есть ЛЮБОЙ битый трек перезагружал плеер.
    // А replayGainError персистится в player_store, поэтому ReplayGain
    // после этого выключался навсегда, вместе с ним падал resetRefs(), и
    // ассоциация element<->source в браузере ломалась до конца сессии.
    toast.error(t('warnings.songError'))

    // Просто уходим на следующий трек. Действия лежат в actions,
    // а не в корне стора — здесь раньше вызывался undefined.
    try {
      usePlayerStore.getState().actions.playNextSong()
    } catch {
      /* очередь пуста — нечего переключать */
    }
  }, [audioRef, t])

  // Обработчик ошибок сети - бесшовное переключение URL
  const handleNetworkError = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    console.log('[Audio] Handling network error...')

    // 1. НЕ останавливаем воспроизведение - трек доиграется из буфера
    // audio.pause() - НЕ вызываем!

    // 2. Пытаемся переключить URL для СЛЕДУЮЩИХ треков
    const switched = await dualUrlBackgroundService.forceSwitch('error')

    if (switched) {
      console.log('[Audio] URL switched successfully. Current track will continue, next track will use new URL')
      // Текущий трек продолжает играть из буфера
      // Следующий трек (через crossfade или playNextSong) возьмёт новый URL
      
      toast.info('Соединение с сервером потеряно. Переключение на резервный сервер...', {
        autoClose: 3000,
      })
    } else {
      console.log('[Audio] URL switch failed or disabled')
      toast.error(t('warnings.songError'))
    }
  }, [audioRef, t])

  const handleRadioError = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    toast.error(t('radios.error'))
    setPlayingState(false)
  }, [audioRef, setPlayingState, t])

  useEffect(() => {
    async function handleSong() {
      const audio = audioRef.current
      if (!audio) return

      try {
        if (isPlaying) {
          if (isSong) await resumeContext()
          await audio.play()

          // Кэшируем текущий трек пока он играет (для бесшовного переключения)
          const currentSong = selectCurrentSong(usePlayerStore.getState())
          if (currentSong?.id && !currentSong.isLocal) {
            // Кэшируем в фоне без ожидания
            cacheService.cacheAudioFile(currentSong.id).catch((err) => {
              console.warn('[Audio] Failed to cache current track:', err)
            })
          }

          // Отправляем Now Playing в Navidrome и Last.fm
          console.log('[Audio] Current song:', currentSong)
          console.log('[Audio] Artist:', currentSong?.artist, 'Title:', currentSong?.title)

          if (currentSong?.id && currentSong.artist && currentSong.title) {
            const { scrobble } = await import('@/service/scrobble')
            scrobble.sendNowPlaying({
              id: currentSong.id,
              artist: currentSong.artist,
              title: currentSong.title,
              album: currentSong.album,
              duration: currentSong.duration,
            })
          } else {
            console.log('[Audio] Cannot send Now Playing: missing artist or title', currentSong)
          }
        } else {
          audio.pause()
        }
      } catch (error) {
        logger.error('Audio playback failed', error)
        handleSongError()
      }
    }
    if (isSong || isPodcast) handleSong()
  }, [audioRef, handleSongError, isPlaying, isSong, isPodcast, resumeContext])

  // Громкость на старте трека. Нужен только когда кроссфейд выключен: при
  // включённом кроссфейде переход делает движок, и поднимать громкость
  // основного элемента ещё раз означало бы двойной подъём на стыке.
  useEffect(() => {
    if (playbackSettings.crossfadeEnabled) return

    const unsubscribe = usePlayerStore.subscribe(
      (state) =>
        [selectCurrentSong(state)?.id, state.playerState.isPlaying] as const,
      (prev, next) => {
        const trackChanged = prev[0] !== next[0]
        if (!trackChanged || !next[1]) return

        fadeIn(audioRef.current)
      },
      { equalityFn: shallow },
    )

    return unsubscribe
  }, [audioRef, playbackSettings.crossfadeEnabled])

  // Пауза или смена трека голосом — кроссфейд надо отменить, иначе компаньон
  // продолжит играть сам по себе.
  useEffect(() => {
    if (!isPlaying) crossfade.cancel()
  }, [isPlaying])

  useEffect(() => {
    async function handleRadio() {
      const audio = audioRef.current
      if (!audio) return

      if (isPlaying) {
        audio.load()
        await audio.play()
      } else {
        audio.pause()
      }
    }
    if (isRadio) handleRadio()
  }, [audioRef, isPlaying, isRadio])

  // === BRAIN: детект seek_back централизованно ===
  // Ловит ВСЕ перемотки назад >5с (кнопки ±15/30, слайдеры, верхняя полоса,
  // remote/MPRIS): нативное событие seeked элемента audio.
  // Гарды от ложных: смена трека (другой src) и конец трека (loop/replay).
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isSong) return

    let lastSrc = ''
    let lastPos = 0

    const onTimeUpdate = () => {
      lastPos = audio.currentTime
    }

    const onSeeked = () => {
      const cur = audio.currentTime
      // Сменился трек — просто запоминаем, не событие
      if (audio.src !== lastSrc) {
        lastSrc = audio.src
        lastPos = cur
        return
      }
      const dur = audio.duration
      const nearEnd =
        Number.isFinite(dur) && dur > 0 && lastPos > dur - 2
      if (!nearEnd && detectSeekBack(lastPos, cur)) {
        const id = selectCurrentSong(usePlayerStore.getState())?.id
        if (id) {
          reportSeekBack(id, cur)
          // Потрековый счётчик для мозга (sync-from-mobile)
          void import('@/store/ml.store').then((m) => {
            try {
              m.useMLStore.getState().incrementSeekBackCount(id)
            } catch { /* best-effort */ }
          })
        }
      }
      lastPos = cur
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('seeked', onSeeked)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('seeked', onSeeked)
    }
  }, [audioRef, isSong])

  const handleError = useMemo(() => {
    if (isSong) return handleSongError
    if (isRadio) return handleRadioError

    return undefined
  }, [handleRadioError, handleSongError, isRadio, isSong])

  const crossOrigin = useMemo(() => {
    if (!isSong || replayGainError) return undefined

    return 'anonymous'
  }, [isSong, replayGainError])

  return (
    <audio
      ref={audioRef}
      {...props}
      crossOrigin={crossOrigin}
      onError={handleError}
    />
  )
}
