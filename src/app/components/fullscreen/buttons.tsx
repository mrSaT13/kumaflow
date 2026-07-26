import { ChevronDown } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { usePlayerFullscreen } from '@/store/player.store'
import { buttonsStyle } from './controls'

export function CloseFullscreenButton({ compact = false }: { compact?: boolean }) {
  const { setIsFullscreen } = usePlayerFullscreen()

  return (
    <Button
      variant="ghost"
      size="icon"
      className={compact ? buttonsStyle.secondaryCompact : buttonsStyle.secondary}
      style={{ ...buttonsStyle.style }}
      onClick={() => setIsFullscreen(false)}
      aria-label="Свернуть плеер"
    >
      <ChevronDown
        className={compact ? 'size-7 drop-shadow-lg' : 'size-9 drop-shadow-lg'}
        strokeWidth={1.5}
      />
    </Button>
  )
}
