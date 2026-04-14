/**
 * AI Genre Playlist Cards - Карточки AI плейлистов по жанрам
 * 
 * Отображает сгенерированные плейлисты для каждого топ жанра пользователя
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Play, RotateCcw, Loader2, Music, TrendingUp, Clock } from 'lucide-react'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { toast } from 'react-toastify'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { saveAIGenrePlaylist, getAllGeneratedPlaylists, type GeneratedPlaylist } from '@/store/generated-playlists.store'
import { 
  analyzeLikedTracksAndCluster, 
  generateGenreClusterPlaylist,
  generateKPopTopPlaylist 
} from '@/service/ai-playlist-generator'
import { usePlaylistQueue } from '@/service/playlist-generation-queue'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { cn } from '@/lib/utils'

interface GenreCard {
  id: string
  genre: string
  trackCount: number
  weight: number
  gradient: string
  icon: string
  playlist?: GeneratedPlaylist
  isGenerating?: boolean
}

export function AIGenrePlaylistCards() {
  const navigate = useNavigate()
  const [genreCards, setGenreCards] = useState<GenreCard[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [generatingForGenre, setGeneratingForGenre] = useState<string | null>(null)
  const { profile, ratings } = useML()
  const { setSongList } = usePlayerActions()
  const { addPlaylist } = useMLPlaylistsStateActions()
  const { addToQueue, getStatus } = usePlaylistQueue()

  // Градиенты для разных жанров
  const genreGradients: Record<string, string> = {
    'K-Pop': 'from-pink-500 via-purple-500 to-indigo-500',
    'Rock': 'from-red-600 via-orange-600 to-amber-600',
    'Pop': 'from-pink-400 via-rose-400 to-red-400',
    'Hip-Hop': 'from-amber-600 via-yellow-600 to-orange-600',
    'Electronic': 'from-cyan-500 via-blue-500 to-indigo-500',
    'Jazz': 'from-purple-600 via-violet-600 to-purple-800',
    'Classical': 'from-slate-600 via-gray-600 to-zinc-700',
    'R&B': 'from-rose-500 via-pink-500 to-red-500',
    'Metal': 'from-gray-900 via-slate-800 to-gray-900',
    'Indie': 'from-teal-500 via-emerald-500 to-green-500',
  }

  const genreIcons: Record<string, string> = {
    'K-Pop': '🇰🇷',
    'Rock': '🎸',
    'Pop': '🎤',
    'Hip-Hop': '🎧',
    'Electronic': '🎹',
    'Jazz': '🎺',
    'Classical': '🎻',
    'R&B': '🎵',
    'Metal': '🤘',
    'Indie': '🌿',
  }

  // Загрузка существующих плейлистов при монтировании
  useEffect(() => {
    loadExistingPlaylists()
    
    // Проверяем статус очереди каждые 5 секунд
    const interval = setInterval(() => {
      const status = getStatus()
      if (status.queueLength > 0) {
        console.log('[GenreCards] Queue status:', status)
      }
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  const loadExistingPlaylists = async () => {
    const existing = getAllGeneratedPlaylists()
    const genrePlaylists = existing.filter(p => p.type === 'genre-cluster' || p.type === 'k-pop-top')
    
    if (genrePlaylists.length > 0) {
      const cards: GenreCard[] = genrePlaylists.map(playlist => ({
        id: playlist.id,
        genre: playlist.metadata.genre || playlist.name,
        trackCount: playlist.songs.length,
        weight: 1,
        gradient: playlist.gradient || 'from-purple-500 to-pink-500',
        icon: genreIcons[playlist.metadata.genre || ''] || '🎵',
        playlist,
      }))
      
      setGenreCards(cards.sort((a, b) => b.weight - a.weight))
    }
  }

  // Анализ лайкнутых треков и создание карточек жанров
  const analyzeAndCreateCards = async () => {
    setIsAnalyzing(true)
    
    try {
      const likedSongIds = profile.likedSongs || []
      
      if (likedSongIds.length === 0) {
        toast.info('Сначала лайкните несколько треков для анализа')
        setIsAnalyzing(false)
        return
      }

      // Кластеризация по жанрам
      const clusters = await analyzeLikedTracksAndCluster(likedSongIds, ratings)
      
      if (clusters.length === 0) {
        toast.info('Недостаточно данных для анализа жанров')
        setIsAnalyzing(false)
        return
      }

      // Создаём карточки для топ жанров
      const cards: GenreCard[] = clusters.slice(0, 5).map(cluster => ({
        id: `genre-${cluster.genre.toLowerCase().replace(/\s+/g, '-')}`,
        genre: cluster.genre,
        trackCount: cluster.trackCount,
        weight: cluster.weight,
        gradient: genreGradients[cluster.genre] || 'from-purple-500 to-pink-500',
        icon: genreIcons[cluster.genre] || '🎵',
      }))

      setGenreCards(cards)
      toast.success(`Найдено ${clusters.length} жанров!`)
      
    } catch (error) {
      console.error('Error analyzing tracks:', error)
      toast.error('Ошибка анализа треков')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Генерация плейлиста для жанра с использованием очереди
  const generateForGenre = async (genre: string) => {
    setGeneratingForGenre(genre)
    
    const taskId = `genre-${genre.toLowerCase().replace(/\s+/g, '-')}`
    
    try {
      // Добавляем в очередь
      const saved = await addToQueue<GeneratedPlaylist>(
        taskId,
        'genre-cluster',
        genre,
        async () => {
          const cluster = genreCards.find(c => c.genre === genre)
          if (!cluster) throw new Error('Cluster not found')

          // Специальная генерация для K-Pop
          if (genre === 'K-Pop') {
            const kpopPlaylist = await generateKPopTopPlaylist(30)
            
            const saved = saveAIGenrePlaylist({
              type: 'k-pop-top',
              name: kpopPlaylist.title,
              description: kpopPlaylist.description,
              songs: kpopPlaylist.songs,
              gradient: kpopPlaylist.gradient,
              genre: 'K-Pop',
              metadata: {
                genre: 'K-Pop',
                seed: kpopPlaylist.seed,
                lastTracks: kpopPlaylist.lastTracks,
              },
            })

            // Добавляем в ML store
            addPlaylist({
              id: saved.id,
              type: 'my-wave',
              name: saved.name,
              description: saved.description,
              songs: saved.songs,
              createdAt: new Date(saved.createdAt).toISOString(),
              lastUpdated: new Date(saved.createdAt).toISOString(),
            })

            setSongList(saved.songs, 0)
            return saved
          }

          // Обычная генерация для других жанров
          const playlist = await generateGenreClusterPlaylist(
            {
              genre,
              trackCount: cluster.trackCount,
              weight: cluster.weight,
              topArtists: [],
              recentTracks: cluster.playlist?.metadata.lastTracks || [],
            },
            30
          )

          const saved = saveAIGenrePlaylist({
            type: 'genre-cluster',
            name: playlist.title,
            description: playlist.description,
            songs: playlist.songs,
            gradient: playlist.gradient,
            genre,
            metadata: {
              genre,
              seed: playlist.seed,
              lastTracks: playlist.lastTracks,
            },
          })

          // Добавляем в ML store
          addPlaylist({
            id: saved.id,
            type: 'my-wave',
            name: saved.name,
            description: saved.description,
            songs: saved.songs,
            createdAt: new Date(saved.createdAt).toISOString(),
            lastUpdated: new Date(saved.createdAt).toISOString(),
          })

          setSongList(saved.songs, 0)
          return saved
        }
      )

      // Обновляем карточку после генерации
      setGenreCards(prev => prev.map(card => 
        card.genre === genre 
          ? { ...card, playlist: saved, isGenerating: false }
          : card
      ))

      toast.success(`${genreCards.find(c => c.genre === genre)?.icon} Плейлист готов!`)

    } catch (error: any) {
      if (error.message !== 'Task removed from queue') {
        console.error('Error generating playlist:', error)
        toast.error(`Ошибка генерации плейлиста для ${genre}`)
      }
    } finally {
      setGeneratingForGenre(null)
    }
  }

  // Воспроизведение существующего плейлиста
  const playPlaylist = (playlist: GeneratedPlaylist) => {
    setSongList(playlist.songs, 0)
    toast.success(`Воспроизводим: ${playlist.name}`)
  }

  return (
    <div className="space-y-4">
      {/* Заголовок с кнопкой анализа */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold">AI Плейлисты по жанрам</h2>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={analyzeAndCreateCards}
          disabled={isAnalyzing}
          className="gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Анализ...
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              Проанализировать
            </>
          )}
        </Button>
      </div>

      {/* Сетка карточек */}
      {genreCards.length === 0 ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Нажмите "Проанализировать" чтобы создать AI плейлисты по вашим жанрам</p>
            <p className="text-sm mt-2">K-Pop, Rock, Pop и другие жанры будут доступны</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {genreCards.map((card) => (
            <Card
              key={card.id}
              className={cn(
                'overflow-hidden border-0 transition-all duration-300 hover:scale-105',
                'bg-gradient-to-br',
                card.gradient
              )}
            >
              <CardContent className="p-0">
                {/* Основная часть карточки */}
                <div className="p-4 text-white">
                  {/* Жанр и иконка */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold">{card.icon} {card.genre}</h3>
                      <p className="text-sm opacity-80">{card.trackCount} треков в жанре</p>
                    </div>
                    <Sparkles className="w-5 h-5 opacity-70" />
                  </div>

                  {/* Если плейлист сгенерирован */}
                  {card.playlist ? (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-sm">{card.playlist.name}</h4>
                        <p className="text-xs opacity-70 line-clamp-2">
                          {card.playlist.description}
                        </p>
                      </div>

                      {/* Время жизни */}
                      <div className="flex items-center gap-2 text-xs opacity-60">
                        <Clock className="w-3 h-3" />
                        <span>
                          {Math.max(0, Math.floor((card.playlist.expiresAt - Date.now()) / (60 * 60 * 1000)))} ч.
                        </span>
                      </div>

                      {/* Кнопки */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-white/20 hover:bg-white/30 text-white"
                          onClick={() => playPlaylist(card.playlist)}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-transparent border-white/30 text-white hover:bg-white/10"
                          onClick={() => generateForGenre(card.genre)}
                          disabled={generatingForGenre === card.genre}
                        >
                          {generatingForGenre === card.genre ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Кнопка генерации */
                    <Button
                      size="lg"
                      className="w-full bg-white/20 hover:bg-white/30 text-white"
                      onClick={() => generateForGenre(card.genre)}
                      disabled={generatingForGenre === card.genre}
                    >
                      {generatingForGenre === card.genre ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Генерация...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 mr-2" />
                          Создать плейлист
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
