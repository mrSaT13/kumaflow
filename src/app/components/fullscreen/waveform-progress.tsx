import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface WaveformProgressProps {
  progress: number
  duration: number
  onSeek: (value: number) => void
  className?: string
}

export function WaveformProgress({ progress, duration, onSeek, className }: WaveformProgressProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let isAnimating = true

    const draw = () => {
      if (!isAnimating) return

      const width = canvas.width
      const height = canvas.height

      // Очищаем canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(0, 0, width, height)

      // Рисуем волну
      const progressPct = duration > 0 ? progress / duration : 0
      const barCount = 30
      const barWidth = width / barCount

      for (let i = 0; i < barCount; i++) {
        const barProgress = i / barCount
        const isPassed = barProgress <= progressPct
        
        // Создаем волну
        const waveHeight = Math.sin(barProgress * Math.PI * 4 + Date.now() / 500) * 0.5 + 0.5
        const barHeight = waveHeight * height * 0.6

        ctx.fillStyle = isPassed 
          ? 'rgba(53, 116, 252, 0.9)' 
          : 'rgba(53, 116, 252, 0.2)'
        
        ctx.fillRect(
          i * barWidth,
          (height - barHeight) / 2,
          barWidth - 1,
          barHeight
        )
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      isAnimating = false
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [progress, duration])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || duration === 0) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    onSeek(pct * duration)
  }

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={24}
      className={cn('w-full cursor-pointer rounded', className)}
      onClick={handleClick}
    />
  )
}
