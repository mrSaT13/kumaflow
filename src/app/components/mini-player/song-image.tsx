import { Expand } from 'lucide-react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { Button } from '@/app/components/ui/button'
import { ImageLoader } from '@/app/components/image-loader'
import { usePlayerCurrentSong, usePlayerFullscreen } from '@/store/player.store'

export function MiniPlayerSongImage() {
  const song = usePlayerCurrentSong()
  const { setIsFullscreen } = usePlayerFullscreen()

  return (
    <div className="min-w-[20%] h-full max-w-full aspect-square flex items-center justify-center rounded relative group">
      <ImageLoader id={song.coverArt} type="song" size={500}>
        {(src) => (
          <LazyLoadImage
            src={src}
            width="100%"
            height="100%"
            loading="eager"
            effect="opacity"
            className="aspect-square object-cover object-center w-full max-w-full bg-skeleton text-transparent rounded shadow-md cursor-pointer"
            data-testid="track-image"
            alt={`${song.artist} - ${song.title}`}
            onClick={() => setIsFullscreen(true)}
          />
        )}
      </ImageLoader>
      
      {/* Кнопка разворачивания плеера */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70"
        onClick={(e) => {
          e.stopPropagation()
          setIsFullscreen(true)
        }}
        title="Развернуть плеер"
      >
        <Expand className="h-3 w-3 text-white" />
      </Button>
    </div>
  )
}
