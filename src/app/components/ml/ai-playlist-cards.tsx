import { useState } from 'react'
import { Sparkles, Clock, Loader2, Music, TrendingUp, Heart, Shuffle, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Textarea } from '@/app/components/ui/textarea'
import { Progress } from '@/app/components/ui/progress'
import { toast } from 'react-toastify'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { generateMyWavePlaylist, generateMLRecommendations } from '@/service/ml-wave-service'
import { generateDJPlaylist, getLibraryMetadata } from '@/service/ai-playlist-dj'
import { llmService } from '@/service/llm-service'
import { useExternalApiStore } from '@/store/external-api.store'
import { buildExplanationPrompt, buildPlaylistGenerationPrompt } from '@/service/llm-prompts'

interface GeneratedPlaylist {
  id: string
  title: string
  description: string
  icon: string
  gradient: string
  songs: any[]
  type: 'ai-custom' | 'ai-time' | 'ai-vibe' | 'ai-discover'
  llmUsed?: boolean
}

export function AIPlaylistCards() {
  const [generating, setGenerating] = useState<string | null>(null)
  const [generatedPlaylists, setGeneratedPlaylists] = useState<GeneratedPlaylist[]>([])
  const [customDescription, setCustomDescription] = useState('')
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const { profile, ratings } = useML()
  const { setSongList } = usePlayerActions()
  const { addPlaylist } = useMLPlaylistsStateActions()
  const settings = useExternalApiStore(state => state.settings)

  const generateTimeMix = async () => {
    setGenerating('time')
    try {
      const hour = new Date().getHours()
      const timeOfDay = hour >= 6 && hour < 12 ? 'Утро' 
        : hour >= 12 && hour < 18 ? 'День'
        : hour >= 18 && hour < 23 ? 'Вечер'
        : 'Ночь'
      
      toast.info(`⏰ Генерация плейлиста для времени: ${timeOfDay}`)
      
      // Обычный ML (не LLM) - быстро
      const likedSongIds = profile.likedSongs || []
      const result = await generateMyWavePlaylist(likedSongIds, ratings, 25, true)
      
      const playlist: GeneratedPlaylist = {
        id: `ai-time-${Date.now()}`,
        title: `${timeOfDay} микс`,
        description: `Подборка треков для ${timeOfDay.toLowerCase()} на основе твоих предпочтений`,
        icon: hour >= 6 && hour < 12 ? '☀️' : hour >= 12 && hour < 18 ? '🌤️' : hour >= 18 && hour < 23 ? '🌆' : '🌙',
        gradient: hour >= 6 && hour < 12 ? 'from-orange-400 to-yellow-500' 
          : hour >= 12 && hour < 18 ? 'from-blue-400 to-cyan-500'
          : hour >= 18 && hour < 23 ? 'from-purple-400 to-pink-500'
          : 'from-indigo-400 to-blue-500',
        songs: result.songs,
        type: 'ai-time',
        llmUsed: false,
      }
      
      addPlaylist({
        id: playlist.id,
        type: 'my-wave',
        name: playlist.title,
        description: playlist.description,
        songs: playlist.songs,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })
      
      setGeneratedPlaylists([playlist])
      setSongList(playlist.songs, 0)
      toast.success(`🌅 ${playlist.title} готов!`)
    } catch (error) {
      toast.error('Ошибка генерации Время Микс')
    } finally {
      setGenerating(null)
    }
  }

  const generateAIVibe = async () => {
    setGenerating('vibe')
    setProgress(0)
    setProgressMessage('Инициализация...')
    
    try {
      if (!settings.llmEnabled) {
        toast.error('LLM отключен. Включите в настройках.')
        setGenerating(null)
        return
      }

      setProgressMessage('🧠 AI анализирует твои вкусы...')
      console.log('[AI Playlist] Starting LLM analysis...')
      
      // Инициализируем LLM
      llmService.initialize({
        enabled: settings.llmEnabled,
        provider: settings.llmProvider,
        lmStudioUrl: settings.llmLmStudioUrl,
        llmModel: settings.llmModel || 'qwen/qwen3-4b-2507',  // Модель по умолчанию
        llmApiKey: settings.llmApiKey,
        qwenApiKey: settings.llmQwenApiKey,
        qwenModel: settings.llmQwenModel,
        ollamaUrl: settings.llmOllamaUrl,
        ollamaModel: settings.llmOllamaModel,
        allowMLAccess: settings.llmAllowMLAccess,
        allowOrchestratorAccess: settings.llmAllowOrchestratorAccess,
        allowPlaylistAccess: settings.llmAllowPlaylistAccess,
        allowPlayerAccess: settings.llmAllowPlayerAccess,
        customSystemPrompt: settings.llmCustomPrompt,
      })

      setProgress(10)
      setProgressMessage('📊 Анализ предпочтений...')
      
      // Получаем данные из ML
      const likedSongIds = profile.likedSongs || []
      const preferredGenres = profile.preferredGenres
      const preferredArtists = profile.preferredArtists
      const bannedArtists = profile.bannedArtists || []
      
      // Получаем топ жанры и артисты
      const topGenres = Object.entries(preferredGenres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g, w]) => `${g} (${w})`)
        .join(', ')

      const topArtists = Object.entries(preferredArtists)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id)
        .join(', ')

      setProgress(20)
      setProgressMessage('🤝 Запрос к LLM...')
      
      const context = {
        hasMLAccess: settings.llmAllowMLAccess,
        hasOrchestratorAccess: settings.llmAllowOrchestratorAccess,
        hasPlaylistAccess: settings.llmAllowPlaylistAccess,
        hasPlayerAccess: settings.llmAllowPlayerAccess,
        mlProfile: settings.llmAllowMLAccess ? {
          preferredGenres,
          preferredArtists,
          bannedArtists,
        } : undefined,
        listeningHistory: {
          totalPlays: Object.values(ratings).reduce((sum, r) => sum + (r.playCount || 0), 0),
          skipRate: 0,
          replayRate: 0,
        },
      }
      
      const prompt = buildPlaylistGenerationPrompt(
        `Создай плейлист на основе любимых жанров: ${topGenres || 'всех жанров'}. Учти предпочтения артистов.`,
        25,
        context
      )
      
      console.log('[AI Playlist] Prompt to LLM:', prompt.substring(0, 500))
      setProgress(30)
      setProgressMessage('⏳ LLM генерирует плейлист... (это займёт 10-30 сек)')
      
      // ВЫЗОВ LLM ДЛЯ ГЕНЕРАЦИИ ПЛЕЙЛИСТА
      const llmResponse = await llmService.generateExplanation(
        {
          id: 'temp',
          title: 'Playlist Generation',
          artist: 'AI',
          genre: 'mixed',
        },
        profile,
        ratings
      )
      
      setProgress(60)
      setProgressMessage('🎵 Обработка ответа LLM...')
      
      console.log('[AI Playlist] LLM response:', llmResponse)
      
      // Генерируем плейлист через ML (так как LLM не может вернуть конкретные ID треков)
      setProgress(70)
      setProgressMessage('🔍 Подбор треков по рекомендациям LLM...')
      
      const result = await generateMLRecommendations(
        likedSongIds,
        ratings,
        preferredGenres,
        preferredArtists,
        25
      )

      setProgress(90)
      setProgressMessage('✨ Финализация...')

      const playlist: GeneratedPlaylist = {
        id: `ai-vibe-${Date.now()}`,
        title: 'AI Вайб Микс',
        description: llmResponse?.text || `AI проанализировал твои предпочтения: ${topGenres || 'разнообразные жанры'}`,
        icon: '🎵',
        gradient: 'from-pink-500 via-red-500 to-yellow-500',
        songs: result.songs,
        type: 'ai-vibe',
        llmUsed: true,
      }
      
      console.log('[AI Playlist] Playlist generated:', playlist)
      
      addPlaylist({
        id: playlist.id,
        type: 'ml-recommendations',
        name: playlist.title,
        description: playlist.description,
        songs: playlist.songs,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })
      
      setProgress(100)
      setGeneratedPlaylists(prev => [playlist, ...prev])
      setSongList(playlist.songs, 0)
      toast.success('🎵 AI Вайб Микс готов!')
      
      setTimeout(() => {
        setProgress(0)
        setProgressMessage('')
      }, 1000)
    } catch (error) {
      console.error('[AI Playlist] Error:', error)
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
      setProgress(0)
      setProgressMessage('')
    } finally {
      setGenerating(null)
    }
  }

  const generateAICustom = async () => {
    if (!customDescription.trim()) {
      toast.error('Введи описание плейлиста')
      return
    }

    if (!settings.llmEnabled) {
      toast.error('LLM отключен. Включите в настройках.')
      return
    }

    setShowCustomModal(false)
    setGenerating('custom')
    setProgress(0)
    setProgressMessage('📚 Загрузка библиотеки...')
    
    try {
      // 1. Загружаем метаданные библиотеки
      const library = await getLibraryMetadata()
      console.log('[AI DJ] Library loaded:', library.length, 'tracks')
      
      setProgress(20)
      setProgressMessage('🎵 Анализ треков...')

      // 2. LLM выбирает треки
      const result = await generateDJPlaylist({
        mood: customDescription,
        library,
        profile: {
          preferredGenres: profile.preferredGenres,
          preferredArtists: profile.preferredArtists,
          bannedArtists: profile.bannedArtists || [],
        },
        llmUrl: settings.llmLmStudioUrl,
        llmModel: settings.llmModel || 'qwen/qwen3-4b-2507',
        llmApiKey: settings.llmApiKey,
      })

      if (!result) {
        throw new Error('LLM не ответил')
      }

      setProgress(80)
      setProgressMessage('✨ Создание плейлиста...')

      const playlist: GeneratedPlaylist = {
        id: `ai-dj-${Date.now()}`,
        title: result.name,
        description: result.description,
        icon: '🎧',
        gradient: 'from-purple-500 via-pink-500 to-red-500',
        songs: result.songs,
        type: 'ai-dj',
        llmUsed: true,
      }
      
      addPlaylist({
        id: playlist.id,
        type: 'my-wave',
        name: playlist.title,
        description: playlist.description,
        songs: playlist.songs,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })
      
      setProgress(100)
      setGeneratedPlaylists(prev => [playlist, ...prev])
      setSongList(playlist.songs, 0)
      toast.success(`🎧 AI DJ готов! ${result.songs.length} треков. ${result.reasoning}`)
      setCustomDescription('')
      
      setTimeout(() => {
        setProgress(0)
        setProgressMessage('')
      }, 1000)
    } catch (error) {
      console.error('[AI DJ] Error:', error)
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
      setProgress(0)
      setProgressMessage('')
    } finally {
      setGenerating(null)
    }
  }

  const playlists = [
    {
      id: 'custom',
      icon: <MessageSquare className="w-8 h-8" />,
      title: 'AI по запросу',
      description: 'Опиши словами что хочешь',
      gradient: 'from-purple-500 via-pink-500 to-red-500',
      generate: () => setShowCustomModal(true),
    },
    {
      id: 'time',
      icon: <Clock className="w-8 h-8" />,
      title: 'Время Микс',
      description: 'Адаптивно по времени суток',
      gradient: 'from-indigo-500 via-purple-500 to-pink-500',
      generate: generateTimeMix,
    },
    {
      id: 'vibe',
      icon: <Heart className="w-8 h-8" />,
      title: 'AI Вайб Микс',
      description: 'AI анализ твоих вкусов',
      gradient: 'from-pink-500 via-red-500 to-yellow-500',
      generate: generateAIVibe,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Модальное окно для custom запроса */}
      {showCustomModal && (
        <Card className="p-4 bg-muted/50">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h3 className="font-bold">Опиши какой плейлист хочешь</h3>
            </div>
            <Textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Например: Энергичная музыка для тренировки в стиле Modestep и The Prodigy, BPM 140+"
              rows={4}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button
                onClick={generateAICustom}
                disabled={!customDescription.trim() || generating !== null}
                className="flex-1 gap-2"
              >
                {generating === 'custom' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Сгенерировать
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomModal(false)
                  setCustomDescription('')
                }}
              >
                Отмена
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Кнопки генерации */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {playlists.map((playlist) => (
          <Card
            key={playlist.id}
            className={`
              overflow-hidden border-0 shadow-lg
              transform transition-all duration-300
              hover:scale-105 hover:shadow-xl
              cursor-pointer
            `}
            onClick={playlist.generate}
          >
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${playlist.gradient} p-6 text-white`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    {playlist.icon}
                  </div>
                  {generating === playlist.id && (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  )}
                </div>
                
                <h3 className="text-xl font-bold mb-1">
                  {playlist.title}
                </h3>
                <p className="text-sm text-white/80">
                  {playlist.description}
                </p>
              </div>
              
              <div className="p-4 bg-background">
                {generating === playlist.id && progress > 0 ? (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-center text-muted-foreground">
                      {progressMessage}
                    </p>
                  </div>
                ) : (
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    disabled={generating !== null}
                  >
                    {generating === playlist.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Генерация...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Сгенерировать
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Сгенерированные плейлисты */}
      {generatedPlaylists.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold">✨ Сгенерированные плейлисты</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {generatedPlaylists.map((playlist) => (
              <Card
                key={playlist.id}
                className="overflow-hidden border shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  setSongList(playlist.songs, 0)
                  toast.success(`▶️ Запущено: ${playlist.title}`)
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${playlist.gradient} text-white`}>
                      <span className="text-2xl">{playlist.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold truncate">{playlist.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {playlist.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs mt-2">
                        <span className="text-muted-foreground">🎵 {playlist.songs.length} треков</span>
                        {playlist.llmUsed && (
                          <span className="text-purple-500">🤖 AI</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
