/**
 * StarRating — Компонент рейтинга 1-5 звёзд
 * Используется для оценки треков, альбомов и артистов
 */

import { useState } from 'react'
import { Star } from 'lucide-react'
import { clsx } from 'clsx'
import { subsonic } from '@/service/subsonic'
import { toast } from 'react-toastify'

interface StarRatingProps {
  itemId: string
  initialRating?: number
  size?: 'sm' | 'md' | 'lg'
  onRatingChange?: (rating: number) => void
}

export function StarRating({ itemId, initialRating = 0, size = 'md', onRatingChange }: StarRatingProps) {
  const [currentRating, setCurrentRating] = useState(initialRating)
  const [hoverRating, setHoverRating] = useState(0)

  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  const handleSetRating = async (rating: number) => {
    try {
      // Если кликаем на текущий рейтинг и не наводим — снимаем рейтинг
      const newRating = (rating === currentRating && hoverRating === 0) ? 0 : rating

      await subsonic.rating.set(itemId, newRating)
      setCurrentRating(newRating)

      if (newRating === 0) {
        toast.info('Рейтинг убран', { autoClose: 1500 })
      } else {
        toast.success(`Поставлено ${newRating} из 5`, { autoClose: 1500 })
      }

      onRatingChange?.(newRating)
    } catch (error) {
      console.error('[StarRating] Failed to set rating:', error)
      toast.error('Ошибка при установке рейтинга', { autoClose: 2000 })
    }
  }

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleSetRating(star)
          }}
          onMouseEnter={() => setHoverRating(star)}
          onMouseLeave={() => setHoverRating(0)}
          className="transition-all duration-150 hover:scale-110"
          title={`${star} ${star === 1 ? 'звезда' : star < 5 ? 'звезды' : 'звёзд'}`}
        >
          <Star
            className={clsx(
              sizeClasses[size],
              'transition-colors duration-150',
              star <= (hoverRating || currentRating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/40'
            )}
          />
        </button>
      ))}
    </div>
  )
}
