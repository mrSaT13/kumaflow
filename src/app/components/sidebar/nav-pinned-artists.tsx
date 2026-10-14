import clsx from 'clsx'
import { ChevronDownIcon, MicVocal, Pin, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  MainSidebarGroup,
  MainSidebarGroupLabel,
  MainSidebarMenu,
  MainSidebarMenuButton,
  MainSidebarMenuItem,
} from '@/app/components/ui/main-sidebar'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { ROUTES } from '@/routes/routesList'
import { usePinnedArtists, usePinnedArtistsActions } from '@/store/pinned-artists.store'

/**
 * Закреплённые артисты в сайдбаре (как список артистов у Яндекса).
 * Секция рисуется только когда есть пины — пустая никого не раздражает.
 * Строки — штатный MainSidebarMenuButton: в свёрнутом сайдбаре остаётся
 * только кружок аватара, подпись и крестик прячутся сами.
 */
export function NavPinnedArtists() {
  const params = useParams() as { artistId?: string }
  const pinned = usePinnedArtists()
  const { unpin } = usePinnedArtistsActions()
  const [isOpen, setIsOpen] = useState(true)

  if (pinned.length === 0) return null

  return (
    <MainSidebarGroup className="px-4 py-0 mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <MainSidebarGroupLabel className="flex items-center gap-1.5">
          <Pin className="w-3.5 h-3.5" />
          Закреплённые
        </MainSidebarGroupLabel>
        <ChevronDownIcon
          className={`h-4 w-4 transition-transform ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      {isOpen && (
        <MainSidebarMenu>
          {pinned.map((artist) => {
            const isActive = params.artistId === artist.artistId
            return (
              <MainSidebarMenuItem key={artist.artistId} className="relative group/pin">
                <MainSidebarMenuButton
                  asChild
                  className={clsx(
                    // p-0: контент-бокс кнопки ровно под круг size-8.
                    // Со штатным p-2 кнопки (h-8) круг резался сверху/снизу
                    // в развёрнутом сайдбаре и слева/справа в свёрнутом
                    // (там кнопка всего 32px шириной) — получались овалы.
                    // group-data-ветка страхует свёрнутый режим.
                    'p-0 group-data-[collapsible=icon]:!p-0',
                    isActive && 'cursor-default bg-accent',
                  )}
                >
                  <Link
                    to={ROUTES.ARTIST.PAGE(artist.artistId)}
                    title={artist.artistName}
                    onClick={(e) => {
                      if (isActive) e.preventDefault()
                    }}
                  >
                    {artist.coverArt ? (
                      <img
                        src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '100')}
                        alt=""
                        loading="lazy"
                        className="size-8 aspect-square rounded-full object-cover shrink-0 bg-muted"
                      />
                    ) : (
                      <span className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <MicVocal className="size-4 text-muted-foreground" />
                      </span>
                    )}
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {artist.artistName}
                    </span>
                  </Link>
                </MainSidebarMenuButton>
                <button
                  onClick={() => unpin(artist.artistId)}
                  title="Открепить"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover/pin:opacity-100 hover:bg-background transition-opacity group-data-[collapsible=icon]:hidden"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </MainSidebarMenuItem>
            )
          })}
        </MainSidebarMenu>
      )}
    </MainSidebarGroup>
  )
}
