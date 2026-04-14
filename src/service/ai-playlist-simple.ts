/**
 * AI Playlist Generator — УПРОЩЁННАЯ ВЕРСИЯ для LLM
 * 
 * Короткий промт (~100 токенов) вместо 940!
 */

import { subsonic } from '@/service/subsonic'
import { getSongsByGenre, getTopSongs, search3 } from '@/service/subsonic-api'
import type { ISong } from '@/types/responses/song'

export interface SimpleAIPlaylistConfig {
  query: string  // Запрос пользователя
  profile: {
    preferredGenres: Record<string, number>
    preferredArtists: Record<string, number>
    bannedArtists: string[]
  }
  llmUrl: string
  llmModel: string
  llmApiKey?: string
}

export interface SimpleAIPlaylistResult {
  name: string
  description: string
  songs: ISong[]
}

/**
 * Главная функция — короткая и быстрая!
 */
export async function generateSimpleAIPlaylist(
  config: SimpleAIPlaylistConfig
): Promise<SimpleAIPlaylistResult | null> {
  console.log('[Simple AI] Starting generation for:', config.query)

  // 1. Короткий промт для LLM
  const prompt = buildShortPrompt(config)
  console.log('[Simple AI] Prompt length:', prompt.length, 'chars')

  // 2. Запрос к LLM
  const llmResponse = await queryLLM(prompt, config.llmUrl, config.llmModel, config.llmApiKey)
  
  if (!llmResponse) {
    console.error('[Simple AI] LLM failed')
    return null
  }

  console.log('[Simple AI] LLM response:', llmResponse)

  // 3. Парсим ответ — ищем жанры и артистов
  const genres = extractGenres(llmResponse, config.profile.preferredGenres)
  const artists = extractArtists(llmResponse, config.profile.preferredArtists)

  console.log('[Simple AI] Extracted:', { genres, artists })

  // 4. Ищем треки
  const songs = await searchTracks(genres, artists, 25)

  return {
    name: llmResponse.name || `AI: ${config.query}`,
    description: llmResponse.description || `Сгенерировано по запросу: ${config.query}`,
    songs,
  }
}

/**
 * Короткий промт (~100 токенов)
 */
function buildShortPrompt(config: SimpleAIPlaylistConfig): string {
  const topGenres = Object.keys(config.profile.preferredGenres).slice(0, 3).join(', ')
  const topArtists = Object.keys(config.profile.preferredArtists).slice(0, 5).join(', ')

  return `Ты — AI для генерации плейлистов. Запрос: "${config.query}".

Жанры пользователя: ${topGenres || 'разные'}
Артисты: ${topArtists || 'разные'}
Забанены: ${config.profile.bannedArtists.slice(0, 3).join(', ') || 'нет'}

ВЕРНИ JSON:
{
  "name": "Название с эмодзи",
  "description": "2-3 слова",
  "genres": ["жанр1", "жанр2"],
  "artists": ["артист1"]
}`
}

/**
 * Запрос к LLM
 */
async function queryLLM(
  prompt: string,
  url: string,
  model: string,
  apiKey?: string
): Promise<any> {
  try {
    const response = await fetch(`${url}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.7,
        max_output_tokens: 300,  // Меньше токенов!
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.output?.[0]?.content || ''

    // Парсим JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }

    return null
  } catch (error) {
    console.error('[Simple AI] LLM query failed:', error)
    return null
  }
}

/**
 * Извлекаем жанры из ответа LLM
 */
function extractGenres(llmResponse: any, preferredGenres: Record<string, number>): string[] {
  if (llmResponse?.genres && Array.isArray(llmResponse.genres)) {
    return llmResponse.genres.slice(0, 3)
  }
  
  // Fallback — топ жанры пользователя
  return Object.keys(preferredGenres).slice(0, 3)
}

/**
 * Извлекаем артистов из ответа LLM
 */
function extractArtists(llmResponse: any, preferredArtists: Record<string, number>): string[] {
  if (llmResponse?.artists && Array.isArray(llmResponse.artists)) {
    return llmResponse.artists.slice(0, 5)
  }
  
  // Fallback — топ артисты пользователя
  return Object.keys(preferredArtists).slice(0, 5)
}

/**
 * Поиск треков
 */
async function searchTracks(genres: string[], artists: string[], limit: number): Promise<ISong[]> {
  const songs: ISong[] = []

  // Поиск по жанрам
  for (const genre of genres) {
    try {
      const genreSongs = await getSongsByGenre(genre, 10)
      songs.push(...genreSongs)
    } catch (error) {
      console.error('[Simple AI] Genre search failed:', genre, error)
    }
  }

  // Поиск по артистам
  for (const artist of artists) {
    try {
      const artistSongs = await getTopSongs(artist, 5)
      songs.push(...artistSongs)
    } catch (error) {
      console.error('[Simple AI] Artist search failed:', artist, error)
    }
  }

  // Если мало — случайные
  if (songs.length < limit) {
    const { getRandomSongs } = await import('@/service/subsonic-api')
    const random = await getRandomSongs(limit - songs.length)
    songs.push(...random)
  }

  // Уникальные
  return songs.slice(0, limit).filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
}
