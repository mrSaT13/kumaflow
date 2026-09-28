import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { useAutoDJActions, useAutoDJSettings } from '@/store/auto-dj.store'

export function AutoDJButton() {
  const { t } = useTranslation()
  const settings = useAutoDJSettings()
  const { toggleEnabled } = useAutoDJActions()

  return (
    <SimpleTooltip
      text={
        settings.enabled
          ? t('player.tooltips.autoMix.enable')
          : t('player.tooltips.autoMix.disable')
      }
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          toggleEnabled()
        }}
        className={`w-10 h-10 rounded-full ${
          settings.enabled
            ? 'bg-primary/20 text-primary'
            : 'text-muted-foreground'
        }`}
      >
        <Radio
          className={`w-5 h-5 ${settings.enabled ? 'fill-current' : ''}`}
        />
      </Button>
    </SimpleTooltip>
  )
}
