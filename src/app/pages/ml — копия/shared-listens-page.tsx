/**
 * Shared Listens Page - Страница "Слушают другие"
 * 
 * Плейлисты на основе того, что слушают другие пользователи
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Play, Shuffle, Share2, Star, Heart, Music } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { subsonic } from '@/service/subsonic'
import { getRandomSongs, getTopSongs } from '@/service/subsonic-api'
import type { ISong } from '@/types/responses/song'

export default function SharedListensPage() {
  const navigate = useNavigate()
  const { playlistId } = useParams<{ playlistId: string }>()
  const { setSongList } = usePlayerActions()
  const [playlist, setPlaylist] = useState<{
    id: string
    name: string
    description: string
    author: string
    songs: ISong[]
    coverArt?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlaylist()
  }, [playlistId])

  const loadPlaylist = async () => {
    setLoading(true)
    try {
      // Генерируем плейлист на основе "слушают другие"
      // Временная реализация - случайные треки + топы
      const randomSongs = await getRandomSongs(25)
      const topSongs = await getTopSongs('Various Artists', 10)
      
      const allSongs = [...randomSongs, ...topSongs].slice(0, 30)
      
      setPlaylist({
        id: playlistId || 'shared-listens-1',
        name: '🌐 Слушают другие',
        description: 'Плейлист на основе того, что слушают другие пользователи',
        author: 'KumaFlow Community',
        songs: allSongs,
      })
      
      toast('Плейлист сгенерирован!', { type: 'success' })
    } catch (error) {
      console.error('Error loading playlist:', error)
      toast('Ошибка загрузки плейлиста', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = () => {
    if (playlist) {
      setSongList(playlist.songs, 0)
      toast('▶️ Воспроизведение...', { type: 'success' })
    }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(`Плейлист: ${playlist?.name}\n${playlist?.description}`)
    toast('📋 Информация скопирована', { type: 'success' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Music className="w-16 h-16 mx-auto mb-4 animate-spin text-primary" />
          <h2 className="text-xl font-bold">Загрузка плейлиста...</h2>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Плейлист не найден</h2>
          <Button onClick={() => navigate('/ml/for-you')}>Вернуться назад</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-8 py-6">
      {/* Баннер */}
      <div className="relative h-64 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg mb-6 overflow-hidden">
        <div className="absolute inset-0 flex items-end p-8">
          <div className="text-white">
            <h1 className="text-4xl font-bold mb-2">{playlist.name}</h1>
            <p className="text-lg opacity-90 mb-4">{playlist.description}</p>
            <div className="flex items-center gap-4">
              <Button
                size="lg"
                className="bg-white text-blue-600 hover:bg-white/90"
                onClick={handlePlay}
              >
                <Play className="w-5 h-5 mr-2" />
                Play
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10"
                onClick={handleShare}
              >
                <Share2 className="w-5 h-5 mr-2" />
                Поделиться
              </Button>
              <div className="flex items-center gap-2 text-sm opacity-80">
                <Heart className="w-4 h-4" />
                <span>от @{playlist.author}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">{playlist.songs.length}</div>
          <div className="text-sm text-muted-foreground">Треков</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {new Set(playlist.songs.map(s => s.artist)).size}
          </div>
          <div className="text-sm text-muted-foreground">Артистов</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {Math.floor(playlist.songs.reduce((sum, s) => sum + (s.duration || 0), 0) / 60)} мин
          </div>
          <div className="text-sm text-muted-foreground">Длительность</div>
        </div>
      </div>

      {/* Список треков */}
      <div className="space-y-2">
        {playlist.songs.map((song, index) => (
          <div
            key={song.id}
            className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            onClick={() => setSongList(playlist.songs, index)}
          >
            <div className="w-8 text-center text-muted-foreground">
              {index + 1}
            </div>
            {song.coverArt && (
              <img
                src={song.coverArt}
                alt={song.title}
                className="w-12 h-12 rounded object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{song.title}</div>
              <div className="text-sm text-muted-foreground truncate">{song.artist}</div>
            </div>
            <div className="text-sm text-muted-foreground">
              {Math.floor((song.duration || 0) / 60)}:{((song.duration || 0) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
