import { useTranslation } from 'react-i18next'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import {
  MainSidebarGroup,
  MainSidebarGroupLabel,
  MainSidebarMenu,
  MainSidebarMenuItem,
} from '@/app/components/ui/main-sidebar'
import { libraryItems, SidebarItems, mlItems, cacheItem } from '@/app/layout/sidebar'
import { useAppStore } from '@/store/app.store'
import { SidebarMainItem } from './main-item'
import { SidebarPodcastItem } from './podcast-item'

export function NavLibrary() {
  const { t } = useTranslation()
  const hideRadiosSection = useAppStore().pages.hideRadiosSection
  const hideAudiobooksSection = useAppStore().pages.hideAudiobooksSection
  const hidePlaylistsSection = useAppStore().pages.hidePlaylistsSection
  const hideArtistsSection = useAppStore().pages.hideArtistsSection
  const hideTracksSection = useAppStore().pages.hideTracksSection
  const hideAlbumsSection = useAppStore().pages.hideAlbumsSection
  const hideFavoritesSection = useAppStore().pages.hideFavoritesSection
  const hideGenresSection = useAppStore().pages.hideGenresSection
  const hidePodcastsSection = useAppStore().pages.hidePodcastsSection
  const hideLocalSection = useAppStore().pages.hideLocalSection
  const showCachePage = useAppStore().pages.showCachePage
  const sidebarSectionOrder = useAppStore().pages.sidebarSectionOrder
  const isPodcastsActive = useAppStore().podcasts.active
  
  // Сворачивание секций
  const [isLibraryOpen, setIsLibraryOpen] = useState(true)
  const [isMLOpen, setIsMLOpen] = useState(true)

  return (
    <>
      <MainSidebarGroup className="px-4 py-0">
        <button
          onClick={() => setIsLibraryOpen(!isLibraryOpen)}
          className="flex items-center justify-between w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MainSidebarGroupLabel>{t('sidebar.library')}</MainSidebarGroupLabel>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${
              isLibraryOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
        </button>
        {isLibraryOpen && (
          <MainSidebarMenu>
            {sidebarSectionOrder.map((itemId) => {
              // Кеш - отдельная кнопка вне библиотеки
              if (itemId === 'cache') return null
              
              const item = libraryItems.find((i) => i.id === itemId)
              if (!item) return null

              // Скрыть Исполнителей если настроено
              if (hideArtistsSection && item.id === SidebarItems.Artists) return null
              // Скрыть Треки если настроено
              if (hideTracksSection && item.id === SidebarItems.Songs) return null
              // Скрыть Альбомы если настроено
              if (hideAlbumsSection && item.id === SidebarItems.Albums) return null
              // Скрыть Избранное если настроено
              if (hideFavoritesSection && item.id === SidebarItems.Favorites) return null
              // Скрыть Радио если настроено
              if (hideRadiosSection && item.id === SidebarItems.Radios) return null
              // Скрыть Аудиокниги если настроено
              if (hideAudiobooksSection && item.id === SidebarItems.Audiobooks) return null
              // Скрыть Локальную библиотеку если настроено
              if (hideLocalSection && item.id === SidebarItems.Local) return null
              // Скрыть Плейлисты если настроено
              if (hidePlaylistsSection && item.id === SidebarItems.Playlists) return null
              // Скрыть Жанры если настроено
              if (hideGenresSection && item.id === 'genres') return null
              // Скрыть Подкасты если настроено или не активны
              if ((hidePodcastsSection || !isPodcastsActive) && item.id === SidebarItems.Podcasts)
                return null

              if (item.id === SidebarItems.Podcasts) {
                return <SidebarPodcastItem key={item.id} item={item} />
              }

              return (
                <MainSidebarMenuItem key={item.id}>
                  <SidebarMainItem item={item} />
                </MainSidebarMenuItem>
              )
            })}
          </MainSidebarMenu>
        )}
      </MainSidebarGroup>

      {/* Кеш - отдельная кнопка после библиотеки */}
      {showCachePage && (
        <MainSidebarGroup className="px-4 py-0 mt-4">
          <MainSidebarMenu>
            <MainSidebarMenuItem>
              <SidebarMainItem item={cacheItem} />
            </MainSidebarMenuItem>
          </MainSidebarMenu>
        </MainSidebarGroup>
      )}

      {/* ML Рекомендации - раздел "Для вас" */}
      <MainSidebarGroup className="px-4 py-0 mt-4">
        <button
          onClick={() => setIsMLOpen(!isMLOpen)}
          className="flex items-center justify-between w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MainSidebarGroupLabel className="text-purple-400">
            ✨ Для вас
          </MainSidebarGroupLabel>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${
              isMLOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
        </button>
        {isMLOpen && (
          <MainSidebarMenu>
            {mlItems.map((item) => (
              <MainSidebarMenuItem key={item.id}>
                <SidebarMainItem item={item} />
              </MainSidebarMenuItem>
            ))}
          </MainSidebarMenu>
        )}
      </MainSidebarGroup>
    </>
  )
}
