import { Row } from '@tanstack/react-table'
import { XIcon, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { usePlayerActions } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { trackRemoveFromPlaylist } from '@/service/ml-event-tracker'

export function QueueActions({ row }: { row: Row<ISong> }) {
  const { removeSongFromQueue, moveSongInQueue } = usePlayerActions()

  function handleRemoveSongFromQueue() {
    const song = row.original
    // Трекаем удаление из очереди
    trackRemoveFromPlaylist(song.id, 'queue', 'Current Queue')
    removeSongFromQueue(song.id)
  }

  function handleMoveUp() {
    if (row.index > 0) {
      moveSongInQueue(row.index, row.index - 1)
    }
  }

  function handleMoveDown() {
    moveSongInQueue(row.index, row.index + 1)
  }

  return (
    <div className="flex items-center gap-1">
      {/* Move Up */}
      <Button
        variant="ghost"
        size="sm"
        className="w-7 h-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          console.log('[QueueActions] Move Up clicked, index:', row.index)
          handleMoveUp()
        }}
        disabled={row.index === 0}
        title="Переместить вверх"
      >
        <ChevronUp className="w-4 h-4" />
      </Button>

      {/* Move Down */}
      <Button
        variant="ghost"
        size="sm"
        className="w-7 h-7 p-0 hover:bg-primary/20 hover:text-primary transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          console.log('[QueueActions] Move Down clicked, index:', row.index)
          handleMoveDown()
        }}
        title="Переместить вниз"
      >
        <ChevronDown className="w-4 h-4" />
      </Button>

      {/* Remove */}
      <Button
        variant="ghost"
        size="sm"
        className="w-7 h-7 p-0 hover:bg-destructive/20 hover:text-destructive transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          console.log('[QueueActions] Remove clicked, song:', row.original.title)
          handleRemoveSongFromQueue()
        }}
        title="Удалить из очереди"
      >
        <XIcon className="w-4 h-4" />
      </Button>
    </div>
  )
}
