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

  useEffect(() => {
    if (ignoreGain || !audioRef.current) return

    if (gainValue === previousGain) return

    setupGain(gainValue, replayGain)
    setPreviousGain(gainValue)
  }, [audioRef, ignoreGain, gainValue, previousGain, replayGain, setupGain])

  const handleSongError = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    logger.error('Audio load error', {
      src: audio.src,
      networkState: audio.networkState,
      readyState: audio.readyState,
      error: audio.error,
    })

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

          // Отправляем Now Playing в Navidrome и Last.fm
          const { currentSong } = usePlayerStore.getState().songlist
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

  // ⚠️ ЗАКОММЕНТИРОВАНО: Crossfade требует архитектурных изменений (два audio элемента)
  // TODO: Реализовать полноценный crossfade с двумя audio элементами
  /*
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
            const nextSrc = `/rest/stream?id=${nextSong.id}&v=1.16.1&c=KumaFlow`

            // Если это не тот же трек что уже готовится
            if (crossfadeNextTrack !== nextSrc) {
              console.log(`[Audio] Preparing crossfade: ${timeToEnd.toFixed(1)}s to end`)
              setCrossfadeNextTrack(nextSrc)
            }
          }
        }
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [audioRef, playbackSettings.crossfadeEnabled, playbackSettings.crossfadeSeconds])
  */

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
