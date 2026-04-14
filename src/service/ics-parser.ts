/**
 * .ics Calendar Parser + Custom Holiday Manager
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Реализовано
 * - Парсинг .ics файлов (iCalendar формат)
 * - Авто-определение типа праздника по триггер-словам
 * - Ручное добавление праздников
 * - Экспорт/импорт JSON
 */

import { getAllHolidays } from '@/service/holidays'
import type { Holiday } from '@/service/holidays'

const CUSTOM_HOLIDAYS_KEY = 'custom-holidays'

// ============================================================
// .ics PARSER
// ============================================================

/**
 * Распарсить .ics файл
 * Возвращает массив Holiday объектов
 */
export function parseIcsFile(icsContent: string): Holiday[] {
  const holidays: Holiday[] = []
  
  // Разбиваем по VEVENT
  const events = icsContent.split('BEGIN:VEVENT')
  
  for (const eventBlock of events) {
    if (!eventBlock.includes('END:VEVENT')) continue
    
    const summary = extractIcsField(eventBlock, 'SUMMARY')
    const dtStart = extractIcsField(eventBlock, 'DTSTART')
    const dtEnd = extractIcsField(eventBlock, 'DTEND')
    
    if (!summary || !dtStart) {
      console.warn('[ICS Parser] Skipping event: missing SUMMARY or DTSTART')
      continue
    }
    
    // Парсим даты
    const startDate = parseIcsDate(dtStart)
    const endDate = dtEnd ? parseIcsDate(dtEnd) : startDate
    
    if (!startDate || !endDate) {
      console.warn('[ICS Parser] Failed to parse dates:', dtStart, dtEnd)
      continue
    }
    
    // Авто-определяем тип по названию
    const detectedType = detectHolidayTypeFromName(summary)
    
    const holiday: Holiday = {
      id: `ics_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: summary,
      startDate,
      endDate,
      isFixed: true,
      genres: detectedType.genres,
      mood: detectedType.mood,
      energy: detectedType.energy,
      valence: detectedType.valence,
      icon: detectedType.icon,
      isImported: true,
      isEnabled: true,
      isCustom: true,
      holidayType: detectedType.type,
    }
    
    holidays.push(holiday)
  }
  
  console.log(`[ICS Parser] Parsed ${holidays.length} events from .ics file`)
  return holidays
}

/**
 * Извлечь поле из .ics блока
 */
function extractIcsField(block: string, fieldName: string): string | null {
  // Ищем FIELD_NAME:VALUE или FIELD_NAME;params:VALUE
  const regex = new RegExp(`${fieldName}(;[^:]*)?:([^\\r\\n]+)`, 'i')
  const match = block.match(regex)
  return match ? match[2].trim() : null
}

/**
 * Распарсить дату из .ics формата
 * DTSTART:20260515 → MM-DD
 */
function parseIcsDate(dateStr: string): string | null {
  // Формат: YYYYMMDD
  const match = dateStr.match(/(\d{4})(\d{2})(\d{2})/)
  if (!match) return null
  
  const month = match[2]
  const day = match[3]
  
  return `${month}-${day}`
}

// ============================================================
// TRIGGER WORDS SYSTEM
// ============================================================

/**
 * Триггер-слова для авто-определения типа праздника
 */
export interface HolidayTypeConfig {
  type: string
  name: string
  icon: string
  triggers: string[]  // Ключевые слова
  genres: string[]
  mood: string[]
  energy: { min: number; max: number }
  valence: { min: number; max: number }
}

export const HOLIDAY_TYPE_CONFIGS: HolidayTypeConfig[] = [
  {
    type: 'birthday',
    name: '🎂 День рождения',
    icon: '🎂',
    triggers: ['день рождения', 'др', 'birthday', 'день рожденья', 'юбилей рождения'],
    genres: ['pop', 'dance', 'party', 'disco', 'edm'],
    mood: ['festive', 'happy', 'energetic', 'celebration'],
    energy: { min: 0.6, max: 0.9 },
    valence: { min: 0.7, max: 1.0 },
  },
  {
    type: 'wedding',
    name: '💒 Свадьба',
    icon: '💒',
    triggers: ['свадьба', 'wedding', 'бракосочетание', 'свадебный'],
    genres: ['pop', 'classical', 'romantic', 'soul', 'r&b'],
    mood: ['romantic', 'warm', 'tender', 'beautiful'],
    energy: { min: 0.4, max: 0.7 },
    valence: { min: 0.6, max: 0.9 },
  },
  {
    type: 'anniversary',
    name: '🎊 Юбилей',
    icon: '🎊',
    triggers: ['юбилей', 'anniversary', 'годовщина'],
    genres: ['classical', 'jazz', 'soul', 'rock'],
    mood: ['solemn', 'proud', 'warm', 'memorable'],
    energy: { min: 0.3, max: 0.6 },
    valence: { min: 0.5, max: 0.8 },
  },
  {
    type: 'party',
    name: '🎉 Вечеринка',
    icon: '🎉',
    triggers: ['вечеринка', 'party', 'пати', 'тусовка', 'дискотека'],
    genres: ['dance', 'edm', 'pop', 'house', 'techno', 'disco'],
    mood: ['energetic', 'happy', 'upbeat', 'dance'],
    energy: { min: 0.7, max: 1.0 },
    valence: { min: 0.7, max: 1.0 },
  },
  {
    type: 'graduation',
    name: '🎓 Выпускной',
    icon: '🎓',
    triggers: ['выпускной', 'graduation', 'выпускник', 'окончание'],
    genres: ['pop', 'dance', 'rock', 'indie'],
    mood: ['festive', 'happy', 'proud', 'nostalgic'],
    energy: { min: 0.6, max: 0.9 },
    valence: { min: 0.6, max: 0.9 },
  },
  {
    type: 'memorial',
    name: '🕊️ Памятная дата',
    icon: '🕊️',
    triggers: ['память', 'memorial', 'поминовение', 'поминальный'],
    genres: ['classical', 'acoustic', 'ambient', 'instrumental'],
    mood: ['solemn', 'peaceful', 'memorial', 'calm'],
    energy: { min: 0.2, max: 0.5 },
    valence: { min: 0.3, max: 0.6 },
  },
  {
    type: 'corporate',
    name: '🏢 Корпоратив',
    icon: '🏢',
    triggers: ['корпоратив', 'corporate', 'team building', 'тимбилдинг'],
    genres: ['pop', 'rock', 'dance', 'funk'],
    mood: ['fun', 'energetic', 'social', 'upbeat'],
    energy: { min: 0.5, max: 0.8 },
    valence: { min: 0.6, max: 0.9 },
  },
  {
    type: 'new_year',
    name: '🎄 Новый год',
    icon: '🎄',
    triggers: ['новый год', 'new year', 'новогодний', 'праздник'],
    genres: ['christmas', 'holiday', 'pop', 'classical'],
    mood: ['festive', 'happy', 'magical', 'warm'],
    energy: { min: 0.6, max: 0.9 },
    valence: { min: 0.7, max: 1.0 },
  },
  {
    type: 'custom',
    name: '📅 Свой праздник',
    icon: '📅',
    triggers: [],  // Без триггеров — ручной выбор
    genres: ['pop', 'rock'],
    mood: ['happy'],
    energy: { min: 0.4, max: 0.7 },
    valence: { min: 0.5, max: 0.8 },
  },
]

/**
 * Определить тип праздника по названию
 */
export function detectHolidayTypeFromName(name: string): HolidayTypeConfig {
  const lowerName = name.toLowerCase()
  
  for (const config of HOLIDAY_TYPE_CONFIGS) {
    if (config.triggers.length === 0) continue  // Пропускаем custom
    
    for (const trigger of config.triggers) {
      if (lowerName.includes(trigger.toLowerCase())) {
        console.log(`[HolidayType] Detected "${config.type}" for "${name}"`)
        return config
      }
    }
  }
  
  // Не найдено — возвращаем custom
  console.log(`[HolidayType] No type detected for "${name}", using custom`)
  return HOLIDAY_TYPE_CONFIGS.find(c => c.type === 'custom')!
}

/**
 * Получить список всех типов праздников (для выпадающего списка)
 */
export function getHolidayTypes(): HolidayTypeConfig[] {
  return HOLIDAY_TYPE_CONFIGS
}

// ============================================================
// CUSTOM HOLIDAYS STORAGE
// ============================================================

/**
 * Сохранить пользовательский праздник
 */
export function saveCustomHoliday(holiday: Holiday): void {
  const holidays = getCustomHolidays()
  
  // Обновляем если уже есть
  const existingIndex = holidays.findIndex(h => h.id === holiday.id)
  if (existingIndex !== -1) {
    holidays[existingIndex] = holiday
  } else {
    holidays.push(holiday)
  }
  
  localStorage.setItem(CUSTOM_HOLIDAYS_KEY, JSON.stringify(holidays))
  console.log(`[CustomHolidays] Saved: ${holiday.name}`)
}

/**
 * Получить все пользовательские праздники
 */
export function getCustomHolidays(): Holiday[] {
  try {
    const data = localStorage.getItem(CUSTOM_HOLIDAYS_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch (error) {
    console.error('[CustomHolidays] Failed to load:', error)
    return []
  }
}

/**
 * Удалить пользовательский праздник
 */
export function deleteCustomHoliday(holidayId: string): void {
  const holidays = getCustomHolidays()
  const filtered = holidays.filter(h => h.id !== holidayId)
  localStorage.setItem(CUSTOM_HOLIDAYS_KEY, JSON.stringify(filtered))
  console.log(`[CustomHolidays] Deleted: ${holidayId}`)
}

/**
 * Экспорт пользовательских праздников в JSON
 */
export function exportCustomHolidaysToJson(): string {
  const holidays = getCustomHolidays()
  return JSON.stringify(holidays, null, 2)
}

/**
 * Импорт пользовательских праздников из JSON
 */
export function importCustomHolidaysFromJson(jsonContent: string): Holiday[] {
  try {
    const holidays: Holiday[] = JSON.parse(jsonContent)
    
    // Валидация
    const valid = holidays.filter(h => 
      h.id && h.name && h.startDate && h.endDate
    )
    
    // Сохраняем
    valid.forEach(h => saveCustomHoliday(h))
    
    console.log(`[CustomHolidays] Imported ${valid.length} holidays from JSON`)
    return valid
  } catch (error) {
    console.error('[CustomHolidays] Failed to import JSON:', error)
    return []
  }
}

/**
 * Получить все праздники (дефолтные + пользовательские)
 */
export function getAllHolidaysWithCustoms(): Holiday[] {
  const defaultHolidays = getAllHolidays()
  const customHolidays = getCustomHolidays()

  return [...defaultHolidays, ...customHolidays]
}
