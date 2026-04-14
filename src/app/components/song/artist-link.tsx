import clsx from 'clsx'
import { RefAttributes, useState, useEffect, useRef } from 'react'
import { Link, LinkProps } from 'react-router-dom'
import { Dot } from '@/app/components/dot'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { IFeaturedArtist } from '@/types/responses/artist'
import { TABLE_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { Mic2, Users } from 'lucide-react'

export type LinkWithoutTo = Omit<LinkProps, 'to'> &
  RefAttributes<HTMLAnchorElement>

type ArtistLinkProps = LinkWithoutTo & {
  artistId?: string
}

export function ArtistLink({ artistId, className, ...props }: ArtistLinkProps) {
  return (
    <Link
      className={cn(
        'truncate',
        className,
        artistId ? 'hover:underline' : 'pointer-events-none',
      )}
      {...props}
      to={ROUTES.ARTIST.PAGE(artistId ?? '')}
      onContextMenu={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
    />
  )
}

type ArtistsLinksProps = {
  artists: IFeaturedArtist[]
  onClickLink?: () => void
}

export function ArtistsLinks({ artists, onClickLink }: ArtistsLinksProps) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const data = artists.slice(0, TABLE_ARTISTS_MAX_NUMBER)
  const showThreeDots = artists.length > TABLE_ARTISTS_MAX_NUMBER

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

  function showDot(index: number) {
    return index < artists.length - 1
  }

  function showTitle(index: number, name: string) {
    return index > 0 ? name : undefined
  }

  return (
    <div className="relative">
      <div className="flex items-center truncate">
        {data.map(({ id, name, coverArt }, index) => (
          <div
            key={id}
            className={clsx('flex items-center', index > 0 && 'truncate')}
          >
            <ArtistLink
              artistId={id}
              title={showTitle(index, name)}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (onClickLink) onClickLink()
              }}
            >
              {name}
            </ArtistLink>
            {showDot(index) && <Dot />}
          </div>
        ))}
        {showThreeDots && <span>...</span>}
        
        {/* Кнопка-иконка для показа попапа (только если >1 артиста) */}
        {artists.length > 1 && (
          <button
            onClick={() => setShowPopover(!showPopover)}
            className="ml-1 p-0.5 rounded hover:bg-accent transition-colors flex-shrink-0"
            title="Выбрать артиста"
          >
            <Users size={12} className="text-muted-foreground hover:text-primary transition-colors" />
          </button>
        )}
      </div>

      {/* Попап выбора артиста (Glassmorphism) */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 z-50 w-64 rounded-lg overflow-hidden shadow-xl border backdrop-blur-md"
          style={{
            backgroundColor: 'hsla(var(--card) / 0.85)',
            borderColor: 'hsla(var(--border) / 0.5)',
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'hsla(var(--border) / 0.3)' }}>
            <p className="text-xs font-semibold text-muted-foreground">Выберите артиста:</p>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                to={ROUTES.ARTIST.PAGE(artist.id)}
                onClick={() => setShowPopover(false)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors group"
              >
                {/* Аватарка артиста */}
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--border)' }}>
                  {artist.coverArt ? (
                    <img
                      src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '100')}
                      alt={artist.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Mic2 size={14} />
                    </div>
                  )}
                </div>
                {/* Имя артиста */}
                <span className="text-sm truncate group-hover:text-primary transition-colors text-foreground">
                  {artist.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
