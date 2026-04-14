/**
 * AI Playlist Generator - Авто-генерация AI плейлистов
 * 
 * Используется для автоматического создания 3 AI плейлистов:
 * - ai-morning (утро)
 * - ai-day (день)
 * - ai-evening (вечер)
 */

import type { ISong } from '@/types/responses/song'

interface LLMSettings {
  llmEnabled: boolean
  llmLmStudioUrl: string
  llmModel?: string
}

interface MLSettings {
  llmCoordinatorEnabled: boolean
}

interface MLProfile {
  preferredGenres: Record<string, number>
  preferredArtists: Record<string, number>
}

interface AddPlaylistParams {
  id: string
  type: string
  name: string
  description: string
  songs: ISong[]
  createdAt: string
  lastUpdated: string
  llmComment: string
  metadata: Record<string, any>
}

export async function generateSingleAIPlaylist(
  playlistId: string,
  settings: LLMSettings,
  mlSettings: MLSettings,
  profile: MLProfile,
  trackLimit: number,
  getPlaylist: (id: string) => any,
  addPlaylist: (params: AddPlaylistParams) => void,
  getOrGenerateComment: (type: string, songs: ISong[]) => Promise<string>,
  setGeneratedPlaylistTypes: (fn: (prev: Set<string>) => Set<string>) => void,
  forceRegen: boolean = false  // Для ручной генерации по кнопке
): Promise<boolean> {
  console.log(`[AutoGenerate] 🚀 Checking ${playlistId}...`)

  try {
    // Проверяем что LLM включен
    if (!settings.llmEnabled || !mlSettings.llmCoordinatorEnabled) {
      console.log(`[AutoGenerate] ❌ LLM disabled for ${playlistId}`)
      return false
    }

    const savedPlaylist = getPlaylist(playlistId)
    
    // Проверяем нужно ли обновить
    let needsRegen = false
    if (forceRegen) {
      // Ручная генерация - всегда регенерировать!
      needsRegen = true
      console.log(`[AutoGenerate] ${playlistId}: Force regeneration`)
    } else if (!savedPlaylist || !savedPlaylist.songs || savedPlaylist.songs.length === 0) {
      needsRegen = true
      console.log(`[AutoGenerate] ${playlistId}: No playlist found, NEEDS GENERATION`)
    } else {
      const lastUpdated = new Date(savedPlaylist.lastUpdated).getTime()
      const hoursSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60)
      
      if (hoursSinceUpdate >= 24) {
        needsRegen = true
        console.log(`[AutoGenerate] ${playlistId}: Last updated ${hoursSinceUpdate.toFixed(1)}h ago, NEEDS REGENERATION`)
      } else {
        console.log(`[AutoGenerate] ${playlistId}: Updated ${hoursSinceUpdate.toFixed(1)}h ago, skipping`)
        return false
      }
    }

    if (!needsRegen) return false

    // Маппинг ID к времени суток
    const timeMap: Record<string, string> = {
      'ai-morning': 'утро',
      'ai-day': 'день',
      'ai-evening': 'вечер',
    }
    const timeOfDay = timeMap[playlistId] || 'день'

    console.log(`[AutoGenerate] Generating AI playlist: ${playlistId} (${timeOfDay})`)

    // LLM генерирует план
    const currentGenres = Object.entries(profile.preferredGenres || {})
      .filter(([g]) => g.length <= 15 && !/[0-9]/.test(g) && g === g.toLowerCase())
      .slice(0, 5)
      .map(([g]) => g)
    const currentArtists = Object.keys(profile.preferredArtists || {}).slice(0, 5)

    const prompt = `
Ты — музыкальный куратор. Создай плейлист для времени суток "${timeOfDay}".

СЕЙЧАС: ${new Date().toLocaleDateString('ru-RU', { weekday: 'long' })}
ЛЮБИМЫЕ ЖАНРЫ: ${currentGenres.join(', ') || 'не указаны'}
ЛЮБИМЫЕ АРТИСТЫ: ${currentArtists.join(', ') || 'не указаны'}

ЗАДАЧА:
1. Придумай креативное название плейлиста (2-4 слова)
2. Напиши описание (1-2 предложения)
3. Какие 3-5 ЖАНРОВ лучше всего подойдут? (используй ТОЛЬКО реальные жанры: pop, rock, hip-hop, rap, electronic, dance, r&b, soul, jazz, classical, metal, indie, alternative, folk, country, reggae, funk, disco, house, techno, ambient)
4. Какие 3-5 АРТИСТОВ добавить? (используй ИМЕНА артистов, НЕ ID!)
5. Энергия (0.0-1.0 min-max)?

Ответь ТОЛЬКО JSON без markdown кода:
{"name": "Название", "description": "Описание", "genres": ["pop", "rock"], "artists": ["Artist Name 1", "Artist Name 2"], "energyMin": 0.6, "energyMax": 0.9}`

    const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.llmModel || 'qwen2.5-7b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      console.warn(`[AutoGenerate] LLM error for ${playlistId}:`, response.status)
      return false
    }

    const result = await response.json()
    let content = result.choices?.[0]?.message?.content?.trim() || ''
    
    // Удаляем markdown wrapper если есть (```json ... ```)
    content = content.replace(/^```json\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')
    
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')

    if (firstBrace === -1 || lastBrace === -1) {
      console.warn(`[AutoGenerate] Invalid JSON for ${playlistId}:`, content)
      return false
    }

    let llmPlan
    try {
      llmPlan = JSON.parse(content.substring(firstBrace, lastBrace + 1))
    } catch (e) {
      console.error(`[AutoGenerate] JSON parse error for ${playlistId}:`, e)
      return false
    }
    
    console.log(`[AutoGenerate] LLM plan for ${playlistId}:`, {
      name: llmPlan.name,
      genres: llmPlan.genres,
      artists: llmPlan.artists,
    })

    // Подбор треков
    const { getRandomSongs, getTopSongs } = await import('@/service/subsonic-api')
    let allSongs: ISong[] = []

    // Реальные жанры которые есть в Navidrome
    const validGenres = ['pop', 'rock', 'hip-hop', 'rap', 'electronic', 'dance', 'r&b', 'soul', 'jazz', 'classical', 'metal', 'indie', 'alternative', 'folk', 'country', 'reggae', 'funk', 'disco', 'house', 'techno', 'ambient', 'rusrap', 'edm', 'trance']

    if (llmPlan.genres && llmPlan.genres.length > 0) {
      const validGenresFromLLM = llmPlan.genres.filter((g: string) => {
        const isValid = validGenres.includes(g.toLowerCase())
        if (!isValid) {
          console.warn(`[AutoGenerate] Skipping invalid genre: ${g}`)
        }
        return isValid
      }).slice(0, 3)

      console.log(`[AutoGenerate] Using valid genres:`, validGenresFromLLM)

      for (const genre of validGenresFromLLM) {
        try {
          console.log(`[AutoGenerate] Getting songs for genre: ${genre}`)
          const songsByGenre = await getTopSongs('', Math.floor(trackLimit / validGenresFromLLM.length))
          const genreFiltered = songsByGenre.filter((s: ISong) =>
            s.genre?.toLowerCase() === genre.toLowerCase()
          )
          console.log(`[AutoGenerate] Found ${genreFiltered.length} tracks for ${genre}`)
          allSongs.push(...genreFiltered.slice(0, Math.floor(trackLimit / validGenresFromLLM.length)))
        } catch (e) {
          console.warn(`[AutoGenerate] Failed genre ${genre}:`, e)
        }
      }
    }

    if (llmPlan.artists && llmPlan.artists.length > 0) {
      // Фильтруем артисты - пропускаем ID (начинаются с цифр или содержат только hex)
      const validArtists = llmPlan.artists.filter((a: string) => {
        const isId = /^[0-9a-fA-F]{10,}$/.test(a) || /^\d+[A-Z]/.test(a)
        if (isId) {
          console.warn(`[AutoGenerate] Skipping artist ID: ${a}`)
        }
        return !isId && a.length > 0
      }).slice(0, 3)

      console.log(`[AutoGenerate] Using valid artists:`, validArtists)

      for (const artist of validArtists) {
        try {
          console.log(`[AutoGenerate] Getting songs for artist: ${artist}`)
          const artistSongs = await getTopSongs(artist, 5)
          console.log(`[AutoGenerate] Found ${artistSongs.length} tracks for ${artist}`)
          allSongs.push(...artistSongs.slice(0, 5))
        } catch (e) {
          console.warn(`[AutoGenerate] Failed artist ${artist}:`, e)
        }
      }
    }

    if (allSongs.length < trackLimit) {
      const randomSongs = await getRandomSongs(trackLimit - allSongs.length)
      allSongs.push(...randomSongs)
    }

    const uniqueSongs = allSongs.filter((song, index, self) =>
      index === self.findIndex(s => s.id === song.id)
    ).slice(0, trackLimit)

    if (uniqueSongs.length === 0) {
      console.warn(`[AutoGenerate] No songs for ${playlistId}`)
      return false
    }

    // Комментарий с кешем
    const comment = await getOrGenerateComment(playlistId, uniqueSongs)

    // Сохраняем
    addPlaylist({
      id: playlistId,
      type: 'ai-generated',
      name: llmPlan.name || `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} Микс`,
      description: llmPlan.description || `AI плейлист: ${timeOfDay}`,
      songs: uniqueSongs,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      llmComment: comment,
      metadata: {
        llmGenres: llmPlan.genres || [],
        llmArtists: llmPlan.artists || [],
        timeOfDay: timeOfDay,
      },
    })

    setGeneratedPlaylistTypes(prev => new Set(prev).add(playlistId))
    console.log(`[AutoGenerate] ✅ ${playlistId}: ${uniqueSongs.length} tracks`)
    
    return true
  } catch (error) {
    console.error(`[AutoGenerate] Error for ${playlistId}:`, error)
    return false
  }
}
