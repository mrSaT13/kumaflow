import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useML } from '@/store/ml.store'
import { Button } from '@/app/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/app/components/ui/tooltip'
import type { ISong } from '@/types/responses/song'

interface LikeDislikeButtonsProps {
  songId: string
  song?: ISong // Информация о треке для обновления весов
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export const LikeDislikeButtons = memo(
  ({ songId, song, className = '', size = 'md' }: LikeDislikeButtonsProps) => {
    const { ratings, rateSong } = useML()
    const rating = ratings[songId]
    const currentLike = rating?.like ?? null

    const sizeClasses = {
      sm: 'p-1 h-7 w-7',
      md: 'p-2 h-9 w-9',
      lg: 'p-3 h-11 w-11',
    }

    const iconSize = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5',
    }

    const handleLike = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        const newLike = currentLike === true ? null : true
        // Передаем информацию о треке если есть
        if (song) {
          rateSong(songId, newLike, {
            title: song.title,
            artist: song.artist,
            artistId: song.artistId,
            genre: song.genre,
            album: song.album,
          })
        } else {
          rateSong(songId, newLike)
        }
      },
      [songId, currentLike, rateSong, song],
    )

    const handleDislike = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        const newLike = currentLike === false ? null : false
        // Передаем информацию о треке если есть
        if (song) {
          rateSong(songId, newLike, {
            title: song.title,
            artist: song.artist,
            artistId: song.artistId,
            genre: song.genre,
            album: song.album,
          })
        } else {
          rateSong(songId, newLike)
        }
      },
      [songId, currentLike, rateSong, song],
    )

    return (
      <TooltipProvider delayDuration={200}>
        <div
          className={`flex items-center gap-1 ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={currentLike === true ? 'default' : 'ghost'}
                size="sm"
                className={`${sizeClasses[size]} ${
                  currentLike === true
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'hover:bg-green-600/20 hover:text-green-600'
                }`}
                onClick={handleLike}
              >
                <ThumbsUp className={iconSize[size]} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {currentLike === true ? 'Убрать лайк' : 'Нравится'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={currentLike === false ? 'default' : 'ghost'}
                size="sm"
                className={`${sizeClasses[size]} ${
                  currentLike === false
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'hover:bg-red-600/20 hover:text-red-600'
                }`}
                onClick={handleDislike}
              >
                <ThumbsDown className={iconSize[size]} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {currentLike === false ? 'Убрать дизлайк' : 'Не нравится'}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    )
  },
)

LikeDislikeButtons.displayName = 'LikeDislikeButtons'

/**
 * Compact version for table rows
 */
export const LikeDislikeCompact = memo(
  ({ songId, song }: { songId: string; song?: ISong }) => {
    const { ratings, rateSong } = useML()
    const rating = ratings[songId]
    const currentLike = rating?.like ?? null

    return (
      <div className="flex items-center gap-0.5">
        <button
          className={`p-1 rounded transition-colors ${
            currentLike === true
              ? 'text-green-600 hover:text-green-700'
              : 'text-muted-foreground hover:text-green-600'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            if (song) {
              rateSong(songId, currentLike === true ? null : true, {
                title: song.title,
                artist: song.artist,
                artistId: song.artistId,
                genre: song.genre,
                album: song.album,
              })
            } else {
              rateSong(songId, currentLike === true ? null : true)
            }
          }}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>

        <button
          className={`p-1 rounded transition-colors ${
            currentLike === false
              ? 'text-red-600 hover:text-red-700'
              : 'text-muted-foreground hover:text-red-600'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            if (song) {
              rateSong(songId, currentLike === false ? null : false, {
                title: song.title,
                artist: song.artist,
                artistId: song.artistId,
                genre: song.genre,
                album: song.album,
              })
            } else {
              rateSong(songId, currentLike === false ? null : false)
            }
          }}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  },
)

LikeDislikeCompact.displayName = 'LikeDislikeCompact'
