/**
 * AI Playlist Agent — Автономная генерация плейлистов
 * 
 * Агент мониторит события и автоматически создаёт плейлисты:
 * - Лайк нескольких треков артиста → "Похожие на {artist}"
 * - Утро (6-12) → "Утренний заряд энергии ☀️"
 * - Вечер (18-23) → "Вечерний расслабон 🌆"
 * - Зима → "Зимнее настроение ❄️"
 * - Новые треки от любимых артистов → "Новинки от {artist}"
 */

import { subsonic } from '@/service/subsonic'
import { getSongsByGenre, getTopSongs, getRandomSongs, search3 } from '@/service/subsonic-api'
import type { ISong } from '@/types/responses/song'
import type { MLProfile } from '@/store/ml.store'

export interface AIPlaylistTrigger {
  type: 'user_liked_artist' | 'user_liked_song' | 'time_of_day' | 'season' | 'mood_detected' | 'new_music_available'
  data: {
    artistId?: string
    artistName?: string
    songId?: string
    hour?: number
    season?: string
    mood?: string
  }
}

export interface AIPlaylistDecision {
  shouldCreate: boolean
  name: string
  description: string
  gradient: string
  icon: string
  query: {
    genres?: string[]
    artists?: string[]
    artistIds?: string[]
    bpm?: { min: number; max: number }
    energy?: { min: number; max: number }
    searchQuery?: string
  }
}

export interface AIPlaylistResult {
  id: string
  name: string
  description: string
  gradient: string
  icon: string
  songs: ISong[]
  createdAt: string
  triggerType: string
}

class AIPlaylistAgent {
  private profile: MLProfile
  private llmUrl: string
  private llmModel: string
  private llmApiKey?: string

  constructor(profile: MLProfile, llmConfig: { url: string; model: string; apiKey?: string }) {
    this.profile = profile
    this.llmUrl = llmConfig.url
    this.llmModel = llmConfig.model
    this.llmApiKey = llmConfig.apiKey
  }

  /**
   * Главная функция — получает событие, возвращает решение
   */
  async analyzeTrigger(trigger: AIPlaylistTrigger): Promise<AIPlaylistDecision> {
    console.log('[AI Agent] Analyzing trigger:', trigger)

    // Собираем контекст
    const context = this.buildContext(trigger)

    // Запрашиваем решение у LLM
    const decision = await this.queryLLM(context)

    console.log('[AI Agent] Decision:', decision)
    return decision
  }

  /**
   * Генерация плейлиста по решению
   */
  async generatePlaylist(decision: AIPlaylistDecision, trigger: AIPlaylistTrigger): Promise<AIPlaylistResult> {
    console.log('[AI Agent] Generating playlist:', decision.name)

    const songs = await this.searchTracks(decision.query)

    return {
      id: `ai-${Date.now()}`,
      name: decision.name,
      description: decision.description,
      gradient: decision.gradient,
      icon: decision.icon,
      songs: songs.slice(0, 25),
      createdAt: new Date().toISOString(),
      triggerType: trigger.type,
    }
  }

  /**
   * Построение контекста для LLM
   */
  private buildContext(trigger: AIPlaylistTrigger): string {
    const topGenres = Object.entries(this.profile.preferredGenres)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g, w]) => `${g} (${w})`)
      .join(', ')

    const topArtists = Object.entries(this.profile.preferredArtists)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, w]) => `${id} (${w})`)
      .join(', ')

    const hour = new Date().getHours()
    const season = this.getSeason()

    return `
ТЕКУЩАЯ СИТУАЦИЯ:
Событие: ${trigger.type}
${trigger.data.artistName ? `Артист: ${trigger.data.artistName}` : ''}
${trigger.data.hour ? `Время: ${trigger.data.hour}:00` : ''}
${trigger.data.season ? `Сезон: ${trigger.data.season}` : ''}

ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:
Любимые жанры: ${topGenres || 'не указаны'}
Любимые артисты: ${topArtists || 'не указаны'}
Забаненные артисты: ${this.profile.bannedArtists.join(', ') || 'нет'}

ВРЕМЯ И СЕЗОН:
Сейчас: ${hour}:00, ${season}

ПРАВИЛА:
1. Если пользователь лайкнул 3+ трека артиста → создай "Похожие на {artist}"
2. Если утро (6-12) → создай энергичный плейлист "Утренний заряд ☀️"
3. Если вечер (18-23) → создай спокойный плейлист "Вечерний расслабон 🌆"
4. Если зима → создай "Зимнее настроение ❄️"
5. Если весна → создай "Весенняя свежесть 🌸"
6. Если лето → создай "Летний вайб ☀️"
7. Если осень → создай "Осеннее настроение 🍂"
8. Если новые треки от любимого артиста → "Новинки от {artist}"

ВЕРНИ РЕШЕНИЕ В ФОРМАТЕ JSON:
{
  "shouldCreate": true/false,
  "name": "Название плейлиста с эмодзи",
  "description": "Описание на русском (2-3 предложения)",
  "gradient": "from-color-400 to-color-500",
  "icon": "эмодзи",
  "query": {
    "genres": ["жанр1", "жанр2"],
    "artists": ["артист1", "артист2"],
    "bpm": {"min": 100, "max": 140},
    "energy": {"min": 0.6, "max": 0.9}
  }
}
`
  }

  /**
   * Запрос к LLM для решения
   */
  private async queryLLM(context: string): Promise<AIPlaylistDecision> {
    try {
      const response = await fetch(`${this.llmUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.llmApiKey ? { 'Authorization': `Bearer ${this.llmApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.llmModel,
          input: `Ты — AI агент для генерации музыкальных плейлистов. Проанализируй ситуацию и прими решение.

${context}

ВЕРНИ ТОЛЬКО JSON без дополнительного текста:`,
          temperature: 0.7,
          max_output_tokens: 500,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM error: ${response.status}`)
      }

      const result = await response.json()
      const content = result.output?.[0]?.content || ''

      // Парсим JSON из ответа
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }

      // Fallback — возвращаем решение по умолчанию
      return this.getDefaultDecision(context)
    } catch (error) {
      console.error('[AI Agent] LLM query failed:', error)
      return this.getDefaultDecision(context)
    }
  }

  /**
   * Решение по умолчанию если LLM не ответил
   */
  private getDefaultDecision(context: string): AIPlaylistDecision {
    const hour = new Date().getHours()
    const season = this.getSeason()

    // Утро
    if (hour >= 6 && hour < 12) {
      return {
        shouldCreate: true,
        name: 'Утренний заряд энергии ☀️',
        description: 'Энергичная музыка для бодрого начала дня',
        gradient: 'from-orange-400 to-yellow-500',
        icon: '☀️',
        query: { bpm: { min: 120, max: 160 }, energy: { min: 0.7, max: 1.0 } },
      }
    }

    // Вечер
    if (hour >= 18 && hour < 23) {
      return {
        shouldCreate: true,
        name: 'Вечерний расслабон 🌆',
        description: 'Спокойная музыка для отдыха после рабочего дня',
        gradient: 'from-purple-400 to-pink-500',
        icon: '🌆',
        query: { bpm: { min: 60, max: 100 }, energy: { min: 0.2, max: 0.5 } },
      }
    }

    // Зима
    if (season === 'Зима') {
      return {
        shouldCreate: true,
        name: 'Зимнее настроение ❄️',
        description: 'Атмосферная музыка для зимних вечеров',
        gradient: 'from-blue-400 to-cyan-500',
        icon: '❄️',
        query: { energy: { min: 0.3, max: 0.7 } },
      }
    }

    // По умолчанию не создаём
    return {
      shouldCreate: false,
      name: '',
      description: '',
      gradient: '',
      icon: '',
      query: {},
    }
  }

  /**
   * Поиск треков по запросу
   */
  private async searchTracks(query: AIPlaylistDecision['query']): Promise<ISong[]> {
    const songs: ISong[] = []

    // ЗАЩИТА: Если query undefined - используем случайные треки
    if (!query) {
      console.warn('[AI Agent] Query is undefined, using random songs fallback')
      const randomSongs = await getRandomSongs(25)
      return randomSongs
    }

    // Поиск по жанрам
    if (query.genres && query.genres.length > 0) {
      for (const genre of query.genres.slice(0, 3)) {
        try {
          const genreSongs = await getSongsByGenre(genre, 20)
          songs.push(...genreSongs)
        } catch (error) {
          console.error('[AI Agent] Failed to get genre songs:', genre, error)
        }
      }
    }

    // Поиск по артистам
    if (query.artists && query.artists.length > 0) {
      for (const artist of query.artists.slice(0, 5)) {
        try {
          const artistSongs = await getTopSongs(artist, 10)
          songs.push(...artistSongs)
        } catch (error) {
          console.error('[AI Agent] Failed to get artist songs:', artist, error)
        }
      }
    }

    // Поиск по ID артистов
    if (query.artistIds && query.artistIds.length > 0) {
      for (const artistId of query.artistIds.slice(0, 5)) {
        try {
          const artist = await subsonic.artists.getOne(artistId)
          if (artist?.name) {
            const artistSongs = await getTopSongs(artist.name, 10)
            songs.push(...artistSongs)
          }
        } catch (error) {
          console.error('[AI Agent] Failed to get artist by ID:', artistId, error)
        }
      }
    }

    // Поиск по запросу
    if (query.searchQuery) {
      try {
        const searchResult = await search3({ query: query.searchQuery, songCount: 20 })
        songs.push(...(searchResult.song || []))
      } catch (error) {
        console.error('[AI Agent] Search failed:', query.searchQuery, error)
      }
    }

    // Если ничего не найдено — случайные треки
    if (songs.length === 0) {
      const randomSongs = await getRandomSongs(25)
      songs.push(...randomSongs)
    }

    // Фильтруем дубликаты
    const uniqueSongs = songs.filter((song, index, self) =>
      index === self.findIndex(s => s.id === song.id)
    )

    return uniqueSongs
  }

  /**
   * Определение сезона
   */
  private getSeason(): string {
    const month = new Date().getMonth()
    if (month >= 11 || month <= 1) return 'Зима'
    if (month >= 2 && month <= 4) return 'Весна'
    if (month >= 5 && month <= 7) return 'Лето'
    return 'Осень'
  }
}

/**
 * Главная функция — создать плейлист по событию
 */
export async function createAIPlaylist(
  trigger: AIPlaylistTrigger,
  profile: MLProfile,
  llmConfig: { url: string; model: string; apiKey?: string }
): Promise<AIPlaylistResult | null> {
  console.log('[AI Agent] 🚀 createAIPlaylist called with trigger:', trigger.type)
  
  const agent = new AIPlaylistAgent(profile, llmConfig)

  const decision = await agent.analyzeTrigger(trigger)

  console.log('[AI Agent] Decision result:', decision)

  if (!decision.shouldCreate) {
    console.log('[AI Agent] ⏭️ Decided not to create playlist')
    return null
  }

  console.log('[AI Agent] 🎵 Generating playlist:', decision.name)
  const playlist = await agent.generatePlaylist(decision, trigger)

  console.log('[AI Agent] ✅ Playlist generated:', playlist.name, `(${playlist.songs.length} tracks)`)

  // ============================================
  // СОХРАНЯЕМ В STORE чтобы плейлист был видимым
  // ============================================
  try {
    console.log('[AI Agent] 💾 Saving playlist to store...')
    const { useMLPlaylistsStateActions } = await import('@/store/ml-playlists-state.store')
    const { addPlaylist } = useMLPlaylistsStateActions()

    addPlaylist({
      id: playlist.id,
      type: 'ai-generated',
      name: playlist.name,
      description: playlist.description,
      songs: playlist.songs,
      createdAt: playlist.createdAt,
      lastUpdated: playlist.createdAt,
    })

    console.log('[AI Agent] ✅✅✅ Playlist saved to store:', playlist.name)
  } catch (error) {
    console.error('[AI Agent] ❌ Failed to save playlist to store:', error)
  }

  return playlist
}

/**
 * Примеры использования:

// Лайк артиста
createAIPlaylist({
  type: 'user_liked_artist',
  data: { artistId: 'abc123', artistName: 'Modestep' }
}, profile, llmConfig)

// Утро
createAIPlaylist({
  type: 'time_of_day',
  data: { hour: 8 }
}, profile, llmConfig)

// Зима
createAIPlaylist({
  type: 'season',
  data: { season: 'Зима' }
}, profile, llmConfig)

*/
