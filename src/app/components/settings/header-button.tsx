import { Settings } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { useIsMobile } from '@/app/hooks/use-mobile'
import { useOpenSettings } from '@/app/hooks/use-open-settings'
import { useAppSettings } from '@/store/app.store'

export function SettingsButton() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const openSettings = useOpenSettings()
  const { openDialog, setOpenDialog } = useAppSettings()

  useHotkeys('mod+comma', () => {
    if (isMobile) {
      openSettings()
      return
    }
    setOpenDialog(!openDialog)
  })

  return (
    <SimpleTooltip text={t('settings.label')} side="bottom">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (isMobile) {
            openSettings()
            return
          }
          setOpenDialog(true)
        }}
        className="h-8 w-8 p-0 rounded-md"
      >
        <Settings className="w-4 h-4" />
      </Button>
    </SimpleTooltip>
  )
}