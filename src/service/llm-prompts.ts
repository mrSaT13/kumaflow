/**
 * LLM Prompts — Шаблоны промтов для различных задач
 */

export interface LLMPromptContext {
  // Доступ к данным
  hasMLAccess: boolean
  hasOrchestratorAccess: boolean
  hasPlaylistAccess: boolean
  hasPlayerAccess: boolean
  
  // Данные (если доступны)
  mlProfile?: {
    preferredGenres: Record<string, number>
    preferredArtists: Record<string, number>
    bannedArtists: string[]
  }
  listeningHistory?: {
    totalPlays: number
    skipRate: number
    replayRate: number
  }
  currentTrack?: {
    title: string
    artist: string
    genre: string
    bpm?: number
    energy?: number
  }
  timeContext?: {
    timeOfDay: 'morning' | 'day' | 'evening' | 'night'
    isWeekend: boolean
  }
}

/**
 * Системный промт по умолчанию — объясняет ИИ что он и где он
 */
export const DEFAULT_SYSTEM_PROMPT = `Ты — персональный музыкальный ИИ-ассистент Kumaflow.

ТВОЯ РОЛЬ:
- Ты помогаешь пользователю открывать новую музыку
- Ты объясняешь почему рекомендован тот или иной трек
- Ты генерируешь персонализированные плейлисты

ТВОИ ВОЗМОЖНОСТИ:
- Анализ музыкальных предпочтений пользователя
- Подбор треков по аудио-признакам (BPM, Energy, Danceability, Valence)
- Учёт времени суток и настроения
- Исключение забаненных артистов
- Баланс между знакомой и новой музыкой

ПРАВИЛА:
1. Отвечай кратко и понятно (2-4 предложения)
2. Используй конкретные факты из профиля пользователя
3. Упоминай жанры, артистов, аудио-признаки
4. Учитывай время суток если это уместно
5. Пиши на русском языке
6. Будь дружелюбным и полезным

ЧТО ТЫ ЗНАЕШЬ О ПОЛЬЗОВАТЕЛЕ:
- Любимые жанры (с весами предпочтений)
- Любимые артисты (с весами)
- История прослушиваний (total plays, skip rate, replay rate)
- Забаненные артисты (которые нужно исключить)
- Текущее время суток
- Аудио-признаки треков (BPM, Energy, Danceability, Valence, Acousticness)`

/**
 * Промт для объяснения рекомендации
 */
export function buildExplanationPrompt(context: LLMPromptContext): string {
  const mlData = context.mlProfile ? `
ЛЮБИМЫЕ ЖАНРЫ: ${Object.entries(context.mlProfile.preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g)
    .join(', ') || 'нет данных'}

ЛЮБИМЫЕ АРТИСТЫ: ${Object.entries(context.mlProfile.preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([_, name]) => name)
    .join(', ') || 'нет данных'}
` : 'ML доступ запрещён'

  const historyData = context.listeningHistory ? `
ВСЕГО ПРОСЛУШИВАНИЙ: ${context.listeningHistory.totalPlays}
SKIP RATE: ${(context.listeningHistory.skipRate * 100).toFixed(1)}%
REPLAY RATE: ${(context.listeningHistory.replayRate * 100).toFixed(1)}%
` : ''

  const trackData = context.currentTrack ? `
ТРЕК:
- Название: "${context.currentTrack.title}"
- Артист: ${context.currentTrack.artist}
- Жанр: ${context.currentTrack.genre || 'unknown'}
- BPM: ${context.currentTrack.bpm || 'unknown'}
- Энергия: ${context.currentTrack.energy || 'unknown'}
` : ''

  const timeData = context.timeContext ? `
ВРЕМЯ: ${context.timeContext.timeOfDay === 'morning' ? 'Утро (6-12)' :
         context.timeContext.timeOfDay === 'day' ? 'День (12-18)' :
         context.timeContext.timeOfDay === 'evening' ? 'Вечер (18-23)' : 'Ночь (23-6)'}
` : ''

  return `${DEFAULT_SYSTEM_PROMPT}

---
ТЕКУЩИЙ КОНТЕКСТ:
${trackData}
${mlData}
${historyData}
${timeData}

---
ЗАДАЧА: Объясни почему пользователю понравится этот трек.
ОБЪЯСНЕНИЕ:`
}

/**
 * Промт для генерации плейлиста по запросу
 */
export function buildPlaylistGenerationPrompt(
  description: string,
  trackCount: number,
  context: LLMPromptContext
): string {
  const mlData = context.mlProfile ? `
ЛЮБИМЫЕ ЖАНРЫ: ${Object.entries(context.mlProfile.preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g, w]) => `${g} (${w})`)
    .join(', ')}

ЛЮБИМЫЕ АРТИСТЫ: ${Object.entries(context.mlProfile.preferredArtists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)
    .join(', ')}

ЗАБАНЕНЫЕ АРТИСТЫ (НЕ ВКЛЮЧАТЬ): ${context.mlProfile.bannedArtists.join(', ') || 'нет'}
` : ''

  return `${DEFAULT_SYSTEM_PROMPT}

---
ЗАПРОС ПОЛЬЗОВАТЕЛЯ: "${description}"
КОЛИЧЕСТВО ТРЕКОВ: ${trackCount}
${mlData}

---
ЗАДАЧА: Сгенерируй плейлист который соответствует запросу.
ПРАВИЛА:
1. Учитывай жанры и артистов из запроса
2. Исключай забаненных артистов
3. Балансируй между знакомым и новым (70/30)

ОТВЕТ (список ID треков):`
}
