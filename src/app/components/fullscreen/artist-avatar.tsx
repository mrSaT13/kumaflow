import { Music2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ImageLoader } from '@/app/components/image-loader'
import { useGetArtist } from '@/app/hooks/use-artist'
import { ROUTES } from '@/routes/routesList'
import { search3 } from '@/service/subsonic-api'
import { usePlayerFullscreen } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'

/** Переход на страницу артиста с закрытием полноэкранного */
export function useGoArtist() {
  const navigate = useNavigate()
  const { setIsFullscreen } = usePlayerFullscreen()
  return (artistId?: string) => {
    if (!artistId) return
    setIsFullscreen(false)
    navigate(ROUTES.ARTIST.PAGE(artistId))
  }
}

/**
 * Круглый аватар артиста с поддержкой нескольких исполнителей:
 * - 1 исполнитель → одно фото на весь круг
 * - 2 → круг делится пополам вертикально
 * - 3 → слева половина первого, справа две четвертинки (2-й и 3-й)
 * - 4 → сетка 2x2
 * Каждая доля кликабельна → страница своего артиста.
 */
export function ArtistAvatar({
  song,
  centered = false,
}: {
  song: ISong
  centered?: boolean
}) {
  const artists =
    song.artists && song.artists.length > 1
      ? song.artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)
      : null

  // Соло — старое поведение (фото со страницы артиста → альбом → обложка трека)
  if (!artists) {
    return <SingleArtistCircle song={song} centered={centered} />
  }

  return <SplitArtistCircle song={song} centered={centered} />
}

function circleClass(centered: boolean, clickable: boolean) {
  return `w-12 h-12 2xl:w-[52px] 2xl:h-[52px] rounded-full overflow-hidden bg-foreground/10 shrink-0 ${
    centered ? 'mx-auto' : ''
  } ${clickable ? 'hover:ring-2 hover:ring-primary/60 transition-shadow' : ''}`
}

function SingleArtistCircle({
  song,
  centered,
}: {
  song: ISong
  centered?: boolean
}) {
  const [albumCover, setAlbumCover] = useState<string | null>(null)
  const goArtist = useGoArtist()
  const { t } = useTranslation()
  const artist = song.artist
  const clickable = !!song.artistId
  const { data: artistPage } = useGetArtist(song.artistId ?? '')
  const pageCover = artistPage
    ? (artistPage as { coverArt?: string; artistImageUrl?: string }).coverArt ||
      (artistPage as { coverArt?: string; artistImageUrl?: string })
        .artistImageUrl ||
      null
    : null

  useEffect(() => {
    let cancelled = false
    setAlbumCover(null)
    if (pageCover || !artist) return
    search3(artist, { artistCount: 0, albumCount: 1 })
      .then((res) => {
        if (!cancelled) setAlbumCover(res.albums?.[0]?.coverArt ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [artist, pageCover])

  const coverId = pageCover ?? albumCover ?? song.coverArt ?? null
  const coverType = pageCover ? 'artist' : albumCover ? 'album' : 'song'

  return (
    <button
      onClick={() => goArtist(song.artistId)}
      disabled={!clickable}
      title={clickable ? t('fullscreen.openArtist', { name: artist }) : artist}
      className={circleClass(centered ?? false, clickable)}
    >
      {coverId ? (
        <ImageLoader
          id={coverId}
          type={coverType as 'artist' | 'album' | 'song'}
          size={100}
        >
          {(src) =>
            src ? (
              <img
                src={src}
                alt={artist}
                className="w-full h-full object-cover"
                width="52"
                height="52"
              />
            ) : (
              <AvatarPlaceholder />
            )
          }
        </ImageLoader>
      ) : (
        <AvatarPlaceholder />
      )}
    </button>
  )
}

function SplitArtistCircle({
  song,
  centered,
}: {
  song: ISong
  centered?: boolean
}) {
  const goArtist = useGoArtist()
  const list = (song.artists ?? []).slice(0, ALBUM_ARTISTS_MAX_NUMBER)

  return (
    <div
      title={song.artist}
      className={`${circleClass(centered ?? false, false)} flex cursor-default`}
    >
      {list.length === 2 && (
        <>
          <ArtistSlice
            id={list[0].id}
            name={list[0].name}
            className="w-1/2 h-full"
            onOpen={() => goArtist(list[0].id)}
          />
          <ArtistSlice
            id={list[1].id}
            name={list[1].name}
            className="w-1/2 h-full"
            onOpen={() => goArtist(list[1].id)}
          />
        </>
      )}
      {list.length === 3 && (
        <>
          <ArtistSlice
            id={list[0].id}
            name={list[0].name}
            className="w-1/2 h-full"
            onOpen={() => goArtist(list[0].id)}
          />
          <div className="w-1/2 h-full flex flex-col">
            <ArtistSlice
              id={list[1].id}
              name={list[1].name}
              className="w-full h-1/2"
              onOpen={() => goArtist(list[1].id)}
            />
            <ArtistSlice
              id={list[2].id}
              name={list[2].name}
              className="w-full h-1/2"
              onOpen={() => goArtist(list[2].id)}
            />
          </div>
        </>
      )}
      {list.length >= 4 && (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2">
          {list.slice(0, 4).map((a) => (
            <ArtistSlice
              key={a.id || a.name}
              id={a.id}
              name={a.name}
              className="w-full h-full min-h-0 min-w-0"
              onOpen={() => goArtist(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Одна доля круга: фото артиста по id → search3 по имени → плейсхолдер. Кликабельна отдельно. */
function ArtistSlice({
  id,
  name,
  className,
  onOpen,
}: {
  id?: string
  name: string
  className?: string
  onOpen?: () => void
}) {
  const { data: artistPage } = useGetArtist(id ?? '')
  const { t } = useTranslation()
  const [albumCover, setAlbumCover] = useState<string | null>(null)
  const pageCover = artistPage
    ? (artistPage as { coverArt?: string; artistImageUrl?: string }).coverArt ||
      (artistPage as { coverArt?: string; artistImageUrl?: string })
        .artistImageUrl ||
      null
    : null

  useEffect(() => {
    let cancelled = false
    setAlbumCover(null)
    if (pageCover || !name || id) return
    // Без id страницы артиста нет — ищем обложку альбома по имени
    search3(name, { artistCount: 0, albumCount: 1 })
      .then((res) => {
        if (!cancelled) setAlbumCover(res.albums?.[0]?.coverArt ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [name, pageCover, id])

  const coverId = pageCover ?? albumCover ?? null
  const clickable = !!id

  const inner = coverId ? (
    <ImageLoader id={coverId} type={pageCover ? 'artist' : 'album'} size={100}>
      {(src) =>
        src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          <SlicePlaceholder />
        )
      }
    </ImageLoader>
  ) : (
    <SlicePlaceholder />
  )

  if (!clickable) {
    return (
      <div
        className={`${className ?? ''} overflow-hidden bg-foreground/10`}
        title={name}
      >
        {inner}
      </div>
    )
  }

  return (
    <button
      onClick={onOpen}
      title={t('fullscreen.openArtist', { name })}
      className={`${className ?? ''} overflow-hidden bg-foreground/10 hover:brightness-125 transition-all cursor-pointer`}
    >
      {inner}
    </button>
  )
}

export function AvatarPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-foreground/10">
      <Music2 className="w-5 h-5 text-foreground/30" />
    </div>
  )
}

function SlicePlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-foreground/10">
      <Music2 className="w-3.5 h-3.5 text-foreground/30" />
    </div>
  )
}
