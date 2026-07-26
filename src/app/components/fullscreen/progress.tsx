import { useCallback, useMemo, useState } from 'react'
import { ProgressSlider } from '@/app/components/ui/slider'
import { useProgressSeek } from '@/app/hooks/use-progress-seek'
import {
  usePlayerDuration,
  usePlayerSonglist,
} from '@/store/player.store'
import { usePlaybackSettings } from '@/store/playback.store'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { QualityBadge } from '@/app/components/player/quality-badge'
import { DotProgress } from './dot-progress'
import { SpectrogramProgress } from './spectrogram-progress'

export function FullscreenProgress() {
  const currentDuration = usePlayerDuration()
  const { currentSong } = usePlayerSonglist()
  const progressBarType = usePlaybackSettings((state) => state.settings.progressBarType)
  const {
    progress,
    displayProgress,
    beginSeek,
    updateSeek,
    commitSeek,
    handlePointerUp,
  } = useProgressSeek(currentDuration)

  const [showRemaining, setShowRemaining] = useState(false)

  const currentTime = useMemo(
    () => convertSecondsToTime(displayProgress),
    [displayProgress],
  )

  const songDuration = useMemo(() => {
    const time = showRemaining
      ? currentDuration - progress
      : currentDuration
    return convertSecondsToTime(time)
  }, [currentDuration, progress, showRemaining])

  const handleDurationClick = useCallback(() => {
    setShowRemaining((prev) => !prev)
  }, [])

  const renderProgressBar = () => {
    const commonProps = {
      progress: displayProgress,
      duration: currentDuration,
      onSeek: commitSeek,
      onSeekStart: beginSeek,
      onSeekChange: updateSeek,
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
            value={[displayProgress]}
            tooltipTransformer={convertSecondsToTime}
            max={currentDuration}
            step={1}
            trackHeight={10}
            className="h-12 w-full touch-pan-x"
            onPointerDown={beginSeek}
            onValueChange={([value]) => updateSeek(value)}
            onValueCommit={([value]) => commitSeek(value)}
            onPointerUp={handlePointerUp}
            onMouseUp={handlePointerUp}
          />
        )
    }
  }

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <div className="min-w-[42px] max-w-[50px] shrink-0 text-right text-sm drop-shadow-lg md:min-w-[50px] md:max-w-[60px]">
        {currentTime}
      </div>

      <div className="min-w-0 flex-1 py-1">
        {renderProgressBar()}
      </div>

      <div
        className="min-w-[42px] max-w-[50px] shrink-0 cursor-pointer text-left text-sm drop-shadow-lg transition-colors hover:text-primary/80 md:min-w-[50px] md:max-w-[60px]"
        onClick={handleDurationClick}
        title={showRemaining ? 'Показать общее время' : 'Показать оставшееся время'}
      >
        {showRemaining ? '-' : ''}{songDuration}
      </div>

      {currentSong && (
        <div className="ml-1 hidden shrink-0 sm:block">
          <QualityBadge song={currentSong} />
        </div>
      )}
    </div>
  )
}
