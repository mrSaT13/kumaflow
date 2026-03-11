/**
 * Context Menu for Queue - Контекстное меню очереди
 */

import {
  Play,
  ListStart,
  ListEnd,
  X,
  Plus,
  Disc,
  Mic2,
} from 'lucide-react'
import { ISong } from '@/types/responses/song'
import { usePlayerActions } from '@/store/player.store'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/app/components/ui/context-menu'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/routes/routesList'

interface QueueContextMenuProps {
  song: ISong
  index: number
  children: React.ReactNode
}

export function QueueContextMenu({ song, index, children }: QueueContextMenuProps) {
  const navigate = useNavigate()
  const {
    setSongList,
    moveSongInQueue,
    removeSongFromQueue,
  } = usePlayerActions()

  const handlePlayFromHere = () => {
    // Play from this track in current queue
    const { currentList } = usePlayerActions.getState()
    // Need to get current list from store
    setSongList(currentList, index)
    toast(`▶️ Playing from: ${song.title}`, { type: 'default' })
  }

  const handleMoveToTop = () => {
    if (index > 0) {
      moveSongInQueue(index, 0)
      toast(`⬆️ Moved to top: ${song.title}`, { type: 'default' })
    }
  }

  const handleMoveToBottom = () => {
    const { currentList } = usePlayerActions.getState()
    if (index < currentList.length - 1) {
      moveSongInQueue(index, currentList.length - 1)
      toast(`⬇️ Moved to bottom: ${song.title}`, { type: 'default' })
    }
  }

  const handleRemove = () => {
    removeSongFromQueue(song.id)
    toast(`❌ Removed: ${song.title}`, { type: 'default' })
  }

  const handleGoToAlbum = () => {
    if (song.albumId) {
      navigate(ROUTES.ALBUM.PAGE(song.albumId))
    }
  }

  const handleGoToArtist = () => {
    if (song.artistId) {
      navigate(ROUTES.ARTIST.PAGE(song.artistId))
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={handlePlayFromHere}>
          <Play className="mr-2 h-4 w-4" />
          Play from here
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleMoveToTop} disabled={index === 0}>
          <ListStart className="mr-2 h-4 w-4" />
          Move to top
        </ContextMenuItem>
        
        <ContextMenuItem onClick={handleMoveToBottom}>
          <ListEnd className="mr-2 h-4 w-4" />
          Move to bottom
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleRemove}>
          <X className="mr-2 h-4 w-4" />
          Remove from queue
        </ContextMenuItem>
        
        <ContextMenuItem>
          <Plus className="mr-2 h-4 w-4" />
          Add to playlist
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleGoToAlbum} disabled={!song.albumId}>
          <Disc className="mr-2 h-4 w-4" />
          Go to album
        </ContextMenuItem>
        
        <ContextMenuItem onClick={handleGoToArtist} disabled={!song.artistId}>
          <Mic2 className="mr-2 h-4 w-4" />
          Go to artist
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
