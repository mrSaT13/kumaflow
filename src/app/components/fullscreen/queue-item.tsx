import clsx from 'clsx'
import { ComponentPropsWithRef } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { EqualizerBars } from '@/app/components/icons/equalizer-bars'
import { ImageLoader } from '@/app/components/image-loader'
import { ISong } from '@/types/responses/song'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'

type QueueItemProps = ComponentPropsWithRef<'div'> & {
  song: ISong
  isCurrent: boolean
  upcomingNumber: number | null
  isPlaying: boolean
}

export function QueueItem({
  song,
  isPlaying,
  isCurrent,
  upcomingNumber,
  style,
  ...props
}: QueueItemProps) {
  return (
    <div
      className={clsx(
        'flex h-14 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm',
        'bg-black/0 hover:bg-foreground/20',
        'data-[state=active]:bg-foreground data-[state=active]:text-secondary',
      )}
      style={style}
      {...props}
    >
      <div className="flex w-8 shrink-0 items-center justify-center text-center font-medium">
        {isCurrent && isPlaying ? (
          <EqualizerBars size={18} className="text-secondary" />
        ) : isCurrent ? (
          <span className="text-shadow-lg">•</span>
        ) : (
          <span className="text-shadow-lg">{upcomingNumber}</span>
        )}
      </div>

      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-accent">
        {(song as any).isAudiobook && (song as any).coverUrl ? (
          <LazyLoadImage
            src={(song as any).coverUrl}
            effect="opacity"
            className="h-10 w-10 rounded text-transparent"
            alt={`${song.title} - ${song.artist}`}
          />
        ) : (
          <ImageLoader id={song.coverArt} type="song" size={100}>
            {(src) => (
              <LazyLoadImage
                src={src}
                effect="opacity"
                className="h-10 w-10 rounded text-transparent"
                alt={`${song.title} - ${song.artist}`}
              />
            )}
          </ImageLoader>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-semibold">{song.title}</p>
        <QueueArtists song={song} />
      </div>

      <div className="shrink-0 px-1 text-xs opacity-80">
        {convertSecondsToTime(song.duration)}
      </div>
    </div>
  )
}

function QueueArtists({ song }: { song: ISong }) {
  const { artist, artists } = song

  if (artists && artists.length > 1) {
    const data = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)

    return (
      <div className="flex items-center gap-1 truncate text-xs font-normal opacity-70">
        {data.map(({ id, name }, artistIndex) => (
          <span key={id} className="truncate">
            {name}
            {artistIndex < data.length - 1 ? ',' : ''}
          </span>
        ))}
      </div>
    )
  }

  return (
    <p className="truncate text-xs font-normal opacity-70">{artist}</p>
  )
}
