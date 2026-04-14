/**
 * Страница сгенерированного ML плейлиста
 * 
 * Отображает детали плейлиста созданного ML сервисом:
 * - Название и описание плейлиста
 * - Статистика (треки, артисты, жанры, длительность)
 * - Энергетическая кривая
 * - Список треков с возможностью воспроизведения
 * - Информация о алгоритме генерации
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Play, Shuffle, Clock, Music,
  User, Disc3, Activity, TrendingUp, Calendar,
  RefreshCw  // 🆕 Кнопка перегенерации
} from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Badge } from '@/app/components/ui/badge'
import { mlService } from '@/service/ml-service'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { analyzeTrack } from '@/service/vibe-similarity'

interface PlaylistParams {
  playlistType: string
  playlistId?: string
}

export default function GeneratedPlaylistPage() {
  const { playlistType, playlistId } = useParams<PlaylistParams>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { setSongList, play } = usePlayerActions()
  const queryClient = useQueryClient()  // 🆕 Для перегенерации

  // 🆕 Функция перегенерации
  const handleRegenerate = async () => {
    toast.info('🔄 Перегенерация плейлиста...', { autoClose: 2000 })
    await queryClient.invalidateQueries({ queryKey: ['generated-playlist', playlistType, playlistId] })
    toast.success('✅ Плейлист перегенерирован!', { autoClose: 2000 })
  }

  // Загружаем данные плейлиста
  const { data, isLoading } = useQuery({
    queryKey: ['generated-playlist', playlistType, playlistId],
    queryFn: async () => {
      if (!playlistType) throw new Error('No playlist type')
      
      // Генерируем плейлист заново или берём из кэша
      switch (playlistType) {
        case 'daily-mix':
          return await mlService.generateDailyMix()
        case 'discover-weekly':
          return await mlService.generateDiscoverWeekly()
        case 'my-wave':
          return await mlService.generateMyWavePlaylist()
        case 'activity':
          return await mlService.generateActivityMix('workout')
        case 'mood':
          return await mlService.generateMoodMix('energetic')
        case 'time-of-day':
          return await mlService.generateTimeOfDayMix()
        case 'genre':
          return await mlService.generateGenrePlaylist(playlistId || 'rock')
        case 'artist-radio':
          return await mlService.generateArtistRadio(playlistId || '')
        default:
          throw new Error(`Unknown playlist type: ${playlistType}`)
      }
    },
    enabled: !!playlistType,
  })

  // Вычисляем статистику плейлиста
  const stats = useMemo(() => {
    if (!data?.songs?.length) return null

    const songs = data.songs
    const totalDuration = songs.reduce((sum, song) => sum + (song.duration || 0), 0)
    
    const uniqueArtists = new Set(songs.map(s => s.artistId || s.artist)).size
    const uniqueGenres = new Set(songs.map(s => s.genre).filter(Boolean)).size
    const uniqueAlbums = new Set(songs.map(s => s.albumId || s.album)).size
    
    const avgEnergy = songs.reduce((sum, song) => {
      const vibe = analyzeTrack(song)
      return sum + vibe.energy
    }, 0) / songs.length
    
    const avgBpm = songs.reduce((sum, song) => sum + (song.bpm || 120), 0) / songs.length
    
    return {
      totalTracks: songs.length,
      totalDuration,
      durationFormatted: formatDuration(totalDuration),
      uniqueArtists,
      uniqueGenres,
      uniqueAlbums,
      avgEnergy: (avgEnergy * 100).toFixed(0),
      avgBpm: avgBpm.toFixed(0),
    }
  }, [data])

  // Энергетическая кривая
  const energyCurve = useMemo(() => {
    if (!data?.songs?.length) return []
    
    return data.songs.map((song, index) => {
      const vibe = analyzeTrack(song)
      return {
        index,
        energy: vibe.energy,
        title: song.title,
        artist: song.artist,
      }
    })
  }, [data])

  const handlePlayAll = () => {
    if (!data?.songs?.length) return
    
    setSongList(data.songs, 0)
    play()
    toast.success(`▶️ Запущено: ${getPlaylistTitle(playlistType || '')}`)
  }

  const handleShuffle = () => {
    if (!data?.songs?.length) return
    
    const shuffled = [...data.songs].sort(() => Math.random() - 0.5)
    setSongList(shuffled, 0)
    play()
    toast.success(`🔀 Запущено в случайном порядке: ${getPlaylistTitle(playlistType || '')}`)
  }

  const handlePlayTrack = (index: number) => {
    if (!data?.songs?.length) return
    
    setSongList(data.songs, index)
    play()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Activity className="h-12 w-12 animate-spin mb-4" />
        <p className="text-muted-foreground">Генерация плейлиста...</p>
      </div>
    )
  }

  if (!data || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground">Ошибка загрузки плейлиста</p>
        <Button onClick={() => navigate(-1)} className="mt-4">
          Назад
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок */}
      <div className="flex items-center gap-4 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {getPlaylistTitle(playlistType || '')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {getPlaylistDescription(playlistType || '')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRegenerate} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Перегенерировать
          </Button>
          <Button onClick={handleShuffle} variant="outline" size="sm">
            <Shuffle className="h-4 w-4 mr-2" />
            Перемешать
          </Button>
          <Button onClick={handlePlayAll} size="sm">
            <Play className="h-4 w-4 mr-2" />
            Играть всё
          </Button>
        </div>
      </div>

      {/* Основная часть */}
      <div className="flex flex-1 overflow-hidden">
        {/* Левая панель - Статистика */}
        <div className="w-80 border-r p-4 overflow-y-auto">
          <div className="space-y-4">
            {/* Карточка статистики */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Статистика
                </h3>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatItem 
                  icon={Music} 
                  label="Треков" 
                  value={stats.totalTracks.toString()} 
                />
                <StatItem 
                  icon={Clock} 
                  label="Длительность" 
                  value={stats.durationFormatted} 
                />
                <StatItem 
                  icon={User} 
                  label="Артистов" 
                  value={stats.uniqueArtists.toString()} 
                />
                <StatItem 
                  icon={Disc3} 
                  label="Альбомов" 
                  value={stats.uniqueAlbums.toString()} 
                />
                <StatItem 
                  icon={TrendingUp} 
                  label="Ср. энергия" 
                  value={`${stats.avgEnergy}%`} 
                />
                <StatItem 
                  icon={Activity} 
                  label="Ср. BPM" 
                  value={stats.avgBpm} 
                />
              </CardContent>
            </Card>

            {/* Энергетическая кривая */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Энергетическая кривая
                </h3>
              </CardHeader>
              <CardContent>
                <div className="h-32 flex items-end gap-1">
                  {energyCurve.map((point) => (
                    <div
                      key={point.index}
                      className="flex-1 bg-gradient-to-t from-primary/20 to-primary rounded-t"
                      style={{ 
                        height: `${point.energy * 100}%`,
                        transition: 'height 0.3s ease'
                      }}
                      title={`${point.artist} - ${point.title}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Начало</span>
                  <span>Конец</span>
                </div>
              </CardContent>
            </Card>

            {/* Информация о генерации */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Информация
                </h3>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>🤖 Сгенерировано ML алгоритмом</p>
                <p>📊 На основе ваших предпочтений</p>
                <p>🎵 Оркестрировано по вайбу</p>
                <p>🔀 Уникальный порядок треков</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Правая панель - Список треков */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {data.songs.map((song, index) => (
                <div
                  key={song.id}
                  className="group flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handlePlayTrack(index)}
                >
                  {/* Номер */}
                  <div className="w-8 text-center text-sm text-muted-foreground group-hover:hidden">
                    {index + 1}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="hidden group-hover:flex h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePlayTrack(index)
                    }}
                  >
                    <Play className="h-4 w-4" />
                  </Button>

                  {/* Обложка */}
                  {song.coverArtUrl ? (
                    <img
                      src={song.coverArtUrl}
                      alt={song.album}
                      className="w-12 h-12 rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                      <Music className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  {/* Информация */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {song.artist} {song.album && `• ${song.album}`}
                    </p>
                  </div>

                  {/* Жанр и BPM */}
                  <div className="flex gap-2">
                    {song.genre && (
                      <Badge variant="secondary" className="text-xs">
                        {song.genre}
                      </Badge>
                    )}
                    {song.bpm && (
                      <Badge variant="outline" className="text-xs">
                        {song.bpm} BPM
                      </Badge>
                    )}
                  </div>

                  {/* Длительность */}
                  <div className="text-sm text-muted-foreground">
                    {formatSongDuration(song.duration || 0)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

/**
 * Компонент статистики
 */
function StatItem({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: any
  label: string
  value: string 
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

/**
 * Форматирование длительности
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours}ч ${minutes}мин`
  }
  return `${minutes}мин`
}

function formatSongDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Заголовок плейлиста по типу
 */
function getPlaylistTitle(type: string): string {
  const titles: Record<string, string> = {
    'daily-mix': '🎵 Дейли Микс',
    'discover-weekly': '🔍 Открытия недели',
    'my-wave': '🌊 Моя Волна',
    'activity': '⚡ Активность Микс',
    'mood': '😊 Муд Микс',
    'time-of-day': '🕐 Время Микс',
    'genre': '🎼 Жанр Плейлист',
    'artist-radio': '📻 Радио Артиста',
  }
  return titles[type] || '🎶 Сгенерированный Плейлист'
}

/**
 * Описание плейлиста по типу
 */
function getPlaylistDescription(type: string): string {
  const descriptions: Record<string, string> = {
    'daily-mix': 'Персональный микс на каждый день',
    'discover-weekly': 'Новая музыка для вас',
    'my-wave': 'Бесконечный поток вашей музыки',
    'activity': 'Музыка для активности',
    'mood': 'Подборка по настроению',
    'time-of-day': 'Музыка текущего времени суток',
    'genre': 'Жанровая подборка',
    'artist-radio': 'Похожие артисты и треки',
  }
  return descriptions[type] || 'Сгенерировано автоматически'
}
