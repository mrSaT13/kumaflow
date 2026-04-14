/**
 * Shared Playlist Cards - Карточки общих плейлистов
 * 
 * Отображает плейлисты созданные пользователями
 * с возможностью оценки и воспроизведения
 */

import { useState, useEffect } from 'react'
import { Sparkles, Play, Star, Heart, Share2, Loader2, Music, Plus } from 'lucide-react'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { toast } from 'react-toastify'
import { usePlayerActions } from '@/store/player.store'
import {
  createSharedPlaylist,
  setPlaylistRating,
  getAverageRating,
  getUserRating,
  type SharedPlaylist
} from '@/service/shared-playlists'
import { useML } from '@/store/ml.store'
import { cn } from '@/lib/utils'
import { subsonic } from '@/service/subsonic'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Label } from '@/app/components/ui/label'

interface SharedPlaylistCardProps {
  playlist: SharedPlaylist
  onRate: (playlistId: string, rating: number) => void
}

function SharedPlaylistCard({ playlist, onRate }: SharedPlaylistCardProps) {
  const { setSongList } = usePlayerActions()
  const [userRating, setUserRating] = useState(playlist.userRating || 0)
  const [isRating, setIsRating] = useState(false)

  const handlePlay = () => {
    setSongList(playlist.songs, 0)
    toast.success(`▶️ ${playlist.name} от ${playlist.author}`)
  }

  const handleRate = async (rating: number) => {
    setIsRating(true)
    try {
      await setPlaylistRating(playlist.id, rating)
      setUserRating(rating)
      onRate(playlist.id, rating)
      toast.success(`⭐ Оценка ${rating} поставлена!`)
    } catch (error) {
      toast.error('Ошибка при оценке')
    } finally {
      setIsRating(false)
    }
  }

  // Форматирование среднего рейтинга
  const avgRating = playlist.rating > 0 ? playlist.rating.toFixed(1) : 'Нет оценок'

  return (
    <Card className={cn(
      "overflow-hidden border-0 transition-all duration-300 hover:scale-105",
      "bg-gradient-to-br",
      playlist.gradient
    )}>
      <CardContent className="p-0">
        <div className="p-4 text-white">
          {/* Заголовок */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1">{playlist.name}</h3>
              <p className="text-sm opacity-80 line-clamp-2">{playlist.comment}</p>
            </div>
            <Sparkles className="w-5 h-5 opacity-70 flex-shrink-0 ml-2" />
          </div>

          {/* Информация */}
          <div className="space-y-2 mb-4">
            {/* Автор */}
            <div className="flex items-center gap-2 text-sm opacity-70">
              <Heart className="w-4 h-4" />
              <span>от @{playlist.author}</span>
            </div>

            {/* Рейтинг */}
            <div className="flex items-center gap-2 text-sm">
              <Star className="w-4 h-4 text-yellow-300" />
              <span className="font-semibold">{avgRating}</span>
              {playlist.rating > 0 && (
                <span className="opacity-70">({playlist.playCount} оценок)</span>
              )}
            </div>

            {/* Треки */}
            <div className="flex items-center gap-2 text-sm opacity-70">
              <Music className="w-4 h-4" />
              <span>{playlist.songs.length} треков</span>
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-white/20 hover:bg-white/30 text-white"
              onClick={handlePlay}
            >
              <Play className="w-4 h-4 mr-1" />
              Play
            </Button>

            {/* Звёзды рейтинга */}
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRate(star)}
                  disabled={isRating}
                  className={cn(
                    "p-1 rounded transition-colors",
                    userRating >= star 
                      ? "text-yellow-300 bg-white/20" 
                      : "text-white/50 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Star className="w-4 h-4 fill-current" />
                </button>
              ))}
            </div>
          </div>

          {/* Кнопка поделиться */}
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-2 bg-transparent border-white/30 text-white hover:bg-white/10"
            onClick={() => {
              navigator.clipboard.writeText(`Плейлист: ${playlist.name}\n${playlist.comment}`)
              toast.success('📋 Информация скопирована')
            }}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Поделиться
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface CreatePlaylistModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (playlist: SharedPlaylist) => void
}

function CreatePlaylistModal({ open, onOpenChange, onCreate }: CreatePlaylistModalProps) {
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const { profile } = useML()
  const [availableSongs, setAvailableSongs] = useState<any[]>([])

  const gradients = [
    'from-purple-600 via-pink-600 to-red-600',
    'from-blue-600 via-cyan-600 to-teal-600',
    'from-green-600 via-emerald-600 to-teal-600',
    'from-orange-600 via-amber-600 to-yellow-600',
    'from-indigo-600 via-purple-600 to-pink-600',
    'from-pink-500 via-rose-500 to-red-500',
  ]
  const [selectedGradient, setSelectedGradient] = useState(gradients[0])

  // Загружаем треки при открытии модального окна
  useEffect(() => {
    if (open) {
      loadSongs()
    }
  }, [open])

  const loadSongs = async () => {
    try {
      // Берём лайкнутые треки
      const likedSongIds = profile.likedSongs || []
      
      // Загружаем информацию о треках
      const songs: any[] = []
      for (const songId of likedSongIds.slice(0, 30)) {
        try {
          const song = await subsonic.songs.getSong(songId)
          if (song) songs.push(song)
        } catch (error) {
          console.warn('Failed to load song:', songId, error)
        }
      }
      
      setAvailableSongs(songs)
    } catch (error) {
      console.error('Error loading songs:', error)
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Введите название плейлиста')
      return
    }

    if (!comment.trim()) {
      toast.error('Введите описание')
      return
    }

    if (availableSongs.length === 0) {
      toast.error('Нет доступных треков. Лайкните несколько треков сначала.')
      return
    }

    setIsCreating(true)

    try {
      // Берём все доступные треки или первые 30
      const songs = availableSongs.slice(0, 30)
      
      const playlist = await createSharedPlaylist(
        name,
        songs,
        comment,
        selectedGradient,
        true
      )

      onCreate(playlist)
      toast.success('✅ Плейлист создан!')
      onOpenChange(false)
      setName('')
      setComment('')
    } catch (error) {
      toast.error('Ошибка создания плейлиста')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>✨ Создать общий плейлист</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Название */}
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ночной вайб"
            />
          </div>

          {/* Описание */}
          <div className="space-y-2">
            <Label htmlFor="comment">Описание</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Идеально для позднего вечера..."
              rows={3}
            />
          </div>

          {/* Градиент */}
          <div className="space-y-2">
            <Label>Градиент фона</Label>
            <div className="grid grid-cols-3 gap-2">
              {gradients.map((gradient) => (
                <button
                  key={gradient}
                  onClick={() => setSelectedGradient(gradient)}
                  className={cn(
                    "h-12 rounded-lg bg-gradient-to-br transition-all",
                    gradient,
                    selectedGradient === gradient 
                      ? "ring-2 ring-white scale-105" 
                      : "opacity-70 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Создать
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SharedPlaylistCards() {
  const [sharedPlaylists, setSharedPlaylists] = useState<SharedPlaylist[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Заглушка для демонстрации
  const demoPlaylists: SharedPlaylist[] = [
    {
      id: 'demo-1',
      name: '🌙 Ночной Вайб',
      comment: 'Идеально для позднего вечера, когда город засыпает',
      author: 'kumaflow_official',
      authorId: '1',
      songs: [],  // TODO: Добавить реальные треки
      gradient: 'from-indigo-600 via-purple-600 to-pink-600',
      rating: 4.8,
      playCount: 127,
      createdAt: new Date().toISOString(),
      isPublic: true,
    },
    {
      id: 'demo-2',
      name: '☕ Утренний Кофе',
      comment: 'Лёгкие треки для спокойного начала дня',
      author: 'music_lover',
      authorId: '2',
      songs: [],
      gradient: 'from-orange-400 via-amber-400 to-yellow-400',
      rating: 4.5,
      playCount: 89,
      createdAt: new Date().toISOString(),
      isPublic: true,
    },
    {
      id: 'demo-3',
      name: '🏃 Энергия Спорта',
      comment: 'Максимальный драйв для тренировки',
      author: 'fitness_pro',
      authorId: '3',
      songs: [],
      gradient: 'from-red-600 via-orange-600 to-amber-600',
      rating: 4.9,
      playCount: 234,
      createdAt: new Date().toISOString(),
      isPublic: true,
    },
  ]

  const handleRate = (playlistId: string, rating: number) => {
    setSharedPlaylists(prev => 
      prev.map(p => 
        p.id === playlistId 
          ? { ...p, rating: ((p.rating * p.playCount) + rating) / (p.playCount + 1), playCount: p.playCount + 1 }
          : p
      )
    )
  }

  const handleCreate = (playlist: SharedPlaylist) => {
    setSharedPlaylists(prev => [playlist, ...prev])
  }

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold">🌟 Общие Плейлисты</h2>
        </div>

        <Button
          size="sm"
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Создать
        </Button>
      </div>

      {/* Сетка плейлистов */}
      {sharedPlaylists.length === 0 ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-6 text-center">
            <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground mb-4">
              Здесь будут плейлисты от других пользователей
            </p>
            <p className="text-sm text-muted-foreground">
              Покажем демо-плейлисты для примера:
            </p>

            {/* Демо плейлисты */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {demoPlaylists.map((playlist) => (
                <SharedPlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  onRate={handleRate}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sharedPlaylists.map((playlist) => (
            <SharedPlaylistCard
              key={playlist.id}
              playlist={playlist}
              onRate={handleRate}
            />
          ))}
        </div>
      )}

      {/* Модальное окно создания */}
      <CreatePlaylistModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreate={handleCreate}
      />
    </div>
  )
}
