import { Heart } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { cn } from '@/lib/utils'
import { useML } from '@/store/ml.store'
import {
  usePlayerActions,
  usePlayerSongStarred,
  usePlayerStore,
} from '@/store/player.store'

interface PlayerLikeButtonProps {
  disabled?: boolean
  className?: string
}

export function PlayerLikeButton({ disabled, className }: PlayerLikeButtonProps) {
  const isLiked = usePlayerSongStarred()
  const { starCurrentSong } = usePlayerActions()
  const { rateSong } = useML()
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)

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
    <SimpleTooltip text={isLiked ? 'Удалить из любимых' : 'Добавить в любимые'}>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={handleLike}
        data-testid="player-button-like"
        className={cn(
          'rounded-full shrink-0 [&_svg]:size-6',
          isLiked && 'text-red-500',
          className,
        )}
      >
        <Heart className={isLiked ? 'fill-red-500 text-red-500' : 'text-secondary-foreground'} />
      </Button>
    </SimpleTooltip>
  )
}
