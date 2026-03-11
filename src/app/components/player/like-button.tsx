import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { Heart, ThumbsDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { useML } from '@/store/ml.store'
import {
  usePlayerActions,
  usePlayerSongStarred,
  usePlayerStore,
} from '@/store/player.store'

interface PlayerLikeButtonProps {
  disabled: boolean
}

export function PlayerLikeButton({ disabled }: PlayerLikeButtonProps) {
  const { t } = useTranslation()
  const isSongStarred = usePlayerSongStarred()
  const { title: song, artist } = usePlayerStore(
    (state) => state.songlist.currentSong,
  )
  const { starCurrentSong, playNextSong } = usePlayerActions()
  const { ratings, rateSong } = useML()

  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const currentRating = currentSong?.id ? ratings[currentSong.id]?.like : null

  // Исправляем controlled/uncontrolled warning
  const [mountedRating, setMountedRating] = useState<boolean | null>(null)

  useEffect(() => {
    setMountedRating(currentRating)
  }, [currentRating])

  const translationLabel = `player.tooltips.${isSongStarred ? 'dislike' : 'like'}`
  const likeTooltip = t(translationLabel, { song, artist })

  const handleLike = () => {
    starCurrentSong()
    // ML: Запоминаем лайк
    if (currentSong?.id) {
      rateSong(currentSong.id, !isSongStarred, {
        title: currentSong.title,
        artist: currentSong.artist,
        artistId: currentSong.artistId,
        genre: currentSong.genre,
        album: currentSong.album,
      })
    }
  }

  const handleDislike = () => {
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
  }

  return (
    <div className="flex items-center gap-1">
      <SimpleTooltip text={likeTooltip}>
        <Button
          variant="ghost"
          className="rounded-full w-10 h-10 p-3 text-secondary-foreground"
          disabled={disabled}
          onClick={handleLike}
          data-testid="player-like-button"
        >
          <Heart
            className={clsx(
              'w-5 h-5',
              mountedRating === true && 'text-green-500 fill-green-500',
              isSongStarred && mountedRating !== true && 'text-red-500 fill-red-500',
            )}
            data-testid="player-like-icon"
          />
        </Button>
      </SimpleTooltip>

      <SimpleTooltip text={t('player.tooltips.dislike', { song, artist })}>
        <Button
          variant="ghost"
          className="rounded-full w-10 h-10 p-3 text-secondary-foreground"
          disabled={disabled}
          onClick={handleDislike}
          data-testid="player-dislike-button"
        >
          <ThumbsDown
            className={clsx(
              'w-5 h-5',
              mountedRating === false && 'text-red-500 fill-red-500',
            )}
            data-testid="player-dislike-icon"
          />
        </Button>
      </SimpleTooltip>
    </div>
  )
}
