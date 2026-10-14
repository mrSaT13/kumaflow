import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music2 } from 'lucide-react'
import { ImageLoader } from '@/app/components/image-loader'
import { useGetArtist } from '@/app/hooks/use-artist'
import { usePlayerFullscreen } from '@/store/player.store'
import { search3 } from '@/service/subsonic-api'
import { ISong } from '@/types/responses/song'
import { ROUTES } from '@/routes/routesList'

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
 * Круглое фото артиста — единая версия (раньше дублировалась
 * в song-info.tsx и now-playing.tsx):
 * - один исполнитель → фото со страницы артиста (как в плеере)
 * - несколько исполнителей → обложка трека (фото одного было бы неверно)
 * - нет фото → плейсхолдер с нотой
 * clickable=false — некликабельный div (как было в song-info),
 * clickable=true (по умолчанию) — кнопка → страница артиста.
 */
export function ArtistAvatar({
  song,
  centered = false,
  clickable = true,
}: {
  song: ISong
  centered?: boolean
  clickable?: boolean
}) {
  const [albumCover, setAlbumCover] = useState<string | null>(null)
  const goArtist = useGoArtist()
  const artist = song.artist
  const multi = !!song.artists && song.artists.length > 1
  const canOpen = clickable && !!song.artistId
  // Фото со страницы артиста — только для сольного исполнителя
  const { data: artistPage } = useGetArtist(!multi ? (song.artistId ?? '') : '')
  const pageCover =
    !multi && artistPage
      ? ((artistPage as { coverArt?: string; artistImageUrl?: string }).coverArt ||
        (artistPage as { coverArt?: string; artistImageUrl?: string }).artistImageUrl ||
        null)
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

  const content = pageCover ? (
    <ImageLoader id={pageCover} type="artist" size={100}>
      {(src) =>
        src ? (
          <img src={src} alt={artist} className="w-full h-full object-cover" width="52" height="52" />
        ) : (
          <AvatarPlaceholder />
        )
      }
    </ImageLoader>
  ) : albumCover ? (
    <ImageLoader id={albumCover} type="album" size={100}>
      {(src) =>
        src ? (
          <img src={src} alt={artist} className="w-full h-full object-cover" width="52" height="52" />
        ) : (
          <AvatarPlaceholder />
        )
      }
    </ImageLoader>
  ) : song.coverArt ? (
    <ImageLoader id={song.coverArt} type="song" size={100}>
      {(src) =>
        src ? (
          <img src={src} alt={artist} className="w-full h-full object-cover" width="52" height="52" />
        ) : (
          <AvatarPlaceholder />
        )
      }
    </ImageLoader>
  ) : (
    <AvatarPlaceholder />
  )

  if (!clickable) {
    return (
      <div className="w-12 h-12 2xl:w-[52px] 2xl:h-[52px] rounded-full overflow-hidden bg-foreground/10 shrink-0">
        {content}
      </div>
    )
  }

  return (
    <button
      onClick={() => goArtist(song.artistId)}
      disabled={!canOpen}
      title={canOpen ? `Открыть: ${artist}` : artist}
      className={`w-12 h-12 2xl:w-[52px] 2xl:h-[52px] rounded-full overflow-hidden bg-foreground/10 shrink-0 ${
        centered ? 'mx-auto' : ''
      } ${
        canOpen ? 'cursor-pointer hover:ring-2 hover:ring-primary/60 transition-shadow' : 'cursor-default'
      }`}
    >
      {content}
    </button>
  )
}

function AvatarPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-foreground/10">
      <Music2 className="w-5 h-5 text-foreground/30" />
    </div>
  )
}
