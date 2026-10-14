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
  const hideMlSection = useAppStore().pages.hideMlSection
  const sidebarSectionOrder = useAppStore().pages.sidebarSectionOrder
  const isPodcastsActive = useAppStore().podcasts.active
  
  // Сворачивание секций
  const [isLibraryOpen, setIsLibraryOpen] = useState(true)
  const [isMLOpen, setIsMLOpen] = useState(true)

  // Один источник правды: пункт виден, только если тумблер включён
  // (Настройки → Внешний вид → Сайдбар).
  const isLibraryItemHidden = (itemId: string) => {
    if (hideArtistsSection && itemId === SidebarItems.Artists) return true
    if (hideTracksSection && itemId === SidebarItems.Songs) return true
    if (hideAlbumsSection && itemId === SidebarItems.Albums) return true
    if (hideFavoritesSection && itemId === SidebarItems.Favorites) return true
    if (hideRadiosSection && itemId === SidebarItems.Radios) return true
    if (hideAudiobooksSection && itemId === SidebarItems.Audiobooks) return true
    if (hideLocalSection && itemId === SidebarItems.Local) return true
    if (hidePlaylistsSection && itemId === SidebarItems.Playlists) return true
    if (hideGenresSection && itemId === 'genres') return true
    if ((hidePodcastsSection || !isPodcastsActive) && itemId === SidebarItems.Podcasts)
      return true
    return false
  }

  // Видимые пункты в порядке пользователя. Если пусто — прячем и сам
  // заголовок «Библиотека», чтобы не висела пустая строка.
  const visibleLibraryItems = sidebarSectionOrder
    .map((itemId) => libraryItems.find((i) => i.id === itemId))
    .filter(
      (item): item is (typeof libraryItems)[number] =>
        !!item && !isLibraryItemHidden(item.id),
    )

  return (
    <>
      {visibleLibraryItems.length > 0 && (
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
              {visibleLibraryItems.map((item) => {
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
      )}

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

      {/* ML Рекомендации - раздел "Для вас". Виден только когда тумблер включён:
          всё это уже есть на странице «Библиотека». */}
      {!hideMlSection && (
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
      )}
    </>
  )
}
