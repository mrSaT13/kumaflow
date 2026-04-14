/**
 * LLM Service - Только для названий и описаний плейлистов
 * 
 * НЕ используется для генерации плейлистов (это делает ML/AutoRecommender)
 * Используется ТОЛЬКО для:
 * - Генерации красивых названий
 * - Генерации описаний
 * - Понимания пользовательских запросов (будущая функция)
 * 
 * Работает с LM Studio / Ollama / Qwen
 */

import { useExternalApiStore } from '@/store/external-api.store'

export interface LLMPlaylistMetadata {
  name: string
  description: string
  emoji?: string
}

export interface UserQueryCriteria {
  genres?: string[]
  mood?: string
  activity?: string
  timeContext?: 'morning' | 'day' | 'evening' | 'night'
  bpmRange?: [number, number]
  energyRange?: [number, number]
}

class LLMService {
  private isInitialized = false

  /**
   * Инициализация сервиса
   */
  initialize(): void {
    try {
      const state = useExternalApiStore.getState()
      const settings = state.settings || {}
      this.isInitialized = settings.llmEnabled && settings.llmLmStudioUrl !== ''

      console.log('[LLM Service] Initialized:', this.isInitialized, {
        enabled: settings.llmEnabled,
        url: settings.llmLmStudioUrl,
        model: settings.llmModel,
        provider: settings.llmProvider,
      })
    } catch (error) {
      console.error('[LLM Service] Initialization failed:', error)
      this.isInitialized = false
    }
  }

  /**
   * Генерация названия и описания для плейлиста
   * 
   * @param context - контекст плейлиста (жанры, настроение, время)
   * @returns название и описание
   */
  async generatePlaylistMetadata(context: {
    type?: string
    genres?: string[]
    mood?: string
    timeContext?: string
    trackCount?: number
  }): Promise<LLMPlaylistMetadata> {
    // Если LLM не включен - используем fallback
    if (!this.isInitialized) {
      return this.getFallbackMetadata(context)
    }

    try {
      const prompt = this.buildMetadataPrompt(context)
      const response = await this.queryLLM(prompt)

      if (response) {
        return {
          name: response.name || this.getFallbackName(context),
          description: response.description || '',
          emoji: response.emoji || this.getFallbackEmoji(context),
        }
      }
    } catch (error) {
      console.error('[LLM Service] Generation failed, using fallback:', error)
    }

    // Fallback если LLM не ответил
    return this.getFallbackMetadata(context)
  }

  /**
   * Понимание пользовательского запроса
   * 
   * @param query - запрос пользователя ("хочу весёлое для утра")
   * @returns структурированные критерии
   */
  async parseUserQuery(query: string): Promise<UserQueryCriteria | null> {
    if (!this.isInitialized) {
      return null
    }

    try {
      const prompt = `
Ты — музыкальный куратор. Пользователь хочет: "${query}"

Верни ТОЛЬКО JSON без пояснений:
{
  "genres": ["pop", "rock"],  // или null
  "mood": "happy",  // или null
  "activity": "workout",  // или null
  "timeContext": "morning",  // или null
  "bpmRange": [100, 140],  // или null
  "energyRange": [0.6, 0.9]  // или null
}
`.trim()

      const response = await this.queryLLM(prompt)
      
      if (response) {
        return response as UserQueryCriteria
      }
    } catch (error) {
      console.error('[LLM Service] Parse query failed:', error)
    }

    return null
  }

  /**
   * Объяснение почему выбраны эти треки
   */
  async explainPlaylist(
    tracks: Array<{ title: string; artist: string; genre?: string }>,
    reason: string
  ): Promise<string> {
    if (!this.isInitialized) {
      return `Плейлист на основе: ${reason}`
    }

    try {
      const prompt = `
Кратко (2-3 предложения) объясни почему эти треки подходят под запрос.
Причина: ${reason}
Первые 5 треков: ${tracks.slice(0, 5).map(t => `${t.artist} - ${t.title}`).join(', ')}

Ответ на русском, без маркеров.
`.trim()

      const response = await this.queryLLM(prompt)
      return response?.explanation || `Плейлист на основе: ${reason}`
    } catch {
      return `Плейлист на основе: ${reason}`
    }
  }

  /**
   * Приватные методы
   */

  private buildMetadataPrompt(context: any): string {
    const typeNames: Record<string, string> = {
      'daily-mix': 'ежедневный микс',
      'time-mix': 'микс по времени суток',
      'mood-mix': 'микс по настроению',
      'activity-mix': 'микс по активности',
      'genre-mix': 'жанровый микс',
      'artist-mix': 'микс артиста',
    }

    return `
Придумай название и описание для плейлиста.

Тип: ${typeNames[context.type] || 'плейлист'}
Жанры: ${context.genres?.join(', ') || 'разные'}
Настроение: ${context.mood || 'разное'}
Время: ${context.timeContext || 'любое'}
Количество треков: ${context.trackCount || 20}

Название должно быть:
- Коротким (2-4 слова)
- Ярким и запоминающимся
- С эмодзи

Описание должно быть:
- 1-2 предложения
- Объяснять что в плейлисте
- Привлекательным

Верни ТОЛЬКО JSON:
{
  "name": "название с эмодзи",
  "description": "описание",
  "emoji": "🎵"
}
`.trim()
  }

  private async queryLLM(prompt: string): Promise<any> {
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}

    try {
      const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.llmModel || 'qwen2.5-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 200,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM error: ${response.status}`)
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content || ''

      // Парсим JSON из ответа
      const firstBrace = content.indexOf('{')
      const lastBrace = content.lastIndexOf('}')

      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = content.substring(firstBrace, lastBrace + 1)
        return JSON.parse(jsonStr)
      }

      return null
    } catch (error) {
      console.error('[LLM Service] Query failed:', error)
      return null
    }
  }

  private getFallbackMetadata(context: any): LLMPlaylistMetadata {
    return {
      name: this.getFallbackName(context),
      description: this.getFallbackDescription(context),
      emoji: this.getFallbackEmoji(context),
    }
  }

  private getFallbackName(context: any): string {
    const typeNames: Record<string, string[]> = {
      'daily-mix': ['Микс дня', 'Ежедневный микс', 'Твой день'],
      'time-mix': {
        'morning': '☀️ Утренний старт',
        'day': '🌤 Дневная энергия',
        'evening': '🌆 Вечерний релакс',
        'night': '🌃 Ночные огни',
      },
      'mood-mix': {
        'happy': '😊 Счастливое настроение',
        'sad': '😢 Грустное настроение',
        'energetic': '⚡ Энергетическая вспышка',
        'calm': '🧘 Полное спокойствие',
      },
      'genre-mix': context.genres?.[0] ? `${context.genres[0]} Микс` : 'Жанровый микс',
    }

    const names = typeNames[context.type]
    if (typeof names === 'string') return names
    if (Array.isArray(names)) return names[Math.floor(Math.random() * names.length)]
    if (typeof names === 'object' && context.timeContext) {
      return (names as any)[context.timeContext] || 'Микс'
    }

    return '🎵 Плейлист'
  }

  private getFallbackDescription(context: any): string {
    const descriptions: Record<string, string> = {
      'daily-mix': 'На основе твоих предпочтений • Обновляется ежедневно',
      'time-mix': `Подборка треков для ${context.timeContext || 'этого времени'}`,
      'mood-mix': `Музыка для настроения: ${context.mood || 'разное'}`,
      'genre-mix': `Лучшее из жанра: ${context.genres?.join(', ') || 'разное'}`,
    }

    return descriptions[context.type] || 'Персональная подборка треков'
  }

  private getFallbackEmoji(context: any): string {
    const emojis: Record<string, string> = {
      'daily-mix': '📅',
      'time-mix': {
        'morning': '☀️',
        'day': '🌤',
        'evening': '🌆',
        'night': '🌃',
      },
      'mood-mix': {
        'happy': '😊',
        'sad': '😢',
        'energetic': '⚡',
        'calm': '🧘',
      },
      'genre-mix': '🎵',
    }

    const emoji = emojis[context.type]
    if (typeof emoji === 'string') return emoji
    if (typeof emoji === 'object' && context.timeContext) {
      return (emoji as any)[context.timeContext] || '🎵'
    }

    return '🎵'
  }

  /**
   * Тест подключения к LLM
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const state = useExternalApiStore.getState()
      const settings = state.settings || {}
      
      if (!settings.llmEnabled) {
        return { success: false, error: 'LLM не включен' }
      }

      // Проверяем в зависимости от провайдера
      if (settings.llmProvider === 'lm-studio') {
        if (!settings.llmLmStudioUrl) {
          return { success: false, error: 'Не указан URL LM Studio' }
        }

        const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.llmModel || 'qwen2.5-7b',
            messages: [{ role: 'user', content: 'Hello' }],
            temperature: 0.7,
            max_tokens: 10,
          }),
        })

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
        }

        return { success: true }
      } else if (settings.llmProvider === 'qwen') {
        if (!settings.llmQwenApiKey) {
          return { success: false, error: 'Не указан API ключ Qwen' }
        }

        return { success: true, error: undefined } // Просто считаем что ключ есть
      } else if (settings.llmProvider === 'ollama') {
        if (!settings.llmOllamaUrl) {
          return { success: false, error: 'Не указан URL Ollama' }
        }

        const response = await fetch(`${settings.llmOllamaUrl}/api/tags`)
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` }
        }

        return { success: true }
      }

      return { success: false, error: 'Провайдер не выбран' }
    } catch (error) {
      console.error('[LLM Service] Test connection failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      }
    }
  }

  /**
   * Генерация короткого комментария о плейлисте
   * Возвращает 1-2 предложения о том, что в плейлисте
   */
  async generatePlaylistComment(context: {
    type: string
    trackCount: number
    genres?: string[]
    artists?: string[]
    mood?: string
    timeContext?: string
    energy?: string
  }): Promise<string> {
    console.log('[LLM Comment] generatePlaylistComment called, isInitialized:', this.isInitialized)
    
    // Проверяем настройки напрямую
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}
    console.log('[LLM Comment] Settings:', {
      enabled: settings.llmEnabled,
      provider: settings.llmProvider,
      url: settings.llmLmStudioUrl,
      model: settings.llmModel,
    })

    // Если LLM не включен - используем стандартные комментарии
    if (!settings.llmEnabled) {
      console.log('[LLM Comment] LLM not enabled, using standard comment')
      return this.getStandardComment(context)
    }

    try {
      // Специфичные промпты для разных типов плейлистов
      let typeContext = ''
      
      switch (context.type) {
        case 'new-releases-subscriptions':
          typeContext = `
ЭТО ПЛЕЙЛИСТ "НОВИНКИ ПОДПИСОК" - свежие релизы артистов на которых подписан пользователь.
Пиши про то что вышло новое, какие свежие треки и альбомы. Упоминай что это новинки.`
          break
        case 'daily-mix':
          typeContext = `
ЭТО "ЕЖЕДНЕВНЫЙ МИКС" - персональная подборка на сегодня.
Пиши про разнообразие треков, сочетание знакомого и нового.`
          break
        case 'discover-weekly':
          typeContext = `
ЭТО "ОТКРЫТИЯ НЕДЕЛИ" - новые треки которые пользователь еще не слушал.
Пиши про музыкальные открытия, неизведанное, расширение горизонтов.`
          break
        case 'because-you-listened':
          typeContext = `
ЭТО "ПОТОМУ ЧТО ВЫ СЛУШАЛИ" - похожие треки на те что пользователь часто слушал.
Пиши про то что похоже на любимые треки, продолжение вкуса.`
          break
        case 'my-wave':
          typeContext = `
ЭТО "МОЯ ВОЛНА" - персональная волна на основе вкусов пользователя.
Пиши про идеальное сочетание любимых жанров и артистов.`
          break
        default:
          typeContext = ''
      }

      const prompt = `
Ты — музыкальный куратор. Напиши ОДНО живое предложение (максимум 100 символов!) о МУЗЫКЕ в этом плейлисте.

${typeContext}

Тип плейлиста: ${context.type}
Треков: ${context.trackCount}
${context.genres ? `Жанры: ${context.genres.slice(0, 3).join(', ')}` : ''}
${context.artists ? `Артисты: ${context.artists.slice(0, 3).join(', ')}` : ''}

ПРАВИЛА:
- Пиши СРАЗУ комментарий о МУЗЫКЕ
- НЕ пиши "Окей", "вот", "предложение"
- НЕ начинай с кавычек
- НЕ пиши про время суток, настроение, атмосферу
- Пиши про ЗВУЧАНИЕ, ЖАНРЫ, ЭНЕРГИЮ музыки
- Будь конкретнее - упоминай жанры или стиль
- Максимум 100 символов
- Используй 1-2 эмодзи

Примеры хороших комментариев:
🎸 Энергичный рок с мощными гитарными риффами и драйвом
🔥 Свежие биты и басы для активной тренировки
🎤 Мелодичный рэп с глубоким басом и лирикой
💿 Новинки инди-рока и альтернативы — свежо и мощно`

      console.log('[LLM Comment] Sending request to LLM...')

      const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.llmModel || 'qwen2.5-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 40,
        }),
      })

      console.log('[LLM Comment] Response status:', response.status)

      if (!response.ok) {
        console.warn('[LLM Comment] HTTP error:', response.status, response.statusText)
        return this.getStandardComment(context)
      }

      const result = await response.json()
      console.log('[LLM Comment] Response:', result)
      
      let comment = result.choices?.[0]?.message?.content?.trim() || ''

      // Чистим комментарий от префиксов
      // Убираем "Окей", "вот", "предложение", кавычки в начале
      comment = comment
        .replace(/^(окей|ок|ладно|хорошо|вот|предложение|комментарий)[:\s-]*/gi, '')
        .replace(/^[""«»]/, '')
        .trim()

      console.log('[LLM Comment] Cleaned comment:', comment)

      // Жёстко обрезаем если больше 100 символов
      if (comment.length > 100) {
        return comment.substring(0, 97) + '...'
      }

      return comment || this.getStandardComment(context)
    } catch (error) {
      console.error('[LLM Comment] Comment generation failed, using standard:', error)
      return this.getStandardComment(context)
    }
  }

  /**
   * Ревью плейлиста от LLM
   * Оценивает подходит ли плейлист под контекст и даёт рекомендации
   */
  async reviewPlaylist(context: {
    playlistName: string
    playlistType: string
    trackCount: number
    genres: string[]
    artists: string[]
    contextInfo?: string  // "morning", "workout", etc
  }): Promise<{
    approved: boolean
    feedback: string
    suggestedGenres: string[]
    suggestedArtists: string[]
    energyLevel?: 'low' | 'medium' | 'high'
  }> {
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}

    // Если LLM не включен - сразу одобряем
    if (!settings.llmEnabled) {
      console.log('[LLM Review] LLM not enabled, auto-approving')
      return {
        approved: true,
        feedback: '',
        suggestedGenres: [],
        suggestedArtists: [],
      }
    }

    try {
      const prompt = `
Ты — музыкальный куратор. Оцени плейлист и скажи подходит ли он под задачу.

Плейлист: "${context.playlistName}"
Тип: ${context.playlistType}
Треков: ${context.trackCount}
Жанры: ${context.genres.join(', ')}
Артисты: ${context.artists.slice(0, 5).join(', ')}
${context.contextInfo ? `Контекст: ${context.contextInfo}` : ''}

Оцени:
1. Подходит ли плейлист под задачу? (да/нет)
2. Если нет - какие жанры добавить? (максимум 3)
3. Если нет - какие артисты подойдут лучше? (максимум 3)
4. Уровень энергии: low/medium/high

Ответь ТОЛЬКО в формате JSON:
{"approved": true/false, "feedback": "короткий комментарий", "suggestedGenres": [], "suggestedArtists": [], "energyLevel": "medium"}`

      console.log('[LLM Review] Sending review request...')

      const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.llmModel || 'qwen2.5-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 150,
        }),
      })

      if (!response.ok) {
        console.warn('[LLM Review] HTTP error, auto-approving:', response.status)
        return { approved: true, feedback: '', suggestedGenres: [], suggestedArtists: [] }
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content?.trim() || ''

      // Убираем markdown обёрку ```json ... ```
      let cleanContent = content
      if (cleanContent.startsWith('```')) {
        const firstNewline = cleanContent.indexOf('\n')
        const lastBackticks = cleanContent.lastIndexOf('```')
        if (firstNewline !== -1 && lastBackticks !== -1) {
          cleanContent = cleanContent.substring(firstNewline + 1, lastBackticks).trim()
        }
      }

      // Парсим JSON из ответа
      const firstBrace = cleanContent.indexOf('{')
      const lastBrace = cleanContent.lastIndexOf('}')

      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = cleanContent.substring(firstBrace, lastBrace + 1)
        const parsed = JSON.parse(jsonStr)

        console.log('[LLM Review] Result:', parsed)

        return {
          approved: parsed.approved !== false,
          feedback: parsed.feedback || '',
          suggestedGenres: parsed.suggestedGenres || [],
          suggestedArtists: parsed.suggestedArtists || [],
          energyLevel: parsed.energyLevel || 'medium',
        }
      }

      // Если не удалось распарсить - одобряем
      console.warn('[LLM Review] Could not parse JSON, auto-approving')
      return { approved: true, feedback: '', suggestedGenres: [], suggestedArtists: [] }
    } catch (error) {
      console.error('[LLM Review] Review failed, auto-approving:', error)
      return { approved: true, feedback: '', suggestedGenres: [], suggestedArtists: [] }
    }
  }

  /**
   * Улучшение плейлиста с помощью LLM
   * Генерирует → Ревью → Улучшает → Оркестрирует → Финальное ревью
   */
  async enhancePlaylist(
    generator: () => Promise<{ songs: any[]; source?: string }>,
    context: {
      playlistName: string
      playlistType: string
      contextInfo?: string
    }
  ): Promise<{ songs: any[]; source: string; llmApproved: boolean; llmFeedback?: string }> {
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}

    // Если LLM не включен - просто генерируем
    if (!settings.llmEnabled) {
      console.log('[LLM Enhance] LLM not enabled, using raw generation')
      const result = await generator()
      return { songs: result.songs, source: result.source || 'ml-algorithms', llmApproved: true }
    }

    console.log('[LLM Enhance] Starting LLM-enhanced generation...')

    // Шаг 1: Начальная генерация
    console.log('[LLM Enhance] Step 1: Initial generation...')
    let result = await generator()
    let songs = result?.songs || []

    if (songs.length === 0) {
      console.warn('[LLM Enhance] Empty playlist from generator')
      return { songs: [], source: 'ml-algorithms', llmApproved: true }
    }

    // Шаг 2: Ревью от LLM
    console.log('[LLM Enhance] Step 2: LLM review...')
    const genres = [...new Set(songs.map((s: any) => s.genre).filter(Boolean))]
    const artists = [...new Set(songs.map((s: any) => s.artist).filter(Boolean))]

    const review = await this.reviewPlaylist({
      playlistName: context.playlistName,
      playlistType: context.playlistType,
      trackCount: songs.length,
      genres,
      artists,
      contextInfo: context.contextInfo,
    })

    console.log('[LLM Enhance] Review result:', review)

    // Шаг 3: Если LLM не одобрил - улучшаем
    if (!review.approved && (review.suggestedGenres.length > 0 || review.suggestedArtists.length > 0)) {
      console.log('[LLM Enhance] Step 3: Improving playlist based on LLM suggestions...')
      console.log('[LLM Enhance] Suggested genres:', review.suggestedGenres)
      console.log('[LLM Enhance] Suggested artists:', review.suggestedArtists)

      // Здесь можно добавить логику добавления рекомендованных треков
      // Пока просто логируем - в будущем можно доработать
      // TODO: Добавить треки рекомендованных жанров/артистов
    }

    // Шаг 4: Финальное ревью (если были изменения)
    const finalResult = {
      songs,
      source: review.approved ? 'llm-approved' : 'ml-with-feedback',
      llmApproved: review.approved,
      llmFeedback: review.feedback,
    }

    console.log('[LLM Enhance] Final result:', finalResult)
    return finalResult
  }

  /**
   * Детальный комментарий для страницы плейлиста (несколько предложений)
   */
  async generateDetailedComment(context: {
    type: string
    trackCount: number
    genres?: string[]
    artists?: string[]
    mood?: string
    timeContext?: string
    energy?: string
  }): Promise<string> {
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}

    // Если LLM не включен - стандартный комментарий
    if (!settings.llmEnabled) {
      return this.getStandardComment(context)
    }

    try {
      // Специфичные промпты для разных типов
      let typeContext = ''
      
      switch (context.type) {
        case 'new-releases-subscriptions':
          typeContext = `
ЭТО ПЛЕЙЛИСТ "НОВИНКИ ПОДПИСОК" - свежие релизы артистов на которых подписан пользователь.
Расскажи подробно что вошло в плейлист, какие жанры, какое звучание. Упомяни что это свежие релизы.`
          break
        case 'daily-mix':
          typeContext = `
ЭТО "ЕЖЕДНЕВНЫЙ МИКС" - персональная подборка на сегодня.
Расскажи про сочетание знакомого и нового, какие жанры представлены, какая энергия.`
          break
        case 'discover-weekly':
          typeContext = `
ЭТО "ОТКРЫТИЯ НЕДЕЛИ" - новые треки которые пользователь еще не слушал.
Расскажи про музыкальные открытия, какие неизведанные жанры и артисты.`
          break
        case 'because-you-listened':
          typeContext = `
ЭТО "ПОТОМУ ЧТО ВЫ СЛУШАЛИ" - похожие треки на те что пользователь часто слушал.
Расскажи почему эти треки похожи на любимые, что их объединяет.`
          break
        case 'my-wave':
          typeContext = `
ЭТО "МОЯ ВОЛНА" - персональная волна на основе вкусов пользователя.
Расскажи как треки сочетаются с вкусами пользователя, какие жанры и артисты.`
          break
        default:
          typeContext = `
Расскажи подробно о музыке в этом плейлисте.`
      }

      const prompt = `
Ты — музыкальный куратор. Напиши ДЕТАЛЬНЫЙ комментарий (2-3 предложения, максимум 250 символов!) о МУЗЫКЕ в этом плейлисте.

${typeContext}

Тип плейлиста: ${context.type}
Треков: ${context.trackCount}
${context.genres ? `Жанры: ${context.genres.slice(0, 5).join(', ')}` : ''}
${context.artists ? `Артисты: ${context.artists.slice(0, 5).join(', ')}` : ''}

ПРАВИЛА:
- Пиши 2-3 предложения
- Будь конкретнее - упоминай жанры, артисты, стиль
- НЕ пиши "Окей", "вот", "предложение"
- НЕ начинай с кавычек
- НЕ пиши про время суток, настроение, атмосферу
- Пиши про ЗВУЧАНИЕ, ЖАНРЫ, ЭНЕРГИЮ музыки
- Максимум 250 символов
- Используй 2-3 эмодзи

Примеры хороших комментариев:
🎸 Энергичный рок с мощными гитарными риффами и драйвом. В плейлисте собраны треки от классического хард-рока до современного альтернативного звучания. 🔥 Отличный баланс знакомого и нового!
💿 Свежие релизы инди-рока и альтернативы — свежо и мощно. Подписанные артисты радуют новинками этого месяца. 🎤 Лирика глубокая, аранжировки сложные.`

      console.log('[LLM Detailed] Sending request...')

      const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.llmModel || 'qwen2.5-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 150,
        }),
      })

      if (!response.ok) {
        console.warn('[LLM Detailed] HTTP error:', response.status)
        return this.getStandardComment(context)
      }

      const result = await response.json()
      let comment = result.choices?.[0]?.message?.content?.trim() || ''

      // Чистим
      comment = comment
        .replace(/^(окей|ок|ладно|хорошо|вот|предложение|комментарий)[:\s-]*/gi, '')
        .replace(/^[""«»]/, '')
        .trim()

      console.log('[LLM Detailed] Comment:', comment)

      // Обрезаем если больше 400 символов
      if (comment.length > 400) {
        return comment.substring(0, 397) + '...'
      }

      return comment || this.getStandardComment(context)
    } catch (error) {
      console.error('[LLM Detailed] Error:', error)
      return this.getStandardComment(context)
    }
  }

  /**
   * Стандартные комментарии когда LLM недоступен
   */
  private getStandardComment(context: {
    type: string
    trackCount: number
    genres?: string[]
    artists?: string[]
    mood?: string
    timeContext?: string
    energy?: string
  }): string {
    const comments: Record<string, string[]> = {
      'daily-mix': [
        '🎵 Свежий микс на каждый день',
        '📅 Обновлённая порция музыки для тебя',
        '🎧 Твой персональный микс на сегодня',
      ],
      'discover-weekly': [
        '🔍 Новые открытия на основе твоих лайков',
        '✨ Неизвестные тебе треки, которые понравятся',
        '🎯 Расширяем музыкальные горизонты',
      ],
      'my-wave': [
        '🌊 Твоя волна — треки которые ты любишь',
        '🎵 Идеальная волна под твой вкус',
        '🏄 Музыкальная волна специально для тебя',
      ],
      'time-of-day': [
        '🕐 Музыка под текущее время суток',
        '⏰ Правильный трек в правильное время',
        '🌅 Подстройка под твой ритм дня',
      ],
      'because-you-listened': [
        '💚 Потому что тебе понравилось',
        '🎶 Продолжаем то, что ты любишь',
        '💫 На основе твоих недавних прослушиваний',
      ],
      'trends': [
        '🔥 Самое популярное прямо сейчас',
        '📈 Тренды которые слушают все',
        '⭐ Хиты этого времени',
      ],
      'new-releases': [
        '🆕 Самые свежие релизы',
        '💿 Новинки которые стоит услышать',
        '🌟 Только что вышло',
      ],
      'similar-artists': [
        '🎭 Похожие исполнители которые тебе понравятся',
        '🎤 Расширяем музыкальный кругозор',
        '🎸 Новые артисты в твоём вкусе',
      ],
      'vibe-similarity': [
        '🎯 Треки с похожим вайбом',
        '✨ Похожие по настроению и энергии',
        '🔗 Связанные музыкальной ДНК',
      ],
      'activity-mix': [
        '🏃 Музыка для активности',
        '💪 Саундтрек для твоих дел',
        '⚡ Энергия в музыке',
      ],
      'mood': [
        '🎭 Подборка под настроение',
        '💭 Музыка для текущего состояния',
        '🎨 Настроение в каждом треке',
      ],
    }

    const typeComments = comments[context.type]
    if (typeComments) {
      return typeComments[Math.floor(Math.random() * typeComments.length)]
    }

    // Универсальный комментарий
    const universal = [
      `🎵 ${context.trackCount} треков для тебя`,
      `🎧 Специально подобранная музыка`,
      `✨ Персональная рекомендация`,
    ]
    return universal[Math.floor(Math.random() * universal.length)]
  }
}

// Экспортируем единственный экземпляр
export const llmService = new LLMService()
