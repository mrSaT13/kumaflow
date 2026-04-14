import { ClockIcon, DownloadIcon, HeartIcon } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'

import { CacheTrackButton } from '@/app/components/song/cache-button'
import { ArtistLink, ArtistsLinks } from '@/app/components/song/artist-link'
import { LikeDislikeCompact } from '@/app/components/song/like-dislike-buttons'
import { SongQualityBadge } from '@/app/components/song/quality-badge'
import PlaySongButton from '@/app/components/table/play-button'
import { SongTableActions } from '@/app/components/table/song-actions'
import { TableSongTitle } from '@/app/components/table/song-title'
import { DataTableColumnHeader } from '@/app/components/ui/data-table-column-header'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import i18n from '@/i18n'
import { ROUTES } from '@/routes/routesList'
import { ColumnDefType } from '@/types/react-table/columnDef'
import { ISong } from '@/types/responses/song'
import { formatBitrate } from '@/utils/audioInfo'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import dateTime from '@/utils/dateTime'

const MemoSimpleTooltip = memo(SimpleTooltip)
const MemoSongQualityBadge = memo(SongQualityBadge)
const MemoPlaySongButton = memo(PlaySongButton)
const MemoTableSongTitle = memo(TableSongTitle)
const MemoLink = memo(Link)
const MemoSongTableActions = memo(SongTableActions)
const MemoDataTableColumnHeader = memo(
  DataTableColumnHeader,
) as typeof DataTableColumnHeader

export function songsColumns(): ColumnDefType<ISong>[] {
  return [
    {
      id: 'index',
      accessorKey: 'index',
      style: {
        width: 48,
        minWidth: '48px',
      },
      header: () => {
        return <div className="w-full text-center">#</div>
      },
      cell: ({ row, table }) => {
        const trackNumber = row.index + 1
        const song = row.original

        return (
          <MemoPlaySongButton
            trackNumber={trackNumber}
            trackId={song.id}
            handlePlayButton={() => table.options.meta?.handlePlaySong?.(row)}
          />
        )
      },
    },
    {
      id: 'trackNumber',
      accessorKey: 'track',
      style: {
        width: 48,
        minWidth: '48px',
      },
      header: () => {
        return <div className="w-full text-center">#</div>
      },
      cell: ({ row, table }) => {
        const song = row.original
        const trackNumber = song.track

        return (
          <MemoPlaySongButton
            trackNumber={trackNumber}
            trackId={song.id}
            handlePlayButton={() => table.options.meta?.handlePlaySong?.(row)}
          />
        )
      },
    },
    {
      id: 'title',
      accessorKey: 'title',
      style: {
        flex: 1,
        minWidth: 250,
      },
      enableSorting: true,
      sortingFn: 'customSortFn',
      header: ({ column, table }) => (
        <MemoDataTableColumnHeader column={column} table={table}>
          {i18n.t('table.columns.title')}
        </MemoDataTableColumnHeader>
      ),
      cell: ({ row }) => <MemoTableSongTitle song={row.original} />,
    },
    {
      id: 'like',
      accessorKey: 'like',
      style: {
        width: 80,
        maxWidth: 80,
      },
      header: () => (
        <div className="w-full text-center">❤️</div>
      ),
      cell: ({ row }) => {
        const song = row.original
        return (
          <div className="flex justify-center">
            <LikeDislikeCompact songId={song.id} song={song} />
          </div>
        )
      },
    },
    {
      id: 'cache',
      accessorKey: 'cache',
      style: {
        width: 48,
        maxWidth: 48,
      },
      header: () => (
        <div className="w-full text-center">
          <DownloadIcon className="w-4 h-4 text-muted-foreground" />
        </div>
      ),
      cell: ({ row }) => {
        const song = row.original
        return (
          <div className="flex justify-center">
            <CacheTrackButton song={song} variant="ghost" size="icon" />
          </div>
        )
      },
    },
    {
      id: 'artist',
      accessorKey: 'artist',
      style: {
        width: '20%',
        maxWidth: '20%',
      },
      enableSorting: true,
      sortingFn: 'customSortFn',
      header: ({ column, table }) => (
        <MemoDataTableColumnHeader column={column} table={table}>
          {i18n.t('table.columns.artist')}
        </MemoDataTableColumnHeader>
      ),
      cell: ({ row }) => {
        const { artist, artistId, artists } = row.original

        if (artists && artists.length > 1) {
          return <ArtistsLinks artists={artists} />
        }

        if (!artistId) return artist

        return <ArtistLink artistId={artistId}>{artist}</ArtistLink>
      },
    },
    {
      id: 'album',
      accessorKey: 'album',
      style: {
        width: '24%',
        minWidth: '14%',
        maxWidth: '24%',
      },
      className: 'hidden lg:flex',
      enableSorting: true,
      sortingFn: 'customSortFn',
      header: ({ column, table }) => (
        <MemoDataTableColumnHeader column={column} table={table}>
          {i18n.t('table.columns.album')}
        </MemoDataTableColumnHeader>
      ),
      cell: ({ row }) => {
        return (
          <MemoLink
            to={ROUTES.ALBUM.PAGE(row.original.albumId)}
            className="hover:underline truncate text-foreground/70 hover:text-foreground"
            onContextMenu={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            {row.original.album}
          </MemoLink>
        )
      },
    },
    {
      id: 'year',
      accessorKey: 'year',
      header: i18n.t('table.columns.year'),
      style: {
        width: 80,
        maxWidth: 80,
      },
    },
    {
      id: 'duration',
      accessorKey: 'duration',
      style: {
        width: 80,
        maxWidth: 80,
      },
      enableSorting: true,
      sortingFn: 'basic',
      header: ({ column, table }) => (
        <MemoSimpleTooltip text={i18n.t('table.columns.duration')}>
          <div>
            <MemoDataTableColumnHeader column={column} table={table}>
              <ClockIcon className="w-4 h-4" />
            </MemoDataTableColumnHeader>
          </div>
        </MemoSimpleTooltip>
      ),
      cell: ({ row }) => {
        const { duration } = row.original
        const formattedDuration = convertSecondsToTime(duration ?? 0)

        return formattedDuration
      },
    },
    {
      id: 'playCount',
      accessorKey: 'playCount',
      style: {
        width: 140,
        maxWidth: 140,
      },
      className: 'hidden lg:flex',
      enableSorting: true,
      sortingFn: 'basic',
      sortUndefined: -1,
      header: ({ column, table }) => (
        <MemoDataTableColumnHeader column={column} table={table}>
          {i18n.t('table.columns.plays')}
        </MemoDataTableColumnHeader>
      ),
      cell: ({ row }) => row.original.playCount ?? '',
    },
    {
      id: 'played',
      accessorKey: 'played',
      header: i18n.t('table.columns.lastPlayed'),
      style: {
        width: 180,
        maxWidth: 180,
      },
      className: 'hidden 2xl:flex',
      cell: ({ row }) => {
        const { played } = row.original

        if (played) {
          const lastPlayed = dateTime().from(dateTime(played), true)
          return i18n.t('table.lastPlayed', { date: lastPlayed })
        }

        return ''
      },
    },
    {
      id: 'bpm',
      accessorKey: 'bpm',
      header: i18n.t('table.columns.bpm'),
      style: {
        width: 80,
        maxWidth: 80,
      },
    },
    {
      id: 'energy',
      accessorKey: 'energy',
      header: i18n.t('table.columns.energy'),
      style: {
        width: 80,
        maxWidth: 80,
      },
      className: 'hidden lg:flex',
      cell: ({ row }) => {
        const energy = row.original.energy
        if (energy === undefined || energy === null) return ''
        return (energy * 100).toFixed(0)
      },
    },
    {
      id: 'danceability',
      accessorKey: 'danceability',
      header: i18n.t('table.columns.danceability'),
      style: {
        width: 80,
        maxWidth: 80,
      },
      className: 'hidden lg:flex',
      cell: ({ row }) => {
        const danceability = row.original.danceability
        if (danceability === undefined || danceability === null) return ''
        return (danceability * 100).toFixed(0)
      },
    },
    {
      id: 'valence',
      accessorKey: 'valence',
      header: i18n.t('table.columns.valence'),
      style: {
        width: 80,
        maxWidth: 80,
      },
      className: 'hidden 2xl:flex',
      cell: ({ row }) => {
        const valence = row.original.valence
        if (valence === undefined || valence === null) return ''
        return (valence * 100).toFixed(0)
      },
    },
    {
      id: 'acousticness',
      accessorKey: 'acousticness',
      header: i18n.t('table.columns.acousticness'),
      style: {
        width: 80,
        maxWidth: 80,
      },
      className: 'hidden 2xl:flex',
      cell: ({ row }) => {
        const acousticness = row.original.acousticness
        if (acousticness === undefined || acousticness === null) return ''
        return (acousticness * 100).toFixed(0)
      },
    },
    {
      id: 'moods',
      accessorKey: 'moods',
      header: i18n.t('table.columns.moods'),
      style: {
        width: 150,
        maxWidth: 150,
      },
      className: 'hidden xl:flex',
      cell: ({ row }) => {
        const moods = row.original.moods
        if (!moods || moods.length === 0) return ''
        return moods.slice(0, 2).join(', ')
      },
    },
    {
      id: 'bitRate',
      accessorKey: 'bitRate',
      header: i18n.t('table.columns.bitrate'),
      style: {
        width: 140,
        maxWidth: 140,
      },
      className: 'hidden 2xl:flex',
      cell: ({ row }) => {
        return formatBitrate(row.original.bitRate)
      },
    },
    {
      id: 'contentType',
      accessorKey: 'contentType',
      header: i18n.t('table.columns.quality'),
      style: {
        width: 100,
        maxWidth: 110,
      },
      className: 'hidden 2xl:flex',
      cell: ({ row }) => {
        return <MemoSongQualityBadge song={row.original} />
      },
    },
    {
      id: 'select',
      style: {
        width: 120,
        maxWidth: 120,
        justifyContent: 'end',
      },
      header: () => (
        <MemoSimpleTooltip text={i18n.t('table.columns.favorite')}>
          <HeartIcon className="w-4 h-4 mr-2" />
        </MemoSimpleTooltip>
      ),
      cell: ({ row }) => <MemoSongTableActions row={row} />,
    },
  ]
}
