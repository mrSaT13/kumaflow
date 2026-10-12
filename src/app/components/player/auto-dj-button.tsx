import { Radio } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { useAutoDJSettings, useAutoDJActions } from '@/store/auto-dj.store'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'

export function AutoDJButton() {
  const settings = useAutoDJSettings()
  const { toggleEnabled } = useAutoDJActions()

  return (
    <SimpleTooltip text={settings.enabled ? 'Авто-микс включен' : 'Авто-микс выключен'}>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          toggleEnabled()
        }}
        className={`w-10 h-10 rounded-full ${
          settings.enabled ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
        }`}
      >
        <Radio className={`w-5 h-5 ${settings.enabled ? 'fill-current' : ''}`} />
      </Button>
    </SimpleTooltip>
  )
}
