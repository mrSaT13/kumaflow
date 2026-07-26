import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '@/app/components/ui/sidebar'
import { useIsMobile } from '@/app/hooks/use-mobile'
import { useAppSettings } from '@/store/app.store'
import { SettingsBreadcrumb } from './breadcrumb'
import { SettingsOptions } from './options'
import { Pages } from './pages'
import { SettingsSearch } from './settings-search'
import { Search } from 'lucide-react'

export function SettingsDialog() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { openDialog, setOpenDialog } = useAppSettings()
  const [showSearch, setShowSearch] = useState(false)

  if (isMobile) return null

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent
        className="flex h-[min(88vh,820px)] w-[min(96vw,72rem)] max-w-none flex-col overflow-hidden p-0 sm:rounded-xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t('settings.label')}</DialogTitle>
        <SidebarProvider className="flex min-h-0 w-full flex-1">
          <Sidebar collapsible="none" className="hidden w-56 shrink-0 md:flex">
            <SidebarContent>
              <SettingsOptions />
            </SidebarContent>
          </Sidebar>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-foreground">
            <div className="flex shrink-0 items-center justify-between border-b p-4">
              <SettingsBreadcrumb />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(true)}
                title="Поиск настроек"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="w-full min-w-0 space-y-4 p-4 pt-0">
                <Pages />
              </div>
            </ScrollArea>
          </main>
        </SidebarProvider>
      </DialogContent>
      
      {/* Модальное окно поиска */}
      {showSearch && (
        <DialogContent 
          className="flex h-[min(80vh,700px)] w-[min(92vw,48rem)] max-w-none flex-col overflow-hidden p-0"
          showCloseButton={false}  // Отключаем встроенный крестик
          onOpenChange={(open) => {
            // Закрываем только поиск, не главные настройки
            if (!open) setShowSearch(false)
          }}
        >
          <SettingsSearch 
            onClose={() => setShowSearch(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
