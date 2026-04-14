/**
 * Страница сохранённого плейлиста
 *
 * Красивый дизайн с коллажем обложек, drag-and-drop, лайками и экспортом
 */

import {
  ArrowLeft,
  Clock,
  Music,
  Play,
  Share2,
  Shuffle,
  Trash2,
  Sparkles,
  Calendar,
  Users,
  Heart,
  GripVertical,
  Download,
  X,
} from 'lucide-react'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent } from '@/app/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Badge } from '@/app/components/ui/badge'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/app/components/ui/tooltip'
import { getGeneratedPlaylistById, deleteGeneratedPlaylist, saveGeneratedPlaylist } from '@/store/generated-playlists.store'
import { usePlayerActions } from '@/store/player.store'
import { useDndContext, DndContext, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ISong } from '@/types/responses/song'
import { subsonic } from '@/service/subsonic'
import { clsx } from 'clsx'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { useStarredSongs } from '@/app/hooks/use-starred-songs'

/**
 * Форматирование длительности плейлиста
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}ч ${minutes}мин`
  }
  return `${minutes}мин`
}

/**
 * Форматирование длительности трека
 */
function formatSongDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Получить название микса по времени суток
 */
function getTimeOfDayMixName(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return '☀️ Утренний микс'
  if (hour >= 12 && hour < 18) return '🌞 Дневной микс'
  if (hour >= 18 && hour < 23) return '🌆 Вечерний микс'
  return '🌙 Ночной микс'
}

/**
 * Получить описание по времени суток
 */
function getTimeOfDayMixDescription(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Энергичные треки для начала дня'
  if (hour >= 12 && hour < 18) return 'Продуктивные ритмы для работы'
  if (hour >= 18 && hour < 23) return 'Расслабляющие мелодии для отдыха'
  return 'Спокойные звуки для ночного отдыха'
}

interface PlaylistParams {
  playlistType: string
  playlistId: string
}

interface SortableTrackProps {
  song: ISong
  index: number
  playlist: any
  onPlay: (index: number) => void
  onRemove: (index: number) => void
  onToggleLike: (song: ISong) => void
  isLiked: (songId: string) => boolean
}

function SortableTrack({ song, index, playlist, onPlay, onRemove, onToggleLike, isLiked }: SortableTrackProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Получаем URL обложки
  const coverUrl = song.coverArt 
    ? getSimpleCoverArtUrl(song.coverArt, 'album', '100')
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors',
        isDragging && 'bg-muted shadow-lg'
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Номер */}
      <div className="w-8 text-center text-sm text-muted-foreground">
        {index + 1}
      </div>

      {/* Обложка */}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={song.album}
          className="w-12 h-12 rounded object-cover"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
          <Music className="w-6 h-6 text-muted-foreground" />
        </div>
      )}

      {/* Информация */}
      <div className="flex-1 min-w-0" onClick={() => onPlay(index)}>
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

      {/* Лайк */}
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onToggleLike(song)
        }}
        className={clsx(
          'h-8 w-8',
          isLiked(song.id)
            ? 'text-red-500 hover:text-red-600'
            : 'text-muted-foreground hover:text-red-500'
        )}
      >
        <Heart className={clsx('w-4 h-4', isLiked(song.id) && 'fill-current')} />
      </Button>

      {/* Длительность */}
      <div className="text-sm text-muted-foreground w-12 text-right">
        {formatSongDuration(song.duration || 0)}
      </div>

      {/* Удалить */}
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(index)
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-red-500"
      >
        <X className="w-4 h-4" />
      </Button>

      {/* Play кнопка */}
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onPlay(index)
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
      >
        <Play className="w-4 h-4" />
      </Button>
    </div>
  )
}

export default function SavedPlaylistPage() {
  const navigate = useNavigate()
  const { playlistType, playlistId } = useParams<PlaylistParams>()
  const { setSongList, clearPlayerState } = usePlayerActions()
  
  // Получаем лайкнутые треки
  const { data: starredData, isLoading: starredLoading } = useStarredSongs()
  const starredSongIds = new Set(starredData?.songs?.map(s => s.id) || [])
  
  // Отладка
  useEffect(() => {
    console.log('[SavedPlaylist] Starred data:', starredData)
    console.log('[SavedPlaylist] Starred IDs:', starredSongIds)
    console.log('[SavedPlaylist] Loading:', starredLoading)
  }, [starredData, starredLoading])

  const [playlist, setPlaylist] = useState<{
    id: string
    type: string
    name: string
    description: string
    songs: ISong[]
    createdAt: number
    expiresAt: number
    metadata?: {
      accountsCount?: number
      genres?: string[]
    }
  } | null>(null)

  const [coverImages, setCoverImages] = useState<string[]>([])
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportName, setExportName] = useState('')

  // Загружаем плейлист из localStorage
  useEffect(() => {
    if (playlistId) {
      const saved = getGeneratedPlaylistById(playlistId)
      if (saved) {
        // Обновляем название для time-of-day миксов
        let name = saved.name
        let description = saved.description
        
        if (saved.type === 'time-of-day') {
          name = getTimeOfDayMixName()
          description = getTimeOfDayMixDescription()
          // Обновляем в localStorage
          const updated = { ...saved, name, description }
          setPlaylist(updated)
          saveGeneratedPlaylist({
            type: updated.type,
            name: updated.name,
            description: updated.description,
            songs: updated.songs,
            metadata: updated.metadata,
          })
        } else {
          setPlaylist(saved)
        }
        setExportName(saved.name)
      } else {
        toast.error('Плейлист не найден или устарел')
        navigate('/ml/for-you')
      }
    }
  }, [playlistId])

  // Загружаем обложки для коллажа - СЛУЧАЙНЫЙ ВЫБОР при каждом открытии!
  useEffect(() => {
    if (playlist?.songs && playlist.songs.length > 0) {
      // Перемешиваем треки и берём первые 9
      const shuffled = [...playlist.songs].sort(() => Math.random() - 0.5)
      const images = shuffled
        .filter(s => s.coverArt)
        .slice(0, 9)
        .map(s => getSimpleCoverArtUrl(s.coverArt, 'album', '300'))
      setCoverImages(images)
    }
  }, [playlist?.songs, playlistId]) // Перезагружаем при изменении playlistId

  // Подсчёт статистики
  const stats = useMemo(() => {
    if (!playlist) return null

    const totalDuration = playlist.songs.reduce((sum, s) => sum + (s.duration || 0), 0)
    const uniqueArtists = new Set(playlist.songs.map(s => s.artist)).size
    const uniqueGenres = new Set(playlist.songs.map(s => s.genre).filter(Boolean)).size

    return {
      tracks: playlist.songs.length,
      duration: formatDuration(totalDuration),
      artists: uniqueArtists,
      genres: uniqueGenres,
      createdAt: new Date(playlist.createdAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      expiresAt: new Date(playlist.expiresAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      }),
    }
  }, [playlist])

  // Проверка лайкнутых треков - используем данные из хука
  const isLiked = useCallback((songId: string) => {
    return starredSongIds.has(songId)
  }, [starredSongIds])

  // Переключение лайка - реальная интеграция с Subsonic
  const toggleLike = useCallback(async (song: ISong) => {
    try {
      const currentlyLiked = isLiked(song.id)
      
      if (currentlyLiked) {
        // Убираем лайк
        await subsonic.star.unstarItem(song.id)
        toast.info(`💔 Убрано из лайкнутых: ${song.title}`)
      } else {
        // Добавляем лайк
        await subsonic.star.starItem(song.id)
        toast.success(`❤️ Добавлено в лайкнутые: ${song.title}`)
      }
      
      // Перезагружаем данные о лайкнутых треках
      // Это обновит starredSongIds и перерисует сердечки
      window.dispatchEvent(new CustomEvent('refresh-starred'))
      
    } catch (error) {
      console.error('Toggle like error:', error)
      toast.error('Ошибка при переключении лайка')
    }
  }, [isLiked])

  // Воспроизвести весь плейлист
  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) return

    clearPlayerState()
    setSongList(playlist.songs, 0)
    toast.success(`▶️ Воспроизведение ${playlist.songs.length} треков`)
  }

  // Перемешать
  const handleShuffle = () => {
    if (!playlist || playlist.songs.length === 0) return

    const shuffled = [...playlist.songs].sort(() => Math.random() - 0.5)
    clearPlayerState()
    setSongList(shuffled, 0)
    toast.success('🔀 Плейлист перемешан')
  }

  // Поделиться плейлистом
  const handleShare = () => {
    if (!playlist) return

    const shareUrl = `${window.location.origin}/#/library/playlists/saved/${playlist.type}/${playlist.id}`
    setShareLink(shareUrl)
    setIsShareOpen(true)
  }

  // Копировать ссылку
  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink)
    toast.success('Ссылка скопирована в буфер обмена')
  }

  // Удалить плейлист
  const handleDelete = () => {
    if (!playlist) return

    if (confirm('Удалить этот плейлист?')) {
      deleteGeneratedPlaylist(playlist.id)
      toast.success('Плейлист удалён')
      navigate('/ml/for-you')
    }
  }

  // Удалить трек из плейлиста
  const handleRemoveTrack = useCallback((index: number) => {
    if (!playlist) return

    const updatedSongs = playlist.songs.filter((_, i) => i !== index)
    if (updatedSongs.length === 0) {
      toast.warning('Плейлист не может быть пустым')
      return
    }

    const updatedPlaylist = { ...playlist, songs: updatedSongs }
    setPlaylist(updatedPlaylist)
    
    // Обновляем в localStorage
    saveGeneratedPlaylist({
      type: updatedPlaylist.type,
      name: updatedPlaylist.name,
      description: updatedPlaylist.description,
      songs: updatedPlaylist.songs,
      metadata: updatedPlaylist.metadata,
    })

    toast.success('Трек удалён из плейлиста')
  }, [playlist])

  // Drag-and-drop окончание
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!playlist) return

    const { active, over } = event
    if (!over) return

    if (active.id !== over.id) {
      const oldIndex = playlist.songs.findIndex(s => s.id === active.id)
      const newIndex = playlist.songs.findIndex(s => s.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const updatedSongs = [...playlist.songs]
        const [removed] = updatedSongs.splice(oldIndex, 1)
        updatedSongs.splice(newIndex, 0, removed)

        const updatedPlaylist = { ...playlist, songs: updatedSongs }
        setPlaylist(updatedPlaylist)

        // Обновляем в localStorage
        saveGeneratedPlaylist({
          type: updatedPlaylist.type,
          name: updatedPlaylist.name,
          description: updatedPlaylist.description,
          songs: updatedPlaylist.songs,
          metadata: updatedPlaylist.metadata,
        })

        toast.success('Порядок треков изменён')
      }
    }
  }, [playlist])

  // Воспроизвести трек
  const handlePlayTrack = useCallback((index: number) => {
    if (!playlist) return

    clearPlayerState()
    setSongList(playlist.songs, index)
  }, [playlist])

  // Экспорт плейлиста на сервер Navidrome
  const handleExport = async () => {
    if (!playlist) return

    setIsExporting(true)
    try {
      // Создаём плейлист на сервере через Subsonic API
      const playlistName = exportName || playlist.name
      
      // Subsonic API: createPlaylist
      await subsonic.playlists.create(playlistName, playlist.songs.map(s => s.id))

      toast.success(`✅ Плейлист "${playlistName}" создан на сервере!`)
      setExportDialogOpen(false)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Ошибка экспорта на сервер')
    } finally {
      setIsExporting(false)
    }
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Music className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Загрузка плейлиста...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-purple-900/50 via-background to-background">
      {/* Заголовок с коллажем */}
      <div className="relative h-64 md:h-80 overflow-hidden">
        {/* Коллаж обложек */}
        <div className="absolute inset-0 grid grid-cols-3 gap-1 p-1">
          {coverImages.map((src, index) => (
            <div key={index} className="relative overflow-hidden rounded-sm">
              <img
                src={src}
                alt={`Cover ${index}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20" />
            </div>
          ))}
          {coverImages.length === 0 && (
            <div className="col-span-3 flex items-center justify-center bg-muted/50">
              <Music className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Градиент поверх коллажа */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        {/* Кнопка назад */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 bg-black/20 hover:bg-black/40 text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Информация о плейлисте */}
      <div className="container mx-auto px-4 -mt-20 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8">
          {/* Большая обложка */}
          <div className="w-48 h-48 md:w-52 md:h-52 rounded-lg shadow-2xl overflow-hidden flex-shrink-0 mx-auto md:mx-0">
            {coverImages.length > 0 ? (
              <img
                src={coverImages[0]}
                alt={playlist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Music className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Название и кнопки */}
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              {playlist.name}
            </h1>
            <p className="text-muted-foreground mb-4">
              {playlist.description}
            </p>

            {/* Статистика */}
            {stats && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  <span>{stats.tracks} треков</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{stats.duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{stats.artists} артистов</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>{stats.genres} жанров</span>
                </div>
              </div>
            )}

            {/* Кнопки управления */}
            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handlePlayAll} size="sm">
                    <Play className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Воспроизвести всё</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleShuffle} variant="outline" size="sm">
                    <Shuffle className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Перемешать</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleShare} variant="outline" size="sm">
                    <Share2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Поделиться</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setExportDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <Sparkles className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isExporting ? 'Экспорт...' : 'Экспорт на сервер'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Удалить плейлист</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Список треков с drag-and-drop */}
        <Card>
          <CardContent className="p-4">
            <DndContext onDragEnd={handleDragEnd}>
              <SortableContext
                items={playlist.songs.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {playlist.songs.map((song, index) => (
                    <SortableTrack
                      key={song.id}
                      song={song}
                      index={index}
                      playlist={playlist}
                      onPlay={handlePlayTrack}
                      onRemove={handleRemoveTrack}
                      onToggleLike={toggleLike}
                      isLiked={isLiked}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {playlist.songs.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Плейлист пуст</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Диалог экспорта */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Экспорт плейлиста на сервер</DialogTitle>
            <DialogDescription>
              Создайте плейлист на вашем Navidrome сервере
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Название плейлиста</label>
              <Input
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                placeholder={playlist.name}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Будет создано {playlist.songs.length} треков</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setExportDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button onClick={handleExport} disabled={isExporting}>
                {isExporting ? 'Экспорт...' : 'Экспортировать'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог поделиться */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Поделиться плейлистом</DialogTitle>
            <DialogDescription>
              Скопируйте ссылку и отправьте друзьям
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={shareLink} readOnly />
            <Button onClick={copyShareLink}>Копировать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
