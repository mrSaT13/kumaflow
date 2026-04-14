import { ComponentPropsWithoutRef, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MarqueeTitle } from '@/app/components/fullscreen/marquee-title'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { usePlayerCurrentSong } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { Mic2, Users } from 'lucide-react'

export function MiniPlayerSongTitle() {
  const navigate = useNavigate()
  const song = usePlayerCurrentSong()

  function handleTitleClick() {
    navigate(ROUTES.ALBUM.PAGE(song.albumId))
  }

  return (
    <div className="flex flex-col flex-1 justify-center max-w-full overflow-hidden">
      <MarqueeTitle gap="mr-2">
        <span
          className={cn(
            'text-base font-medium hover:underline cursor-pointer',
            'mid-player:text-sm mini-player:text-xs mini-player:font-normal',
          )}
          data-testid="track-title"
          onClick={handleTitleClick}
        >
          {song.title}
        </span>
      </MarqueeTitle>
      <ArtistsLinks song={song} />
    </div>
  )
}

function ArtistsLinks({ song }: { song: ISong }) {
  const { artistId, artist, artists } = song
  const navigate = useNavigate()
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Закрытие при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false)
      }
    }

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPopover])

  function handleArtistClick(id?: string) {
    if (!id) return
    navigate(ROUTES.ARTIST.PAGE(id))
  }

  if (artists && artists.length > 1) {
    const data = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)

    return (
      <div className="relative">
        <div className="flex items-center gap-1 text-xs mini-player:text-[11px] maskImage-marquee-fade-finished">
          {data.map(({ id, name }, index) => (
            <div key={id} className="flex items-center">
              <ArtistLink
                id={id}
                name={name}
                onClick={() => handleArtistClick(id)}
              />
              {index < data.length - 1 && ','}
            </div>
          ))}
          
          {/* Кнопка для показа попапа */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowPopover(!showPopover)
            }}
            className="ml-0.5 p-0.5 rounded hover:bg-accent transition-colors flex-shrink-0"
            title="Выбрать артиста"
          >
            <Users size={10} className="text-muted-foreground hover:text-primary transition-colors" />
          </button>
        </div>

        {/* Попап выбора артиста */}
        {showPopover && (
          <div
            ref={popoverRef}
            className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded-lg overflow-hidden shadow-xl border backdrop-blur-md"
            style={{
              backgroundColor: 'hsla(var(--card) / 0.95)',
              borderColor: 'hsla(var(--border) / 0.5)',
            }}
          >
            <div className="px-2 py-1.5 border-b" style={{ borderColor: 'hsla(var(--border) / 0.3)' }}>
              <p className="text-xs font-semibold text-muted-foreground">Выберите артиста:</p>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {artists.map((artist) => (
                <button
                  key={artist.id}
                  onClick={() => {
                    handleArtistClick(artist.id)
                    setShowPopover(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors group"
                >
                  {/* Аватарка артиста */}
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--border)' }}>
                    {artist.coverArt ? (
                      <img
                        src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '100')}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Mic2 size={12} />
                      </div>
                    )}
                  </div>
                  {/* Имя артиста */}
                  <span className="text-xs truncate group-hover:text-primary transition-colors text-foreground">
                    {artist.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <ArtistLink
      id={artistId}
      name={artist}
      onClick={() => handleArtistClick(artistId)}
    />
  )
}

type ArtistLinkProps = ComponentPropsWithoutRef<'span'> & {
  id?: string
  name: string
}

function ArtistLink({ id, name, className, ...props }: ArtistLinkProps) {
  return (
    <span
      className={cn(
        'w-fit max-w-full truncate text-xs font-normal text-foreground/70',
        'mini-player:text-[11px] mini-player:font-light',
        className,
        id && 'hover:underline hover:text-foreground cursor-pointer',
      )}
      {...props}
    >
      {name}
    </span>
  )
}
