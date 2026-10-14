import { cn } from '@/lib/utils'

interface DislikeHeartIconProps {
  size?: number
  className?: string
  /** Заливка сердца (активный дизлайк) */
  filled?: boolean
  strokeWidth?: number
}

/**
 * DislikeHeartIcon — своя перерисовка идеи «перечеркнутое сердце»
 * (референс: dislike_s из sprite.svg Яндекса — сердце + диагональ).
 * Геометрия нарисована заново в стиле Lucide (24x24, stroke=currentColor),
 * побайтово ничего из sprite.svg не копируем.
 */
export function DislikeHeartIcon({ size = 20, className, filled = false, strokeWidth = 2 }: DislikeHeartIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </svg>
  )
}
