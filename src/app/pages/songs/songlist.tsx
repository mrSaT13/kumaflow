import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronLeft, Search } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShadowHeader } from '@/app/components/album/shadow-header'
import { InfinitySongListFallback } from '@/app/components/fallbacks/song-fallbacks'
import { HeaderTitle } from '@/app/components/header-title'
import { ClearFilterButton } from '@/app/components/search/clear-filter-button'
import { ExpandableSearchInput } from '@/app/components/search/expandable-input'
import { SongsMobileList } from '@/app/components/song/songs-mobile-list'
import { DataTableList } from '@/app/components/ui/data-table-list'
import { Input } from '@/app/components/ui/input'
import { useIsMobile } from '@/app/hooks/use-mobile'
import { useTotalSongs } from '@/app/hooks/use-total-songs'
import { songsColumns } from '@/app/tables/songs-columns'
import { getArtistAllSongs, songsSearch } from '@/queries/songs'
import { usePlayerActions } from '@/store/player.store'
import { ColumnFilter } from '@/types/columnFilter'
import { AlbumsFilters, AlbumsSearchParams } from '@/utils/albumsFilter'
import { queryKeys } from '@/utils/queryKeys'
import { SearchParamsHandler } from '@/utils/searchParamsHandler'

const DEFAULT_OFFSET = 100

function SongsMobileSearch({ placeholder }: { placeholder: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { getSearchParam } = new SearchParamsHandler(searchParams)
  const query = getSearchParam<string>(AlbumsSearchParams.Query, '')
  const [value, setValue] = useState(query)

  useEffect(() => {
    setValue(query)
  }, [query])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()

    if (trimmed) {
      const params = new URLSearchParams()
      params.append(AlbumsSearchParams.MainFilter, AlbumsFilters.Search)
      params.append(AlbumsSearchParams.Query, trimmed)
      setSearchParams(params)
      return
    }

    setSearchParams(new URLSearchParams())
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-10 pl-9"
      />
    </form>
  )
}

export default function SongList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { setSongList } = usePlayerActions()
  const [searchParams] = useSearchParams()
  const { getSearchParam } = new SearchParamsHandler(searchParams)
  const columns = songsColumns()

  const filter = getSearchParam<string>(AlbumsSearchParams.MainFilter, '')
  const query = getSearchParam<string>(AlbumsSearchParams.Query, '')
  const artistId = getSearchParam<string>(AlbumsSearchParams.ArtistId, '')
  const artistName = getSearchParam<string>(AlbumsSearchParams.ArtistName, '')

  const searchFilterIsSet = filter === AlbumsFilters.Search && query !== ''
  const filterByArtist = artistId !== '' && artistName !== ''
  const hasSomeFilter = searchFilterIsSet || filterByArtist

  async function fetchSongs({ pageParam = 0 }) {
    if (filterByArtist) {
      return getArtistAllSongs(artistId)
    }

    return songsSearch({
      query: searchFilterIsSet ? query : '',
      songCount: DEFAULT_OFFSET,
      songOffset: pageParam,
    })
  }

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: [queryKeys.song.all, filter, query, artistId],
      initialPageParam: 0,
      queryFn: fetchSongs,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    })

  const { data: songCountData, isLoading: songCountIsLoading } = useTotalSongs()

  if (isLoading && !isFetchingNextPage) {
    return <InfinitySongListFallback />
  }
  if (!data) return null

  const songlist = data.pages.flatMap((page) => page.songs) ?? []
  const songCount = (hasSomeFilter ? songlist.length : songCountData) ?? 0

  function handlePlaySong(index: number) {
    if (songlist) setSongList(songlist, index)
  }

  const columnsToShow: ColumnFilter[] = [
    'index',
    'title',
    'like',
    'album',
    'duration',
    'playCount',
    'played',
    'contentType',
    'select',
  ]

  const title = filterByArtist
    ? t('songs.list.byArtist', { artist: artistName })
    : t('sidebar.songs')

  if (isMobile) {
    return (
      <div className="w-full pb-6">
        <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur-md">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/library')}
              className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-accent/60"
              aria-label="Назад"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">{title}</h1>
              {!songCountIsLoading && songCount > 0 && (
                <p className="text-sm text-muted-foreground">{songCount}</p>
              )}
            </div>
            {filterByArtist && <ClearFilterButton />}
          </div>
          <SongsMobileSearch placeholder={t('songs.list.search.placeholder')} />
        </div>

        <SongsMobileList
          songs={songlist}
          onPlaySong={handlePlaySong}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-content">
      <ShadowHeader
        showGlassEffect={false}
        fixed={false}
        className="relative w-full justify-between items-center"
      >
        <HeaderTitle
          title={title}
          count={songCount}
          loading={songCountIsLoading}
        />

        <div className="flex gap-2 flex-1 justify-end">
          {filterByArtist && <ClearFilterButton />}
          <ExpandableSearchInput
            placeholder={t('songs.list.search.placeholder')}
          />
        </div>
      </ShadowHeader>

      <div className="w-full h-[calc(100%-80px)] overflow-auto">
        <DataTableList
          columns={columns}
          data={songlist}
          handlePlaySong={(row) => handlePlaySong(row.index)}
          columnFilter={columnsToShow}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
        />
      </div>
    </div>
  )
}
