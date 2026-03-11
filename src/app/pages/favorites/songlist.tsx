import { useTranslation } from 'react-i18next'
import { ShadowHeader } from '@/app/components/album/shadow-header'
import { InfinitySongListFallback } from '@/app/components/fallbacks/song-fallbacks'
import { HeaderTitle } from '@/app/components/header-title'
import { DataTableList } from '@/app/components/ui/data-table-list'
import { useFavoriteSongs } from '@/app/hooks/use-favorite-songs'
import { songsColumns } from '@/app/tables/songs-columns'
import { usePlayerActions } from '@/store/player.store'
import { ColumnFilter } from '@/types/columnFilter'
import { Button } from '@/app/components/ui/button'
import { Play } from 'lucide-react'
import { toast } from 'react-toastify'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'

export default function SongList() {
  const { t } = useTranslation()
  const columns = songsColumns()
  const { setSongList } = usePlayerActions()

  const { data, isLoading } = useFavoriteSongs()

  if (isLoading) {
    return <InfinitySongListFallback />
  }
  if (!data) return null

  const songlist = data.songs
  const songCount = data.songs.length

  function handlePlaySong(index: number) {
    if (songlist) setSongList(songlist, index)
  }

  function handlePlayAll() {
    if (songlist && songlist.length > 0) {
      setSongList(songlist, 0)
      toast.success(`▶️ Запущено ${songlist.length} треков из избранного`, {
        type: 'default',
      })
    }
  }

  const columnsToShow: ColumnFilter[] = [
    'index',
    'title',
    'album',
    'duration',
    'playCount',
    'played',
    'contentType',
    'select',
  ]

  const title = t('sidebar.favorites')

  return (
    <div className="w-full h-content">
      <ShadowHeader
        showGlassEffect={false}
        fixed={false}
        className="relative w-full justify-between items-center"
      >
        <HeaderTitle title={title} count={songCount} loading={isLoading} />
        
        {/* Кнопка Play All — круглая иконка */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handlePlayAll}
              disabled={songlist.length === 0}
              size="icon"
              variant="ghost"
              className="rounded-full hover:bg-primary hover:text-primary-foreground"
            >
              <Play className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            Воспроизвести все
          </TooltipContent>
        </Tooltip>
      </ShadowHeader>

      <div className="w-full h-[calc(100%-80px)] overflow-auto">
        <DataTableList
          columns={columns}
          data={songlist}
          handlePlaySong={(row) => handlePlaySong(row.index)}
          columnFilter={columnsToShow}
          noRowsMessage={t('favorites.noSongList')}
        />
      </div>
    </div>
  )
}
