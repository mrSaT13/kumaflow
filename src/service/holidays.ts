/**
 * Праздничные плейлисты — Список праздников
 * 
 * Поддержка:
 * - Мировые праздники
 * - Российские праздники
 * - Импорт из .ics календаря
 * - Ручное добавление
 */

export interface Holiday {
  id: string
  name: string
  startDate: string  // MM-DD
  endDate: string    // MM-DD
  isFixed: boolean   // true = фиксированная дата, false = плавающая
  genres: string[]
  mood: string[]
  energy: { min: number; max: number }
  valence: { min: number; max: number }
  icon: string
  isImported?: boolean  // true = импортирован из календаря
  isEnabled?: boolean   // true = включён в настройках
  isCustom?: boolean    // 🆕 true = добавлен вручную пользователем
  holidayType?: string  // 🆕 Тип праздника (birthday, wedding, party...)
}

/**
 * Список праздников по умолчанию
 */
export const DEFAULT_HOLIDAYS: Holiday[] = [
  // === ЗИМА ===
  {
    id: 'new-year',
    name: 'Новый год',
    startDate: '12-20',
    endDate: '01-10',
    isFixed: true,
    genres: ['christmas', 'holiday', 'pop', 'classical'],
    mood: ['festive', 'happy', 'magical'],
    energy: { min: 0.6, max: 0.9 },
    valence: { min: 0.7, max: 1.0 },
    icon: '🎄',
    isEnabled: true,
  },
  {
    id: 'christmas',
    name: 'Рождество',
    startDate: '12-20',
    endDate: '01-14',
    isFixed: true,
    genres: ['christmas', 'classical', 'gospel', 'jazz'],
    mood: ['warm', 'cozy', 'peaceful'],
    energy: { min: 0.3, max: 0.7 },
    valence: { min: 0.5, max: 0.9 },
    icon: '⭐',
    isEnabled: true,
  },
  {
    id: 'old-new-year',
    name: 'Старый Новый год',
    startDate: '01-13',
    endDate: '01-14',
    isFixed: true,
    genres: ['pop', 'rock', 'folk'],
    mood: ['festive', 'happy'],
    energy: { min: 0.5, max: 0.8 },
    valence: { min: 0.6, max: 0.9 },
    icon: '🎉',
    isEnabled: true,
  },
  {
    id: 'halloween',
    name: 'Хэллоуин',
    startDate: '10-01',
    endDate: '10-31',
    isFixed: true,
    genres: ['metal', 'rock', 'industrial', 'soundtrack'],
    mood: ['dark', 'energetic', 'dramatic'],
    energy: { min: 0.7, max: 1.0 },
    valence: { min: 0.0, max: 0.4 },
    icon: '🎃',
    isEnabled: true,
  },
  
  // === ВЕСНА ===
  {
    id: 'valentines-day',
    name: 'День святого Валентина',
    startDate: '02-01',
    endDate: '02-15',
    isFixed: true,
    genres: ['r&b', 'soul', 'pop', 'jazz'],
    mood: ['romantic', 'tender', 'warm'],
    energy: { min: 0.3, max: 0.6 },
    valence: { min: 0.5, max: 0.8 },
    icon: '💝',
    isEnabled: true,
  },
  {
    id: 'feb-23',
    name: '23 февраля',
    startDate: '02-15',
    endDate: '02-23',
    isFixed: true,
    genres: ['rock', 'metal', 'military', 'classical'],
    mood: ['strong', 'proud', 'powerful'],
    energy: { min: 0.6, max: 0.9 },
    valence: { min: 0.4, max: 0.7 },
    icon: '🎗️',
    isEnabled: true,
  },
  {
    id: 'march-8',
    name: '8 марта',
    startDate: '03-01',
    endDate: '03-08',
    isFixed: true,
    genres: ['pop', 'r&b', 'soul', 'jazz'],
    mood: ['feminine', 'beautiful', 'warm'],
    energy: { min: 0.4, max: 0.7 },
    valence: { min: 0.6, max: 0.9 },
    icon: '🌸',
    isEnabled: true,
  },
  {
    id: 'may-1',
    name: '1 мая',
    startDate: '04-25',
    endDate: '05-05',
    isFixed: true,
    genres: ['pop', 'rock', 'folk', 'country'],
    mood: ['spring', 'happy', 'joyful'],
    energy: { min: 0.5, max: 0.8 },
    valence: { min: 0.6, max: 0.9 },
    icon: '🌷',
    isEnabled: true,
  },
  {
    id: 'may-9',
    name: '9 мая',
    startDate: '05-01',
    endDate: '05-09',
    isFixed: true,
    genres: ['classical', 'military', 'folk', 'romance'],
    mood: ['solemn', 'proud', 'memorial'],
    energy: { min: 0.3, max: 0.7 },
    valence: { min: 0.4, max: 0.7 },
    icon: '🎖️',
    isEnabled: true,
  },
  
  // === ЛЕТО ===
  {
    id: 'russia-day',
    name: 'День России',
    startDate: '06-10',
    endDate: '06-12',
    isFixed: true,
    genres: ['pop', 'rock', 'classical', 'folk'],
    mood: ['patriotic', 'festive', 'proud'],
    energy: { min: 0.5, max: 0.8 },
    valence: { min: 0.6, max: 0.9 },
    icon: '🇷🇺',
    isEnabled: true,
  },
  
  // === ОСЕНЬ ===
  {
    id: 'unity-day',
    name: 'День народного единства',
    startDate: '11-01',
    endDate: '11-04',
    isFixed: true,
    genres: ['classical', 'folk', 'orthodox'],
    mood: ['solemn', 'spiritual', 'proud'],
    energy: { min: 0.3, max: 0.6 },
    valence: { min: 0.4, max: 0.7 },
    icon: '🦅',
    isEnabled: true,
  },
]

/**
 * Плавающие праздники (рассчитываются ежегодно)
 */
export const FLOATING_HOLIDAYS = {
  easter: (year: number): Holiday => {
    // Пасха (православная) - рассчитывается по лунному календарю
    // Упрощённо: обычно апрель-май
    return {
      id: 'easter',
      name: 'Пасха',
      startDate: '04-20',  // Приблизительно
      endDate: '05-10',
      isFixed: false,
      genres: ['orthodox', 'classical', 'gospel'],
      mood: ['bright', 'joyful', 'spiritual'],
      energy: { min: 0.4, max: 0.7 },
      valence: { min: 0.6, max: 0.9 },
      icon: '✝️',
      isEnabled: true,
    }
  },
  maslenitsa: (year: number): Holiday => {
    // Масленица - неделя перед Великим постом
    return {
      id: 'maslenitsa',
      name: 'Масленица',
      startDate: '02-20',  // Приблизительно
      endDate: '02-26',
      isFixed: false,
      genres: ['folk', 'pop', 'rock'],
      mood: ['festive', 'fun', 'traditional'],
      energy: { min: 0.5, max: 0.8 },
      valence: { min: 0.6, max: 0.9 },
      icon: '🥞',
      isEnabled: true,
    }
  },
}

/**
 * Получить все праздники (фиксированные + плавающие)
 */
export function getAllHolidays(year: number = new Date().getFullYear()): Holiday[] {
  const fixed = DEFAULT_HOLIDAYS
  const floating = Object.values(FLOATING_HOLIDAYS).map(fn => fn(year))
  
  return [...fixed, ...floating]
}

/**
 * Проверить активен ли праздник сегодня
 */
export function isHolidayActive(holiday: Holiday, date: Date = new Date()): boolean {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  
  // Обработка перехода через год (например, 20 дек - 10 янв)
  if (holiday.startDate > holiday.endDate) {
    // Праздник переходит через Новый год
    return mmdd >= holiday.startDate || mmdd <= holiday.endDate
  }
  
  return mmdd >= holiday.startDate && mmdd <= holiday.endDate
}

/**
 * Получить активные праздники на сегодня
 */
export function getActiveHolidays(date: Date = new Date()): Holiday[] {
  const allHolidays = getAllHolidays(date.getFullYear())
  return allHolidays.filter(h => h.isEnabled !== false && isHolidayActive(h, date))
}

/**
 * Получить праздники которые начнутся в ближайшие N дней
 */
export function getUpcomingHolidays(daysAhead: number = 7, date: Date = new Date()): Holiday[] {
  const allHolidays = getAllHolidays(date.getFullYear())
  const today = getMmdd(date)
  
  return allHolidays.filter(holiday => {
    if (holiday.isEnabled === false) return false
    
    const daysUntilStart = getDaysUntil(holiday.startDate, today)
    return daysUntilStart >= 0 && daysUntilStart <= daysAhead
  })
}

/**
 * Получить MM-DD из даты
 */
function getMmdd(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Получить количество дней до даты
 */
function getDaysUntil(targetMmdd: string, currentMmdd: string): number {
  const [targetMonth, targetDay] = targetMmdd.split('-').map(Number)
  const [currentMonth, currentDay] = currentMmdd.split('-').map(Number)
  
  const target = new Date(2026, targetMonth - 1, targetDay)
  const current = new Date(2026, currentMonth - 1, currentDay)
  
  let diff = Math.ceil((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24))
  
  // Если праздник в следующем году
  if (diff < 0 && targetMmdd > currentMmdd) {
    diff += 365
  }
  
  return diff
}
