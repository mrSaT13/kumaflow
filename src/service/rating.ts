/**
 * Rating API — Оценка треков, альбомов и артистов (1-5 звёзд)
 * Subsonic API: setRating
 */

import { httpClient } from '@/api/httpClient'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'

/**
 * Установить рейтинг (1-5 звёзд)
 * @param id - ID трека, альбома или артиста
 * @param rating - Рейтинг от 1 до 5 (0 = убрать рейтинг)
 */
export async function setRating(
  id: string,
  rating: number
): Promise<void> {
  // Валидация
  if (rating < 0 || rating > 5) {
    throw new Error('Rating must be between 0 and 5')
  }

  await httpClient<SubsonicResponse>('/setRating', {
    method: 'GET',
    query: {
      id,
      rating: rating.toString(),
    },
  })
}

/**
 * Быстрые хелперы
 */
export const rating = {
  /** Установить рейтинг 1-5 */
  set: setRating,

  /** Убрать рейтинг */
  clear: (id: string) => setRating(id, 0),

  /** Поставить 5 звёзд */
  fiveStars: (id: string) => setRating(id, 5),

  /** Поставить 4 звезды */
  fourStars: (id: string) => setRating(id, 4),

  /** Поставить 3 звезды */
  threeStars: (id: string) => setRating(id, 3),

  /** Поставить 2 звезды */
  twoStars: (id: string) => setRating(id, 2),

  /** Поставить 1 звезду */
  oneStar: (id: string) => setRating(id, 1),
}
