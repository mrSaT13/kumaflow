import { clsx } from 'clsx'
import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Heart,
  ThumbsDown,
} from 'lucide-react'
import { Fragment } from 'react/jsx-runtime'
import RepeatOne from '@/app/components/icons/repeat-one'
import { Button } from '@/app/components/ui/button'
import { SleepTimerButton } from '@/app/components/player/sleep-timer-button'
import { AutoDJButton } from '@/app/components/player/auto-dj-button'
import { FullscreenSettings } from './settings'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerLoop,
  usePlayerMediaType,
  usePlayerPrevAndNext,
  usePlayerShuffle,
  usePlayerStore,
} from '@/store/player.store'
import { LoopState } from '@/types/playerContext'
import { useML } from '@/store/ml.store'

export function FullscreenControls({
  compact = false,
  variant = 'all',
}: {
  compact?: boolean
  variant?: 'all' | 'playback' | 'secondary'
}) {
  const isPlaying = usePlayerIsPlaying()
  const isShuffleActive = usePlayerShuffle()
  const loopState = usePlayerLoop()
  const { hasPrev, hasNext } = usePlayerPrevAndNext()
  const { isSong } = usePlayerMediaType()
  const {
    isPlayingOneSong,
    toggleShuffle,
    playNextSong,
    playPrevSong,
    togglePlayPause,
    toggleLoop,
  } = usePlayerActions()
  const { rateSong } = useML()
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)

  const extraButtons = (
    <>
      {isSong && (
        <Button
          size="icon"
          variant="ghost"
          className={compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary}
          style={{ ...buttonsStyle.style }}
          onClick={() => {
            if (currentSong?.id) {
              rateSong(currentSong.id, false, {
                title: currentSong.title,
                artist: currentSong.artist,
                artistId: currentSong.artistId,
                genre: currentSong.genre,
                album: currentSong.album,
              })
            }
            playNextSong()
          }}
        >
          <ThumbsDown className={compact ? buttonsStyle.secondaryIconCompact : buttonsStyle.secondaryIcon} />
        </Button>
      )}

      <SleepTimerButton />

      {isSong && <AutoDJButton />}

      <Button
        size="icon"
        variant="ghost"
        data-state={isShuffleActive && 'active'}
        className={clsx(
          compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary,
          isShuffleActive && buttonsStyle.activeDot,
        )}
        style={{ ...buttonsStyle.style }}
        onClick={() => toggleShuffle()}
        disabled={isPlayingOneSong() || !hasNext}
      >
        <Shuffle className={compact ? buttonsStyle.secondaryIconCompact : buttonsStyle.secondaryIcon} />
      </Button>

      <FullscreenSettings compact={compact} />
    </>
  )

  const repeatButton = (
    <Button
      size="icon"
      variant="ghost"
      data-state={loopState !== LoopState.Off && 'active'}
      className={clsx(
        compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary,
        loopState !== LoopState.Off && buttonsStyle.activeDot,
      )}
      onClick={() => toggleLoop()}
      style={{ ...buttonsStyle.style }}
    >
      {loopState === LoopState.One && !compact ? (
        <RepeatOne className={compact ? buttonsStyle.secondaryIconCompact : buttonsStyle.secondaryIcon} />
      ) : (
        <Repeat className={compact ? buttonsStyle.secondaryIconCompact : buttonsStyle.secondaryIcon} />
      )}
    </Button>
  )

  const playbackButtons = (
    <>
      <Button
        size="icon"
        variant="ghost"
        className={compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary}
        style={{ ...buttonsStyle.style }}
        onClick={() => playPrevSong()}
        disabled={!hasPrev}
      >
        <SkipBack className={compact ? buttonsStyle.secondaryIconFilledCompact : buttonsStyle.secondaryIconFilled} />
      </Button>

      <Button
        size="icon"
        variant="link"
        className={compact ? buttonsStyle.mainCompact : buttonsStyle.main}
        style={{ ...buttonsStyle.style }}
        onClick={() => togglePlayPause()}
      >
        {isPlaying ? (
          <Pause className={compact ? buttonsStyle.mainIconCompact : buttonsStyle.mainIcon} strokeWidth={1} />
        ) : (
          <Play className={compact ? buttonsStyle.mainIconCompact : buttonsStyle.mainIcon} />
        )}
      </Button>

      <Button
        size="icon"
        variant="ghost"
        className={compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary}
        style={{ ...buttonsStyle.style }}
        onClick={() => playNextSong()}
        disabled={!hasNext && loopState !== LoopState.All}
      >
        <SkipForward className={compact ? buttonsStyle.secondaryIconFilledCompact : buttonsStyle.secondaryIconFilled} />
      </Button>
    </>
  )

  if (compact && variant === 'playback') {
    return (
      <div className="flex items-center justify-center gap-3">
        {playbackButtons}
      </div>
    )
  }

  if (compact && variant === 'secondary') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {extraButtons}
        {repeatButton}
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-1">
          {extraButtons}
          {repeatButton}
        </div>
        <div className="flex items-center justify-center gap-2">
          {playbackButtons}
        </div>
      </div>
    )
  }

  return (
    <Fragment>
      {extraButtons}
      {isSong && <FullscreenLikeButton />}
      {playbackButtons}
      {repeatButton}
    </Fragment>
  )
}

export function FullscreenLikeButton({ compact = false }: { compact?: boolean }) {
  const { starCurrentSong } = usePlayerActions()
  const { rateSong } = useML()
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const isLiked = usePlayerStore((state) => state.playerState.isSongStarred)
  const { isSong } = usePlayerMediaType()

  if (!isSong) return <div className={compact ? 'size-12' : 'size-12'} />

  const handleLike = () => {
    if (!currentSong?.id) return
    starCurrentSong()
    rateSong(currentSong.id, !isLiked, {
      title: currentSong.title,
      artist: currentSong.artist,
      artistId: currentSong.artistId,
      genre: currentSong.genre,
      album: currentSong.album,
    })
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      data-state={isLiked && 'active'}
      className={clsx(
        compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary,
        isLiked && 'text-red-500 hover:text-red-400',
      )}
      style={{ ...buttonsStyle.style }}
      onClick={handleLike}
    >
      <Heart
        className={clsx(
          compact ? buttonsStyle.secondaryIconCompact : buttonsStyle.secondaryIcon,
          isLiked && 'fill-red-500',
        )}
      />
    </Button>
  )
}

export const buttonsStyle = {
  main: 'w-14 h-14 rounded-full shadow-lg bg-secondary-foreground hover:scale-105 transition-transform will-change-transform',
  mainCompact: 'h-16 w-16 rounded-full bg-secondary-foreground shadow-lg transition-transform will-change-transform hover:scale-105',
  mainIcon: 'w-6 h-6 text-secondary fill-secondary',
  mainIconCompact: 'h-7 w-7 text-secondary fill-secondary',
  secondary:
    'relative w-12 h-12 rounded-full text-secondary-foreground hover:text-secondary-foreground data-[state=active]:text-primary hover:bg-transparent hover:scale-110 transition-transform will-change-transform',
  secondaryCompact:
    'relative h-12 w-12 rounded-full text-secondary-foreground transition-transform will-change-transform hover:scale-110 hover:bg-transparent hover:text-secondary-foreground data-[state=active]:text-primary',
  secondaryIcon: 'w-6 h-6 drop-shadow-lg',
  secondaryIconCompact: 'h-6 w-6 drop-shadow-lg',
  secondaryIconFilled:
    'w-6 h-6 text-secondary-foreground fill-secondary-foreground drop-shadow-lg',
  secondaryIconFilledCompact:
    'h-6 w-6 fill-secondary-foreground text-secondary-foreground drop-shadow-lg',
  activeDot: 'player-button-active',
  style: {
    backfaceVisibility: 'hidden' as const,
  },
}
