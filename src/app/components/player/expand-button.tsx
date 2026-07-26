import { Maximize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { usePlayerFullscreen } from '@/store/player.store'

interface PlayerExpandButtonProps {
  disabled: boolean
  compact?: boolean
}

export function PlayerExpandButton({ disabled, compact = false }: PlayerExpandButtonProps) {
  const { t } = useTranslation()
  const { setIsFullscreen } = usePlayerFullscreen()

  return (
    <Button
      variant="ghost"
      size={compact ? 'icon' : 'default'}
      className={compact
        ? 'rounded-full w-8 h-8 p-0 shrink-0 text-secondary-foreground'
        : 'rounded-full w-10 h-10 p-0 text-secondary-foreground'}
      data-testid="track-fullscreen-button"
      disabled={disabled}
      onClick={() => setIsFullscreen(true)}
    >
      <SimpleTooltip text={t('fullscreen.switchButton')}>
        <div className={compact
          ? 'size-full p-1.5 flex items-center justify-center'
          : 'size-full p-3 flex items-center justify-center'}>
          <Maximize2
            data-testid="track-fullscreen-icon"
            className={compact ? 'w-4 h-4' : undefined}
          />
        </div>
      </SimpleTooltip>
    </Button>
  )
}
