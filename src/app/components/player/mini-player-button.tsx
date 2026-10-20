import { Maximize2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'

export function MiniPlayerFullscreenButton() {
  const handleToggle = () => {
    const current = localStorage.getItem('miniPlayerFullscreen')
    const newValue = current !== 'true'
    localStorage.setItem('miniPlayerFullscreen', newValue.toString())
    window.dispatchEvent(new Event('storage'))
  }

  return (
    <SimpleTooltip content="Мини-режим" side="top">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={handleToggle}
      >
        <Maximize2 size={18} />
      </Button>
    </SimpleTooltip>
  )
}
