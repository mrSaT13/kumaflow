import { ArrowLeft, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { useMainSidebar } from '@/app/components/ui/main-sidebar'
import { useAppSettings } from '@/store/app.store'
import { SettingsOptions } from './options'
import { Pages } from './pages'
import { SettingsSearch } from './settings-search'

export function SettingsSidebarPanel() {
  const { t } = useTranslation()
  const { mobileView, setMobileView, currentPage, setOpenDialog } = useAppSettings()
  const { setOpenMobile } = useMainSidebar()

  const handleClose = () => {
    setOpenDialog(false)
    setOpenMobile(false)
  }

  const handleBack = () => {
    if (mobileView === 'search') {
      setMobileView('categories')
      return
    }
    setMobileView('categories')
  }

  const handleSelectCategory = () => {
    setMobileView('content')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        {mobileView !== 'categories' ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={handleBack}
            aria-label="Назад"
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : (
          <div className="size-8 shrink-0" />
        )}

        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
          {mobileView === 'search'
            ? 'Поиск'
            : mobileView === 'content'
              ? t(`settings.options.${currentPage}`)
              : t('settings.label')}
        </h2>

        {mobileView === 'categories' && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setMobileView('search')}
            aria-label="Поиск настроек"
          >
            <Search className="size-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={handleClose}
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </Button>
      </div>

      {mobileView === 'categories' && (
        <ScrollArea className="min-h-0 flex-1">
          <SettingsOptions onSelect={handleSelectCategory} />
        </ScrollArea>
      )}

      {mobileView === 'content' && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            <Pages />
          </div>
        </ScrollArea>
      )}

      {mobileView === 'search' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SettingsSearch
            embedded
            onClose={() => setMobileView('categories')}
          />
        </div>
      )}
    </div>
  )
}
