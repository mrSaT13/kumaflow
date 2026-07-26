import { useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

interface DotProgressProps {
  progress: number
  duration: number
  onSeek: (value: number) => void
  onSeekStart?: () => void
  onSeekChange?: (value: number) => void
  className?: string
}

export function DotProgress({
  progress,
  duration,
  onSeek,
  onSeekStart,
  onSeekChange,
  className,
}: DotProgressProps) {
  const isDraggingRef = useRef(false)

  const progressPct = useMemo(() => {
    return duration > 0 ? (progress / duration) * 100 : 0
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

  return (
    <div
      className={cn('group relative h-14 w-full cursor-pointer touch-none', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishSeek}
      onPointerCancel={finishSeek}
    >
      <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-white/20" />

      <div
        className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-100"
        style={{ width: `${progressPct}%` }}
      />

      <div
        className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-lg shadow-primary/50 transition-all duration-100 group-hover:scale-125"
        style={{ left: `${progressPct}%` }}
      >
        <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-75" />
      </div>

      <div className="pointer-events-none absolute -top-8 left-0 right-0 opacity-0 transition-opacity group-hover:opacity-100">
        <div
          className="absolute -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-xs text-white"
          style={{ left: `${progressPct}%` }}
        >
          {formatTime(progress)}
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
