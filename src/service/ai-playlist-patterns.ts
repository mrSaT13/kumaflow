/**
 * AI Playlist Patterns — Умные паттерны генерации (как в Spotify)
 * 
 * 20+ автоматических плейлистов которые генерируются по расписанию или событию
 */

import { createAIPlaylist, type AIPlaylistTrigger, type AIPlaylistResult } from './ai-playlist-agent'
import type { MLProfile } from '@/store/ml.store'

export interface AIPlaylistPattern {
  id: string
  name: string
  description: string
  trigger: AIPlaylistTrigger['type']
  schedule?: string  // Cron-like: "0 8 * * *" (каждый день в 8:00)
  icon: string
  gradient: string
  enabled: boolean
}

/**
 * Все доступные паттерны
 */
export const AI_PLAYLIST_PATTERNS: AIPlaylistPattern[] = [
  // === ВРЕМЯ СУТОК ===
  {
    id: 'morning-boost',
    name: 'Утренний заряд ☀️',
    description: 'Энергичная музыка для бодрого начала дня',
    trigger: 'time_of_day',
    schedule: '0 8 * * *',  // Каждый день в 8:00
    icon: '☀️',
    gradient: 'from-orange-400 to-yellow-500',
    enabled: true,
  },
  {
    id: 'day-flow',
    name: 'Дневной поток 🌤️',
    description: 'Сбалансированная музыка для продуктивного дня',
    trigger: 'time_of_day',
    schedule: '0 14 * * *',  // Каждый день в 14:00
    icon: '🌤️',
    gradient: 'from-blue-400 to-cyan-500',
    enabled: true,
  },
  {
    id: 'evening-chill',
    name: 'Вечерний расслабон 🌆',
    description: 'Спокойная музыка для отдыха после работы',
    trigger: 'time_of_day',
    schedule: '0 20 * * *',  // Каждый день в 20:00
    icon: '🌆',
    gradient: 'from-purple-400 to-pink-500',
    enabled: true,
  },
  {
    id: 'night-meditation',
    name: 'Ночная медитация 🌙',
    description: 'Медитативная музыка для позднего вечера',
    trigger: 'time_of_day',
    schedule: '0 23 * * *',  // Каждый день в 23:00
    icon: '🌙',
    gradient: 'from-indigo-400 to-blue-500',
    enabled: true,
  },
  
  // === СЕЗОНЫ ===
  {
    id: 'winter-mood',
    name: 'Зимнее настроение ❄️',
    description: 'Атмосферная музыка для зимних вечеров',
    trigger: 'season',
    schedule: '0 9 1 12 *',  // 1 декабря в 9:00
    icon: '❄️',
    gradient: 'from-blue-400 to-cyan-500',
    enabled: true,
  },
  {
    id: 'spring-fresh',
    name: 'Весенняя свежесть 🌸',
    description: 'Лёгкая музыка весеннего настроения',
    trigger: 'season',
    schedule: '0 9 1 3 *',  // 1 марта в 9:00
    icon: '🌸',
    gradient: 'from-pink-400 to-rose-500',
    enabled: true,
  },
  {
    id: 'summer-vibe',
    name: 'Летний вайб ☀️',
    description: 'Горячие треки для жаркого лета',
    trigger: 'season',
    schedule: '0 9 1 6 *',  // 1 июня в 9:00
    icon: '☀️',
    gradient: 'from-orange-400 to-yellow-500',
    enabled: true,
  },
  {
    id: 'autumn-melancholy',
    name: 'Осенняя меланхолия 🍂',
    description: 'Меланхоличная музыка золотой осени',
    trigger: 'season',
    schedule: '0 9 1 9 *',  // 1 сентября в 9:00
    icon: '🍂',
    gradient: 'from-amber-400 to-orange-500',
    enabled: true,
  },
  
  // === СОБЫТИЯ ===
  {
    id: 'liked-artist-radio',
    name: 'Похожие на {artist} 🎵',
    description: 'Треки от артиста который тебе понравился',
    trigger: 'user_liked_artist',
    icon: '🎵',
    gradient: 'from-green-400 to-emerald-500',
    enabled: true,
  },
  {
    id: 'new-releases',
    name: 'Новинки недели 🔥',
    description: 'Свежие треки от твоих любимых артистов',
    trigger: 'new_music_available',
    schedule: '0 10 * * 5',  // Каждая пятница в 10:00
    icon: '🔥',
    gradient: 'from-red-500 to-pink-500',
    enabled: true,
  },
  
  // === НАСТРОЕНИЕ (ML DETECTED) ===
  {
    id: 'energetic-mix',
    name: 'Энергия 💪',
    description: 'Мощные треки для максимальной энергии',
    trigger: 'mood_detected',
    icon: '💪',
    gradient: 'from-red-600 to-red-800',
    enabled: true,
  },
  {
    id: 'calm-mix',
    name: 'Спокойствие 🧘',
    description: 'Медитативная музыка для релаксации',
    trigger: 'mood_detected',
    icon: '🧘',
    gradient: 'from-teal-400 to-cyan-500',
    enabled: true,
  },
  {
    id: 'happy-mix',
    name: 'Позитив 😊',
    description: 'Весёлая музыка для поднятия настроения',
    trigger: 'mood_detected',
    icon: '😊',
    gradient: 'from-yellow-400 to-orange-500',
    enabled: true,
  },
  {
    id: 'sad-mix',
    name: 'Меланхолия 😔',
    description: 'Грустная музыка для глубоких размышлений',
    trigger: 'mood_detected',
    icon: '😔',
    gradient: 'from-blue-600 to-indigo-700',
    enabled: true,
  },
  
  // === АКТИВНОСТИ ===
  {
    id: 'workout-mix',
    name: 'Тренировка 💪',
    description: 'Мощные треки для спортзала',
    trigger: 'mood_detected',
    icon: '💪',
    gradient: 'from-red-600 to-orange-600',
    enabled: true,
  },
  {
    id: 'focus-mix',
    name: 'Фокус 🎯',
    description: 'Музыка для концентрации и работы',
    trigger: 'mood_detected',
    icon: '🎯',
    gradient: 'from-blue-500 to-indigo-600',
    enabled: true,
  },
  {
    id: 'party-mix',
    name: 'Вечеринка 🎉',
    description: 'Танцевальные хиты для вечеринки',
    trigger: 'mood_detected',
    icon: '🎉',
    gradient: 'from-pink-500 to-purple-600',
    enabled: true,
  },
  {
    id: 'sleep-mix',
    name: 'Сон 😴',
    description: 'Успокаивающая музыка для сна',
    trigger: 'mood_detected',
    icon: '😴',
    gradient: 'from-indigo-700 to-purple-800',
    enabled: true,
  },
  
  // === СПЕЦИАЛЬНЫЕ ===
  {
    id: 'on-repeat',
    name: 'На повторе 🔁',
    description: 'Треки которые ты слушаешь чаще всего',
    trigger: 'time_of_day',
    schedule: '0 18 * * *',  // Каждый день в 18:00
    icon: '🔁',
    gradient: 'from-purple-500 to-pink-500',
    enabled: true,
  },
  {
    id: 'daily-mix-1',
    name: 'Дейли Микс 1 🎵',
    description: 'Микс из любимых жанров',
    trigger: 'time_of_day',
    schedule: '0 7 * * *',  // Каждый день в 7:00
    icon: '🎵',
    gradient: 'from-green-500 to-teal-600',
    enabled: true,
  },
  {
    id: 'daily-mix-2',
    name: 'Дейли Микс 2 🎶',
    description: 'Микс из любимых артистов',
    trigger: 'time_of_day',
    schedule: '0 7 * * *',
    icon: '🎶',
    gradient: 'from-blue-500 to-indigo-600',
    enabled: true,
  },
  {
    id: 'discover-weekly',
    name: 'Открытия недели 🧭',
    description: 'Новая музыка каждую неделю',
    trigger: 'time_of_day',
    schedule: '0 9 * * 1',  // Каждый понедельник в 9:00
    icon: '🧭',
    gradient: 'from-purple-600 to-pink-600',
    enabled: true,
  },
  {
    id: 'release-radar',
    name: 'Радар новинок 📡',
    description: 'Новинки от подписанных артистов',
    trigger: 'new_music_available',
    schedule: '0 10 * * 5',  // Каждая пятница в 10:00
    icon: '📡',
    gradient: 'from-cyan-500 to-blue-600',
    enabled: true,
  },
]

/**
 * Получить паттерн по ID
 */
export function getPatternById(id: string): AIPlaylistPattern | undefined {
  return AI_PLAYLIST_PATTERNS.find(p => p.id === id)
}

/**
 * Получить активные паттерны для триггера
 */
export function getPatternsForTrigger(triggerType: AIPlaylistTrigger['type']): AIPlaylistPattern[] {
  return AI_PLAYLIST_PATTERNS.filter(p => p.trigger === triggerType && p.enabled)
}

/**
 * Получить паттерн по расписанию
 */
export function getPatternsBySchedule(currentTime: Date): AIPlaylistPattern[] {
  const patterns: AIPlaylistPattern[] = []
  
  for (const pattern of AI_PLAYLIST_PATTERNS) {
    if (!pattern.schedule || !pattern.enabled) continue
    
    // Парсинг cron-like расписания
    const [minute, hour, day, month, weekday] = pattern.schedule.split(' ')
    
    const currentMinute = currentTime.getMinutes()
    const currentHour = currentTime.getHours()
    const currentDay = currentTime.getDate()
    const currentMonth = currentTime.getMonth() + 1
    const currentWeekday = currentTime.getDay()
    
    // Проверка совпадения
    const minuteMatch = minute === '*' || parseInt(minute) === currentMinute
    const hourMatch = hour === '*' || parseInt(hour) === currentHour
    const dayMatch = day === '*' || parseInt(day) === currentDay
    const monthMatch = month === '*' || parseInt(month) === currentMonth
    const weekdayMatch = weekday === '*' || parseInt(weekday) === currentWeekday
    
    if (minuteMatch && hourMatch && dayMatch && monthMatch && weekdayMatch) {
      patterns.push(pattern)
    }
  }
  
  return patterns
}

/**
 * Монитор паттернов — проверяет расписание и создаёт плейлисты
 */
export class AIPatternMonitor {
  private profile: MLProfile
  private llmConfig: { url: string; model: string; apiKey?: string }
  private timer: NodeJS.Timeout | null = null

  constructor(
    profile: MLProfile,
    llmConfig: { url: string; model: string; apiKey?: string }
  ) {
    this.profile = profile
    this.llmConfig = llmConfig
  }

  /**
   * Запустить мониторинг
   */
  start(): void {
    console.log('[AI Pattern Monitor] Starting...')
    
    // Проверка каждую минуту
    this.timer = setInterval(() => {
      this.checkSchedule()
    }, 60 * 1000) // 1 минута
    
    // Первая проверка сразу
    this.checkSchedule()
  }

  /**
   * Остановить мониторинг
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Проверить расписание
   */
  private async checkSchedule(): Promise<void> {
    const now = new Date()
    const patterns = getPatternsBySchedule(now)

    if (patterns.length === 0) {
      console.log(`[AI Pattern Monitor] No patterns scheduled for ${now.toLocaleTimeString()}`)
      return
    }

    console.log(`[AI Pattern Monitor] Found ${patterns.length} scheduled patterns for ${now.toLocaleTimeString()}`)

    for (const pattern of patterns) {
      console.log(`[AI Pattern Monitor] 🎯 Triggering pattern: ${pattern.name} (${pattern.id})`)

      const trigger: AIPlaylistTrigger = {
        type: pattern.trigger,
        data: {
          hour: now.getHours(),
          season: this.getSeason(),
        },
      }

      try {
        console.log(`[AI Pattern Monitor] Calling createAIPlaylist for ${pattern.name}...`)
        const playlist = await createAIPlaylist(trigger, this.profile, this.llmConfig)

        if (playlist) {
          console.log(`[AI Pattern Monitor] ✅ Created playlist: ${playlist.name} (${playlist.songs.length} tracks)`)
        } else {
          console.log(`[AI Pattern Monitor] ⏭️ AI decided not to create playlist for ${pattern.name}`)
        }
      } catch (error) {
        console.error(`[AI Pattern Monitor] ❌ Failed to create playlist for ${pattern.name}:`, error)
      }
    }
  }

  /**
   * Получить текущий сезон
   */
  private getSeason(): string {
    const month = new Date().getMonth()
    if (month >= 11 || month <= 1) return 'Зима'
    if (month >= 2 && month <= 4) return 'Весна'
    if (month >= 5 && month <= 7) return 'Лето'
    return 'Осень'
  }
}
