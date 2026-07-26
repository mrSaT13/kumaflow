import { usePlayerSonglist } from '@/store/player.store'
import { AppTitle } from './header/app-title'

export function HeaderSongInfo() {
  const { currentList, currentSongIndex, currentSong } = usePlayerSonglist()

  const isPlaylistEmpty = currentList.length === 0

  function formatSongCount() {
    const currentPosition = currentSongIndex + 1
    const listLength = currentList.length

    return `[${currentPosition}/${listLength}]`
  }

  function getCurrentSongInfo() {
    return `${currentSong.artist} - ${currentSong.title}`
  }

  return (
    <div className="md:col-span-2 flex justify-center items-center min-w-0 px-1">
      {isPlaylistEmpty && <AppTitle />}
      {!isPlaylistEmpty && (
        <div className="flex w-full justify-center subpixel-antialiased font-medium text-sm text-muted-foreground">
          <p className="leading-7 mr-1">{formatSongCount()}</p>
          <p className="leading-7 truncate">{getCurrentSongInfo()}</p>
        </div>
      )}
    </div>
  )
}
