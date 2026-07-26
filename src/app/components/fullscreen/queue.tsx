import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerSonglist,
} from '@/store/player.store'
import { QueueItem } from './queue-item'

const UPCOMING_LIMIT = 10

export function FullscreenSongQueue() {
  const { t } = useTranslation()
  const { setSongList } = usePlayerActions()
  const { currentList, currentSongIndex, currentSong } = usePlayerSonglist()
  const isPlaying = usePlayerIsPlaying()

  const visibleQueue = useMemo(() => {
    if (currentList.length === 0 || currentSongIndex < 0) return []

    const start = currentSongIndex
    const end = Math.min(currentList.length, start + 1 + UPCOMING_LIMIT)

    return currentList.slice(start, end).map((song, offset) => ({
      song,
      realIndex: start + offset,
      isCurrent: offset === 0,
      upcomingNumber: offset === 0 ? null : offset,
    }))
  }, [currentList, currentSongIndex])

  if (visibleQueue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <span>{t('queue.empty', { defaultValue: 'Очередь пуста' })}</span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <div className="flex flex-col gap-0.5 py-1">
          {visibleQueue.map(({ song, realIndex, isCurrent, upcomingNumber }) => (
            <QueueItem
              key={`${song.id}-${realIndex}`}
              data-row-index={realIndex}
              data-state={isCurrent ? 'active' : 'inactive'}
              song={song}
              isCurrent={isCurrent}
              upcomingNumber={upcomingNumber}
              isPlaying={isCurrent && isPlaying}
              onClick={() => {
                if (!isCurrent) {
                  setSongList(currentList, realIndex)
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
