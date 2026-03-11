import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface DotProgressProps {
  progress: number
  duration: number
  onSeek: (value: number) => void
  className?: string
}

export function DotProgress({ progress, duration, onSeek, className }: DotProgressProps) {
  const progressPct = useMemo(() => {
    return duration > 0 ? (progress / duration) * 100 : 0
  }, [progress, duration])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration === 0) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    onSeek(pct * duration)
  }

  return (
    <div
      className={cn('relative w-full h-12 cursor-pointer group', className)}
      onClick={handleClick}
    >
      {/* Линия трека */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20 -translate-y-1/2 rounded-full" />
      
      {/* Заполненная часть */}
      <div 
        className="absolute top-1/2 left-0 h-0.5 bg-primary -translate-y-1/2 rounded-full transition-all duration-100"
        style={{ width: `${progressPct}%` }}
      />
      
      {/* Точка прогресса */}
      <div
        className="absolute top-1/2 w-4 h-4 bg-primary rounded-full shadow-lg shadow-primary/50 -translate-x-1/2 -translate-y-1/2 transition-all duration-100 group-hover:scale-125"
        style={{ left: `${progressPct}%` }}
      >
        {/* Пульсация */}
        <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-75" />
      </div>
      
      {/* Tooltip при наведении */}
      <div className="absolute -top-8 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div 
          className="absolute bg-black/80 text-white text-xs px-2 py-1 rounded -translate-x-1/2"
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
