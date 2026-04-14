import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '@/app/components/ui/sidebar'
import { useAppSettings } from '@/store/app.store'
import { SettingsBreadcrumb } from './breadcrumb'
import { SettingsOptions } from './options'
import { Pages } from './pages'
import { SettingsSearch } from './settings-search'
import { Search } from 'lucide-react'

export function SettingsDialog() {
  const { t } = useTranslation()
  const { openDialog, setOpenDialog } = useAppSettings()
  const [showSearch, setShowSearch] = useState(false)

  // Обработчик открытия настроек из трея
  useEffect(() => {
    const handleOpenSettingsFromTray = () => {
      setOpenDialog(true)
      // НЕ открываем поиск автоматически
      setShowSearch(false)
    }

    window.addEventListener('open-settings-from-tray', handleOpenSettingsFromTray)

    return () => {
      window.removeEventListener('open-settings-from-tray', handleOpenSettingsFromTray)
    }
  }, [setOpenDialog])

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent
        className="overflow-hidden p-0 h-[500px] max-h-[600px] max-w-4xl 2xl:h-[600px] 2xl:max-h-[700px]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t('settings.label')}</DialogTitle>
        <SidebarProvider className="min-h-full">
          <Sidebar collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SettingsOptions />
            </SidebarContent>
          </Sidebar>
          <main className="flex flex-1 flex-col overflow-hidden bg-background-foreground">
            {/* Заголовок с кнопкой поиска */}
            <div className="flex items-center justify-between p-4 border-b">
              <SettingsBreadcrumb />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(true)}
                title="Поиск настроек"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="overflow-hidden">
              <div className="w-full h-full gap-4 p-4 pt-0">
                <Pages />
              </div>
            </ScrollArea>
          </main>
        </SidebarProvider>
      </DialogContent>
      
      {/* Модальное окно поиска */}
      {showSearch && (
        <DialogContent 
          className="h-[600px] max-w-2xl p-0 flex flex-col overflow-hidden"
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
