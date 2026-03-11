import { clsx } from 'clsx'
import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Heart,
  ThumbsDown,
} from 'lucide-react'
import { Fragment } from 'react/jsx-runtime'
import RepeatOne from '@/app/components/icons/repeat-one'
import { Button } from '@/app/components/ui/button'
import { SleepTimerButton } from '@/app/components/player/sleep-timer-button'
import { AutoDJButton } from '@/app/components/player/auto-dj-button'
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
import { cn } from '@/lib/utils'

export function FullscreenControls() {
  const isPlaying = usePlayerIsPlaying()
  const isShuffleActive = usePlayerShuffle()
  const loopState = usePlayerLoop()
  const { hasPrev, hasNext } = usePlayerPrevAndNext()
  const audioPlayerRef = usePlayerStore((state) => state.playerState.audioPlayerRef)
  const { isSong } = usePlayerMediaType()
  const {
    isPlayingOneSong,
    toggleShuffle,
    playNextSong,
    playPrevSong,
    togglePlayPause,
    toggleLoop,
    starCurrentSong,
  } = usePlayerActions()
  const { rateSong } = useML()
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const isLiked = usePlayerStore((state) => state.playerState.isSongStarred)

  const handleLike = () => {
    if (currentSong?.id) {
      starCurrentSong()
      rateSong(currentSong.id, !isLiked, {
        title: currentSong.title,
        artist: currentSong.artist,
        artistId: currentSong.artistId,
        genre: currentSong.genre,
        album: currentSong.album,
      })
    }
  }

  const handleSeekAction = (value: number) => {
    // Пытаемся найти audio элемент напрямую
    const audio = document.querySelector('audio')
    console.log('[FullscreenControls] handleSeekAction called with:', value, 'audio:', audio)
    if (!audio) {
      console.warn('[FullscreenControls] No audio element found')
      return
    }
    try {
      audio.currentTime += value
      console.log('[FullscreenControls] Seeked to:', audio.currentTime)
    } catch (error) {
      console.error('[FullscreenControls] Seek failed:', error)
    }
  }

  return (
    <Fragment>
      {/* ЛЕВАЯ СТОРОНА - Дизлайк, Like, Таймер, Shuffle */}
      {isSong && (
        <Button
          size="icon"
          variant="ghost"
          className={buttonsStyle.secondary}
          style={{ ...buttonsStyle.style }}
          onClick={() => {
            // ML: Запоминаем дизлайк и переключаем на следующий трек
            if (currentSong?.id) {
              rateSong(currentSong.id, false, {
                title: currentSong.title,
                artist: currentSong.artist,
                artistId: currentSong.artistId,
                genre: currentSong.genre,
                album: currentSong.album,
              })
            }
            // Переключаем на следующий трек
            playNextSong()
          }}
        >
          <ThumbsDown className={buttonsStyle.secondaryIcon} />
        </Button>
      )}
      
      {isSong && (
        <Button
          size="icon"
          variant="ghost"
          data-state={isLiked && 'active'}
          className={clsx(
            buttonsStyle.secondary,
            isLiked && 'text-red-500 hover:text-red-400'
          )}
          style={{ ...buttonsStyle.style }}
          onClick={handleLike}
        >
          <Heart className={clsx(buttonsStyle.secondaryIcon, isLiked && 'fill-red-500')} />
        </Button>
      )}
      
      {/* Таймер - используем готовый компонент */}
      <SleepTimerButton />

      {/* AutoDJ Button */}
      {isSong && <AutoDJButton />}

      <Button
        size="icon"
        variant="ghost"
        data-state={isShuffleActive && 'active'}
        className={clsx(
          buttonsStyle.secondary,
          isShuffleActive && buttonsStyle.activeDot,
        )}
        style={{ ...buttonsStyle.style }}
        onClick={() => toggleShuffle()}
        disabled={isPlayingOneSong() || !hasNext}
      >
        <Shuffle className={buttonsStyle.secondaryIcon} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={buttonsStyle.secondary}
        style={{ ...buttonsStyle.style }}
        onClick={() => playPrevSong()}
        disabled={!hasPrev}
      >
        <SkipBack className={buttonsStyle.secondaryIconFilled} />
      </Button>
      
      {/* Кнопка -15с */}
      <Button
        size="icon"
        variant="ghost"
        className={clsx(buttonsStyle.secondary, 'text-sm')}
        style={{ ...buttonsStyle.style }}
        onClick={() => handleSeekAction(-15)}
        title="Назад на 15 секунд"
      >
        <span className="absolute text-[8px] font-light -top-0.5 -left-0.5">
          15
        </span>
        <RotateCcw className={buttonsStyle.secondaryIcon} />
      </Button>
      
      <Button
        size="icon"
        variant="link"
        className={buttonsStyle.main}
        style={{ ...buttonsStyle.style }}
        onClick={() => togglePlayPause()}
      >
        {isPlaying ? (
          <Pause className={buttonsStyle.mainIcon} strokeWidth={1} />
        ) : (
          <Play className={buttonsStyle.mainIcon} />
        )}
      </Button>
      
      {/* Кнопка +30с */}
      <Button
        size="icon"
        variant="ghost"
        className={clsx(buttonsStyle.secondary, 'text-sm')}
        style={{ ...buttonsStyle.style }}
        onClick={() => handleSeekAction(30)}
        title="Вперёд на 30 секунд"
      >
        <span className="absolute text-[8px] font-light -top-0.5 -right-0.5">
          30
        </span>
        <RotateCw className={buttonsStyle.secondaryIcon} />
      </Button>
      
      <Button
        size="icon"
        variant="ghost"
        className={buttonsStyle.secondary}
        style={{ ...buttonsStyle.style }}
        onClick={() => playNextSong()}
        disabled={!hasNext && loopState !== LoopState.All}
      >
        <SkipForward className={buttonsStyle.secondaryIconFilled} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        data-state={loopState !== LoopState.Off && 'active'}
        className={clsx(
          buttonsStyle.secondary,
          loopState !== LoopState.Off && buttonsStyle.activeDot,
        )}
        onClick={() => toggleLoop()}
        style={{ ...buttonsStyle.style }}
      >
        {loopState === LoopState.Off && (
          <Repeat className={buttonsStyle.secondaryIcon} />
        )}
        {loopState === LoopState.All && (
          <Repeat className={buttonsStyle.secondaryIcon} />
        )}
        {loopState === LoopState.One && (
          <RepeatOne className={buttonsStyle.secondaryIcon} />
        )}
      </Button>
    </Fragment>
  )
}

export const buttonsStyle = {
  main: 'w-14 h-14 rounded-full shadow-lg bg-secondary-foreground hover:scale-105 transition-transform will-change-transform',
  mainIcon: 'w-6 h-6 text-secondary fill-secondary',
  secondary:
    'relative w-12 h-12 rounded-full text-secondary-foreground hover:text-secondary-foreground data-[state=active]:text-primary hover:bg-transparent hover:scale-110 transition-transform will-change-transform',
  secondaryIcon: 'w-6 h-6 drop-shadow-lg',
  secondaryIconFilled:
    'w-6 h-6 text-secondary-foreground fill-secondary-foreground drop-shadow-lg',
  activeDot: 'player-button-active',
  style: {
    backfaceVisibility: 'hidden' as const,
  },
}
