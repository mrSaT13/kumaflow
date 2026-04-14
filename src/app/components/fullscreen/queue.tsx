import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Button } from '@/app/components/ui/button'
import { MapPin } from 'lucide-react'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerSonglist,
} from '@/store/player.store'
import { QueueItem } from './queue-item'

export function FullscreenSongQueue() {
  const { setSongList } = usePlayerActions()
  const { currentList, currentSongIndex, currentSong } = usePlayerSonglist()
  const isPlaying = usePlayerIsPlaying()
  const [showScrollButton, setShowScrollButton] = useState(false)

  const parentRef = useRef<HTMLDivElement>(null)

  const getScrollElement = () => {
    if (!parentRef.current) return null

    return parentRef.current.querySelector('[data-radix-scroll-area-viewport]')
  }

  const virtualizer = useVirtualizer({
    count: currentList.length,
    getScrollElement,
    estimateSize: () => 64,
    overscan: 5,
  })

  useEffect(() => {
    if (currentSongIndex >= 0) {
      virtualizer.scrollToIndex(currentSongIndex, { align: 'start' })
    }
  }, [currentSongIndex, virtualizer])

  // Показываем кнопку когда пользователь прокрутил далеко от текущего трека
  useEffect(() => {
    const scrollElement = getScrollElement()
    if (!scrollElement) return

    const handleScroll = () => {
      const currentTrackElement = scrollElement.querySelector(`[data-row-index="${currentSongIndex}"]`)
      if (currentTrackElement) {
        const rect = currentTrackElement.getBoundingClientRect()
        // Показываем кнопку если текущий трек не виден
        setShowScrollButton(rect.top < 0 || rect.bottom > window.innerHeight)
      }
    }

    scrollElement.addEventListener('scroll', handleScroll)
    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [currentSongIndex])

  const scrollToCurrentTrack = () => {
    if (currentSongIndex >= 0) {
      virtualizer.scrollToIndex(currentSongIndex, { align: 'center' })
    }
  }

  if (currentList.length === 0)
    return (
      <div className="flex justify-center items-center">
        <span>No songs in queue</span>
      </div>
    )

  return (
    <div className="relative h-full">
      <ScrollArea
        ref={parentRef}
        type="always"
        className="min-h-full h-full overflow-auto"
        thumbClassName="secondary-thumb-bar"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = currentList[virtualRow.index]
            return (
              <QueueItem
                key={`${entry.id}-${virtualRow.index}`}  // 🆕 Уникальный ключ
                data-row-index={virtualRow.index}
                data-state={currentSong.id === entry.id ? 'active' : 'inactive'}
                index={virtualRow.index}
                song={entry}
                isPlaying={currentSong.id === entry.id && isPlaying}
                onClick={() => {
                  if (currentSong.id !== entry.id) {
                    setSongList(currentList, virtualRow.index)
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            )
          })}
        </div>
      </ScrollArea>
      
      {/* Кнопка "К текущему треку" */}
      {showScrollButton && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 right-4 w-12 h-12 rounded-full hover:bg-primary/20 hover:text-primary shadow-lg"
          onClick={scrollToCurrentTrack}
          title="К текущему треку"
        >
          <MapPin className="w-6 h-6" />
        </Button>
      )}
    </div>
  )
}
