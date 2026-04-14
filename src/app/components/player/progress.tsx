import clsx from 'clsx'
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ProgressSlider } from '@/app/components/ui/slider'
import { podcasts } from '@/service/podcasts'
import { subsonic } from '@/service/subsonic'
import {
  usePlayerActions,
  usePlayerDuration,
  usePlayerIsPlaying,
  usePlayerMediaType,
  usePlayerProgress,
  usePlayerSonglist,
} from '@/store/player.store'
import { usePlaybackStore } from '@/store/playback.store'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { logger } from '@/utils/logger'
import { QualityBadge } from './quality-badge'
import { DotProgress } from '@/app/components/fullscreen/dot-progress'
import { SpectrogramProgress } from '@/app/components/fullscreen/spectrogram-progress'
import { getGenreColor, generateCSSGradient } from '@/utils/genreColors'

interface PlayerProgressProps {
  audioRef: RefObject<HTMLAudioElement>
}

let isSeeking = false

export function PlayerProgress({ audioRef }: PlayerProgressProps) {
  const progress = usePlayerProgress()
  const [localProgress, setLocalProgress] = useState(progress)
  const currentDuration = usePlayerDuration()
  const isPlaying = usePlayerIsPlaying()
  const { currentSong, currentList, podcastList, currentSongIndex } =
    usePlayerSonglist()
  const { isSong, isPodcast } = usePlayerMediaType()
  const { setProgress, setUpdatePodcastProgress, getCurrentPodcastProgress } =
    usePlayerActions()
  const isScrobbleSentRef = useRef(false)
  const progressBarType = usePlaybackStore((state) => state.settings.progressBarType)

  // Переключение времени: всего / оставшееся
  const [showRemaining, setShowRemaining] = useState(false)

  const isEmpty = isSong && currentList.length === 0

  const updateAudioCurrentTime = useCallback(
    (value: number) => {
      isSeeking = false
      if (audioRef.current) {
        audioRef.current.currentTime = value
      }
    },
    [audioRef],
  )

  const handleSeeking = useCallback((amount: number) => {
    isSeeking = true
    setLocalProgress(amount)
  }, [])

  const handleSeeked = useCallback(
    (amount: number) => {
      updateAudioCurrentTime(amount)
      setProgress(amount)
      setLocalProgress(amount)
    },
    [setProgress, updateAudioCurrentTime],
  )

  const handleSeekedFallback = useCallback(() => {
    if (localProgress !== progress) {
      updateAudioCurrentTime(localProgress)
      setProgress(localProgress)
    }
  }, [localProgress, progress, setProgress, updateAudioCurrentTime])

  const currentTime = useMemo(
    () => convertSecondsToTime(isSeeking ? localProgress : progress),
    [isSeeking, localProgress, progress]
  )

  // Оставшееся или общее время
  const songDuration = useMemo(() => {
    const time = showRemaining 
      ? currentDuration - progress  // Оставшееся время
      : currentDuration             // Общее время
    return convertSecondsToTime(time)
  }, [currentDuration, progress, showRemaining])
  
  // Обработчик клика для переключения
  const handleDurationClick = useCallback(() => {
    setShowRemaining(prev => !prev)
  }, [])

  const sendScrobble = useCallback(async (songId: string) => {
    await subsonic.scrobble.send(songId)
  }, [])

  const progressTicks = useRef(0)

  useEffect(() => {
    if (isSeeking || !isPlaying) {
      return
    }
    if (isSong) {
      const progressPercentage = (progress / currentDuration) * 100

      if (progressPercentage === 0) {
        isScrobbleSentRef.current = false
        progressTicks.current = 0
      } else {
        progressTicks.current += 1

        if (
          (progressTicks.current >= currentDuration / 2 ||
            progressTicks.current >= 60 * 4) &&
          !isScrobbleSentRef.current
        ) {
          sendScrobble(currentSong.id)
          isScrobbleSentRef.current = true
        }
      }
    }
  }, [
    progress,
    currentDuration,
    isSong,
    sendScrobble,
    currentSong.id,
    isPlaying,
  ])

  // Used to save listening progress to backend every 30 seconds
  useEffect(() => {
    if (!isPodcast || !podcastList) return
    if (progress === 0) return

    const send = (progress / 30) % 1 === 0
    if (!send) return

    const podcast = podcastList[currentSongIndex] ?? null
    if (!podcast) return

    const podcastProgress = getCurrentPodcastProgress()
    if (progress === podcastProgress) return

    setUpdatePodcastProgress(progress)

    podcasts
      .saveEpisodeProgress(podcast.id, progress)
      .then(() => {
        logger.info('Progress sent:', progress)
      })
      .catch((error) => {
        logger.error('Error sending progress', error)
      })
  }, [
    currentSongIndex,
    getCurrentPodcastProgress,
    isPodcast,
    podcastList,
    progress,
    setUpdatePodcastProgress,
  ])

  const isProgressLarge = useMemo(() => {
    return localProgress >= 3600 || progress >= 3600
  }, [localProgress, progress])

  const isDurationLarge = useMemo(() => {
    return currentDuration >= 3600
  }, [currentDuration])

  // Автоподбор цвета по жанру (градиент)
  const progressBarGradient = useMemo(() => {
    if (!usePlaybackStore.getState().settings.autoColorByGenre) {
      return undefined  // Используем цвет по умолчанию
    }
    if (currentSong?.genre) {
      // Генерируем CSS градиент на основе жанра
      return generateCSSGradient([currentSong.genre])
    }
    return undefined
  }, [currentSong?.genre])

  // Рендерим нужный тип прогресс бара
  const renderProgressBar = () => {
    const commonProps = {
      progress: isSeeking ? localProgress : progress,
      duration: currentDuration,
      onSeek: handleSeeked,
      className: 'w-[32rem]',
    }

    switch (progressBarType) {
      case 'dot':
        return <DotProgress {...commonProps} />
      case 'spectrogram':
        return <SpectrogramProgress {...commonProps} />
      case 'line':
      default:
        return (
          <ProgressSlider
            defaultValue={[0]}
            value={isSeeking ? [localProgress] : [progress]}
            tooltipTransformer={convertSecondsToTime}
            max={currentDuration}
            step={1}
            className="cursor-pointer w-[32rem]"
            style={progressBarGradient ? { '--progress-gradient': progressBarGradient } as React.CSSProperties : undefined}
            onValueChange={([value]) => handleSeeking(value)}
            onValueCommit={([value]) => handleSeeked(value)}
            onPointerUp={handleSeekedFallback}
            onMouseUp={handleSeekedFallback}
            data-testid="player-progress-slider"
          />
        )
    }
  }

  return (
    <div
      className={clsx(
        'flex w-full justify-center items-center gap-2',
        isEmpty && 'opacity-50',
      )}
    >
      <small
        className={clsx(
          'text-xs text-muted-foreground text-right',
          isProgressLarge ? 'min-w-14' : 'min-w-10',
        )}
        data-testid="player-current-time"
      >
        {currentTime}
      </small>
      {!isEmpty || isPodcast ? (
        renderProgressBar()
      ) : (
        <ProgressSlider
          defaultValue={[0]}
          max={100}
          step={1}
          disabled={true}
          className="cursor-pointer w-[32rem] pointer-events-none"
        />
      )}
      <small
        className={clsx(
          'text-xs text-muted-foreground text-left cursor-pointer hover:text-primary transition-colors',
          isDurationLarge ? 'min-w-14' : 'min-w-10',
        )}
        data-testid="player-duration-time"
        onClick={handleDurationClick}
        title={showRemaining ? 'Показать общее время' : 'Показать оставшееся время'}
      >
        {showRemaining ? '-' : ''}{songDuration}
      </small>
      
      {/* Quality Badge */}
      {currentSong && (
        <div className="ml-1">
          <QualityBadge song={currentSong} />
        </div>
      )}
    </div>
  )
}
