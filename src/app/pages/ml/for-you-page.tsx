import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { useMLPlaylists } from '@/store/ml-playlists.store'
import { useExternalApi, useExternalApiStore } from '@/store/external-api.store'
import { useArtistSubscriptions } from '@/store/artist-subscriptions.store'
import { generateDailyMix, generateDiscoverWeekly, generateMyWavePlaylist, generateSimilarArtistsPlaylist, generateDecadePlaylist, generateGenrePlaylist, generateMLRecommendations, generateTimeOfDayMix, generateActivityMix, generateBecauseYouListened, generateMoodMix, generateVibeMix, generateNewReleasesPlaylist } from '@/service/ml-wave-service'
import { generateDecadePlaylistV2, generateNewReleasesPlaylistV2, generateSimilarArtistsPlaylistV2 } from '@/service/ml-wave-service-v2'
import { getRandomSongs, getTopSongs } from '@/service/subsonic-api'
import { subsonic } from '@/service/subsonic'
import { httpClient } from '@/api/httpClient'
import { lastFmService } from '@/service/lastfm-api'
import { llmService } from '@/service/llm-service'
import { generateSingleAIPlaylist } from '@/service/ai-playlist-auto-generator'
import type { ISong } from '@/types/responses/song'
import { toast } from 'react-toastify'
import { trackEvent } from '@/service/ml-event-tracker'
import styles from './for-you-page.module.css'
import { getGenreColor } from '@/utils/genreColors'
import { InstantMixModal } from '@/app/components/ml/instant-mix-modal'
import { SongAlchemyModal } from '@/app/components/ml/song-alchemy-modal'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'

interface MLPlaylistCard {
  id: string
  title: string
  description: string
  icon: string
  color?: string
  trackCount?: number
  type: 'daily-mix' | 'discover-weekly' | 'my-wave' | 'trends' | 'new-releases' | 'similar-artists' | 'decade' | 'genre' | 'disliked' | 'time-of-day' | 'workout' | 'focus' | 'chill' | 'because-you-listened' | 'instant-mix' | 'ml-recommendations' | 'mood' | 'vibe-similarity' | 'new-releases-subscriptions' | 'ai-generated'
  decade?: string
  genre?: string
  mood?: string
}

export default function MLForYouPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'for-you' | 'trends' | 'discover') || 'for-you'
  const [activeTab, setActiveTab] = useState<'for-you' | 'trends' | 'discover'>(initialTab)
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [llmStatus, setLlmStatus] = useState<string | null>(null) // Статус LLM анализа
  const [isInstantMixOpen, setIsInstantMixOpen] = useState(false)
  const [isAlchemyOpen, setIsAlchemyOpen] = useState(false)
  // TODO: AI авто-генерация - временно отключена
  // const [aiPlaylistsGenerating, setAiPlaylistsGenerating] = useState(false)
  const [generatedPlaylistTypes, setGeneratedPlaylistTypes] = useState<Set<string>>(() => {
    // Загружаем из localStorage при монтировании
    try {
      const saved = localStorage.getItem('generated-playlist-types')
      if (saved) return new Set(JSON.parse(saved))
    } catch (error) {
      console.error('Failed to load generated playlist types:', error)
    }
    return new Set()
  })

  // Сохраняем в localStorage при изменении
  useEffect(() => {
    try {
      localStorage.setItem('generated-playlist-types', JSON.stringify(Array.from(generatedPlaylistTypes)))
    } catch (error) {
      console.error('Failed to save generated playlist types:', error)
    }
  }, [generatedPlaylistTypes])

  // Авто-генерация AI плейлистов при загрузке (если LLM включен и прошло 24+ часа)
  useEffect(() => {
    const autoGenerateAIPlaylists = async () => {
      try {
        const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
        const mlSettings = useMLPlaylistsStore.getState().settings
        const state = useExternalApiStore.getState()
        const settings = state.settings || {}

        // Проверяем что LLM включен
        if (!settings.llmEnabled || !mlSettings.settings?.llmCoordinatorEnabled) {
          console.log('[AutoGenerate] LLM disabled, skipping AI playlist generation')
          return
        }

        const aiPlaylistIds = ['ai-morning', 'ai-day', 'ai-evening']
        const profile = getProfile()

        for (const playlistId of aiPlaylistIds) {
          const savedPlaylist = getPlaylist(playlistId)
          
          // Проверяем нужно ли обновить (24 часа)
          let needsRegen = false
          if (!savedPlaylist || !savedPlaylist.songs || savedPlaylist.songs.length === 0) {
            needsRegen = true
            console.log(`[AutoGenerate] ${playlistId}: No playlist found, generating...`)
          } else {
            const lastUpdated = new Date(savedPlaylist.lastUpdated).getTime()
            const hoursSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60)
            
            if (hoursSinceUpdate >= 24) {
              needsRegen = true
              console.log(`[AutoGenerate] ${playlistId}: Last updated ${hoursSinceUpdate.toFixed(1)}h ago, regenerating...`)
            } else {
              console.log(`[AutoGenerate] ${playlistId}: Updated ${hoursSinceUpdate.toFixed(1)}h ago, skipping`)
            }
          }

          if (needsRegen) {
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
3. Какие 3-5 жанров лучше всего подойдут?
4. Какие 3-5 артистов добавить?
5. Энергия (0.0-1.0 min-max)?

Ответь ТОЛЬКО JSON:
{"name": "Название", "description": "Описание", "genres": ["genre1", "genre2"], "artists": ["Artist1"], "energyMin": 0.6, "energyMax": 0.9}`

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
              continue
            }

            const result = await response.json()
            const content = result.choices?.[0]?.message?.content?.trim() || ''
            const firstBrace = content.indexOf('{')
            const lastBrace = content.lastIndexOf('}')

            if (firstBrace === -1 || lastBrace === -1) {
              console.warn(`[AutoGenerate] Invalid JSON for ${playlistId}`)
              continue
            }

            const llmPlan = JSON.parse(content.substring(firstBrace, lastBrace + 1))
            console.log(`[AutoGenerate] LLM plan for ${playlistId}:`, llmPlan.name)

            // Подбор треков
            const { getRandomSongs, getTopSongs } = await import('@/service/subsonic-api')
            let allSongs: ISong[] = []

            if (llmPlan.genres && llmPlan.genres.length > 0) {
              for (const genre of llmPlan.genres.slice(0, 3)) {
                try {
                  const songsByGenre = await getTopSongs('', Math.floor(trackLimit / llmPlan.genres.length))
                  const genreFiltered = songsByGenre.filter(s => 
                    s.genre?.toLowerCase() === genre.toLowerCase()
                  )
                  allSongs.push(...genreFiltered.slice(0, Math.floor(trackLimit / llmPlan.genres.length)))
                } catch (e) {
                  console.warn(`[AutoGenerate] Failed genre ${genre}:`, e)
                }
              }
            }

            if (llmPlan.artists && llmPlan.artists.length > 0) {
              for (const artist of llmPlan.artists.slice(0, 2)) {
                try {
                  const artistSongs = await getTopSongs(artist, 3)
                  allSongs.push(...artistSongs.slice(0, 3))
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
              continue
            }

            // Используем LLM описание как комментарий (не генерируем заново!)
            const llmComment = llmPlan.description || `${llmPlan.name} - плейлист для времени суток: ${timeOfDay}`

            // Сохраняем
            addPlaylist({
              id: playlistId,
              type: 'ai-generated',
              name: llmPlan.name || `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} Микс`,
              description: llmPlan.description || `AI плейлист: ${timeOfDay}`,
              songs: uniqueSongs,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
              llmComment: llmComment,
              metadata: {
                llmGenres: llmPlan.genres || [],
                llmArtists: llmPlan.artists || [],
                timeOfDay: timeOfDay,
              },
            })

            setGeneratedPlaylistTypes(prev => new Set(prev).add(playlistId))
            console.log(`[AutoGenerate] ✅ ${playlistId}: ${uniqueSongs.length} tracks`)
          }
        }
      } catch (error) {
        console.error('[AutoGenerate] Error:', error)
      }
    }

    // Запускаем авто-генерацию через 3 секунды после загрузки страницы
    const timer = setTimeout(autoGenerateAIPlaylists, 3000)
    return () => clearTimeout(timer)
  }, [])

  // Ручная генерация AI плейлистов по кнопке
  const handleGenerateAIPlaylists = async () => {
    setAiPlaylistsGenerating(true)
    try {
      const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
      const mlStore = useMLPlaylistsStore.getState()
      const state = useExternalApiStore.getState()
      const settings = state.settings || {}

      console.log('[AI Gen] LLM Enabled:', settings.llmEnabled)
      console.log('[AI Gen] ML Store settings:', mlStore.settings)
      console.log('[AI Gen] LLM Coordinator Enabled:', mlStore.settings?.llmCoordinatorEnabled)

      if (!settings.llmEnabled || !mlStore.settings?.llmCoordinatorEnabled) {
        console.warn('[AI Gen] ❌ LLM or Coordinator disabled!')
        toast('⚠️ Включите LLM Координатор в настройках ML плейлистов', { type: 'warning' })
        setAiPlaylistsGenerating(false)
        return
      }

      console.log('[AI Gen] ✅ Starting generation...')
      toast('🤖 Генерация AI плейлистов...', { type: 'info' })

      const playlists = ['ai-morning', 'ai-day', 'ai-evening']

      for (const id of playlists) {
        await generateSingleAIPlaylist(
          id,
          settings,
          mlStore.settings,
          getProfile(),
          trackLimit,
          getPlaylist,
          addPlaylist,
          getOrGenerateComment,
          setGeneratedPlaylistTypes,
          true  // forceRegen - всегда регенерировать при клике!
        )
      }

      localStorage.setItem('ai-playlists-last-generated', Date.now().toString())
      toast('✅ AI плейлисты сгенерированы!', { type: 'success' })
    } catch (error) {
      console.error('AI Playlist generation error:', error)
      toast('Ошибка генерации AI плейлистов', { type: 'error' })
    } finally {
      setAiPlaylistsGenerating(false)
    }
  }

  // Форматирование даты обновления
  const formatLastUpdated = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'только что'
    if (diffMins < 60) return `${diffMins} мин. назад`
    if (diffHours < 24) return `${diffHours} ч. назад`
    if (diffDays < 7) return `${diffDays} дн. назад`

    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    })
  }

  // Получение даты обновления для типа плейлиста
  const getPlaylistLastUpdated = (playlistType: string) => {
    const savedPlaylist = getPlaylist(playlistType)
    if (savedPlaylist && savedPlaylist.lastUpdated) {
      return formatLastUpdated(savedPlaylist.lastUpdated)
    }
    return null
  }

  // Получение LLM-комментария для типа плейлиста
  const getPlaylistComment = (playlistType: string) => {
    const savedPlaylist = getPlaylist(playlistType)
    if (savedPlaylist && savedPlaylist.llmComment) {
      return savedPlaylist.llmComment
    }
    return null
  }

  const { getProfile, ratings } = useML()
  const { setSongList } = usePlayerActions()
  const { addPlaylist, getPlaylist } = useMLPlaylistsStateActions()
  const { settings: mlPlaylistSettings } = useMLPlaylists()
  const trackLimit = mlPlaylistSettings?.maxTracks || 35  // Берем из настроек
  
  // Логирование для отладки
  console.log('[ForYouPage] ML Settings:', mlPlaylistSettings)
  console.log(`[ForYouPage] Track limit: ${trackLimit} (maxTracks: ${mlPlaylistSettings?.maxTracks})`)
  console.log(`[ForYouPage] Novelty factor: ${mlPlaylistSettings?.noveltyFactor}`)
  
  const { settings } = useExternalApi()

  // Activity Mixer - Миксы для занятий (11 типов, без дублей с Mood)
  const activityMixers = [
    { id: 'meditation', name: '🧘 Медитация', color: 'from-indigo-600 to-purple-700', icon: '🧘' },
    { id: 'deepwork', name: '📚 Глубокая работа', color: 'from-blue-600 to-cyan-700', icon: '📚' },
    { id: 'running', name: '🏃 Бег', color: 'from-red-600 to-orange-700', icon: '🏃' },
    { id: 'workout', name: '🏋️ Силовая', color: 'from-red-700 to-red-900', icon: '🏋️' },
    { id: 'cycling', name: '🚴 Вело', color: 'from-green-500 to-teal-600', icon: '🚴' },
    { id: 'creativity', name: '🎨 Творчество', color: 'from-pink-500 to-rose-600', icon: '🎨' },
    { id: 'cooking', name: '🍳 Кулинария', color: 'from-yellow-500 to-orange-600', icon: '🍳' },
    { id: 'reading', name: '🌙 Чтение', color: 'from-slate-600 to-gray-700', icon: '🌙' },
    { id: 'gaming', name: '🎮 Гейминг', color: 'from-violet-600 to-purple-700', icon: '🎮' },
    { id: 'sleep', name: '🛁 Сон', color: 'from-blue-800 to-indigo-900', icon: '🛁' },
    { id: 'acoustic', name: '🎸 Акустика', color: 'from-amber-600 to-yellow-700', icon: '🎸' },
  ]

  const handleActivityClick = async (activity: string) => {
    setIsGenerating(activity)
    try {
      const profile = getProfile()
      const likedSongIds = profile.likedSongs
      const preferredGenres = profile.preferredGenres

      const activityPlaylist = await generateActivityMix(activity, likedSongIds, ratings, preferredGenres, trackLimit)
      setSongList(activityPlaylist.songs, 0)

      // Отправляем событие для статистики оркестратора
      window.dispatchEvent(new CustomEvent('playlist_generated'))
      trackEvent('playlist_generated', { type: `activity-${activity}`, songCount: activityPlaylist.songs.length })
      
      const activityName = activityMixers.find(a => a.id === activity)?.name || activity
      toast(`🎵 ${activityName} сгенерирован!`, { type: 'success' })
    } catch (error) {
      console.error('Activity mix error:', error)
      toast('Ошибка генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  // Mood Mixer - настоящие настроения (6 типов, без дублей с Activity)
  const moodMixers = [
    { id: 'happy', name: '😊 Счастливое', color: 'from-yellow-400 to-orange-500', icon: '😊' },
    { id: 'sad', name: '😢 Грустное', color: 'from-blue-600 to-indigo-700', icon: '😢' },
    { id: 'energetic', name: '⚡ Энергичное', color: 'from-red-500 to-pink-600', icon: '⚡' },
    { id: 'celebratory', name: '� Праздничное', color: 'from-purple-500 to-pink-500', icon: '�' },
    { id: 'melancholy', name: '🌧️ Меланхолия', color: 'from-gray-600 to-slate-700', icon: '🌧️' },
    { id: 'aggressive', name: '🔥 Агрессивное', color: 'from-red-700 to-orange-800', icon: '🔥' },
  ]

  const handleMoodClick = async (mood: string) => {
    setIsGenerating(mood)
    try {
      const profile = getProfile()
      const likedSongIds = profile.likedSongs
      const preferredGenres = profile.preferredGenres

      // Маппинг ID карточек → ID в MOOD_CONFIG
      const moodMapping: Record<string, string> = {
        'melancholy': 'melancholic',
        'aggressive': 'angry',
      }
      
      const actualMood = moodMapping[mood] || mood
      console.log(`[MoodMix] Clicked: ${mood} → Using: ${actualMood}`)

      const moodPlaylist = await generateMoodMix(likedSongIds, ratings, preferredGenres, actualMood, trackLimit)
      setSongList(moodPlaylist.songs, 0)

      // Отправляем событие для статистики оркестратора
      window.dispatchEvent(new CustomEvent('playlist_generated'))
      trackEvent('playlist_generated', { type: `mood-${actualMood}`, songCount: moodPlaylist.songs.length })

      const moodName = moodMixers.find(m => m.id === mood)?.name || mood
      toast(`🎵 ${moodName} сгенерирован!`, { type: 'success' })
    } catch (error) {
      console.error('Mood mix error:', error)
      toast('Ошибка генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  // Вспомогательная функция для генерации комментария плейлиста
  const generatePlaylistComment = async (
    type: string,
    songs: ISong[]
  ): Promise<string> => {
    if (!songs || songs.length === 0) {
      console.warn('[ForYou] No songs for comment generation:', type)
      return ''
    }

    console.log('[ForYou] Generating comment for type:', type, 'songs count:', songs.length)
    const genres = [...new Set(songs.map(s => s.genre).filter(Boolean))]
    const artists = [...new Set(songs.map(s => s.artist).filter(Boolean))]
    console.log('[ForYou] Genres:', genres, 'Artists:', artists)

    const comment = await llmService.generatePlaylistComment({
      type,
      trackCount: songs.length,
      genres: genres.slice(0, 3),
      artists: artists.slice(0, 3),
    })

    console.log('[ForYou] Generated comment:', comment)
    return comment
  }

  // Получение комментария из кеша или генерация
  const getOrGenerateComment = async (
    type: string,
    songs: ISong[]
  ): Promise<string> => {
    // Проверяем localStorage - там хранится дольше чем в store
    const cacheKey = `playlist-comment-${type}`
    const cached = localStorage.getItem(cacheKey)
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        // Если кеш моложе 24 часов - используем
        const hoursOld = (Date.now() - parsed.timestamp) / (1000 * 60 * 60)
        if (hoursOld < 24 && parsed.comment) {
          console.log('[ForYou] Using cached comment for:', type, `(${hoursOld.toFixed(1)}h old)`)
          return parsed.comment
        } else {
          console.log('[ForYou] Cached comment expired for:', type)
        }
      } catch (e) {
        console.warn('[ForYou] Failed to parse cached comment for:', type, e)
      }
    }

    // Если нет кеша или он устарел - генерируем новый
    console.log('[ForYou] No valid cached comment, generating for:', type)
    const comment = await generatePlaylistComment(type, songs)
    
    // Сохраняем в кеш
    if (comment) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          comment,
          timestamp: Date.now(),
          type,
          songCount: songs.length,
        }))
        console.log('[ForYou] Comment cached for:', type)
      } catch (e) {
        console.warn('[ForYou] Failed to cache comment for:', type, e)
      }
    }
    
    return comment
  }

  // Вспомогательная функция для LLM-enhanced генерации
  const generateWithLLM = async (
    generator: () => Promise<{ songs: ISong[]; source?: string }>,
    context: {
      playlistName: string
      playlistType: string
      contextInfo?: string
    }
  ): Promise<{ songs: ISong[]; source: string }> => {
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}
    
    // Проверяем ГЛОБАЛЬНУЮ настройку LLM Координатора
    const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
    const mlSettings = useMLPlaylistsStore.getState().settings

    // Если LLM выключен ИЛИ Координатор выключен - просто генерируем
    if (!settings.llmEnabled || !mlSettings.llmCoordinatorEnabled) {
      console.log('[ForYou] LLM disabled (global or coordinator off), using raw generation')
      return generator()
    }

    try {
      // Шаг 1: Спрашиваем LLM рекомендации
      setLlmStatus('🤖 LLM анализирует ваши предпочтения...')
      console.log('[ForYou] Step 1: Asking LLM for recommendations...')

      const profile = getProfile()
      const currentGenres = Object.entries(profile.preferredGenres || {})
        .filter(([g]) => g.length <= 15 && !/[0-9]/.test(g) && g === g.toLowerCase())
        .slice(0, 5)
        .map(([g]) => g)
      
      const currentArtists = Object.keys(profile.preferredArtists || {}).slice(0, 5)
      const now = new Date()
      const timeOfDay = now.getHours() < 12 ? 'утро' : now.getHours() < 18 ? 'день' : 'вечер'
      const dayOfWeek = now.toLocaleDateString('ru-RU', { weekday: 'long' })

      const prompt = `
Ты — музыкальный куратор. Пользователь хочет плейлист "${context.playlistName}".

СЕЙЧАС: ${dayOfWeek}, ${timeOfDay}
ЛЮБИМЫЕ ЖАНРЫ: ${currentGenres.join(', ') || 'не указаны'}
ЛЮБИМЫЕ АРТИСТЫ: ${currentArtists.join(', ') || 'не указаны'}
${context.contextInfo ? `КОНТЕКСТ: ${context.contextInfo}` : ''}

ЗАДАЧА:
1. Какие 3-5 жанров лучше всего подойдут для ЭТОГО плейлиста СЕЙЧАС?
2. Какие 3-5 артистов можно добавить?
3. Какое BPM диапазон (min-max)?
4. Какая энергия (0.0-1.0 min-max)?

Ответь ТОЛЬКО JSON:
{"genres": ["rock", "pop"], "artists": ["Artist1"], "bpmMin": 100, "bpmMax": 140, "energyMin": 0.6, "energyMax": 0.9}`

      const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.llmModel || 'qwen2.5-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 200,
        }),
      })

      let llmRecommendations = null

      if (response.ok) {
        const result = await response.json()
        const content = result.choices?.[0]?.message?.content?.trim() || ''
        const firstBrace = content.indexOf('{')
        const lastBrace = content.lastIndexOf('}')

        if (firstBrace !== -1 && lastBrace !== -1) {
          const jsonStr = content.substring(firstBrace, lastBrace + 1)
          llmRecommendations = JSON.parse(jsonStr)
          console.log('[ForYou] LLM recommendations:', llmRecommendations)
          setLlmStatus(`✅ LLM рекомендует: ${llmRecommendations.genres?.join(', ') || 'отличные треки'}`)
        }
      }

      // Шаг 2: Генерируем плейлист
      setLlmStatus('🎵 Генерируем плейлист...')
      console.log('[ForYou] Step 2: Generating playlist...')

      const result = await generator()
      const songs = result?.songs || []

      if (songs.length === 0) {
        console.warn('[ForYou] Empty playlist from generator')
        setLlmStatus(null)
        return { songs: [], source: 'ml-algorithms' }
      }

      // ❌ ОТКЛЮЧЕНО: LLM review - слишком много запросов, комментарий генерируется отдельно
      // Вместо этого используем кэшированный комментарий через getOrGenerateComment
      console.log('[ForYou] Step 3: Skipping LLM review (using cached comment instead)')
      setLlmStatus('✅ LLM подобрал треки')

      // Очищаем статус через 3 секунды
      setTimeout(() => setLlmStatus(null), 3000)

      return { songs, source: 'llm-enhanced' }
    } catch (error) {
      console.error('[ForYou] LLM enhancement error:', error)
      setLlmStatus(null)
      // Fallback: просто генерируем
      return generator()
    }
  }

  // Функция для получения рекомендаций от LLM перед генерацией
  const getLLMRecommendations = async (
    playlistType: string,
    contextInfo?: string
  ): Promise<{ suggestedGenres?: string[]; suggestedArtists?: string[]; mood?: string } | null> => {
    const state = useExternalApiStore.getState()
    const settings = state.settings || {}

    if (!settings.llmEnabled) {
      return null
    }

    try {
      const profile = getProfile()
      const currentGenres = Object.keys(profile.preferredGenres || {}).slice(0, 5)
      const currentArtists = Object.keys(profile.preferredArtists || {}).slice(0, 5)

      const prompt = `
Ты — музыкальный куратор. Пользователь хочет сгенерировать плейлист.

Тип плейлиста: ${playlistType}
${contextInfo ? `Контекст: ${contextInfo}` : ''}
Текущие жанры пользователя: ${currentGenres.join(', ') || 'не указаны'}
Текущие артисты пользователя: ${currentArtists.join(', ') || 'не указаны'}

Порекомендуй:
1. Какие 3-5 жанров лучше всего подойдут для этого плейлиста?
2. Какие 3-5 артистов можно добавить для разнообразия?
3. Какое настроение/атмосфера должны быть?

Ответь ТОЛЬКО в формате JSON:
{"suggestedGenres": [], "suggestedArtists": [], "mood": "описание атмосферы"}`

      console.log('[ForYou] Asking LLM for recommendations...')

      const response = await fetch(`${settings.llmLmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.llmModel || 'qwen2.5-7b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 150,
        }),
      })

      if (!response.ok) {
        console.warn('[ForYou] LLM recommendations failed:', response.status)
        return null
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content?.trim() || ''

      const firstBrace = content.indexOf('{')
      const lastBrace = content.lastIndexOf('}')

      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = content.substring(firstBrace, lastBrace + 1)
        const parsed = JSON.parse(jsonStr)
        console.log('[ForYou] LLM recommendations:', parsed)
        return parsed
      }

      return null
    } catch (error) {
      console.error('[ForYou] LLM recommendations error:', error)
      return null
    }
  }

  const handlePlayPlaylist = async (playlist: MLPlaylistCard) => {
    setIsGenerating(playlist.id)

    try {
      const profile = getProfile()
      const likedSongIds = profile.likedSongs
      const preferredGenres = profile.preferredGenres
      const preferredArtists = profile.preferredArtists
      const dislikedSongIds = profile.dislikedSongs

      // Загружаем настройки ML плейлистов для проверки LLM Координатора
      const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
      const mlSettings = useMLPlaylistsStore.getState()

      let songs: ISong[] = []

      // Генерируем плейлист в зависимости от типа
      switch (playlist.type) {
        case 'instant-mix':
          // Открываем модальное окно поиска
          setIsInstantMixOpen(true)
          setIsGenerating(null)
          return
        
        case 'song-alchemy':
          // Открываем модальное окно Song Alchemy
          setIsAlchemyOpen(true)
          setIsGenerating(null)
          return

        case 'shared-listens':
          // Слушают другие - используем реальный сервис shared-listens
          setIsGenerating(playlist.id)
          try {
            const { loadSharedAccounts, generateSharedPlaylist } = await import('@/service/shared-listens')
            const accounts = loadSharedAccounts()
            const enabledAccounts = accounts.filter(a => a.enabled)

            if (enabledAccounts.length === 0) {
              toast('⚠️ Нет подключенных аккаунтов! Добавьте их в настройках', { type: 'warning' })
              setIsGenerating(null)
              return
            }

            console.log('[SharedListens] Generating from', enabledAccounts.length, 'accounts')
            const sharedResult = await generateSharedPlaylist(enabledAccounts, trackLimit)

            if (sharedResult.tracks.length === 0) {
              toast('⚠️ Не удалось получить треки из аккаунтов', { type: 'warning' })
              setIsGenerating(null)
              return
            }

            const songs = sharedResult.tracks.map(t => t.song)

            // Сохраняем плейлист в store
            addPlaylist({
              id: 'shared-listens',
              type: 'shared-listens',
              name: '🌍 Что слушают другие',
              description: `Плейлист из ${enabledAccounts.length} аккаунтов: ${enabledAccounts.map(a => a.name).join(', ')}`,
              songs: songs,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
            })

            // Обновляем state
            setGeneratedPlaylistTypes(prev => new Set(prev).add('shared-listens'))

            // Воспроизведение
            setSongList(songs, 0, false, undefined, '🌍 Что слушают другие')
            setIsGenerating(null)

            trackEvent('playlist_generated', { type: 'shared-listens', songCount: songs.length })
            toast(`� Слушают другие: ${songs.length} треков из ${enabledAccounts.length} аккаунтов!`, { type: 'success' })
          } catch (error) {
            console.error('Shared listens error:', error)
            toast('Ошибка генерации плейлиста', { type: 'error' })
            setIsGenerating(null)
          }
          return

        case 'daily-mix':
          // Ежедневный микс - чистая ML генерация без LLM
          setLlmStatus('🎵 Генерируем ежедневный микс...')
          
          console.log(`[ForYouPage] Calling generateDailyMix with limit: ${trackLimit}`)

          const dailyMixResult = await generateDailyMix(
            likedSongIds,
            preferredGenres,
            preferredArtists,
            ratings,
            trackLimit  // ИСПРАВЛЕНО: используем trackLimit из настроек
          )
          
          // generateDailyMix возвращает { playlist: { songs }, metadata }
          songs = dailyMixResult?.playlist?.songs || []
          
          console.log(`[ForYouPage] Daily Mix generated: ${songs.length} tracks`)

          // LLM только пишет комментарий (без одобрения) - используем кеш!
          const dailyComment = await getOrGenerateComment('daily-mix', songs)

          // Используем сгенерированное название из metadata
          const playlistName = dailyMixResult.metadata?.name || 'Ежедневный микс'

          console.log(`[ForYouPage] Daily Mix name: ${playlistName}`)

          // Сохраняем плейлист в store
          addPlaylist({
            id: 'daily-mix',
            type: 'daily-mix',
            name: playlistName,
            description: `${playlistName} • ${dailyMixResult.playlist.songs.length} треков`,
            songs: dailyMixResult.playlist.songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: dailyComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('daily-mix'))

          // Воспроизведение
          setSongList(dailyMixResult.playlist.songs, 0, false, undefined, playlistName)
          setIsGenerating(null)
          setLlmStatus(null)

          // Уведомление ПОСЛЕ всех операций
          trackEvent('playlist_generated', { type: 'daily-mix', songCount: songs.length })
          toast(`📅 ${playlistName}: ${songs.length} треков!`, { type: 'success' })
          return

        case 'ml-recommendations':
          const mlRecsResult = await generateWithLLM(
            () => generateMLRecommendations(likedSongIds, ratings, preferredGenres, profile.preferredArtists, trackLimit),
            {
              playlistName: 'ML Рекомендации',
              playlistType: 'ml-recommendations',
            }
          )
          songs = mlRecsResult.songs
          trackEvent('playlist_generated', { type: 'ml-recommendations', songCount: songs.length })
          toast('🤖 ML Рекомендации сгенерированы!', { type: 'success' })

          // Генерируем комментарий - используем кеш!
          const mlComment = await getOrGenerateComment('ml-recommendations', mlRecsResult.songs)

          // Сохраняем плейлист в store
          addPlaylist({
            id: 'ml-recommendations',
            type: 'ml-recommendations',
            name: 'ML Рекомендации',
            description: 'Персональные рекомендации на основе твоих вкусов',
            songs: mlRecsResult.songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: mlComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('ml-recommendations'))

          // Воспроизведение (без перехода на страницу)
          setSongList(mlRecsResult.songs, 0, false, undefined, 'ML Рекомендации')
          setIsGenerating(null)
          return

        case 'my-wave':
          // Моя волна - ML алгоритмы + Behavior Tracker + опционально LLM
          // Загружаем настройки из localStorage (как в Hero секции)
          const settingsRaw = JSON.parse(localStorage.getItem('my-wave-settings') || '{}')
          const hasSettings = settingsRaw && Object.keys(settingsRaw).length > 0
          const myWaveSettings = hasSettings ? settingsRaw : undefined
          
          console.log('[ForYouPage] My Wave settings:', myWaveSettings)
          
          // generateWithLLM сам проверит включен ли LLM/Координатор
          const myWaveResult = await generateWithLLM(
            () => generateMyWavePlaylist(likedSongIds, ratings, trackLimit, true, myWaveSettings),
            {
              playlistName: 'Моя волна',
              playlistType: 'my-wave',
            }
          )
          songs = myWaveResult.songs

          const myWaveComment = await getOrGenerateComment('my-wave', myWaveResult.songs)

          // Используем сгенерированное название если есть
          const myWaveName = (myWaveResult.songs as any).playlistName || 'Моя волна'
          const myWaveAlt = (myWaveResult.songs as any).playlistAlternatives || []

          addPlaylist({
            id: 'my-wave',
            type: 'my-wave',
            name: myWaveName,
            description: `${myWaveName} • ${myWaveResult.songs.length} треков`,
            songs: myWaveResult.songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: myWaveComment,
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('my-wave'))
          setSongList(myWaveResult.songs, 0, false, undefined, myWaveName)
          setIsGenerating(null)

          const myWaveSource = myWaveResult.source === 'llm-enhanced' ? '(LLM)' : ''
          toast(`🌊 ${myWaveName} ${myWaveSource}: ${songs.length} треков!`, { type: 'success' })
          return

        case 'time-of-day':
          // По времени суток - чистый ML алгоритм без LLM
          setLlmStatus('🌅 Генерируем микс по времени суток...')
          
          let timeResult: any = null  // ОБЪЯВЛЯЕМ ДО try
          
          try {
            console.log(`[ForYouPage] Calling generateTimeOfDayMix with limit: ${trackLimit}`)
            
            timeResult = await generateTimeOfDayMix(
              likedSongIds,
              ratings,
              preferredGenres,
              trackLimit
            )
            
            songs = timeResult?.songs || []
            
            console.log(`[ForYouPage] Time of Day Mix generated: ${songs.length} tracks`)
          } catch (error) {
            console.error('[ForYouPage] Time of Day Mix ERROR:', error)
            toast(`❌ Ошибка генерации: ${error.message}`, { type: 'error' })
            setIsGenerating(null)
            return
          }
          
          trackEvent('playlist_generated', { type: 'time-of-day', songCount: songs.length })

          // Сохраняем
          const timeComment = await getOrGenerateComment('time-of-day', songs)
          addPlaylist({
            id: 'time-of-day',
            type: 'time-of-day',
            name: timeResult?.name || 'Микс по времени суток',
            description: timeResult?.description || 'Подборка под текущее время дня',
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: timeComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('time-of-day'))

          // Воспроизведение
          setSongList(songs, 0, false, undefined, 'Микс по времени суток')
          setIsGenerating(null)
          setLlmStatus(null)
          toast(`🌅 Микс по времени суток: ${songs.length} треков!`, { type: 'success' })
          return

        case 'mood':
          // По настроению
          const moodResult = await generateWithLLM(
            () => generateMoodMix(likedSongIds, ratings, trackLimit),
            {
              playlistName: 'Микс настроени',
              playlistType: 'mood',
            }
          )
          songs = moodResult.songs

          const moodComment = await getOrGenerateComment('mood', moodResult.songs)
          addPlaylist({
            id: 'mood',
            type: 'mood',
            name: 'Микс настроени',
            description: 'Подборка под твоё настроение',
            songs: moodResult.songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: moodComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('mood'))

          // Воспроизведение
          setSongList(moodResult.songs, 0, false, undefined, 'Микс настроения')
          setIsGenerating(null)
          return

        case 'vibe-similarity':
          // Vibe Similarity - нужен seed track
          setLlmStatus('🎵 Находим треки с похожим вайбом...')
          
          // Берём случайный лайкнутый трек как seed
          const seedTrackId = likedSongIds.length > 0 
            ? likedSongIds[Math.floor(Math.random() * likedSongIds.length)]
            : null
            
          if (!seedTrackId) {
            toast('❌ Нужно больше лайкнутых треков для Vibe Similarity', { type: 'error' })
            setIsGenerating(null)
            return
          }
          
          console.log(`[ForYouPage] Vibe Similarity seed: ${seedTrackId}`)
          
          // Загружаем все треки для анализа
          const { getRandomSongs } = await import('@/service/subsonic-api')
          const allSongsForVibe = await getRandomSongs(200)
          
          const vibeResult = await generateVibeMix(seedTrackId, allSongsForVibe, trackLimit)
          songs = vibeResult.songs || []
          
          console.log(`[ForYouPage] Vibe Similarity generated: ${songs.length} tracks`)
          
          const vibeComment = await getOrGenerateComment('vibe-similarity', songs)
          addPlaylist({
            id: 'vibe-similarity',
            type: 'vibe-similarity',
            name: 'Vibe Микс',
            description: 'Треки с похожим вайбом',
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: vibeComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('vibe-similarity'))

          // Воспроизведение
          setSongList(songs, 0, false, undefined, 'Vibe Микс')
          setIsGenerating(null)
          toast(`🎶 Vibe Микс: ${songs.length} треков!`, { type: 'success' })
          return

        case 'because-you-listened':
          // Потому что слушал - чистый ML алгоритм без LLM
          setLlmStatus('🎵 Генерируем на основе прослушиваний...')
          
          const becauseResult = await generateBecauseYouListened(
            likedSongIds,
            ratings,
            preferredArtists,
            trackLimit
          )
          songs = becauseResult.songs

          // LLM только пишет комментарий (без одобрения)
          const becauseComment = await getOrGenerateComment('because-you-listened', becauseResult.songs)
          
          addPlaylist({
            id: 'because-you-listened',
            type: 'because-you-listened',
            name: 'Потому что слушал',
            description: 'На основе твоих последних прослушиваний',
            songs: becauseResult.songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: becauseComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('because-you-listened'))

          // Воспроизведение
          setSongList(becauseResult.songs, 0, false, undefined, 'Потому что слушал')
          setIsGenerating(null)
          setLlmStatus(null)
          
          trackEvent('playlist_generated', { type: 'because-you-listened', songCount: songs.length })
          toast(`🎵 Потому что слушал: ${songs.length} треков!`, { type: 'success' })
          return

        case 'activity-mix':
          // По активности
          const activityResult = await generateWithLLM(
            () => generateActivityMix('work', likedSongIds, ratings, trackLimit),
            {
              playlistName: 'Микс для занятий',
              playlistType: 'activity-mix',
              contextInfo: 'work',
            }
          )
          songs = activityResult.songs

          const activityComment = await getOrGenerateComment('activity-mix', activityResult.songs)
          addPlaylist({
            id: 'activity-mix',
            type: 'activity-mix',
            name: 'Микс для занятий',
            description: 'Музыка для продуктивной работы',
            songs: activityResult.songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: activityComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('activity-mix'))

          // Воспроизведение
          setSongList(activityResult.songs, 0)
          setIsGenerating(null)
          return

        case 'discover-weekly':
          // Открытия недели - чистый ML алгоритм без LLM
          setLlmStatus('🔍 Генерируем открытия недели...')
          
          try {
            console.log(`[ForYouPage] Calling generateDiscoverWeekly with limit: ${trackLimit}`)

            const discoverResult = await generateDiscoverWeekly(
              likedSongIds,
              preferredGenres,
              trackLimit
            )
            
            // Discover Weekly возвращает { playlist: { songs }, metadata }
            songs = discoverResult?.playlist?.songs || []
            
            console.log(`[ForYouPage] Discover Weekly generated: ${songs.length} tracks`)
          } catch (error) {
            console.error('[ForYouPage] Discover Weekly ERROR:', error)
            toast(`❌ Ошибка генерации: ${error.message}`, { type: 'error' })
            setIsGenerating(null)
            return
          }

          const discoverComment = await getOrGenerateComment('discover-weekly', songs)
          addPlaylist({
            id: 'discover-weekly',
            type: 'discover-weekly',
            name: 'Открытия недели',
            description: 'Новые треки на основе ваших предпочтений + Vibe Similarity',
            songs: songs,  // ИСПРАВЛЕНО: songs вместо discoverResult.songs
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: discoverComment,
          })

          // Обновляем state
          setGeneratedPlaylistTypes(prev => new Set(prev).add('discover-weekly'))

          // Воспроизведение
          setSongList(songs, 0, false, undefined, 'Открытия недели')  // ИСПРАВЛЕНО: songs вместо discoverResult.songs
          setIsGenerating(null)
          toast(`🔍 Открытия недели: ${songs.length} треков!`, { type: 'success' })
          return

        case 'trends':
          // ============================================
          // 1. Локальные треки с playCount за последние 30 дней
          // ============================================
          const now = new Date()
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

          const localTopTracks = Object.entries(ratings)
            .filter(([_, rating]: [string, any]) => {
              // Учитываем только треки с playCount > 0
              if (!rating.playCount || rating.playCount === 0) return false
              
              // Если есть lastPlayed - проверяем что это за последние 30 дней
              if (rating.lastPlayed) {
                const lastPlayed = new Date(rating.lastPlayed)
                return lastPlayed >= thirtyDaysAgo
              }
              
              // Если нет lastPlayed - берем все с playCount
              return true
            })
            .sort((a: [string, any], b: [string, any]) => {
              // Сортируем по playCount + лайки (бонус)
              const scoreA = a[1].playCount + (a[1].like === true ? 5 : 0)
              const scoreB = b[1].playCount + (b[1].like === true ? 5 : 0)
              return scoreB - scoreA
            })
            .slice(0, 15)
            .map(([id]) => id)

          console.log(`[Trends] 📊 Local top tracks: ${localTopTracks.length} (last 30 days)`)

          // ============================================
          // 2. Топ из Navidrome
          // ============================================
          let navidromeTopSongs: ISong[] = []
          try {
            const navidromeTop = await getTopSongs('', 20)
            navidromeTopSongs = await Promise.all(
              navidromeTop.map(song => subsonic.songs.getSong(song.id).catch(() => null))
            ).then(results => results.filter((s): s is ISong => s !== null))
            console.log(`[Trends] 🎵 Navidrome top: ${navidromeTopSongs.length} треков`)
          } catch (error) {
            console.warn('[Trends] Failed to get Navidrome top songs:', error)
          }

          // ============================================
          // 3. "Что слушают другие" - данные со всех аккаунтов
          // ============================================
          let sharedListensSongs: ISong[] = []
          const sharedTracksInfo: Record<string, { accounts: string[]; totalPlays: number }> = {}

          try {
            const { loadSharedAccounts, generateSharedPlaylist } = await import('@/service/shared-listens')
            const accounts = loadSharedAccounts()
            const enabledAccounts = accounts.filter((a: any) => a.enabled)

            if (enabledAccounts.length > 0) {
              console.log(`[Trends] 🌍 Fetching from ${enabledAccounts.length} shared accounts...`)
              
              const sharedResult = await generateSharedPlaylist(enabledAccounts, 30)
              sharedListensSongs = sharedResult.tracks.map((t: any) => t.song)
              
              // Сохраняем информацию о том, кто слушал
              sharedResult.tracks.forEach((t: any) => {
                const songId = t.song.id
                const songKey = `${t.song.artist?.toLowerCase()}-${t.song.title?.toLowerCase()}`
                
                if (!sharedTracksInfo[songId]) {
                  sharedTracksInfo[songId] = { accounts: [], totalPlays: 0, songKey }
                }
                sharedTracksInfo[songId].accounts.push(t.fromAccount)
                sharedTracksInfo[songId].totalPlays += t.playCount || 0
              })
              
              console.log(`[Trends] 🌍 Got ${sharedListensSongs.length} tracks from shared accounts`)
            } else {
              console.log('[Trends] 🌍 No shared accounts configured')
            }
          } catch (error) {
            console.warn('[Trends] Shared listens error:', error)
          }

          // ============================================
          // 4. Last.fm Global Top (если включен)
          // ============================================
          let lastFmSongs: ISong[] = []
          let lastFmSimilarTracks: ISong[] = []
          if (settings.lastFmEnabled && lastFmService.isInitialized()) {
            try {
              const lastFmTop = await lastFmService.getGlobalTopTracks(20)
              console.log(`[Trends] 🎵 Last.fm Global Top: ${lastFmTop.length} треков`)

              for (const lastFmTrack of lastFmTop) {
                if (lastFmSongs.length >= 5) break

                try {
                  const searchResponse = await httpClient<{
                    searchResult3?: {
                      song?: { song: any[] }
                    }
                  }>('search3', {
                    query: {
                      query: `${lastFmTrack.artist} ${lastFmTrack.name}`,
                      songCount: '5',
                      artistCount: '0',
                      albumCount: '0',
                    },
                  })

                  const foundSongs = searchResponse?.data?.searchResult3?.song?.song || []
                  if (foundSongs.length > 0) {
                    const matchedSong = foundSongs.find(s =>
                      s.title.toLowerCase().includes(lastFmTrack.name.toLowerCase()) ||
                      lastFmTrack.name.toLowerCase().includes(s.title.toLowerCase())
                    )

                    if (matchedSong && !navidromeTopSongs.find(s => s.id === matchedSong.id)) {
                      const songDetails = await subsonic.songs.getSong(matchedSong.id).catch(() => null)
                      if (songDetails && !lastFmSongs.find(s => s.id === songDetails.id)) {
                        lastFmSongs.push(songDetails)
                        console.log(`[Trends] ✓ Found: "${lastFmTrack.artist} - ${lastFmTrack.name}"`)
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[Trends] Search error:`, error)
                }
              }
            } catch (error) {
              console.warn('[Trends] Last.fm error:', error)
            }
          }

          // ============================================
          // 5. Комбинируем все источники с приоритетами
          // ============================================
          const allSongIds: string[] = []
          const usedIds = new Set<string>()

          // ПРИОРИТЕТ 1: Локальные топы (40%)
          for (const id of localTopTracks) {
            if (!usedIds.has(id) && allSongIds.length < 25) {
              allSongIds.push(id)
              usedIds.add(id)
            }
          }

          // ПРИОРИТЕТ 2: Shared listens (30%)
          for (const song of sharedListensSongs) {
            if (!usedIds.has(song.id) && allSongIds.length < 25) {
              allSongIds.push(song.id)
              usedIds.add(song.id)
            }
          }

          // ПРИОРИТЕТ 3: Navidrome топ (20%)
          for (const song of navidromeTopSongs) {
            if (!usedIds.has(song.id) && allSongIds.length < 25) {
              allSongIds.push(song.id)
              usedIds.add(song.id)
            }
          }

          // ПРИОРИТЕТ 4: Last.fm (10%)
          for (const song of [...lastFmSongs, ...lastFmSimilarTracks]) {
            if (!usedIds.has(song.id) && allSongIds.length < 25) {
              allSongIds.push(song.id)
              usedIds.add(song.id)
            }
          }

          if (allSongIds.length === 0) {
            toast('Пока нет прослушанных треков', { type: 'info' })
            setIsGenerating(null)
            return
          }

          const trendSongs = await Promise.all(
            allSongIds.map(id => subsonic.songs.getSong(id).catch(() => null))
          )
          songs = trendSongs.filter((s): s is ISong => s !== null)

          console.log(`[Trends] ✅ Generated: ${songs.length} tracks`)
          console.log(`[Trends] 📊 Sources: ${localTopTracks.length} local, ${sharedListensSongs.length} shared, ${navidromeTopSongs.length} navidrome, ${lastFmSongs.length} lastfm`)

          // Генерируем описание с информацией о том, кто слушал
          const sharedDescriptions: string[] = []
          let totalSharedPlays = 0
          
          songs.forEach(song => {
            const info = sharedTracksInfo[song.id]
            if (info && info.accounts.length > 0) {
              const uniqueAccounts = [...new Set(info.accounts)]
              totalSharedPlays += info.totalPlays || 0
              sharedDescriptions.push(`${song.artist} - ${song.title}: ${uniqueAccounts.join(', ')} (${info.totalPlays} раз)`)
            }
          })

          const trendsDescription = sharedDescriptions.length > 0
            ? `🌍 Популярное из ${Object.keys(sharedTracksInfo).length} треков shared аккаунтов • Всего прослушиваний: ${totalSharedPlays}`
            : 'Популярные треки за последние 30 дней'

          console.log(`[Trends] 📊 Shared tracks info: ${sharedDescriptions.length} tracks with listen info`)
          console.log(`[Trends] 📊 Total shared plays: ${totalSharedPlays}`)

          toast(`🔥 Популярное: ${songs.length} треков!`, { type: 'success' })

          // СОХРАНЯЕМ В STORE
          const trendsComment = await getOrGenerateComment('trends', songs)
          addPlaylist({
            id: 'trends',
            type: 'trends',
            name: 'Популярное',
            description: trendsDescription,
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: trendsComment,
            sharedTracksInfo: sharedTracksInfo,  // Сохраняем информацию о shared listens
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('trends'))
          setSongList(songs, 0, false, sharedTracksInfo, 'Популярное')  // Передаем sharedTracksInfo и название плейлиста
          setIsGenerating(null)
          return

        case 'new-releases':
          // Получаем случайные треки (имитация новинок)
          const newReleasesSongs = await getRandomSongs(30)
          songs = newReleasesSongs
          toast('▶️ Запущено: Новинки', { type: 'success' })

          // СОХРАНЯЕМ В STORE
          const newReleasesComment = await getOrGenerateComment('new-releases', songs)
          addPlaylist({
            id: 'new-releases',
            type: 'new-releases',
            name: 'Новинки',
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: newReleasesComment,
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('new-releases'))
          setSongList(songs, 0)
          setIsGenerating(null)
          return

        case 'new-releases-subscriptions':
          // Новинки подписок - чистый ML алгоритм
          setLlmStatus('🎵 Ищем новинки подписок...')

          const newReleasesSubResult = await generateNewReleasesPlaylistV2(
            30,
            preferredGenres,
            preferredArtists
          )
          songs = newReleasesSubResult.songs

          if (songs.length === 0) {
            toast('Подпишитесь на артистов чтобы видеть новинки', { type: 'info' })
            setIsGenerating(null)
            setLlmStatus(null)
            return
          }

          // Для карточки - стандартный комментарий (шаблонный)
          const genres = [...new Set(songs.map(s => s.genre).filter(Boolean))]
          const standardComments = [
            `💿 Свежие релизы ${genres.slice(0, 2).join(' и ') || 'новинок'}`,
            `🎵 Новинки от подписанных артистов`,
            `🔥 Свежие треки из последних релизов`,
            `💿 Новые релизы — ${songs.length} треков`,
          ]
          const newReleasesSubComment = standardComments[Math.floor(Math.random() * standardComments.length)]

          addPlaylist({
            id: 'new-releases-subscriptions',
            type: 'new-releases-subscriptions',
            name: 'Новинки подписок',
            description: 'Новые релизы подписанных артистов',
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: newReleasesSubComment,
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('new-releases-subscriptions'))
          setSongList(songs, 0)
          setIsGenerating(null)
          setLlmStatus(null)

          trackEvent('playlist_generated', { type: 'new-releases-subscriptions', songCount: songs.length })
          toast(`💿 Новинки подписок: ${songs.length} треков!`, { type: 'success' })
          return

        case 'similar-artists':
          // Генерируем на основе случайного артиста из лайкнутых
          const likedArtists = Object.keys(profile.preferredArtists)
          if (likedArtists.length === 0) {
            toast('Сначала выберите артистов в холодном старте', { type: 'warning' })
            setIsGenerating(null)
            return
          }
          const randomArtistId = likedArtists[Math.floor(Math.random() * likedArtists.length)]
          const similarPlaylist = await generateSimilarArtistsPlaylistV2(randomArtistId, 25, preferredArtists)
          songs = similarPlaylist.songs
          trackEvent('radio_started', { type: 'similar-artists', artistId: randomArtistId, songCount: songs.length })
          toast('🎵 Похожих исполнителей сгенерировано!', { type: 'success' })

          // СОХРАНЯЕМ В STORE
          const similarComment = await getOrGenerateComment('similar-artists', songs)
          addPlaylist({
            id: 'similar-artists',
            type: 'similar-artists',
            name: 'Похожие исполнители',
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: similarComment,
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('similar-artists'))
          setSongList(songs, 0)
          setIsGenerating(null)
          return

        case 'decade':
          if (!playlist.decade) {
            setIsGenerating(null)
            return
          }
          const decadePlaylist = await generateDecadePlaylistV2(playlist.decade, 30)
          songs = decadePlaylist.songs
          toast(`📻 Хиты ${playlist.title} сгенерированы!`, { type: 'success' })

          // СОХРАНЯЕМ В STORE
          const decadeComment = await getOrGenerateComment('decade', songs)
          addPlaylist({
            id: `decade-${playlist.decade}`,
            type: 'decade',
            name: `Хиты ${playlist.decade}`,
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: decadeComment,
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('decade'))
          setSongList(songs, 0)
          setIsGenerating(null)
          return

        case 'genre':
          if (!playlist.genre) {
            setIsGenerating(null)
            return
          }
          const genrePlaylist = await generateGenrePlaylist(playlist.genre, 30)
          songs = genrePlaylist.songs
          toast(`🎵 ${playlist.title} сгенерировано!`, { type: 'success' })

          // СОХРАНЯЕМ В STORE
          const genreComment = await getOrGenerateComment('genre', songs)
          addPlaylist({
            id: `genre-${playlist.genre}`,
            type: 'genre',
            name: playlist.title,
            songs: songs,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            llmComment: genreComment,
          })

          setGeneratedPlaylistTypes(prev => new Set(prev).add('genre'))
          setSongList(songs, 0)
          setIsGenerating(null)
          return

        case 'ai-generated':
          // AI плейлисты - генерируем через LLM с названием и комментарием
          setIsGenerating(playlist.id)
          try {
            const { useMLPlaylistsStore } = await import('@/store/ml-playlists.store')
            const mlSettings = useMLPlaylistsStore.getState().settings

            // Проверяем что LLM включен
            if (!settings.llmEnabled || !mlSettings.settings?.llmCoordinatorEnabled) {
              toast('⚠️ Включите LLM Координатор для AI плейлистов', { type: 'warning' })
              setIsGenerating(null)
              return
            }

            setLlmStatus('🤖 LLM генерирует плейлист...')

            // Маппинг ID плейлиста к времени суток
            const timeMap: Record<string, string> = {
              'ai-morning': 'утро',
              'ai-day': 'день',
              'ai-evening': 'вечер',
            }
            const timeOfDay = timeMap[playlist.id] || 'день'

            // Шаг 1: LLM генерирует название, описание и жанры
            setLlmStatus('🤖 LLM придумывает плейлист...')
            const profile = getProfile()
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
3. Какие 3-5 жанров лучше всего подойдут?
4. Какие 3-5 артистов добавить?
5. Энергия (0.0-1.0 min-max)?

Ответь ТОЛЬКО JSON:
{"name": "Название", "description": "Описание", "genres": ["genre1", "genre2"], "artists": ["Artist1"], "energyMin": 0.6, "energyMax": 0.9}`

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
              throw new Error(`LLM error: ${response.status}`)
            }

            const result = await response.json()
            const content = result.choices?.[0]?.message?.content?.trim() || ''
            const firstBrace = content.indexOf('{')
            const lastBrace = content.lastIndexOf('}')

            if (firstBrace === -1 || lastBrace === -1) {
              throw new Error('Invalid JSON response from LLM')
            }

            const jsonStr = content.substring(firstBrace, lastBrace + 1)
            const llmPlan = JSON.parse(jsonStr)

            console.log('[AI Playlist] LLM plan:', llmPlan)
            setLlmStatus(`🎵 LLM создал: ${llmPlan.name}`)

            // Шаг 2: Генерируем плейлист на основе LLM рекомендаций
            const { getRandomSongs, getTopSongs } = await import('@/service/subsonic-api')

            let allSongs: ISong[] = []

            // Собираем треки по жанрам из LLM рекомендаций
            if (llmPlan.genres && llmPlan.genres.length > 0) {
              for (const genre of llmPlan.genres.slice(0, 3)) {
                try {
                  const songsByGenre = await getTopSongs('', Math.floor(trackLimit / llmPlan.genres.length))
                  const genreFiltered = songsByGenre.filter(s => 
                    s.genre?.toLowerCase() === genre.toLowerCase()
                  )
                  allSongs.push(...genreFiltered.slice(0, Math.floor(trackLimit / llmPlan.genres.length)))
                } catch (e) {
                  console.warn(`[AI Playlist] Failed to get songs for genre ${genre}:`, e)
                }
              }
            }

            // Добавляем треки рекомендованных артистов
            if (llmPlan.artists && llmPlan.artists.length > 0) {
              for (const artist of llmPlan.artists.slice(0, 2)) {
                try {
                  const artistSongs = await getTopSongs(artist, 3)
                  allSongs.push(...artistSongs.slice(0, 3))
                } catch (e) {
                  console.warn(`[AI Playlist] Failed to get songs for artist ${artist}:`, e)
                }
              }
            }

            // Если мало треков - добавляем случайные
            if (allSongs.length < trackLimit) {
              const randomSongs = await getRandomSongs(trackLimit - allSongs.length)
              allSongs.push(...randomSongs)
            }

            // Убираем дубликаты и ограничиваем
            const uniqueSongs = allSongs.filter((song, index, self) =>
              index === self.findIndex(s => s.id === song.id)
            ).slice(0, trackLimit)

            if (uniqueSongs.length === 0) {
              throw new Error('No songs generated')
            }

            console.log(`[AI Playlist] Generated ${uniqueSongs.length} tracks`)

            // Шаг 3: Генерируем комментарий через LLM (с кешем)
            const comment = await getOrGenerateComment(playlist.id, uniqueSongs)

            // Сохраняем плейлист
            addPlaylist({
              id: playlist.id,
              type: 'ai-generated',
              name: llmPlan.name || `${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} Микс`,
              description: llmPlan.description || `AI плейлист для времени суток: ${timeOfDay}`,
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

            setGeneratedPlaylistTypes(prev => new Set(prev).add(playlist.id))
            setSongList(uniqueSongs, 0, false, undefined, llmPlan.name)
            setIsGenerating(null)
            setLlmStatus(null)

            toast(`🤖 ${llmPlan.name}: ${uniqueSongs.length} треков!`, { type: 'success' })
          } catch (error) {
            console.error('AI Playlist generation error:', error)
            toast('Ошибка генерации AI плейлиста', { type: 'error' })
            setIsGenerating(null)
            setLlmStatus(null)
          }
          return

        default:
          toast('Этот плейлист ещё не готов', { type: 'info' })
          setIsGenerating(null)
          return
      }

      if (songs && songs.length > 0) {
        setSongList(songs, 0)
        toast(`▶️ Запущено: ${playlist.title}`, { type: 'success' })
      } else {
        toast('Не удалось сгенерировать плейлист', { type: 'error' })
      }
    } catch (error) {
      console.error('Ошибка генерации плейлиста:', error)
      toast('Ошибка при генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  const playlistsByTab: Record<string, MLPlaylistCard[]> = {
    'for-you': [
      {
        id: 'time-of-day',
        title: '🕐 Микс по времени суток',
        description: 'Подборка под текущее время дня',
        icon: '🕐',
        color: 'from-blue-400 via-purple-400 to-pink-400',
        type: 'time-of-day'
      },
      {
        id: 'instant-mix',
        title: '⚡ Instant Mix',
        description: 'Микс на основе трека, артиста или жанра',
        icon: '🎯',
        color: 'from-purple-600 to-pink-600',
        type: 'instant-mix'
      },
      {
        id: 'ml-recommendations',
        title: 'ML Рекомендации',
        description: 'Попытка угадать что вам понравится',
        icon: '🤖',
        color: 'from-indigo-500 to-purple-600',
        type: 'ml-recommendations'
      },
      { 
        id: 'my-wave', 
        title: 'Моя волна', 
        description: 'Персональный плейлист на основе ваших предпочтений', 
        icon: '🌊', 
        color: 'from-yellow-400 via-orange-400 to-pink-500',
        type: 'my-wave'
      },
      { 
        id: 'daily-mix-1', 
        title: 'Ежедневный микс', 
        description: 'Обновляется каждые 24 часа', 
        icon: '✨', 
        color: 'from-purple-500 to-pink-500',
        type: 'daily-mix'
      },
      {
        id: 'discover-weekly',
        title: 'Открытия недели',
        description: 'Новые треки для вас каждую неделю',
        icon: '🧭',
        color: 'from-green-500 to-emerald-500',
        type: 'discover-weekly'
      },
      {
        id: 'because-you-listened',
        title: '🎵 Потому что вы слушали...',
        description: 'На основе ваших любимых артистов',
        icon: '💕',
        color: 'from-pink-400 to-rose-500',
        type: 'because-you-listened'
      },
      {
        id: 'vibe-similarity',
        title: '🎵 Vibe Similarity',
        description: 'Похожие треки по аудио-признакам',
        icon: '🎵',
        color: 'from-indigo-500 to-purple-600',
        type: 'vibe-similarity'
      },
      {
        id: 'new-releases-subscriptions',
        title: '🎵 Новинки подписок',
        description: 'Новые треки от подписанных артистов',
        icon: '🆕',
        color: 'from-green-500 via-emerald-500 to-teal-500',
        type: 'new-releases-subscriptions'
      },
      {
        id: 'song-alchemy',
        title: '🧪 Песенная Алхимия',
        description: 'Создайте плейлист по параметрам настроения',
        icon: '✨',
        color: 'from-purple-600 to-pink-600',
        type: 'song-alchemy'
      },
      {
        id: 'disliked',
        title: 'Дизлайки',
        description: 'Треки которые вам не понравились',
        icon: '👎',
        color: 'from-gray-600 to-gray-800',
        type: 'disliked'
      },
      // TODO: AI Плейлисты - временно отключены
      /*
      {
        id: 'ai-morning',
        title: '🤖 AI Плейлист 1',
        description: 'Автоматически создан ИИ',
        icon: '🤖',
        color: 'from-orange-400 to-yellow-500',
        type: 'ai-generated'
      },
      {
        id: 'ai-day',
        title: '🤖 AI Плейлист 2',
        description: 'Автоматически создан ИИ',
        icon: '🤖',
        color: 'from-yellow-400 to-amber-500',
        type: 'ai-generated'
      },
      {
        id: 'ai-evening',
        title: '🤖 AI Плейлист 3',
        description: 'Автоматически создан ИИ',
        icon: '🤖',
        color: 'from-purple-500 to-pink-600',
        type: 'ai-generated'
      },
      */
    ],
    'trends': [
      {
        id: 'shared-listens',
        title: '👥 Слушают другие',
        description: 'Плейлисты на основе того, что слушают другие пользователи',
        icon: '🌐',
        color: 'from-cyan-500 to-blue-500',
        type: 'shared-listens'
      },
      {
        id: 'top-tracks',
        title: 'Популярное',
        description: 'Чаще всего слушают в вашей библиотеке',
        icon: '📈',
        color: 'from-red-500 to-orange-500',
        type: 'trends'
      },
    ],
    'discover': [
      {
        id: 'new-releases',
        title: 'Новинки',
        description: 'Свежие релизы любимых жанров',
        icon: '🆕',
        color: 'from-indigo-500 to-purple-500',
        type: 'new-releases'
      },
      {
        id: 'similar-artists',
        title: 'Похожие исполнители',
        description: 'Откройте новое на основе ваших лайков',
        icon: '🎵',
        color: 'from-pink-500 to-rose-500',
        type: 'similar-artists'
      },
      // Десятилетия
      {
        id: '80s',
        title: '80-е',
        description: 'Хиты 1980-1989',
        icon: '📼',
        color: 'from-pink-500 to-purple-600',
        type: 'decade',
        decade: '80s'
      },
      {
        id: '90s',
        title: '90-е',
        description: 'Хиты 1990-1999',
        icon: '📀',
        color: 'from-blue-500 to-cyan-600',
        type: 'decade',
        decade: '90s'
      },
      {
        id: '2000s',
        title: '2000-е',
        description: 'Хиты 2000-2009',
        icon: '💿',
        color: 'from-green-500 to-emerald-600',
        type: 'decade',
        decade: '2000s'
      },
      {
        id: '2010s',
        title: '2010-е',
        description: 'Хиты 2010-2019',
        icon: '🎧',
        color: 'from-yellow-500 to-orange-600',
        type: 'decade',
        decade: '2010s'
      },
      {
        id: '2020s',
        title: '2020-е',
        description: 'Хиты 2020-2029',
        icon: '🎵',
        color: 'from-red-500 to-pink-600',
        type: 'decade',
        decade: '2020s'
      },
    ],
  }

  const currentPlaylists = playlistsByTab[activeTab]

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {activeTab === 'for-you' && '✨ Для вас'}
          {activeTab === 'trends' && '📈 Тренды'}
          {activeTab === 'discover' && '🧭 Открытия'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeTab === 'for-you' && 'Персональные рекомендации на основе ваших предпочтений'}
          {activeTab === 'trends' && 'Популярное в вашей библиотеке'}
          {activeTab === 'discover' && 'Новые треки, исполнители и хиты десятилетий'}
        </p>
      </div>

      {/* TODO: AI Кнопка генерации - временно отключена */}
      {/* 
      {activeTab === 'discover' && (
        <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          ...кнопка...
        </div>
      )}
      */}

      {/* Вкладки */}
      <div className="flex gap-2 border-b border-border">
        <button
          className={`px-4 py-2 font-medium transition-colors rounded-t-lg ${
            activeTab === 'for-you' ? 'text-primary border-b-2 border-primary bg-muted' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('for-you')}
        >
          Для вас
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors rounded-t-lg ${
            activeTab === 'trends' ? 'text-primary border-b-2 border-primary bg-muted' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('trends')}
        >
          Тренды
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors rounded-t-lg ${
            activeTab === 'discover' ? 'text-primary border-b-2 border-primary bg-muted' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('discover')}
        >
          Открытия
        </button>
      </div>

      {/* Сетка плейлистов */}
      {/* {llmStatus && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg text-center text-sm animate-pulse">
          {llmStatus}
        </div>
      )} */}
      <div className={styles.grid}>
        {currentPlaylists.map((playlist) => {
          // Генерируем градиент для каждой карточки
          let cardGradient = playlist.color || 'from-gray-600 to-gray-800'

          // Для AI плейлистов и стандартных ML плейлистов - проверяем есть ли сохраненный плейлист и берем его имя
          let displayPlaylist = playlist
          if (playlist.type === 'ai-generated') {
            const savedAIPlaylist = getPlaylist(playlist.id)
            if (savedAIPlaylist && savedAIPlaylist.songs.length > 0) {
              displayPlaylist = {
                ...playlist,
                title: `🤖 ${savedAIPlaylist.name}`,
                description: savedAIPlaylist.description || 'Автоматически создан ИИ',
              }
            }
          } else {
            // Проверяем есть ли сохраненный ML плейлист с сгенерированным названием
            const savedMLPlaylist = getPlaylist(playlist.type)
            if (savedMLPlaylist && savedMLPlaylist.name && savedMLPlaylist.name !== playlist.title) {
              displayPlaylist = {
                ...playlist,
                title: savedMLPlaylist.name,
                description: savedMLPlaylist.description || playlist.description,
              }
            }
          }

          // Для жанров используем точные цвета из genreColors
          if (playlist.type === 'genre' && playlist.genre) {
            const genreColor = getGenreColor(playlist.genre)
            return (
              <div
                key={playlist.id}
                className={`${styles.card} ${styles.animatedGradient} ${isGenerating === playlist.id ? 'opacity-75' : ''}`}
                style={{
                  background: `linear-gradient(-45deg, ${genreColor}, ${genreColor}DD, ${genreColor}BB, ${genreColor})`,
                  backgroundSize: '400% 400%',
                }}
                onClick={() => navigate(`/ml/playlist/${playlist.type}`)}
              >
                <div className={styles.content}>
                  <span className={styles.icon}>{playlist.icon}</span>
                  <h3 className={styles.title}>{displayPlaylist.title}</h3>
                  <p className={styles.description}>{displayPlaylist.description}</p>
                  {isGenerating === playlist.id && (
                    <span className={styles.generating}>⏳ Генерация...</span>
                  )}
                </div>
                <button
                  className={styles.playButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlayPlaylist(playlist)
                  }}
                  disabled={isGenerating !== null}
                >
                  {isGenerating === playlist.id
                    ? '⏳'
                    : generatedPlaylistTypes.has(playlist.type)
                      ? '⟳'  // Уже сгенерирован - перегенерация
                      : '▶'  // Не сгенерирован - play
                  }
                </button>
              </div>
            )
          }

          return (
            <div
              key={playlist.id}
              className={`${styles.card} bg-gradient-to-br ${cardGradient} ${styles.animatedGradient} ${isGenerating === playlist.id ? 'opacity-75' : ''}`}
              onClick={() => {
                // AI плейлисты - сразу воспроизведение
                if (playlist.type === 'ai-generated') {
                  handlePlayPlaylist(playlist)
                } else {
                  navigate(`/ml/playlist/${playlist.type}`)
                }
              }}
            >
              <div className={styles.content}>
                <span className={styles.icon}>{playlist.icon}</span>
                <h3 className={styles.title}>{displayPlaylist.title}</h3>
                {isGenerating === playlist.id && (
                  <span className={styles.generating}>⏳ Генерация...</span>
                )}
                {!isGenerating && (
                  <>
                    {/* Для AI плейлистов - комментарий по ID */}
                    {playlist.type === 'ai-generated' && (() => {
                      const savedPlaylist = getPlaylist(playlist.id)
                      return savedPlaylist?.llmComment ? (
                        <p className={styles.llmComment} style={{
                          fontSize: '13px',
                          opacity: 0.85,
                          fontStyle: 'italic',
                          lineHeight: '1.4',
                          minHeight: '36px'
                        }}>
                          {savedPlaylist.llmComment}
                        </p>
                      ) : (
                        <p className={styles.description}>{displayPlaylist.description}</p>
                      )
                    })()}

                    {/* Для остальных - комментарий по типу */}
                    {playlist.type !== 'ai-generated' && getPlaylistComment(playlist.type) ? (
                      <p className={styles.llmComment} style={{
                        fontSize: '13px',
                        opacity: 0.85,
                        fontStyle: 'italic',
                        lineHeight: '1.4',
                        minHeight: '36px'
                      }}>
                        {getPlaylistComment(playlist.type)}
                      </p>
                    ) : playlist.type !== 'ai-generated' && (
                      <p className={styles.description}>{displayPlaylist.description}</p>
                    )}

                    {getPlaylistLastUpdated(playlist.type) && (
                      <p className={styles.lastUpdated} style={{ fontSize: '12px', opacity: 0.7, marginTop: '6px' }}>
                        Обновлено: {getPlaylistLastUpdated(playlist.type)}
                      </p>
                    )}
                  </>
                )}
              </div>
              <button
                className={styles.playButton}
                onClick={(e) => {
                  e.stopPropagation()
                  handlePlayPlaylist(playlist)
                }}
                disabled={isGenerating !== null}
              >
                {isGenerating === playlist.id
                  ? '⏳'
                  : generatedPlaylistTypes.has(playlist.type)
                    ? '⟳'  // Уже сгенерирован - перегенерация
                    : '▶'  // Не сгенерирован - play
                }
              </button>
            </div>
          )
        })}
      </div>

      {/* Mood Mixer - Сетка настроений */}
      {activeTab === 'for-you' && (
        <Card className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <span className="text-2xl">🎭</span>
              Миксы по настроению
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Выберите настроение и получите персональный плейлист
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-3">
              {moodMixers.map((mood) => (
                <button
                  key={mood.id}
                  onClick={() => handleMoodClick(mood.id)}
                  disabled={isGenerating !== null}
                  className={`
                    relative overflow-hidden rounded-lg p-4 text-center
                    bg-gradient-to-br ${mood.color}
                    hover:scale-105 transition-transform duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg hover:shadow-xl
                    backdrop-blur-md
                    border border-white/30
                    before:absolute before:inset-0 before:bg-white/10 before:backdrop-blur-md before:pointer-events-none
                  `}
                >
                  <div className="relative z-10">
                    <div className="text-3xl mb-2">{mood.icon}</div>
                    <div className="text-sm font-medium text-white drop-shadow-lg">{mood.name}</div>
                  </div>
                  {isGenerating === mood.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <span className="text-white">⏳</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Mixer - Миксы для занятий */}
      {activeTab === 'for-you' && (
        <Card className="bg-gradient-to-br from-emerald-900/50 to-teal-900/50 border-emerald-500/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <span className="text-2xl">🏃</span>
              Миксы для занятий
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              12 плейлистов для разных активностей (BPM и energy оптимизированы)
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {activityMixers.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => handleActivityClick(activity.id)}
                  disabled={isGenerating !== null}
                  className={`
                    relative overflow-hidden rounded-lg p-3 text-center
                    bg-gradient-to-br ${activity.color}
                    hover:scale-105 transition-transform duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg hover:shadow-xl
                    backdrop-blur-md
                    border border-white/30
                    before:absolute before:inset-0 before:bg-white/10 before:backdrop-blur-md before:pointer-events-none
                  `}
                >
                  <div className="relative z-10">
                    <div className="text-2xl mb-1">{activity.icon}</div>
                    <div className="text-xs font-medium text-white drop-shadow-lg">{activity.name}</div>
                  </div>
                  {isGenerating === activity.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <span className="text-white">⏳</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Модальное окно Instant Mix */}
      <InstantMixModal open={isInstantMixOpen} onClose={() => setIsInstantMixOpen(false)} />

      {/* Модальное окно Song Alchemy */}
      <SongAlchemyModal open={isAlchemyOpen} onClose={() => setIsAlchemyOpen(false)} />
    </div>
  )
}
