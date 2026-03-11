import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface SpectrogramProgressProps {
  progress: number
  duration: number
  onSeek: (value: number) => void
  className?: string
}

export function SpectrogramProgress({ progress, duration, onSeek, className }: SpectrogramProgressProps) {
  const progressPct = useMemo(() => {
    return duration > 0 ? progress / duration : 0
  }, [progress, duration])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration === 0) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    onSeek(pct * duration)
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
      className={cn('relative w-full h-8 cursor-pointer flex items-end gap-px', className)}
      onClick={handleClick}
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
