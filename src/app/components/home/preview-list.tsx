import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ImageLoader } from '@/app/components/image-loader'
import { PreviewCard } from '@/app/components/preview-card/card'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/app/components/ui/carousel'
import { CarouselButton } from '@/app/components/ui/carousel-button'
import { ROUTES } from '@/routes/routesList'
import { subsonic } from '@/service/subsonic'
import { usePlayerActions } from '@/store/player.store'
import { Albums } from '@/types/responses/album'

interface Genre {
  value: string
  songCount?: number
  albumCount?: number
}

interface PreviewListProps {
  list: Albums[] | Genre[]
  title: string
  showMore?: boolean
  moreTitle?: string
  moreRoute?: string
  type?: 'albums' | 'genres'
}

// Градиенты для жанров
const GENRE_GRADIENTS: Record<string, string> = {
  'Rock': 'from-red-600 via-red-500 to-orange-500',
  'Metal': 'from-gray-900 via-gray-800 to-black',
  'Pop': 'from-pink-500 via-purple-500 to-indigo-500',
  'Rap': 'from-yellow-600 via-orange-600 to-red-700',
  'Hip-Hop': 'from-yellow-600 via-orange-600 to-red-700',
  'Electronic': 'from-blue-600 via-purple-600 to-pink-600',
  'Dance': 'from-cyan-500 via-blue-500 to-purple-600',
  'Jazz': 'from-amber-700 via-amber-600 to-orange-700',
  'Classical': 'from-indigo-900 via-purple-900 to-indigo-800',
}

const getGradient = (genreName: string): string => {
  if (GENRE_GRADIENTS[genreName]) return GENRE_GRADIENTS[genreName]
  for (const [key, gradient] of Object.entries(GENRE_GRADIENTS)) {
    if (genreName.toLowerCase().includes(key.toLowerCase())) return gradient
  }
  return 'from-primary via-primary/80 to-primary/60'
}

export default function PreviewList({
  list,
  title,
  showMore = true,
  moreTitle,
  moreRoute,
  type = 'albums',
}: PreviewListProps) {
  const [api, setApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState<boolean>()
  const [canScrollNext, setCanScrollNext] = useState<boolean>()
  const { setSongList } = usePlayerActions()
  const { t } = useTranslation()

  moreTitle = moreTitle || t('generic.seeMore')

  if (list.length > 16) {
    list = list.slice(0, 16)
  }

  async function handlePlayAlbum(album: Albums) {
    const response = await subsonic.albums.getOne(album.id)

    if (response) {
      setSongList(response.song, 0)
    }
  }

  async function handlePlayGenre(genre: Genre) {
    try {
      const { getSongsByGenre } = await import('@/service/subsonic-api')
      const songs = await getSongsByGenre(genre.value, 50)
      
      if (songs.length === 0) return
      
      const playlist = songs.map(song => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        coverUrl: song.coverArt ? `/rest/getCoverArt?id=${song.coverArt}&u=&t=&v=1.16.1&c=KumaFlow` : undefined,
        duration: song.duration,
        genre: song.genre,
      }))

      setSongList(playlist, 0)
    } catch (error) {
      console.error('Failed to play genre:', error)
    }
  }

  useEffect(() => {
    if (!api) {
      return
    }

    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())

    api.on('select', () => {
      setCanScrollPrev(api.canScrollPrev())
      setCanScrollNext(api.canScrollNext())
    })
  }, [api])

  return (
    <div className="w-full flex flex-col mt-4">
      <div className="my-4 flex justify-between items-center">
        <h3
          className="scroll-m-20 text-2xl font-semibold tracking-tight"
          data-testid="preview-list-title"
        >
          {title}
        </h3>
        <div className="flex items-center gap-4">
          {showMore && moreRoute && (
            <Link to={moreRoute} data-testid="preview-list-show-more">
              <p className="leading-7 text-sm truncate hover:underline text-muted-foreground hover:text-primary">
                {moreTitle}
              </p>
            </Link>
          )}
          <div className="flex gap-2">
            <CarouselButton
              direction="prev"
              disabled={!canScrollPrev}
              onClick={() => api?.scrollPrev()}
              data-testid="preview-list-prev-button"
            />
            <CarouselButton
              direction="next"
              disabled={!canScrollNext}
              onClick={() => api?.scrollNext()}
              data-testid="preview-list-next-button"
            />
          </div>
        </div>
      </div>

      <div className="transform-gpu">
        <Carousel
          opts={{
            align: 'start',
            slidesToScroll: 'auto',
          }}
          setApi={setApi}
          data-testid="preview-list-carousel"
        >
          <CarouselContent>
            {type === 'genres' ? (
              (list as Genre[]).map((genre, index) => (
                <CarouselItem
                  key={genre.value}
                  className="basis-1/6 2xl:basis-1/8"
                  data-testid={`preview-list-genre-item-${index}`}
                >
                  <button
                    onClick={() => handlePlayGenre(genre)}
                    className={`relative overflow-hidden rounded-lg shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl w-full aspect-square`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(genre.value)} opacity-90`} />
                    <div className="relative p-4 text-center text-white">
                      <h4 className="font-bold text-sm mb-1 line-clamp-2">
                        {genre.value}
                      </h4>
                      {genre.songCount && (
                        <p className="text-xs opacity-80">
                          {genre.songCount} треков
                        </p>
                      )}
                    </div>
                  </button>
                </CarouselItem>
              ))
            ) : (
              (list as Albums[]).map((album, index) => (
                <CarouselItem
                  key={album.id}
                  className="basis-1/6 2xl:basis-1/8"
                  data-testid={`preview-list-carousel-item-${index}`}
                >
                  <PreviewCard.Root>
                    <PreviewCard.ImageWrapper link={ROUTES.ALBUM.PAGE(album.id)}>
                      <ImageLoader id={album.coverArt} type="album">
                        {(src) => (
                          <PreviewCard.Image src={src} alt={album.name} />
                        )}
                      </ImageLoader>
                      <PreviewCard.PlayButton
                        onClick={() => handlePlayAlbum(album)}
                      />
                    </PreviewCard.ImageWrapper>
                    <PreviewCard.InfoWrapper>
                      <PreviewCard.Title link={ROUTES.ALBUM.PAGE(album.id)}>
                        {album.name}
                      </PreviewCard.Title>
                      <PreviewCard.Subtitle
                        enableLink={album.artistId !== undefined}
                        link={ROUTES.ARTIST.PAGE(album.artistId ?? '')}
                      >
                        {album.artist}
                      </PreviewCard.Subtitle>
                    </PreviewCard.InfoWrapper>
                  </PreviewCard.Root>
                </CarouselItem>
              ))
            )}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  )
}
