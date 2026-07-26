import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SpectrogramProgressProps {
  progress: number
  duration: number
  onSeek: (value: number) => void
  onSeekStart?: () => void
  onSeekChange?: (value: number) => void
  className?: string
}

export function SpectrogramProgress({
  progress,
  duration,
  onSeek,
  onSeekStart,
  onSeekChange,
  className,
}: SpectrogramProgressProps) {
  const isDraggingRef = useRef(false)

  const progressPct = useMemo(() => {
    return duration > 0 ? progress / duration : 0
  }, [progress, duration])

  const seekFromClientX = (clientX: number, element: HTMLElement) => {
    if (duration === 0) return 0

    const rect = element.getBoundingClientRect()
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    return pct * duration
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration === 0) return

    isDraggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onSeekStart?.()
    onSeekChange?.(seekFromClientX(e.clientX, e.currentTarget))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || duration === 0) return

    onSeekChange?.(seekFromClientX(e.clientX, e.currentTarget))
  }

  const finishSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    onSeek(seekFromClientX(e.clientX, e.currentTarget))
  }

  // Генерируем столбики спектрограммы
  const bars = useMemo(() => {
    const barCount = 60
    return Array.from({ length: barCount }, (_, i) => {
      const barProgress = i / barCount
      const isPassed = barProgress <= progressPct
      
      // Высота столбика - синусоида для красоты
      const height = Math.sin(barProgress * Math.PI) * 0.6 + 0.4
      
      // Цвет как в thunderdrome - градиент от желтого к фиолетовому
      let color
      if (barProgress < 0.25) color = 'hsla(43,99%,50%, 1)'      // yellow
      else if (barProgress < 0.40) color = 'hsla(14,100%,49%, 1)' // orange
      else if (barProgress < 0.55) color = 'hsla(0,100%,49%, 1)'  // red
      else if (barProgress < 0.70) color = 'hsla(344,100%,43%, 1)' // beet
      else color = 'hsla(331,97%,26%, 1)' // fuchsia
      
      return {
        height,
        color,
        isPassed,
        key: i,
      }
    })
  }, [progressPct])

  return (
    <div
      className={cn('relative flex h-12 w-full cursor-pointer touch-none items-end gap-px', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSeek}
      onPointerCancel={finishSeek}
    >
      {bars.map((bar) => (
        <div
          key={bar.key}
          className="flex-1 rounded-t transition-all duration-300"
          style={{
            height: `${bar.height * 100}%`,
            backgroundColor: bar.color,
            opacity: bar.isPassed ? 1 : 0.3,
          }}
        />
      ))}
      
      {/* Линия прогресса */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg shadow-white/50 pointer-events-none"
        style={{ left: `${progressPct * 100}%` }}
      />
    </div>
  )
}
