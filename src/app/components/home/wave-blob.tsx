import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface WaveBlobProps {
  /** Живая анимация (CSS transform only). false = статичный градиент, 0 затрат GPU */
  alive?: boolean
  className?: string
}

/**
 * WaveBlob — «живое» пятно «Моей волны», без видео и без утечек:
 * - только CSS-анимация transform/opacity (композитор GPU, без layout/paint)
 * - цвета из активной темы (var(--primary)/--accent/--secondary), свои темы не ломает
 * - пауза при скрытой вкладке (visibilitychange) и вне вьюпорта (IntersectionObserver)
 * - prefers-reduced-motion -> статика
 * - нет rAF/таймеров/Video — нечего чистить, кроме двух слушателей
 */
export function WaveBlob({ alive = true, className }: WaveBlobProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!alive) return
    const root = rootRef.current
    if (!root) return

    const blobs = Array.from(root.querySelectorAll<HTMLElement>('[data-blob]'))
    const setPlaying = (playing: boolean) => {
      for (const b of blobs) b.style.animationPlayState = playing ? 'running' : 'paused'
    }

    const onVisibility = () => setPlaying(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) setPlaying(false)
          else if (!document.hidden) setPlaying(true)
        }
      },
      { threshold: 0 },
    )
    io.observe(root)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      io.disconnect()
      // animationPlayState сбрасывать не нужно — нода размонтируется вместе со стилями
    }
  }, [alive])

  return (
    <div ref={rootRef} className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)} aria-hidden>
      <style>{`
        @keyframes kuma-blob-a {
          0% { transform: translate3d(-8%, -4%, 0) scale(1) rotate(0deg); }
          50% { transform: translate3d(10%, 8%, 0) scale(1.18) rotate(12deg); }
          100% { transform: translate3d(-8%, -4%, 0) scale(1) rotate(0deg); }
        }
        @keyframes kuma-blob-b {
          0% { transform: translate3d(6%, 10%, 0) scale(1.1) rotate(0deg); }
          50% { transform: translate3d(-10%, -6%, 0) scale(0.94) rotate(-10deg); }
          100% { transform: translate3d(6%, 10%, 0) scale(1.1) rotate(0deg); }
        }
        @keyframes kuma-blob-c {
          0% { transform: translate3d(0%, 0%, 0) scale(1); opacity: .5; }
          50% { transform: translate3d(4%, -8%, 0) scale(1.12); opacity: .75; }
          100% { transform: translate3d(0%, 0%, 0) scale(1); opacity: .5; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-blob] { animation: none !important; }
        }
      `}</style>

      {/* Центральное «ядро» — цвет из темы, поверх базового градиента карточки */}
      <div
        data-blob
        className="absolute left-1/2 top-1/2 h-[130%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, hsl(var(--primary) / 0.85), hsl(var(--primary) / 0.35) 55%, transparent 75%)',
          animation: alive ? 'kuma-blob-a 18s ease-in-out infinite' : 'none',
          willChange: alive ? 'transform' : 'auto',
        }}
      />
      {/* Левый оттенок — accent темы */}
      <div
        data-blob
        className="absolute -left-[10%] top-[10%] h-[80%] w-[45%] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, hsl(var(--accent) / 0.7), transparent 70%)',
          animation: alive ? 'kuma-blob-b 22s ease-in-out infinite' : 'none',
          willChange: alive ? 'transform' : 'auto',
        }}
      />
      {/* Правый оттенок — secondary + белый блик для светлых тем */}
      <div
        data-blob
        className="absolute -right-[12%] bottom-[-10%] h-[85%] w-[50%] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, hsl(var(--secondary) / 0.9), transparent 70%)',
          animation: alive ? 'kuma-blob-c 26s ease-in-out infinite' : 'none',
          willChange: alive ? 'transform, opacity' : 'auto',
        }}
      />
    </div>
  )
}
