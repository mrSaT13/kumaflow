import { useTranslation } from 'react-i18next'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import {
  MainSidebarGroup,
  MainSidebarGroupLabel,
  MainSidebarMenu,
  MainSidebarMenuItem,
} from '@/app/components/ui/main-sidebar'
import { libraryItems, SidebarItems, mlItems } from '@/app/layout/sidebar'
import { useAppStore } from '@/store/app.store'
import { SidebarMainItem } from './main-item'
import { SidebarPodcastItem } from './podcast-item'

export function NavLibrary() {
  const { t } = useTranslation()
  const hideRadiosSection = useAppStore().pages.hideRadiosSection
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
            {libraryItems.map((item) => {
              if (hideRadiosSection && item.id === SidebarItems.Radios) return null
              if (!isPodcastsActive && item.id === SidebarItems.Podcasts)
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
