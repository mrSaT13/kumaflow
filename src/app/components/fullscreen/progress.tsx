import { useCallback, useMemo, useState } from 'react'
import { ProgressSlider } from '@/app/components/ui/slider'
import {
  usePlayerActions,
  usePlayerDuration,
  usePlayerProgress,
  usePlayerRef,
  usePlayerSonglist,
} from '@/store/player.store'
import { usePlaybackSettings } from '@/store/playback.store'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { QualityBadge } from '@/app/components/player/quality-badge'
import { DotProgress } from './dot-progress'
import { SpectrogramProgress } from './spectrogram-progress'

let isSeeking = false

export function FullscreenProgress() {
  const progress = usePlayerProgress()
  const [localProgress, setLocalProgress] = useState(progress)
  const audioPlayerRef = usePlayerRef()
  const currentDuration = usePlayerDuration()
  const { setProgress } = usePlayerActions()
  const { currentSong } = usePlayerSonglist()
  const progressBarType = usePlaybackSettings((state) => state.settings.progressBarType)

  // Переключение времени: всего / оставшееся
  const [showRemaining, setShowRemaining] = useState(false)

  const updateAudioCurrentTime = useCallback(
    (value: number) => {
      isSeeking = false
      if (audioPlayerRef) {
        audioPlayerRef.currentTime = value
      }
    },
    [audioPlayerRef],
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

  // Рендерим нужный тип прогресс бара
  const renderProgressBar = () => {
    const commonProps = {
      progress: isSeeking ? localProgress : progress,
      duration: currentDuration,
      onSeek: handleSeeked,
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
            variant="secondary"
            defaultValue={[0]}
            value={isSeeking ? [localProgress] : [progress]}
            tooltipTransformer={convertSecondsToTime}
            max={currentDuration}
            step={1}
            className="w-full h-4"
            onValueChange={([value]) => handleSeeking(value)}
            onValueCommit={([value]) => handleSeeked(value)}
            onPointerUp={handleSeekedFallback}
            onMouseUp={handleSeekedFallback}
          />
        )
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-[50px] max-w-[60px] text-right drop-shadow-lg">
        {currentTime}
      </div>

      <div className="flex-1">
        {renderProgressBar()}
      </div>

      <div
        className="min-w-[50px] max-w-[60px] text-left drop-shadow-lg cursor-pointer hover:text-primary/80 transition-colors"
        onClick={handleDurationClick}
        title={showRemaining ? 'Показать общее время' : 'Показать оставшееся время'}
      >
        {showRemaining ? '-' : ''}{songDuration}
      </div>

      {/* Quality Badge */}
      {currentSong && (
        <div className="ml-2">
          <QualityBadge song={currentSong} />
        </div>
      )}
    </div>
  )
}
