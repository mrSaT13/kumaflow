import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { cn } from '@/lib/utils'
import { usePlayerCurrentSong } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import { getMainScrollElement } from '@/utils/scrollPageToTop'
import debounce from 'lodash/debounce'
import { useEffect, useRef } from 'react'

function formatDuration(seconds?: number) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getSongArtist(song: ISong) {
  return (
    song.artist ||
    (song as { artistName?: string }).artistName ||
    'Неизвестный артист'
  )
}

interface SongsMobileListProps {
  songs: ISong[]
  onPlaySong: (index: number) => void
  fetchNextPage?: () => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  emptyMessage?: string
}

export function SongsMobileList({
  songs,
  onPlaySong,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  emptyMessage = 'Нет треков',
}: SongsMobileListProps) {
  const currentSong = usePlayerCurrentSong()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current = getMainScrollElement()
  }, [])

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement || !hasNextPage || !fetchNextPage) return

    const handleScroll = debounce(() => {
      const { scrollTop, clientHeight, scrollHeight } = scrollElement
      const isNearBottom =
        scrollTop + clientHeight >= scrollHeight - scrollHeight / 8

      if (isNearBottom) fetchNextPage()
    }, 200)

    scrollElement.addEventListener('scroll', handleScroll)
    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [fetchNextPage, hasNextPage])

  if (songs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center px-4 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="divide-y border-t">
      {songs.map((song, index) => {
        const isActive = currentSong?.id === song.id

        return (
          <button
            key={`${song.id}-${index}`}
            type="button"
            className={cn(
              'flex w-full min-w-0 items-center gap-2 px-3 py-3 text-left active:bg-accent/50',
              isActive && 'bg-accent/30',
            )}
            onClick={() => onPlaySong(index)}
          >
            <span
              className={cn(
                'w-5 shrink-0 text-center text-xs tabular-nums',
                isActive
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground',
              )}
            >
              {index + 1}
            </span>
            <img
              src={getSimpleCoverArtUrl(
                song.coverArt || song.albumId || song.id,
                song.coverArt ? 'song' : 'album',
                '100',
              )}
              alt={song.title}
              className="size-11 shrink-0 rounded object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = '/default_album_art.png'
              }}
            />
            <div className="min-w-0 flex-1 overflow-hidden">
              <div
                className={cn(
                  'truncate text-[15px] font-medium leading-tight',
                  isActive && 'text-primary',
                )}
              >
                {song.title}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {getSongArtist(song)}
              </div>
            </div>
            <span className="shrink-0 pl-1 text-xs tabular-nums text-muted-foreground">
              {formatDuration(song.duration)}
            </span>
          </button>
        )
      })}
      {isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Загрузка...
        </div>
      )}
    </div>
  )
}
