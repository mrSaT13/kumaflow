/**
 * Holiday & Event Detector - Определение праздников и событий
 * 
 * Проверяет текущую дату и определяет:
 * - Государственные праздники
 * - Музыкальные события
 * - Сезонные события
 * - Тематические недели
 */

export interface HolidayEvent {
  id: string
  name: string
  description: string
  date: Date
  duration: number // дней
  theme: string
  genres: string[]
  mood: string
  energy: { min: number; max: number }
}

// Праздники и события (можно расширить)
const HOLIDAYS: Record<string, Omit<HolidayEvent, 'id' | 'date'>> = {
  // Государственные праздники
  'new-year': {
    name: '🎄 Новый Год',
    description: 'Праздничная неделя Нового Года',
    duration: 7,
    theme: 'celebration',
    genres: ['pop', 'dance', 'electronic', 'disco'],
    mood: 'festive',
    energy: { min: 0.7, max: 1.0 },
  },
  'valentine': {
    name: '💕 День Святого Валентина',
    description: 'Романтическая неделя',
    date: new Date(new Date().getFullYear(), 1, 14),
    duration: 7,
    theme: 'romantic',
    genres: ['pop', 'rnb', 'soul', 'ballad'],
    mood: 'romantic',
    energy: { min: 0.3, max: 0.7 },
  },
  'womens-day': {
    name: '🌸 8 Марта',
    description: 'Весенняя праздничная неделя',
    date: new Date(new Date().getFullYear(), 2, 8),
    duration: 7,
    theme: 'spring',
    genres: ['pop', 'light', 'acoustic', 'indie'],
    mood: 'uplifting',
    energy: { min: 0.5, max: 0.8 },
  },
  'halloween': {
    name: '🎃 Хэллоуин',
    description: 'Темная неделя Хэллоуина',
    date: new Date(new Date().getFullYear(), 9, 31),
    duration: 7,
    theme: 'dark',
    genres: ['metal', 'rock', 'dark', 'industrial'],
    mood: 'dark',
    energy: { min: 0.6, max: 1.0 },
  },
  'christmas': {
    name: '🎅 Рождество',
    description: 'Рождественская неделя',
    date: new Date(new Date().getFullYear(), 11, 25),
    duration: 7,
    theme: 'cozy',
    genres: ['classical', 'jazz', 'acoustic', 'folk'],
    mood: 'cozy',
    energy: { min: 0.2, max: 0.6 },
  },
  
  // Музыкальные события
  'summer-vibes': {
    name: '☀️ Летние вайбы',
    description: 'Летняя музыкальная неделя',
    date: new Date(new Date().getFullYear(), 5, 21), // 21 июня
    duration: 14,
    theme: 'summer',
    genres: ['pop', 'reggae', 'dance', 'tropical'],
    mood: 'sunny',
    energy: { min: 0.6, max: 0.9 },
  },
  'back-to-school': {
    name: '📚 Back to School',
    description: 'Сентябрьская неделя',
    date: new Date(new Date().getFullYear(), 8, 1), // 1 сентября
    duration: 7,
    theme: 'study',
    genres: ['lo-fi', 'ambient', 'classical', 'jazz'],
    mood: 'focused',
    energy: { min: 0.2, max: 0.5 },
  },
}

/**
 * Проверить есть ли сейчас активный праздник
 */
export function getCurrentHoliday(): HolidayEvent | null {
  const now = new Date()
  
  for (const [id, holiday] of Object.entries(HOLIDAYS)) {
    // Если дата не указана - пропускаем (нужно задать)
    if (!holiday.date) continue
    
    const holidayStart = new Date(holiday.date)
    const holidayEnd = new Date(holiday.date)
    holidayEnd.setDate(holidayEnd.getDate() + holiday.duration)
    
    if (now >= holidayStart && now <= holidayEnd) {
      return {
        id,
        ...holiday,
        date: holiday.date,
      }
    }
  }
  
  return null
}

/**
 * Получить все праздники в текущей неделе
 */
export function getUpcomingHolidays(): HolidayEvent[] {
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  
  const upcoming: HolidayEvent[] = []
  
  for (const [id, holiday] of Object.entries(HOLIDAYS)) {
    if (!holiday.date) continue
    
    const holidayDate = new Date(holiday.date)
    
    if (holidayDate >= now && holidayDate <= weekFromNow) {
      upcoming.push({
        id,
        ...holiday,
        date: holiday.date,
      })
    }
  }
  
  return upcoming
}

/**
 * Получить prompt для LLM на основе праздника
 */
export function getHolidayPrompt(holiday: HolidayEvent): string {
  return `
СЕЙЧАС ПРАЗДНИК: ${holiday.name}
Описание: ${holiday.description}
Тема: ${holiday.theme}
Настроение: ${holiday.mood}
Рекомендуемые жанры: ${holiday.genres.join(', ')}
Энергия: ${holiday.energy.min}-${holiday.energy.max}

Создай плейлист подходящий для этого праздника!
`
}
