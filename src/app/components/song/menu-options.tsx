import { OptionsButtons } from '@/app/components/options/buttons'
import { DownloadOptionHandler } from '@/app/components/options/download-handler'
import { ContextMenuSeparator } from '@/app/components/ui/context-menu'
import { useOptions } from '@/app/hooks/use-options'
import { ISong } from '@/types/responses/song'
import { AddToPlaylistSubMenu } from './add-to-playlist'
import { usePlayerActions } from '@/store/player.store'
import { generateTrackRadio, generateVibeMix } from '@/service/ml-wave-service'
import { getRandomSongs } from '@/service/subsonic-api'
import { toast } from 'react-toastify'
import { useState } from 'react'

interface SongMenuOptionsProps {
  variant: 'context' | 'dropdown'
  song: ISong
  index: number
}

export function SongMenuOptions({
  variant,
  song,
  index,
}: SongMenuOptionsProps) {
  const { setSongList } = usePlayerActions()
  const [isRadioGenerating, setIsRadioGenerating] = useState(false)
  const [isVibeGenerating, setIsVibeGenerating] = useState(false)
  
  const {
    playNext,
    playLast,
    createNewPlaylist,
    addToPlaylist,
    removeSongFromPlaylist,
    startDownload,
    openSongInfo,
    isOnPlaylistPage,
  } = useOptions()
  const songIndexes = [index.toString()]

  const handlePlayTrackRadio = async () => {
    setIsRadioGenerating(true)
    try {
      const playlist = await generateTrackRadio(song.id, 25)
      if (playlist.songs.length > 0) {
        setSongList([song, ...playlist.songs], 0)
        toast(`▶️ Запущено радио: ${song.title}`, { type: 'success' })
      } else {
        toast('Не удалось сгенерировать радио', { type: 'error' })
      }
    } catch (error) {
      console.error('Failed to generate track radio:', error)
      toast('Ошибка при генерации радио', { type: 'error' })
    } finally {
      setIsRadioGenerating(false)
    }
  }

  const handleVibeSimilarity = async () => {
    setIsVibeGenerating(true)
    try {
      const allSongs = await getRandomSongs(100)
      if (allSongs.length === 0) {
        toast('Нет треков для анализа', { type: 'info' })
        return
      }
      const playlist = await generateVibeMix(song.id, allSongs, 25)
      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast(`🎵 Vibe Similarity: ${song.title}`, { type: 'success' })
      } else {
        toast('Не удалось сгенерировать плейлист', { type: 'error' })
      }
    } catch (error) {
      console.error('Failed to generate vibe similarity:', error)
      toast('Ошибка при генерации', { type: 'error' })
    } finally {
      setIsVibeGenerating(false)
    }
  }

  return (
    <>
      <OptionsButtons.PlayNext
        variant={variant}
        onClick={(e) => {
          e.stopPropagation()
          playNext([song])
        }}
      />
      <OptionsButtons.PlayLast
        variant={variant}
        onClick={(e) => {
          e.stopPropagation()
          playLast([song])
        }}
      />
      <ContextMenuSeparator />
      <button
        className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded disabled:opacity-50"
        onClick={(e) => {
          e.stopPropagation()
          handlePlayTrackRadio()
        }}
        disabled={isRadioGenerating}
      >
        {isRadioGenerating ? '⏳ Генерация...' : '📻 Радио трека'}
      </button>
      <button
        className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded disabled:opacity-50"
        onClick={(e) => {
          e.stopPropagation()
          handleVibeSimilarity()
        }}
        disabled={isVibeGenerating}
      >
        {isVibeGenerating ? '⏳ Генерация...' : '🎵 Vibe Similarity'}
      </button>
      <ContextMenuSeparator />
      <OptionsButtons.AddToPlaylistOption variant={variant}>
        <AddToPlaylistSubMenu
          type={variant}
          newPlaylistFn={() => createNewPlaylist(song.title, song.id)}
          addToPlaylistFn={(id) => addToPlaylist(id, song.id)}
        />
      </OptionsButtons.AddToPlaylistOption>
      {isOnPlaylistPage && (
        <OptionsButtons.RemoveFromPlaylist
          variant={variant}
          onClick={(e) => {
            e.stopPropagation()
            removeSongFromPlaylist(songIndexes)
          }}
        />
      )}
      <DownloadOptionHandler context={true}>
        <OptionsButtons.Download
          variant={variant}
          onClick={(e) => {
            e.stopPropagation()
            startDownload(song.id)
          }}
        />
      </DownloadOptionHandler>
      <ContextMenuSeparator />
      <OptionsButtons.SongInfo
        variant={variant}
        onClick={(e) => {
          e.stopPropagation()
          openSongInfo(song.id)
        }}
      />
    </>
  )
}
