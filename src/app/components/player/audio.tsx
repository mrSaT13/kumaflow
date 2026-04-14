import {
  ComponentPropsWithoutRef,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { useAudioContext } from '@/app/hooks/use-audio-context'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerMediaType,
  usePlayerVolume,
  useReplayGainActions,
  useReplayGainState,
  usePlayerStore,
} from '@/store/player.store'
import { usePlaybackSettings } from '@/store/playback.store'
import { crossfadeService } from '@/service/crossfade-service'
import { offlineService } from '@/service/offline-service'
import { dualUrlBackgroundService } from '@/service/dual-url-background-service'
import { cacheService } from '@/service/cache-service'
import { logger } from '@/utils/logger'
import { calculateReplayGain, ReplayGainParams } from '@/utils/replayGain'
import { getSongStreamUrl } from '@/api/httpClient'

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
  const [previousGain, setPreviousGain] = useState(1)
  const { replayGainEnabled, replayGainError } = useReplayGainState()
  const { isSong, isRadio, isPodcast } = usePlayerMediaType()
  const { setPlayingState } = usePlayerActions()
  const { setReplayGainEnabled, setReplayGainError } = useReplayGainActions()
  const { volume } = usePlayerVolume()
  const isPlaying = usePlayerIsPlaying()
  
  // Crossfade настройки
  const { settings: playbackSettings } = usePlaybackSettings()
  const [crossfadeNextTrack, setCrossfadeNextTrack] = useState<string | null>(null)

  const gainValue = useMemo(() => {
    const audioVolume = volume / 100

    if (!replayGain || !replayGainEnabled) {
      return audioVolume * 1
    }
    const gain = calculateReplayGain(replayGain)

    return audioVolume * gain
  }, [replayGain, replayGainEnabled, volume])

  const { resumeContext, setupGain } = useAudioContext(audioRef.current)

  const ignoreGain = !isSong || replayGainError

  // Инициализация crossfade
  useEffect(() => {
    if (audioRef.current) {
      crossfadeService.init(audioRef.current)
      
      // Настройка параметров из store
      crossfadeService.configure({
        duration: playbackSettings.crossfadeSeconds,
        easing: 'ease-in-out',
      })
    }
    
    return () => {
      crossfadeService.destroy()
    }
  }, [audioRef, playbackSettings.crossfadeSeconds])

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

  useEffect(() => {
    if (ignoreGain || !audioRef.current) return

    if (gainValue === previousGain) return

    setupGain(gainValue, replayGain)
    setPreviousGain(gainValue)
  }, [audioRef, ignoreGain, gainValue, previousGain, replayGain, setupGain])

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

    // Другие ошибки - старое поведение
    toast.error(t('warnings.songError'))

    if (replayGainEnabled || !replayGainError) {
      setReplayGainEnabled(false)
      setReplayGainError(true)
      window.location.reload()
    }
  }, [
    audioRef,
    replayGainEnabled,
    replayGainError,
    setReplayGainEnabled,
    setReplayGainError,
    t,
  ])

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
          const { currentSong } = usePlayerStore.getState().songlist
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

  // ✅ Crossfade - плавные переходы между треками
  // Обработчик для crossfade - срабатывает когда трек заканчивается
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playbackSettings.crossfadeEnabled) return

    const handleEnded = async () => {
      // Если есть следующий трек для crossfade - выполняем переход
      if (crossfadeNextTrack) {
        console.log('[Audio] Track ended, starting crossfade...')

        try {
          // Подготавливаем следующий трек если еще не готов
          if (!crossfadeService.isReady()) {
            await crossfadeService.prepareNextTrack(crossfadeNextTrack)
          }

          // Начинаем воспроизведение следующего трека (тихо)
          const nextAudio = crossfadeService['nextAudio']
          if (nextAudio) {
            nextAudio.muted = false // Включаем звук
            nextAudio.volume = 0
            await nextAudio.play()

            // Выполняем crossfade
            await crossfadeService.crossfade(() => {
              console.log('[Audio] Crossfade transition completed, switching track...')
              // Переключаем трек в плеере
              const { playNextSong } = usePlayerStore.getState()
              playNextSong()
              setCrossfadeNextTrack(null)
            })
          }
        } catch (error) {
          console.error('[Audio] Crossfade failed:', error)
          // Fallback - обычное переключение
          setCrossfadeNextTrack(null)
          const { playNextSong } = usePlayerStore.getState()
          playNextSong()
        }
      }
      // Если crossfadeNextTrack не установлен - обычное переключение (плеер сам переключит)
    }

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [audioRef, playbackSettings.crossfadeEnabled, crossfadeNextTrack])

  // Обработчик времени для подготовки crossfade
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !playbackSettings.crossfadeEnabled) return

    const handleTimeUpdate = async () => {
      const { currentSong, currentSongIndex, songlist } = usePlayerStore.getState()

      // Если до конца трека осталось меньше crossfade секунд
      const timeToEnd = audio.duration - audio.currentTime
      const crossfadeThreshold = playbackSettings.crossfadeSeconds

      if (timeToEnd <= crossfadeThreshold && timeToEnd > 0) {
        // Получаем следующий трек
        const nextIndex = currentSongIndex + 1
        if (nextIndex < songlist.currentList.length) {
          const nextSong = songlist.currentList[nextIndex]
          if (nextSong?.id) {
            // Для локальных треков используем url из трека или создаём file:// URL
            // Для серверных треков используем /rest/stream
            let nextSrc: string
            
            if ((nextSong as any).isLocal) {
              // Если есть готовый url (из IPC), используем его
              if ((nextSong as any).url) {
                nextSrc = (nextSong as any).url
              } else if ((nextSong as any).localPath) {
                console.warn('[Audio] Local track without url, this should not happen!')
                return
              } else {
                console.warn('[Audio] Local track without url or localPath:', nextSong.title)
                return
              }
            } else {
              // Серверный трек - используем актуальный URL из appStore
              nextSrc = getSongStreamUrl(nextSong.id)
            }

            // Если это не тот же трек что уже готовится
            if (crossfadeNextTrack !== nextSrc) {
              console.log(`[Audio] Preparing crossfade: ${timeToEnd.toFixed(1)}s to end, isLocal: ${(nextSong as any).isLocal}`)
              setCrossfadeNextTrack(nextSrc)
            }
          }
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [audioRef, playbackSettings.crossfadeEnabled, playbackSettings.crossfadeSeconds])

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
