import clsx from 'clsx'
import { ComponentPropsWithRef } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { EqualizerBars } from '@/app/components/icons/equalizer-bars'
import { ImageLoader } from '@/app/components/image-loader'
import { LikeDislikeCompact } from '@/app/components/song/like-dislike-buttons'
import { Button } from '@/app/components/ui/button'
import { ChevronUp, ChevronDown, XIcon } from 'lucide-react'
import { ISong } from '@/types/responses/song'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { usePlayerActions } from '@/store/player.store'
import { trackRemoveFromPlaylist } from '@/service/ml-event-tracker'
import { QueueItemExplanation } from './queue-explanation'

type QueueItemProps = ComponentPropsWithRef<'div'> & {
  song: ISong
  index: number
  isPlaying: boolean
}

export function QueueItem({
  song,
  isPlaying,
  index,
  style,
  ...props
}: QueueItemProps) {
  const { moveSongInQueue, removeSongFromQueue } = usePlayerActions()

  function handleMoveUp(e: React.MouseEvent) {
    e.stopPropagation()
    if (index > 0) {
      moveSongInQueue(index, index - 1)
    }
  }

  function handleMoveDown(e: React.MouseEvent) {
    e.stopPropagation()
    moveSongInQueue(index, index + 1)
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    trackRemoveFromPlaylist(song.id, 'queue', 'Current Queue')
    removeSongFromQueue(song.id)
  }
  return (
    <div
      className={clsx([
        'flex items-center w-[calc(100%-10px)] h-16 text-sm rounded-md cursor-pointer',
        'bg-black/0 hover:bg-foreground/20',
        'data-[state=active]:bg-foreground data-[state=active]:text-secondary',
      ])}
      style={{
        backfaceVisibility: 'visible',
        willChange: 'background-color',
        ...style,
      }}
      {...props}
    >
      <div className="w-[54px] h-full flex items-center justify-center text-center font-medium">
        {isPlaying ? (
          <div className="w-6 flex items-center">
            <div className="w-6 h-6 flex items-center justify-center">
              <EqualizerBars size={20} className="text-secondary mb-1" />
            </div>
          </div>
        ) : (
          <div className="w-6 h-6 text-center flex justify-center items-center text-shadow-lg">
            <p>{index + 1}</p>
          </div>
        )}
      </div>
      <div className="flex flex-1 items-center">
        <div className="w-10 h-10 bg-accent rounded mr-2 overflow-hidden">
          {/* Для аудиокниг — прямой URL, для музыки — ImageLoader */}
          {(song as any).isAudiobook && (song as any).coverUrl ? (
            <LazyLoadImage
              src={(song as any).coverUrl}
              effect="opacity"
              className="w-10 h-10 rounded text-transparent"
              alt={`${song.title} - ${song.artist}`}
            />
          ) : (
            <ImageLoader id={song.coverArt} type="song" size={100}>
              {(src) => (
                <LazyLoadImage
                  src={src}
                  effect="opacity"
                  className="w-10 h-10 rounded text-transparent"
                  alt={`${song.title} - ${song.artist}`}
                />
              )}
            </ImageLoader>
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-semibold">{song.title}</span>
          <QueueArtists song={song} />
        </div>
      </div>
      <div className="w-[120px] flex items-center justify-center gap-1">
        {/* Explanation */}
        <QueueItemExplanation song={song} />

        {/* Move Up */}
        <Button
          variant="ghost"
          size="sm"
          className="w-7 h-7 p-0 hover:bg-muted/50"
          onClick={handleMoveUp}
          disabled={index === 0}
          title="Переместить вверх"
        >
          <ChevronUp className="w-4 h-4" />
        </Button>

        {/* Move Down */}
        <Button
          variant="ghost"
          size="sm"
          className="w-7 h-7 p-0 hover:bg-muted/50"
          onClick={handleMoveDown}
          title="Переместить вниз"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>

        {/* Remove */}
        <Button
          variant="ghost"
          size="sm"
          className="w-7 h-7 p-0 hover:bg-muted/50"
          onClick={handleRemove}
          title="Удалить из очереди"
        >
          <XIcon className="w-4 h-4" />
        </Button>

        {/* Like/Dislike */}
        <LikeDislikeCompact songId={song.id} song={song} />
      </div>
      <div className="w-[100px] text-center">
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
      <div className="flex items-center gap-1 font-normal opacity-70">
        {data.map(({ id, name }, index) => (
          <div key={id} className="flex items-center text-sm">
            <p>{name}</p>
            {index < data.length - 1 && ','}
          </div>
        ))}
      </div>
    )
  }

  return <p className="font-normal text-sm opacity-70">{artist}</p>
}
