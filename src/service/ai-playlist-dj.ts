/**
 * AI Playlist Generator — Вариант 1: LLM как «Ди-Джей» на основе метаданных
 * 
 * АРХИТЕКТУРА:
 * 1. Собираем метаданные всех треков (Жанр, Артист, Название)
 * 2. Фильтруем грубо по запросу (если "рок" → оставляем рок)
 * 3. Отправляем 50-100 кандидатов в LLM
 * 4. LLM выбирает 25 лучших для настроения
 * 5. Возвращает ID треков
 */

import { subsonic } from '@/service/subsonic'
import { getRandomSongs, getSongsByGenre, search3 } from '@/service/subsonic-api'
import type { ISong } from '@/types/responses/song'

export interface TrackMetadata {
  id: string
  title: string
  artist: string
  genre?: string
  year?: number
  bpm?: number
  energy?: number
}

export interface DJPlaylistConfig {
  mood: string  // Настроение: "новогодний микс", "тренировка", "сон"
  library: TrackMetadata[]  // Библиотека треков (или кэш)
  profile: {
    preferredGenres: Record<string, number>
    preferredArtists: Record<string, number>
    bannedArtists: string[]
  }
  llmUrl: string
  llmModel: string
  llmApiKey?: string
}

export interface DJPlaylistResult {
  name: string
  description: string
  songs: ISong[]
  reasoning: string
}

/**
 * Главная функция — LLM как Ди-Джей
 */
export async function generateDJPlaylist(
  config: DJPlaylistConfig
): Promise<DJPlaylistResult | null> {
  console.log('[DJ AI] Starting generation for:', config.mood)

  // 1. Грубый фильтр по ключевым словам
  const candidates = filterByKeywords(config.mood, config.library)
  console.log('[DJ AI] Candidates after keyword filter:', candidates.length)

  // 2. Если мало кандидатов — доберём случайных
  if (candidates.length < 50) {
    const random = await getRandomSongs(100)
    const randomMetadata: TrackMetadata[] = random.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      year: song.year,
      bpm: song.bpm,
      energy: song.energy,
    }))
    candidates.push(...randomMetadata)
  }

  // 3. Отправляем топ-100 кандидатов в LLM
  const selected = await llmSelectTracks(config.mood, candidates.slice(0, 100), config)
  
  if (!selected || selected.length === 0) {
    console.error('[DJ AI] LLM returned no tracks')
    return null
  }

  console.log('[DJ AI] LLM selected:', selected.length, 'tracks')

  // 4. Загружаем полные данные треков по ID
  const songs = await loadTracksByIds(selected)

  return {
    name: `AI: ${config.mood}`,
    description: `Сгенерировано ИИ для настроения: ${config.mood}`,
    songs,
    reasoning: selected.reasoning || 'Подобрано по аудио-признакам',
  }
}

/**
 * Грубый фильтр по ключевым словам
 */
function filterByKeywords(mood: string, library: TrackMetadata[]): TrackMetadata[] {
  const moodLower = mood.toLowerCase()
  
  // Ключевые слова → жанры
  const keywordMap: Record<string, string[]> = {
    'новогодн': ['pop', 'holiday', 'christmas'],
    'нов год': ['pop', 'holiday'],
    'рождеств': ['pop', 'holiday', 'christmas'],
    'зима': ['pop', 'electronic', 'ambient'],
    'тренировк': ['rock', 'metal', 'electronic'],
    'спорт': ['rock', 'metal', 'electronic'],
    'фитнес': ['electronic', 'dance'],
    'сон': ['ambient', 'classical', 'newage'],
    'расслабл': ['ambient', 'classical', 'jazz'],
    'медит': ['ambient', 'newage', 'classical'],
    'вечеринк': ['dance', 'electronic', 'pop'],
    'танц': ['dance', 'electronic'],
    'работа': ['classical', 'jazz', 'ambient'],
    'фокус': ['classical', 'ambient'],
    'утрен': ['pop', 'rock', 'electronic'],
    'бодр': ['rock', 'electronic', 'dance'],
    'вечер': ['jazz', 'blues', 'ambient'],
    'спокой': ['jazz', 'blues', 'classical'],
  }

  // Находим подходящие жанры
  const targetGenres: string[] = []
  for (const [keyword, genres] of Object.entries(keywordMap)) {
    if (moodLower.includes(keyword)) {
      targetGenres.push(...genres)
    }
  }

  console.log('[DJ AI] Target genres:', targetGenres)

  // Фильтруем библиотеку
  if (targetGenres.length > 0) {
    return library.filter(track => {
      if (!track.genre) return false
      const genreLower = track.genre.toLowerCase()
      return targetGenres.some(g => genreLower.includes(g))
    })
  }

  // Если не нашли ключевых слов — возвращаем всё
  return library
}

/**
 * LLM выбирает треки из кандидатов
 */
async function llmSelectTracks(
  mood: string,
  candidates: TrackMetadata[],
  config: DJPlaylistConfig
): Promise<{ ids: string[]; reasoning?: string } | null> {
  // Формируем компактный список треков
  const tracksList = candidates.map((t, i) => 
    `${i}: "${t.title}" - ${t.artist} [${t.genre || 'unknown'}]${t.bpm ? ` BPM:${t.bpm}` : ''}${t.energy ? ` E:${t.energy}` : ''}`
  ).join('\n')

  const prompt = `Ты — музыкальный Ди-Джей. Подбери 25 треков для настроения: "${mood}".

СПИСОК ТРЕКОВ (формат: индекс: "название" - артист [жанр] BPM:X Energy:X):
${tracksList}

ПРАВИЛА:
1. Выбери 25 треков которые подходят под настроение
2. Для "новогодний" выбирай праздничные, весёлые треки
3. Для "тренировка" выбирай энергичные (BPM 140+, Energy 0.8+)
4. Для "сон" выбирай спокойные (BPM 60-90, Energy 0.1-0.4)
5. Учитывай жанры и BPM если указаны
6. НЕ выдумывай новые индексы — используй только из списка!

ВЕРНИ JSON:
{
  "selected": [0, 5, 12, ...],  // Индексы из списка (25 штук)
  "reasoning": "Почему выбрал эти треки"
}`

  try {
    const response = await fetch(`${config.llmUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.llmApiKey ? { 'Authorization': `Bearer ${config.llmApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.llmModel,
        input: prompt,
        temperature: 0.7,
        max_output_tokens: 500,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM error: ${response.status}`)
    }

    const result = await response.json()
    
    // Получаем контент из ответа
    let content = result.output?.[0]?.content || ''
    
    console.log('[DJ AI] Raw content length:', content.length)
    console.log('[DJ AI] First 100 chars:', content.substring(0, 100))

    // Удаляем markdown блоки если есть
    content = content.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')
    console.log('[DJ AI] After markdown cleanup:', content.substring(0, 100))

    // Вырезаем JSON из ответа — ищем первый { и последнюю }
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')
    
    console.log('[DJ AI] Braces found: first=', firstBrace, 'last=', lastBrace)
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error('[DJ AI] No JSON braces found')
      return null
    }
    
    const jsonStr = content.substring(firstBrace, lastBrace + 1)
    console.log('[DJ AI] Extracted JSON:', jsonStr.substring(0, 150))
    
    try {
      const parsed = JSON.parse(jsonStr)
      console.log('[DJ AI] ✅ Parsed JSON successfully')
      return {
        ids: parsed.selected?.map((i: number) => candidates[i]?.id).filter(Boolean) || [],
        reasoning: parsed.reasoning,
      }
    } catch (e) {
      console.error('[DJ AI] ❌ Failed to parse JSON:', e)
      console.error('[DJ AI] JSON that failed:', jsonStr)
      return null
    }
  } catch (error) {
    console.error('[DJ AI] LLM query failed:', error)
    return null
  }
}

/**
 * Загружаем полные данные треков по ID
 */
async function loadTracksByIds(ids: string[]): Promise<ISong[]> {
  const songs: ISong[] = []

  for (const id of ids.slice(0, 25)) {
    try {
      const song = await subsonic.songs.getSong(id)
      if (song) {
        songs.push(song)
      }
    } catch (error) {
      console.error('[DJ AI] Failed to load song:', id, error)
    }
  }

  return songs
}

/**
 * Получить метаданные всех треков (кэш)
 */
export async function getLibraryMetadata(): Promise<TrackMetadata[]> {
  // Получаем случайные треки как代表 библиотеки
  const randomSongs = await getRandomSongs(500)
  
  return randomSongs.map(song => ({
    id: song.id,
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    year: song.year,
    bpm: song.bpm,
    energy: song.energy,
  }))
}
