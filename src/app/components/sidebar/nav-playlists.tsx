import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { EmptyPlaylistsMessage } from '@/app/components/playlist/empty-message'
import { SidebarPlaylistButtons } from '@/app/components/playlist/sidebar-buttons'
import {
  MainSidebarGroupLabel,
  MainSidebarMenu,
} from '@/app/components/ui/main-sidebar'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { subsonic } from '@/service/subsonic'
import { queryKeys } from '@/utils/queryKeys'
import { SidebarPlaylistItem } from './playlist-item'

export function NavPlaylists() {
  const { t } = useTranslation()
  const [isPlaylistsOpen, setIsPlaylistsOpen] = useState(true)

  const { data: playlists } = useQuery({
    queryKey: [queryKeys.playlist.all],
    queryFn: subsonic.playlists.getAll,
  })

  const hasPlaylists = playlists !== undefined && playlists.length > 0

  return (
    <>
      <div
        className={clsx(
          'flex items-center justify-between px-4 mt-4 overflow-x-clip',
          'transition-opacity group-data-[collapsible=icon]:opacity-0',
          'group-data-[collapsible=icon]:pointer-events-none',
        )}
      >
        <button
          onClick={() => setIsPlaylistsOpen(!isPlaylistsOpen)}
          className="flex items-center justify-between w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MainSidebarGroupLabel>{t('sidebar.playlists')}</MainSidebarGroupLabel>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${
              isPlaylistsOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
        </button>
        <SidebarPlaylistButtons />
      </div>
      {isPlaylistsOpen && (
        <ScrollArea className="pb-4 pl-4">
          <MainSidebarMenu className="pr-4">
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
