import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyPlaylistsMessage } from '@/app/components/playlist/empty-message'
import { SidebarPlaylistButtons } from '@/app/components/playlist/sidebar-buttons'
import {
  MainSidebarGroupLabel,
  MainSidebarMenu,
  MainSidebarMenuButton,
  MainSidebarMenuItem,
} from '@/app/components/ui/main-sidebar'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { subsonic } from '@/service/subsonic'
import { ROUTES } from '@/routes/routesList'
import { useAppStore } from '@/store/app.store'
import { queryKeys } from '@/utils/queryKeys'
import { SidebarPlaylistItem } from './playlist-item'

const PLAYLISTS_OPEN_KEY = 'sidebar-playlists-open'

export function NavPlaylists() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // По умолчанию свёрнуто (раньше всегда раскрывалось и раздражало).
  // Выбор запоминается: открытое состояние хранится флагом в localStorage.
  const [isPlaylistsOpen, setIsPlaylistsOpen] = useState(
    () => {
      try {
        return localStorage.getItem(PLAYLISTS_OPEN_KEY) === '1'
      } catch {
        return false
      }
    },
  )

  const togglePlaylistsOpen = () => {
    setIsPlaylistsOpen((v) => {
      const next = !v
      try {
        if (next) localStorage.setItem(PLAYLISTS_OPEN_KEY, '1')
        else localStorage.removeItem(PLAYLISTS_OPEN_KEY)
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const { data: playlists } = useQuery({
    queryKey: [queryKeys.playlist.all],
    queryFn: subsonic.playlists.getAll,
  })

  // Секция видна только когда тумблер «Плейлисты» включён
  // (Настройки → Внешний вид → Сайдбар). По умолчанию всё живёт в /library.
  const hidePlaylistsSection = useAppStore().pages.hidePlaylistsSection

  const hasPlaylists = playlists !== undefined && playlists.length > 0

  if (hidePlaylistsSection) return null

  return (
    <>
      <div
        className={clsx(
          'flex items-center justify-between px-4 mt-4 overflow-x-clip',
          'transition-opacity group-data-[collapsible=icon]:opacity-0',
          'group-data-[collapsible=icon]:pointer-events-none',
        )}
      >
        <div className="flex items-center justify-between w-full py-2">
          {/* Клик по названию — красиво ведёт ко всем плейлистам */}
          <button
            onClick={() => navigate(ROUTES.LIBRARY.PLAYLISTS)}
            title="Открыть все плейлисты"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MainSidebarGroupLabel>{t('sidebar.playlists')}</MainSidebarGroupLabel>
          </button>
          <div className="flex items-center">
            <SidebarPlaylistButtons />
            <button
              onClick={togglePlaylistsOpen}
              title={isPlaylistsOpen ? 'Свернуть' : 'Развернуть'}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${
                  isPlaylistsOpen ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
      {isPlaylistsOpen && (
        <ScrollArea className="pb-4 pl-4">
          <MainSidebarMenu className="pr-4">
            {/* Первый пункт — всегда «Все плейлисты» */}
            <MainSidebarMenuItem>
              <MainSidebarMenuButton asChild>
                <Link to={ROUTES.LIBRARY.PLAYLISTS} title="Все плейлисты">
                  <LayoutGrid />
                  <span className="truncate font-medium">Все плейлисты</span>
                </Link>
              </MainSidebarMenuButton>
            </MainSidebarMenuItem>

            {hasPlaylists &&
              playlists.map((playlist) => (
                <SidebarPlaylistItem key={playlist.id} playlist={playlist} />
              ))}

            {!hasPlaylists && <EmptyPlaylistsMessage />}
          </MainSidebarMenu>
        </ScrollArea>
      )}
    </>
  )
}
